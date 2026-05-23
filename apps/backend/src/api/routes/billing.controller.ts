import { Body, Controller, Get, HttpException, Param, Post, Req } from '@nestjs/common';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { StripeService } from '@gitroom/nestjs-libraries/services/stripe.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization, User } from '@prisma/client';
import { BillingSubscribeDto } from '@gitroom/nestjs-libraries/dtos/billing/billing.subscribe.dto';
import { CreateStripePromotionDto } from '@gitroom/nestjs-libraries/dtos/billing/create-stripe-promotion.dto';
import { UpdateBillingPlanPricesDto } from '@gitroom/nestjs-libraries/dtos/billing/update-billing-plan-prices.dto';
import { BillingPlanPricingService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/billing-plan-pricing.service';
import { ApiTags } from '@nestjs/swagger';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { Request } from 'express';
import { Nowpayments } from '@gitroom/nestjs-libraries/crypto/nowpayments';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

@ApiTags('Billing')
@Controller('/billing')
export class BillingController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _stripeService: StripeService,
    private _notificationService: NotificationService,
    private _nowpayments: Nowpayments,
    private _planPricing: BillingPlanPricingService
  ) {}

  @Get('/plan-prices')
  getPlanPrices() {
    return this._planPricing.getPublicPrices();
  }

  @Get('/check/:id')
  async checkId(
    @GetOrgFromRequest() org: Organization,
    @Param('id') body: string
  ) {
    return {
      status: await this._stripeService.checkSubscription(org.id, body),
    };
  }

  @Get('/check-discount')
  async checkDiscount(@GetOrgFromRequest() org: Organization) {
    return {
      offerCoupon: !(await this._stripeService.checkDiscount(org.paymentId))
        ? false
        : AuthService.signJWT({ discount: true }),
    };
  }

  @Post('/apply-discount')
  async applyDiscount(@GetOrgFromRequest() org: Organization) {
    await this._stripeService.applyDiscount(org.paymentId);
  }

  @Post('/finish-trial')
  async finishTrial(@GetOrgFromRequest() org: Organization) {
    try {
      await this._stripeService.finishTrial(org.paymentId);
    } catch (err) {}
    return {
      finish: true,
    };
  }

  @Get('/is-trial-finished')
  async isTrialFinished(@GetOrgFromRequest() org: Organization) {
    return {
      finished: !org.isTrailing,
    };
  }

  @Post('/embedded')
  embedded(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: BillingSubscribeDto,
    @Req() req: Request
  ) {
    const uniqueId = req?.cookies?.track;
    return this._stripeService.embedded(
      uniqueId,
      org.id,
      user.id,
      body,
      org.allowTrial
    );
  }

  @Post('/subscribe')
  subscribe(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: BillingSubscribeDto,
    @Req() req: Request
  ) {
    const uniqueId = req?.cookies?.track;
    return this._stripeService.subscribe(
      uniqueId,
      org.id,
      user.id,
      body,
      org.allowTrial
    );
  }

  @Get('/portal')
  async modifyPayment(@GetOrgFromRequest() org: Organization) {
    const customer = await this._stripeService.getCustomerByOrganizationId(
      org.id
    );
    const { url } = await this._stripeService.createBillingPortalLink(customer);
    return {
      portal: url,
    };
  }

  @Get('/')
  getCurrentBilling(@GetOrgFromRequest() org: Organization) {
    return this._subscriptionService.getSubscriptionByOrganizationId(org.id);
  }

  @Post('/cancel')
  async cancel(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: { feedback: string }
  ) {
    await this._notificationService.sendEmail(
      process.env.EMAIL_FROM_ADDRESS,
      'Subscription Cancelled',
      `Organization ${org.name} has cancelled their subscription because: ${body.feedback}`,
      user.email
    );

    return this._stripeService.setToCancel(org.id);
  }

  @Post('/prorate')
  prorate(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BillingSubscribeDto
  ) {
    return this._stripeService.prorate(org.id, body);
  }

  @Post('/lifetime')
  async lifetime(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { code: string }
  ) {
    return this._stripeService.lifetimeDeal(org.id, body.code);
  }

  @Get('/charges')
  async getCharges(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return this._stripeService.getCharges(org.id);
  }

  @Post('/refund-charges')
  async refundCharges(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization,
    @Body() body: { chargeIds: string[] }
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return this._stripeService.refundCharges(org.id, body.chargeIds);
  }

  @Post('/cancel-subscription')
  async cancelSubscription(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return this._stripeService.cancelSubscription(org.id);
  }

  @Post('/add-subscription')
  async addSubscription(
    @Body() body: { subscription: string },
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    if (!user.isSuperAdmin) {
      throw new Error('Unauthorized');
    }

    await this._subscriptionService.addSubscription(
      org.id,
      user.id,
      body.subscription
    );
  }

  @Get('/stripe-admin/plan-prices')
  getStripeAdminPlanPrices(@GetUserFromRequest() user: User) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Forbidden', 403);
    }
    return this._planPricing.getAdminView();
  }

  @Post('/stripe-admin/plan-prices')
  async saveStripeAdminPlanPrices(
    @GetUserFromRequest() user: User,
    @Body() body: UpdateBillingPlanPricesDto
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Forbidden', 403);
    }
    const result = await this._planPricing.updateFromAdmin(body);
    if (!result.ok) {
      throw new HttpException(result.message, 400);
    }
    return result;
  }

  @Get('/stripe-admin/promotion-codes')
  async listStripePromotionCodes(@GetUserFromRequest() user: User) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Forbidden', 403);
    }
    return this._stripeService.listPromotionCodesForAdmin();
  }

  @Post('/stripe-admin/promotion-codes')
  async createStripePromotionCode(
    @GetUserFromRequest() user: User,
    @Body() body: CreateStripePromotionDto
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Forbidden', 403);
    }
    return this._stripeService.createPromotionWithCode(body);
  }

  @Get('/stripe-admin/test/ping')
  async stripeAdminTestPing(@GetUserFromRequest() user: User) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Forbidden', 403);
    }
    return this._stripeService.adminStripeConnectivityPing();
  }

  @Get('/stripe-admin/test/pricing')
  async stripeAdminTestPricing(@GetUserFromRequest() user: User) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Forbidden', 403);
    }
    return this._stripeService.adminStripePricingDiagnostics();
  }

  @Post('/stripe-admin/test/checkout-50c')
  async stripeAdminTestCheckout50c(
    @GetUserFromRequest() user: User,
    @Body() body?: { amountCents?: number }
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Forbidden', 403);
    }
    const base =
      process.env.FRONTEND_URL ||
      process.env.MAIN_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!base) {
      throw new HttpException(
        'Set FRONTEND_URL or MAIN_URL so Checkout can redirect back to /adminisamazing/billing',
        400
      );
    }
    const origin = base.replace(/\/api\/?$/, '');
    const raw = body?.amountCents;
    const amountCents =
      raw === undefined || raw === null
        ? undefined
        : Math.floor(Number(raw));
    if (
      amountCents !== undefined &&
      (!Number.isFinite(amountCents) || amountCents < 1)
    ) {
      throw new HttpException(
        'amountCents must be a positive integer (cents), or omit to use STRIPE_ADMIN_TEST_CHECKOUT_AMOUNT_CENTS / default 50',
        400
      );
    }
    return this._stripeService.adminStripeTestCheckoutSession(
      origin,
      amountCents
    );
  }

  @Get('/crypto')
  async crypto(@GetOrgFromRequest() org: Organization) {
    return this._nowpayments.createPaymentPage(org.id);
  }
}
