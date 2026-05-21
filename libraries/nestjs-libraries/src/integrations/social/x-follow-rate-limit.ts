/** X API graph write caps per connected channel (rolling window). */
export type XGraphAction = 'follow' | 'unfollow';

export const X_FOLLOW_RATE_LIMIT_MAX =
  Number(process.env.X_FOLLOW_RATE_LIMIT_MAX) > 0
    ? Number(process.env.X_FOLLOW_RATE_LIMIT_MAX)
    : 50;

export const X_FOLLOW_RATE_LIMIT_WINDOW_MS =
  Number(process.env.X_FOLLOW_RATE_LIMIT_WINDOW_MS) > 0
    ? Number(process.env.X_FOLLOW_RATE_LIMIT_WINDOW_MS)
    : 15 * 60 * 1000;

/** X account-style daily follow cap (rolling window, follow only). */
export const X_FOLLOW_DAILY_LIMIT_MAX =
  Number(process.env.X_FOLLOW_DAILY_LIMIT_MAX) > 0
    ? Number(process.env.X_FOLLOW_DAILY_LIMIT_MAX)
    : 400;

export const X_FOLLOW_DAILY_LIMIT_WINDOW_MS =
  Number(process.env.X_FOLLOW_DAILY_LIMIT_WINDOW_MS) > 0
    ? Number(process.env.X_FOLLOW_DAILY_LIMIT_WINDOW_MS)
    : 24 * 60 * 60 * 1000;

export const X_UNFOLLOW_RATE_LIMIT_MAX =
  Number(process.env.X_UNFOLLOW_RATE_LIMIT_MAX) > 0
    ? Number(process.env.X_UNFOLLOW_RATE_LIMIT_MAX)
    : X_FOLLOW_RATE_LIMIT_MAX;

export const X_UNFOLLOW_RATE_LIMIT_WINDOW_MS =
  Number(process.env.X_UNFOLLOW_RATE_LIMIT_WINDOW_MS) > 0
    ? Number(process.env.X_UNFOLLOW_RATE_LIMIT_WINDOW_MS)
    : X_FOLLOW_RATE_LIMIT_WINDOW_MS;

export const X_FOLLOW_BATCH_MAX = 25;

export type XFollowDailyRateLimit = {
  count: number;
  limit: number;
  remaining: number;
  resetsAt: string;
  limited: boolean;
  windowHours: number;
};

export type XFollowRateLimitStatus = {
  /** Actions in the short rolling window (e.g. 15 min). */
  count: number;
  limit: number;
  windowMinutes: number;
  /** Effective follows allowed now (daily remaining for follow actions). */
  remaining: number;
  resetsAt: string;
  limited: boolean;
  limitedBy?: 'window' | 'daily' | null;
  /** Present for follow actions when a daily cap is configured. */
  daily?: XFollowDailyRateLimit;
};

export function getGraphRateLimitConfig(action: XGraphAction): {
  max: number;
  windowMs: number;
} {
  if (action === 'unfollow') {
    return {
      max: X_UNFOLLOW_RATE_LIMIT_MAX,
      windowMs: X_UNFOLLOW_RATE_LIMIT_WINDOW_MS,
    };
  }
  return {
    max: X_FOLLOW_RATE_LIMIT_MAX,
    windowMs: X_FOLLOW_RATE_LIMIT_WINDOW_MS,
  };
}

export function pruneGraphTimestamps(
  timestamps: number[],
  windowMs: number,
  now = Date.now()
): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

function buildWindowRateLimitStatus(
  timestamps: number[],
  max: number,
  windowMs: number,
  now = Date.now()
): Pick<
  XFollowRateLimitStatus,
  'count' | 'limit' | 'windowMinutes' | 'remaining' | 'resetsAt' | 'limited'
