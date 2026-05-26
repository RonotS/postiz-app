import { isXAccountActivityWebhooksEnabled } from '@gitroom/helpers/x/x.account-activity.env';
import { isTweetStreamEnabled } from '@gitroom/helpers/x/tweetstream.env';

/** Default interval between X plug poller ticks when Account Activity webhooks are on. */
export const X_DEFAULT_POLL_INTERVAL_MS = 300_000;

/** Default poller interval when AAA is unavailable (Basic/Free tier). */
export const X_DEFAULT_POLL_WITHOUT_AAA_MS = 60_000;

/** Like-DM backup poll when TweetStream is on (likes are not streamed over WS). */
export const X_TWEETSTREAM_ENGAGEMENT_POLL_MS = 30_000;

const MIN_POLL_MS = 30_000;
const MAX_POLL_MS = 3_600_000;

function pollDefaultMs(): number {
  if (isXAccountActivityWebhooksEnabled()) {
    return X_DEFAULT_POLL_INTERVAL_MS;
  }
  const override = Number(process.env.X_POLL_DEFAULT_WITHOUT_AAA_MS);
  if (Number.isFinite(override) && override > 0) {
    return Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, override));
  }
  return X_DEFAULT_POLL_WITHOUT_AAA_MS;
}

/**
 * Resolve poller interval from an optional env var.
 * Without AAA webhooks: defaults to 1 minute (override with X_POLL_DEFAULT_WITHOUT_AAA_MS).
 * With AAA: defaults to 5 minutes unless the specific *_POLL_INTERVAL_MS env is set.
 */
export function resolveXPollIntervalMs(envVarName: string): number {
  const fromEnv = Number(process.env[envVarName]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, fromEnv));
  }
  return pollDefaultMs();
}

/**
 * Engagement poller (auto-DM likers, etc.). When TweetStream is enabled and
 * X_ENGAGEMENT_POLL_INTERVAL_MS is unset, defaults to 30s so like-DMs stay
 * within one poll cycle (TweetStream WS does not emit like events).
 */
export function resolveXEngagementPollIntervalMs(): number {
  const fromEnv = Number(process.env.X_ENGAGEMENT_POLL_INTERVAL_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, fromEnv));
  }
  if (isTweetStreamEnabled()) {
    return X_TWEETSTREAM_ENGAGEMENT_POLL_MS;
  }
  return pollDefaultMs();
}

/** Delay before poller-driven auto-DMs (ms). Webhook path uses getXWebhookDmDelayMs(). */
export function getXPollerDmDelayMs(): number {
  const raw = process.env.X_POLLER_DM_DELAY_MS?.trim();
  if (raw === '' || raw === undefined) {
    return isXAccountActivityWebhooksEnabled() ? 2000 : 500;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return 500;
  }
  return Math.min(n, 60_000);
}
