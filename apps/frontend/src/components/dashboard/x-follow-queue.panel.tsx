'use client';

import { FC, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  ProfileAutomationsCard,
  ProfileAutomationsGhostButton,
} from '@gitroom/frontend/components/dashboard/profile-automations.ui';
import { useXFollowQueue } from '@gitroom/frontend/components/dashboard/use-x-follow-queue';
import { formatCompactCount } from '@gitroom/frontend/components/dashboard/follower-list-filters';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';

function formatResetsIn(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const XFollowQueuePanel: FC<{
  integrationId: string;
  compact?: boolean;
}> = ({ integrationId, compact }) => {
  const t = useT();
  const toast = useToaster();
  const fetch = useFetch();
  const { status, mutate, isLoading, isValidating } =
    useXFollowQueue(integrationId);

  const pendingTotal = useMemo(
    () => (status?.pending ?? 0) + (status?.processing ?? 0),
    [status]
  );

  const cancelItem = useCallback(
    async (itemId: string) => {
      const res = await fetch(
        `/integrations/${integrationId}/x-follow-queue/${itemId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        toast.show(t('queue_cancel_failed', 'Could not cancel queue item'), 'warning');
        return;
      }
      void mutate(await res.json(), { revalidate: false });
    },
    [integrationId, fetch, mutate, toast, t]
  );

  const clearCompleted = useCallback(async () => {
    const res = await fetch(`/integrations/${integrationId}/x-follow-queue`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.show(t('queue_clear_failed', 'Could not clear queue'), 'warning');
      return;
    }
    void mutate((await res.json()).status, { revalidate: false });
  }, [integrationId, fetch, mutate, toast, t]);

  if (!integrationId) {
    return null;
  }

  if (isLoading && !status) {
    return (
      <ProfileAutomationsCard>
        <div className="h-24 animate-pulse rounded-xl bg-newBgLineColor/40" />
      </ProfileAutomationsCard>
    );
  }

  if (!status && compact) {
    return null;
  }

  const window = status?.window;
  const daily = status?.rateLimit?.daily;

  return (
    <ProfileAutomationsCard className={clsx(compact && 'border-btnPrimary/20')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-newTextColor">
              {t('follow_queue_title', 'Follow queue')}
            </h3>
            <p className="mt-1 text-xs text-newTableText leading-relaxed max-w-prose">
              {t(
                'follow_queue_desc',
                'Queued follows run automatically in batches (up to {{windowLimit}} per {{windowMinutes}} minutes, {{dailyLimit}} per day).',
                {
                  windowLimit: window?.limit ?? 50,
                  windowMinutes: window?.windowMinutes ?? 15,
                  dailyLimit: status?.dailyLimit ?? 400,
                }
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-newBorder bg-newBgColor/40 px-3 py-2">
            <p className="text-[10px] uppercase text-newTableText">
              {t('queue_pending', 'Pending')}
            </p>
            <p className="text-lg font-bold tabular-nums text-newTextColor">
              {formatCompactCount(pendingTotal)}
            </p>
          </div>
          <div className="rounded-xl border border-newBorder bg-newBgColor/40 px-3 py-2">
            <p className="text-[10px] uppercase text-newTableText">
              {t('queue_next_window', 'Next {{minutes}}m window', {
                minutes: window?.windowMinutes ?? 15,
              })}
            </p>
            <p className="text-lg font-bold tabular-nums text-newTextColor">
              {window?.nextBatchSize ?? 0}
              <span className="text-sm font-medium text-newTableText">
                {' '}
                / {window?.remaining ?? 0}
              </span>
            </p>
            {status?.nextWindowAt && (
              <p className="text-[10px] text-newTableText mt-0.5">
                {t('resets_in', 'Resets in')} {formatResetsIn(status.nextWindowAt)}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-newBorder bg-newBgColor/40 px-3 py-2">
            <p className="text-[10px] uppercase text-newTableText">
              {t('queue_daily_left', 'Daily left')}
            </p>
            <p className="text-lg font-bold tabular-nums text-newTextColor">
              {daily?.remaining ?? status?.dailyRemaining ?? 0}
              <span className="text-sm font-medium text-newTableText">
                {' '}
                / {daily?.limit ?? status?.dailyLimit ?? 400}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-newBorder bg-newBgColor/40 px-3 py-2">
            <p className="text-[10px] uppercase text-newTableText">
              {t('queue_completed', 'Completed')}
            </p>
            <p className="text-lg font-bold tabular-nums text-newTextColor">
              {formatCompactCount(status?.completed ?? 0)}
            </p>
          </div>
        </div>

        {pendingTotal > 0 && window && (
          <p className="text-xs text-newTableText rounded-lg bg-newBgColor/50 border border-newBorder px-3 py-2">
            {status.nextWindowAt
              ? t(
                  'queue_waiting_window',
                  'Next batch of up to {{count}} follows runs when the {{minutes}}-minute window resets ({{timer}}).',
                  {
                    count: window.nextBatchSize,
                    minutes: window.windowMinutes,
                    timer: formatResetsIn(status.nextWindowAt),
                  }
                )
              : t(
                  'queue_processing_now',
                  'Processing up to {{count}} follows in the current {{minutes}}-minute window ({{used}}/{{limit}} used).',
                  {
                    count: window.nextBatchSize,
                    minutes: window.windowMinutes,
                    used: window.used,
                    limit: window.limit,
                  }
                )}
          </p>
        )}

        {status?.items && status.items.length > 0 && (
          <div className="max-h-[min(420px,50vh)] overflow-auto rounded-xl border border-newBorder">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="border-b border-newBorder bg-newBgColor/50 text-newTableText">
                  <th className="px-3 py-2 text-start font-semibold">
                    {t('col_account', 'Account')}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {t('col_scheduled', 'Scheduled follow')}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {t('col_status', 'Status')}
                  </th>
                  <th className="px-3 py-2 text-end font-semibold">
                    {t('col_actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {status.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-newBorder/50 last:border-0"
                  >
                    <td className="px-3 py-2 text-newTextColor">
                      @{item.targetUsername || item.targetUserId}
                    </td>
                    <td className="px-3 py-2 text-newTableText tabular-nums whitespace-nowrap">
                      {item.scheduledFollowAt
                        ? newDayjs(item.scheduledFollowAt)
                            .local()
                            .format('D MMM, HH:mm')
                        : item.status === 'pending'
                          ? t('queue_schedule_pending', 'After rate limit')
                          : '—'}
                    </td>
                    <td className="px-3 py-2 capitalize text-newTableText">
                      {item.status}
                      {item.error ? (
                        <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                          {item.error}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-end">
                      {item.status === 'pending' && (
                        <button
                          type="button"
                          className="text-btnPrimary hover:underline"
                          onClick={() => void cancelItem(item.id)}
                        >
                          {t('cancel', 'Cancel')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(status?.completed ?? 0) + (status?.cancelled ?? 0) > 0 && (
          <div className="flex justify-end">
            <ProfileAutomationsGhostButton
              className="!px-3 !py-1.5 text-xs"
              onClick={() => void clearCompleted()}
            >
              {t('clear_completed_queue', 'Clear completed')}
            </ProfileAutomationsGhostButton>
          </div>
        )}

        {isValidating && (
          <p className="text-[10px] text-newTableText/70">
            {t('queue_refreshing', 'Refreshing queue…')}
          </p>
        )}
      </div>
    </ProfileAutomationsCard>
  );
};
