import {
  X_FOLLOW_BATCH_MAX,
  X_FOLLOW_DAILY_LIMIT_MAX,
  X_FOLLOW_RATE_LIMIT_MAX,
  X_FOLLOW_RATE_LIMIT_WINDOW_MS,
  XFollowRateLimitStatus,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-rate-limit';

export type FollowQueueScheduleOptions = {
  /** Milliseconds at the start of the next 15-minute slot to fill. */
  startAfter?: number;
  /** How many follows still fit in `startAfter` slot (default: full batch). */
  slotLeft?: number;
};

export type FollowQueueScheduleCursor = {
  startAfter?: number;
  slotLeft: number;
};

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
  processingStartedAt?: string;
  error?: string;
  /** Paused until X API credits are available (queue stops burning credits). */
  creditHold?: boolean;
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
  /** True when queue processing is paused after X API credits ran out. */
  creditsPaused?: boolean;
};

export function followSlotsAvailableNow(
  rateLimit: XFollowRateLimitStatus
): number {
  const dailyRemaining = rateLimit.daily?.remaining ?? rateLimit.remaining;
  const windowRemaining = Math.max(0, rateLimit.limit - rateLimit.count);
  return Math.min(dailyRemaining, windowRemaining, X_FOLLOW_BATCH_MAX);
}

export function isCreditsDepletedError(message?: string | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('creditsdepleted') ||
    m.includes('credits depleted') ||
    m.includes('credit depleted') ||
    m.includes('insufficient credits') ||
    m.includes('not enough credits')
  );
}

export const X_FOLLOW_QUEUE_PROCESSING_TIMEOUT_MS =
  Number(process.env.X_FOLLOW_QUEUE_PROCESSING_TIMEOUT_MS) > 0
    ? Number(process.env.X_FOLLOW_QUEUE_PROCESSING_TIMEOUT_MS)
    : 10 * 60 * 1000;

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
 * Where to continue scheduling when appending new queue items after existing slots.
 */
export function computeFollowQueueScheduleCursor(
  scheduledPending: XFollowQueueItem[],
  rateLimit: XFollowRateLimitStatus
): FollowQueueScheduleCursor {
  const perSlot = X_FOLLOW_BATCH_MAX;
  const windowMs = X_FOLLOW_RATE_LIMIT_WINDOW_MS;

  if (!scheduledPending.length) {
    const windowRemaining = Math.max(0, rateLimit.limit - rateLimit.count);
    let startAfter = Date.now();
    if (windowRemaining <= 0) {
      startAfter = new Date(rateLimit.resetsAt).getTime();
    }
    return { startAfter, slotLeft: perSlot };
  }

  const bySlot = new Map<number, number>();
  for (const item of scheduledPending) {
    if (!item.scheduledFollowAt) continue;
    const ts = new Date(item.scheduledFollowAt).getTime();
    const slot = Math.floor(ts / windowMs) * windowMs;
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + 1);
  }

  const lastSlot = Math.max(...bySlot.keys());
  const countInLast = bySlot.get(lastSlot) ?? 0;

  if (countInLast >= perSlot) {
    return { startAfter: lastSlot + windowMs, slotLeft: perSlot };
  }

  return { startAfter: lastSlot, slotLeft: perSlot - countInLast };
}

/**
 * Assign each pending item a 15-minute time slot (25 follows per slot by default).
 * All profiles in the same slot share the same timestamp so the queue tab can show
 * batch 1 done while batches 2–4 stay pending.
 */
export function buildPendingFollowSchedule(
  pendingItems: XFollowQueueItem[],
  rateLimit: XFollowRateLimitStatus,
  options?: FollowQueueScheduleOptions
): XFollowQueueItem[] {
  const sorted = [...pendingItems].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let dailyLeft = rateLimit.daily?.remaining ?? rateLimit.remaining;
  let slotLeft = options?.slotLeft ?? X_FOLLOW_BATCH_MAX;
  let windowCursor = options?.startAfter ?? Date.now();

  if (options?.startAfter === undefined) {
    const windowRemaining = Math.max(0, rateLimit.limit - rateLimit.count);
    if (windowRemaining <= 0) {
      windowCursor = new Date(rateLimit.resetsAt).getTime();
    }
  }

  return sorted.map((item) => {
    if (dailyLeft <= 0) {
      return { ...item, scheduledFollowAt: undefined };
    }

    if (slotLeft <= 0) {
      windowCursor += X_FOLLOW_RATE_LIMIT_WINDOW_MS;
      slotLeft = X_FOLLOW_BATCH_MAX;
    }

    const scheduledFollowAt = new Date(windowCursor).toISOString();
    slotLeft -= 1;
    dailyLeft -= 1;

    return { ...item, scheduledFollowAt };
  });
}