> {
  const pruned = pruneGraphTimestamps(timestamps, windowMs, now);
  const count = pruned.length;
  const remaining = Math.max(0, max - count);
  const oldest = pruned.length ? Math.min(...pruned) : now;
  const resetsAt = new Date(oldest + windowMs).toISOString();

  return {
    count,
    limit: max,
    windowMinutes: Math.round(windowMs / 60_000),
    remaining,
    resetsAt,
    limited: remaining <= 0,
  };
}

function buildFollowRateLimitWithDaily(
  timestamps: number[],
  now = Date.now()
): XFollowRateLimitStatus {
  const windowCfg = getGraphRateLimitConfig('follow');
  const window = buildWindowRateLimitStatus(
    timestamps,
    windowCfg.max,
    windowCfg.windowMs,
    now
  );

  const dailyPruned = pruneGraphTimestamps(
    timestamps,
    X_FOLLOW_DAILY_LIMIT_WINDOW_MS,
    now
  );
  const dailyCount = dailyPruned.length;
  const dailyLimit = X_FOLLOW_DAILY_LIMIT_MAX;
  const dailyRemaining = Math.max(0, dailyLimit - dailyCount);
  const dailyOldest = dailyPruned.length ? Math.min(...dailyPruned) : now;
  const dailyResetsAt = new Date(
    dailyOldest + X_FOLLOW_DAILY_LIMIT_WINDOW_MS
  ).toISOString();

  const daily: XFollowDailyRateLimit = {
    count: dailyCount,
    limit: dailyLimit,
    remaining: dailyRemaining,
    resetsAt: dailyResetsAt,
    limited: dailyRemaining <= 0,
    windowHours: Math.round(X_FOLLOW_DAILY_LIMIT_WINDOW_MS / 3_600_000),
  };

  // Product decision: in Follow automations we enforce only the daily cap.
  // Keep the short-window metrics for observability, but do not limit by them.
  const effectiveRemaining = daily.remaining;
  const limited = daily.limited;
  const limitedBy: 'window' | 'daily' | null = limited ? 'daily' : null;
  const resetsAt = daily.resetsAt;

  return {
    count: window.count,
    limit: window.limit,
    windowMinutes: window.windowMinutes,
    remaining: effectiveRemaining,
    resetsAt,
    limited,
    limitedBy,
    daily,
  };
}

export function buildXGraphRateLimitStatus(
  timestamps: number[],
  action: XGraphAction,
  now = Date.now()
): XFollowRateLimitStatus {
  if (action === 'follow') {
    return buildFollowRateLimitWithDaily(timestamps, now);
  }

  const { max: limit, windowMs } = getGraphRateLimitConfig(action);
  const window = buildWindowRateLimitStatus(timestamps, limit, windowMs, now);
  return {
    ...window,
    limitedBy: window.limited ? 'window' : null,
  };
}

export function formatFollowRateLimitMessage(status: XFollowRateLimitStatus): string {
  if (status.daily) {
    return `Daily follow limit reached (${status.daily.count} of ${status.daily.limit} in the last ${status.daily.windowHours} hours). Try again after ${status.daily.resetsAt}.`;
  }
  return `Follow limit reached. Try again after ${status.resetsAt}.`;
}

/** @deprecated Use buildXGraphRateLimitStatus(timestamps, 'follow') */
export function pruneFollowTimestamps(
  timestamps: number[],
  now = Date.now()
): number[] {
  return pruneGraphTimestamps(
    timestamps,
    X_FOLLOW_RATE_LIMIT_WINDOW_MS,
    now
  );
}

/** @deprecated Use buildXGraphRateLimitStatus(timestamps, 'follow') */
export function buildXFollowRateLimitStatus(
  timestamps: number[],
  now = Date.now()
): XFollowRateLimitStatus {
  return buildXGraphRateLimitStatus(timestamps, 'follow', now);
}

export function maxFollowsAllowedNow(timestamps: number[]): number {
  return buildXGraphRateLimitStatus(timestamps, 'follow').remaining;
}
