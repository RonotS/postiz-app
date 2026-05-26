'use client';

import { FC, ReactNode } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import {
  FollowerListUser,
  SpreadsheetColumn,
  formatCompactCount,
  formatFollowRatio,
  formatJoinedAgo,
  getUserEngagement,
} from '@gitroom/frontend/components/dashboard/follower-list-filters';

/** Rows shown per spreadsheet page in the follower explorer. */
export const EXPLORER_PAGE_SIZE = 100;

/** Max followers/following rows to pull from the X API per subject (25 pages × 100). */
export const EXPLORER_MAX_LOADED = 2_500;

export function applyFollowerPageCap<T>(
  users: T[],
  nextToken?: string
): { users: T[]; nextToken?: string; capped: boolean } {
  if (users.length > EXPLORER_MAX_LOADED) {
    return {
      users: users.slice(0, EXPLORER_MAX_LOADED),
      nextToken: undefined,
      capped: true,
    };
  }
  const atCap = users.length >= EXPLORER_MAX_LOADED;
  return {
    users,
    nextToken: atCap ? undefined : nextToken,
    capped: atCap,
  };
}

export function mergeFollowerPages<T extends { id: string }>(
  prev: T[],
  incoming: T[]
): { users: T[]; capped: boolean } {
  const seen = new Set(prev.map((u) => u.id));
  const added = incoming.filter((u) => !seen.has(u.id));
  const merged = [...prev, ...added];
  if (merged.length <= EXPLORER_MAX_LOADED) {
    return { users: merged, capped: false };
  }
  return { users: merged.slice(0, EXPLORER_MAX_LOADED), capped: true };
}

export function canLoadMoreFollowers(
  loadedCount: number,
  nextToken?: string
): boolean {
  return !!nextToken && loadedCount < EXPLORER_MAX_LOADED;
}

export const EXPLORER_MAX_PAGES = EXPLORER_MAX_LOADED / EXPLORER_PAGE_SIZE;

/** Total UI pages from X public follower/following count (capped at 2,500 = 25 pages). */
export function explorerTotalPagesFromListCount(
  listCount: number | undefined
): number {
  if (listCount == null || !Number.isFinite(listCount) || listCount <= 0) {
    return 1;
  }
  const capped = Math.min(Math.floor(listCount), EXPLORER_MAX_LOADED);
  return Math.max(1, Math.ceil(capped / EXPLORER_PAGE_SIZE));
}

export function explorerListCountFromSubject(
  subject: { publicMetrics?: { followersCount: number; followingCount: number } } | null | undefined,
  listMode: 'followers' | 'following'
): number | undefined {
  const metrics = subject?.publicMetrics;
  if (!metrics) return undefined;
  const raw =
    listMode === 'following' ? metrics.followingCount : metrics.followersCount;
  return Number.isFinite(raw) && raw >= 0 ? raw : undefined;
}

/** @deprecated Use explorerTotalPagesFromListCount when subject list size is known. */
export function explorerPaginationTotalPages(
  displayCount: number,
  canLoadMore: boolean,
  currentPage: number
): number {
  const loadedPages = Math.max(
    1,
    Math.ceil(displayCount / EXPLORER_PAGE_SIZE) || 1
  );
  if (!canLoadMore) {
    return displayCount === 0 ? 1 : loadedPages;
  }
  return Math.min(
    EXPLORER_MAX_PAGES,
    Math.max(loadedPages + 1, currentPage)
  );
}

export function canGoToExplorerPage(
  targetPage: number,
  totalPages: number,
  loadedUserCount: number,
  nextToken?: string
): boolean {
  if (targetPage < 1 || targetPage > totalPages) {
    return false;
  }
  const rawNeeded = targetPage * EXPLORER_PAGE_SIZE;
  if (loadedUserCount >= rawNeeded) {
    return true;
  }
  return (
    !!nextToken &&
    loadedUserCount < EXPLORER_MAX_LOADED &&
    targetPage <= totalPages
  );
}

