'use client';

import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
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
import { FollowersPanel } from '@gitroom/frontend/components/dashboard/followers.panel';
import {
  ProfileAutomationsCard,
  ProfileAutomationsEmpty,
  ProfileAutomationsInfoIcon,
  ProfileAutomationsInnerBox,
  ProfileAutomationsPrimaryButton,
  ProfileAutomationsSection,
  ProfileAutomationsToggle,
} from '@gitroom/frontend/components/dashboard/profile-automations.ui';
import {
  ProfileAutomationsNavIcon,
  ProfileAutomationsSectionIcon,
} from '@gitroom/frontend/components/dashboard/profile-automations.icons';

type PlugRow = {
  id: string;
  plugFunction: string;
  activated: boolean;
  data: string;
};

function parsePlugFields(data: string): Record<string, string> {
  try {
    const arr = JSON.parse(data || '[]') as { name: string; value: string }[];
    return Object.fromEntries(arr.map((f) => [f.name, f.value]));
  } catch {
    return {};
  }
}

function boolField(v: string | undefined): boolean {
  return v === 'true' || v === '1';
}

function boolToField(v: boolean): string {
  return v ? 'true' : 'false';
}

const AutomationCardHeader: FC<{
  enabled: boolean;
  onToggle: (v: boolean) => void;
  title: string;
  description: string;
  infoTitle?: string;
  disabled?: boolean;
}> = ({ enabled, onToggle, title, description, infoTitle, disabled }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
    <ProfileAutomationsToggle
      enabled={enabled}
      onChange={onToggle}
      disabled={disabled}
    />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-newTextColor">{title}</h3>
        <ProfileAutomationsInfoIcon title={infoTitle || title} />
      </div>
      <p className="mt-1 text-sm text-newTableText leading-relaxed">
        {description}
      </p>
    </div>
  </div>
);

type PinnedTweetPreview = {
  id: string;
  text: string;
  createdAt: string | null;
  url: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
};

