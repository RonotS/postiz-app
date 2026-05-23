/** X API DM cap per user per 15 minutes (official v2 limit). */
export const X_PLUG_DM_WINDOW_MS = 15 * 60 * 1000;

export const X_PLUG_DM_WINDOW_MAX =
  Number(process.env.X_PLUG_DM_WINDOW_MAX) > 0
    ? Number(process.env.X_PLUG_DM_WINDOW_MAX)
    : 15;

/** Max DMs to attempt per poller tick (spread across posts/plugs). */
export const X_PLUG_DM_BATCH_MAX_PER_TICK =
  Number(process.env.X_PLUG_DM_BATCH_MAX_PER_TICK) > 0
    ? Number(process.env.X_PLUG_DM_BATCH_MAX_PER_TICK)
    : 3;

/** Max published posts to scan per engagement poller tick. */
export const X_ENGAGEMENT_MAX_POSTS_PER_TICK =
  Number(process.env.X_ENGAGEMENT_MAX_POSTS_PER_TICK) > 0
    ? Number(process.env.X_ENGAGEMENT_MAX_POSTS_PER_TICK)
    : 5;

export type XPlugBatchRateLimitStatus = {
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