export const XFollowersExplorerPagination: FC<{
  page: number;
  totalPages: number;
  itemCount: number;
  listTotal?: number;
  canGoNext?: boolean;
  loadingMore?: boolean;
  atLoadCap?: boolean;
  onPageChange: (page: number) => void;
  className?: string;
}> = ({
  page,
  totalPages,
  itemCount,
  listTotal,
  canGoNext,
  loadingMore,
  atLoadCap,
  onPageChange,
  className,
}) => {
  const t = useT();
  const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages));
  const from =
    itemCount === 0 ? 0 : (safePage - 1) * EXPLORER_PAGE_SIZE + 1;
  const to = Math.min(safePage * EXPLORER_PAGE_SIZE, itemCount);

  if (itemCount === 0 && !loadingMore) {
    return null;
  }

  return (
    <div
      className={clsx(
        'flex flex-wrap items-center justify-end gap-2 px-4 py-3 text-xs text-newTableText',
        className
      )}
    >
      <span className="me-auto text-newTableText/80">
        {loadingMore
          ? t('loading_page', 'Loading page…')
          : listTotal != null && listTotal > EXPLORER_MAX_LOADED
            ? t(
                'page_range_capped_total',
                '{{from}}–{{to}} on page · showing {{loadedCompact}} of {{totalCompact}} ({{size}} per page)',
                {
                  from,
                  to,
                  loadedCompact: formatCompactCount(
                    Math.min(itemCount, EXPLORER_MAX_LOADED)
                  ),
                  totalCompact: formatCompactCount(listTotal),
                  size: EXPLORER_PAGE_SIZE,
                }
              )
            : listTotal != null && listTotal > 0
              ? t(
                  'page_range_with_total',
                  '{{from}}–{{to}} of {{totalCompact}} ({{size}} per page)',
                  {
                    from,
                    to,
                    totalCompact: formatCompactCount(
                      Math.min(listTotal, itemCount)
                    ),
                    size: EXPLORER_PAGE_SIZE,
                  }
                )
              : t(
                  'page_range',
                  '{{from}}–{{to}} of {{total}} ({{size}} per page)',
                  {
                    from,
                    to,
                    total: formatCompactCount(itemCount),
                    size: EXPLORER_PAGE_SIZE,
                  }
                )}
      </span>
      <span>
        {t('page_of', 'Page {{page}} / {{total}}', {
          page: safePage,
          total: totalPages,
        })}
      </span>
      <button
        type="button"
        disabled={safePage <= 1 || loadingMore}
        onClick={() => onPageChange(safePage - 1)}
        className="rounded border border-newBorder px-2 py-1 hover:bg-boxHover disabled:opacity-40"
        aria-label={t('previous_page', 'Previous page')}
      >
        ‹
      </button>
      <button
        type="button"
        disabled={
          loadingMore ||
          safePage >= totalPages ||
          (canGoNext === false && safePage < totalPages)
        }
        onClick={() => onPageChange(safePage + 1)}
        className="rounded border border-newBorder px-2 py-1 hover:bg-boxHover disabled:opacity-40"
        aria-label={t('next_page', 'Next page')}
      >
        ›
      </button>
      {atLoadCap && (
        <span className="w-full text-[10px] text-newTableText/70 pt-1">
          {t(
            'explorer_cap_note_short',
            'Maximum {{max}} accounts loaded from X for this profile.',
            { max: formatCompactCount(EXPLORER_MAX_LOADED) }
          )}
        </span>
      )}
    </div>
  );
};

function SortHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  className,
}: {
  label: string;
  column: SpreadsheetColumn;
  activeColumn: SpreadsheetColumn | null;
  direction: 'asc' | 'desc';
  onSort: (column: SpreadsheetColumn) => void;
  className?: string;
}) {
  const active = activeColumn === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={clsx(
        'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-newTableText hover:text-newTextColor transition-colors',
        className
      )}
    >
      {label}
      <span className="text-[9px] opacity-70" aria-hidden>
        {active ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </button>
  );
}

