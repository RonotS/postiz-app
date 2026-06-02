import { isXAccountActivityWebhooksEnabled } from '@gitroom/helpers/x/x.account-activity.env';
import { isXCustomIngestEnabled } from '@gitroom/helpers/x/x.custom-ingest.env';
import { isXMonitorEnabled } from '@gitroom/helpers/x/x.monitor.env';
import { isXRealtimeHybridEnabled } from '@gitroom/helpers/x/x.realtime-hybrid.env';
import { isTweetStreamEnabled } from '@gitroom/helpers/x/tweetstream.env';

/** How Postiz ingests realtime X engagement (before optional fan-out to your site). */
export type XRealtimeIngestMode = 'webhooks' | 'tweetstream' | 'custom' | 'poll';

/**
 * Explicit: X_REALTIME_INGEST=webhooks|tweetstream|custom|poll
 * Auto: custom ingest → TweetStream → AAA webhooks → poll.
 */
export function getXRealtimeIngestMode(): XRealtimeIngestMode {
  const raw = process.env.X_REALTIME_INGEST?.trim().toLowerCase();
  if (
    raw === 'webhooks' ||
    raw === 'tweetstream' ||
    raw === 'custom' ||
    raw === 'poll'
  ) {
    return raw;
  }
  if (isXMonitorEnabled() || isXCustomIngestEnabled()) {
    return 'custom';
  }
  if (isTweetStreamEnabled()) {
    return 'tweetstream';
  }
  if (isXAccountActivityWebhooksEnabled()) {
    return 'webhooks';
  }
  return 'poll';
}

export function isCustomRealtimeIngest(): boolean {
  return getXRealtimeIngestMode() === 'custom';
}

/** Register X Account Activity per-user subscriptions (X "unique subscriptions" cap). */
export function shouldSyncXAccountActivitySubscriptions(): boolean {
  if (!isXAccountActivityWebhooksEnabled()) {
    return false;
  }
  if (isXRealtimeHybridEnabled()) {
    return true;
  }
  const mode = getXRealtimeIngestMode();
  return mode === 'webhooks';
}

/** TweetStream WS ingest + optional Postiz → your site activity stream. */
export function isTweetStreamRealtimeStack(): boolean {
  return getXRealtimeIngestMode() === 'tweetstream';
}

/**
 * Post-bound autoDmEngagers Temporal/Xquik polling would duplicate DMs already sent
 * via custom ingest (x-monitor) or TweetStream realtime handlers.
 */
export function shouldSkipXEngagerPlugPolling(): boolean {
  if (isCustomRealtimeIngest()) {
    return true;
  }
  return false;
}
