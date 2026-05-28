'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  ProfileAutomationsCard,
  ProfileAutomationsGhostButton,
} from '@gitroom/frontend/components/dashboard/profile-automations.ui';
import { useXFollowQueue } from '@gitroom/frontend/components/dashboard/use-x-follow-queue';
import type { XFollowQueueStatus } from '@gitroom/frontend/components/dashboard/use-x-follow-queue';
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

function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return newDayjs(d).local().format('D MMM, HH:mm');
}

function createSampleQueueStatus(): XFollowQueueStatus {
  const now = Date.now();
  const windowMinutes = 15;
  const windowMs = windowMinutes * 60 * 1000;
  const today = new Date();
  today.setSeconds(0, 0);
  const slotStart = new Date(today);
  slotStart.setHours(11, 0, 0, 0);
  const currentWindowStart = slotStart.getTime();
  const currentWindowEnd = currentWindowStart + windowMs;
  const dayReset = now + 18 * 60 * 60 * 1000;

  const items = Array.from({ length: 90 }, (_, index) => {
    const n = index + 1;
    const slot = Math.floor(index / 15);
    const slotStart = currentWindowStart + slot * windowMs;
    const slotIso = new Date(slotStart).toISOString();
    const status: 'completed' = 'completed';
    const base = {
      id: `sample-${n}`,
      integrationId: 'sample',
      orgId: 'sample',
      targetUserId: `${1000 + n}`,
      targetUsername: `sample_profile_${String(n).padStart(2, '0')}`,
      targetName: `Sample Profile ${n}`,
      status: (slot === 2 || slot === 3 ? 'pending' : status) as
        | 'pending'
        | 'processing'
        | 'completed'
        | 'failed'
        | 'cancelled',
      createdAt: new Date(now - (120 - n) * 60 * 1000).toISOString(),
      scheduledFollowAt: slotIso,
      processedAt:
        slot === 2 || slot === 3
          ? undefined
          : new Date(slotStart + 6 * 60 * 1000).toISOString(),
    };
    return base;
  });

  return {
    pending: 30,
    processing: 0,
    completed: 60,
    failed: 0,
    cancelled: 0,
    totalQueued: 90,
    items,
    rateLimit: {
      count: 34,
      limit: 50,
      windowMinutes,
      remaining: 16,
      resetsAt: new Date(currentWindowEnd).toISOString(),
      limited: false,
      limitedBy: null,
      daily: {
        count: 112,
        limit: 400,
        remaining: 288,
        resetsAt: new Date(dayReset).toISOString(),
        limited: false,
        windowHours: 24,
      },
    },
    window: {
      windowMinutes,
      limit: 50,
      used: 35,
      remaining: 15,
      resetsAt: new Date(currentWindowEnd).toISOString(),
      nextBatchSize: 15,
    },
    dailyLimit: 400,
    dailyRemaining: 310,
    nextWindowAt: new Date(currentWindowEnd).toISOString(),
  };
}

const QUEUE_ROWS_PER_PAGE = 90;

