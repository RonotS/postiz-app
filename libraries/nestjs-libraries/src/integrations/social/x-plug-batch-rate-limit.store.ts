import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import {
  X_PLUG_DM_BATCH_MAX_PER_TICK,
  X_PLUG_DM_WINDOW_MAX,
  X_PLUG_DM_WINDOW_MS,
  type XPlugBatchRateLimitStatus,
} from '@gitroom/nestjs-libraries/integrations/social/x-plug-batch-rate-limit';
import { resolveXPollIntervalMs } from '@gitroom/helpers/x/x.poll-interval.env';

const DM_TS_KEY = (integrationId: string) => `x:plug:dm:ts:${integrationId}`;
const LIMITED_UNTIL_KEY = (integrationId: string) =>
  `x:plug:limited:${integrationId}`;
const QUEUED_ESTIMATE_KEY = (integrationId: string) =>
  `x:plug:queued:${integrationId}`;

function pruneTimestamps(timestamps: number[], now = Date.now()): number[] {
  const cutoff = now - X_PLUG_DM_WINDOW_MS;
  return timestamps.filter((t) => t >= cutoff);
}

async function readDmTimestamps(integrationId: string): Promise<number[]> {
  const raw = await ioRedis.get(DM_TS_KEY(integrationId));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as number[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeDmTimestamps(
  integrationId: string,
  timestamps: number[]
): Promise<void> {
  await ioRedis.set(DM_TS_KEY(integrationId), JSON.stringify(timestamps));
}

export async function getLimitedUntilMs(
  integrationId: string
): Promise<number | null> {
  const raw = await ioRedis.get(LIMITED_UNTIL_KEY(integrationId));
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setLimitedUntilMs(
  integrationId: string,
  untilMs: number,
  _reason: 'api_429' | 'dm_window'
): Promise<void> {
  const existing = await getLimitedUntilMs(integrationId);
  const next = existing != null ? Math.max(existing, untilMs) : untilMs;
  await ioRedis.set(LIMITED_UNTIL_KEY(integrationId), String(next));
}

export async function clearLimitedUntil(integrationId: string): Promise<void> {
  await ioRedis.del(LIMITED_UNTIL_KEY(integrationId));
}

export async function recordDmSent(integrationId: string): Promise<void> {
  const now = Date.now();
  const pruned = pruneTimestamps(await readDmTimestamps(integrationId), now);
  pruned.push(now);
  await writeDmTimestamps(integrationId, pruned);
}

export async function addQueuedEstimate(
  integrationId: string,
  delta: number
): Promise<void> {
  if (delta <= 0) return;
  const key = QUEUED_ESTIMATE_KEY(integrationId);
  const raw = await ioRedis.get(key);
  const prev = Number(raw) || 0;
  await ioRedis.set(key, String(prev + delta));
}

export async function decayQueuedEstimate(
  integrationId: string,
  processed: number
): Promise<void> {
  if (processed <= 0) return;
  const key = QUEUED_ESTIMATE_KEY(integrationId);
  const raw = await ioRedis.get(key);
  const prev = Number(raw) || 0;
  await ioRedis.set(key, String(Math.max(0, prev - processed)));
}

export function createDmBatchGate(integrationId: string) {
  let sentThisTick = 0;

  return {
    tryReserveDm: async (): Promise<boolean> => {
      const now = Date.now();
      const limitedUntil = await getLimitedUntilMs(integrationId);
      if (limitedUntil != null && now < limitedUntil) {
        return false;
      }
      if (limitedUntil != null && now >= limitedUntil) {
        await clearLimitedUntil(integrationId);
      }

      if (sentThisTick >= X_PLUG_DM_BATCH_MAX_PER_TICK) {
        return false;
      }

      const pruned = pruneTimestamps(
        await readDmTimestamps(integrationId),
        now
      );
      if (pruned.length >= X_PLUG_DM_WINDOW_MAX) {
        const oldest = Math.min(...pruned);
        await setLimitedUntilMs(
          integrationId,
          oldest + X_PLUG_DM_WINDOW_MS,
          'dm_window'
        );
        return false;
      }

      sentThisTick += 1;
      return true;
    },
    confirmDmSent: async () => {
      await recordDmSent(integrationId);
    },
  };
}

export async function buildXPlugBatchRateLimitStatus(
  integrationId: string,
  options?: { queuedEstimate?: number }
): Promise<XPlugBatchRateLimitStatus> {
  const now = Date.now();
  const pruned = pruneTimestamps(await readDmTimestamps(integrationId), now);
  const count = pruned.length;
  const remaining = Math.max(0, X_PLUG_DM_WINDOW_MAX - count);
  const oldest = pruned.length ? Math.min(...pruned) : now;
  const resetsAt = new Date(oldest + X_PLUG_DM_WINDOW_MS).toISOString();

  const limitedUntilMs = await getLimitedUntilMs(integrationId);
  const limitedByApi =
    limitedUntilMs != null && now < limitedUntilMs;
  const limitedByDm = !limitedByApi && remaining <= 0;
  const limited = limitedByApi || limitedByDm;

  let limitedUntil: string | null = null;
  let limitedBy: XPlugBatchRateLimitStatus['limitedBy'] = null;
  if (limitedByApi && limitedUntilMs) {
    limitedUntil = new Date(limitedUntilMs).toISOString();
    limitedBy = 'api_429';
  } else if (limitedByDm) {
    limitedUntil = resetsAt;
    limitedBy = 'dm_window';
  }

  const queuedRaw = await ioRedis.get(QUEUED_ESTIMATE_KEY(integrationId));
  const queuedEstimate =
    options?.queuedEstimate ??
    (Number(queuedRaw) > 0 ? Number(queuedRaw) : 0);

  return {
    limited,
    limitedUntil,
    limitedBy,
    pollIntervalMs: resolveXPollIntervalMs('X_ENGAGEMENT_POLL_INTERVAL_MS'),
    dmWindow: {
      count,
      limit: X_PLUG_DM_WINDOW_MAX,
      remaining,
      resetsAt,
    },
    batchMaxPerTick: X_PLUG_DM_BATCH_MAX_PER_TICK,
    engagementMaxPostsPerTick: Number(
      process.env.X_ENGAGEMENT_MAX_POSTS_PER_TICK
    ) > 0
      ? Number(process.env.X_ENGAGEMENT_MAX_POSTS_PER_TICK)
      : 5,
    queuedEstimate,
  };
}

/** Parse X 429 reset from twitter-api-v2 style errors when present. */
export function rateLimitResetMsFromError(err: unknown): number | null {
  const anyErr = err as {
    rateLimit?: { reset?: number };
    headers?: Record<string, string>;
  };
  if (anyErr?.rateLimit?.reset) {
    return anyErr.rateLimit.reset * 1000;
  }
  const resetHeader =
    anyErr?.headers?.['x-rate-limit-reset'] ??
    anyErr?.headers?.['X-Rate-Limit-Reset'];
  if (resetHeader) {
    const sec = Number(resetHeader);
    if (Number.isFinite(sec) && sec > 0) {
      return sec * 1000;
    }
  }
  return null;
}

export async function markPlugBatchLimitedFromError(
  integrationId: string,
  err: unknown
): Promise<void> {
  const resetMs = rateLimitResetMsFromError(err);
  const until = resetMs ?? Date.now() + X_PLUG_DM_WINDOW_MS;
  await setLimitedUntilMs(integrationId, until, 'api_429');
}
