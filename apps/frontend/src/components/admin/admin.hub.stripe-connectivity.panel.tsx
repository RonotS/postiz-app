'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { AdminSurface, AdminAlert } from '@gitroom/frontend/components/admin/admin.hub.ui';
import {
  adminTable,
  adminTableWrap,
  adminTd,
  adminTh,
  adminTr,
} from '@gitroom/frontend/components/admin/admin.hub.ui';

export type PingResult = {
  ok: boolean;
  keyMode?: string;
  livemode?: boolean;
  currencies?: { currency: string; amount: number }[];
  message?: string;
  type?: string;
  adminTestCheckoutAmountCents?: number;
  stripeUsdCardMinimumNote?: string;
};

export type PricingRow = {
  tier: string;
  planName?: string;
  monthUsd: number;
  yearUsd: number;
  monthCents: number;
  yearCents: number;
  monthMeetsAppMinimum50c: boolean;
  yearMeetsAppMinimum50c: boolean;
};

export type PricingDiag = {
  minChargeNote: string;
  envOverride: string | null;
  tiers: PricingRow[];
};

type PromoRow = {
  id: string;
  code: string;
  active: boolean;
  timesRedeemed: number;
  maxRedemptions: number | null;
  couponName: string | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string | null;
};

type AdminStripeConnectivityPanelProps = {
  /** Super admin only — parent should still gate route access */
  isSuper: boolean;
  /**
   * When false, publishable key / customer billing may be off (e.g. POSTIZ_DISABLE_STRIPE_BILLING),
   * but server STRIPE_SECRET_KEY tests can still run.
   */
  billingEnabled: boolean;
  /** Duplicate promo table (billing page already has create + list when billing is on) */
  includePromoList?: boolean;
};

