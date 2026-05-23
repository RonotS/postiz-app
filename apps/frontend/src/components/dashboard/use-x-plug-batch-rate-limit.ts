'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export type XPlugBatchRateLimit = {
  limited: boolean;
  limitedUntil: string | null;
  limitedBy: 'api_429' | 'dm_window' | null;
  pollIntervalMs: number;
  dmWindow: {
    count: number;
    limit: number;
    remaining: number;
    resetsAt: string;
  };
  batchMaxPerTick: number;
  engagementMaxPostsPerTick: number;
  queuedEstimate: number;
};

function formatCountdown(targetIso: string | null | undefined): string {
  if (!targetIso) return '';
  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return '';
  const diff = Math.max(0, target - Date.now());
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function useXPlugBatchRateLimit(integrationId: string | undefined) {
  const fetch = useFetch();
  const [countdown, setCountdown] = useState('');

  const { data, mutate, isLoading } = useSWR<XPlugBatchRateLimit>(
    integrationId ? `/integrations/${integrationId}/x-plug-batch-rate-limit` : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load plug batch status');
      }
      return res.json();
    },
    { refreshInterval: 30_000 }
  );

  useEffect(() => {
    if (!data?.limitedUntil) {
      setCountdown('');
      return;
    }
    const tick = () => setCountdown(formatCountdown(data.limitedUntil));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [data?.limitedUntil]);

  const pollMinutes = useMemo(
    () => Math.round((data?.pollIntervalMs ?? 300_000) / 60_000),
    [data?.pollIntervalMs]
  );

  const refresh = useCallback(() => mutate(), [mutate]);

  return {
    rateLimit: data,
    isLoading,
    countdown,
    pollMinutes,
    refresh,
  };
}
