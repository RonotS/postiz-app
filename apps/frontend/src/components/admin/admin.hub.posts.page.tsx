'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { AdminPage, AdminHero, AdminAlert } from '@gitroom/frontend/components/admin/admin.hub.ui';

type PostListItem = {
  id: string;
  state: string;
  content: string;
  title: string | null;
  publishDate: string;
  releaseURL: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
  integrationId: string;
  parentPostId: string | null;
  intervalInDays: number | null;
  organization: { id: string; name: string };
  integration: {
    id: string;
    name: string;
    providerIdentifier: string;
    disabled: boolean;
  };
};

type ListResponse = {
  page: number;
  limit: number;
  total: number;
  search: string | null;
  items: PostListItem[];
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminHubPostsPage() {
  const user = useUser();
  const fetch = useFetch();
  const isSuper = !!user?.isSuperAdmin;
  const [page, setPage] = useState(0);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const limit = 25;

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(
    async (url: string) => (await fetch(url)).json(),
    [fetch]
  );

  const key = useMemo(() => {
    if (!isSuper) return null;
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (q) qs.set('q', q);
    return `/user/admin-posts?${qs.toString()}`;
  }, [isSuper, page, limit, q]);

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
        <AdminAlert variant="error">Could not load posts.</AdminAlert>
      </AdminPage>
    );
  }

  return (
    <AdminPage className="space-y-6 pb-10">
      <AdminHero
        eyebrow="Explorer"
        title="Posts"
        description="Search by post id fragment, body, title, or organization name. Open a row for plugs, autopost rules, and team context."
      >
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search…"
              className="w-full sm:max-w-md rounded-xl bg-black/25 px-3 py-2.5 text-[14px] text-newTextColor placeholder:text-textItemBlur focus:outline-none focus:ring-2 focus:ring-white/20 shadow-inner shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
            />
            <div className="flex flex-wrap gap-2">
              <Link
                href="/adminisamazing/post-notifications"
                className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold border border-white/[0.12] text-cyan-300/90 hover:bg-white/[0.05] transition-colors"
              >
                Notifications
              </Link>
              <Link
                href="/adminisamazing/post-errors"
                className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold border border-white/[0.12] text-cyan-300/90 hover:bg-white/[0.05] transition-colors"
              >
                Post errors
              </Link>
            </div>
          </div>
      </AdminHero>

      {isLoading || !data ? (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-newBgLineColor/70" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[13px] text-textItemBlur">
            <span>
              <span className="text-newTextColor font-[600] tabular-nums">
                {data.items.length}
              </span>{' '}
              of{' '}
              <span className="text-newTextColor font-[600] tabular-nums">
                {data.total}
              </span>
              {data.search ? (
                <>
                  {' '}
                  matching <span className="text-newTextColor font-[600]">{data.search}</span>
                </>
              ) : null}{' '}
              · page {data.page + 1} / {totalPages}
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

          <div className="hidden lg:block overflow-x-auto rounded-2xl bg-black/10 shadow-inner shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
            <table className="w-full text-left text-[13px] min-w-[900px]">
              <thead className="bg-newBgLineColor/40 text-[11px] uppercase tracking-wide text-textItemBlur">
                <tr>
                  <th className="px-4 py-3 font-[600]">When</th>
                  <th className="px-4 py-3 font-[600]">Org</th>
                  <th className="px-4 py-3 font-[600]">Channel</th>
                  <th className="px-4 py-3 font-[600]">State</th>
                  <th className="px-4 py-3 font-[600]">Preview</th>
                  <th className="px-4 py-3 font-[600] w-[100px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-newBgLineColor">
                {data.items.map((row) => (
                  <tr key={row.id} className="hover:bg-newBgLineColor/20 transition-colors">
                    <td className="px-4 py-3 align-top text-textItemBlur tabular-nums whitespace-nowrap">
                      {formatWhen(row.updatedAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-[600] text-newTextColor truncate max-w-[180px]">
                        {row.organization.name}
                      </p>
                      <p className="text-[11px] font-mono text-textItemBlur truncate max-w-[200px]">
                        {row.organizationId}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-newTextColor truncate max-w-[160px]">{row.integration.name}</p>
                      <p className="text-[11px] text-textItemBlur">
                        {row.integration.providerIdentifier}
                        {row.integration.disabled ? ' · off' : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top font-[600]">{row.state}</td>
                    <td className="px-4 py-3 align-top text-textItemBlur max-w-md">
                      <span className="line-clamp-2">{row.title || row.content}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/adminisamazing/posts/${row.id}`}
                        className="text-cyan-400 font-[600] hover:underline whitespace-nowrap"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {data.items.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-newBgColorInner/60 p-4 space-y-2 shadow-md ring-1 ring-white/[0.06]"
              >
                <div className="flex justify-between gap-2 text-[12px] text-textItemBlur">
                  <span className="tabular-nums">{formatWhen(row.updatedAt)}</span>
                  <span className="font-[600] text-newTextColor">{row.state}</span>
                </div>
                <p className="text-[14px] font-[700] text-newTextColor">{row.organization.name}</p>
                <p className="text-[12px] text-textItemBlur">
                  {row.integration.name} · {row.integration.providerIdentifier}
                </p>
                <p className="text-[13px] text-newTextColor/90 line-clamp-3">{row.title || row.content}</p>
                <Link
                  href={`/adminisamazing/posts/${row.id}`}
                  className="inline-block text-[13px] font-[600] text-cyan-400 hover:underline pt-1"
                >
                  Open detail →
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </AdminPage>
  );
}
