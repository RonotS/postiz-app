'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { XFollowRateLimit } from '@gitroom/frontend/components/dashboard/use-x-follow-rate-limit';

export const XFollowRateLimitBanner: FC<{
  rateLimit?: XFollowRateLimit;
  countdown: string;
  className?: string;
}> = ({ rateLimit, countdown, className }) => {
  const t = useT();

  if (!rateLimit) {
    return null;
  }

  const pct =
    rateLimit.limit > 0
      ? Math.min(100, (rateLimit.count / rateLimit.limit) * 100)
      : 0;

  return (
    <div
      className={clsx(
        'w-full min-w-0 rounded-2xl border px-4 py-3 sm:px-5 sm:py-4',
        rateLimit.limited
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-newBorder/80 bg-newBgColorInner/60',
        className
      )}
      role="status"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-newTextColor">
            {rateLimit.limited
              ? t(
                  'x_follow_limit_reached_title',
                  'Follow limit reached for this profile'
                )
              : t('x_follow_limit_title', 'Follow rate (X API)')}
          </p>
          <p className="mt-0.5 text-xs text-newTableText leading-relaxed">
            {rateLimit.limited
              ? t(
                  'x_follow_limit_reached_desc',
                  'You have followed {{count}} accounts in the last {{minutes}} minutes (max {{limit}}). Follow actions are paused until the window resets.',
                  {
                    count: rateLimit.count,
                    minutes: rateLimit.windowMinutes,
                    limit: rateLimit.limit,
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
        {rateLimit.limited && countdown && (
          <div className="shrink-0 rounded-xl border border-amber-500/30 bg-newBgColor/50 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-newTableText">
              {t('resets_in', 'Resets in')}
            </p>
            <p className="text-lg font-semibold tabular-nums text-newTextColor">
              {countdown}
            </p>
          </div>
        )}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-newBgLineColor/80">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-300',
            rateLimit.limited ? 'bg-amber-500' : 'bg-btnPrimary'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
