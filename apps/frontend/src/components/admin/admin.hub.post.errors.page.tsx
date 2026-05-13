'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  AdminPage,
  AdminHero,
  AdminAlert,
  AdminSurface,
  AdminButtonLink,
} from '@gitroom/frontend/components/admin/admin.hub.ui';

type ErrorItem = {
  id: string;
  message: string;
  platform: string;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
  organizationName: string;
  postId: string;
  bodyRaw: string;
  bodyParsed: unknown;
  post: {
    id: string;
    state: string;
    content: string;
    title: string | null;
    description: string | null;
    publishDate: string;
    releaseURL: string | null;
    storedError: string | null;
    createdAt: string;
    updatedAt: string;
    organizationId: string;
    integration: {
      id: string;
      name: string;
      providerIdentifier: string;
      disabled: boolean;
      refreshNeeded: boolean;
    } | null;
  };
};

type ListResponse = {
  page: number;
  limit: number;
  total: number;
  items: ErrorItem[];
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function humanizeState(state: string) {
  return state
    .split('_')
    .map((w) => (w ? w.charAt(0) + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function friendlyPlatform(platform: string) {
  const p = platform.trim();
  if (!p) return 'Unknown';
  return p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, ' ');
}

/** Short plain-language snippet from API JSON (for support staff). */
function summarizeParsedBody(body: unknown, maxLen: number): string | null {
  if (body == null) return null;
  if (typeof body === 'string') {
    const t = body.trim();
    if (!t) return null;
    return t.length > maxLen ? `${t.slice(0, maxLen).trim()}…` : t;
  }
  if (typeof body === 'object' && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    const keys = [
      'message',
      'error',
      'error_message',
      'detail',
      'description',
      'reason',
      'title',
    ];
    const parts: string[] = [];
    for (const key of keys) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) parts.push(v.trim());
    }
    if (!parts.length) return null;
    const joined = [...new Set(parts)].join(' — ');
    return joined.length > maxLen ? `${joined.slice(0, maxLen).trim()}…` : joined;
  }
  return null;
}

function JsonBlock({ value }: { value: unknown }) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <pre className="text-[11px] leading-snug font-mono text-newTextColor/90 whitespace-pre-wrap break-words max-h-[140px] overflow-auto rounded-lg bg-black/30 px-2.5 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
      {text}
    </pre>
  );
}

const detailsSummaryClass =
  'cursor-pointer select-none list-none text-[12px] font-semibold text-newTextColor hover:text-newTextColor/90 [&::-webkit-details-marker]:hidden flex items-center gap-2 px-2.5 py-2';
const detailsChevron =
  "inline-block size-1.5 border-r-2 border-b-2 border-current rotate-[-45deg] translate-y-px transition-transform group-open:rotate-[135deg] group-open:translate-y-0.5";

function AdminDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg bg-black/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
      <summary className={detailsSummaryClass}>
        <span className={detailsChevron} aria-hidden />
        {title}
      </summary>
      <div className="px-2.5 pb-2.5 pt-0 border-t border-white/[0.06]">{children}</div>
    </details>
  );
}

/** Long error text: show a short preview first; expand on click. */
function ExpandableText({
  text,
  previewChars,
  className,
}: {
  text: string;
  previewChars: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return null;
  const needsMore = trimmed.length > previewChars;
  const preview = needsMore
    ? `${trimmed.slice(0, previewChars).trimEnd()}…`
    : trimmed;
  return (
    <div className={className}>
      <p className="text-[14px] leading-snug text-newTextColor whitespace-pre-wrap break-words">
        {open ? trimmed : preview}
      </p>
      {needsMore ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 text-[12px] font-semibold text-cyan-400 hover:underline"
        >
          {open ? 'Show less' : 'Show full text'}
        </button>
      ) : null}
    </div>
  );
}

