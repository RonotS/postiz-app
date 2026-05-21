import { promises as fs } from 'fs';
import path from 'path';
import {
  buildXGraphRateLimitStatus,
  pruneGraphTimestamps,
  XFollowRateLimitStatus,
  XGraphAction,
  getGraphRateLimitConfig,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-rate-limit';

type StoreShape = Record<string, number[]>;

function resolveFilePath(): string {
  const raw = process.env.X_FOLLOW_RATE_LIMIT_FILE?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  }
  return path.join(process.cwd(), '.data', 'x-follow-rate-limits.json');
}

function storeKey(integrationId: string, action: XGraphAction): string {
  return `${integrationId}:${action}`;
}

let cache: StoreShape | null = null;

async function readStore(): Promise<StoreShape> {
  if (cache) {
    return cache;
  }
  const file = resolveFilePath();
  try {
    const text = await fs.readFile(file, 'utf8');
    cache = JSON.parse(text) as StoreShape;
    return cache;
  } catch {
    cache = {};
    return cache;
  }
}

async function writeStore(data: StoreShape): Promise<void> {
  const file = resolveFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  cache = data;
}

function readTimestamps(
  store: StoreShape,
  integrationId: string,
  action: XGraphAction
): number[] {
  const key = storeKey(integrationId, action);
  if (store[key]?.length) {
    return store[key];
  }
  if (action === 'follow' && store[integrationId]?.length) {
    return store[integrationId];
  }
  return [];
}

export async function getXGraphRateLimitForIntegration(
  integrationId: string,
  action: XGraphAction
): Promise<XFollowRateLimitStatus> {
  const store = await readStore();
  const timestamps = readTimestamps(store, integrationId, action);
  return buildXGraphRateLimitStatus(timestamps, action);
}

/** @deprecated Use getXGraphRateLimitForIntegration(id, 'follow') */
export async function getXFollowRateLimitForIntegration(
  integrationId: string
): Promise<XFollowRateLimitStatus> {
  return getXGraphRateLimitForIntegration(integrationId, 'follow');
}

export async function getXUnfollowRateLimitForIntegration(
  integrationId: string
): Promise<XFollowRateLimitStatus> {
  return getXGraphRateLimitForIntegration(integrationId, 'unfollow');
}

export async function recordXGraphActionsForIntegration(
  integrationId: string,
  action: XGraphAction,
  actionCount: number
): Promise<XFollowRateLimitStatus> {
  if (actionCount <= 0) {
    return getXGraphRateLimitForIntegration(integrationId, action);
  }

  const { windowMs } = getGraphRateLimitConfig(action);
  const store = await readStore();
  const now = Date.now();
  const key = storeKey(integrationId, action);
  const existing = pruneGraphTimestamps(
    readTimestamps(store, integrationId, action),
    windowMs,
    now
  );
  const added = Array.from({ length: actionCount }, () => now);
  store[key] = [...existing, ...added];
  if (store[integrationId]) {
    delete store[integrationId];
  }
  await writeStore(store);
  return buildXGraphRateLimitStatus(store[key], action, now);
}

/** @deprecated Use recordXGraphActionsForIntegration(id, 'follow', count) */
export async function recordXFollowsForIntegration(
  integrationId: string,
  followCount: number
): Promise<XFollowRateLimitStatus> {
  return recordXGraphActionsForIntegration(
    integrationId,
    'follow',
    followCount
  );
}

export async function recordXUnfollowsForIntegration(
  integrationId: string,
  unfollowCount: number
): Promise<XFollowRateLimitStatus> {
  return recordXGraphActionsForIntegration(
    integrationId,
    'unfollow',
    unfollowCount
  );
}