export const XFollowQueuePanel: FC<{
  integrationId: string;
  compact?: boolean;
}> = ({ integrationId, compact }) => {
  const t = useT();
  const toast = useToaster();
  const fetch = useFetch();
  const [showSampleData, setShowSampleData] = useState(false);
  const [queuePage, setQueuePage] = useState(1);
  const [pausingBatchKey, setPausingBatchKey] = useState<string | null>(null);
  const [resumingBatchKey, setResumingBatchKey] = useState<string | null>(null);
  const [samplePausedBatches, setSamplePausedBatches] = useState<
    Record<string, boolean>
  >({});
  const [pausedBatchEntries, setPausedBatchEntries] = useState<
    Record<
      string,
      Array<{ id: string; username?: string; name?: string }>
    >
  >({});
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

  const hasRealQueueData = !!status &&
    ((status.items?.length ?? 0) > 0 ||
      (status.pending ?? 0) > 0 ||
      (status.processing ?? 0) > 0 ||
      (status.completed ?? 0) > 0 ||
      (status.failed ?? 0) > 0 ||
      (status.cancelled ?? 0) > 0);
  const samplePreview = showSampleData;
  const effectiveStatus = samplePreview
    ? createSampleQueueStatus()
    : status || {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        totalQueued: 0,
        items: [],
        rateLimit: {
          count: 0,
          limit: 50,
          windowMinutes: 15,
          remaining: 50,
          resetsAt: new Date().toISOString(),
          limited: false,
          limitedBy: null,
          daily: {
            count: 0,
            limit: 400,
            remaining: 400,
            resetsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            limited: false,
            windowHours: 24,
          },
        },
        window: {
          windowMinutes: 15,
          limit: 50,
          used: 0,
          remaining: 50,
          resetsAt: new Date().toISOString(),
          nextBatchSize: 0,
        },
        dailyLimit: 400,
        dailyRemaining: 400,
        nextWindowAt: null,
      };
  const window = effectiveStatus.window;
  const daily = effectiveStatus.rateLimit?.daily;
  const timezoneLabel = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time',
    []
  );
  const windowMs = (window?.windowMinutes ?? 15) * 60 * 1000;
  const queueItems = effectiveStatus.items ?? [];
  const paginatedItems = useMemo(() => {
    const start = Math.max(0, (queuePage - 1) * QUEUE_ROWS_PER_PAGE);
    return queueItems.slice(start, start + QUEUE_ROWS_PER_PAGE);
  }, [queueItems, queuePage]);
  const totalPages = Math.max(1, Math.ceil(queueItems.length / QUEUE_ROWS_PER_PAGE));
  useEffect(() => {
    setQueuePage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);
  useEffect(() => {
    if (showSampleData) {
      setQueuePage(1);
    }
  }, [showSampleData]);
  const groupedBatches = useMemo(() => {
    if (!paginatedItems.length) return [];
    const bucket = new Map<
      string,
      {
        key: string;
        ts: number;
        rows: typeof paginatedItems;
      }
    >();

    for (const item of paginatedItems) {
      const source =
        item.scheduledFollowAt || item.processedAt || item.createdAt || new Date().toISOString();
      const tsRaw = new Date(source).getTime();
      const ts = Number.isFinite(tsRaw)
        ? Math.floor(tsRaw / windowMs) * windowMs
        : Date.now();
      const key = new Date(ts).toISOString();
      const current = bucket.get(key) || { key, ts, rows: [] };
      current.rows.push(item);
      bucket.set(key, current);
    }

    return Array.from(bucket.values())
      .sort((a, b) => a.ts - b.ts)
      .map((group) => ({ ...group, rows: group.rows.slice(0, 15) }));
  }, [paginatedItems, windowMs]);

  const pauseBatch = useCallback(
    async (
      batchKey: string,
      entries: Array<{ id: string; username?: string; name?: string }>
    ) => {
      if (!entries.length) return;
      if (samplePreview) {
        setSamplePausedBatches((prev) => ({ ...prev, [batchKey]: true }));
        return;
      }
      setPausingBatchKey(batchKey);
      let paused = 0;
      try {
        for (const entry of entries) {
          const res = await fetch(
            `/integrations/${integrationId}/x-follow-queue/${entry.id}`,
            { method: 'DELETE' }
          );
          if (res.ok) paused += 1;
        }
        await mutate();
        if (paused > 0) {
          setPausedBatchEntries((prev) => ({
            ...prev,
            [batchKey]: entries.map((e) => ({
              id: e.id,
              username: e.username,
              name: e.name,
            })),
          }));
        }
        toast.show(
          t('queue_batch_paused', 'Paused {{count}} profile(s) from this slot.', {
            count: paused,
          }),
          paused > 0 ? 'success' : 'warning'
        );
      } catch {
        toast.show(t('queue_pause_failed', 'Could not pause this slot'), 'warning');
      } finally {
        setPausingBatchKey(null);
      }
    },
    [samplePreview, fetch, integrationId, mutate, toast, t]
  );

  const resumeBatch = useCallback(
    async (batchKey: string) => {
      if (samplePreview) {
        setSamplePausedBatches((prev) => ({ ...prev, [batchKey]: false }));
        return;
      }
      const stored = pausedBatchEntries[batchKey];
      if (!stored?.length) return;
      setResumingBatchKey(batchKey);
      try {
        const res = await fetch(`/integrations/${integrationId}/x-follow-queue`, {
          method: 'POST',
          body: JSON.stringify({
            entries: stored.map((entry) => ({
              targetUserId: entry.id,
              targetUsername: entry.username,
              targetName: entry.name,
            })),
          }),
        });
        if (!res.ok) {
          throw new Error(`Failed (${res.status})`);
        }
        await mutate();
        setPausedBatchEntries((prev) => {
          const next = { ...prev };
          delete next[batchKey];
          return next;
        });
        toast.show(
          t('queue_batch_resumed', 'Resumed this slot and re-queued profiles.'),
          'success'
        );
      } catch {
        toast.show(t('queue_resume_failed', 'Could not resume this slot'), 'warning');
      } finally {
        setResumingBatchKey(null);
      }
    },
    [samplePreview, pausedBatchEntries, fetch, integrationId, mutate, toast, t]
  );

  return (
    <ProfileAutomationsCard className={clsx(compact && 'border-btnPrimary/20')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-newTextColor">
              {t('follow_queue_title', 'Follow queue')}
            </h3>
            {samplePreview && (
              <p className="mt-1 inline-flex rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {t('sample_preview', 'Sample preview')}
              </p>
            )}
            <p className="mt-1 text-xs text-newTableText leading-relaxed max-w-prose">
              {t(
                'follow_queue_desc',
                'Queued follows run automatically in batches (up to {{windowLimit}} per cycle, {{dailyLimit}} per day).',
                {
                  windowLimit: window?.limit ?? 50,
                  dailyLimit: status?.dailyLimit ?? 400,
                }
              )}
            </p>
            <p className="mt-1 text-[11px] text-newTableText">
              {t('queue_timezone_label', 'Times shown in your timezone: {{tz}}', {
                tz: timezoneLabel,
              })}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-btnPrimary/40 px-3 py-1.5 text-xs font-semibold text-btnPrimary transition-colors hover:bg-btnPrimary/10"
            onClick={() => setShowSampleData((v) => !v)}
          >
            {showSampleData
              ? t('hide_sample_data', 'Hide sample data')
              : t('load_sample_data', 'Sample data')}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-newBorder bg-newBgColor/40 px-3 py-2">
            <p className="text-[10px] uppercase text-newTableText">
              {t('queue_pending', 'Pending')}
            </p>
            <p className="text-lg font-bold tabular-nums text-newTextColor">
              {formatCompactCount(
                (effectiveStatus.pending ?? 0) + (effectiveStatus.processing ?? 0)
              )}
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
              {formatCompactCount(effectiveStatus.completed ?? 0)}
            </p>
          </div>
        </div>

        {groupedBatches.length > 0 && (
          <div className="space-y-4">
            {groupedBatches.map((batch) => {
              const pauseEntries = batch.rows
                .filter((item) => item.status === 'pending' || item.status === 'processing')
                .map((item) => ({
                  id: item.id,
                  username: item.targetUsername,
                  name: item.targetName,
                }));
              const hasPending = pauseEntries.length > 0;
              const isPaused = samplePreview
                ? !!samplePausedBatches[batch.key]
                : !!pausedBatchEntries[batch.key]?.length;
              const showToggleButton = isPaused || hasPending;
              return (
                <div
                  key={batch.key}
                  className="rounded-2xl border border-newBorder bg-newBgColor/25 px-4 py-3 shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-newTextColor tabular-nums tracking-tight">
                        {newDayjs(batch.key).local().format('D MMM, hh:mm A')}
                      </p>
                      <span
                        className={
                          isPaused
                            ? 'inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400'
                            : hasPending
                              ? 'inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400'
                              : 'inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {isPaused
                          ? t('batch_paused', 'Paused')
                          : hasPending
                            ? t('batch_pending', 'Pending')
                            : t('batch_followed', 'Followed')}
                      </span>
                    </div>
                    {showToggleButton ? (
                      <button
                        type="button"
                        disabled={
                          pausingBatchKey === batch.key || resumingBatchKey === batch.key
                        }
                        className="rounded-lg border border-btnPrimary/40 px-2.5 py-1 text-xs font-semibold text-btnPrimary transition-colors hover:bg-btnPrimary/10 disabled:opacity-50"
                        onClick={() =>
                          isPaused
                            ? void resumeBatch(batch.key)
                            : void pauseBatch(batch.key, pauseEntries)
                        }
                      >
                        {pausingBatchKey === batch.key
                          ? t('pausing', 'Pausing...')
                          : resumingBatchKey === batch.key
                            ? t('resuming', 'Resuming...')
                            : isPaused
                              ? t('resume_batch', 'RESUME')
                              : t('pause_batch', 'PAUSE')}
                      </button>
                    ) : null}
                  </div>

                  <table className="w-full overflow-hidden rounded-xl text-sm border border-newBorder/80 bg-newBgColor/30">
                    <tbody>
                      {batch.rows.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-newBorder/60 last:border-0 hover:bg-newBgColor/40"
                        >
                          <td className="px-3 py-2 text-sm font-medium text-newTextColor">
                            @{item.targetUsername || item.targetUserId}
                          </td>
                          <td className="px-3 py-2">
                            {item.status === 'completed'
                              ? (
                                <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  {t('queue_status_followed', 'Followed')}
                                </span>
                              )
                              : (
                                <span className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                                  {t('queue_status_pending', 'Pending')}
                                </span>
                              )}
                          </td>
                          <td className="px-3 py-2 text-end text-xs text-newTableText tabular-nums">
                            {item.processedAt
                              ? newDayjs(item.processedAt).local().format('D MMM, hh:mm A')
                              : item.scheduledFollowAt
                                ? newDayjs(item.scheduledFollowAt).local().format('D MMM, hh:mm A')
                                : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}

        {queueItems.length > QUEUE_ROWS_PER_PAGE && (
          <div className="flex items-center justify-between text-xs text-newTableText">
            <span>
              {t('queue_page_info', 'Page {{page}} of {{total}} ({{perPage}} per page)', {
                page: queuePage,
                total: totalPages,
                perPage: QUEUE_ROWS_PER_PAGE,
              })}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-newBorder px-2 py-1 disabled:opacity-50"
                disabled={queuePage <= 1}
                onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
              >
                {t('previous', 'Previous')}
              </button>
              <button
                type="button"
                className="rounded border border-newBorder px-2 py-1 disabled:opacity-50"
                disabled={queuePage >= totalPages}
                onClick={() => setQueuePage((p) => Math.min(totalPages, p + 1))}
              >
                {t('next', 'Next')}
              </button>
            </div>
          </div>
        )}

        {!samplePreview &&
          (effectiveStatus.completed ?? 0) + (effectiveStatus.cancelled ?? 0) > 0 && (
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
