/** Synthetic X "release id" passed to `processPlugs` — no post row uses this. */
export const X_FOLLOWER_DM_POLL_RELEASE_ID = '__postiz_follower_poll__';

/**
 * Default ms between follower-DM poller ticks when `X_FOLLOWER_DM_POLL_INTERVAL_MS`
 * is unset (2 minutes — convenient for testing; use 600000+ in production).
 */
export const X_FOLLOWER_DM_DEFAULT_POLL_INTERVAL_MS = 120_000;

export function xFollowerDmPollerWorkflowId(integrationId: string): string {
  return `x_follower_dm_poller_${integrationId}`;
}
