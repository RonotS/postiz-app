'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useCallback, useState } from 'react';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  AdminPage,
  AdminHero,
  AdminSurface,
  AdminAlert,
} from '@gitroom/frontend/components/admin/admin.hub.ui';
import { AdminStripeConnectivityPanel } from '@gitroom/frontend/components/admin/admin.hub.stripe-connectivity.panel';
import { AdminHubPlanPricesPanel } from '@gitroom/frontend/components/admin/admin.hub.plan-prices.panel';
import {
  adminTable,
  adminTableWrap,
  adminTd,
  adminTh,
  adminTr,
} from '@gitroom/frontend/components/admin/admin.hub.ui';

type PromoRow = {
  id: string;
  code: string;
  active: boolean;
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: number | null;
  couponName: string | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string | null;
};

export function AdminHubBillingPage() {
  const user = useUser();
  const fetch = useFetch();
  const toast = useToaster();
  const { billingEnabled } = useVariables();
  const isSuper = !!user?.isSuperAdmin;

  const load = useCallback(async (path: string) => (await fetch(path)).json(), []);

  const { data: promos, mutate } = useSWR<PromoRow[]>(
    isSuper && billingEnabled ? '/billing/stripe-admin/promotion-codes' : null,
    load,
    { revalidateOnFocus: false }
  );

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [percentOff, setPercentOff] = useState('');
  const [amountOffCents, setAmountOffCents] = useState('');
  const [duration, setDuration] = useState<'once' | 'repeating' | 'forever'>(
    'once'
  );
  const [durationInMonths, setDurationInMonths] = useState('3');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [saving, setSaving] = useState(false);

  const submitPromo = async () => {
    if (!isSuper) return;
    const pct = percentOff.trim() ? Number(percentOff) : undefined;
    const amt = amountOffCents.trim() ? Number(amountOffCents) : undefined;
    const body: Record<string, unknown> = {
      code: code.trim(),
      name: name.trim(),
      duration,
    };
    if (pct != null && !Number.isNaN(pct)) body.percentOff = Math.round(pct);
    if (amt != null && !Number.isNaN(amt)) body.amountOffCents = Math.round(amt);
    if (duration === 'repeating') {
      const m = Number(durationInMonths);
      if (!Number.isFinite(m) || m < 1) {
        toast.show('Enter duration in months (1–36) for repeating coupons', 'warning');
        return;
      }
      body.durationInMonths = m;
    }
    const maxR = maxRedemptions.trim() ? Number(maxRedemptions) : undefined;
    if (maxR != null && (!Number.isFinite(maxR) || maxR < 1)) {
      toast.show('Max uses must be a whole number ≥ 1, or leave blank for unlimited', 'warning');
      return;
    }
    if (maxR != null && Number.isFinite(maxR) && maxR >= 1) {
      body.maxRedemptions = Math.floor(maxR);
    }
    setSaving(true);
    try {
      const res = await fetch('/billing/stripe-admin/promotion-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.show(
          (err as { message?: string }).message || res.statusText || 'Failed',
          'warning'
        );
        return;
      }
      toast.show('Promotion code created in Stripe', 'success');
      setCode('');
      setName('');
      setPercentOff('');
      setAmountOffCents('');
      setMaxRedemptions('');
      await mutate();
    } finally {
      setSaving(false);
    }
  };

  if (!billingEnabled && isSuper) {
    return (
      <AdminPage>
        <AdminHero
          eyebrow="Commerce"
          title="Billing & subscriptions"
          description="Customer billing UI is hidden (no publishable key, or POSTIZ_DISABLE_STRIPE_BILLING). Use the Stripe tests below with your server secret key; turn off the disable flag and set keys to manage promotion codes here."
        />
        <AdminStripeConnectivityPanel
          isSuper={isSuper}
          billingEnabled={billingEnabled}
        />
        <AdminSurface className="mt-6" padding>
          <p className="text-[13px] text-textItemBlur mb-3">
            Organization plans and hosted Checkout live on the subscriber billing page when
            billing is enabled.
          </p>
          <Link
            href="/billing"
            className="inline-flex items-center justify-center rounded-xl border border-newBorder px-4 py-2 text-[13px] font-semibold text-textItemBlur hover:bg-boxFocused"
          >
            Open subscriber billing
          </Link>
        </AdminSurface>
      </AdminPage>
    );
  }

  if (!billingEnabled) {
    return (
      <AdminPage>
        <AdminHero
          eyebrow="Commerce"
          title="Billing & subscriptions"
          description="Stripe is not configured for this deployment."
        />
        <AdminAlert variant="info">
          Set Stripe keys in the environment to enable billing, coupons, and the
          customer checkout flow.
        </AdminAlert>
      </AdminPage>
    );
  }

  if (!isSuper) {
    return (
      <AdminPage>
        <AdminHero
          eyebrow="Commerce"
          title="Billing & subscriptions"
          description="Coupon management and Stripe tools are limited to platform super administrators."
        />
        <AdminSurface padding>
          <p className="text-[14px] text-textItemBlur leading-relaxed mb-4">
            You can still open the normal billing page for your organization.
          </p>
          <Link
            href="/billing"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-6 py-3 text-[14px] font-semibold text-white"
          >
            Open billing
          </Link>
        </AdminSurface>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Commerce"
        title="Billing & subscriptions"
        description="Set package prices (STANDARD, PRO, TEAM, ULTIMATE), run Stripe tests, and manage promotion codes. Paid subscription amounts must be at least $0.50 USD (Stripe minimum)."
      />

      <AdminHubPlanPricesPanel isSuper={isSuper} />

      <AdminStripeConnectivityPanel
        isSuper={isSuper}
        billingEnabled={billingEnabled}
      />

      <AdminSurface className="mt-6 flex flex-col gap-4" padding>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
          <p className="flex-1 text-[14px] text-textItemBlur leading-relaxed">
            Open the subscriber billing page (plans, hosted Checkout, portal).
          </p>
          <Link
            href="/billing"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-6 py-3 text-[14px] font-semibold text-white shadow-lg shadow-violet-900/30 hover:from-violet-500 hover:to-violet-400 transition-all"
          >
            Open billing
          </Link>
        </div>
      </AdminSurface>

      <AdminSurface className="mt-6 flex flex-col gap-4" padding>
        <h2 className="text-[16px] font-semibold text-newTextColor">
          New discount code
        </h2>
        <p className="text-[13px] text-textItemBlur">
          Fill either percent off (1–100) or amount off in USD cents (e.g. 500 =
          $5.00), not both. Optionally cap how many customers can redeem the
          code in total (Stripe promotion code max redemptions).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12px] text-textItemBlur">
            Code (customer types this)
            <input
              className="rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-[14px] text-newTextColor"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="LAUNCH10"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-textItemBlur">
            Label (Stripe coupon name)
            <input
              className="rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-[14px] text-newTextColor"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Launch week 10% off"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-textItemBlur">
            Percent off (optional)
            <input
              className="rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-[14px] text-newTextColor"
              value={percentOff}
              onChange={(e) => setPercentOff(e.target.value)}
              placeholder="10"
              inputMode="numeric"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-textItemBlur">
            Amount off in cents (optional)
            <input
              className="rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-[14px] text-newTextColor"
              value={amountOffCents}
              onChange={(e) => setAmountOffCents(e.target.value)}
              placeholder="500"
              inputMode="numeric"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-textItemBlur">
            Duration
            <select
              className="rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-[14px] text-newTextColor"
              value={duration}
              onChange={(e) =>
                setDuration(e.target.value as 'once' | 'repeating' | 'forever')
              }
            >
              <option value="once">Once</option>
              <option value="repeating">Repeating</option>
              <option value="forever">Forever</option>
            </select>
          </label>
          {duration === 'repeating' && (
            <label className="flex flex-col gap-1 text-[12px] text-textItemBlur">
              Months
              <input
                className="rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-[14px] text-newTextColor"
                value={durationInMonths}
                onChange={(e) => setDurationInMonths(e.target.value)}
                placeholder="3"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-[12px] text-textItemBlur sm:col-span-2">
            Max number of uses (optional)
            <input
              className="rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-[14px] text-newTextColor"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="Leave blank for unlimited"
              inputMode="numeric"
            />
            <span className="text-[11px] text-textItemBlur/80 font-normal">
              Total redemptions allowed across all customers (e.g. 100 for the
              first 100 checkouts).
            </span>
          </label>
        </div>
        <Button loading={saving} onClick={submitPromo}>
          Create in Stripe
        </Button>
      </AdminSurface>

      <AdminSurface className="mt-6 flex flex-col gap-3" padding>
        <h2 className="text-[16px] font-semibold text-newTextColor">
          Active promotion codes (recent)
        </h2>
        <div className={adminTableWrap}>
          <table className={adminTable}>
            <thead>
              <tr className={adminTr}>
                <th className={adminTh}>Code</th>
                <th className={adminTh}>Coupon</th>
                <th className={adminTh}>Discount</th>
                <th className={adminTh}>Duration · uses</th>
                <th className={adminTh}>Active</th>
              </tr>
            </thead>
            <tbody>
              {(promos || []).map((p) => (
                <tr key={p.id} className={adminTr}>
                  <td className={adminTd}>
                    <code className="text-[12px]">{p.code}</code>
                  </td>
                  <td className={adminTd}>{p.couponName || '—'}</td>
                  <td className={adminTd}>
                    {p.percentOff != null
                      ? `${p.percentOff}%`
                      : p.amountOff != null
                        ? `${(p.amountOff / 100).toFixed(2)} ${(p.currency || 'usd').toUpperCase()}`
                        : '—'}
                  </td>
                  <td className={adminTd}>
                    <div className="flex flex-col gap-0.5">
                      <span>{p.duration || '—'}</span>
                      <span className="text-[12px] text-textItemBlur">
                        {p.timesRedeemed}
                        {p.maxRedemptions != null
                          ? ` / ${p.maxRedemptions}`
                          : ' / unlimited'}
                      </span>
                    </div>
                  </td>
                  <td className={adminTd}>{p.active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {promos && promos.length === 0 && (
            <p className="py-4 text-center text-[13px] text-textItemBlur">
              No promotion codes returned (create one above).
            </p>
          )}
        </div>
      </AdminSurface>
    </AdminPage>
  );
}
