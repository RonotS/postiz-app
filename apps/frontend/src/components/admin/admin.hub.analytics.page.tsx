'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  AdminPage,
  AdminHero,
  AdminAlert,
  AdminSurface,
} from '@gitroom/frontend/components/admin/admin.hub.ui';

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function formatNum(n: number) {
  return nf.format(n);
}

function humanizeState(state: string) {
  return state
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function humanizeOrderStatus(status: string) {
  return humanizeState(status);
}

type PlatformAnalytics = {
  generatedAt: string;
  postAutoDms?: {
    total: number;
  };
  messages: {
    total: number;
    last7Days: number;
    last30Days: number;
    conversationGroups: number;
  };
  posts: {
    total: number;
    published: number;
    last7Days: number;
    byState: { state: string; count: number }[];
  };
  engagement: {
    commentsTotal: number;
    commentsLast30Days: number;
    notificationsTotal: number;
    notificationsLast30Days: number;
  };
  health: {
    errorsTotal: number;
    errorsLast7Days: number;
    errorsLast30Days: number;
  };
  platform: {
    integrationsConnected: number;
    webhooksTotal: number;
    mediaAssets: number;
    autoPostRulesTotal: number;
    autoPostRulesActive: number;
    plugsActive: number;
    aiAgentMessagesTotal: number;
    aiAgentThreadsTotal: number;
  };
  growth: {
    newUsersLast30Days: number;
    newOrganizationsLast30Days: number;
  };
  marketplace: {
    ordersTotal: number;
    ordersByStatus: { status: string; count: number }[];
  };
  leaders: {
    topOrganizationsByPosts: {
      organizationId: string;
      name: string;
      postCount: number;
    }[];
    topUsersByComments: {
      userId: string;
      email: string;
      name: string | null;
      commentCount: number;
    }[];
    topUsersByPosts: {
      userId: string;
      email: string;
      name: string | null;
      postCount: number;
    }[];
  };
};

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-gradient-to-b from-white/[0.05] to-newBgColorInner/90 p-3.5 sm:p-4 shadow-md transition-opacity duration-200 hover:opacity-[0.97]">
      <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-textItemBlur font-[600]">
        {label}
      </div>
      <div className="mt-1 text-xl sm:text-2xl font-[700] text-newTextColor tabular-nums truncate">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] text-textItemBlur leading-snug">{hint}</div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <AdminSurface className="h-full">
      <div className="mb-4 sm:mb-5">
        <h3 className="text-[16px] sm:text-[17px] font-bold text-newTextColor tracking-tight">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-1.5 text-[13px] text-textItemBlur max-w-[72ch] leading-relaxed">
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </AdminSurface>
  );
}

