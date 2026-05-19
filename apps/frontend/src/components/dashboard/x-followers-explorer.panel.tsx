'use client';

import {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { getActiveXIntegrations } from '@gitroom/frontend/components/layout/x-integration.util';
import {
  XProfilePickerIntegration,
  XProfileSingleSelect,
} from '@gitroom/frontend/components/launches/x-profile-picker.component';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import {
  ProfileAutomationsCard,
  ProfileAutomationsEmpty,
  ProfileAutomationsGhostButton,
  ProfileAutomationsPrimaryButton,
} from '@gitroom/frontend/components/dashboard/profile-automations.ui';

type FollowerUser = {
  id: string;
  name: string;
  username: string;
  picture?: string;
};

type BreadcrumbItem = {
  id: string;
  name: string;
  username: string;
};

type FollowersPageResponse = {
  subject: FollowerUser;
  users: FollowerUser[];
  nextToken?: string;
};

function FollowerSkeleton() {
  return (
    <div className="rounded-xl border border-newBorder/60 bg-newBgColor/40 p-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-newBgLineColor/80" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded-md bg-newBgLineColor/80" />
          <div className="h-2.5 w-16 rounded-md bg-newBgLineColor/60" />
        </div>
      </div>
    </div>
  );
}

function FollowerTile({
  user,
  selected,
  disabled,
  onToggle,
  onDrill,
}: {
  user: FollowerUser;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDrill: () => void;
}) {
  const t = useT();

  return (
    <article
      className={clsx(
        'group relative flex flex-col rounded-xl border transition-all duration-200',
        'bg-newBgColor/30 hover:bg-boxHover/80',
        selected
          ? 'border-btnPrimary/60 ring-2 ring-btnPrimary/25 shadow-sm shadow-btnPrimary/10'
          : 'border-newBorder/70 hover:border-newBorder'
      )}
    >
      <div className="flex items-start gap-3 p-3 sm:p-3.5">
        <label className="flex items-center pt-1 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-newBorder text-btnPrimary focus:ring-btnPrimary/30"
            checked={selected}
            onChange={onToggle}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()}
          />
        </label>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-start"
          onClick={onDrill}
          disabled={disabled}
        >
          <ImageWithFallback
            fallbackSrc="/no-picture.svg"
            src={user.picture || '/no-picture.svg'}
            className="h-11 w-11 shrink-0 rounded-full ring-2 ring-newBorder/50"
            alt=""
            width={44}
            height={44}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-newTextColor">
              {user.name}
            </p>
            <p className="truncate text-xs text-newTableText">
              @{user.username}
            </p>
          </div>
        </button>
      </div>
      <button
        type="button"
        onClick={onDrill}
        disabled={disabled}
        className={clsx(
          'mx-3 mb-3 mt-0 flex w-[calc(100%-1.5rem)] items-center justify-center gap-1 rounded-lg',
          'border border-dashed border-newBorder/80 py-1.5 text-[11px] font-medium text-newTableText',
          'transition-colors group-hover:border-btnPrimary/40 group-hover:text-btnPrimary',
          'disabled:opacity-50'
        )}
      >
        {t('view_their_followers', 'View their followers')}
        <span aria-hidden>→</span>
      </button>
    </article>
  );
}