const AutoDeleteRuleRow: FC<{
  enabled: boolean;
  onToggle: (v: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
  children?: React.ReactNode;
}> = ({ enabled, onToggle, label, description, disabled, children }) => (
  <div className="rounded-lg bg-newBgColorInner/50 overflow-hidden">
    <label className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-newTextColor cursor-pointer">
      <span className="font-medium">{label}</span>
      <ProfileAutomationsToggle
        enabled={enabled}
        onChange={onToggle}
        disabled={disabled}
      />
    </label>
    {enabled && (
      <div className="px-3 pb-3 pt-0 space-y-2">
        <p className="text-xs text-newTableText leading-relaxed">{description}</p>
        {children}
      </div>
    )}
  </div>
);

const PinnedPostPreviewCard: FC<{
  loading: boolean;
  pinned: PinnedTweetPreview | null | undefined;
  error?: string | null;
  username?: string;
}> = ({ loading, pinned, error, username }) => {
  const t = useT();

  if (loading) {
    return (
      <div className="h-24 animate-pulse rounded-xl bg-newBgLineColor/60" />
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-newTextColor leading-relaxed space-y-2">
        <p className="font-semibold">
          {t('pinned_post_load_failed', 'Could not load pinned post from X')}
        </p>
        <p className="text-newTableText">{error}</p>
        <p className="text-xs text-newTableText">
          {t(
            'pinned_post_load_hint',
            'Check backend logs, X API credits, and that your app can read your profile. Then refresh this page.'
          )}
        </p>
      </div>
    );
  }

  if (!pinned) {
    return (
      <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-newTextColor leading-relaxed">
        {t(
          'pinned_post_none',
          'No pinned post on this X profile. Pin a tweet on X first — auto-DM will target that post once it appears.'
        )}
      </div>
    );
  }

  const when = pinned.createdAt
    ? new Date(pinned.createdAt).toLocaleString()
    : null;

  return (
    <div className="rounded-xl border border-newBorder bg-newBgColor px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-newTableText">
          {t('your_pinned_post', 'Your pinned post')}
          {username ? ` · @${username}` : ''}
        </p>
        <a
          href={pinned.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-btnPrimary hover:underline"
        >
          {t('view_on_x', 'View on X')}
        </a>
      </div>
      <p className="text-sm text-newTextColor whitespace-pre-wrap break-words leading-relaxed">
        {pinned.text}
      </p>
      <div className="flex flex-wrap gap-3 text-[11px] text-newTableText">
        {when && <span>{when}</span>}
        <span>
          {t('pinned_likes', '{{count}} likes', { count: pinned.likeCount })}
        </span>
        <span>
          {t('pinned_reposts', '{{count}} reposts', {
            count: pinned.repostCount,
          })}
        </span>
        <span>
          {t('pinned_replies', '{{count}} replies', {
            count: pinned.replyCount,
          })}
        </span>
      </div>
    </div>
  );
};

const SaveFooter: FC<{
  saving: boolean;
  disabled?: boolean;
  onSave: () => void;
}> = ({ saving, disabled, onSave }) => {
  const t = useT();
  return (
    <div className="flex justify-end pt-2 border-t border-newBorder/50 mt-4">
      <ProfileAutomationsPrimaryButton
        loading={saving}
        disabled={disabled}
        onClick={onSave}
        className="min-w-[140px]"
      >
        {saving
          ? t('saving', 'Saving...')
          : t('save_and_apply', 'Save & Apply')}
      </ProfileAutomationsPrimaryButton>
    </div>
  );
};

export const ProfileAutomationsPanel: FC = () => {
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

  const [pickedId, setPickedId] = useState('');

  useEffect(() => {
    if (!xIntegrations.length) {
      setPickedId('');
      return;
    }
    if (!pickedId || !xIntegrations.some((i) => i.id === pickedId)) {
      setPickedId(xIntegrations[0].id!);
    }
  }, [xIntegrations, pickedId]);

  const loadPlugs = useCallback(async () => {
    if (!pickedId) return [] as PlugRow[];
    const res = await fetch(`/integrations/${pickedId}/plugs`);
    if (!res.ok) return [] as PlugRow[];
    return (await res.json()) as PlugRow[];
  }, [pickedId, fetch]);

  const {
    data: plugs,
    isLoading: loadingPlugs,
    mutate: refetch,
  } = useSWR(
    pickedId ? `profile-automations-plugs-${pickedId}` : null,
    loadPlugs,
    { revalidateOnFocus: false }
  );

  const plugByFn = useCallback(
    (fn: string) => (plugs || []).find((p) => p.plugFunction === fn),
    [plugs]
  );

  const [savingKey, setSavingKey] = useState<string | null>(null);

  const savePlug = useCallback(
    async (
      key: string,
      func: string,
      enabled: boolean,
      fields: { name: string; value: string }[],
      existing?: PlugRow
    ) => {
      if (!pickedId) {
        toast.show(
          t('connect_x_first_profile', 'Connect your X account first'),
          'warning'
        );
        return;
      }
      setSavingKey(key);
      try {
        if (enabled) {
          await fetch(`/integrations/${pickedId}/plugs`, {
            method: 'POST',
            body: JSON.stringify({ func, fields }),
          });
        } else if (existing?.id) {
          await fetch(`/integrations/plugs/${existing.id}/activate`, {
            method: 'PUT',
            body: JSON.stringify({ status: false }),
          });
        }
        await refetch();
        toast.show(t('saved', 'Saved'), 'success');
      } catch {
        toast.show(t('save_failed', 'Save failed'), 'warning');
      } finally {
        setSavingKey(null);
      }
    },
    [pickedId, fetch, refetch, t, toast]
  );

  const autoDeletePlug = plugByFn('autoDeleteProfile');
  const repostDeletePlug = plugByFn('autoDeleteReposts');
  const pinnedDmPlug = plugByFn('autoDmPinnedPost');

  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState(false);
  const [ruleByDate, setRuleByDate] = useState(false);
  const [ruleByKeywords, setRuleByKeywords] = useState(false);
  const [ruleByTweetCount, setRuleByTweetCount] = useState(false);
  const [ruleByLikes, setRuleByLikes] = useState(false);
  const [dateOlderThanDays, setDateOlderThanDays] = useState('30');
  const [keywords, setKeywords] = useState('');
  const [maxTweetCount, setMaxTweetCount] = useState('1000');
  const [maxLikes, setMaxLikes] = useState('5');
  const [applyPosts, setApplyPosts] = useState(false);
  const [applyReposts, setApplyReposts] = useState(false);
  const [applyQuotes, setApplyQuotes] = useState(false);
  const [applyReplies, setApplyReplies] = useState(false);

  const [repostDeleteEnabled, setRepostDeleteEnabled] = useState(false);
  const [deleteAfterHours, setDeleteAfterHours] = useState('24');

  const [pinnedDmEnabled, setPinnedDmEnabled] = useState(false);
  const [pinnedTargetLike, setPinnedTargetLike] = useState(true);
  const [pinnedTargetRepost, setPinnedTargetRepost] = useState(true);
  const [pinnedTargetReply, setPinnedTargetReply] = useState(true);
  const [pinnedMessage, setPinnedMessage] = useState('');

  useEffect(() => {
    const f = parsePlugFields(autoDeletePlug?.data || '');
    setAutoDeleteEnabled(!!autoDeletePlug?.activated);
    setRuleByDate(boolField(f.ruleByDate));
    setRuleByKeywords(boolField(f.ruleByKeywords));
    setRuleByTweetCount(boolField(f.ruleByTweetCount));
    setRuleByLikes(boolField(f.ruleByLikes));
    setApplyPosts(boolField(f.applyPosts));
    setApplyReposts(boolField(f.applyReposts));
    setApplyQuotes(boolField(f.applyQuotes));
    setApplyReplies(boolField(f.applyReplies));
    setDateOlderThanDays(f.dateOlderThanDays || '30');
    setKeywords(f.keywords || '');
    setMaxTweetCount(f.maxTweetCount || '1000');
    setMaxLikes(f.maxLikes || '5');
  }, [autoDeletePlug]);

  const pickedIntegration = useMemo(
    () => xIntegrations.find((i) => i.id === pickedId),
    [xIntegrations, pickedId]
  );

  const { data: pinnedData, isLoading: loadingPinned } = useSWR(
    pickedId ? `x-pinned-tweet-${pickedId}` : null,
    async () => {
      const res = await fetch(`/integrations/${pickedId}/x-pinned-tweet`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raw = body?.message;
        const msg = Array.isArray(raw)
          ? raw[0]
          : typeof raw === 'string'
            ? raw
            : `Failed (${res.status})`;
        return {
          pinned: null as PinnedTweetPreview | null,
          error: String(msg),
        };
      }
      return body as {
        pinned: PinnedTweetPreview | null;
        error?: string;
      };
    },
    { revalidateOnFocus: true, refreshInterval: 60_000 }
  );

  useEffect(() => {
    const f = parsePlugFields(repostDeletePlug?.data || '');
    setRepostDeleteEnabled(!!repostDeletePlug?.activated);
    setDeleteAfterHours(f.deleteAfterHours || '24');
  }, [repostDeletePlug]);

  useEffect(() => {
    const f = parsePlugFields(pinnedDmPlug?.data || '');
    setPinnedDmEnabled(!!pinnedDmPlug?.activated);
    setPinnedTargetLike(f.targetLike !== 'false');
    setPinnedTargetRepost(f.targetRepost !== 'false');
    setPinnedTargetReply(f.targetReply !== 'false');
    setPinnedMessage(
      f.message ||
        '[tweet]\nHey! Thanks for engaging with my pinned post.'
    );
  }, [pinnedDmPlug]);

  const busy = loadingPlugs || !!savingKey;

  if (loadingIntegrations) {
    return (
      <ProfileAutomationsCard>
        <div className="h-40 animate-pulse rounded-xl bg-newBgLineColor/60" />
      </ProfileAutomationsCard>
    );
  }

  if (!xIntegrations.length) {
    return (
      <ProfileAutomationsEmpty variant="warning">
        {t(
          'connect_x_profile_automations',
          'Connect your X account to use profile automations.'
        )}
      </ProfileAutomationsEmpty>
    );
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6 w-full min-w-0">
      {xIntegrations.length > 1 && (
        <XProfileSingleSelect
          integrations={xIntegrations}
          selectedId={pickedId}
          onChange={setPickedId}
          disabled={busy}
        />
      )}

      <ProfileAutomationsSection
        title={t('auto_dm_new_followers', 'Auto DM new followers')}
        subtitle={t(
          'auto_dm_section_sub',
          'Send an automatic welcome message when someone new follows you.'
        )}
        icon={
          <ProfileAutomationsSectionIcon>
            <ProfileAutomationsNavIcon />
          </ProfileAutomationsSectionIcon>
        }
      >
        <FollowersPanel xIntegrationId={pickedId} />
      </ProfileAutomationsSection>

      <ProfileAutomationsCard borderless>
        <AutomationCardHeader
          enabled={autoDeleteEnabled}
          onToggle={setAutoDeleteEnabled}
          disabled={busy}
          title={t('auto_delete', 'Auto-Delete')}
          description={t(
            'auto_delete_desc',
            'Automatically delete your posts on X based on rules.'
          )}
        />

        <div className="mt-5 flex flex-col gap-4">
          <p className="text-xs text-newTableText leading-relaxed px-0.5">
            {t(
              'auto_delete_rules_help',
              'Turn on one or more rules. A post is deleted only when every enabled rule matches and its type is selected below. Each run scans your latest ~100 posts.'
            )}
          </p>

          <ProfileAutomationsInnerBox borderless title={t('rules', 'Rules')}>
            <div className="flex flex-col gap-3">
              <AutoDeleteRuleRow
                enabled={ruleByDate}
                onToggle={setRuleByDate}
                disabled={!autoDeleteEnabled || busy}
                label={t('rule_by_date', 'Based on date posted')}
                description={t(
                  'rule_by_date_desc',
                  'Delete posts older than the number of days you set.'
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{t('older_than', 'Older than')}</span>
                  <input
                    type="number"
                    min={1}
                    value={dateOlderThanDays}
                    onChange={(e) => setDateOlderThanDays(e.target.value)}
                    disabled={!autoDeleteEnabled || busy}
                    className="w-16 rounded-lg border border-newBorder bg-newBgColorInner px-2 py-1 text-sm"
                  />
                  <span>{t('days', 'days')}</span>
                </div>
              </AutoDeleteRuleRow>

              <AutoDeleteRuleRow
                enabled={ruleByKeywords}
                onToggle={setRuleByKeywords}
                disabled={!autoDeleteEnabled || busy}
                label={t('rule_by_keywords', 'Based on keywords')}
                description={t(
                  'rule_by_keywords_desc',
                  'Delete if the tweet text contains any of these words (comma-separated).'
                )}
              >
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  disabled={!autoDeleteEnabled || busy}
                  placeholder={t(
                    'keywords_placeholder',
                    'e.g. giveaway, promo, test'
                  )}
                  className="w-full rounded-lg border border-newBorder bg-newBgColorInner px-3 py-2 text-sm"
                />
              </AutoDeleteRuleRow>

              <AutoDeleteRuleRow
                enabled={ruleByTweetCount}
                onToggle={setRuleByTweetCount}
                disabled={!autoDeleteEnabled || busy}
                label={t('rule_by_tweet_count', 'Based on tweet count')}
                description={t(
                  'rule_by_tweet_count_desc',
                  'Keep only your newest matching posts — delete the oldest when you have more than this limit.'
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{t('keep_newest', 'Keep at most')}</span>
                  <input
                    type="number"
                    min={1}
                    value={maxTweetCount}
                    onChange={(e) => setMaxTweetCount(e.target.value)}
                    disabled={!autoDeleteEnabled || busy}
                    className="w-20 rounded-lg border border-newBorder bg-newBgColorInner px-2 py-1 text-sm"
                  />
                  <span>{t('matching_posts', 'matching posts')}</span>
                </div>
              </AutoDeleteRuleRow>

              <AutoDeleteRuleRow
                enabled={ruleByLikes}
                onToggle={setRuleByLikes}
                disabled={!autoDeleteEnabled || busy}
                label={t('rule_by_likes', 'Based on likes')}
                description={t(
                  'rule_by_likes_desc',
                  'Delete posts with this many likes or fewer (low engagement).'
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{t('at_most', 'At most')}</span>
                  <input
                    type="number"
                    min={0}
                    value={maxLikes}
                    onChange={(e) => setMaxLikes(e.target.value)}
                    disabled={!autoDeleteEnabled || busy}
                    className="w-16 rounded-lg border border-newBorder bg-newBgColorInner px-2 py-1 text-sm"
                  />
                  <span>{t('likes', 'likes')}</span>
                </div>
              </AutoDeleteRuleRow>
            </div>
          </ProfileAutomationsInnerBox>

          <ProfileAutomationsInnerBox
            borderless
            title={t('apply_rules_to', 'Apply rules to:')}
          >
            <p className="mb-3 text-xs text-newTableText">
              {t(
                'apply_rules_to_help',
                'Only these post types are considered for deletion.'
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  [applyPosts, setApplyPosts, t('apply_posts', 'Posts (tweets)')],
                  [
                    applyReposts,
                    setApplyReposts,
                    t('apply_reposts', 'Reposts (retweets)'),
                  ],
                  [
                    applyQuotes,
                    setApplyQuotes,
                    t('apply_quotes', 'Quotes (quoted tweets)'),
                  ],
                  [
                    applyReplies,
                    setApplyReplies,
                    t('apply_replies', 'Replies (replies to tweets)'),
                  ],
                ] as const
              ).map(([checked, setChecked, label]) => (
                <label
                  key={label}
                  className="flex items-center gap-2 text-sm text-newTextColor cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                    disabled={!autoDeleteEnabled || busy}
                    className="h-4 w-4 rounded border-newBorder text-btnPrimary focus:ring-btnPrimary/30"
                  />
                  {label}
                </label>
              ))}
            </div>
          </ProfileAutomationsInnerBox>
        </div>

        <SaveFooter
          saving={savingKey === 'autoDelete'}
          disabled={busy}
          onSave={() => {
            if (autoDeleteEnabled) {
              const anyRule =
                ruleByDate ||
                ruleByKeywords ||
                ruleByTweetCount ||
                ruleByLikes;
              const anyType =
                applyPosts || applyReposts || applyQuotes || applyReplies;
              if (!anyRule) {
                toast.show(
                  t(
                    'auto_delete_need_rule',
                    'Turn on at least one delete rule.'
                  ),
                  'warning'
                );
                return;
              }
              if (!anyType) {
                toast.show(
                  t(
                    'auto_delete_need_type',
                    'Select at least one post type to apply rules to.'
                  ),
                  'warning'
                );
                return;
              }
              if (ruleByKeywords && !keywords.trim()) {
                toast.show(
                  t(
                    'auto_delete_need_keywords',
                    'Enter at least one keyword when the keyword rule is on.'
                  ),
                  'warning'
                );
                return;
              }
            }
            savePlug(
              'autoDelete',
              'autoDeleteProfile',
              autoDeleteEnabled,
              [
                { name: 'ruleByDate', value: boolToField(ruleByDate) },
                { name: 'ruleByKeywords', value: boolToField(ruleByKeywords) },
                {
                  name: 'ruleByTweetCount',
                  value: boolToField(ruleByTweetCount),
                },
                { name: 'ruleByLikes', value: boolToField(ruleByLikes) },
                {
                  name: 'dateOlderThanDays',
                  value: String(Math.max(1, Number(dateOlderThanDays) || 30)),
                },
                { name: 'keywords', value: keywords.trim() },
                {
                  name: 'maxTweetCount',
                  value: String(Math.max(1, Number(maxTweetCount) || 1000)),
                },
                {
                  name: 'maxLikes',
                  value: String(Math.max(0, Number(maxLikes) || 5)),
                },
                { name: 'applyPosts', value: boolToField(applyPosts) },
                { name: 'applyReposts', value: boolToField(applyReposts) },
                { name: 'applyQuotes', value: boolToField(applyQuotes) },
                { name: 'applyReplies', value: boolToField(applyReplies) },
              ],
              autoDeletePlug
            );
          }}
        />
      </ProfileAutomationsCard>

      <ProfileAutomationsCard>
        <AutomationCardHeader
          enabled={repostDeleteEnabled}
          onToggle={setRepostDeleteEnabled}
          disabled={busy}
          title={t('repost_auto_delete', 'Repost Auto-Delete')}
          description={t(
            'repost_auto_delete_desc',
            'Delete your reposts (retweets) after a certain period of time.'
          )}
        />

        <div className="mt-5">
          <ProfileAutomationsInnerBox title={t('rules', 'Rules')}>
            <div className="flex flex-wrap items-center gap-2 text-sm text-newTextColor">
              <span>{t('delete_after', 'Delete after')}</span>
              <input
                type="number"
                min={1}
                max={48}
                value={deleteAfterHours}
                onChange={(e) => setDeleteAfterHours(e.target.value)}
                disabled={!repostDeleteEnabled || busy}
                className="w-16 rounded-lg border border-newBorder bg-newBgColorInner px-2 py-1 text-sm text-newTextColor"
              />
              <span>
                {t('hours_max_48', 'hours Max. 48 hours.')}
              </span>
            </div>
          </ProfileAutomationsInnerBox>
        </div>

        <SaveFooter
          saving={savingKey === 'repostDelete'}
          disabled={busy}
          onSave={() => {
            const hours = Math.min(
              48,
              Math.max(1, Number(deleteAfterHours) || 24)
            );
            savePlug(
              'repostDelete',
              'autoDeleteReposts',
              repostDeleteEnabled,
              [{ name: 'deleteAfterHours', value: String(hours) }],
              repostDeletePlug
            );
          }}
        />
      </ProfileAutomationsCard>

      <ProfileAutomationsCard>
        <AutomationCardHeader
          enabled={pinnedDmEnabled}
          onToggle={setPinnedDmEnabled}
          disabled={busy}
          title={t('pinned_post_auto_dm', 'Pinned Post Auto-DM')}
          description={t(
            'pinned_post_auto_dm_desc',
            'Send a DM when people interact with your pinned post.'
          )}
        />

        <div className="mt-5 flex flex-col gap-4">
          <ProfileAutomationsInnerBox title={t('pinned_post', 'Pinned post')}>
            <PinnedPostPreviewCard
              loading={loadingPinned}
              pinned={pinnedData?.pinned}
              error={pinnedData?.error}
              username={pickedIntegration?.display}
            />
          </ProfileAutomationsInnerBox>

          <ProfileAutomationsInnerBox title={t('conditions', 'Conditions')}>
            <p className="mb-3 text-xs text-newTableText">
              {t(
                'pinned_dm_conditions_intro',
                'When someone engages with the pinned post above, they get a DM if they:'
              )}
            </p>
            <div className="flex flex-col gap-2">
              {(
                [
                  [pinnedTargetRepost, setPinnedTargetRepost, 'repost (retweet)'],
                  [pinnedTargetReply, setPinnedTargetReply, 'reply'],
                  [pinnedTargetLike, setPinnedTargetLike, 'like'],
                ] as const
              ).map(([checked, setChecked, label]) => (
                <label
                  key={label}
                  className="flex items-center gap-2 text-sm text-newTextColor cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                    disabled={!pinnedDmEnabled || busy}
                    className="h-4 w-4 rounded border-newBorder text-btnPrimary focus:ring-btnPrimary/30"
                  />
                  {label}
                </label>
              ))}
            </div>
          </ProfileAutomationsInnerBox>

          <ProfileAutomationsInnerBox title={t('dm_content', 'DM Content')}>
            <p className="mb-2 text-xs text-newTableText leading-relaxed">
              {t(
                'pinned_dm_content_intro',
                'When condition is filled, user gets the following DM'
              )}
            </p>
            <p className="mb-2 text-[11px] text-newTableText leading-relaxed">
              {t(
                'pinned_dm_disclosure',
                "When using this feature, you need to make people aware they will get a DM from you by adding words like 'dm', 'message' or 'send' in the original tweet"
              )}
            </p>
            <p className="mb-3 text-[11px] text-newTableText">
              {t(
                'pinned_dm_limit',
                'Note: You can send a maximum of 500 per 24 hour period.'
              )}
            </p>
            <textarea
              value={pinnedMessage}
              onChange={(e) => setPinnedMessage(e.target.value)}
              disabled={!pinnedDmEnabled || busy}
              rows={6}
              className={clsx(
                'w-full rounded-xl border border-newBorder bg-newBgColorInner',
                'px-4 py-3 text-sm text-newTextColor resize-y min-h-[140px]',
                'focus:border-btnPrimary/50 focus:ring-2 focus:ring-btnPrimary/15 outline-none',
                (!pinnedDmEnabled || busy) && 'opacity-60'
              )}
            />
            <p className="mt-2 text-xs text-newTableText leading-relaxed">
              {t(
                'pinned_dm_message_hint',
                'Use [tweet] in the message to insert a link to your pinned post.'
              )}
            </p>
          </ProfileAutomationsInnerBox>
        </div>

        <SaveFooter
          saving={savingKey === 'pinnedDm'}
          disabled={busy}
          onSave={() => {
            if (pinnedDmEnabled && pinnedMessage.trim().length < 3) {
              toast.show(
                t('pinned_dm_too_short', 'DM message must be at least 3 characters'),
                'warning'
              );
              return;
            }
            savePlug(
              'pinnedDm',
              'autoDmPinnedPost',
              pinnedDmEnabled,
              [
                { name: 'message', value: pinnedMessage.trim() },
                { name: 'targetLike', value: boolToField(pinnedTargetLike) },
                { name: 'targetRepost', value: boolToField(pinnedTargetRepost) },
                { name: 'targetReply', value: boolToField(pinnedTargetReply) },
              ],
              pinnedDmPlug
            );
          }}
        />
      </ProfileAutomationsCard>
    </div>
  );
};