function ActionIcon({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx('h-4 w-4 shrink-0', className)}
      aria-hidden
    >
      {children}
    </svg>
  );
}

function RowActionButton({
  title,
  onClick,
  disabled,
  children,
  variant = 'default',
  active,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  variant?: 'default' | 'primary' | 'danger' | 'amber' | 'muted';
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-colors shadow-sm',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none',
        variant === 'primary' &&
          'border-btnPrimary bg-btnPrimary text-white hover:bg-btnPrimary/90 hover:border-btnPrimary',
        variant === 'danger' &&
          'border-red-500 bg-red-100 text-red-700 hover:bg-red-200 dark:border-red-500/60 dark:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/35',
        variant === 'amber' &&
          (active
            ? 'border-amber-500 bg-amber-100 text-amber-800 dark:border-amber-400 dark:bg-amber-500/25 dark:text-amber-200'
            : 'border-gray-300 bg-newBgColorInner text-amber-600 hover:bg-amber-50 hover:border-amber-400 dark:border-newBorder dark:text-amber-400 dark:hover:bg-amber-500/15'),
        variant === 'muted' &&
          (active
            ? 'border-red-500 bg-red-100 text-red-700 dark:border-red-400 dark:bg-red-500/20 dark:text-red-300'
            : 'border-gray-300 bg-newBgColorInner text-gray-700 hover:bg-gray-100 dark:border-newBorder dark:text-newTextColor dark:hover:bg-boxHover'),
        variant === 'default' &&
          'border-gray-300 bg-newBgColorInner text-gray-700 hover:bg-gray-100 hover:border-btnPrimary hover:text-btnPrimary dark:border-newBorder dark:text-newTextColor dark:hover:bg-boxHover'
      )}
    >
      {children}
    </button>
  );
}

