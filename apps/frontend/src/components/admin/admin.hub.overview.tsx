'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import {
  AdminPage,
  AdminHero,
  AdminSurface,
  AdminAlert,
  AdminButtonLink,
} from '@gitroom/frontend/components/admin/admin.hub.ui';

type AdminHubSummary = {
  totalUsers: number;
  totalOrganizations: number;
  superAdminCount: number;
  usersByProvider: { provider: string; count: number }[];
};

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-xl bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-4 flex flex-col gap-1 shadow-sm ring-1 ring-white/[0.06]">
    <div className="text-[11px] text-textItemBlur uppercase tracking-[0.14em] font-semibold">
      {label}
    </div>
    <div className="text-[26px] sm:text-[30px] font-bold text-newTextColor tabular-nums tracking-tight">
      {value}
    </div>
  </div>
);

export function AdminHubOverview() {
  const user = useUser();
  const fetch = useFetch();
  const { billingEnabled } = useVariables();
  const isSuper = !!user?.isSuperAdmin;

  const load = async (path: string) => (await fetch(path)).json();

  const { data: summary, error: summaryError } = useSWR<AdminHubSummary>(
    isSuper ? '/user/admin-hub-summary' : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const providerLabel = (p: string) => {
    if (p === 'LOCAL') return 'Email / password (LOCAL)';
    if (p === 'X') return 'X (Twitter)';
    return p;
  };

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Platform admin"
        title="Admin hub"
        description="Cross-tenant tools: analytics, users, post diagnostics, and billing shortcuts. The main app sidebar is hidden here—use Exit admin when you need the standard shell."
      />

      {!isSuper ? (
        <AdminAlert variant="warning">
          This account is not a platform super admin (
          <code className="text-[12px] opacity-90">User.isSuperAdmin</code>). Create a LOCAL
          login and set the flag in PostgreSQL using the steps below.
        </AdminAlert>
      ) : (
        <AdminAlert variant="success">
          Signed in with platform super admin access. Use the navigation on the left to move
          between sections.
        </AdminAlert>
      )}

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {isSuper && summary && !summaryError ? (
          <>
            <Stat label="Users" value={summary.totalUsers} />
            <Stat label="Organizations" value={summary.totalOrganizations} />
            <Stat label="Platform super admins" value={summary.superAdminCount} />
            <Stat
              label="Your sign-in provider"
              value={
                user?.providerName === 'LOCAL'
                  ? 'LOCAL'
                  : user?.providerName || '—'
              }
            />
          </>
        ) : isSuper && summaryError ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <AdminAlert variant="error">
              Could not load platform statistics. Check the network tab or backend logs.
            </AdminAlert>
          </div>
        ) : null}
      </div>

      {isSuper && summary?.usersByProvider?.length ? (
        <AdminSurface className="mt-8" padding>
          <h3 className="text-[15px] font-bold text-newTextColor">Users by auth provider</h3>
          <p className="mt-1 text-[13px] text-textItemBlur leading-relaxed max-w-[70ch]">
            Prefer LOCAL (email/password) for break-glass admin so access does not depend on a
            third party.
          </p>
          <ul className="mt-4 flex flex-col gap-0">
            {summary.usersByProvider.map((row) => (
              <li
                key={row.provider}
                className="flex justify-between gap-4 py-3 border-b border-white/[0.08] last:border-0 text-[14px]"
              >
                <span className="text-newTextColor/95">{providerLabel(row.provider)}</span>
                <span className="font-bold tabular-nums text-violet-200/95">{row.count}</span>
              </li>
            ))}
          </ul>
        </AdminSurface>
      ) : null}

      {isSuper ? (
        <AdminSurface className="mt-6" padding>
          <h3 className="text-[15px] font-bold text-newTextColor">Your session (current org)</h3>
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-textItemBlur font-semibold">
                Email
              </dt>
              <dd className="mt-1 text-newTextColor break-all">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-textItemBlur font-semibold">
                Workspace role
              </dt>
              <dd className="mt-1 text-newTextColor">{user?.role}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-textItemBlur font-semibold">
                Impersonating
              </dt>
              <dd className="mt-1 text-newTextColor">
                {user?.impersonate ? 'Yes (cookie set)' : 'No'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-textItemBlur font-semibold">
                Subscription tier
              </dt>
              <dd className="mt-1 text-newTextColor">
                {typeof user?.tier === 'object' &&
                user?.tier &&
                'current' in user.tier
                  ? String((user.tier as { current: string }).current)
                  : String(user?.tier ?? '—')}
              </dd>
            </div>
          </dl>
        </AdminSurface>
      ) : null}

      <AdminSurface className="mt-6" padding>
        <h3 className="text-[15px] font-bold text-newTextColor">
          Grant platform super admin (LOCAL user)
        </h3>
        <ol className="mt-4 list-decimal ps-5 flex flex-col gap-3 text-[14px] text-newTextColor/95 leading-relaxed">
          <li>
            Register with{' '}
            <Link href="/auth" className="text-cyan-400 font-semibold hover:underline">
              email and password
            </Link>{' '}
            (provider LOCAL).
          </li>
          <li>Complete activation from the email link if your instance sends it.</li>
          <li>
            In PostgreSQL, set platform super admin on that user:
            <pre className="mt-2 p-3 rounded-xl bg-black/35 text-[12px] overflow-x-auto whitespace-pre-wrap text-textItemBlur shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              {`UPDATE "User"
SET "isSuperAdmin" = true
WHERE email = 'you@yourcompany.com'
  AND "providerName" = 'LOCAL';`}
            </pre>
          </li>
          <li>
            For an X test user (not recommended for production break-glass):
            <pre className="mt-2 p-3 rounded-xl bg-black/35 text-[12px] overflow-x-auto whitespace-pre-wrap text-textItemBlur shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              {`UPDATE "User"
SET "isSuperAdmin" = true
WHERE email = 'AaronSanto73990@x.local'
  AND "providerName" = 'X';`}
            </pre>
          </li>
          <li>
            Sign out and back in so the session picks up <code className="text-[12px]">isSuperAdmin</code>,
            then open <span className="font-semibold">/adminisamazing</span>.
          </li>
        </ol>
        <p className="mt-4 text-[12px] text-textItemBlur leading-relaxed border-t border-white/[0.08] pt-4">
          Workspace roles (<code className="text-[11px]">UserOrganization.role</code>) manage one
          org. Platform super admin (<code className="text-[11px]">User.isSuperAdmin</code>) powers
          cross-tenant tools.
        </p>
      </AdminSurface>

      <AdminSurface className="mt-8" padding>
        <h3 className="text-[15px] font-bold text-newTextColor">Automation pages</h3>
        <p className="mt-1 text-[13px] text-textItemBlur leading-relaxed max-w-[70ch]">
          Preview coming-soon experiences in the main app. Use{' '}
          <Link href="/adminisamazing/automation-pages" className="text-cyan-400 font-semibold hover:underline">
            Automations
          </Link>{' '}
          to show or hide them in the sidebar for normal users (platform super admin always sees them when off).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <AdminButtonLink href="/dashboard/profile-automations">Profile automations</AdminButtonLink>
          <AdminButtonLink href="/dashboard/followers">Follow automations</AdminButtonLink>
          {isSuper ? (
            <AdminButtonLink href="/adminisamazing/automation-pages">Visibility settings</AdminButtonLink>
          ) : null}
        </div>
      </AdminSurface>

      <div className="mt-6 flex flex-wrap gap-2">
        <AdminButtonLink href="/adminisamazing/user-management">User management</AdminButtonLink>
        <AdminButtonLink href="/adminisamazing/analytics">Analytics</AdminButtonLink>
        <AdminButtonLink href="/adminisamazing/billing">Billing</AdminButtonLink>
        {!billingEnabled ? (
          <span className="self-center text-[12px] text-textItemBlur px-2">
            Billing UI may be limited without Stripe keys.
          </span>
        ) : null}
      </div>
    </AdminPage>
  );
}
