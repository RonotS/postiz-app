import {
  X_FOLLOW_BATCH_MAX,
  X_FOLLOW_DAILY_LIMIT_MAX,
  X_FOLLOW_RATE_LIMIT_MAX,
  X_FOLLOW_RATE_LIMIT_WINDOW_MS,
  XFollowRateLimitStatus,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-rate-limit';

export type XFollowQueueItemStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type XFollowQueueItem = {
  id: string;
  integrationId: string;
  orgId: string;
  targetUserId: string;
  targetUsername?: string;
  targetName?: string;
  status: XFollowQueueItemStatus;
  createdAt: string;
  processedAt?: string;
  error?: string;
  /** Estimated time this pending follow will run (rate-limit aware). */
  scheduledFollowAt?: string;
};

export type XFollowQueueWindowEstimate = {
  windowMinutes: number;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
  /** Follows expected to run in the next window tick (up to window remaining). */
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
  rateLimit: XFollowRateLimitStatus;
  window: XFollowQueueWindowEstimate;
  dailyLimit: number;
  dailyRemaining: number;
  /** Earliest time the next batch may start (when window is full). */
  nextWindowAt: string | null;
};

export function followSlotsAvailableNow(
  rateLimit: XFollowRateLimitStatus
): number {
  const dailyRemaining = rateLimit.daily?.remaining ?? rateLimit.remaining;
  const windowRemaining = Math.max(0, rateLimit.limit - rateLimit.count);
  return Math.min(dailyRemaining, windowRemaining, X_FOLLOW_BATCH_MAX);
}

export function buildQueueWindowEstimate(
  rateLimit: XFollowRateLimitStatus,
  pendingCount: number
): XFollowQueueWindowEstimate {
  const remaining = Math.max(0, rateLimit.limit - rateLimit.count);
  const nextBatchSize = Math.min(
    remaining,
    X_FOLLOW_BATCH_MAX,
    pendingCount
  );

  return {
    windowMinutes: rateLimit.windowMinutes,
    limit: rateLimit.limit,
    used: rateLimit.count,
    remaining,
    resetsAt: rateLimit.resetsAt,
    nextBatchSize,
  };
}

export function defaultDailyLimit(): number {
  return X_FOLLOW_DAILY_LIMIT_MAX;
}

export function defaultWindowLimit(): number {
  return X_FOLLOW_RATE_LIMIT_MAX;
}

export function defaultWindowMinutes(): number {
  return Math.round(X_FOLLOW_RATE_LIMIT_WINDOW_MS / 60_000);
}

/**
 * Assign each pending item an estimated follow time respecting 15-min window + daily cap.
 */
export function buildPendingFollowSchedule(
  pendingItems: XFollowQueueItem[],
  rateLimit: XFollowRateLimitStatus
): XFollowQueueItem[] {
  const sorted = [...pendingItems].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let dailyLeft = rateLimit.daily?.remaining ?? rateLimit.remaining;
  let windowLeft = Math.max(0, rateLimit.limit - rateLimit.count);
  let windowCursor = Date.now();
  let windowResetsAt = new Date(rateLimit.resetsAt).getTime();

  return sorted.map((item) => {
    if (dailyLeft <= 0) {
      return { ...item, scheduledFollowAt: undefined };
    }

    while (windowLeft <= 0 && dailyLeft > 0) {
      windowCursor = Math.max(windowCursor, windowResetsAt) + 1_000;
      windowLeft = rateLimit.limit;
      windowResetsAt = windowCursor + X_FOLLOW_RATE_LIMIT_WINDOW_MS;
    }

    const scheduledFollowAt = new Date(windowCursor).toISOString();
    windowLeft -= 1;
    dailyLeft -= 1;
    windowCursor += Math.ceil(
      X_FOLLOW_RATE_LIMIT_WINDOW_MS / Math.max(1, rateLimit.limit)
    );

    return { ...item, scheduledFollowAt };
  });
}
