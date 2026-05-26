'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { Subscription } from '@prisma/client';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { Slider } from '@gitroom/react/form/slider';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { usePlanPrices } from '@gitroom/frontend/components/billing/use-plan-prices';
import {
  SUBSCRIBE_PLANS,
  subscribePlanDisplayName,
  type SubscribeBillingTier,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscribe-plans.config';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useUtmUrl } from '@gitroom/helpers/utils/utm.saver';
import { useDubClickId } from '@gitroom/frontend/components/layout/dubAnalytics';
import { useTrack } from '@gitroom/react/helpers/use.track';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { useSWRConfig } from 'swr';
import { useRouter } from 'next/navigation';
import { BillingCancelFeedbackForm } from '@gitroom/frontend/components/billing/main.billing.component';

function tierLabel(tier: string | undefined | null): string {
  if (!tier || tier === 'FREE') return 'Free';
  const plan = SUBSCRIBE_PLANS.find((p) => p.billing === tier);
  return plan?.name ?? subscribePlanDisplayName(tier) ?? tier;
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" className="shrink-0">
      <path
        d="M7.5 12.75L3.75 9L4.83 7.92L7.5 10.58L13.17 4.92L14.25 6L7.5 12.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

export const BillingAccountComponent: FC<{ sub?: Subscription }> = ({
  sub: subProp,
}) => {
  const fetch = useFetch();
  const toast = useToaster();
  const user = useUser();
  const router = useRouter();
  const modal = useModals();
  const { mutate } = useSWRConfig();
  const { billingEnabled } = useVariables();
  const { subscribePlans, effectivePricing } = usePlanPrices();
  const utm = useUtmUrl();
  const dub = useDubClickId();
  const track = useTrack();

  const [subscription, setSubscription] = useState(subProp);
  const [loadingTier, setLoadingTier] = useState<SubscribeBillingTier | 'FREE' | null>(
    null
  );
  const [monthlyOrYearly, setMonthlyOrYearly] = useState<'on' | 'off'>(
    subscription?.period === 'YEARLY' ? 'on' : 'off'
  );

  const currentTier =
    subscription?.subscriptionTier ??
    (typeof user?.tier === 'string' ? user.tier : user?.tier?.current) ??
    'FREE';

  const hasStripeSubscription = !!subscription?.id;
  const isCancelScheduled = !!subscription?.cancelAt;

  const currentPackage = useMemo(() => {
    if (!subscription || currentTier === 'FREE') return null;
    const period = monthlyOrYearly === 'on' ? 'YEARLY' : 'MONTHLY';
    if (subscription.period !== period) return null;
    return subscription.subscriptionTier as SubscribeBillingTier;
  }, [subscription, currentTier, monthlyOrYearly]);

  const openPortal = useCallback(async () => {
    if (!billingEnabled) {
      toast.show('Add Stripe keys to .env to open the billing portal');
      return;
    }
    try {
      const { portal } = await (await fetch('/billing/portal')).json();
      if (portal) window.location.href = portal;
    } catch {
      toast.show('Could not open billing portal');
    }
  }, [billingEnabled, fetch, toast]);

  const runCancelFlow = useCallback(async () => {
    const info = await new Promise<string>((res) => {
      modal.openModal({
        title: 'Cancel subscription',
        withCloseButton: true,
        classNames: { modal: 'bg-transparent text-textColor' },
        children: <BillingCancelFeedbackForm proceed={(e) => res(e)} />,
      });
    });
    modal.closeAll();
    if (info === undefined) return;

    setLoadingTier('FREE');
    try {
      const { cancel_at } = await (
        await fetch('/billing/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback: info || '' }),
        })
      ).json();
      setSubscription((s) => (s ? { ...s, cancelAt: cancel_at } : s));
      toast.show('Subscription will cancel at period end');
      mutate('/user/subscription');
      mutate('/user/self');
    } catch {
      toast.show('Could not cancel subscription');
    } finally {
      setLoadingTier(null);
    }
  }, [fetch, modal, mutate, toast]);

  const selectPlan = useCallback(
    (billing: SubscribeBillingTier) => async () => {
      if (!billingEnabled) {
        toast.show(
          'Set STRIPE_PUBLISHABLE_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env, then restart frontend and backend'
        );
        return;
      }

      if (billing === currentPackage && !isCancelScheduled) {
        return;
      }

      setLoadingTier(billing);
      try {
        const { url, portal } = await (
          await fetch('/billing/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              period: monthlyOrYearly === 'on' ? 'YEARLY' : 'MONTHLY',
              utm,
              billing,
              ...(dub ? { dub } : {}),
            }),
          })
        ).json();

        if (url) {
          const price =
            effectivePricing[billing]?.[
              monthlyOrYearly === 'on' ? 'year_price' : 'month_price'
            ] ?? 0;
          await track(TrackEnum.InitiateCheckout, { value: price });
          window.location.href = url;
          return;
        }

        if (portal) {
          window.open(portal);
          toast.show('Update your payment method in Stripe, then try again');
        } else {
          toast.show('Plan updated');
          mutate('/user/subscription');
          mutate('/user/self');
        }
      } catch {
        toast.show('Checkout failed — check Stripe configuration');
      } finally {
        setLoadingTier(null);
      }
    },
    [
      billingEnabled,
      currentPackage,
      dub,
      effectivePricing,
      fetch,
      isCancelScheduled,
      monthlyOrYearly,
      mutate,
      toast,
      track,
      utm,
    ]
  );

  const reactivate = useCallback(async () => {
    if (!billingEnabled) return;
    setLoadingTier('FREE');
    try {
      const { cancel_at } = await (
        await fetch('/billing/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback: '' }),
        })
      ).json();
      setSubscription((s) => (s ? { ...s, cancelAt: cancel_at } : s));
      toast.show('Subscription reactivated');
      mutate('/user/subscription');
    } catch {
      toast.show('Could not reactivate');
    } finally {
      setLoadingTier(null);
    }
  }, [billingEnabled, fetch, mutate, toast]);

  if (user?.isLifetime) {
    router.replace('/');
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 pb-12">
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#12121a] to-[#0a0a0f] p-6 md:p-8 shadow-[0_0_40px_-12px_rgba(59,130,246,0.25)]">
        <p className="text-[12px] font-medium uppercase tracking-widest text-white/40">
          Current plan
        </p>
        <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight text-white">
              {tierLabel(currentTier)}
            </h1>
            <p className="mt-1 text-[15px] text-white/55">
              {currentTier === 'FREE'
                ? 'Upgrade to unlock auto-DM, more channels, and higher limits.'
                : hasStripeSubscription
                  ? `Billed ${subscription?.period === 'YEARLY' ? 'yearly' : 'monthly'}`
                  : 'Active on this workspace'}
              {isCancelScheduled && subscription?.cancelAt && (
                <>
                  {' '}
                  · Ends{' '}
                  {newDayjs(subscription.cancelAt).local().format('D MMM, YYYY')}
                </>
              )}
              {!isCancelScheduled && currentTier !== 'FREE' && (
                <span className="ml-2 inline-flex rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[12px] font-medium text-emerald-300">
                  Active
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasStripeSubscription && billingEnabled && (
              <Button onClick={openPortal} className="!rounded-full">
                Payment & invoices
              </Button>
            )}
            {isCancelScheduled && billingEnabled && (
              <Button
                loading={loadingTier === 'FREE'}
                onClick={reactivate}
                className="!rounded-full"
              >
                Reactivate
              </Button>
            )}
            {currentTier !== 'FREE' && !isCancelScheduled && (
              <Button
                className="!rounded-full !bg-red-600 hover:!bg-red-700"
                onClick={async () => {
                  if (!billingEnabled) {
                    toast.show(
                      'Billing cancellation needs Stripe enabled in this workspace.'
                    );
                    return;
                  }
                  if (
                    await deleteDialog(
                      'Cancel your subscription? You keep access until the end of the billing period.',
                      'Yes, cancel',
                      'Cancel subscription'
                    )
                  ) {
                    await runCancelFlow();
                  }
                }}
              >
                Unsubscribe
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[20px] font-semibold text-newTextColor">
            Upgrade or change plan
          </h2>
          <p className="text-[14px] text-customColor18 mt-1">
            Pick a plan below. Upgrades charge through Stripe; your current plan is marked.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-customColor6 bg-sixth px-4 py-2">
          <span
            className={clsx(
              'text-[13px]',
              monthlyOrYearly === 'off' ? 'text-newTextColor font-medium' : 'text-customColor18'
            )}
          >
            Monthly
          </span>
          <Slider value={monthlyOrYearly} onChange={setMonthlyOrYearly} />
          <span
            className={clsx(
              'text-[13px]',
              monthlyOrYearly === 'on' ? 'text-newTextColor font-medium' : 'text-customColor18'
            )}
          >
            Yearly
          </span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {subscribePlans.map((plan) => {
          const tier = plan.billing;
          const prices = effectivePricing[tier] ?? pricing[tier];
          const displayPrice =
            monthlyOrYearly === 'on' ? prices?.year_price : prices?.month_price;
          const isCurrent = currentPackage === tier;
          const isUpgrade =
            currentTier === 'FREE' ||
            (currentTier === 'TEAM' && (tier === 'ULTIMATE' || tier === 'PRO')) ||
            (currentTier === 'ULTIMATE' && tier === 'PRO');

          return (
            <div
              key={plan.id}
              className={clsx(
                'relative flex flex-col rounded-2xl border p-6 transition-shadow',
                plan.featured
                  ? 'border-[#3b82f6]/50 bg-[#0c0c12] shadow-[0_0_48px_-12px_rgba(59,130,246,0.4)]'
                  : 'border-white/[0.08] bg-[#0a0a0c]/90',
                isCurrent && 'ring-2 ring-emerald-500/60'
              )}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#2563eb] px-3 py-0.5 text-[11px] font-semibold text-white">
                  Popular
                </span>
              )}
              {isCurrent && (
                <span className="absolute right-4 top-4 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Current
                </span>
              )}
              <h3 className="text-[15px] font-medium text-white/90">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-[36px] font-bold text-white">${displayPrice}</span>
                <span className="text-[14px] text-white/45">
                  /{monthlyOrYearly === 'on' ? 'year' : 'month'}
                </span>
              </div>
              <p className="mt-3 min-h-[44px] text-[13px] leading-relaxed text-white/50">
                {plan.description}
              </p>
              <button
                type="button"
                disabled={isCurrent && !isCancelScheduled}
                onClick={selectPlan(tier)}
                className={clsx(
                  'mt-5 w-full rounded-full py-3 text-[14px] font-semibold transition-colors',
                  'disabled:cursor-default disabled:opacity-70',
                  isCurrent && !isCancelScheduled
                    ? 'bg-white/10 text-white/60'
                    : plan.featured
                      ? 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
                      : 'bg-[#2a2a2e] text-white hover:bg-[#35353a]'
                )}
              >
                {loadingTier === tier
                  ? '…'
                  : isCurrent && !isCancelScheduled
                    ? 'Current plan'
                    : isUpgrade
                      ? user?.allowTrial && currentTier === 'FREE'
                        ? 'Start 7-day trial'
                        : 'Upgrade'
                      : 'Switch plan'}
              </button>
              <ul className="mt-6 flex flex-col gap-2.5 border-t border-white/[0.06] pt-5">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[13px] text-white/75">
                    <span className="text-white/50">
                      <CheckIcon />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {user?.allowTrial && currentTier === 'FREE' && billingEnabled && (
        <p className="text-center text-[13px] text-customColor18">
          Paid plans include a <strong className="text-newTextColor">7-day free trial</strong>.
          Stripe charges when the trial ends.
        </p>
      )}
    </div>
  );
};
