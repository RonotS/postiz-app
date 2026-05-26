'use client';

import useSWR from 'swr';
import { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { subscribePlanDisplayName } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscribe-plans.config';
import { isSubscribeBillingTier } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscribe-plans.config';
import {
  AdminPage,
  AdminHero,
  AdminSurface,
  AdminAlert,
  AdminBadgeYesNo,
  adminTable,
  adminTableWrap,
  adminTh,
  adminTr,
  adminTd,
} from '@gitroom/frontend/components/admin/admin.hub.ui';

type OrgMembership = {
  role: string;
  organizationId: string;
  organizationName: string;
  subscriptionTier: string;
  subscriptionPeriod: string | null;
  subscriptionCancelAt: string | null;
  subscriptionLifetime: boolean;
};

type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  providerName: string;
  activated: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  organizations: OrgMembership[];
};

const ADMIN_TIER_OPTIONS = [
  { value: 'FREE', label: 'Free' },
  { value: 'TEAM', label: 'Core (TEAM)' },
  { value: 'ULTIMATE', label: 'Pro (ULTIMATE)' },
  { value: 'PRO', label: 'Enterprise (PRO)' },
  { value: 'STANDARD', label: 'Standard (legacy)' },
] as const;

function formatTier(tier: string): string {
  if (tier === 'FREE') return 'Free';
  if (isSubscribeBillingTier(tier)) return subscribePlanDisplayName(tier);
  return tier;
}

function OrgTierEditor({
  org,
  onSaved,
}: {
  org: OrgMembership;
  onSaved: () => void;
}) {
  const fetch = useFetch();
  const toast = useToaster();
  const [tier, setTier] = useState(org.subscriptionTier || 'FREE');
  const [period, setPeriod] = useState<'MONTHLY' | 'YEARLY'>(
    (org.subscriptionPeriod as 'MONTHLY' | 'YEARLY') || 'MONTHLY'
  );
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `/user/admin-organization/${org.organizationId}/subscription`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier,
            ...(tier !== 'FREE' ? { period } : {}),
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to update tier');
      }
      toast.show(`Updated ${org.organizationName} → ${formatTier(tier)}`);
      onSaved();
    } catch (e: unknown) {
      toast.show(
        e instanceof Error ? e.message : 'Could not update subscription tier'
      );
    } finally {
      setSaving(false);
    }
  }, [fetch, onSaved, org.organizationId, org.organizationName, period, tier, toast]);

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      <div className="text-[11px] text-textItemBlur">
        Current: {formatTier(org.subscriptionTier)}
        {org.subscriptionLifetime ? ' · lifetime' : ''}
        {org.subscriptionCancelAt
          ? ` · cancel ${new Date(org.subscriptionCancelAt).toLocaleDateString()}`
          : ''}
      </div>
      <select
        className="rounded-md bg-black/30 border border-white/10 px-2 py-1.5 text-[12px] text-newTextColor"
        value={tier}
        onChange={(e) => setTier(e.target.value)}
      >
        {ADMIN_TIER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {tier !== 'FREE' && (
        <select
          className="rounded-md bg-black/30 border border-white/10 px-2 py-1.5 text-[12px] text-newTextColor"
          value={period}
          onChange={(e) =>
            setPeriod(e.target.value as 'MONTHLY' | 'YEARLY')
          }
        >
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Yearly</option>
        </select>
      )}
      <Button
        className="!text-[12px] !py-1.5"
        loading={saving}
        disabled={saving}
        onClick={save}
      >
        Save tier
      </Button>
      <p className="text-[10px] text-textItemBlur leading-snug">
        Admin override only — does not change Stripe. Use Billing admin for refunds.
      </p>
    </div>
  );
}

