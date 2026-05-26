'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { XPlugBatchRateLimit } from '@gitroom/frontend/components/dashboard/use-x-plug-batch-rate-limit';

export const XPlugBatchRateLimitBanner: FC<{
  rateLimit?: XPlugBatchRateLimit;
  countdown: string;
  pollMinutes: number;
  className?: string;
}> = ({ rateLimit, countdown, pollMinutes, className }) => {
  const t = useT();

  if (!rateLimit) {
    return null;
  }

  const dmPct =
    rateLimit.dmWindow.limit > 0
      ? Math.min(
          100,
          (rateLimit.dmWindow.count / rateLimit.dmWindow.limit) * 100
        )
      : 0;

  return (
    <div
      className={clsx(
        'w-full min-w-0 rounded-2xl px-4 py-3 sm:px-5 sm:py-4',
        rateLimit.limited ? 'bg-amber-500/10' : 'bg-newBgColorInner',
        className
      )}
    >
      <p className="text-sm font-semibold text-newTextColor">
        {t('x_plug_batch_title', 'X auto-DM batching')}
      </p>
      <p className="mt-1 text-xs text-newTableText leading-relaxed">
        {t(
          'x_plug_batch_realtime_hint',
          'TweetStream sends replies and reposts in near real time when the backend WebSocket is running. Likes are not streamed — they are picked up by a poller about every {{minutes}} minutes.',
          { minutes: pollMinutes }
        )}
      </p>
      <p className="mt-1 text-xs text-newTableText/80 leading-relaxed">
        {t(
          'x_plug_batch_dm_window_hint',
          'The counter below is X’s DM quota ({{limit}} per 15 minutes), not the poll timer. At 0/{{limit}} you can still send DMs until the quota fills.',
          { limit: rateLimit.dmWindow.limit }
        )}
      </p>

      {rateLimit.queuedEstimate > 0 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          {t(
            'x_plug_batch_queued',
            '~{{count}} post checks queued for the next batch.',
            { count: rateLimit.queuedEstimate }
          )}
        </p>
      )}

      {rateLimit.limited && rateLimit.dmWindow.remaining <= 0 && (
        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          {rateLimit.limitedBy === 'api_429'
            ? t(
                'x_plug_batch_limited_429',
                'X API cooldown — poller waits until {{time}}. Realtime reply/repost DMs still send when WebSocket is active.',
                { time: countdown || '…' }
              )
            : t(
                'x_plug_batch_limited_dm',
                'DM cap reached (15 per 15 min) — poller waits until {{time}}.',
                { time: countdown || '…' }
              )}
        </p>
      )}

      <div className="mt-3">
        <div className="flex justify-between text-[10px] text-newTableText mb-1">
          <span>{t('x_plug_batch_dm_window', 'DMs (15 min window)')}</span>
          <span>
            {rateLimit.dmWindow.count}/{rateLimit.dmWindow.limit}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-newBgLineColor overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              dmPct >= 100 ? 'bg-amber-500' : 'bg-primary'
            )}
            style={{ width: `${dmPct}%` }}
          />
        </div>
      </div>
    </div>
  );
};
