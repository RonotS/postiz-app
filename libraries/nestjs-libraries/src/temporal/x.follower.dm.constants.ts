/** Synthetic X "release id" passed to `processPlugs` — no post row uses this. */
export const X_FOLLOWER_DM_POLL_RELEASE_ID = '__postiz_follower_poll__';

/**
 * Default ms between follower-DM poller ticks when `X_FOLLOWER_DM_POLL_INTERVAL_MS`
 * is unset (30 seconds).
 */
export const X_FOLLOWER_DM_DEFAULT_POLL_INTERVAL_MS = 30_000;

export function xFollowerDmPollerWorkflowId(integrationId: string): string {
  return `x_follower_dm_poller_${integrationId}`;
}

/** Synthetic release id for integration-wide profile automation plugs. */
export const X_PROFILE_AUTOMATIONS_POLL_RELEASE_ID =
  '__postiz_profile_automations_poll__';

export const X_PROFILE_AUTOMATION_PLUG_FUNCTIONS = [
  'autoDeleteProfile',
  'autoDeleteReposts',
  'autoDmPinnedPost',
] as const;

export type XProfileAutomationPlugFunction =
  (typeof X_PROFILE_AUTOMATION_PLUG_FUNCTIONS)[number];

export function xProfileAutomationsPollerWorkflowId(
  integrationId: string
): string {
  return `x_profile_automations_poller_${integrationId}`;
}
