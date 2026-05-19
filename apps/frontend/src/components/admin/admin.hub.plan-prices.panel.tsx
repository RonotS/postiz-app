'use client';

import useSWR from 'swr';
import { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { AdminSurface } from '@gitroom/frontend/components/admin/admin.hub.ui';

type TierRow = {
  tier: string;
  month_price: number;
  year_price: number;
  default_month_price: number;
  default_year_price: number;
  isCustom: boolean;
};

type AdminPlanPricesResponse = {
  tiers: TierRow[];
  storagePath: string;
};

export function AdminHubPlanPricesPanel({ isSuper }: { isSuper: boolean }) {
  const fetch = useFetch();
  const toast = useToaster();
  const load = useCallback(async (path: string) => (await fetch(path)).json(), [fetch]);

  const { data, mutate } = useSWR<AdminPlanPricesResponse>(
    isSuper ? '/billing/stripe-admin/plan-prices' : null,
    load,
    { revalidateOnFocus: false }
  );

  const [rows, setRows] = useState<Record<string, { month: string; year: string }>>(
    {}
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.tiers) return;
    const next: Record<string, { month: string; year: string }> = {};
    for (const t of data.tiers) {
      next[t.tier] = {
        month: String(t.month_price),
        year: String(t.year_price),
      };
    }
    setRows(next);
  }, [data]);

  const save = async () => {
    if (!isSuper || !data?.tiers) return;
    const body: Record<string, { month_price: number; year_price: number }> = {};
    for (const t of data.tiers) {
      const r = rows[t.tier];
      if (!r) continue;
      const month = Number(r.month);
      const year = Number(r.year);
      if (!Number.isFinite(month) || !Number.isFinite(year)) {
        toast.show(`${t.tier}: enter valid monthly and yearly USD amounts`, 'warning');
        return;
      }
      body[t.tier] = { month_price: month, year_price: year };
    }
    setSaving(true);
    try {
      const res = await fetch('/billing/stripe-admin/plan-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.show(
          (json as { message?: string }).message || res.statusText || 'Failed to save',
          'warning'
        );
        return;
      }
      toast.show('Package prices saved — Stripe Checkout uses these amounts', 'success');
      await mutate();
    } finally {
      setSaving(false);
    }
  };

  if (!isSuper) return null;

  return (
    <AdminSurface className="mt-6 flex flex-col gap-4" padding>
      <div>
        <h2 className="text-[16px] font-semibold text-newTextColor">
          Package prices (USD)
        </h2>
        <p className="text-[13px] text-textItemBlur mt-1 leading-relaxed">
          Set monthly and yearly prices for each plan. These apply on the subscriber billing
          page and when creating Stripe subscription prices. Paid amounts must be at least{' '}
          <strong className="text-newTextColor">$0.50</strong> (Stripe minimum) or{' '}
          <strong className="text-newTextColor">$0</strong> for free tiers. Saved to{' '}
          <code className="text-[11px]">.data/billing-plan-prices.json</code> on the API server
          (override with <code className="text-[11px]">BILLING_PLAN_PRICES_FILE</code>).
        </p>
      </div>
      {data?.storagePath && (
        <p className="text-[11px] text-textItemBlur/80 break-all">
          Storage: {data.storagePath}
        </p>
      )}
      <div className="grid gap-4">
        {(data?.tiers || []).map((t) => (
          <div
            key={t.tier}
            className="rounded-xl border border-newBorder bg-newBgColorInner/50 p-4 flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-newTextColor">{t.tier}</span>
              {t.isCustom ? (
                <span className="text-[11px] rounded-full bg-violet-500/20 text-violet-200 px-2 py-0.5">
                  Custom
                </span>
              ) : (
                <span className="text-[11px] text-textItemBlur">Built-in default</span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[12px] text-textItemBlur">
                Monthly (USD)
                <input
                  className="rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-[14px] text-newTextColor"
                  value={rows[t.tier]?.month ?? ''}
                  onChange={(e) =>
                    setRows((prev) => ({
                      ...prev,
                      [t.tier]: {
                        ...prev[t.tier],
                        month: e.target.value.replace(/[^\d.]/g, ''),
                        year: prev[t.tier]?.year ?? String(t.year_price),
                      },
                    }))
                  }
                  inputMode="decimal"
                />
                <span className="text-[10px] font-normal">
                  Default ${t.default_month_price}
                </span>
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-textItemBlur">
                Yearly (USD)
                <input
                  className="rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-[14px] text-newTextColor"
                  value={rows[t.tier]?.year ?? ''}
                  onChange={(e) =>
                    setRows((prev) => ({
                      ...prev,
                      [t.tier]: {
                        month: prev[t.tier]?.month ?? String(t.month_price),
                        year: e.target.value.replace(/[^\d.]/g, ''),
                      },
                    }))
                  }
                  inputMode="decimal"
                />
                <span className="text-[10px] font-normal">
                  Default ${t.default_year_price}
                </span>
              </label>
            </div>
          </div>
        ))}
      </div>
      <Button loading={saving} onClick={save}>
        Save package prices
      </Button>
    </AdminSurface>
  );
}