'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export type XFollowRateLimit = {
  count: number;
  limit: number;
  windowMinutes: number;
  remaining: number;
  resetsAt: string;
  limited: boolean;
};

function formatCountdownMs(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function useXFollowRateLimit(integrationId: string | undefined) {
  const fetch = useFetch();

  const { data, mutate, isLoading } = useSWR<XFollowRateLimit>(
    integrationId ? `x-follow-rate-limit-${integrationId}` : null,
    async () => {
      const res = await fetch(
        `/integrations/${integrationId}/x-follow-rate-limit`
      );
      if (!res.ok) {
        throw new Error('Failed to load follow rate limit');
      }
      return res.json();
    },
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!data?.limited) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [data?.limited, data?.resetsAt]);

  const countdown = useMemo(() => {
    if (!data?.resetsAt) return '';
    const ms = new Date(data.resetsAt).getTime() - Date.now();
    return formatCountdownMs(ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives countdown refresh
  }, [data?.resetsAt, tick]);

  const resetsSoon = useMemo(() => {
    if (!data?.resetsAt) return false;
    return new Date(data.resetsAt).getTime() <= Date.now();
  }, [data?.resetsAt, tick]);

  useEffect(() => {
    if (resetsSoon && integrationId) {
      void mutate();
    }
  }, [resetsSoon, integrationId, mutate]);

  return {
    rateLimit: data,
    isLoading,
    mutate,
    countdown,
    atLimit: !!data?.limited,
    remaining: data?.remaining ?? 50,
  };
}
