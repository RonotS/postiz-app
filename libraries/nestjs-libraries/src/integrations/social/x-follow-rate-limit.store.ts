import { promises as fs } from 'fs';
import path from 'path';
import {
  buildXFollowRateLimitStatus,
  pruneFollowTimestamps,
  XFollowRateLimitStatus,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-rate-limit';

type StoreShape = Record<string, number[]>;

function resolveFilePath(): string {
  const raw = process.env.X_FOLLOW_RATE_LIMIT_FILE?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  }
  return path.join(process.cwd(), '.data', 'x-follow-rate-limits.json');
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

export async function getXFollowRateLimitForIntegration(
  integrationId: string
): Promise<XFollowRateLimitStatus> {
  const store = await readStore();
  const timestamps = store[integrationId] || [];
  return buildXFollowRateLimitStatus(timestamps);
}

export async function recordXFollowsForIntegration(
  integrationId: string,
  followCount: number
): Promise<XFollowRateLimitStatus> {
  if (followCount <= 0) {
    return getXFollowRateLimitForIntegration(integrationId);
  }

  const store = await readStore();
  const now = Date.now();
  const existing = pruneFollowTimestamps(store[integrationId] || [], now);
  const added = Array.from({ length: followCount }, () => now);
  store[integrationId] = [...existing, ...added];
  await writeStore(store);
  return buildXFollowRateLimitStatus(store[integrationId], now);
}
