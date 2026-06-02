'use client';

import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { XFollowRateLimit } from '@gitroom/frontend/components/dashboard/use-x-follow-rate-limit';

export type XFollowQueueItem = {
  id: string;
  integrationId: string;
  orgId: string;
  targetUserId: string;
  targetUsername?: string;
  targetName?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  processedAt?: string;
  error?: string;
  creditHold?: boolean;
  scheduledFollowAt?: string;
};

export type XFollowQueueWindow = {
  windowMinutes: number;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
  nextBatchSize: number;
};

export type XFollowQueueStatus = {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalQueued: number;
  items: XFollowQueueItem[];
  rateLimit: XFollowRateLimit;
  window: XFollowQueueWindow;
  dailyLimit: number;
  dailyRemaining: number;
  nextWindowAt: string | null;
  creditsPaused?: boolean;
};

export function useXFollowQueue(integrationId: string | undefined) {
  const fetch = useFetch();

  const { data, mutate, isLoading, isValidating } = useSWR<XFollowQueueStatus>(
    integrationId ? `x-follow-queue-${integrationId}` : null,
    async () => {
      const res = await fetch(`/integrations/${integrationId}/x-follow-queue`);
      if (!res.ok) {
        throw new Error('Failed to load follow queue');
      }
      return res.json();
    },
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );

  return { status: data, mutate, isLoading, isValidating };
}
