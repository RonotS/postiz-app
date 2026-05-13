'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  AdminPage,
  AdminHero,
  AdminSurface,
  AdminAlert,
  AdminButtonLink,
} from '@gitroom/frontend/components/admin/admin.hub.ui';

type PlugField = {
  key: string;
  label: string;
  value: string;
  kind: 'bool' | 'number' | 'text';
};

type ActivePlug = {
  id: string;
  plugFunction: string;
  title: string;
  activated: boolean;
  fields: PlugField[];
  dataPreview: string | null;
};

function PlugFieldRow({ field }: { field: PlugField }) {
  if (field.kind === 'bool') {
    const on = field.value.toLowerCase() === 'true';
    return (
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-1 sm:gap-4 py-2.5 border-b border-white/[0.08] last:border-0">
        <dt className="text-[12px] text-textItemBlur leading-snug">{field.label}</dt>
        <dd className="sm:text-right">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-[700] ${
              on
                ? 'bg-emerald-500/20 text-emerald-200 border border-white/[0.12]'
                : 'bg-newBgLineColor/80 text-textItemBlur border border-white/[0.1]'
            }`}
          >
            {on ? 'Yes' : 'No'}
          </span>
        </dd>
      </div>
    );
  }

  if (field.kind === 'number') {
    return (
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-1 sm:gap-4 py-2.5 border-b border-white/[0.08] last:border-0">
        <dt className="text-[12px] text-textItemBlur leading-snug">{field.label}</dt>
        <dd className="text-[15px] font-[800] text-newTextColor tabular-nums sm:text-right">
          {field.value}
        </dd>
      </div>
    );
  }

  return (
    <div className="py-2.5 border-b border-white/[0.08] last:border-0 space-y-1">
      <dt className="text-[12px] text-textItemBlur">{field.label}</dt>
      <dd className="text-[13px] text-newTextColor leading-relaxed whitespace-pre-wrap break-words rounded-lg bg-black/20 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        {field.value || '—'}
      </dd>
    </div>
  );
}

function ActivePlugCard({ plug }: { plug: ActivePlug }) {
  return (
    <li className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-newBgColorInner/50 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.06] overflow-hidden">
      <div className="px-4 py-3 sm:px-5 border-b border-white/[0.08] bg-newBgLineColor/25">
        <h4 className="text-[14px] sm:text-[15px] font-[700] text-newTextColor leading-snug">
          {plug.title}
        </h4>
        <p className="text-[11px] text-textItemBlur mt-1 font-mono">
          Internal id: {plug.plugFunction}
        </p>
      </div>
      <div className="px-4 py-3 sm:px-5">
        {plug.fields.length === 0 ? (
          <p className="text-[13px] text-textItemBlur">No saved fields for this automation.</p>
        ) : (
          <dl>{plug.fields.map((f) => <PlugFieldRow key={`${plug.id}-${f.key}`} field={f} />)}</dl>
        )}
        {plug.dataPreview ? (
          <details className="mt-3 rounded-lg bg-black/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
            <summary className="cursor-pointer select-none px-3 py-2 text-[11px] text-textItemBlur hover:text-newTextColor">
              Technical: raw configuration (JSON)
            </summary>
            <pre className="px-3 pb-3 text-[10px] font-mono text-textItemBlur whitespace-pre-wrap break-words max-h-40 overflow-auto border-t border-white/[0.08]">
              {plug.dataPreview}
            </pre>
          </details>
        ) : null}
      </div>
    </li>
  );
}

export function AdminHubPostDetailPage({ postId }: { postId: string }) {
  const user = useUser();
  const fetch = useFetch();
  const isSuper = !!user?.isSuperAdmin;

  const load = useCallback(
    async (url: string) => (await fetch(url)).json(),
    [fetch]
  );

  const key = useMemo(
    () => (isSuper && postId ? `/user/admin-posts/${encodeURIComponent(postId)}` : null),
    [isSuper, postId]
  );

  const { data, error, isLoading } = useSWR(key, load, {
    revalidateOnFocus: false,
  });

  if (!isSuper) {
    return (
      <AdminPage>
        <AdminAlert variant="warning">
          This view is only available to super administrators.
        </AdminAlert>
      </AdminPage>
    );
  }

  if (error) {
    return (
      <AdminPage className="space-y-4">
        <AdminAlert variant="error">
          <p>Could not load this post. It may not exist or you may have lost access.</p>
        </AdminAlert>
        <AdminButtonLink href="/adminisamazing/posts">← Back to posts</AdminButtonLink>
      </AdminPage>
    );
  }

  if (isLoading || !data) {
    return (
      <AdminPage>
        <div className="animate-pulse space-y-4">
          <div className="h-44 rounded-2xl sm:rounded-3xl bg-newBgLineColor/70" />
          <div className="h-56 rounded-2xl bg-newBgLineColor/55" />
          <div className="h-72 rounded-2xl bg-newBgLineColor/45" />
        </div>
      </AdminPage>
    );
  }

  const d = data as {
    post?: Record<string, unknown> | null;
    organization?: Record<string, unknown> | null;
    integration?: Record<string, unknown> | null;
    teamMembers?: Record<string, unknown>[] | null;
    automation?: Record<string, unknown> | null;
    errors?: Record<string, unknown>[] | null;
  };

  const automation =
    d.automation && typeof d.automation === 'object'
      ? (d.automation as {
          activePlugsOnChannel?: ActivePlug[];
          xAutoDmEngagersPlugActive?: boolean;
          autoPostRules?: { id: string; title: string; active: boolean; url: string }[];
        })
      : undefined;

  const activePlugs = (automation?.activePlugsOnChannel ?? []) as ActivePlug[];

  const post = d.post && typeof d.post === 'object' ? (d.post as Record<string, unknown>) : null;
  if (!post) {
    return (
      <AdminPage className="space-y-4">
        <AdminAlert variant="error">
          <p>
            This post could not be loaded. The id may be wrong, the post may have been removed, or the
            server returned an incomplete response.
          </p>
        </AdminAlert>
        <AdminButtonLink href="/adminisamazing/posts">← Back to posts</AdminButtonLink>
      </AdminPage>
    );
  }

  const organization =
    d.organization && typeof d.organization === 'object'
      ? (d.organization as Record<string, unknown>)
      : {};
  const integration =
    d.integration && typeof d.integration === 'object'
      ? (d.integration as Record<string, unknown>)
      : {};
  const teamMembers = Array.isArray(d.teamMembers) ? d.teamMembers : [];
  const errors = Array.isArray(d.errors) ? d.errors : [];

  const orgName = organization.name != null ? String(organization.name) : '—';
  const channelLine =
    integration.name != null && String(integration.name).trim() !== ''
      ? `${String(integration.name)} (${String(integration.providerIdentifier ?? '')})`
      : 'No channel linked';

  return (
    <AdminPage className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <AdminButtonLink href="/adminisamazing/posts">← All posts</AdminButtonLink>
        <p className="text-[12px] font-mono text-textItemBlur break-all text-right sm:text-left">
          Post {postId}
        </p>
      </div>

      <AdminHero
        eyebrow="Post inspection"
        title={String(post.title || 'Untitled post')}
        description={
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-full border border-white/[0.12] bg-newBgLineColor/25 px-2.5 py-0.5 font-semibold text-newTextColor">
              {String(post.state ?? '—')}
            </span>
            <span className="text-newTextColor/85">{orgName}</span>
            <span className="text-textItemBlur">·</span>
            <span>{channelLine}</span>
          </div>
        }
      />

      <AdminSurface className="space-y-4">
        <h3 className="text-[13px] font-[800] uppercase tracking-wide text-newTextColor">
          Channel health
        </h3>
        <dl className="grid sm:grid-cols-2 gap-3 text-[13px]">
          <div className="rounded-xl bg-newBgLineColor/20 px-3 py-2">
            <dt className="text-[11px] text-textItemBlur">Channel disabled</dt>
            <dd className="font-[600]">{integration.disabled ? 'Yes' : 'No'}</dd>
          </div>
          <div className="rounded-xl bg-newBgLineColor/20 px-3 py-2">
            <dt className="text-[11px] text-textItemBlur">Reconnect needed</dt>
            <dd className="font-[600]">{integration.refreshNeeded ? 'Yes' : 'No'}</dd>
          </div>
          <div className="rounded-xl bg-newBgLineColor/20 px-3 py-2 sm:col-span-2">
            <dt className="text-[11px] text-textItemBlur">Integration id</dt>
            <dd className="font-mono text-[12px] break-all">{String(integration.id ?? '—')}</dd>
          </div>
        </dl>
      </AdminSurface>

      <AdminSurface className="space-y-4">
        <h3 className="text-[13px] font-[800] uppercase tracking-wide text-newTextColor">
          Auto-DM counter (same as queue)
        </h3>
        <p className="text-[12px] text-textItemBlur leading-relaxed">
          The queue shows “DMs sent” using a counter saved on this post. It goes up when the
          “auto-DM engagers” automation successfully sends DMs.
        </p>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[13px]">
          <div className="rounded-xl bg-violet-950/25 px-3 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
            <dt className="text-[11px] text-textItemBlur">DMs sent (stored)</dt>
            <dd className="font-[800] tabular-nums text-2xl text-newTextColor">
              {String(post.dmsSent ?? 0)}
            </dd>
          </div>
          <div className="rounded-xl bg-newBgLineColor/20 px-3 py-3">
            <dt className="text-[11px] text-textItemBlur">Auto-DM in composer</dt>
            <dd className="font-[700]">
              {(post as { autoDmEnabledInComposer?: boolean }).autoDmEnabledInComposer ? 'On' : 'Off'}
            </dd>
          </div>
        </dl>
      </AdminSurface>

      <AdminSurface className="space-y-4">
        <h3 className="text-[13px] font-[800] uppercase tracking-wide text-newTextColor">
          Channel automations (plugs)
        </h3>
        <p className="text-[12px] text-textItemBlur leading-relaxed max-w-[75ch]">
          These are the active automations tied to this channel (for example auto-comments or
          auto-DMs). Settings are shown in plain language; expand “Technical” only if you need
          the raw stored JSON.
        </p>
        <div className="rounded-xl bg-emerald-950/15 px-3 py-2.5 text-[13px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
          <span className="text-textItemBlur">Auto-DM engagers (database row): </span>
          <span className="font-[800] text-emerald-200">
            {automation?.xAutoDmEngagersPlugActive ? 'On' : 'Off'}
          </span>
        </div>
        <div>
          <p className="text-[12px] font-[600] text-newTextColor mb-3">What is running on this channel</p>
          {activePlugs.length === 0 ? (
            <p className="text-[13px] text-textItemBlur rounded-xl px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
              No active plugs for this channel.
            </p>
          ) : (
            <ul className="space-y-4">
              {activePlugs.map((pl) => (
                <ActivePlugCard key={pl.id} plug={pl} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[12px] font-[600] text-newTextColor mb-2">Scheduled autopost (organization)</p>
          <p className="text-[11px] text-textItemBlur mb-2 max-w-[70ch]">
            Separate from plugs: rules that pull content from a URL or RSS on a schedule.
          </p>
          <div className="overflow-x-auto rounded-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] bg-black/10">
            <table className="w-full text-left text-[12px] min-w-[480px]">
              <thead className="bg-newBgLineColor/35 text-textItemBlur uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2">Rule name</th>
                  <th className="px-3 py-2">Running</th>
                  <th className="px-3 py-2">Source URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08]">
                {(automation?.autoPostRules ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-[600]">{r.title}</td>
                    <td className="px-3 py-2">{r.active ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 font-mono text-[11px] max-w-[260px] truncate" title={r.url}>
                      {r.url}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AdminSurface>

      <AdminSurface className="space-y-4">
        <h3 className="text-[13px] font-[800] uppercase tracking-wide text-newTextColor">
          Team
        </h3>
        <p className="text-[12px] text-textItemBlur leading-relaxed max-w-[75ch]">
          <strong className="text-newTextColor/90 font-[600]">System role</strong> comes from the
          account record (<code className="text-[11px]">User.isSuperAdmin</code>) — the same flag
          as the{' '}
          <Link
            href="/adminisamazing/user-management"
            className="text-cyan-400 font-[600] hover:underline"
          >
            User management
          </Link>{' '}
          “Platform super” column. Workspace roles (org admin vs member) are not shown here.
        </p>
        <div className="overflow-x-auto rounded-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] bg-black/10">
          <table className="w-full text-left text-[12px] min-w-[640px]">
            <thead className="bg-newBgLineColor/35 text-textItemBlur uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">System role</th>
                <th className="px-3 py-2">Success / failure emails</th>
                <th className="px-3 py-2">Last online</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {teamMembers.map((m) => (
                <tr key={String(m.userId)}>
                  <td className="px-3 py-2">
                    <div className="font-[600]">{String(m.name || m.email)}</div>
                    <div className="text-[11px] text-textItemBlur">{String(m.email)}</div>
                  </td>
                  <td className="px-3 py-2">
                    {m.isPlatformSuperAdmin ? (
                      <span className="font-[700] text-violet-200">Platform super admin</span>
                    ) : (
                      <span className="text-newTextColor">Standard account</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.sendSuccessEmails ? 'On' : 'Off'} / {m.sendFailureEmails ? 'On' : 'Off'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-textItemBlur">{String(m.lastOnline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSurface>

      <AdminSurface className="space-y-3">
        <h3 className="text-[13px] font-[800] uppercase tracking-wide text-newTextColor">
          Post content & saved options
        </h3>
        <dl className="grid sm:grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-[11px] text-textItemBlur">Publish time</dt>
            <dd className="tabular-nums">{String(post.publishDate)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-textItemBlur">Thread replies (child posts)</dt>
            <dd className="font-[600]">{String(post.childrenCount)}</dd>
          </div>
        </dl>
        {post.lastMessage ? (
          <details className="rounded-xl bg-newBgLineColor/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
            <summary className="cursor-pointer px-3 py-2 text-[12px] text-textItemBlur hover:text-newTextColor">
              Linked message record (optional — usually from an in-app workflow)
            </summary>
            <pre className="px-3 pb-3 text-[11px] font-mono text-textItemBlur whitespace-pre-wrap break-words border-t border-white/[0.08]">
              {JSON.stringify(post.lastMessage, null, 2)}
            </pre>
          </details>
        ) : null}
        <div>
          <p className="text-[11px] text-textItemBlur mb-1">Post text</p>
          <div className="max-h-[220px] overflow-y-auto rounded-xl bg-black/25 px-3 py-2 text-[13px] whitespace-pre-wrap break-words shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
            {String(post.content)}
          </div>
        </div>
        <details className="rounded-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
          <summary className="cursor-pointer px-3 py-2 text-[12px] text-textItemBlur hover:text-newTextColor">
            Technical: full saved post settings (JSON)
          </summary>
          <pre className="text-[11px] font-mono leading-snug max-h-[220px] overflow-auto px-3 pb-3 whitespace-pre-wrap break-words border-t border-white/[0.08]">
            {JSON.stringify(post.settingsParsed, null, 2)}
          </pre>
        </details>
        {post.error ? (
          <div>
            <p className="text-[11px] text-textItemBlur mb-1">Last error on post</p>
            <p className="text-[13px] text-amber-200/90 whitespace-pre-wrap">{String(post.error)}</p>
          </div>
        ) : null}
        {post.releaseURL ? (
          <div>
            <p className="text-[11px] text-textItemBlur mb-1">Release URL</p>
            <a
              href={String(post.releaseURL)}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-cyan-400 break-all hover:underline"
            >
              {String(post.releaseURL)}
            </a>
          </div>
        ) : null}
      </AdminSurface>

      <AdminSurface className="space-y-3">
        <h3 className="text-[13px] font-[800] uppercase tracking-wide text-newTextColor">
          Publishing error log (this post)
        </h3>
        {errors.length === 0 ? (
          <p className="text-[13px] text-textItemBlur">No stored error rows for this post.</p>
        ) : (
          <ul className="space-y-3">
            {errors.map((e) => (
              <li key={String(e.id)} className="rounded-xl px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                <p className="text-[11px] text-textItemBlur tabular-nums">{String(e.createdAt)}</p>
                <p className="text-[13px] font-[600] mt-1">{String(e.message)}</p>
                <p className="text-[11px] text-textItemBlur mt-0.5">Platform: {String(e.platform)}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-textItemBlur hover:text-newTextColor">
                    Technical details
                  </summary>
                  <pre className="mt-1 text-[11px] font-mono max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/25 p-2">
                    {JSON.stringify(e.bodyParsed, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </AdminSurface>
    </AdminPage>
  );
}
