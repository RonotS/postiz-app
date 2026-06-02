import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

const PREFIX = 'x:monitor:v1';

export function mentionSinceKey(integrationId: string): string {
  return `${PREFIX}:mention_since:${integrationId}`;
}

export function followersBaselineKey(integrationId: string): string {
  return `${PREFIX}:followers_baseline:${integrationId}`;
}

export function dedupKey(
  integrationId: string,
  kind: string,
  userId: string,
  tweetId?: string
): string {
  return `${PREFIX}:dedup:${integrationId}:${kind}:${userId}:${tweetId ?? '_'}`;
}

/** Returns true if first time seeing this engagement (should ingest). */
export async function markEngagementOnce(
  integrationId: string,
  kind: string,
  userId: string,
  tweetId?: string,
  ttlSec = 60 * 60 * 24 * 7
): Promise<boolean> {
  const key = dedupKey(integrationId, kind, userId, tweetId);
  const ok = await ioRedis.set(key, '1', 'EX', ttlSec, 'NX');
  return ok === 'OK';
}

/** Allow re-ingest after unfollow (e.g. test unfollow → follow). */
export async function clearEngagementDedup(
  integrationId: string,
  kind: string,
  userId: string,
  tweetId?: string
): Promise<void> {
  await ioRedis.del(dedupKey(integrationId, kind, userId, tweetId));
}

export async function getMentionSinceId(
  integrationId: string
): Promise<string | undefined> {
  const v = await ioRedis.get(mentionSinceKey(integrationId));
  return v?.trim() || undefined;
}

export async function setMentionSinceId(
  integrationId: string,
  tweetId: string
): Promise<void> {
  await ioRedis.set(mentionSinceKey(integrationId), tweetId);
}

export async function loadFollowerBaseline(
  integrationId: string
): Promise<Set<string> | null> {
  const raw = await ioRedis.get(followersBaselineKey(integrationId));
  if (!raw) {
    return null;
  }
  try {
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.map(String));
  } catch {
    return null;
  }
}

export async function saveFollowerBaseline(
  integrationId: string,
  ids: string[]
): Promise<void> {
  const trimmed = ids.slice(0, 5000);
  await ioRedis.set(
    followersBaselineKey(integrationId),
    JSON.stringify(trimmed),
    'EX',
    60 * 60 * 24 * 30
  );
}

function watchCountKey(metricKey: string): string {
  return `${PREFIX}:watch:${metricKey}`;
}

/** Last seen public count for change-watcher (followers_count / favorite_count). */
export async function getWatchedCount(
  metricKey: string
): Promise<number | undefined> {
  const raw = await ioRedis.get(watchCountKey(metricKey));
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function setWatchedCount(
  metricKey: string,
  count: number
): Promise<void> {
  await ioRedis.set(
    watchCountKey(metricKey),
    String(Math.floor(count)),
    'EX',
    60 * 60 * 24 * 14
  );
}