export const XFollowersExplorerPanel: FC = () => {
  const t = useT();
  const toast = useToaster();
  const fetch = useFetch();

  const { data: integrations = [], isLoading: loadingIntegrations } = useSWR(
    '/integrations/list',
    async () => {
      const res = await fetch('/integrations/list');
      if (!res.ok) return [] as XProfilePickerIntegration[];
      const data = await res.json();
      return (data.integrations || []) as XProfilePickerIntegration[];
    },
    { revalidateOnFocus: false }
  );

  const xIntegrations = useMemo(
    () => getActiveXIntegrations(integrations),
    [integrations]
  );

  const [integrationId, setIntegrationId] = useState('');
  const [trail, setTrail] = useState<BreadcrumbItem[]>([]);
  const [users, setUsers] = useState<FollowerUser[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    if (!xIntegrations.length) {
      setIntegrationId('');
      return;
    }
    if (
      !integrationId ||
      !xIntegrations.some((i) => i.id === integrationId)
    ) {
      setIntegrationId(xIntegrations[0].id!);
    }
  }, [xIntegrations, integrationId]);

  const currentSubjectId = trail.length
    ? trail[trail.length - 1].id
    : undefined;

  const loadFollowers = useCallback(
    async (opts: {
      subjectUserId?: string;
      paginationToken?: string;
    }) => {
      if (!integrationId) return;
      const params = new URLSearchParams();
      if (opts.subjectUserId) {
        params.set('userId', opts.subjectUserId);
      }
      if (opts.paginationToken) {
        params.set('pagination_token', opts.paginationToken);
      }
      const qs = params.toString();
      const res = await fetch(
        `/integrations/${integrationId}/x-followers${qs ? `?${qs}` : ''}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const raw = err?.message;
        const msg = Array.isArray(raw)
          ? raw[0]
          : raw || err?.error || `Failed (${res.status})`;
        throw new Error(String(msg));
      }
      return (await res.json()) as FollowersPageResponse;
    },
    [integrationId, fetch]
  );

  const resetAndLoadRoot = useCallback(async () => {
    if (!integrationId) return;
    setLoading(true);
    setSelected(new Set());
    setTrail([]);
    setUsers([]);
    setNextToken(undefined);
    try {
      const page = await loadFollowers({});
      if (!page) return;
      const root = page.subject;
      setTrail([
        {
          id: root.id,
          name: root.name || root.username,
          username: root.username,
        },
      ]);
      setUsers(page.users);
      setNextToken(page.nextToken);
    } catch (e: any) {
      toast.show(e?.message || t('load_failed', 'Load failed'), 'warning');
    } finally {
      setLoading(false);
    }
  }, [integrationId, loadFollowers, t, toast]);

  useEffect(() => {
    if (integrationId) {
      void resetAndLoadRoot();
    }
  }, [integrationId]);

  const drillInto = useCallback(
    async (user: FollowerUser) => {
      setLoading(true);
      setSelected(new Set());
      try {
        const page = await loadFollowers({ subjectUserId: user.id });
        if (!page) return;
        setTrail((prev) => [
          ...prev,
          {
            id: user.id,
            name: user.name || user.username,
            username: user.username,
          },
        ]);
        setUsers(page.users);
        setNextToken(page.nextToken);
      } catch (e: any) {
        toast.show(e?.message || t('load_failed', 'Load failed'), 'warning');
      } finally {
        setLoading(false);
      }
    },
    [loadFollowers, t, toast]
  );

  const goToBreadcrumb = useCallback(
    async (index: number) => {
      const item = trail[index];
      if (!item) return;
      setLoading(true);
      setSelected(new Set());
      try {
        const page = await loadFollowers({
          subjectUserId: index === 0 ? undefined : item.id,
        });
        if (!page) return;
        setTrail(trail.slice(0, index + 1));
        setUsers(page.users);
        setNextToken(page.nextToken);
      } catch (e: any) {
        toast.show(e?.message || t('load_failed', 'Load failed'), 'warning');
      } finally {
        setLoading(false);
      }
    },
    [trail, loadFollowers, t, toast]
  );

  const loadMore = useCallback(async () => {
    if (!nextToken || !integrationId) return;
    setLoadingMore(true);
    try {
      const page = await loadFollowers({
        subjectUserId: currentSubjectId,
        paginationToken: nextToken,
      });
      if (!page) return;
      setUsers((prev) => {
        const seen = new Set(prev.map((u) => u.id));
        const added = page.users.filter((u) => !seen.has(u.id));
        return [...prev, ...added];
      });
      setNextToken(page.nextToken);
    } catch (e: any) {
      toast.show(e?.message || t('load_failed', 'Load failed'), 'warning');
    } finally {
      setLoadingMore(false);
    }
  }, [nextToken, integrationId, currentSubjectId, loadFollowers, t, toast]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === users.length) return new Set();
      return new Set(users.map((u) => u.id));
    });
  }, [users]);

  const massFollow = useCallback(async () => {
    if (!integrationId || selected.size === 0) return;
    setFollowing(true);
    try {
      const res = await fetch(`/integrations/${integrationId}/x-follow`, {
        method: 'POST',
        body: JSON.stringify({ userIds: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || `Failed (${res.status})`);
      }
      const ok = (data.succeeded || []).length;
      const fail = (data.failed || []).length;
      if (ok > 0) {
        toast.show(
          t('follow_success_count', 'Followed {{count}} account(s)', {
            count: ok,
          }),
          'success'
        );
      }
      if (fail > 0) {
        toast.show(
          t('follow_partial_fail', '{{count}} could not be followed', {
            count: fail,
          }),
          'warning'
        );
      }
      setSelected(new Set());
    } catch (e: any) {
      toast.show(e?.message || t('follow_failed', 'Follow failed'), 'warning');
    } finally {
      setFollowing(false);
    }
  }, [integrationId, selected, fetch, t, toast]);

  if (loadingIntegrations) {
    return (
      <ProfileAutomationsCard>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <FollowerSkeleton key={i} />
          ))}
        </div>
      </ProfileAutomationsCard>
    );
  }

  if (!xIntegrations.length) {
    return (
      <ProfileAutomationsEmpty variant="warning">
        {t(
          'connect_x_followers_explorer',
          'Connect an X account to browse followers and follow users.'
        )}
      </ProfileAutomationsEmpty>
    );
  }

  return (
    <div className="w-full min-w-0 flex flex-col gap-4 sm:gap-5">
      {xIntegrations.length > 1 && (
        <XProfileSingleSelect
          integrations={xIntegrations}
          selectedId={integrationId}
          onChange={setIntegrationId}
          disabled={loading || following}
        />
      )}

      <ProfileAutomationsCard noPadding className="overflow-hidden">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 border-b border-newBorder/80 bg-newBgColorInner/95 backdrop-blur-md px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {trail.length > 0 && (
                <nav
                  className="flex flex-wrap items-center gap-1.5"
                  aria-label="Breadcrumb"
                >
                  {trail.map((item, index) => (
                    <span key={item.id} className="flex items-center gap-1.5">
                      {index > 0 && (
                        <span className="text-newTableText/50 text-xs">/</span>
                      )}
                      <button
                        type="button"
                        className={clsx(
                          'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                          index === trail.length - 1
                            ? 'bg-btnPrimary/15 text-btnPrimary'
                            : 'text-newTableText hover:bg-boxHover hover:text-newTextColor'
                        )}
                        onClick={() => goToBreadcrumb(index)}
                        disabled={loading}
                      >
                        {index === 0
                          ? t('your_followers', 'Your followers')
                          : `@${item.username || item.name}`}
                      </button>
                    </span>
                  ))}
                </nav>
              )}
              {users.length > 0 && (
                <span className="rounded-lg bg-newBgColor/80 px-2.5 py-1 text-[11px] font-medium text-newTableText border border-newBorder/60">
                  {users.length}
                  {nextToken ? '+' : ''}{' '}
                  {t('followers_shown', 'shown')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {users.length > 0 && (
                <label className="inline-flex items-center gap-2 rounded-xl border border-newBorder/70 bg-newBgColor/40 px-3 py-2 text-xs text-newTableText cursor-pointer hover:bg-boxHover">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-newBorder text-btnPrimary"
                    checked={
                      users.length > 0 && selected.size === users.length
                    }
                    onChange={toggleSelectAll}
                    disabled={loading || following}
                  />
                  {t('select_all_on_page', 'Select all')}
                </label>
              )}
              {selected.size > 0 && (
                <ProfileAutomationsPrimaryButton
                  loading={following}
                  disabled={loading}
                  onClick={massFollow}
                  className="whitespace-nowrap"
                >
                  {t('follow_selected', 'Follow ({{count}})', {
                    count: selected.size,
                  })}
                </ProfileAutomationsPrimaryButton>
              )}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="p-4 sm:p-5 lg:p-6">
          {loading && users.length === 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <FollowerSkeleton key={i} />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-newBgColor/80 text-2xl border border-newBorder/60">
                ∅
              </div>
              <p className="text-sm font-medium text-newTextColor">
                {t('no_followers_found', 'No followers found')}
              </p>
              <p className="mt-1 text-xs text-newTableText max-w-sm">
                {t(
                  'no_followers_found_hint',
                  'This account may have no followers visible to the API, or the list is private.'
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {users.map((user) => (
                  <FollowerTile
                    key={user.id}
                    user={user}
                    selected={selected.has(user.id)}
                    disabled={loading || following}
                    onToggle={() => toggleSelect(user.id)}
                    onDrill={() => drillInto(user)}
                  />
                ))}
              </div>

              {nextToken && (
                <div className="mt-6 flex justify-center">
                  <ProfileAutomationsGhostButton
                    disabled={loadingMore || loading}
                    onClick={loadMore}
                  >
                    {loadingMore
                      ? t('loading', 'Loading...')
                      : t('load_more_followers', 'Load more followers')}
                  </ProfileAutomationsGhostButton>
                </div>
              )}
            </>
          )}
        </div>
      </ProfileAutomationsCard>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 sm:px-5 sm:py-4 text-xs sm:text-sm text-newTableText leading-relaxed">
        <p className="font-semibold text-newTextColor mb-1.5">
          {t('heads_up', 'Heads up')}
        </p>
        <ul className="list-disc space-y-1 ps-4">
          <li>
            {t(
              'follow_rate_limit_hint',
              'X limits how fast you can follow (about 50 per 15 minutes). Each request follows up to 25 accounts with a short delay between them.'
            )}
          </li>
          <li>
            {t(
              'follow_policy_hint',
              'Use mass follow carefully — aggressive following may trigger X restrictions on your account.'
            )}
          </li>
        </ul>
      </div>
    </div>
  );
};