export const XFollowersExplorerTable: FC<{
  users: FollowerListUser[];
  loading: boolean;
  selected: Set<string>;
  whitelist: Set<string>;
  blacklist: Set<string>;
  sortColumn: SpreadsheetColumn | null;
  sortDirection: 'asc' | 'desc';
  onSort: (column: SpreadsheetColumn) => void;
  page: number;
  onPageChange: (page: number) => void;
  actionLoading: boolean;
  listDisabled: boolean;
  followSlotsLeft: number;
  unfollowSlotsLeft: number;
  allPageSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  onFollowOne: (id: string) => void;
  onUnfollowOne: (id: string) => void;
  onDrill: (user: FollowerListUser) => void;
  onToggleWhitelist: (id: string) => void;
  onToggleBlacklist: (id: string) => void;
  selectDisabled?: (user: FollowerListUser) => boolean;
  totalPages: number;
  listTotal?: number;
  canGoNext?: boolean;
  loadingMore?: boolean;
  atLoadCap?: boolean;
}> = ({
  users,
  loading,
  selected,
  whitelist,
  blacklist,
  sortColumn,
  sortDirection,
  onSort,
  page,
  onPageChange,
  actionLoading,
  listDisabled,
  followSlotsLeft,
  unfollowSlotsLeft,
  allPageSelected,
  onToggleSelectAll,
  onToggleSelect,
  onFollowOne,
  onUnfollowOne,
  onDrill,
  onToggleWhitelist,
  onToggleBlacklist,
  selectDisabled,
  totalPages,
  listTotal,
  canGoNext,
  loadingMore,
  atLoadCap,
}) => {
  const t = useT();
  const safePage = Math.min(page, Math.max(1, totalPages));
  const pageUsers = users.slice(
    (safePage - 1) * EXPLORER_PAGE_SIZE,
    safePage * EXPLORER_PAGE_SIZE
  );

  return (
    <div className="w-full overflow-x-auto explorer-scrollbar">
      <XFollowersExplorerPagination
        page={page}
        totalPages={totalPages}
        itemCount={users.length}
        listTotal={listTotal}
        canGoNext={canGoNext}
        loadingMore={loadingMore}
        atLoadCap={atLoadCap}
        onPageChange={onPageChange}
        className="border-b border-newBorder"
      />
      <table className="w-full min-w-[1100px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-newBorder bg-newBgColor/50">
            <th className="w-10 px-2 py-3 text-start">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-newBorder bg-newBgColorInner text-btnPrimary accent-btnPrimary"
                checked={allPageSelected && pageUsers.length > 0}
                onChange={onToggleSelectAll}
                disabled={listDisabled || actionLoading || pageUsers.length === 0}
              />
            </th>
            <th className="px-3 py-3 text-start min-w-[200px]">
              <SortHeader
                label={t('col_name', 'Name')}
                column="name"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
              />
            </th>
            <th className="px-3 py-3 text-end w-20">
              <SortHeader
                label={t('col_tweets', 'Tweets')}
                column="tweets"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
                className="justify-end w-full"
              />
            </th>
            <th className="px-3 py-3 text-end w-28">
              <SortHeader
                label={t('col_joined', 'Joined')}
                column="joined"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
                className="justify-end w-full"
              />
            </th>
            <th className="px-3 py-3 text-end w-24">
              <SortHeader
                label={t('col_following', 'Following')}
                column="following"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
                className="justify-end w-full"
              />
            </th>
            <th className="px-3 py-3 text-end w-24">
              <SortHeader
                label={t('col_followers', 'Followers')}
                column="followers"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
                className="justify-end w-full"
              />
            </th>
            <th className="px-3 py-3 text-end w-28">
              <SortHeader
                label={t('col_follow_ratio', 'Follow ratio')}
                column="ratio"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
                className="justify-end w-full"
              />
            </th>
            <th className="px-3 py-3 text-start min-w-[160px]">
              <SortHeader
                label={t('col_engagement', 'Active & inactive')}
                column="engagement"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
              />
            </th>
            <th className="px-3 py-3 text-end w-[180px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-newTableText">
                {t('col_actions', 'Actions')}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading && users.length === 0 ? (
            Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="border-b border-newBorder/60 animate-pulse">
                <td className="px-2 py-3">
                  <div className="h-4 w-4 rounded bg-newBgLineColor/80" />
                </td>
                <td className="px-3 py-3" colSpan={8}>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-newBgLineColor/80" />
                    <div className="h-3 w-32 rounded bg-newBgLineColor/80" />
                  </div>
                </td>
              </tr>
            ))
          ) : pageUsers.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                className="px-4 py-16 text-center text-sm text-newTableText"
              >
                {t('no_rows_match_filters', 'No accounts match your filters.')}
              </td>
            </tr>
          ) : (
            pageUsers.map((user) => {
              const engagement = getUserEngagement(user);
              const metrics = user.publicMetrics;
              const isSelected = selected.has(user.id);
              const isWhitelisted = whitelist.has(user.id);
              const isBlacklisted = blacklist.has(user.id);
              const cannotSelect = selectDisabled?.(user);

              return (
                <tr
                  key={user.id}
                  className={clsx(
                    'border-b border-newBorder/50 transition-colors',
                    isSelected && 'bg-btnPrimary/5',
                    isBlacklisted && 'opacity-60',
                    'hover:bg-boxHover/50'
                  )}
                >
                  <td className="px-2 py-2.5 align-middle">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-newBorder bg-newBgColorInner text-btnPrimary accent-btnPrimary"
                      checked={isSelected}
                      onChange={() => onToggleSelect(user.id)}
                      disabled={
                        listDisabled ||
                        actionLoading ||
                        (cannotSelect && !isSelected)
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <button
                      type="button"
                      onClick={() => onDrill(user)}
                      disabled={listDisabled || actionLoading}
                      className="flex min-w-0 items-center gap-2.5 text-start disabled:opacity-50"
                    >
                      <div className="relative shrink-0">
                        <ImageWithFallback
                          fallbackSrc="/no-picture.svg"
                          src={user.picture || '/no-picture.svg'}
                          className="h-9 w-9 rounded-full border border-newBorder object-cover"
                          alt=""
                          width={36}
                          height={36}
                        />
                        {isWhitelisted && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-newBgColorInner bg-amber-400"
                            title={t('whitelisted', 'Whitelisted')}
                          />
                        )}
                        {isBlacklisted && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-newBgColorInner bg-red-500"
                            title={t('blacklisted', 'Blacklisted')}
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-newTextColor">
                          {user.name}
                        </p>
                        <p className="truncate text-xs text-newTableText">
                          @{user.username}
                        </p>
                      </div>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-end align-middle tabular-nums text-newTextColor">
                    {metrics ? metrics.tweetCount.toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-end align-middle text-xs text-newTableText whitespace-nowrap">
                    {formatJoinedAgo(user.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-end align-middle tabular-nums text-newTextColor">
                    {metrics ? metrics.followingCount.toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-end align-middle tabular-nums text-newTextColor">
                    {metrics ? metrics.followersCount.toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-end align-middle tabular-nums text-newTextColor">
                    {formatFollowRatio(user)}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <p className="text-xs font-semibold text-newTextColor">
                      {engagement.label}
                    </p>
                    <p className="text-[10px] text-newTableText leading-snug">
                      {engagement.description}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <div className="flex items-center justify-end gap-1">
                      {user.alreadyFollowing ? (
                        <RowActionButton
                          title={t('unfollow', 'Unfollow')}
                          variant="danger"
                          disabled={
                            listDisabled || actionLoading || unfollowSlotsLeft <= 0
                          }
                          onClick={() => onUnfollowOne(user.id)}
                        >
                          <ActionIcon>
                            <path d="M5 12h14" />
                          </ActionIcon>
                        </RowActionButton>
                      ) : (
                        <RowActionButton
                          title={t('follow', 'Follow')}
                          variant="primary"
                          disabled={
                            listDisabled || actionLoading || followSlotsLeft <= 0
                          }
                          onClick={() => onFollowOne(user.id)}
                        >
                          <ActionIcon>
                            <path d="M12 5v14M5 12h14" />
                          </ActionIcon>
                        </RowActionButton>
                      )}
                      <RowActionButton
                        title={
                          isWhitelisted
                            ? t('remove_whitelist', 'Remove from whitelist')
                            : t('whitelist', 'Whitelist')
                        }
                        variant="amber"
                        active={isWhitelisted}
                        onClick={() => onToggleWhitelist(user.id)}
                        disabled={listDisabled || actionLoading}
                      >
                        <ActionIcon>
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </ActionIcon>
                      </RowActionButton>
                      <RowActionButton
                        title={
                          isBlacklisted
                            ? t('remove_blacklist', 'Remove from blacklist')
                            : t('blacklist', 'Blacklist')
                        }
                        variant="muted"
                        active={isBlacklisted}
                        onClick={() => onToggleBlacklist(user.id)}
                        disabled={listDisabled || actionLoading}
                      >
                        <ActionIcon>
                          <circle cx="12" cy="12" r="10" />
                          <path d="m4.9 4.9 14.2 14.2" />
                        </ActionIcon>
                      </RowActionButton>
                      <RowActionButton
                        title={t('view_profile', 'View on X')}
                        onClick={() => {
                          if (user.username) {
                            window.open(
                              `https://x.com/${user.username}`,
                              '_blank',
                              'noopener,noreferrer'
                            );
                          }
                        }}
                        disabled={!user.username}
                      >
                        <ActionIcon>
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </ActionIcon>
                      </RowActionButton>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <XFollowersExplorerPagination
        page={page}
        totalPages={totalPages}
        itemCount={users.length}
        listTotal={listTotal}
        canGoNext={canGoNext}
        loadingMore={loadingMore}
        atLoadCap={atLoadCap}
        onPageChange={onPageChange}
        className="border-t border-newBorder"
      />
    </div>
  );
};
