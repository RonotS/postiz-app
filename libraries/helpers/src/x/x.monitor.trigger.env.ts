import { isXMonitorEnabled } from '@gitroom/helpers/x/x.monitor.env';
import { isXAccountActivityWebhooksEnabled } from '@gitroom/helpers/x/x.account-activity.env';
import {
  getXAccountActivityVipHandles,
  isXAccountActivityVipHandle,
} from '@gitroom/helpers/x/x.realtime-hybrid.env';

export type XMonitorWebhookTriggerMode = 'ingest' | 'scrape' | 'hybrid';

/**
 * X Account Activity webhook → x-monitor (realtime wake-up, optional scrape).
 * Requires REDIS_URL (backend + x-monitor share Redis).
 */
export function isXMonitorWebhookTriggerEnabled(): boolean {
  const v = process.env.X_MONITOR_WEBHOOK_TRIGGER?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  if (v === 'true' || v === '1') {
    return true;
  }
  return (
    isXMonitorEnabled() &&
    isXAccountActivityWebhooksEnabled() &&
    process.env.X_MONITOR_WEBHOOK_TRIGGER_AUTO?.trim() !== 'false'
  );
}

export function getXMonitorWebhookTriggerMode(): XMonitorWebhookTriggerMode {
  const raw = process.env.X_MONITOR_WEBHOOK_TRIGGER_MODE?.trim().toLowerCase();
  if (raw === 'scrape' || raw === 'scraping') {
    return 'scrape';
  }
  if (raw === 'hybrid') {
    return 'hybrid';
  }
  return 'ingest';
}

/** Redis channel for backend → x-monitor triggers. */
export function getXMonitorTriggerRedisChannel(): string {
  return (
    process.env.X_MONITOR_TRIGGER_REDIS_CHANNEL?.trim() ||
    'tweetmax:x-monitor:trigger'
  );
}

/**
 * VIP handles with AAA webhooks: skip follower/like interval poll when webhook trigger is on.
 */
export function shouldSkipIntervalPollForVipWebhookHandle(
  profile?: string | null
): boolean {
  if (!isXMonitorWebhookTriggerEnabled()) {
    return false;
  }
  const v = process.env.X_MONITOR_WEBHOOK_DISABLE_POLL_FOR_VIP?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return isXAccountActivityVipHandle(profile);
}

/**
 * Forward webhook trigger to Postiz HTTP ingest (can duplicate DMs if backend already handled webhook).
 * Default false — backend AAA handler already runs plugs; x-monitor only WS fan-out + optional scrape.
 */
export function isXMonitorWebhookTriggerPushIngest(): boolean {
  const v = process.env.X_MONITOR_WEBHOOK_TRIGGER_PUSH_INGEST?.trim();
  return v === 'true' || v === '1';
}