export function AdminStripeConnectivityPanel({
  isSuper,
  billingEnabled,
  includePromoList = false,
}: AdminStripeConnectivityPanelProps) {
  const fetch = useFetch();
  const toast = useToaster();
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get('result');

  const load = useCallback(async (path: string) => (await fetch(path)).json(), [fetch]);

  const { data: promos, mutate: mutatePromos } = useSWR<PromoRow[]>(
    isSuper && billingEnabled && includePromoList
      ? '/billing/stripe-admin/promotion-codes'
      : null,
    load,
    { revalidateOnFocus: false }
  );

  const [ping, setPing] = useState<PingResult | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [pricing, setPricing] = useState<PricingDiag | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutAmountCents, setCheckoutAmountCents] = useState('');

  const runPing = async () => {
    if (!isSuper) return;
    setPingLoading(true);
    try {
      const res = await fetch('/billing/stripe-admin/test/ping');
      const json = (await res.json()) as PingResult;
      setPing(json);
      if (!json.ok) {
        toast.show(json.message || 'Stripe ping failed', 'warning');
      } else {
        toast.show('Stripe API responded', 'success');
      }
    } catch (e) {
      toast.show(String(e), 'warning');
    } finally {
      setPingLoading(false);
    }
  };

  const runPricing = async () => {
    if (!isSuper) return;
    setPricingLoading(true);
    try {
      const res = await fetch('/billing/stripe-admin/test/pricing');
      if (!res.ok) {
        toast.show(await res.text(), 'warning');
        return;
      }
      const json = (await res.json()) as PricingDiag;
      setPricing(json);
    } catch (e) {
      toast.show(String(e), 'warning');
    } finally {
      setPricingLoading(false);
    }
  };

  const openTestCheckout = async () => {
    if (!isSuper) return;
    const trimmed = checkoutAmountCents.trim();
    const payload: { amountCents?: number } = {};
    if (trimmed !== '') {
      const n = Math.floor(Number(trimmed));
      if (!Number.isFinite(n) || n < 1) {
        toast.show(
          'Enter a positive whole number of US cents, or leave blank for the server default',
          'warning'
        );
        return;
      }
      payload.amountCents = n;
    }
    setCheckoutLoading(true);
    try {
      const res = await fetch('/billing/stripe-admin/test/checkout-50c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.show(
          (json as { message?: string }).message || res.statusText || 'Failed',
          'warning'
        );
        return;
      }
      const url = (json as { url?: string }).url;
      const charged = (json as { amountCents?: number }).amountCents;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.show(
          charged != null
            ? `Opening Stripe Checkout (${charged}¢)`
            : 'Opening Stripe Checkout in a new tab',
          'success'
        );
      }
    } catch (e) {
      toast.show(String(e), 'warning');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const checkoutBanner = useMemo(() => {
    if (checkoutResult === 'success') {
      return (
        <AdminAlert variant="info">
          Checkout completed (or returned success URL). Confirm payment in Stripe
          Dashboard → Payments. Session id (if present):{' '}
          <code className="text-[12px]">{searchParams.get('session_id') || '—'}</code>
        </AdminAlert>
      );
    }
    if (checkoutResult === 'cancel') {
      return (
        <AdminAlert variant="info">
          Checkout was cancelled; no charge should have been made.
        </AdminAlert>
      );
    }
    return null;
  }, [checkoutResult, searchParams]);

  if (!isSuper) {
    return null;
  }

  return (
    <>
      {checkoutBanner}

      {!billingEnabled && (
        <div className="mb-4">
          <AdminAlert variant="info">
            Customer billing UI is off (no publishable key or POSTIZ_DISABLE_STRIPE_BILLING).
            These tools still call your server, which uses STRIPE_SECRET_KEY — use them to
            verify Stripe before turning customer billing back on.
          </AdminAlert>
        </div>
      )}

      <AdminSurface className="flex flex-col gap-3" padding>
        <h2 className="text-[16px] font-semibold text-newTextColor">
          Stripe integration test
        </h2>
        <p className="text-[13px] text-textItemBlur leading-relaxed">
          <span className="font-medium text-newTextColor">1. API connectivity</span> — calls
          Stripe <code className="text-[12px]">balance.retrieve</code> (read-only). Confirms{' '}
          <code className="text-[12px]">STRIPE_SECRET_KEY</code> on the API.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button loading={pingLoading} onClick={runPing}>
            Run ping
          </Button>
        </div>
        {ping && (
          <pre className="text-[12px] overflow-x-auto rounded-lg border border-newBorder bg-newBgColorInner p-3 text-textItemBlur">
            {JSON.stringify(ping, null, 2)}
          </pre>
        )}
      </AdminSurface>

      <AdminSurface className="mt-6 flex flex-col gap-3" padding>
        <p className="text-[13px] text-textItemBlur leading-relaxed">
          <span className="font-medium text-newTextColor">
            2. Subscription plan prices vs 50¢ guard
          </span>{' '}
          — STANDARD / PRO <em>recurring subscription</em> amounts after env overrides. This is
          separate from <code className="text-[11px]">STRIPE_ADMIN_TEST_CHECKOUT_AMOUNT_CENTS</code>{' '}
          (section 3). “≥50¢” means that tier&apos;s line item meets this app&apos;s minimum for
          subscription billing, not your test Checkout amount.
        </p>
        <Button loading={pricingLoading} onClick={runPricing}>
          Load pricing diagnostics
        </Button>
        {pricing && (
          <>
            <p className="text-[12px] text-textItemBlur">{pricing.minChargeNote}</p>
            {pricing.envOverride && (
              <p className="text-[12px]">
                Override env:{' '}
                <code className="rounded bg-newBgColorInner px-1">{pricing.envOverride}</code>
              </p>
            )}
            <div className={adminTableWrap}>
              <table className={adminTable}>
                <thead>
                  <tr className={adminTr}>
                    <th className={adminTh}>Tier</th>
                    <th className={adminTh}>Monthly USD</th>
                    <th className={adminTh}>Monthly cents</th>
                    <th className={adminTh}>Sub ≥50¢</th>
                    <th className={adminTh}>Yearly USD</th>
                    <th className={adminTh}>Yearly cents</th>
                    <th className={adminTh}>Sub ≥50¢</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.tiers.map((row) => (
                    <tr key={row.tier} className={adminTr}>
                      <td className={adminTd}>
                        {row.planName ? (
                          <>
                            {row.planName}{' '}
                            <span className="text-textItemBlur font-mono text-[11px]">
                              ({row.tier})
                            </span>
                          </>
                        ) : (
                          row.tier
                        )}
                      </td>
                      <td className={adminTd}>{row.monthUsd}</td>
                      <td className={adminTd}>{row.monthCents}</td>
                      <td className={adminTd}>
                        {row.monthMeetsAppMinimum50c ? 'Yes' : 'No'}
                      </td>
                      <td className={adminTd}>{row.yearUsd}</td>
                      <td className={adminTd}>{row.yearCents}</td>
                      <td className={adminTd}>
                        {row.yearMeetsAppMinimum50c ? 'Yes' : 'No'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminSurface>

      <AdminSurface className="mt-6 flex flex-col gap-3" padding>
        <p className="text-[13px] text-textItemBlur leading-relaxed">
          <span className="font-medium text-newTextColor">
            3. One-time test Checkout (USD)
          </span>{' '}
          — separate from section 2. Amount comes from{' '}
          <code className="text-[11px]">STRIPE_ADMIN_TEST_CHECKOUT_AMOUNT_CENTS</code> on the API
          (or the field below), not from subscription tier prices. Stripe may still reject
          card payments under ~50¢ even when this app allows the amount.
        </p>
        {ping?.stripeUsdCardMinimumNote && (
          <p className="text-[12px] text-amber-200/90 leading-relaxed border border-amber-500/25 rounded-lg px-3 py-2 bg-amber-950/20">
            {ping.stripeUsdCardMinimumNote}
          </p>
        )}
        <label className="flex flex-col gap-1 text-[12px] text-textItemBlur max-w-[240px]">
          Amount (US cents, optional)
          <input
            className="rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-[14px] text-newTextColor"
            value={checkoutAmountCents}
            onChange={(e) => setCheckoutAmountCents(e.target.value.replace(/[^\d]/g, ''))}
            placeholder={
              ping?.adminTestCheckoutAmountCents != null
                ? String(ping.adminTestCheckoutAmountCents)
                : '50'
            }
            inputMode="numeric"
            autoComplete="off"
          />
          <span className="text-[11px] text-textItemBlur/80 font-normal">
            Stripe requires at least <strong className="text-newTextColor">50¢</strong> for this
            Checkout (USD). Use 50 or leave blank for the server default. Lower values return a
            clear error from the API — no backend restart needed.
          </span>
        </label>
        <Button loading={checkoutLoading} onClick={openTestCheckout}>
          Open test Checkout
        </Button>
      </AdminSurface>

      {includePromoList && billingEnabled && (
        <AdminSurface className="mt-6 flex flex-col gap-3" padding>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[16px] font-semibold text-newTextColor">
              4. Promotion codes (recent)
            </h2>
            <div className="flex gap-2">
              <Button secondary onClick={() => mutatePromos()}>
                Refresh list
              </Button>
              <Link
                href="/adminisamazing/billing"
                className="inline-flex items-center justify-center rounded-xl border border-newBorder px-4 py-2 text-[13px] font-semibold text-textItemBlur hover:bg-boxFocused"
              >
                Create codes →
              </Link>
            </div>
          </div>
          <div className={adminTableWrap}>
            <table className={adminTable}>
              <thead>
                <tr className={adminTr}>
                  <th className={adminTh}>Code</th>
                  <th className={adminTh}>Discount</th>
                  <th className={adminTh}>Duration · uses</th>
                  <th className={adminTh}>Active</th>
                </tr>
              </thead>
              <tbody>
                {(promos || []).slice(0, 25).map((p) => (
                  <tr key={p.id} className={adminTr}>
                    <td className={adminTd}>
                      <code className="text-[12px]">{p.code}</code>
                    </td>
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
                No codes yet — create one on Billing.
              </p>
            )}
          </div>
        </AdminSurface>
      )}
    </>
  );
}
