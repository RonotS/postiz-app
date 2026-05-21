'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export type XFollowDailyRateLimit = {
  count: number;
  limit: number;
  remaining: number;
  resetsAt: string;
  limited: boolean;
  windowHours: number;
};

export type XFollowRateLimit = {
  count: number;
  limit: number;
  windowMinutes: number;
  remaining: number;
  resetsAt: string;
  limited: boolean;
  limitedBy?: 'window' | 'daily' | null;
  daily?: XFollowDailyRateLimit;
};

export type XGraphRateAction = 'follow' | 'unfollow';

function formatCountdownMs(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function useXGraphRateLimit(
  integrationId: string | undefined,
  action: XGraphRateAction
) {
  const fetch = useFetch();
  const endpoint =
    action === 'follow' ? 'x-follow-rate-limit' : 'x-unfollow-rate-limit';

  const { data, mutate, isLoading } = useSWR<XFollowRateLimit>(
    integrationId ? `x-${action}-rate-limit-${integrationId}` : null,
    async () => {
      const res = await fetch(
        `/integrations/${integrationId}/${endpoint}`
      );
      if (!res.ok) {
        throw new Error(`Failed to load ${action} rate limit`);
      }
      return res.json();
    },
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  const [tick, setTick] = useState(0);

  const bindingResetsAt = useMemo(() => {
    if (!data) return '';
    if (data.limitedBy === 'daily' && data.daily?.resetsAt) {
      return data.daily.resetsAt;
    }
    return data.resetsAt;
  }, [data]);

  const showCountdown = useMemo(() => {
    if (!data) return false;
    if (data.limited) return true;
    if (action === 'follow' && data.daily) {
      return data.daily.remaining < data.daily.limit;
    }
    return data.remaining < data.limit;
  }, [data, action]);

  useEffect(() => {
    if (!bindingResetsAt || !showCountdown) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [bindingResetsAt, showCountdown]);

  const countdown = useMemo(() => {
    if (!bindingResetsAt) return '';
    const ms = new Date(bindingResetsAt).getTime() - Date.now();
    return formatCountdownMs(ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives countdown refresh
  }, [bindingResetsAt, tick]);

  const dailyCountdown = useMemo(() => {
    if (!data?.daily?.resetsAt) return '';
    const ms = new Date(data.daily.resetsAt).getTime() - Date.now();
    if (ms <= 0) return '0:00';
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [data?.daily?.resetsAt, tick]);

  const resetsSoon = useMemo(() => {
    if (!bindingResetsAt) return false;
    return new Date(bindingResetsAt).getTime() <= Date.now();
  }, [bindingResetsAt, tick]);

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
    dailyCountdown,
    atLimit: !!data?.limited,
    remaining: data?.remaining ?? 0,
    limit: data?.limit ?? 50,
    windowMinutes: data?.windowMinutes ?? 15,
    dailyLimit: data?.daily?.limit ?? 400,
    limitedBy: data?.limitedBy ?? null,
    dailyRemaining: data?.daily?.remaining ?? 0,
    action,
  };
}

export function useXFollowRateLimit(integrationId: string | undefined) {
  return useXGraphRateLimit(integrationId, 'follow');
}

export function useXUnfollowRateLimit(integrationId: string | undefined) {
  return useXGraphRateLimit(integrationId, 'unfollow');
}

/** Max follows/unfollows per single API request (matches backend X_FOLLOW_BATCH_MAX). */
export const X_FOLLOW_BATCH_MAX = 25;