export function AdminHubPostErrorsPage() {
  const user = useUser();
  const fetch = useFetch();
  const isSuper = !!user?.isSuperAdmin;
  const [page, setPage] = useState(0);
  const limit = 20;

  const load = useCallback(async (url: string) => (await fetch(url)).json(), [fetch]);

  const key = useMemo(
    () => (isSuper ? `/user/admin-post-errors?page=${page}&limit=${limit}` : null),
    [isSuper, page, limit]
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
          Could not load publishing errors. Check that the app server is running, then try again.
        </AdminAlert>
      </AdminPage>
    );
  }

  return (
    <AdminPage className="space-y-4 pb-10">
      <AdminHero
        eyebrow="Support"
        title="Publishing errors"
        description="Each row is one failed send: when it happened, what the system said, and which customer workspace to check. Open “More context” only if you need the full message or link; use “Technical” for engineering."
      >
        <div className="flex flex-wrap gap-2">
          <AdminButtonLink href="/adminisamazing/post-notifications">← In-app alerts</AdminButtonLink>
          <AdminButtonLink href="/adminisamazing/posts">Browse posts</AdminButtonLink>
        </div>
      </AdminHero>

      {isLoading || !data ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-newBgLineColor/60" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[12px] text-textItemBlur">
            <p>
              <span className="text-newTextColor font-semibold tabular-nums">
                {data.total === 0
                  ? 'No errors'
                  : `${Math.min(data.page * data.limit + 1, data.total)}–${Math.min(
                      data.page * data.limit + data.items.length,
                      data.total
                    )} of ${data.total}`}
              </span>
              {data.total > 0 ? (
                <>
                  {' '}
                  · page {data.page + 1} of {totalPages}
                </>
              ) : null}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-lg border border-white/[0.1] px-3 py-1 text-[12px] font-semibold disabled:opacity-40 hover:bg-newBgLineColor/40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-white/[0.1] px-3 py-1 text-[12px] font-semibold disabled:opacity-40 hover:bg-newBgLineColor/40"
              >
                Next
              </button>
            </div>
          </div>

          {data.items.length === 0 ? (
            <AdminSurface className="text-[14px] text-textItemBlur">
              No publishing errors are stored yet, or none match this page.
            </AdminSurface>
          ) : (
            <div className="space-y-3">
              {data.items.map((row) => {
                const bodySummary = summarizeParsedBody(row.bodyParsed, 400);
                const integ = row.post.integration;
                const msgNorm = row.message.replace(/\s+/g, ' ').trim();
                const sumNorm = (bodySummary || '').replace(/\s+/g, ' ').trim();
                const showBodySummary =
                  sumNorm.length > 0 &&
                  msgNorm.slice(0, Math.min(120, msgNorm.length)) !==
                    sumNorm.slice(0, Math.min(120, sumNorm.length));
                const channelTip = integ
                  ? integ.disabled
                    ? 'Channel is turned off for this customer.'
                    : integ.refreshNeeded
                      ? 'Customer may need to reconnect this channel.'
                      : null
                  : null;

                return (
                  <AdminSurface key={row.id} className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-newTextColor tabular-nums">
                        {formatWhen(row.createdAt)}
                      </p>
                      <span className="rounded-full bg-newBgLineColor/45 px-2.5 py-0.5 text-[11px] font-semibold text-newTextColor">
                        {friendlyPlatform(row.platform)}
                      </span>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-textItemBlur mb-1">
                        What went wrong
                      </p>
                      <ExpandableText text={row.message} previewChars={220} />
                    </div>

                    <p className="text-[12px] text-textItemBlur">
                      <span className="text-newTextColor font-medium">{row.organizationName}</span>
                      {integ ? (
                        <>
                          {' · '}
                          <span className="text-newTextColor font-medium">{integ.name}</span>
                          <span className="text-textItemBlur/80"> ({integ.providerIdentifier})</span>
                        </>
                      ) : null}
                    </p>

                    {channelTip ? (
                      <p className="text-[11px] text-amber-200/90 leading-snug">{channelTip}</p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <Link
                        href={`/adminisamazing/posts/${row.postId}`}
                        className="text-[12px] font-semibold text-cyan-400 hover:underline"
                      >
                        Open post in admin →
                      </Link>
                      <span className="rounded-md bg-newBgLineColor/35 px-2 py-0.5 text-[11px] text-newTextColor">
                        {humanizeState(row.post.state)}
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <AdminDisclosure title="More context (full notes, link, post preview)">
                        <div className="mt-2 space-y-3 text-[12px]">
                          {showBodySummary && bodySummary ? (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-textItemBlur mb-1">
                                Extra from the provider / system
                              </p>
                              <ExpandableText text={bodySummary} previewChars={280} />
                            </div>
                          ) : null}

                          {row.post.storedError ? (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-textItemBlur mb-1">
                                Also saved on the post
                              </p>
                              <div className="rounded-md bg-amber-950/25 px-2.5 py-1.5 text-amber-100/95">
                                <ExpandableText text={row.post.storedError} previewChars={200} />
                              </div>
                            </div>
                          ) : null}

                          {row.post.releaseURL ? (
                            <p>
                              <span className="text-textItemBlur">Live: </span>
                              <a
                                href={row.post.releaseURL}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-400 break-all hover:underline"
                              >
                                Open on network
                              </a>
                            </p>
                          ) : null}

                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-textItemBlur mb-1">
                              Post text (preview)
                            </p>
                            <div className="max-h-[120px] overflow-y-auto rounded-md bg-black/20 px-2 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words text-newTextColor/90">
                              {(row.post.content || '—').length > 500
                                ? `${(row.post.content || '').slice(0, 500)}…`
                                : row.post.content || '—'}
                            </div>
                            <p className="text-[10px] text-textItemBlur mt-1">
                              Scheduled / run time: {formatWhen(row.post.publishDate)}
                            </p>
                          </div>
                        </div>
                      </AdminDisclosure>

                      <AdminDisclosure title="Technical — JSON & IDs (for engineers)">
                        <p className="text-[11px] text-textItemBlur mt-2 mb-1.5 leading-snug">
                          Copy IDs into a ticket, or share the JSON block with engineering.
                        </p>
                        <JsonBlock value={row.bodyParsed} />
                        <dl className="mt-2 grid gap-1.5 text-[11px] font-mono text-newTextColor/90 break-all">
                          <div>
                            <dt className="text-textItemBlur font-sans text-[10px] uppercase">Error id</dt>
                            <dd>{row.id}</dd>
                          </div>
                          <div>
                            <dt className="text-textItemBlur font-sans text-[10px] uppercase">Post id</dt>
                            <dd>{row.post.id}</dd>
                          </div>
                          <div>
                            <dt className="text-textItemBlur font-sans text-[10px] uppercase">Workspace id</dt>
                            <dd>{row.organizationId}</dd>
                          </div>
                          {integ ? (
                            <div>
                              <dt className="text-textItemBlur font-sans text-[10px] uppercase">Channel id</dt>
                              <dd>{integ.id}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </AdminDisclosure>
                    </div>
                  </AdminSurface>
                );
              })}
            </div>
          )}
        </>
      )}
    </AdminPage>
  );
}
