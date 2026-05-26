'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type {
  ExplorerAdvancedFilters,
  TriFilter,
  VerificationFilter,
} from '@gitroom/frontend/components/dashboard/follower-explorer-advanced-filters';
import { countActiveAdvancedFilters } from '@gitroom/frontend/components/dashboard/follower-explorer-advanced-filters';

const triOptions = (t: (k: string, f: string) => string): { value: TriFilter; label: string }[] => [
  { value: 'any', label: t('filter_not_selected', 'Not selected') },
  { value: 'include', label: t('filter_include', 'Include') },
  { value: 'exclude', label: t('filter_exclude', 'Exclude') },
];

function TriSelect({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: TriFilter;
  onChange: (v: TriFilter) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-newTextColor">
        {label}
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as TriFilter)}
        className="w-full rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-sm text-newTextColor outline-none focus:border-btnPrimary/50 disabled:opacity-50"
      >
        {triOptions(t).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function RangeRow({
  label,
  min,
  max,
  minPlaceholder,
  maxPlaceholder,
  onMin,
  onMax,
  disabled,
  hint,
}: {
  label: string;
  min: string;
  max: string;
  minPlaceholder: string;
  maxPlaceholder: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label className="text-[13px] font-medium text-newTextColor">{label}</label>
        {hint ? (
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-newBorder text-[10px] text-newTableText"
            title={hint}
          >
            i
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          inputMode="numeric"
          disabled={disabled}
          value={min}
          onChange={(e) => onMin(e.target.value)}
          placeholder={minPlaceholder}
          className="w-full rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-sm text-newTextColor outline-none focus:border-btnPrimary/50"
        />
        <input
          type="number"
          inputMode="numeric"
          disabled={disabled}
          value={max}
          onChange={(e) => onMax(e.target.value)}
          placeholder={maxPlaceholder}
          className="w-full rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-sm text-newTextColor outline-none focus:border-btnPrimary/50"
        />
      </div>
    </div>
  );
}

export const XFollowersExplorerFiltersPanel: FC<{
  filters: ExplorerAdvancedFilters;
  onChange: (patch: Partial<ExplorerAdvancedFilters>) => void;
  onReset: () => void;
  hideWhitelisted: boolean;
  hideBlacklisted: boolean;
  onHideWhitelisted: (v: boolean) => void;
  onHideBlacklisted: (v: boolean) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  disabled?: boolean;
}> = ({
  filters,
  onChange,
  onReset,
  hideWhitelisted,
  hideBlacklisted,
  onHideWhitelisted,
  onHideBlacklisted,
  collapsed,
  onToggleCollapse,
  disabled,
}) => {
  const t = useT();
  const activeCount = countActiveAdvancedFilters(filters);
  const listSelections =
    (hideWhitelisted ? 1 : 0) + (hideBlacklisted ? 1 : 0);

  if (collapsed) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onToggleCollapse}
        className="hidden xl:flex min-h-[200px] w-11 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-newBorder bg-newBgColorInner text-newTableText hover:bg-boxHover disabled:opacity-50"
        title={t('filter_options', 'Filter options')}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl] rotate-180">
          {t('filters', 'Filters')}
        </span>
        {activeCount + listSelections > 0 ? (
          <span className="rounded-full bg-btnPrimary px-1.5 py-0.5 text-[10px] font-bold text-white">
            {activeCount + listSelections}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <aside className="flex w-full min-w-0 shrink-0 flex-col rounded-xl border border-newBorder bg-newBgColorInner xl:w-[min(100%,280px)] 2xl:w-[300px]">
      <div className="flex items-center justify-between border-b border-newBorder px-4 py-3">
        <h4 className="text-[15px] font-semibold text-newTextColor">
          {t('filter_options', 'Filter options')}
        </h4>
        {onToggleCollapse ? (
          <button
            type="button"
            className="text-newTableText hover:text-newTextColor text-xs"
            onClick={onToggleCollapse}
            aria-label={t('collapse_filters', 'Collapse filters')}
          >
            ‹
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto explorer-scrollbar px-4 py-4 space-y-5 max-h-[min(50vh,520px)] xl:max-h-[min(65vh,680px)]">
        <section className="space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-newTableText">
            {t('follower_quality', 'Follower quality')}
          </p>
          <TriSelect
            label={t('filter_eggheads', 'Eggheads')}
            value={filters.egghead}
            onChange={(v) => onChange({ egghead: v })}
            disabled={disabled}
          />
          <TriSelect
            label={t('filter_protected', 'Protected')}
            value={filters.protected}
            onChange={(v) => onChange({ protected: v })}
            disabled={disabled}
          />
          <TriSelect
            label={t('filter_fake_spam', 'Fake/Spam')}
            value={filters.fakeSpam}
            onChange={(v) => onChange({ fakeSpam: v })}
            disabled={disabled}
          />
          <TriSelect
            label={t('filter_inactive', 'Inactive')}
            value={filters.inactive}
            onChange={(v) => onChange({ inactive: v })}
            disabled={disabled}
          />
          <TriSelect
            label={t('filter_overactive', 'Overactive')}
            value={filters.overactive}
            onChange={(v) => onChange({ overactive: v })}
            disabled={disabled}
          />
        </section>

        <section>
          <label className="mb-1.5 block text-[13px] font-medium text-newTextColor">
            {t('verification_status', 'Verification status')}
          </label>
          <select
            value={filters.verification}
            disabled={disabled}
            onChange={(e) =>
              onChange({ verification: e.target.value as VerificationFilter })
            }
            className="w-full rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-sm text-newTextColor outline-none focus:border-btnPrimary/50"
          >
            <option value="any">{t('filter_not_selected', 'Not selected')}</option>
            <option value="verified">{t('verified_only', 'Verified only')}</option>
            <option value="not_verified">
              {t('not_verified_only', 'Not verified only')}
            </option>
          </select>
        </section>

        <section>
          <label className="mb-1.5 block text-[13px] font-medium text-newTextColor">
            {t('find_in_bio_name', 'Find in Bio & Name')}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-newTableText text-sm">
              ⌕
            </span>
            <input
              type="search"
              disabled={disabled}
              value={filters.bioSearch}
              onChange={(e) => onChange({ bioSearch: e.target.value })}
              placeholder={t('search_placeholder', 'Search ...')}
              className="w-full rounded-lg border border-newBorder bg-newBgColorInner ps-9 pe-3 py-2 text-sm text-newTextColor outline-none focus:border-btnPrimary/50"
            />
          </div>
        </section>

        <section>
          <p className="mb-2 text-[13px] font-medium text-newTextColor">
            {t('whitelist_blacklist', 'Whitelisted & Blacklisted')}
          </p>
          <div className="space-y-2 text-sm text-newTextColor">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={hideWhitelisted}
                onChange={(e) => onHideWhitelisted(e.target.checked)}
              />
              {t('hide_whitelisted', 'Hide whitelisted')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={hideBlacklisted}
                onChange={(e) => onHideBlacklisted(e.target.checked)}
              />
              {t('hide_blacklisted', 'Hide blacklisted')}
            </label>
            {listSelections > 0 ? (
              <p className="text-xs text-cyan-600 dark:text-cyan-400">
                {t('list_filters_selected', '{{count}} selected', {
                  count: listSelections,
                })}
              </p>
            ) : null}
          </div>
        </section>

        <RangeRow
          label={t('follower_count', 'Follower Count')}
          min={filters.followersMin}
          max={filters.followersMax}
          minPlaceholder={t('min', 'Min')}
          maxPlaceholder={t('max', 'Max')}
          onMin={(v) => onChange({ followersMin: v })}
          onMax={(v) => onChange({ followersMax: v })}
          disabled={disabled}
        />
        <RangeRow
          label={t('following_count', 'Following Count')}
          min={filters.followingMin}
          max={filters.followingMax}
          minPlaceholder={t('min', 'Min')}
          maxPlaceholder={t('max', 'Max')}
          onMin={(v) => onChange({ followingMin: v })}
          onMax={(v) => onChange({ followingMax: v })}
          disabled={disabled}
        />
        <RangeRow
          label={t('tweet_count', 'Tweet Count')}
          min={filters.tweetsMin}
          max={filters.tweetsMax}
          minPlaceholder={t('min', 'Min')}
          maxPlaceholder={t('max', 'Max')}
          onMin={(v) => onChange({ tweetsMin: v })}
          onMax={(v) => onChange({ tweetsMax: v })}
          disabled={disabled}
        />
        <RangeRow
          label={t('follow_ratio', 'Follow Ratio')}
          min={filters.ratioMin}
          max={filters.ratioMax}
          minPlaceholder={t('min', 'Min')}
          maxPlaceholder={t('max', 'Max')}
          onMin={(v) => onChange({ ratioMin: v })}
          onMax={(v) => onChange({ ratioMax: v })}
          disabled={disabled}
          hint={t(
            'follow_ratio_hint',
            'Followers divided by following (higher = more followers per follow)'
          )}
        />

        <section>
          <p className="mb-1.5 text-[13px] font-medium text-newTextColor">
            {t('join_date', 'Join Date')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              disabled={disabled}
              value={filters.joinEarliest}
              onChange={(e) => onChange({ joinEarliest: e.target.value })}
              placeholder={t('earliest', 'Earliest')}
              className="w-full rounded-lg border border-newBorder bg-newBgColorInner px-2 py-2 text-sm text-newTextColor outline-none focus:border-btnPrimary/50"
            />
            <input
              type="date"
              disabled={disabled}
              value={filters.joinLatest}
              onChange={(e) => onChange({ joinLatest: e.target.value })}
              placeholder={t('latest', 'Latest')}
              className="w-full rounded-lg border border-newBorder bg-newBgColorInner px-2 py-2 text-sm text-newTextColor outline-none focus:border-btnPrimary/50"
            />
          </div>
        </section>

        <section>
          <label className="mb-1.5 block text-[13px] font-medium text-newTextColor">
            {t('filter_by_location', 'Filter by Location')}
          </label>
          <input
            type="text"
            disabled={disabled}
            value={filters.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder={t('location_placeholder', 'New York')}
            className="w-full rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-sm text-newTextColor outline-none focus:border-btnPrimary/50"
          />
        </section>
      </div>

      <div
        className={clsx(
          'border-t border-newBorder px-4 py-3 flex gap-2',
          activeCount > 0 ? 'justify-between' : 'justify-end'
        )}
      >
        {activeCount > 0 ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onReset}
            className="text-sm text-btnPrimary hover:underline disabled:opacity-50"
          >
            {t('reset_filters', 'Reset filters')}
          </button>
        ) : null}
        <span className="text-xs text-newTableText self-center">
          {activeCount > 0
            ? t('filters_active_count', '{{count}} active', { count: activeCount })
            : null}
        </span>
      </div>
    </aside>
  );
};