export function AdminHubUsersPage() {
  const user = useUser();
  const fetch = useFetch();
  const isSuper = !!user?.isSuperAdmin;

  const load = async (path: string) => (await fetch(path)).json();

  const { data: rows, error, mutate } = useSWR<AdminUserRow[]>(
    isSuper ? '/user/admin-users' : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  if (!isSuper) {
    return (
      <AdminPage>
        <AdminAlert variant="warning">
          User directory is restricted to platform super administrators.
        </AdminAlert>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Directory"
        title="User management"
        description={
          <>
            Recent accounts (newest first, up to 200). Set workspace{' '}
            <strong className="font-semibold">subscription tier</strong> per
            organization (admin override, no Stripe sync). Platform super ={' '}
            <code className="text-[12px]">User.isSuperAdmin</code>.
          </>
        }
      />

      {error ? (
        <AdminAlert variant="error">
          Failed to load users. Confirm you are still a platform super admin and
          the API is reachable.
        </AdminAlert>
      ) : !rows ? (
        <div className="flex flex-col gap-3 animate-pulse">
          <div className="h-12 rounded-xl bg-newBgLineColor/60" />
          <div className="h-64 rounded-2xl bg-newBgLineColor/50" />
        </div>
      ) : (
        <>
          <AdminSurface padding={false} className="overflow-hidden hidden lg:block">
            <div className={adminTableWrap}>
              <table className={`${adminTable} min-w-[960px]`}>
                <thead>
                  <tr>
                    <th className={adminTh}>Email</th>
                    <th className={adminTh}>Name</th>
                    <th className={adminTh}>Provider</th>
                    <th className={adminTh}>Active</th>
                    <th className={adminTh}>Platform super</th>
                    <th className={`${adminTh} min-w-[240px]`}>Workspaces & tier</th>
                    <th className={adminTh}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={adminTr}>
                      <td className={`${adminTd} break-all max-w-[220px] font-medium`}>
                        {r.email}
                      </td>
                      <td className={adminTd}>{r.name || '—'}</td>
                      <td className={`${adminTd} whitespace-nowrap`}>
                        <span className="rounded-md bg-newBgLineColor/50 px-2 py-0.5 text-[12px]">
                          {r.providerName}
                        </span>
                      </td>
                      <td className={adminTd}>
                        <AdminBadgeYesNo value={r.activated} />
                      </td>
                      <td className={adminTd}>
                        <AdminBadgeYesNo value={r.isSuperAdmin} />
                      </td>
                      <td className={`${adminTd} align-top text-[12px]`}>
                        {r.organizations?.length ? (
                          <ul className="space-y-4 max-w-[320px]">
                            {r.organizations.map((o) => (
                              <li
                                key={o.organizationId}
                                className="rounded-lg bg-black/20 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                              >
                                <div className="mb-2">
                                  <span className="font-semibold text-violet-200/95">
                                    {o.role}
                                  </span>
                                  <span className="text-textItemBlur"> · </span>
                                  <span className="text-textItemBlur break-words">
                                    {o.organizationName}
                                  </span>
                                </div>
                                <OrgTierEditor
                                  org={o}
                                  onSaved={() => mutate()}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-textItemBlur">—</span>
                        )}
                      </td>
                      <td
                        className={`${adminTd} whitespace-nowrap text-textItemBlur tabular-nums text-[12px]`}
                      >
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminSurface>

          <div className="lg:hidden space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-newBgColorInner/60 p-4 sm:p-5 space-y-3 shadow-md ring-1 ring-white/[0.06]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-newTextColor break-all">
                      {r.email}
                    </p>
                    {r.name ? (
                      <p className="mt-0.5 text-[13px] text-textItemBlur">{r.name}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-md bg-newBgLineColor/50 px-2 py-0.5 text-[11px] text-newTextColor">
                    {r.providerName}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[12px]">
                  <span className="inline-flex items-center gap-1.5 text-textItemBlur">
                    Active <AdminBadgeYesNo value={r.activated} />
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-textItemBlur">
                    Super <AdminBadgeYesNo value={r.isSuperAdmin} />
                  </span>
                </div>
                <p className="text-[11px] text-textItemBlur tabular-nums">
                  Created {new Date(r.createdAt).toLocaleString()}
                </p>
                <div className="border-t border-white/[0.08] pt-3 space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-textItemBlur">
                    Workspaces & tier
                  </p>
                  {r.organizations?.length ? (
                    <ul className="space-y-3">
                      {r.organizations.map((o) => (
                        <li
                          key={o.organizationId}
                          className="rounded-lg bg-black/20 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                        >
                          <div className="mb-2">
                            <span className="font-semibold text-violet-200/95">
                              {o.role}
                            </span>
                            <span className="text-textItemBlur"> · </span>
                            <span className="text-textItemBlur break-words">
                              {o.organizationName}
                            </span>
                          </div>
                          <OrgTierEditor org={o} onSaved={() => mutate()} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-textItemBlur text-[12px]">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AdminPage>
  );
}
