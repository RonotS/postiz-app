/** X API–style follow cap per connected channel (rolling window). */
export const X_FOLLOW_RATE_LIMIT_MAX =
  Number(process.env.X_FOLLOW_RATE_LIMIT_MAX) > 0
    ? Number(process.env.X_FOLLOW_RATE_LIMIT_MAX)
    : 50;

export const X_FOLLOW_RATE_LIMIT_WINDOW_MS =
  Number(process.env.X_FOLLOW_RATE_LIMIT_WINDOW_MS) > 0
    ? Number(process.env.X_FOLLOW_RATE_LIMIT_WINDOW_MS)
    : 15 * 60 * 1000;

export const X_FOLLOW_BATCH_MAX = 25;

export type XFollowRateLimitStatus = {
  count: number;
  limit: number;
  windowMinutes: number;
  remaining: number;
  resetsAt: string;
  limited: boolean;
};

export function pruneFollowTimestamps(
  timestamps: number[],
  now = Date.now()
): number[] {
  const cutoff = now - X_FOLLOW_RATE_LIMIT_WINDOW_MS;
  return timestamps.filter((t) => t > cutoff);
}

export function buildXFollowRateLimitStatus(
  timestamps: number[],
  now = Date.now()
): XFollowRateLimitStatus {
  const pruned = pruneFollowTimestamps(timestamps, now);
  const count = pruned.length;
  const limit = X_FOLLOW_RATE_LIMIT_MAX;
  const remaining = Math.max(0, limit - count);
  const oldest = pruned.length ? Math.min(...pruned) : now;
  const resetsAt = new Date(oldest + X_FOLLOW_RATE_LIMIT_WINDOW_MS).toISOString();

  return {
    count,
    limit,
    windowMinutes: Math.round(X_FOLLOW_RATE_LIMIT_WINDOW_MS / 60_000),
    remaining,
    resetsAt,
    limited: remaining <= 0,
  };
}

export function maxFollowsAllowedNow(timestamps: number[]): number {
  return buildXFollowRateLimitStatus(timestamps).remaining;
}
