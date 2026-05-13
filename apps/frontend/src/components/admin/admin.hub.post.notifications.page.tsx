'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { AdminPage, AdminHero, AdminAlert } from '@gitroom/frontend/components/admin/admin.hub.ui';

type Contact = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  sendSuccessEmails: boolean;
  sendFailureEmails: boolean;
};

type NotificationRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  content: string;
  link: string | null;
  createdAt: string;
  updatedAt: string;
  organizationContacts: Contact[];
};

type ListResponse = {
  page: number;
  limit: number;
  total: number;
  scope: 'post' | 'all';
  items: NotificationRow[];
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminHubPostNotificationsPage() {
  const user = useUser();
  const fetch = useFetch();
  const isSuper = !!user?.isSuperAdmin;
  const [page, setPage] = useState(0);
  const [scope, setScope] = useState<'post' | 'all'>('post');
  const limit = 20;

  const load = useCallback(
    async (url: string) => (await fetch(url)).json(),
    [fetch]
  );

  const key = useMemo(
    () =>
      isSuper
        ? `/user/admin-post-notifications?page=${page}&limit=${limit}&scope=${scope}`
        : null,
    [isSuper, page, limit, scope]
  );

  const { data, error, isLoading } = useSWR<ListResponse>(key, load, {
    revalidateOnFocus: false,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  if (!isSuper) {
    return (
      <AdminPage>
        <AdminAlert variant="warning">This view is only available to super administrators.</AdminAlert>
      </AdminPage>
    );
  }

  if (error) {
    return (
      <AdminPage>
        <AdminAlert variant="error">
          Could not load notifications. Check that the backend is running.
        </AdminAlert>
      </AdminPage>
    );
  }

  return (
    <AdminPage className="space-y-6 pb-10">
      <AdminHero
        eyebrow="Activity feed"
        title="Post-related in-app notifications"
        description="Each row is an in-app notification for an organization, with team contacts and email digest preferences. By default we show items that look tied to publishing; switch to all if needed."
      >
        <div className="flex flex-wrap gap-2 w-full">
            <button
              type="button"
              onClick={() => {
                setScope('post');
                setPage(0);
              }}
              className={clsx(
                'rounded-full px-3.5 py-1.5 text-[12px] font-semibold border transition-all',
                scope === 'post'
                  ? 'bg-indigo-600 border border-white/25 text-white shadow-md shadow-black/25'
                  : 'border-white/[0.1] text-textItemBlur hover:text-newTextColor hover:bg-white/[0.05]'
              )}
            >
              Post-related
            </button>
            <button
              type="button"
              onClick={() => {
                setScope('all');
                setPage(0);
              }}
              className={clsx(
                'rounded-full px-3.5 py-1.5 text-[12px] font-semibold border transition-all',
                scope === 'all'
                  ? 'bg-indigo-600 border border-white/25 text-white shadow-md shadow-black/25'
                  : 'border-white/[0.1] text-textItemBlur hover:text-newTextColor hover:bg-white/[0.05]'
              )}
            >
              All notifications
            </button>
            <Link
              href="/adminisamazing/post-errors"
              className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold border border-white/[0.12] text-cyan-300/90 hover:bg-white/[0.05] transition-colors"
            >
              Post errors →
            </Link>
            <Link
              href="/adminisamazing/posts"
              className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold border border-white/[0.12] text-cyan-300/90 hover:bg-white/[0.05] transition-colors"
            >
              Browse posts →
            </Link>
          </div>
      </AdminHero>

      {isLoading || !data ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-newBgLineColor/70" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[13px] text-textItemBlur">
            <span>
              Showing{' '}
              <span className="text-newTextColor font-[600] tabular-nums">
                {data.items.length}
              </span>{' '}
              of{' '}
              <span className="text-newTextColor font-[600] tabular-nums">
                {data.total}
              </span>{' '}
              · page{' '}
              <span className="text-newTextColor font-[600] tabular-nums">
                {data.page + 1}
              </span>{' '}
              / {totalPages}
            </span>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] font-[600] disabled:opacity-40 hover:bg-newBgLineColor/40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] font-[600] disabled:opacity-40 hover:bg-newBgLineColor/40"
              >
                Next
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {data.items.map((row) => (
              <article
                key={row.id}
                className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-newBgColorInner/70 overflow-hidden shadow-lg shadow-black/25 ring-1 ring-white/[0.06]"
              >
                <div className="flex flex-col lg:flex-row lg:items-stretch divide-y lg:divide-y-0 lg:divide-x divide-newBgLineColor">
                  <div className="flex-1 min-w-0 p-4 sm:p-5 space-y-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-textItemBlur">
                      <span className="font-mono text-[11px] opacity-80">{row.id}</span>
                      <span className="tabular-nums">{formatWhen(row.createdAt)}</span>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-textItemBlur mb-1">
                        Organization
                      </p>
                      <p className="text-[15px] font-[700] text-newTextColor truncate">
                        {row.organizationName}
                      </p>
                      <p className="text-[11px] font-mono text-textItemBlur truncate mt-0.5">
                        {row.organizationId}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-textItemBlur mb-1">
                        Notification body
                      </p>
                      <div className="text-[13px] sm:text-[14px] text-newTextColor leading-relaxed whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto rounded-xl bg-newBgLineColor/25 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                        {row.content}
                      </div>
                    </div>
                    {row.link ? (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-textItemBlur mb-1">
                          Link
                        </p>
                        <a
                          href={row.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[13px] text-cyan-400 hover:underline break-all"
                        >
                          {row.link}
                        </a>
                      </div>
                    ) : null}
                  </div>
                  <aside className="lg:w-[300px] shrink-0 p-4 sm:p-5 bg-newBgLineColor/15">
                    <p className="text-[11px] uppercase tracking-wide text-textItemBlur mb-2">
                      Team (email prefs)
                    </p>
                    <ul className="space-y-2 max-h-[280px] overflow-y-auto">
                      {row.organizationContacts.length === 0 ? (
                        <li className="text-[12px] text-textItemBlur">No active members.</li>
                      ) : (
                        row.organizationContacts.map((c) => (
                          <li
                            key={c.userId}
                            className="rounded-lg bg-newBgColorInner/50 px-2.5 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                          >
                            <p className="text-[13px] font-[600] text-newTextColor truncate">
                              {c.name || c.email}
                            </p>
                            <p className="text-[11px] text-textItemBlur truncate">{c.email}</p>
                            <p className="text-[10px] mt-1 text-textItemBlur">
                              Role {c.role} · success mail{' '}
                              {c.sendSuccessEmails ? 'on' : 'off'} · failure mail{' '}
                              {c.sendFailureEmails ? 'on' : 'off'}
                            </p>
                          </li>
                        ))
                      )}
                    </ul>
                  </aside>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </AdminPage>
  );
}
