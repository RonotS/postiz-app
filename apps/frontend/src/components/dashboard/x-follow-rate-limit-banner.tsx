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
  className?: string;
  action?: XGraphRateAction;
}> = ({
  rateLimit,
  countdown,
  dailyCountdown,
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
  const showWindowForAction = action === 'unfollow';

  const showTimer = !!(
    rateLimit &&
    (rateLimit.limited ||
      rateLimit.remaining < rateLimit.limit ||
      (showDaily &&
        rateLimit.daily &&
        rateLimit.daily.remaining < rateLimit.daily.limit))
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
            {showWindowForAction && (
              <div
                className={clsx(
                  'shrink-0 rounded-xl px-3 py-2 text-center tabular-nums',
                  rateLimit.limited && rateLimit.limitedBy !== 'daily'
                    ? 'bg-amber-500/15'
                    : 'bg-newBgColor'
                )}
              >
                <p className="text-[10px] uppercase tracking-wide text-newTableText">
                  {t('x_follow_counter', '{{minutes}} min window', {
                    minutes: rateLimit.windowMinutes,
                  })}
                </p>
                <p className="text-lg font-bold text-newTextColor">
                  {rateLimit.count}
                  <span className="font-medium text-newTableText"> / </span>
                  {rateLimit.limit}
                </p>
              </div>
            )}
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
                  : rateLimit.limitedBy === 'daily'
                    ? t(
                        'x_follow_daily_limit_reached_title',
                        'Daily follow limit reached'
                      )
                    : t(
                        'x_follow_limit_reached_title',
                        'Follow limit reached for this profile'
                      )
                : action === 'unfollow'
                  ? t('x_unfollow_limit_title', 'Unfollow rate (X API)')
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
                        'You have followed {{count}} accounts in the last {{hours}} hours (max {{limit}} per day). Follow is paused until the daily window resets.',
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
                        '{{dailyCount}}/{{dailyLimit}} in {{hours}}h. Up to {{remaining}} more follows allowed now.',
                        {
                          dailyCount: rateLimit.daily.count,
                          dailyLimit: rateLimit.daily.limit,
                          hours: rateLimit.daily.windowHours,
                          remaining: rateLimit.daily.remaining,
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
                {rateLimit.limited
                  ? rateLimit.limitedBy === 'daily'
                    ? t('daily_resets_in', 'Daily resets in')
                    : action === 'unfollow'
                      ? t('unfollow_again_in', 'Unfollow again in')
                      : t('follow_again_in', 'Follow again in')
                  : t('window_resets_in', 'Window resets in')}
              </p>
              <p className="text-lg font-semibold tabular-nums text-newTextColor">
                {rateLimit.limitedBy === 'daily' && dailyCountdown
                  ? dailyCountdown
                  : countdown}
              </p>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          {showWindowForAction && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-newBgLineColor/80">
              <div
                className={clsx(
                  'h-full rounded-full transition-all duration-300',
                  rateLimit.limited && rateLimit.limitedBy !== 'daily'
                    ? 'bg-amber-500'
                    : 'bg-btnPrimary'
                )}
                style={{ width: `${windowPct}%` }}
              />
            </div>
          )}
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
        </div>
      </div>
    </div>
  );
};
