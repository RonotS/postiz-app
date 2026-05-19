import Stripe from 'stripe';
import { HttpException, Injectable } from '@nestjs/common';
import { Organization, User } from '@prisma/client';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { BillingSubscribeDto } from '@gitroom/nestjs-libraries/dtos/billing/billing.subscribe.dto';
import { CreateStripePromotionDto } from '@gitroom/nestjs-libraries/dtos/billing/create-stripe-promotion.dto';
import { groupBy } from 'lodash';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { BillingPlanPricingService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/billing-plan-pricing.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_nothing');

function unitAmountCentsUsd(
  period: 'MONTHLY' | 'YEARLY',
  monthUsd: number,
  yearUsd: number
): number {
  return Math.round((period === 'MONTHLY' ? monthUsd : yearUsd) * 100);
}

/**
 * Admin one-off Checkout amount (cents, USD). Env STRIPE_ADMIN_TEST_CHECKOUT_AMOUNT_CENTS
 * or optional `requested` from POST body. Clamped 1–999_999. Default 50.
 * Stripe Checkout rejects USD totals under 50¢ — `adminStripeTestCheckoutSession` enforces ≥50 before calling Stripe.
 */
function resolveAdminTestCheckoutAmountCents(requested?: number): number {
  const fromEnv = Number(process.env.STRIPE_ADMIN_TEST_CHECKOUT_AMOUNT_CENTS);
  const envDefault =
    Number.isFinite(fromEnv) && fromEnv >= 1
      ? Math.min(999_999, Math.floor(fromEnv))
      : 50;
  if (requested === undefined || requested === null) {
    return envDefault;
  }
  const n = Math.floor(Number(requested));
  if (!Number.isFinite(n) || n < 1) {
    return envDefault;
  }
  return Math.min(999_999, n);
}

@Injectable()
export class StripeService {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _organizationService: OrganizationService,
    private _userService: UsersService,
    private _trackService: TrackService,
    private _planPricing: BillingPlanPricingService
  ) {}

  private priceDataFor(billing: string) {
    return this._planPricing.getTier(billing);
  }
  private assertStripeUsdSubscriptionMinimum(unitAmountCents: number) {
    if (unitAmountCents <= 0) return;
    if (unitAmountCents < 50) {
      throw new HttpException(
        'Stripe USD subscription line items must be at least $0.50 (50¢). ' +
          'Set NEXT_PUBLIC_STRIPE_PLAN_PRICE_OVERRIDE_USD / STRIPE_PLAN_PRICE_OVERRIDE_USD to 0.5 or higher, or use Stripe test mode.',
        400
      );
    }
  }

  /** Stripe `metadata` only allows string | number | null (not booleans). */
  private subscriptionMetadataFromBody(
    body: BillingSubscribeDto,
    extra: Record<string, string>
  ): Stripe.MetadataParam {
    return {
      service: 'gitroom',
      period: body.period,
      billing: body.billing,
      utm: body.utm,
      dub: body.dub,
      datafast_session_id: body.datafast_session_id,
      datafast_visitor_id: body.datafast_visitor_id,
      ...(body.skipTrial != null
        ? { skipTrial: body.skipTrial ? 'true' : 'false' }
        : {}),
      ...extra,
    };
  }
  validateRequest(rawBody: Buffer, signature: string, endpointSecret: string) {
    return stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  }

  async checkValidCard(
    event:
      | Stripe.CustomerSubscriptionCreatedEvent
      | Stripe.CustomerSubscriptionUpdatedEvent
  ) {
    if (event.data.object.status === 'incomplete') {
      return false;
    }

    const getOrgFromCustomer =
      await this._organizationService.getOrgByCustomerId(
        event.data.object.customer as string
      );

    if (!getOrgFromCustomer?.allowTrial) {
      return true;
    }

    console.log('Checking card');

    const paymentMethods = await stripe.paymentMethods.list({
      customer: event.data.object.customer as string,
    });

    // find the last one created
    const latestMethod = paymentMethods.data.reduce(
      (prev, current) => {
        if (prev.created < current.created) {
          return current;
        }
        return prev;
      },
      { created: -100 } as Stripe.PaymentMethod
    );

    if (!latestMethod.id) {
      return false;
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 100,
        currency: 'usd',
        payment_method: latestMethod.id,
        customer: event.data.object.customer as string,
        automatic_payment_methods: {
          allow_redirects: 'never',
          enabled: true,
        },
        capture_method: 'manual', // Authorize without capturing
        confirm: true, // Confirm the PaymentIntent
      });

      if (paymentIntent.status !== 'requires_capture') {
        console.error('Cant charge');
        await stripe.paymentMethods.detach(paymentMethods.data[0].id);
        await stripe.subscriptions.cancel(event.data.object.id as string);
        return false;
      }

      await stripe.paymentIntents.cancel(paymentIntent.id as string);
      return true;
    } catch (err) {
      try {
        await stripe.paymentMethods.detach(paymentMethods.data[0].id);
        await stripe.subscriptions.cancel(event.data.object.id as string);
      } catch (err) {
        /*dont do anything*/
      }
      return false;
    }
  }

  async createSubscription(event: Stripe.CustomerSubscriptionCreatedEvent) {
    const {
      uniqueId,
      billing,
      period,
    } = event.data.object.metadata as {
      billing: 'STANDARD' | 'PRO';
      period: 'MONTHLY' | 'YEARLY';
      uniqueId: string;
    };

    try {
      const check = await this.checkValidCard(event);
      if (!check) {
        return { ok: false };
      }
    } catch (err) {
      return { ok: false };
    }

    return this._subscriptionService.createOrUpdateSubscription(
      event.data.object.status !== 'active',
      uniqueId,
      event.data.object.customer as string,
      pricing[billing].channel!,
      billing,
      period,
      event.data.object.cancel_at
    );
  }
  async updateSubscription(event: Stripe.CustomerSubscriptionUpdatedEvent) {
    const {
      uniqueId,
      billing,
      period,
    } = event.data.object.metadata as {
      billing: 'STANDARD' | 'PRO';
      period: 'MONTHLY' | 'YEARLY';
      uniqueId: string;
    };

    const check = await this.checkValidCard(event);
    if (!check) {
      return { ok: false };
    }

    return this._subscriptionService.createOrUpdateSubscription(
      event.data.object.status !== 'active',
      uniqueId,
      event.data.object.customer as string,
      pricing[billing].channel!,
      billing,
      period,
      event.data.object.cancel_at
    );
  }

  async deleteSubscription(event: Stripe.CustomerSubscriptionDeletedEvent) {
    await this._subscriptionService.deleteSubscription(
      event.data.object.customer as string
    );
  }

  async createOrGetCustomer(organization: Organization) {
    if (organization.paymentId) {
      return organization.paymentId;
    }

    const users = await this._organizationService.getTeam(organization.id);
    const customer = await stripe.customers.create({
      email: users.users[0].user.email.indexOf('@') > -1 ? users.users[0].user.email : `${users.users[0].user.email}@postiz.com`,
      name: organization.name,
    });
    await this._subscriptionService.updateCustomerId(
      organization.id,
      customer.id
    );
    return customer.id;
  }

  async getPackages() {
    const products = await stripe.prices.list({
      active: true,
      expand: ['data.tiers', 'data.product'],
      lookup_keys: [
        'standard_monthly',
        'standard_yearly',
        'pro_monthly',
        'pro_yearly',
      ],
    });

    const productsList = groupBy(
      products.data.map((p) => ({
        name: (p.product as Stripe.Product)?.name,
        recurring: p?.recurring?.interval!,
        price: p?.tiers?.[0]?.unit_amount! / 100,
      })),
      'recurring'
    );

    return { ...productsList };
  }

  async prorate(organizationId: string, body: BillingSubscribeDto) {
    const org = await this._organizationService.getOrgById(organizationId);
    const customer = await this.createOrGetCustomer(org!);
    const priceData = this.priceDataFor(body.billing);
    const allProducts = await stripe.products.list({
      active: true,
      expand: ['data.prices'],
    });

    const findProduct =
      allProducts.data.find(
        (product) => product.name.toUpperCase() === body.billing.toUpperCase()
      ) ||
      (await stripe.products.create({
        active: true,
        name: body.billing,
      }));

    const pricesList = await stripe.prices.list({
      active: true,
      product: findProduct!.id,
    });

    const unitCents = unitAmountCentsUsd(
      body.period,
      priceData.month_price,
      priceData.year_price
    );
    this.assertStripeUsdSubscriptionMinimum(unitCents);

    const findPrice =
      pricesList.data.find(
        (p) =>
          p?.recurring?.interval?.toLowerCase() ===
            (body.period === 'MONTHLY' ? 'month' : 'year') &&
          p?.nickname === body.billing + ' ' + body.period &&
          p?.unit_amount === unitCents
      ) ||
      (await stripe.prices.create({
        active: true,
        product: findProduct!.id,
        currency: 'usd',
        nickname: body.billing + ' ' + body.period,
        unit_amount: unitCents,
        recurring: {
          interval: body.period === 'MONTHLY' ? 'month' : 'year',
        },
      }));

    const proration_date = Math.floor(Date.now() / 1000);

    const currentUserSubscription = {
      data: (
        await stripe.subscriptions.list({
          customer,
          status: 'all',
        })
      ).data.filter((f) => f.status === 'active' || f.status === 'trialing'),
    };

    try {
      const price = await stripe.invoices.createPreview({
        customer,
        subscription: currentUserSubscription?.data?.[0]?.id,
        subscription_details: {
          proration_behavior: 'create_prorations',
          billing_cycle_anchor: 'now',
          items: [
            {
              id: currentUserSubscription?.data?.[0]?.items?.data?.[0]?.id,
              price: findPrice?.id!,
              quantity: 1,
            },
          ],
          proration_date: proration_date,
        },
      });

      return {
        price: price?.amount_remaining ? price?.amount_remaining / 100 : 0,
      };
    } catch (err) {
      return { price: 0 };
    }
  }

  async getCustomerSubscriptions(organizationId: string) {
    const org = (await this._organizationService.getOrgById(organizationId))!;
    const customer = org.paymentId;
    return stripe.subscriptions.list({
      customer: customer!,
      status: 'all',
    });
  }

  async setToCancel(organizationId: string) {
    const id = makeId(10);
    const org = await this._organizationService.getOrgById(organizationId);
    const customer = await this.createOrGetCustomer(org!);
    const currentUserSubscription = {
      data: (
        await stripe.subscriptions.list({
          customer,
          status: 'all',
          expand: ['data.latest_invoice'],
        })
      ).data.filter((f) => f.status !== 'canceled'),
    };

    const sub = currentUserSubscription.data[0];

    // If the user is toggling back (un-cancelling), just remove the cancel
    if (sub.cancel_at_period_end) {
      const { cancel_at } = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: false,
        metadata: { service: 'gitroom', id },
      });

      return {
        id,
        cancel_at: cancel_at ? new Date(cancel_at * 1000) : undefined,
      };
    }

    // Check if the latest invoice has a failed payment
    const latestInvoice = sub.latest_invoice as Stripe.Invoice | null;
    const hasFailedPayment =
      sub.status === 'past_due' ||
      latestInvoice?.status === 'open' ||
      latestInvoice?.status === 'uncollectible';

    if (hasFailedPayment) {
      // Payment already failed — cancel immediately and delete subscription
      await stripe.subscriptions.cancel(sub.id);
      await this._subscriptionService.deleteSubscription(customer);

      return {
        id,
        cancel_at: new Date(),
      };
    }

    // Payment succeeded — cancel at end of billing period
    const { cancel_at } = await stripe.subscriptions.update(sub.id, {
      cancel_at_period_end: true,
      metadata: { service: 'gitroom', id },
    });

    return {
      id,
      cancel_at: cancel_at ? new Date(cancel_at * 1000) : undefined,
    };
  }

  async getCustomerByOrganizationId(organizationId: string) {
    const org = (await this._organizationService.getOrgById(organizationId))!;
    return org.paymentId;
  }

  async createBillingPortalLink(customer: string) {
    return stripe.billingPortal.sessions.create({
      customer,
      return_url: process.env['FRONTEND_URL'] + '/billing',
    });
  }

  /**
   * Find an active promotion code with autoapply: true metadata
   * Only returns codes that are active and not expired
   * Returns the promotion code string (not the ID) for frontend auto-apply
   */
  private async findAutoApplyPromotionCode(): Promise<string | null> {
    try {
      const promotionCodes = await stripe.promotionCodes.list({
        active: true,
        limit: 100,
      });

      const now = Math.floor(Date.now() / 1000);

      for (const promoCode of promotionCodes.data) {
        const coupon =
          typeof promoCode.promotion.coupon === 'string'
            ? null
            : promoCode.promotion.coupon;

        // Check if it has autoapply metadata set to true (check both promo and coupon metadata)
        const autoApply = Object.assign(
          {},
          promoCode.metadata,
          coupon?.metadata
        )?.autoapply;
        if (autoApply !== 'true') continue;

        // Check if the promotion code has expired
        if (promoCode.expires_at && promoCode.expires_at < now) continue;

        // Check if the coupon has expired (redeem_by)
        if (coupon?.redeem_by && coupon.redeem_by < now) continue;

        // Check if max redemptions reached
        if (
          promoCode.max_redemptions &&
          promoCode.times_redeemed >= promoCode.max_redemptions
        )
          continue;

        // Found a valid auto-apply promotion code - return the code string for frontend
        return promoCode.code;
      }

      return null;
    } catch (err) {
      console.error('Error finding auto-apply promotion code:', err);
      return null;
    }
  }

  private async createEmbeddedCheckout(
    ud: string,
    uniqueId: string,
    customer: string,
    body: BillingSubscribeDto,
    price: string,
    userId: string,
    allowTrial: boolean
  ) {
    const user = await this._userService.getUserById(userId);

    try {
      await stripe.customers.update(customer, {
        email: user.email.indexOf('@') > -1 ? user.email : `${user.email}@postiz.com`,
        ...(body.dub
          ? {
              metadata: {
                dubCustomerExternalId: userId,
                dubClickId: body.dub,
              },
            }
          : {}),
      });
    } catch (err) {}

    // Check for auto-apply promotion code (only for monthly plans)
    let autoApplyPromoCode: string | null = null;
    if (body.period === 'MONTHLY') {
      autoApplyPromoCode = await this.findAutoApplyPromotionCode();
    }

    const isUtm = body.utm ? `&utm_source=${body.utm}` : '';
    const { client_secret } = await stripe.checkout.sessions.create({
      ui_mode: 'custom',
      customer,
      return_url:
        process.env['FRONTEND_URL'] +
        `/launches?onboarding=true&check=${uniqueId}${isUtm}`,
      mode: 'subscription',
      subscription_data: {
        ...(allowTrial ? { trial_period_days: 7 } : {}),
        metadata: this.subscriptionMetadataFromBody(body, {
          userId,
          uniqueId,
          ud,
        }),
      },
      ...(body.datafast_session_id && body.datafast_visitor_id
        ? {
            metadata: {
              datafast_visitor_id: body.datafast_visitor_id,
              datafast_session_id: body.datafast_session_id,
            },
          }
        : {}),
      allow_promotion_codes: true,
      line_items: [
        {
          price,
          quantity: 1,
        },
      ],
    });

    // Return auto-apply promo code for frontend to apply
    return {
      client_secret,
      ...(autoApplyPromoCode ? { auto_apply_coupon: autoApplyPromoCode } : {}),
    };
  }

  private async createCheckoutSession(
    ud: string,
    uniqueId: string,
    customer: string,
    body: BillingSubscribeDto,
    price: string,
    userId: string,
    allowTrial: boolean
  ) {
    const isUtm = body.utm ? `&utm_source=${body.utm}` : '';

    if (body.dub) {
      await stripe.customers.update(customer, {
        metadata: {
          dubCustomerExternalId: userId,
          dubClickId: body.dub,
        },
      });
    }

    const { url } = await stripe.checkout.sessions.create({
      customer,
      cancel_url: process.env['FRONTEND_URL'] + `/billing?cancel=true${isUtm}`,
      success_url:
        process.env['FRONTEND_URL'] +
        `/launches?onboarding=true&check=${uniqueId}${isUtm}`,
      mode: 'subscription',
      subscription_data: {
        ...(allowTrial ? { trial_period_days: 7 } : {}),
        metadata: this.subscriptionMetadataFromBody(body, {
          userId,
          uniqueId,
          ud,
        }),
      },
      allow_promotion_codes: true,
      line_items: [
        {
          price,
          quantity: 1,
        },
      ],
    });

    return { url };
  }

  async finishTrial(paymentId: string) {
    const list = (
      await stripe.subscriptions.list({
        customer: paymentId,
      })
    ).data.filter((f) => f.status === 'trialing');

    return stripe.subscriptions.update(list[0].id, {
      trial_end: 'now',
    });
  }

  async checkDiscount(customer: string) {
    if (!process.env.STRIPE_DISCOUNT_ID) {
      return false;
    }

    const list = await stripe.charges.list({
      customer,
      limit: 1,
    });

    if (!list.data.filter((f) => f.amount > 1000).length) {
      return false;
    }

    const currentUserSubscription = {
      data: (
        await stripe.subscriptions.list({
          customer,
          status: 'all',
          expand: ['data.discounts'],
        })
      ).data.find((f) => f.status === 'active' || f.status === 'trialing'),
    };

    if (!currentUserSubscription) {
      return false;
    }

    if (
      currentUserSubscription.data?.items.data[0]?.price.recurring?.interval ===
        'year' ||
      currentUserSubscription.data?.discounts.length
    ) {
      return false;
    }

    return true;
  }

  async applyDiscount(customer: string) {
    const check = this.checkDiscount(customer);
    if (!check) {
      return false;
    }

    const currentUserSubscription = {
      data: (
        await stripe.subscriptions.list({
          customer,
          status: 'all',
          expand: ['data.discounts'],
        })
      ).data.find((f) => f.status === 'active' || f.status === 'trialing'),
    };

    await stripe.subscriptions.update(currentUserSubscription.data.id, {
      discounts: [
        {
          coupon: process.env.STRIPE_DISCOUNT_ID!,
        },
      ],
    });

    return true;
  }

  async checkSubscription(organizationId: string, subscriptionId: string) {
    const orgValue = await this._subscriptionService.checkSubscription(
      organizationId,
      subscriptionId
    );

    if (orgValue) {
      return 2;
    }

    const getCustomerSubscriptions = await this.getCustomerSubscriptions(
      organizationId
    );
    if (getCustomerSubscriptions.data.length === 0) {
      return 0;
    }

    if (
      getCustomerSubscriptions.data.find(
        (p) => p.metadata.uniqueId === subscriptionId
      )?.canceled_at
    ) {
      return 1;
    }

    return 0;
  }

  async embedded(
    uniqueId: string,
    organizationId: string,
    userId: string,
    body: BillingSubscribeDto,
    allowTrial: boolean
  ) {
    const id = makeId(10);
    const priceData = this.priceDataFor(body.billing);
    const org = await this._organizationService.getOrgById(organizationId);
    const customer = await this.createOrGetCustomer(org!);
    const allProducts = await stripe.products.list({
      active: true,
      expand: ['data.prices'],
    });

    const findProduct =
      allProducts.data.find(
        (product) => product.name.toUpperCase() === body.billing.toUpperCase()
      ) ||
      (await stripe.products.create({
        active: true,
        name: body.billing,
      }));

    const pricesList = await stripe.prices.list({
      active: true,
      product: findProduct!.id,
    });

    const unitCentsEmbedded = unitAmountCentsUsd(
      body.period,
      priceData.month_price,
      priceData.year_price
    );
    this.assertStripeUsdSubscriptionMinimum(unitCentsEmbedded);

    const findPrice =
      pricesList.data.find(
        (p) =>
          p?.recurring?.interval?.toLowerCase() ===
            (body.period === 'MONTHLY' ? 'month' : 'year') &&
          p?.nickname === body.billing + ' ' + body.period &&
          p?.unit_amount === unitCentsEmbedded
      ) ||
      (await stripe.prices.create({
        active: true,
        product: findProduct!.id,
        currency: 'usd',
        nickname: body.billing + ' ' + body.period,
        unit_amount: unitCentsEmbedded,
        recurring: {
          interval: body.period === 'MONTHLY' ? 'month' : 'year',
        },
      }));

    return this.createEmbeddedCheckout(
      uniqueId,
      id,
      customer,
      body,
      findPrice!.id,
      userId,
      allowTrial
    );
  }

  async subscribe(
    uniqueId: string,
    organizationId: string,
    userId: string,
    body: BillingSubscribeDto,
    allowTrial: boolean
  ) {
    const id = makeId(10);
    const priceData = this.priceDataFor(body.billing);
    const org = await this._organizationService.getOrgById(organizationId);
    const customer = await this.createOrGetCustomer(org!);
    const allProducts = await stripe.products.list({
      active: true,
      expand: ['data.prices'],
    });

    const findProduct =
      allProducts.data.find(
        (product) => product.name.toUpperCase() === body.billing.toUpperCase()
      ) ||
      (await stripe.products.create({
        active: true,
        name: body.billing,
      }));

    const pricesList = await stripe.prices.list({
      active: true,
      product: findProduct!.id,
    });

    const unitCentsSubscribe = unitAmountCentsUsd(
      body.period,
      priceData.month_price,
      priceData.year_price
    );
    this.assertStripeUsdSubscriptionMinimum(unitCentsSubscribe);

    const findPrice =
      pricesList.data.find(
        (p) =>
          p?.recurring?.interval?.toLowerCase() ===
            (body.period === 'MONTHLY' ? 'month' : 'year') &&
          p?.nickname === body.billing + ' ' + body.period &&
          p?.unit_amount === unitCentsSubscribe
      ) ||
      (await stripe.prices.create({
        active: true,
        product: findProduct!.id,
        currency: 'usd',
        nickname: body.billing + ' ' + body.period,
        unit_amount: unitCentsSubscribe,
        recurring: {
          interval: body.period === 'MONTHLY' ? 'month' : 'year',
        },
      }));

    const getCurrentSubscriptions =
      await this._subscriptionService.getSubscription(organizationId);

    if (!getCurrentSubscriptions) {
      return this.createCheckoutSession(
        uniqueId,
        id,
        customer,
        body,
        findPrice!.id,
        userId,
        allowTrial
      );
    }

    const currentUserSubscription = {
      data: (
        await stripe.subscriptions.list({
          customer,
          status: 'all',
        })
      ).data.filter((f) => f.status === 'active' || f.status === 'trialing'),
    };

    try {
      await stripe.subscriptions.update(currentUserSubscription.data[0].id, {
        cancel_at_period_end: false,
        metadata: this.subscriptionMetadataFromBody(body, {
          userId,
          id,
          ud: uniqueId,
        }),
        proration_behavior: 'always_invoice',
        items: [
          {
            id: currentUserSubscription.data[0].items.data[0].id,
            price: findPrice!.id,
            quantity: 1,
          },
        ],
      });

      return { id };
    } catch (err) {
      const { url } = await this.createBillingPortalLink(customer);
      return {
        portal: url,
      };
    }
  }

  async paymentSucceeded(event: Stripe.InvoicePaymentSucceededEvent) {
    // get subscription from payment
    const subscriptionId =
      event.data.object.parent?.subscription_details?.subscription;
    if (!subscriptionId) {
      return { ok: true };
    }
    const subscription = await stripe.subscriptions.retrieve(
      typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id
    );

    const { userId, ud } = subscription.metadata;
    const user = await this._userService.getUserById(userId);
    if (user && user.ip && user.agent) {
      this._trackService.track(ud, user.ip, user.agent, TrackEnum.Purchase, {
        value: event.data.object.amount_paid / 100,
      });
    }

    return { ok: true };
  }

  async getCharges(organizationId: string) {
    const org = await this._organizationService.getOrgById(organizationId);
    if (!org?.paymentId) {
      return [];
    }

    const charges = await stripe.charges.list({
      customer: org.paymentId,
      limit: 100,
    });

    const chargeList = charges.data
      .filter((f) => f.status === 'succeeded')
      .map((charge) => ({
        id: charge.id,
        amount: charge.amount,
        currency: charge.currency,
        created: charge.created,
        status: charge.status,
        refunded: charge.refunded,
        amount_refunded: charge.amount_refunded,
        description: charge.description,
        receipt_url: charge.receipt_url || null,
        invoice: (charge as any).invoice || null,
      }));

    const invoiceIds = chargeList
      .map((c) => c.invoice)
      .filter((id): id is string => !!id && typeof id === 'string');

    const invoicePdfMap: Record<string, string> = {};
    for (const invoiceId of invoiceIds) {
      try {
        const inv = await stripe.invoices.retrieve(invoiceId);
        if (inv.invoice_pdf) {
          invoicePdfMap[invoiceId] = inv.invoice_pdf;
        }
      } catch {
        // ignore if invoice can't be fetched
      }
    }

    return chargeList.map((charge) => ({
      ...charge,
      invoice_pdf:
        charge.invoice && invoicePdfMap[charge.invoice as string]
          ? invoicePdfMap[charge.invoice as string]
          : null,
    }));
  }

  async refundCharges(organizationId: string, chargeIds: string[]) {
    const org = await this._organizationService.getOrgById(organizationId);
    if (!org?.paymentId) {
      throw new Error('No payment customer found for this organization');
    }

    const refunded: string[] = [];
    const failed: string[] = [];

    for (const chargeId of chargeIds) {
      try {
        await stripe.refunds.create({ charge: chargeId });
        refunded.push(chargeId);
      } catch (err) {
        failed.push(chargeId);
      }
    }

    return { refunded, failed };
  }

  async cancelSubscription(organizationId: string) {
    const org = await this._organizationService.getOrgById(organizationId);
    if (!org?.paymentId) {
      throw new Error('No payment customer found for this organization');
    }

    const customer = org.paymentId;

    const subscriptions = (
      await stripe.subscriptions.list({
        customer,
        status: 'all',
      })
    ).data.filter((f) => f.status !== 'canceled');

    if (!subscriptions.length) {
      throw new Error('No active subscription found');
    }

    await stripe.subscriptions.cancel(subscriptions[0].id);
    await this._subscriptionService.deleteSubscription(customer);

    return { cancelled: true };
  }

  async listPromotionCodesForAdmin() {
    const list = await stripe.promotionCodes.list({
      limit: 100,
      expand: ['data.promotion.coupon'],
    });
    return list.data.map((pc) => {
      const raw = pc.promotion?.coupon;
      const c =
        typeof raw === 'object' && raw && !('deleted' in raw)
          ? (raw as Stripe.Coupon)
          : null;
      return {
        id: pc.id,
        code: pc.code,
        active: pc.active,
        timesRedeemed: pc.times_redeemed,
        maxRedemptions: pc.max_redemptions,
        expiresAt: pc.expires_at,
        couponName: c?.name ?? null,
        percentOff: c?.percent_off ?? null,
        amountOff: c?.amount_off ?? null,
        currency: c?.currency ?? null,
        duration: c?.duration ?? null,
      };
    });
  }

  async createPromotionWithCode(dto: CreateStripePromotionDto) {
    const hasPct =
      dto.percentOff != null && !Number.isNaN(Number(dto.percentOff));
    const hasAmt =
      dto.amountOffCents != null && !Number.isNaN(Number(dto.amountOffCents));
    if (!hasPct && !hasAmt) {
      throw new HttpException('Provide either percentOff or amountOffCents', 400);
    }
    if (hasPct && hasAmt) {
      throw new HttpException(
        'Provide only one of percentOff or amountOffCents',
        400
      );
    }
    if (dto.duration === 'repeating' && !dto.durationInMonths) {
      throw new HttpException(
        'durationInMonths is required when duration is repeating',
        400
      );
    }

    const sanitized = dto.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');
    if (sanitized.length < 3) {
      throw new HttpException(
        'Code must be at least 3 letters/numbers after cleaning',
        400
      );
    }

    const couponParams: Stripe.CouponCreateParams = {
      name: dto.name.trim(),
      duration: dto.duration,
    };
    if (dto.duration === 'repeating' && dto.durationInMonths) {
      couponParams.duration_in_months = dto.durationInMonths;
    }
    if (hasPct) {
      couponParams.percent_off = dto.percentOff!;
    } else {
      couponParams.amount_off = dto.amountOffCents!;
      couponParams.currency = 'usd';
    }

    const coupon = await stripe.coupons.create(couponParams);

    const promotionParams: Stripe.PromotionCodeCreateParams = {
      code: sanitized,
      promotion: {
        type: 'coupon',
        coupon: coupon.id,
      },
    };
    if (
      dto.maxRedemptions != null &&
      !Number.isNaN(Number(dto.maxRedemptions)) &&
      dto.maxRedemptions >= 1
    ) {
      promotionParams.max_redemptions = dto.maxRedemptions;
    }

    const promotion = await stripe.promotionCodes.create(promotionParams);

    return {
      couponId: coupon.id,
      promotionCodeId: promotion.id,
      code: promotion.code,
    };
  }

  /** Super-admin: verify API key can talk to Stripe (read-only). */
  async adminStripeConnectivityPing() {
    const sk = (process.env.STRIPE_SECRET_KEY || '').trim();
    if (!sk || sk === 'sk_nothing') {
      return {
        ok: false,
        message: 'STRIPE_SECRET_KEY is missing or placeholder.',
        adminTestCheckoutAmountCents: resolveAdminTestCheckoutAmountCents(),
        stripeUsdCardMinimumNote:
          'Admin test Checkout must be at least 50¢ USD (Stripe). Use STRIPE_ADMIN_TEST_CHECKOUT_AMOUNT_CENTS=50 or omit it; values under 50 are rejected by the API — no server restart fixes that.',
      };
    }
    const keyMode = sk.startsWith('sk_live')
      ? 'live'
      : sk.startsWith('sk_test')
        ? 'test'
        : 'unknown';
    try {
      const balance = await stripe.balance.retrieve();
      return {
        ok: true,
        keyMode,
        livemode: balance.livemode,
        currencies: (balance.available || []).map((a) => ({
          currency: a.currency,
          amount: a.amount,
        })),
        adminTestCheckoutAmountCents: resolveAdminTestCheckoutAmountCents(),
        stripeUsdCardMinimumNote:
          'Admin test Checkout must be at least 50¢ USD (Stripe). Use STRIPE_ADMIN_TEST_CHECKOUT_AMOUNT_CENTS=50 or omit it; values under 50 are rejected by the API — no server restart fixes that.',
      };
    } catch (err: unknown) {
      const e = err as { message?: string; type?: string };
      return {
        ok: false,
        keyMode,
        message: e?.message || String(err),
        type: e?.type,
        adminTestCheckoutAmountCents: resolveAdminTestCheckoutAmountCents(),
        stripeUsdCardMinimumNote:
          'Admin test Checkout must be at least 50¢ USD (Stripe). Use STRIPE_ADMIN_TEST_CHECKOUT_AMOUNT_CENTS=50 or omit it; values under 50 are rejected by the API — no server restart fixes that.',
      };
    }
  }

  /** Super-admin: show effective plan USD/cents vs $0.50 minimum guard. */
  adminStripePricingDiagnostics() {
    const tiers = ['STANDARD', 'PRO'] as const;
    const overrideRaw = (
      process.env.NEXT_PUBLIC_STRIPE_PLAN_PRICE_OVERRIDE_USD ||
      process.env.STRIPE_PLAN_PRICE_OVERRIDE_USD ||
      ''
    )
      .toString()
      .trim();
    const rows = tiers.map((tier) => {
      const p = this._planPricing.getTier(tier);
      const monthCents = unitAmountCentsUsd(
        'MONTHLY',
        p.month_price,
        p.year_price
      );
      const yearCents = unitAmountCentsUsd(
        'YEARLY',
        p.month_price,
        p.year_price
      );
      return {
        tier,
        monthUsd: p.month_price,
        yearUsd: p.year_price,
        monthCents,
        yearCents,
        monthMeetsAppMinimum50c: monthCents === 0 || monthCents >= 50,
        yearMeetsAppMinimum50c: yearCents === 0 || yearCents >= 50,
      };
    });
    return {
      minChargeNote:
        'Applies to subscriber subscription Checkout only (STANDARD / PRO line items in this app). It does not apply to the one-time admin test Checkout in section 3. This app rejects subscription amounts under 50¢ (except free). Stripe also enforces card minimums in live mode.',
      envOverride: overrideRaw || null,
      tiers: rows,
    };
  }

  /**
   * One-time Checkout for a small USD amount — tests Stripe Checkout without a subscription.
   * Amount: env STRIPE_ADMIN_TEST_CHECKOUT_AMOUNT_CENTS (default 50) or `amountCents` argument.
   * Promotion codes allowed. Amount must be ≥50¢ USD (Stripe Checkout minimum).
   */
  async adminStripeTestCheckoutSession(
    frontendBaseUrl: string,
    amountCents?: number
  ) {
    const unit_amount = resolveAdminTestCheckoutAmountCents(amountCents);
    if (unit_amount < 50) {
      throw new HttpException(
        `Stripe requires at least $0.50 USD (50 cents) for this Checkout session; requested ${unit_amount}¢. ` +
          'Set STRIPE_ADMIN_TEST_CHECKOUT_AMOUNT_CENTS=50 (or remove it), or leave the admin "Amount (cents)" field blank and use 50+. Restarting the server does not change this Stripe limit.',
        400
      );
    }
    const base = frontendBaseUrl.replace(/\/$/, '');
    const success = `${base}/adminisamazing/billing?result=success`;
    const cancel = `${base}/adminisamazing/billing?result=cancel`;
    const displayUsd = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(unit_amount / 100);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount,
            product_data: {
              name: `TweetMax admin — Stripe connectivity (${displayUsd})`,
              description: `One-time test charge (${unit_amount}¢ USD). Refund from Stripe Dashboard if needed.`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${success}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel,
      allow_promotion_codes: true,
    });
    if (!session.url) {
      throw new HttpException('Stripe did not return a checkout URL', 502);
    }
    return { url: session.url, id: session.id, amountCents: unit_amount };
  }

  async lifetimeDeal(organizationId: string, code: string) {
    const getCurrentSubscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );
    if (getCurrentSubscription && !getCurrentSubscription?.isLifetime) {
      throw new Error('You already have a non lifetime subscription');
    }

    try {
      const testCode = AuthService.fixedDecryption(code);
      const findCode = await this._subscriptionService.getCode(testCode);
      if (findCode) {
        return {
          success: false,
        };
      }

      const nextPackage = !getCurrentSubscription ? 'STANDARD' : 'PRO';
      const findPricing = this._planPricing.getTier(nextPackage);

      await this._subscriptionService.createOrUpdateSubscription(
        false,
        makeId(10),
        organizationId,
        getCurrentSubscription?.subscriptionTier === 'PRO'
          ? getCurrentSubscription.totalChannels + 5
          : findPricing.channel!,
        nextPackage,
        'MONTHLY',
        null,
        testCode,
        organizationId
      );
      return {
        success: true,
      };
    } catch (err) {
      console.log(err);
      return {
        success: false,
      };
    }
  }
}