function PostsByStateBars({
  rows,
  total,
}: {
  rows: { state: string; count: number }[];
  total: number;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const pct = Math.round((row.count / max) * 100);
        return (
          <div key={row.state} className="min-w-0">
            <div className="flex justify-between gap-2 text-[13px] mb-1">
              <span className="text-newTextColor font-[500] truncate">
                {humanizeState(row.state)}
              </span>
              <span className="text-textItemBlur shrink-0 tabular-nums">
                {formatNum(row.count)}{' '}
                <span className="text-[11px] opacity-70">
                  ({total ? Math.round((row.count / total) * 100) : 0}%)
                </span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-newBgLineColor overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AdminHubAnalyticsPage() {
  const user = useUser();
  const fetch = useFetch();
  const isSuper = !!user?.isSuperAdmin;

  const load = async (path: string) => (await fetch(path)).json();

  const { data, error, isLoading } = useSWR<PlatformAnalytics>(
    isSuper ? '/user/admin-platform-analytics' : null,
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
          Platform analytics are only available to super administrators.
        </AdminAlert>
      </AdminPage>
    );
  }

  if (error) {
    return (
      <AdminPage>
        <AdminAlert variant="error">
          Could not load platform analytics. Confirm the backend is running and you still have super
          admin access.
        </AdminAlert>
      </AdminPage>
    );
  }

  if (isLoading || !data) {
    return (
      <AdminPage>
        <div className="animate-pulse space-y-4">
          <div className="h-32 rounded-2xl bg-newBgLineColor/70" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-newBgLineColor/60" />
            ))}
          </div>
        </div>
      </AdminPage>
    );
  }

  const postStateTotal = data.posts.byState.reduce((s, r) => s + r.count, 0);

  return (
    <AdminPage className="space-y-6 sm:space-y-8">
      <AdminHero
        eyebrow="Platform intelligence"
        title="Whole-site analytics"
        description={
          <>
            <p>
              X auto-DM sends (summed from post settings), in-app / marketplace messages, posts,
              comments, errors, orders, automations, and AI agent traffic — aggregated across every
              organization.
            </p>
            <p className="mt-3 text-[12px] text-textItemBlur/90 tabular-nums font-medium">
              Snapshot: {new Date(data.generatedAt).toLocaleString()}
            </p>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <StatCard
          label="DMs sent (X auto-DM)"
          value={formatNum(data.postAutoDms?.total ?? 0)}
          hint={`Total from post plug counter (auto_dm_sent_count). In-app messages: ${formatNum(data.messages.total)} · ${formatNum(data.messages.last7Days)} last 7d · ${formatNum(data.messages.last30Days)} last 30d`}
        />
        <StatCard
          label="Posts (all)"
          value={formatNum(data.posts.total)}
          hint={`${formatNum(data.posts.published)} published · ${formatNum(data.posts.last7Days)} new 7d`}
        />
        <StatCard
          label="Comments"
          value={formatNum(data.engagement.commentsTotal)}
          hint={`${formatNum(data.engagement.commentsLast30Days)} last 30d`}
        />
        <StatCard
          label="Notifications"
          value={formatNum(data.engagement.notificationsTotal)}
          hint={`${formatNum(data.engagement.notificationsLast30Days)} last 30d`}
        />
        <StatCard
          label="Post errors"
          value={formatNum(data.health.errorsTotal)}
          hint={`${formatNum(data.health.errorsLast7Days)} last 7d`}
        />
        <StatCard
          label="Conversations"
          value={formatNum(data.messages.conversationGroups)}
          hint="Buyer / seller DM threads"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        <Section
          title="Posts by lifecycle state"
          subtitle="Share of scheduled, queued, published, and failed content across the fleet."
        >
          <PostsByStateBars rows={data.posts.byState} total={postStateTotal} />
        </Section>

        <Section
          title="Marketplace orders"
          subtitle="UGC / order workflow volume by status."
        >
          <div className="flex flex-col gap-2.5">
            <div className="text-[13px] text-textItemBlur">
              Total orders:{' '}
              <span className="text-newTextColor font-[700] tabular-nums">
                {formatNum(data.marketplace.ordersTotal)}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {data.marketplace.ordersByStatus.map((row) => (
                <li
                  key={row.status}
                  className="flex justify-between gap-3 rounded-lg bg-newBgLineColor/40 px-3 py-2 text-[13px]"
                >
                  <span className="text-newTextColor">
                    {humanizeOrderStatus(row.status)}
                  </span>
                  <span className="font-[700] tabular-nums text-textItemBlur">
                    {formatNum(row.count)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      </div>

      <Section
        title="Infrastructure & automations"
        subtitle="Connected channels, media library, webhooks, plugs, autopost rules, and Copilot / Mastra usage."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <StatCard
            label="Integrations"
            value={formatNum(data.platform.integrationsConnected)}
            hint="Active social connections"
          />
          <StatCard label="Webhooks" value={formatNum(data.platform.webhooksTotal)} />
          <StatCard label="Media assets" value={formatNum(data.platform.mediaAssets)} />
          <StatCard
            label="Autopost rules"
            value={formatNum(data.platform.autoPostRulesActive)}
            hint={`${formatNum(data.platform.autoPostRulesTotal)} total configured`}
          />
          <StatCard label="Active plugs" value={formatNum(data.platform.plugsActive)} />
          <StatCard
            label="AI agent messages"
            value={formatNum(data.platform.aiAgentMessagesTotal)}
            hint="Mastra message rows"
          />
          <StatCard label="AI agent threads" value={formatNum(data.platform.aiAgentThreadsTotal)} />
          <StatCard
            label="New orgs (30d)"
            value={formatNum(data.growth.newOrganizationsLast30Days)}
            hint={`${formatNum(data.growth.newUsersLast30Days)} new users`}
          />
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Section
          title="Top organizations by posts"
          subtitle="Workspaces with the largest non-deleted post volume."
        >
          <div className="overflow-x-auto -mx-1 sm:mx-0 rounded-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] bg-black/10">
            <table className="w-full min-w-[320px] text-left text-[13px]">
              <thead className="bg-newBgLineColor/60 text-[11px] uppercase tracking-wide text-textItemBlur">
                <tr>
                  <th className="px-3 py-2 font-[700]">Organization</th>
                  <th className="px-3 py-2 font-[700] text-end">Posts</th>
                </tr>
              </thead>
              <tbody>
                {data.leaders.topOrganizationsByPosts.map((row, idx) => (
                  <tr
                    key={row.organizationId}
                    className="border-t border-white/[0.08] hover:bg-newBgLineColor/25"
                  >
                    <td className="px-3 py-2.5">
                      <span className="text-textItemBlur mr-2 tabular-nums">
                        {idx + 1}.
                      </span>
                      <span className="text-newTextColor font-[500] break-words">
                        {row.name}
                      </span>
                      <div className="text-[11px] text-textItemBlur font-mono truncate max-w-[220px] sm:max-w-none">
                        {row.organizationId}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-end font-[700] tabular-nums">
                      {formatNum(row.postCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="Top users by post reach"
          subtitle="Distinct posts in organizations the user belongs to (membership-weighted)."
        >
          <div className="overflow-x-auto -mx-1 sm:mx-0 rounded-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] bg-black/10">
            <table className="w-full min-w-[300px] text-left text-[13px]">
              <thead className="bg-newBgLineColor/60 text-[11px] uppercase tracking-wide text-textItemBlur">
                <tr>
                  <th className="px-3 py-2 font-[700]">User</th>
                  <th className="px-3 py-2 font-[700] text-end">Posts</th>
                </tr>
              </thead>
              <tbody>
                {data.leaders.topUsersByPosts.map((row, idx) => (
                  <tr
                    key={row.userId}
                    className="border-t border-white/[0.08] hover:bg-newBgLineColor/25"
                  >
                    <td className="px-3 py-2.5">
                      <span className="text-textItemBlur mr-2 tabular-nums">
                        {idx + 1}.
                      </span>
                      <div className="inline-block align-top">
                        <div className="text-newTextColor font-[500] break-all">
                          {row.email}
                        </div>
                        {row.name ? (
                          <div className="text-[12px] text-textItemBlur">
                            {row.name}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-end font-[700] tabular-nums">
                      {formatNum(row.postCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section
        title="Top users by comments"
        subtitle="Most active commenters across the platform (deleted comments excluded)."
      >
        <div className="overflow-x-auto rounded-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] bg-black/10">
          <table className="w-full min-w-[320px] text-left text-[13px]">
            <thead className="bg-newBgLineColor/60 text-[11px] uppercase tracking-wide text-textItemBlur">
              <tr>
                <th className="px-3 py-2 font-[700]">User</th>
                <th className="px-3 py-2 font-[700] text-end">Comments</th>
              </tr>
            </thead>
            <tbody>
              {data.leaders.topUsersByComments.map((row, idx) => (
                <tr
                  key={row.userId}
                  className="border-t border-white/[0.08] hover:bg-newBgLineColor/25"
                >
                  <td className="px-3 py-2.5">
                    <span className="text-textItemBlur mr-2 tabular-nums">
                      {idx + 1}.
                    </span>
                    <div className="inline-block align-top">
                      <div className="text-newTextColor font-[500] break-all">
                        {row.email}
                      </div>
                      {row.name ? (
                        <div className="text-[12px] text-textItemBlur">{row.name}</div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-end font-[700] tabular-nums">
                    {formatNum(row.commentCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <AdminSurface
        className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border border-dashed border-white/[0.12]"
        padding
      >
        <div>
          <div className="text-[15px] font-bold text-newTextColor">Organization-scoped analytics</div>
          <p className="text-[13px] text-textItemBlur mt-1.5 max-w-[52ch] leading-relaxed">
            Per-channel reach, integration charts, and post-level metrics remain in the main app for
            the selected workspace.
          </p>
        </div>
        <Link
          href="/analytics"
          className="shrink-0 inline-flex justify-center items-center rounded-xl px-5 py-2.5 text-[13px] font-bold bg-gradient-to-r from-violet-600 to-cyan-600 text-white hover:opacity-95 transition shadow-lg shadow-black/20"
        >
          Open org analytics
        </Link>
      </AdminSurface>
    </AdminPage>
  );
}
