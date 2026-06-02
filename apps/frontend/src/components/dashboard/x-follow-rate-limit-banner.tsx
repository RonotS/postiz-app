'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  XFollowRateLimit,
  XGraphRateAction,
} from '@gitroom/frontend/components/dashboard/use-x-follow-rate-limit';

export const XFollowRateLimitBanner: FC<{
  rateLimit?: XFollowRateLimit;
  countdown: string;
  dailyCountdown?: string;
  /** Follow actions use the 24h daily rolling timer, not the 15-min window. */
  usesDailyTimer?: boolean;
  className?: string;
  action?: XGraphRateAction;
}> = ({
  rateLimit,
  countdown,
  dailyCountdown,
  usesDailyTimer = false,
  className,
  action = 'follow',
}) => {
  const t = useT();

  const windowPct =
    rateLimit && rateLimit.limit > 0
      ? Math.min(100, (rateLimit.count / rateLimit.limit) * 100)
      : 0;

  const dailyPct =
    rateLimit?.daily?.limit && rateLimit.daily.limit > 0
      ? Math.min(
          100,
          (rateLimit.daily.count / rateLimit.daily.limit) * 100
        )
      : 0;

  const showDaily = action === 'follow' && !!rateLimit?.daily;
  const showWindowProgress = action === 'unfollow' || action === 'follow';

  const showTimer = !!(
    rateLimit &&
    (rateLimit.limited ||
      (usesDailyTimer
        ? rateLimit.daily?.limited
        : rateLimit.remaining < rateLimit.limit))
  );

  if (!rateLimit) {
    return null;
  }

  return (
    <div
      className={clsx(
        'w-full min-w-0 rounded-2xl px-4 py-3 sm:px-5 sm:py-4',
        rateLimit.limited ? 'bg-amber-500/10' : 'bg-newBgColorInner',
        className
      )}
      role="status"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {showDaily && rateLimit.daily && (
              <div
                className={clsx(
                  'shrink-0 rounded-xl px-3 py-2 text-center tabular-nums',
                  rateLimit.limited && rateLimit.limitedBy === 'daily'
                    ? 'bg-amber-500/15'
                    : 'bg-newBgColor'
                )}
              >
                <p className="text-[10px] uppercase tracking-wide text-newTableText">
                  {t('x_follow_daily_counter', '{{hours}}h daily cap', {
                    hours: rateLimit.daily.windowHours,
                  })}
                </p>
                <p className="text-lg font-bold text-newTextColor">
                  {rateLimit.daily.count}
                  <span className="font-medium text-newTableText"> / </span>
                  {rateLimit.daily.limit}
                </p>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-newTextColor">
              {rateLimit.limited
                ? action === 'unfollow'
                  ? t(
                      'x_unfollow_limit_reached_title',
                      'Unfollow limit reached for this profile'
                    )
                  : rateLimit.limitedBy === 'daily' && rateLimit.daily
                    ? t(
                        'x_follow_daily_limit_reached_title_applied',
                        'Following {{count}} of {{limit}} today — rate limit applied',
                        {
                          count: rateLimit.daily.count,
                          limit: rateLimit.daily.limit,
                        }
                      )
                    : t(
                        'x_follow_limit_reached_title',
                        'Follow limit reached for this profile'
                      )
                : action === 'unfollow'
                  ? t('x_unfollow_limit_title', 'Unfollow rate (X API)')
                  : showDaily && rateLimit.daily
                    ? t('x_follow_limit_title_daily', 'Follow activity (daily cap)')
                    : t('x_follow_limit_title', 'Follow daily cap (X)')}
            </p>
            <p className="mt-0.5 text-xs text-newTableText leading-relaxed">
              {rateLimit.limited
                ? action === 'unfollow'
                  ? t(
                      'x_unfollow_limit_reached_desc',
                      'You have unfollowed {{count}} accounts in the last {{minutes}} minutes (max {{limit}}). Unfollow actions are paused until the window resets.',
                      {
                        count: rateLimit.count,
                        minutes: rateLimit.windowMinutes,
                        limit: rateLimit.limit,
                      }
                    )
                  : rateLimit.limitedBy === 'daily' && rateLimit.daily
                    ? t(
                        'x_follow_daily_limit_reached_desc',
                        'Following {{count}} of {{limit}} accounts in the last {{hours}} hours — rate limit applied. Follow is paused until the daily window resets.',
                        {
                          count: rateLimit.daily.count,
                          hours: rateLimit.daily.windowHours,
                          limit: rateLimit.daily.limit,
                        }
                      )
                    : t(
                        'x_follow_limit_reached_desc',
                        'You have followed {{count}} accounts in the last {{minutes}} minutes (max {{limit}}). Follow actions are paused until the window resets.',
                        {
                          count: rateLimit.count,
                          minutes: rateLimit.windowMinutes,
                          limit: rateLimit.limit,
                        }
                      )
                : action === 'unfollow'
                  ? t(
                      'x_unfollow_limit_desc',
                      '{{count}} of {{limit}} unfollows used in the last {{minutes}} minutes. Up to {{remaining}} more until the window resets.',
                      {
                        count: rateLimit.count,
                        limit: rateLimit.limit,
                        minutes: rateLimit.windowMinutes,
                        remaining: rateLimit.remaining,
                      }
                    )
                  : showDaily && rateLimit.daily
                    ? t(
                        'x_follow_limit_desc_daily',
                        'Following {{dailyCount}} of {{dailyLimit}} accounts in the last {{hours}} hours ({{remaining}} left today). Batches are capped at {{batchLimit}} per {{minutes}} minutes.',
                        {
                          dailyCount: rateLimit.daily.count,
                          dailyLimit: rateLimit.daily.limit,
                          hours: rateLimit.daily.windowHours,
                          remaining: rateLimit.daily.remaining,
                          batchLimit: rateLimit.limit,
                          minutes: rateLimit.windowMinutes,
                        }
                      )
                    : t(
                        'x_follow_limit_desc',
                        '{{count}} of {{limit}} follows used in the last {{minutes}} minutes. Up to {{remaining}} more until the window resets.',
                        {
                          count: rateLimit.count,
                          limit: rateLimit.limit,
                          minutes: rateLimit.windowMinutes,
                          remaining: rateLimit.remaining,
                        }
                      )}
            </p>
          </div>
          {countdown && showTimer && (
            <div
              className={clsx(
                'shrink-0 rounded-xl px-3 py-2 text-center',
                rateLimit.limited ? 'bg-amber-500/10' : 'bg-newBgColor'
              )}
            >
              <p className="text-[10px] uppercase tracking-wide text-newTableText">
                {usesDailyTimer || rateLimit.limitedBy === 'daily'
                  ? rateLimit.limited
                    ? t('daily_resets_in', 'Daily cap resets in')
                    : t(
                        'daily_rolling_reset_in',
                        'Daily rolling reset in'
                      )
                  : rateLimit.limited
                    ? action === 'unfollow'
                      ? t('unfollow_again_in', 'Unfollow again in')
                      : t('follow_again_in', 'Follow again in')
                    : t('window_resets_in', '15-min window resets in')}
              </p>
              <p className="text-lg font-semibold tabular-nums text-newTextColor">
                {usesDailyTimer || rateLimit.limitedBy === 'daily'
                  ? dailyCountdown || countdown
                  : countdown}
              </p>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          {showDaily && rateLimit.daily && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-newBgLineColor/80">
              <div
                className={clsx(
                  'h-full rounded-full transition-all duration-300',
                  rateLimit.limited && rateLimit.limitedBy === 'daily'
                    ? 'bg-amber-500'
                    : 'bg-violet-500'
                )}
                style={{ width: `${dailyPct}%` }}
              />
            </div>
          )}
          {showWindowProgress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-newTableText">
                <span>
                  {action === 'unfollow'
                    ? t('x_unfollow_progress_label', 'Unfollow window progress')
                    : t(
                        'x_follow_window_progress_label',
                        '15-min batch window ({{minutes}} min)',
                        { minutes: rateLimit.windowMinutes }
                      )}
                </span>
                <span className="tabular-nums">
                  {rateLimit.count}/{rateLimit.limit}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-newBgLineColor/80">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-300',
                    rateLimit.limited && rateLimit.limitedBy !== 'daily'
                      ? 'bg-amber-500'
                      : 'bg-btnPrimary/70'
                  )}
                  style={{ width: `${windowPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
