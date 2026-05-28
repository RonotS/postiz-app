'use client';

import {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { getActiveXIntegrations } from '@gitroom/frontend/components/layout/x-integration.util';
import { XProfilePickerIntegration } from '@gitroom/frontend/components/launches/x-profile-picker.component';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import {
  ProfileAutomationsCard,
  ProfileAutomationsEmpty,
  ProfileAutomationsGhostButton,
  ProfileAutomationsPrimaryButton,
} from '@gitroom/frontend/components/dashboard/profile-automations.ui';
import { XFollowRateLimitBanner } from '@gitroom/frontend/components/dashboard/x-follow-rate-limit-banner';
import { useXPlugBatchRateLimit } from '@gitroom/frontend/components/dashboard/use-x-plug-batch-rate-limit';
import { XPlugBatchRateLimitBanner } from '@gitroom/frontend/components/dashboard/x-plug-batch-rate-limit-banner';
import {
  useXFollowRateLimit,
  useXUnfollowRateLimit,
  X_FOLLOW_BATCH_MAX,
} from '@gitroom/frontend/components/dashboard/use-x-follow-rate-limit';
import {
  EngagementFilter,
  filterAndSortFollowers,
  FollowerListFilter,
  FollowerListSort,
  FollowerListUser,
  sortFromColumn,
  SpreadsheetColumn,
} from '@gitroom/frontend/components/dashboard/follower-list-filters';
import {
  loadExplorerListIds,
  toggleExplorerListId,
} from '@gitroom/frontend/components/dashboard/follower-explorer-lists';
import {
  applyFollowerPageCap,
  canGoToExplorerPage,
  canLoadMoreFollowers,
  EXPLORER_MAX_LOADED,
  EXPLORER_MAX_PAGES,
  EXPLORER_PAGE_SIZE,
  explorerListCountFromSubject,
  explorerTotalPagesFromListCount,
  mergeFollowerPages,
  XFollowersExplorerTable,
} from '@gitroom/frontend/components/dashboard/x-followers-explorer-table';
import { formatCompactCount } from '@gitroom/frontend/components/dashboard/follower-list-filters';
import { XFollowQueuePanel } from '@gitroom/frontend/components/dashboard/x-follow-queue.panel';
import { useXFollowQueue } from '@gitroom/frontend/components/dashboard/use-x-follow-queue';
import {
  DEFAULT_EXPLORER_ADVANCED_FILTERS,
  type ExplorerAdvancedFilters,
  countActiveAdvancedFilters,
} from '@gitroom/frontend/components/dashboard/follower-explorer-advanced-filters';
import { XFollowersExplorerFiltersPanel } from '@gitroom/frontend/components/dashboard/x-followers-explorer-filters.panel';

type FollowerUser = FollowerListUser;

type ListMode = 'followers' | 'following';

function explorerNavButtonClass(active: boolean) {
  return clsx(
    '!border !transition-colors',
    active
      ? '!border-btnPrimary !bg-btnPrimary/20 !text-btnPrimary font-semibold shadow-sm dark:!bg-btnPrimary/25'
      : '!border-gray-300 !bg-gray-200 !text-gray-900 dark:!border-newBorder dark:!bg-newBgLineColor dark:!text-newTextColor hover:!bg-gray-300 dark:hover:!bg-boxHover'
  );
}

type BreadcrumbItem = {
  id: string;
  name: string;
  username: string;
  picture?: string;
  publicMetrics?: FollowerUser['publicMetrics'];
};

function toBreadcrumbItem(user: FollowerUser): BreadcrumbItem {
  return {
    id: user.id,
    name: user.name || user.username,
    username: user.username,
    picture: user.picture,
    publicMetrics: user.publicMetrics,
  };
}

function SubjectProfileHeader({
  picture,
  title,
  username,
  meta,
}: {
  picture?: string;
  title: string;
  username?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ImageWithFallback
        fallbackSrc="/no-picture.svg"
        src={picture || '/no-picture.svg'}
        className="h-11 w-11 shrink-0 rounded-full border border-newBorder object-cover sm:h-12 sm:w-12"
        alt=""
        width={48}
        height={48}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-newTextColor sm:text-base">
          {title}
        </p>
        {(username || meta) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-newTableText">
            {username && <span className="truncate">@{username}</span>}
            {username && meta && (
              <span className="text-newTableText/50" aria-hidden>
                Â·
              </span>
            )}
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}

type FollowersPageResponse = {
  subject: FollowerUser;
  users: FollowerUser[];
  nextToken?: string;
};


type XFollowersExplorerPanelProps = {
  integrationId: string;
};

export const XFollowersExplorerPanel: FC<XFollowersExplorerPanelProps> = ({
  integrationId,
}) => {
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

  const [trail, setTrail] = useState<BreadcrumbItem[]>([]);
  const [users, setUsers] = useState<FollowerUser[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const usersRef = useRef<FollowerUser[]>([]);
  const nextTokenRef = useRef<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [listMode, setListMode] = useState<ListMode>('followers');
  const [listFilter, setListFilter] = useState<FollowerListFilter>('all');
  const [listSort, setListSort] = useState<FollowerListSort>('api');
  const [engagementFilter, setEngagementFilter] =
    useState<EngagementFilter>('all');
  const [tableSearch, setTableSearch] = useState('');
  const [hideWhitelisted, setHideWhitelisted] = useState(true);
  const [hideBlacklisted, setHideBlacklisted] = useState(true);
  const [advancedFilters, setAdvancedFilters] =
    useState<ExplorerAdvancedFilters>(DEFAULT_EXPLORER_ADVANCED_FILTERS);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [sortColumn, setSortColumn] = useState<SpreadsheetColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [whitelist, setWhitelist] = useState<Set<string>>(new Set());
  const [blacklist, setBlacklist] = useState<Set<string>>(new Set());

  const {
    rateLimit: followRateLimit,
    mutate: mutateFollowRateLimit,
    countdown: followCountdown,
    dailyCountdown: followDailyCountdown,
    atLimit: followAtLimit,
    remaining: followRemaining,
    limit: followLimit,
    windowMinutes: followWindowMinutes,
    dailyLimit: followDailyLimit,
    dailyRemaining: followDailyRemaining,
    limitedBy: followLimitedBy,
  } = useXFollowRateLimit(integrationId);

  const {
    rateLimit: unfollowRateLimit,
    mutate: mutateUnfollowRateLimit,
    countdown: unfollowCountdown,
    atLimit: unfollowAtLimit,
    remaining: unfollowRemaining,
    limit: unfollowLimit,
    windowMinutes: unfollowWindowMinutes,
  } = useXUnfollowRateLimit(integrationId);

  const {
    rateLimit: plugBatchLimit,
    countdown: plugBatchCountdown,
    pollMinutes: plugPollMinutes,
  } = useXPlugBatchRateLimit(integrationId);

  const followSlotsLeft = followAtLimit
    ? 0
    : followRateLimit?.daily
      ? Math.min(followRemaining, followDailyRemaining)
      : followRemaining;
  const unfollowSlotsLeft = unfollowAtLimit ? 0 : unfollowRemaining;

  const activeIntegration = useMemo(
    () => xIntegrations.find((i) => i.id === integrationId),
    [xIntegrations, integrationId]
  );

  const ownInternalId = useMemo(() => {
    const match = activeIntegration as
      | (XProfilePickerIntegration & { internalId?: string })
      | undefined;
    return match?.internalId;
  }, [activeIntegration]);

  const currentSubject = trail.length ? trail[trail.length - 1] : undefined;

  const viewingOwnFollowers = useMemo(() => {
    if (!currentSubject || !ownInternalId) return false;
    return String(currentSubject.id) === String(ownInternalId);
  }, [currentSubject, ownInternalId]);

  const followerFilterOpts = useMemo(
    () => ({
      engagement: engagementFilter,
      tableSearch,
      whitelist,
      blacklist,
      visibility: { hideWhitelisted, hideBlacklisted },
      advanced: advancedFilters,
    }),
    [
      engagementFilter,
      tableSearch,
      whitelist,
      blacklist,
      hideWhitelisted,
      hideBlacklisted,
      advancedFilters,
    ]
  );

  const displayUsers = useMemo(
    () => filterAndSortFollowers(users, listFilter, listSort, followerFilterOpts),
    [users, listFilter, listSort, followerFilterOpts]
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const sync = () => setFiltersCollapsed(!mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    nextTokenRef.current = nextToken;
  }, [nextToken]);

  const tablePageUsers = useMemo(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(displayUsers.length / EXPLORER_PAGE_SIZE)
    );
    const safePage = Math.min(tablePage, totalPages);
    return displayUsers.slice(
      (safePage - 1) * EXPLORER_PAGE_SIZE,
      safePage * EXPLORER_PAGE_SIZE
    );
  }, [displayUsers, tablePage]);

  useEffect(() => {
    setTablePage(1);
  }, [
    listFilter,
    listSort,
    engagementFilter,
    tableSearch,
    hideWhitelisted,
    hideBlacklisted,
    advancedFilters,
  ]);

  const patchAdvancedFilters = useCallback(
    (patch: Partial<ExplorerAdvancedFilters>) => {
      setAdvancedFilters((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const resetAdvancedFilters = useCallback(() => {
    setAdvancedFilters(DEFAULT_EXPLORER_ADVANCED_FILTERS);
  }, []);

  useEffect(() => {
    if (!integrationId) {
      setWhitelist(new Set());
      setBlacklist(new Set());
      return;
    }
    setWhitelist(loadExplorerListIds(integrationId, 'whitelist'));
    setBlacklist(loadExplorerListIds(integrationId, 'blacklist'));
  }, [integrationId]);

  const isUnfollowFilter = useMemo(
    () =>
      ['i_follow', 'low_engagement', 'inactive', 'low_followers'].includes(
        listFilter
      ),
    [listFilter]
  );

  const subjectHeader = useMemo(() => {
    if (!currentSubject) return null;
    if (viewingOwnFollowers && listMode === 'following' && activeIntegration) {
      return {
        picture: activeIntegration.picture,
        title: t('following_list', 'Following'),
        username: currentSubject.username,
      };
    }
    if (viewingOwnFollowers && activeIntegration) {
      return {
        picture: activeIntegration.picture,
        title: t('followers_list', 'Followers'),
        username: currentSubject.username,
      };
    }
    return {
      picture: currentSubject.picture,
      title: currentSubject.name,
      username: currentSubject.username,
    };
  }, [currentSubject, viewingOwnFollowers, activeIntegration, listMode, t]);

  const currentSubjectId = trail.length
    ? trail[trail.length - 1].id
    : undefined;

  const loadFollowers = useCallback(
    async (opts: {
      subjectUserId?: string;
      username?: string;
      paginationToken?: string;
      listMode?: ListMode;
    }) => {
      if (!integrationId) return;
      const mode = opts.listMode ?? listMode;
      const params = new URLSearchParams();
      if (opts.username?.trim()) {
        params.set('username', opts.username.trim().replace(/^@+/, ''));
      } else if (opts.subjectUserId) {
        params.set('userId', opts.subjectUserId);
      }
      if (opts.paginationToken) {
        params.set('pagination_token', opts.paginationToken);
      }
      if (mode === 'following') {
        params.set('list', 'following');
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
    [integrationId, fetch, listMode]
  );

  const applyFollowerPage = useCallback((page: FollowersPageResponse) => {
    const { users: cappedUsers, nextToken: token } = applyFollowerPageCap(
      page.users,
      page.nextToken
    );
    setUsers(cappedUsers);
    setNextToken(token);
    setLastLoadedAt(Date.now());
    const subjectItem = toBreadcrumbItem({
      ...page.subject,
      name: page.subject.name,
      username: page.subject.username,
      id: page.subject.id,
      picture: page.subject.picture,
      publicMetrics: page.subject.publicMetrics,
    } as FollowerUser);
    setTrail((prev) => {
      if (prev.length === 0) {
        return [subjectItem];
      }
      const last = prev[prev.length - 1];
      if (last?.id === subjectItem.id) {
        return [...prev.slice(0, -1), subjectItem];
      }
      return prev;
    });
  }, []);

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
      setTrail([toBreadcrumbItem(root)]);
      setTablePage(1);
      applyFollowerPage(page);
    } catch (e: any) {
      toast.show(e?.message || t('load_failed', 'Load failed'), 'warning');
    } finally {
      setLoading(false);
    }
  }, [integrationId, loadFollowers, applyFollowerPage, t, toast]);

  const searchByUsername = useCallback(async () => {
    const handle = searchQuery.trim().replace(/^@+/, '');
    if (!handle || !integrationId) {
      toast.show(
        t('enter_x_username', 'Enter an X username to search'),
        'warning'
      );
      return;
    }
    setLoading(true);
    setSelected(new Set());
    try {
      const page = await loadFollowers({ username: handle, listMode });
      if (!page) return;
      const subject = page.subject;
      setTrail([toBreadcrumbItem(subject)]);
      setSearchQuery(subject.username || handle);
      setTablePage(1);
      applyFollowerPage(page);
    } catch (e: any) {
      toast.show(e?.message || t('load_failed', 'Load failed'), 'warning');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, integrationId, loadFollowers, applyFollowerPage, t, toast]);

  const reloadCurrentSubjectList = useCallback(
    async (mode: ListMode) => {
      const subject = trail[trail.length - 1];
      if (!subject?.id || !integrationId) return;
      setLoading(true);
      setSelected(new Set());
      try {
        const page = await loadFollowers({
          subjectUserId: subject.id,
          listMode: mode,
        });
        if (!page) return;
        setListMode(mode);
        setTablePage(1);
        applyFollowerPage(page);
      } catch (e: any) {
        toast.show(e?.message || t('load_failed', 'Load failed'), 'warning');
      } finally {
        setLoading(false);
      }
    },
    [trail, integrationId, loadFollowers, applyFollowerPage, t, toast]
  );

  // Do not auto-load the connected account's followers — user searches a handle first.

  const drillInto = useCallback(
    async (user: FollowerUser) => {
      setLoading(true);
      setSelected(new Set());
      try {
        const page = await loadFollowers({
          subjectUserId: user.id,
          listMode: 'followers',
        });
        setListMode('followers');
        if (!page) return;
        setTrail((prev) => [...prev, toBreadcrumbItem(user)]);
        setTablePage(1);
        applyFollowerPage(page);
      } catch (e: any) {
        toast.show(e?.message || t('load_failed', 'Load failed'), 'warning');
      } finally {
        setLoading(false);
      }
    },
    [loadFollowers, applyFollowerPage, t, toast]
  );

  const goToBreadcrumb = useCallback(
    async (index: number) => {
      const item = trail[index];
      if (!item) return;
      setLoading(true);
      setSelected(new Set());
      try {
        const isOwnRoot =
          index === 0 &&
          !!ownInternalId &&
          String(item.id) === String(ownInternalId);
        const page = await loadFollowers(
          isOwnRoot ? {} : { subjectUserId: item.id }
        );
        if (!page) return;
        setTrail(trail.slice(0, index + 1));
        setTablePage(1);
        applyFollowerPage(page);
      } catch (e: any) {
        toast.show(e?.message || t('load_failed', 'Load failed'), 'warning');
      } finally {
        setLoading(false);
      }
    },
    [trail, loadFollowers, applyFollowerPage, t, toast, ownInternalId]
  );

  const breadcrumbLabel = useCallback(
    (item: BreadcrumbItem, index: number) => {
      if (
        index === 0 &&
        ownInternalId &&
        String(item.id) === String(ownInternalId)
      ) {
        return t('followers_list', 'Followers');
      }
      return `@${item.username || item.name}`;
    },
    [ownInternalId, t]
  );

  const fetchNextExplorerPage = useCallback(async (): Promise<boolean> => {
    if (
      !canLoadMoreFollowers(
        usersRef.current.length,
        nextTokenRef.current
      ) ||
      !integrationId
    ) {
      return false;
    }
    try {
      const page = await loadFollowers({
        subjectUserId: currentSubjectId,
        paginationToken: nextTokenRef.current,
      });
      if (!page) return false;
      let mergedResult: { users: FollowerUser[]; capped: boolean } | null =
        null;
      setUsers((prev) => {
        mergedResult = mergeFollowerPages(prev, page.users);
        usersRef.current = mergedResult.users;
        return mergedResult.users;
      });
      const hitCap =
        !!mergedResult &&
        (mergedResult.capped ||
          mergedResult.users.length >= EXPLORER_MAX_LOADED);
      const newToken = hitCap ? undefined : page.nextToken;
      setNextToken(newToken);
      nextTokenRef.current = newToken;
      if (hitCap) {
        toast.show(
          t(
            'explorer_cap_reached',
            'Loaded the maximum of {{max}} accounts for this view ({{pages}} pages at {{size}} per page).',
            {
              max: EXPLORER_MAX_LOADED.toLocaleString(),
              pages: EXPLORER_MAX_PAGES,
              size: EXPLORER_PAGE_SIZE,
            }
          ),
          'warning'
        );
      }
      return canLoadMoreFollowers(
        usersRef.current.length,
        nextTokenRef.current
      );
    } catch (e: any) {
      toast.show(e?.message || t('load_failed', 'Load failed'), 'warning');
      return false;
    }
  }, [integrationId, currentSubjectId, loadFollowers, t, toast]);

  const subjectListCount = useMemo(
    () => explorerListCountFromSubject(currentSubject, listMode),
    [currentSubject, listMode]
  );

  /** Display cap for list size (2.5k max); API still loads {{EXPLORER_PAGE_SIZE}} per request. */
  const explorerPulledLabel = useMemo(() => {
    if (subjectListCount != null && subjectListCount > 0) {
      return formatCompactCount(
        Math.min(subjectListCount, EXPLORER_MAX_LOADED)
      );
    }
    return formatCompactCount(Math.min(users.length, EXPLORER_MAX_LOADED));
  }, [subjectListCount, users.length]);

  const followerCountTitle = useMemo(() => {
    if (!currentSubject) return '';
    const user = currentSubject.username || currentSubject.name;
    const listLabel =
      listMode === 'following'
        ? t('following_list_lower', 'following')
        : t('followers_list_lower', 'followers');

    if (subjectListCount != null && subjectListCount > 0) {
      return t(
        'pulled_list_of_total',
        '@{{user}} — Pulled {{pulled}} {{list}} of {{total}} {{list}}',
        {
          user,
          pulled: explorerPulledLabel,
          total: formatCompactCount(subjectListCount),
          list: listLabel,
        }
      );
    }

    return t(
      'displaying_followers_title',
      "Displaying @{{user}}'s {{shown}} followers",
      {
        user,
        shown: formatCompactCount(displayUsers.length),
      }
    );
  }, [
    currentSubject,
    subjectListCount,
    listMode,
    explorerPulledLabel,
    displayUsers.length,
    t,
  ]);

  const explorerTotalPages = useMemo(
    () => explorerTotalPagesFromListCount(subjectListCount),
    [subjectListCount]
  );

  const canGoNextExplorerPage = useMemo(
    () =>
      canGoToExplorerPage(
        tablePage + 1,
        explorerTotalPages,
        users.length,
        nextToken
      ),
    [tablePage, explorerTotalPages, users.length, nextToken]
  );

  const handleExplorerPageChange = useCallback(
    async (targetPage: number) => {
      if (targetPage < 1) return;
      if (targetPage === tablePage) return;

      if (targetPage < tablePage) {
        setTablePage(targetPage);
        return;
      }

      if (
        !canGoToExplorerPage(
          targetPage,
          explorerTotalPages,
          usersRef.current.length,
          nextTokenRef.current
        )
      ) {
        return;
      }

      const needed = targetPage * EXPLORER_PAGE_SIZE;
      if (usersRef.current.length >= needed) {
        setTablePage(targetPage);
        return;
      }

      setLoadingMore(true);
      try {
        await fetchNextExplorerPage();
        const maxLoadedPage = Math.max(
          1,
          Math.ceil(usersRef.current.length / EXPLORER_PAGE_SIZE) || 1
        );
        setTablePage(Math.min(targetPage, maxLoadedPage));
      } finally {
        setLoadingMore(false);
      }
    },
    [tablePage, explorerTotalPages, fetchNextExplorerPage]
  );

  const markAsFollowing = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    setUsers((prev) =>
      prev.map((u) =>
        idSet.has(u.id) ? { ...u, alreadyFollowing: true } : u
      )
    );
  }, []);

  const markAsNotFollowing = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    setUsers((prev) =>
      prev.map((u) =>
        idSet.has(u.id) ? { ...u, alreadyFollowing: false } : u
      )
    );
  }, []);

  const selectedUsers = useMemo(
    () => users.filter((u) => selected.has(u.id)),
    [users, selected]
  );

  const selectedToFollow = useMemo(
    () => selectedUsers.filter((u) => !u.alreadyFollowing),
    [selectedUsers]
  );

  const selectedToUnfollow = useMemo(
    () => selectedUsers.filter((u) => u.alreadyFollowing),
    [selectedUsers]
  );

  const followableOnPage = useMemo(
    () => displayUsers.filter((u) => !u.alreadyFollowing),
    [displayUsers]
  );

  const unfollowableOnPage = useMemo(
    () => displayUsers.filter((u) => u.alreadyFollowing),
    [displayUsers]
  );

  const maxSelectableForFollow = useMemo(
    () => followableOnPage.length,
    [followableOnPage.length]
  );

  const maxSelectableForUnfollow = useMemo(
    () => Math.min(unfollowSlotsLeft, unfollowableOnPage.length),
    [unfollowSlotsLeft, unfollowableOnPage.length]
  );

  const cappedFollowableIds = useMemo(
    () => followableOnPage.map((u) => u.id),
    [followableOnPage]
  );

  const cappedUnfollowableIds = useMemo(
    () =>
      unfollowableOnPage.slice(0, maxSelectableForUnfollow).map((u) => u.id),
    [unfollowableOnPage, maxSelectableForUnfollow]
  );

  const idsToUnfollowNow = useMemo(
    () =>
      selectedToUnfollow
        .map((u) => u.id)
        .slice(0, Math.min(unfollowSlotsLeft, X_FOLLOW_BATCH_MAX)),
    [selectedToUnfollow, unfollowSlotsLeft]
  );

  useEffect(() => {
    if (unfollowSlotsLeft <= 0) return;
    setSelected((prev) => {
      const unfollowSelected = users.filter(
        (u) => u.alreadyFollowing && prev.has(u.id)
      );
      if (unfollowSelected.length <= unfollowSlotsLeft) return prev;
      const next = new Set(prev);
      unfollowSelected
        .slice(unfollowSlotsLeft)
        .forEach((u) => next.delete(u.id));
      return next;
    });
  }, [unfollowSlotsLeft, users]);

  const toggleSelect = useCallback(
    (id: string) => {
      const user = users.find((u) => u.id === id);
      setSelected((prev) => {
        if (prev.has(id)) {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }
        if (user?.alreadyFollowing) {
          const unfollowSelectedCount = users.filter(
            (u) => u.alreadyFollowing && prev.has(u.id)
          ).length;
          if (unfollowSelectedCount >= unfollowSlotsLeft) {
            toast.show(
              t(
                'x_unfollow_select_limit',
                'You can only select {{remaining}} more to unfollow in this {{minutes}}-minute window ({{count}}/{{limit}} used).',
                {
                  remaining: unfollowSlotsLeft,
                  minutes: unfollowWindowMinutes,
                  count: unfollowRateLimit?.count ?? unfollowLimit,
                  limit: unfollowLimit,
                }
              ),
              'warning'
            );
            return prev;
          }
        }
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    [
      users,
      followSlotsLeft,
      unfollowSlotsLeft,
      toast,
      t,
      followWindowMinutes,
      unfollowWindowMinutes,
      followRateLimit?.count,
      followRateLimit?.daily?.count,
      unfollowRateLimit?.count,
      followLimit,
      unfollowLimit,
      followDailyLimit,
    ]
  );

  const toggleSelectAll = useCallback(() => {
    if (isUnfollowFilter) {
      const unfollowableIds = unfollowableOnPage.map((u) => u.id);
      const allCappedSelected =
        cappedUnfollowableIds.length > 0 &&
        cappedUnfollowableIds.every((id) => selected.has(id));

      setSelected((prev) => {
        const next = new Set(prev);
        if (allCappedSelected) {
          unfollowableIds.forEach((id) => next.delete(id));
        } else {
          unfollowableIds.forEach((id) => next.delete(id));
          cappedUnfollowableIds.forEach((id) => next.add(id));
        }
        return next;
      });
      return;
    }

    const followableIds = followableOnPage.map((u) => u.id);
    const allCappedSelected =
      cappedFollowableIds.length > 0 &&
      cappedFollowableIds.every((id) => selected.has(id));

    setSelected((prev) => {
      const next = new Set(prev);
      if (allCappedSelected) {
        followableIds.forEach((id) => next.delete(id));
      } else {
        followableIds.forEach((id) => next.delete(id));
        cappedFollowableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [
    isUnfollowFilter,
    unfollowableOnPage,
    cappedUnfollowableIds,
    followableOnPage,
    cappedFollowableIds,
    selected,
  ]);

  const runBulkAction = useCallback(
    async (
      endpoint: 'x-follow' | 'x-unfollow',
      userIds: string[],
      onSuccess: (succeeded: string[]) => void,
      messages: {
        success: (count: number) => string;
        partialFail: (count: number) => string;
        fail: string;
      }
    ) => {
      if (!integrationId || userIds.length === 0) return;
      setActionLoading(true);
      try {
        const res = await fetch(`/integrations/${integrationId}/${endpoint}`, {
          method: 'POST',
          body: JSON.stringify({ userIds }),
        });
        const data = await res.json().catch(() => ({}));
        const payload =
          data?.message && typeof data.message === 'object'
            ? data.message
            : data;
        if (payload?.rateLimit) {
          if (endpoint === 'x-follow') {
            void mutateFollowRateLimit(payload.rateLimit, {
              revalidate: false,
            });
          } else {
            void mutateUnfollowRateLimit(payload.rateLimit, {
              revalidate: false,
            });
          }
        }
        if (!res.ok) {
          const raw = data?.message;
          const minutes =
            endpoint === 'x-unfollow'
              ? unfollowWindowMinutes
              : followWindowMinutes;
          const msg =
            typeof raw === 'string'
              ? raw
              : payload?.message ||
                (res.status === 429
                  ? endpoint === 'x-unfollow'
                    ? t(
                        'x_unfollow_limit_blocked',
                        'Unfollow limit reached for this {{minutes}}-minute window. Try again when the timer resets.',
                        { minutes }
                      )
                    : typeof payload?.message === 'string'
                      ? payload.message
                      : t(
                          'x_follow_limit_blocked',
                          'Follow limit reached. Try again when the timer resets.'
                        )
                  : `Failed (${res.status})`);
          throw new Error(String(msg));
        }
        const succeededIds: string[] = data.succeeded || [];
        const fail = (data.failed || []).length;
        if (succeededIds.length > 0) {
          onSuccess(succeededIds);
          toast.show(messages.success(succeededIds.length), 'success');
        }
        if (fail > 0) {
          toast.show(messages.partialFail(fail), 'warning');
        }
        setSelected((prev) => {
          const next = new Set(prev);
          succeededIds.forEach((id) => next.delete(id));
          return next;
        });
      } catch (e: any) {
        toast.show(e?.message || messages.fail, 'warning');
      } finally {
        setActionLoading(false);
      }
    },
    [
      integrationId,
      fetch,
      toast,
      mutateFollowRateLimit,
      mutateUnfollowRateLimit,
      t,
      followWindowMinutes,
      unfollowWindowMinutes,
    ]
  );

  const { mutate: mutateFollowQueue } = useXFollowQueue(integrationId);

  const enqueueFollowUsers = useCallback(
    async (
      users: Array<{ id: string; username?: string; name?: string }>
    ): Promise<{ added: number; skipped: number } | null> => {
      if (!integrationId || users.length === 0) {
        return { added: 0, skipped: 0 };
      }
      const res = await fetch(
        `/integrations/${integrationId}/x-follow-queue`,
        {
          method: 'POST',
          body: JSON.stringify({
            entries: users.map((u) => ({
              targetUserId: u.id,
              targetUsername: u.username,
              targetName: u.name,
            })),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raw = data?.message;
        throw new Error(
          typeof raw === 'string' ? raw : `Failed (${res.status})`
        );
      }
      void mutateFollowQueue(data.status, { revalidate: false });
      void mutateFollowRateLimit(data.status?.rateLimit, {
        revalidate: false,
      });
      return {
        added: data.added ?? users.length,
        skipped: data.skipped ?? 0,
      };
    },
    [integrationId, fetch, mutateFollowQueue, mutateFollowRateLimit]
  );

  const followUserIdsChunk = useCallback(
    async (
      userIds: string[]
    ): Promise<{ succeededIds: string[]; failed: number } | null> => {
      if (!integrationId || userIds.length === 0) {
        return { succeededIds: [], failed: 0 };
      }
      const res = await fetch(`/integrations/${integrationId}/x-follow`, {
        method: 'POST',
        body: JSON.stringify({ userIds }),
      });
      const data = await res.json().catch(() => ({}));
      const payload =
        data?.message && typeof data.message === 'object'
          ? data.message
          : data;
      if (payload?.rateLimit) {
        void mutateFollowRateLimit(payload.rateLimit, { revalidate: false });
      }
      if (!res.ok) {
        const raw = data?.message;
        const msg =
          typeof raw === 'string'
            ? raw
            : payload?.message ||
              (res.status === 429
                ? typeof payload?.message === 'string'
                  ? payload.message
                  : t(
                      'x_follow_limit_blocked',
                      'Follow limit reached. Try again when the timer resets.'
                    )
                : `Failed (${res.status})`);
        throw new Error(String(msg));
      }
      return {
        succeededIds: data.succeeded || [],
        failed: (data.failed || []).length,
      };
    },
    [integrationId, fetch, mutateFollowRateLimit, t]
  );

  const queueSelectedFollows = useCallback(async () => {
    if (!integrationId || selectedToFollow.length === 0) return;
    setActionLoading(true);
    try {
      const result = await enqueueFollowUsers(selectedToFollow);
      if (!result) return;
      toast.show(
        t(
          'queue_added',
          'Added {{added}} to the follow queue ({{skipped}} skipped). Open the Follow queue tab for scheduled times — up to 400 follows per day.',
          {
            added: result.added,
            skipped: result.skipped,
          }
        ),
        'success'
      );
      setSelected((prev) => {
        const next = new Set(prev);
        selectedToFollow.forEach((u) => next.delete(u.id));
        return next;
      });
    } catch (e: any) {
      toast.show(
        e?.message || t('queue_add_failed', 'Could not add to queue'),
        'warning'
      );
    } finally {
      setActionLoading(false);
    }
  }, [
    integrationId,
    selectedToFollow,
    enqueueFollowUsers,
    toast,
    t,
  ]);

  const massFollow = useCallback(async () => {
    if (!integrationId || selectedToFollow.length === 0) return;

    if (followAtLimit && followLimitedBy === 'daily') {
      toast.show(
        t(
          'x_follow_daily_limit_blocked',
          'Daily follow limit reached ({{dailyLimit}} per 24 hours). Try again when the daily timer resets.',
          { dailyLimit: followDailyLimit }
        ),
        'warning'
      );
      return;
    }

    const users = selectedToFollow;
    const immediateUsers =
      followSlotsLeft > 0 ? users.slice(0, followSlotsLeft) : [];
    const overflowUsers = users.slice(immediateUsers.length);

    if (!immediateUsers.length && !overflowUsers.length) return;

    setActionLoading(true);
    try {
      let followedCount = 0;
      let followFailed = 0;
      const succeededIds: string[] = [];

      if (immediateUsers.length > 0) {
        for (let i = 0; i < immediateUsers.length; i += X_FOLLOW_BATCH_MAX) {
          const chunk = immediateUsers
            .slice(i, i + X_FOLLOW_BATCH_MAX)
            .map((u) => u.id);
          const result = await followUserIdsChunk(chunk);
          if (!result) break;
          succeededIds.push(...result.succeededIds);
          followedCount += result.succeededIds.length;
          followFailed += result.failed;
        }
        if (succeededIds.length > 0) {
          markAsFollowing(succeededIds);
        }
      }

      const succeededSet = new Set(succeededIds);
      const usersToQueue = [
        ...immediateUsers.filter((u) => !succeededSet.has(u.id)),
        ...overflowUsers,
      ];

      let queueAdded = 0;
      let queueSkipped = 0;
      if (usersToQueue.length > 0) {
        const queueResult = await enqueueFollowUsers(usersToQueue);
        if (queueResult) {
          queueAdded = queueResult.added;
          queueSkipped = queueResult.skipped;
        }
      }

      if (followedCount > 0 && queueAdded > 0) {
        toast.show(
          t(
            'follow_and_queue_success',
            'Followed {{followed}} now; {{queued}} added to the follow queue for the next {{minutes}}-minute windows.',
            {
              followed: followedCount,
              queued: queueAdded,
              minutes: followWindowMinutes,
            }
          ),
          'success'
        );
      } else if (followedCount > 0) {
        toast.show(
          t('follow_success_count', 'Followed {{count}} account(s)', {
            count: followedCount,
          }),
          'success'
        );
      } else if (queueAdded > 0) {
        toast.show(
          t(
            'queue_added_window_full',
            'Added {{added}} to the follow queue ({{skipped}} skipped). They will run when the {{minutes}}-minute window opens.',
            {
              added: queueAdded,
              skipped: queueSkipped,
              minutes: followWindowMinutes,
            }
          ),
          'success'
        );
      } else if (usersToQueue.length > 0) {
        toast.show(
          t('queue_add_failed', 'Could not add to queue'),
          'warning'
        );
      }

      if (followFailed > 0) {
        toast.show(
          t('follow_partial_fail', '{{count}} could not be followed', {
            count: followFailed,
          }),
          'warning'
        );
      }

      setSelected((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        if (queueAdded > 0) {
          usersToQueue.forEach((u) => next.delete(u.id));
        }
        return next;
      });
    } catch (e: any) {
      toast.show(e?.message || t('follow_failed', 'Follow failed'), 'warning');
    } finally {
      setActionLoading(false);
    }
  }, [
    integrationId,
    selectedToFollow,
    followAtLimit,
    followLimitedBy,
    followDailyLimit,
    followSlotsLeft,
    followUserIdsChunk,
    enqueueFollowUsers,
    markAsFollowing,
    t,
    toast,
    followWindowMinutes,
  ]);

  const massUnfollow = useCallback(async () => {
    if (unfollowSlotsLeft <= 0) {
      toast.show(
        t(
          'x_unfollow_limit_blocked',
          'Unfollow limit reached for this {{minutes}}-minute window. Try again when the timer resets.',
          { minutes: unfollowWindowMinutes }
        ),
        'warning'
      );
      return;
    }
    const ids = idsToUnfollowNow;
    if (!ids.length) return;
    await runBulkAction('x-unfollow', ids, markAsNotFollowing, {
      success: (count) =>
        t('unfollow_success_count', 'Unfollowed {{count}} account(s)', {
          count,
        }),
      partialFail: (count) =>
        t('unfollow_partial_fail', '{{count}} could not be unfollowed', {
          count,
        }),
      fail: t('unfollow_failed', 'Unfollow failed'),
    });
  }, [
    idsToUnfollowNow,
    unfollowSlotsLeft,
    runBulkAction,
    markAsNotFollowing,
    t,
    toast,
    unfollowWindowMinutes,
  ]);

  const unfollowOne = useCallback(
    async (userId: string) => {
      await runBulkAction('x-unfollow', [userId], markAsNotFollowing, {
        success: () => t('unfollowed', 'Unfollowed'),
        partialFail: () => t('unfollow_failed', 'Unfollow failed'),
        fail: t('unfollow_failed', 'Unfollow failed'),
      });
    },
    [runBulkAction, markAsNotFollowing, t]
  );

  const followOne = useCallback(
    async (userId: string) => {
      await runBulkAction('x-follow', [userId], markAsFollowing, {
        success: () => t('followed', 'Followed'),
        partialFail: () => t('follow_failed', 'Follow failed'),
        fail: t('follow_failed', 'Follow failed'),
      });
    },
    [runBulkAction, markAsFollowing, t]
  );

  const handleColumnSort = useCallback(
    (column: SpreadsheetColumn) => {
      if (sortColumn === column) {
        const next = sortDirection === 'asc' ? 'desc' : 'asc';
        setSortDirection(next);
        setListSort(sortFromColumn(column, next));
        return;
      }
      setSortColumn(column);
      setSortDirection('asc');
      setListSort(sortFromColumn(column, 'asc'));
    },
    [sortColumn, sortDirection]
  );

  const toggleWhitelist = useCallback(
    (userId: string) => {
      if (!integrationId) return;
      setWhitelist((prev) =>
        toggleExplorerListId(integrationId, 'whitelist', userId, prev)
      );
      setBlacklist(loadExplorerListIds(integrationId, 'blacklist'));
    },
    [integrationId]
  );

  const toggleBlacklist = useCallback(
    (userId: string) => {
      if (!integrationId) return;
      setBlacklist((prev) =>
        toggleExplorerListId(integrationId, 'blacklist', userId, prev)
      );
      setWhitelist(loadExplorerListIds(integrationId, 'whitelist'));
    },
    [integrationId]
  );

  const pageFollowable = useMemo(
    () => tablePageUsers.filter((u) => !u.alreadyFollowing),
    [tablePageUsers]
  );

  const pageUnfollowable = useMemo(
    () => tablePageUsers.filter((u) => u.alreadyFollowing),
    [tablePageUsers]
  );

  const atExplorerLoadCap = users.length >= EXPLORER_MAX_LOADED;

  const cappedPageFollowableIds = useMemo(
    () => pageFollowable.map((u) => u.id),
    [pageFollowable]
  );

  const cappedPageUnfollowableIds = useMemo(
    () =>
      pageUnfollowable
        .slice(0, Math.min(unfollowSlotsLeft, pageUnfollowable.length))
        .map((u) => u.id),
    [pageUnfollowable, unfollowSlotsLeft]
  );

  const allPageSelected = useMemo(() => {
    if (isUnfollowFilter) {
      return (
        cappedPageUnfollowableIds.length > 0 &&
        cappedPageUnfollowableIds.every((id) => selected.has(id))
      );
    }
    return (
      cappedPageFollowableIds.length > 0 &&
      cappedPageFollowableIds.every((id) => selected.has(id))
    );
  }, [
    isUnfollowFilter,
    cappedPageUnfollowableIds,
    cappedPageFollowableIds,
    selected,
  ]);

  const toggleSelectPage = useCallback(() => {
    if (isUnfollowFilter) {
      const ids = pageUnfollowable.map((u) => u.id);
      const capped = cappedPageUnfollowableIds;
      const allSelected =
        capped.length > 0 && capped.every((id) => selected.has(id));
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        if (!allSelected) capped.forEach((id) => next.add(id));
        return next;
      });
      return;
    }
    const ids = pageFollowable.map((u) => u.id);
    const capped = cappedPageFollowableIds;
    const allSelected =
      capped.length > 0 && capped.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      if (!allSelected) capped.forEach((id) => next.add(id));
      return next;
    });
  }, [
    isUnfollowFilter,
    pageUnfollowable,
    pageFollowable,
    cappedPageUnfollowableIds,
    cappedPageFollowableIds,
    selected,
  ]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (hideWhitelisted) {
      chips.push({
        key: 'whitelist',
        label: t('filter_hide_whitelist', 'Whitelisted: Hide'),
        onClear: () => setHideWhitelisted(false),
      });
    }
    if (hideBlacklisted) {
      chips.push({
        key: 'blacklist',
        label: t('filter_hide_blacklist', 'Blacklisted: Hide'),
        onClear: () => setHideBlacklisted(false),
      });
    }
    if (listFilter !== 'all') {
      chips.push({
        key: 'account',
        label: t('filter_active', 'Account filter active'),
        onClear: () => setListFilter('all'),
      });
    }
    if (engagementFilter !== 'all') {
      chips.push({
        key: 'engagement',
        label: t('filter_engagement_active', 'Engagement filter active'),
        onClear: () => setEngagementFilter('all'),
      });
    }
    const adv = countActiveAdvancedFilters(advancedFilters);
    if (adv > 0) {
      chips.push({
        key: 'advanced',
        label: t('advanced_filters_active', '{{count}} advanced filters', {
          count: adv,
        }),
        onClear: resetAdvancedFilters,
      });
    }
    return chips;
  }, [
    hideWhitelisted,
    hideBlacklisted,
    listFilter,
    engagementFilter,
    advancedFilters,
    resetAdvancedFilters,
    t,
  ]);

  const clearAllFilters = useCallback(() => {
    setListFilter('all');
    setEngagementFilter('all');
    setTableSearch('');
    setHideWhitelisted(true);
    setHideBlacklisted(true);
    resetAdvancedFilters();
  }, [resetAdvancedFilters]);

  const filterBadgeCount = useMemo(
    () =>
      countActiveAdvancedFilters(advancedFilters) +
      (hideWhitelisted ? 1 : 0) +
      (hideBlacklisted ? 1 : 0),
    [advancedFilters, hideWhitelisted, hideBlacklisted]
  );

  const lastLoadedLabel = useMemo(() => {
    if (!lastLoadedAt) return null;
    const days = Math.floor((Date.now() - lastLoadedAt) / (86400 * 1000));
    if (days < 1) return t('search_result_today', 'Result of the search today');
    if (days === 1) {
      return t('search_result_days_ago_one', 'Result of the search 1 day ago');
    }
    return t('search_result_days_ago', 'Result of the search {{days}} days ago', {
      days,
    });
  }, [lastLoadedAt, t]);

  if (loadingIntegrations) {
    return (
      <ProfileAutomationsCard>
        <div className="h-48 animate-pulse rounded-xl bg-newBgLineColor/40" />
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
      {(followRateLimit || unfollowRateLimit) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
          {followRateLimit && (
            <XFollowRateLimitBanner
              rateLimit={followRateLimit}
              countdown={followCountdown}
              dailyCountdown={followDailyCountdown}
              action="follow"
              className="h-full"
            />
          )}
          {unfollowRateLimit && (
            <XFollowRateLimitBanner
              rateLimit={unfollowRateLimit}
              countdown={unfollowCountdown}
              action="unfollow"
              className="h-full"
            />
          )}
        </div>
      )}

      {integrationId ? (
        <XPlugBatchRateLimitBanner
          rateLimit={plugBatchLimit}
          countdown={plugBatchCountdown}
          pollMinutes={plugPollMinutes}
        />
      ) : null}

      <ProfileAutomationsCard noPadding className="overflow-hidden min-w-0">
        {/* Spreadsheet header & toolbar */}
        <div className="border-b border-newBorder bg-newBgColorInner px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              {subjectHeader && currentSubject && (
                <>
                  <h3 className="text-base sm:text-lg font-semibold text-newTextColor leading-snug">
                    {followerCountTitle}
                  </h3>
                  <p className="mt-1 text-xs text-newTableText">
                    {t(
                      'explorer_list_cap_hint',
                      'Only the first {{size}} rows load per search to save API credits. Use filters, sort, and Next to fetch more from X (up to {{max}} in this view).',
                      {
                        size: EXPLORER_PAGE_SIZE,
                        max: formatCompactCount(EXPLORER_MAX_LOADED),
                      }
                    )}
                  </p>
                  {lastLoadedLabel && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-newTableText">
                      <span>{lastLoadedLabel}</span>
                      <ProfileAutomationsGhostButton
                        disabled={loading || actionLoading}
                        className="!px-2 !py-1 text-xs"
                        onClick={() => {
                          if (trail.length) {
                            void goToBreadcrumb(trail.length - 1);
                          } else {
                            void resetAndLoadRoot();
                          }
                        }}
                      >
                        {t('update_this_search', 'Update this search')}
                      </ProfileAutomationsGhostButton>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-cyan-600/90 dark:text-cyan-400/90">
                    {t(
                      'showing_filtered_count',
                      'Showing {{filtered}} of {{loaded}} loaded',
                      {
                        filtered: displayUsers.length.toLocaleString(),
                        loaded: users.length.toLocaleString(),
                      }
                    )}
                  </p>
                </>
              )}
              {trail.length > 1 && (
                <nav className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Breadcrumb">
                  {trail.map((item, index) => (
                    <span key={item.id} className="flex items-center gap-1.5">
                      {index > 0 && <span className="text-newTableText/50 text-xs">/</span>}
                      <button
                        type="button"
                        className={clsx(
                          'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
                          index === trail.length - 1
                            ? 'bg-btnPrimary/15 text-btnPrimary'
                            : 'text-newTableText hover:bg-boxHover hover:text-newTextColor'
                        )}
                        onClick={() => goToBreadcrumb(index)}
                        disabled={loading}
                      >
                        {breadcrumbLabel(item, index)}
                      </button>
                    </span>
                  ))}
                </nav>
              )}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <ProfileAutomationsGhostButton
                disabled={loading || actionLoading}
                onClick={() => {
                  setSearchQuery('');
                  setTrail([]);
                  setUsers([]);
                  setNextToken(undefined);
                  setTablePage(1);
                }}
                className={explorerNavButtonClass(false)}
              >
                {t('new_search', 'New search')}
              </ProfileAutomationsGhostButton>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
            <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
              <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-newTableText">
                @
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void searchByUsername();
                  }
                }}
                placeholder={t('username_placeholder', 'username')}
                disabled={loading || actionLoading}
                className="w-full rounded-lg border border-newBorder bg-newBgColorInner ps-8 pe-3 py-2 text-sm text-newTextColor outline-none focus:border-btnPrimary/50"
              />
            </div>
            <ProfileAutomationsPrimaryButton
              className="w-full sm:w-auto justify-center"
              disabled={loading || actionLoading || !searchQuery.trim()}
              onClick={() => void searchByUsername()}
            >
              {t('search', 'Search')}
            </ProfileAutomationsPrimaryButton>
            <ProfileAutomationsGhostButton
              className={clsx('w-full sm:w-auto justify-center', explorerNavButtonClass(listMode === 'followers'))}
              disabled={loading || actionLoading}
              onClick={() => {
                if (trail.length) {
                  void reloadCurrentSubjectList('followers');
                } else {
                  setListMode('followers');
                }
              }}
            >
              {t('followers_list', 'Followers')}
            </ProfileAutomationsGhostButton>
            <ProfileAutomationsGhostButton
              className={clsx('w-full sm:w-auto justify-center', explorerNavButtonClass(listMode === 'following'))}
              disabled={loading || actionLoading}
              onClick={() => {
                if (trail.length) {
                  void reloadCurrentSubjectList('following');
                } else {
                  setListMode('following');
                }
              }}
            >
              {t('following_list', 'Following')}
            </ProfileAutomationsGhostButton>
          </div>

          {activeFilterChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {activeFilterChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 rounded-full border border-newBorder bg-newBgColorInner px-2.5 py-1 text-newTextColor"
                >
                  {chip.label}
                  <button
                    type="button"
                    className="text-newTableText hover:text-newTextColor"
                    onClick={chip.onClear}
                    aria-label={t('remove_filter', 'Remove filter')}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="text-btnPrimary hover:underline"
                onClick={clearAllFilters}
              >
                {t('clear_all_filters', 'Clear all filters')}
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 border-t border-newBorder pt-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <ProfileAutomationsPrimaryButton
                  className="!px-3 !py-2 text-xs w-full sm:w-auto"
                  onClick={() => setFiltersCollapsed((v) => !v)}
                >
                  {filtersCollapsed
                    ? t('show_filters', 'Show filters')
                    : t('hide_filters', 'Hide filters')}
                  {filterBadgeCount > 0 ? ` (${filterBadgeCount})` : ''}
                </ProfileAutomationsPrimaryButton>
                <ProfileAutomationsPrimaryButton
                  loading={actionLoading}
                  disabled={
                    loading ||
                    selectedToFollow.length === 0 ||
                    (followAtLimit && followLimitedBy === 'daily')
                  }
                  onClick={massFollow}
                  className="!px-3 !py-2 text-xs flex-1 sm:flex-none min-w-[140px]"
                >
                  {t('follow_selected', 'Follow selected ({{count}})', {
                    count: selectedToFollow.length,
                  })}
                </ProfileAutomationsPrimaryButton>
                <ProfileAutomationsGhostButton
                  disabled={
                    loading ||
                    actionLoading ||
                    selectedToFollow.length === 0
                  }
                  onClick={() => {
                    void queueSelectedFollows();
                  }}
                  className="!px-3 !py-2 text-xs flex-1 sm:flex-none min-w-[140px]"
                >
                  {t('queue_selected', 'Queue selected ({{count}})', {
                    count: selectedToFollow.length,
                  })}
                </ProfileAutomationsGhostButton>
                <ProfileAutomationsGhostButton
                  disabled={
                    loading ||
                    actionLoading ||
                    unfollowSlotsLeft <= 0 ||
                    selectedToUnfollow.length === 0
                  }
                  onClick={massUnfollow}
                  className="!px-3 !py-2 text-xs flex-1 sm:flex-none min-w-[140px] border-red-400 bg-red-50 text-red-700 font-semibold hover:bg-red-100 dark:border-red-500/40 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  {t('unfollow_selected_short', 'Unfollow selected ({{count}})', {
                    count: selectedToUnfollow.length,
                  })}
                </ProfileAutomationsGhostButton>
              </div>
              <input
                type="search"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder={t('table_search', 'Search table...')}
                className="w-full lg:max-w-[220px] rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-sm text-newTextColor outline-none focus:border-btnPrimary/50"
              />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col xl:flex-row">
          {!filtersCollapsed ? (
            <div className="shrink-0 border-b border-newBorder p-3 sm:p-4 xl:border-b-0 xl:border-r xl:max-w-[300px] xl:w-[280px] 2xl:w-[300px]">
              <XFollowersExplorerFiltersPanel
                filters={advancedFilters}
                onChange={patchAdvancedFilters}
                onReset={resetAdvancedFilters}
                hideWhitelisted={hideWhitelisted}
                hideBlacklisted={hideBlacklisted}
                onHideWhitelisted={setHideWhitelisted}
                onHideBlacklisted={setHideBlacklisted}
                collapsed={false}
                onToggleCollapse={() => setFiltersCollapsed(true)}
                disabled={loading || actionLoading}
              />
            </div>
          ) : null}
          {filtersCollapsed ? (
            <div className="hidden xl:flex shrink-0 border-r border-newBorder p-4">
              <XFollowersExplorerFiltersPanel
                filters={advancedFilters}
                onChange={patchAdvancedFilters}
                onReset={resetAdvancedFilters}
                hideWhitelisted={hideWhitelisted}
                hideBlacklisted={hideBlacklisted}
                onHideWhitelisted={setHideWhitelisted}
                onHideBlacklisted={setHideBlacklisted}
                collapsed
                onToggleCollapse={() => setFiltersCollapsed(false)}
                disabled={loading || actionLoading}
              />
            </div>
          ) : null}

          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="min-w-[640px] px-2 sm:px-3 pb-4 max-h-[min(55vh,600px)] sm:max-h-[min(65vh,700px)] xl:max-h-[min(70vh,720px)] overflow-y-auto explorer-scrollbar">
          {!loading && users.length === 0 && trail.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-sm font-medium text-newTextColor">
                {t('search_to_start', 'Search for an X username')}
              </p>
              <p className="mt-2 text-xs text-newTableText max-w-md">
                {t(
                  'search_to_start_hint',
                  'Enter a handle above and click Search to load that account’s followers or following list. Your connected account is not loaded automatically.'
                )}
              </p>
            </div>
          ) : loading && users.length === 0 ? (
            <XFollowersExplorerTable
              users={[]}
              loading
              selected={selected}
              whitelist={whitelist}
              blacklist={blacklist}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleColumnSort}
              page={tablePage}
              totalPages={explorerTotalPages}
              listTotal={subjectListCount}
              canGoNext={canGoNextExplorerPage}
              loadingMore={loadingMore}
              atLoadCap={atExplorerLoadCap}
              onPageChange={(p) => void handleExplorerPageChange(p)}
              actionLoading={actionLoading}
              listDisabled={loading}
              followSlotsLeft={followSlotsLeft}
              unfollowSlotsLeft={unfollowSlotsLeft}
              allPageSelected={false}
              onToggleSelectAll={toggleSelectPage}
              onToggleSelect={toggleSelect}
              onFollowOne={(id) => void followOne(id)}
              onUnfollowOne={(id) => void unfollowOne(id)}
              onDrill={drillInto}
              onToggleWhitelist={toggleWhitelist}
              onToggleBlacklist={toggleBlacklist}
              selectDisabled={(user) =>
                !!user.alreadyFollowing &&
                unfollowSlotsLeft <= 0 &&
                !selected.has(user.id)
              }
            />
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-sm font-medium text-newTextColor">
                {t('no_followers_found', 'No followers found')}
              </p>
            </div>
          ) : (
            <>
              <XFollowersExplorerTable
                users={displayUsers}
                loading={loading}
                selected={selected}
                whitelist={whitelist}
                blacklist={blacklist}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleColumnSort}
                page={tablePage}
                totalPages={explorerTotalPages}
                listTotal={subjectListCount}
                canGoNext={canGoNextExplorerPage}
                loadingMore={loadingMore}
                atLoadCap={atExplorerLoadCap}
                onPageChange={(p) => void handleExplorerPageChange(p)}
                actionLoading={actionLoading}
                listDisabled={loading || actionLoading || loadingMore}
                followSlotsLeft={followSlotsLeft}
                unfollowSlotsLeft={unfollowSlotsLeft}
                allPageSelected={allPageSelected}
                onToggleSelectAll={toggleSelectPage}
                onToggleSelect={toggleSelect}
                onFollowOne={(id) => void followOne(id)}
                onUnfollowOne={(id) => void unfollowOne(id)}
                onDrill={drillInto}
                onToggleWhitelist={toggleWhitelist}
                onToggleBlacklist={toggleBlacklist}
                selectDisabled={(user) =>
                  (!user.alreadyFollowing &&
                    followSlotsLeft <= 0 &&
                    !selected.has(user.id)) ||
                  (!!user.alreadyFollowing &&
                    unfollowSlotsLeft <= 0 &&
                    !selected.has(user.id))
                }
              />
            </>
          )}
            </div>
          </div>
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
              'Up to {{windowLimit}} follows per {{minutes}} minutes and {{dailyLimit}} per day. Follow selected uses your current window first; the rest go to the follow queue automatically.',
              {
                dailyLimit: followDailyLimit,
                windowLimit: followLimit,
                minutes: followWindowMinutes,
              }
            )}
          </li>
          <li>
            {t(
              'follow_policy_hint',
              'Use mass follow carefully — aggressive following may trigger X restrictions on your account.'
            )}
          </li>
          <li>
            {t(
              'explorer_load_cap_hint',
              'The follower explorer loads at most {{max}} accounts per profile ({{pages}} pages of {{size}}). Use Next on the table to fetch more from X.',
              {
                max: EXPLORER_MAX_LOADED.toLocaleString(),
                pages: EXPLORER_MAX_PAGES,
                size: EXPLORER_PAGE_SIZE,
              }
            )}
          </li>
        </ul>
      </div>
    </div>
  );
};
