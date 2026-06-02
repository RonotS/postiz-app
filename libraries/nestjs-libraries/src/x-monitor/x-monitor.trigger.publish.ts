import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import {
  getXMonitorTriggerRedisChannel,
  isXMonitorWebhookTriggerEnabled,
} from '@gitroom/helpers/x/x.monitor.trigger.env';
import { normalizeXHandle } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.normalize';
import type { XMonitorTriggerMessage } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.trigger.types';

const log = new Logger('XMonitorTriggerPublish');

let publisher: Redis | undefined;

function getPublisher(): Redis | undefined {
  if (!process.env.REDIS_URL?.trim()) {
    return undefined;
  }
  if (!publisher) {
    publisher = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
    });
  }
  return publisher;
}

/** Called from backend when X Account Activity webhook reports a like or follow. */
export async function publishXMonitorWebhookTrigger(
  msg: Omit<XMonitorTriggerMessage, 'ts'>
): Promise<void> {
  if (!isXMonitorWebhookTriggerEnabled()) {
    return;
  }

  const handle = normalizeXHandle(msg.handle);
  if (!handle) {
    return;
  }

  const payload: XMonitorTriggerMessage = {
    ...msg,
    handle,
    ts: Date.now(),
  };

  const redis = getPublisher();
  if (!redis) {
    log.warn(
      `Webhook trigger for @${handle} ${msg.kind} skipped — REDIS_URL not set (backend and x-monitor need shared Redis)`
    );
    return;
  }

  try {
    await redis.publish(
      getXMonitorTriggerRedisChannel(),
      JSON.stringify(payload)
    );
    log.debug(
      `Published x-monitor trigger @${handle} ${msg.kind} userId=${msg.userId ?? '-'}`
    );
  } catch (err) {
    log.warn(`Failed to publish x-monitor trigger @${handle}:`, err);
  }
}
