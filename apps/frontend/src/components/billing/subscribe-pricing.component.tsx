'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUtmUrl } from '@gitroom/helpers/utils/utm.saver';
import { useTrack } from '@gitroom/react/helpers/use.track';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { useDubClickId } from '@gitroom/frontend/components/layout/dubAnalytics';
import { usePlanPrices } from '@gitroom/frontend/components/billing/use-plan-prices';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { LogoutComponent } from '@gitroom/frontend/components/layout/logout.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { SubscribeBillingTier } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscribe-plans.config';

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden
    >
      <path
        d="M7.5 12.75L3.75 9L4.83 7.92L7.5 10.58L13.17 4.92L14.25 6L7.5 12.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

type PlanWithPrice = {
  id: string;
  name: string;
  billing: SubscribeBillingTier;
  description: string;
  features: string[];
  featured?: boolean;
  accent?: 'white' | 'blue';
  price: number;
};

const PricingCard: FC<{
  plan: PlanWithPrice;
  loading: boolean;
  onSelect: () => void;
  ctaLabel: string;
}> = ({ plan, loading, onSelect, ctaLabel }) => {
  const isFeatured = plan.featured;
  const accentBlue = plan.accent === 'blue';

  return (
    <div
      className={clsx(
        'relative flex flex-col rounded-[20px] border overflow-hidden',
        'bg-[#0a0a0c]/80 backdrop-blur-sm',
        isFeatured
          ? 'border-[#3b82f6]/40 shadow-[0_0_60px_-12px_rgba(59,130,246,0.45)]'
          : 'border-white/[0.08]'
      )}
    >
      <div
        className={clsx(
          'mx-auto mt-0 h-[3px] w-[72px] rounded-b-full',
          accentBlue ? 'bg-[#3b82f6]' : 'bg-white/90'
        )}
      />
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-[140px] w-[140px] rounded-full bg-white/[0.06] blur-[40px]"
        aria-hidden
      />
      {isFeatured && (
        <>
          <div
            className="pointer-events-none absolute -right-4 top-6 h-[100px] w-[100px] rounded-full bg-[#3b82f6]/30 blur-[36px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 h-[80px] w-[90%] -translate-x-1/2 rounded-full bg-[#3b82f6]/20 blur-[48px]"
            aria-hidden
          />
        </>
      )}
      <div className="relative flex flex-1 flex-col px-7 pb-8 pt-6">
        <h3 className="text-[15px] font-medium text-white/90">{plan.name}</h3>
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="text-[42px] font-bold leading-none tracking-tight text-white">
            ${plan.price}
          </span>
          <span className="text-[14px] text-white/50">per month</span>
        </div>
        <p className="mt-4 min-h-[48px] text-[14px] leading-relaxed text-white/55">
          {plan.description}
        </p>
        <button
          type="button"
          onClick={onSelect}
          disabled={loading}
          className={clsx(
            'mt-6 w-full rounded-full py-3.5 text-[15px] font-semibold transition-opacity',
            'disabled:cursor-not-allowed disabled:opacity-60',
            isFeatured
              ? 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
              : 'bg-[#2a2a2e] text-white hover:bg-[#35353a]'
          )}
        >
          {loading ? '…' : ctaLabel}
        </button>
        <div className="my-7 h-px bg-white/[0.08]" />
        <p className="text-[12px] font-medium uppercase tracking-wide text-white/40">
          What&apos;s Included
        </p>
        <ul className="mt-4 flex flex-col gap-3.5">
          {plan.features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-3 text-[14px] text-white/85"
            >
              <span className="mt-0.5 text-white/90">
                <CheckIcon />
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export const SubscribePricingComponent: FC = () => {
  const t = useT();
  const user = useUser();
  const router = useRouter();
  const fetch = useFetch();
  const toast = useToaster();
  const utm = useUtmUrl();
  const track = useTrack();
  const dub = useDubClickId();
  const { billingEnabled } = useVariables();
  const { subscribePlans, effectivePricing } = usePlanPrices();
  const [loadingTier, setLoadingTier] = useState<SubscribeBillingTier | null>(
    null
  );

  const ctaLabel = user?.allowTrial
    ? t('subscribe_get_7_days_free', 'Get 7 Days Free')
    : t('subscribe_get_started', 'Get Started');

  const plansWithPrices = useMemo((): PlanWithPrice[] => {
    return subscribePlans.map((plan) => {
      const fromApi = effectivePricing[plan.billing]?.month_price;
      const price =
        typeof fromApi === 'number' && fromApi > 0
          ? fromApi
          : plan.defaultMonthPrice;
      return { ...plan, price };
    });
  }, [subscribePlans, effectivePricing]);

  const hasActivePlan =
    !!user?.tier?.current && user.tier.current !== 'FREE';

  const startCheckout = useCallback(
    (billing: SubscribeBillingTier, monthPrice: number) => async () => {
      if (!billingEnabled) {
        toast.show(
          t(
            'subscribe_billing_disabled',
            'Billing is not enabled on this server.'
          )
        );
        return;
      }

      setLoadingTier(billing);
      try {
        const { url, portal } = await (
          await fetch('/billing/subscribe', {
            method: 'POST',
            body: JSON.stringify({
              period: 'MONTHLY',
              utm,
              billing,
              ...(dub ? { dub } : {}),
            }),
          })
        ).json();

        if (url) {
          await track(TrackEnum.InitiateCheckout, { value: monthPrice });
          window.location.href = url;
          return;
        }

        if (portal) {
          window.open(portal);
        } else {
          toast.show(
            t(
              'subscribe_updated',
              'Subscription updated. Redirecting to your dashboard…'
            )
          );
          router.replace('/dashboard');
        }
      } catch {
        toast.show(
          t(
            'subscribe_checkout_failed',
            'Could not start checkout. Please try again.'
          )
        );
      } finally {
        setLoadingTier(null);
      }
    },
    [billingEnabled, dub, fetch, router, toast, track, utm, t]
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030303] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.35), transparent),
            radial-gradient(1px 1px at 80px 120px, rgba(255,255,255,0.2), transparent),
            radial-gradient(1px 1px at 160px 80px, rgba(255,255,255,0.25), transparent),
            radial-gradient(1px 1px at 240px 200px, rgba(255,255,255,0.15), transparent),
            radial-gradient(1px 1px at 320px 40px, rgba(255,255,255,0.3), transparent),
            radial-gradient(1px 1px at 400px 160px, rgba(255,255,255,0.2), transparent)
          `,
          backgroundSize: '420px 240px',
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40"
        aria-hidden
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <LogoTextComponent />
        <div className="flex items-center gap-3">
          {hasActivePlan && (
            <button
              type="button"
              onClick={() => router.push('/billing')}
              className="rounded-full border border-white/20 px-4 py-2 text-[13px] text-white/80 hover:bg-white/10"
            >
              Manage subscription
            </button>
          )}
          <LogoutComponent />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1200px] px-4 pb-16 pt-4 md:px-8 md:pt-8">
        <div className="mb-10 text-center md:mb-14">
          <h1 className="text-[28px] font-semibold tracking-tight text-white md:text-[34px]">
            {t('subscribe_choose_plan', 'Choose your plan')}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-white/50">
            {hasActivePlan
              ? t(
                  'subscribe_subtitle_active',
                  'You already have a plan. Use Billing to upgrade, downgrade, or cancel — or pick a different plan below.'
                )
              : t(
                  'subscribe_subtitle',
                  'Every plan includes a 7-day free trial. Stripe charges your selected plan when the trial ends. Cancel anytime from Billing.'
                )}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 md:gap-5 lg:gap-6">
          {plansWithPrices.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan}
              ctaLabel={ctaLabel}
              loading={loadingTier === plan.billing}
              onSelect={startCheckout(plan.billing, plan.price)}
            />
          ))}
        </div>
      </main>
    </div>
  );
};
