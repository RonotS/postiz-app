import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

export type XPollerTickKind = 'engagement' | 'follower' | 'profile';

/**
 * Ensures at most one poller tick per integration per interval (Redis SET NX).
 * Prevents duplicate X API usage when Temporal retries activities or backend
 * bootstrap overlaps a still-running forever workflow.
 */
export async function acquireXPollerTickLock(
  kind: XPollerTickKind,
  integrationId: string,
  ttlMs: number
): Promise<boolean> {
  const ttlSec = Math.max(1, Math.floor(ttlMs / 1000));
  const key = `x:poller:tick:${kind}:${integrationId}`;
  const ok = await ioRedis.set(key, String(Date.now()), 'EX', ttlSec, 'NX');
  return ok === 'OK';
}
