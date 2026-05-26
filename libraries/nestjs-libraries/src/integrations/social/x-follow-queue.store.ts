import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  buildPendingFollowSchedule,
  buildQueueWindowEstimate,
  followSlotsAvailableNow,
  XFollowQueueItem,
  XFollowQueueItemStatus,
  XFollowQueueStatus,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-queue';
import { X_FOLLOW_DAILY_LIMIT_MAX } from '@gitroom/nestjs-libraries/integrations/social/x-follow-rate-limit';

const MAX_PENDING_QUEUE =
  Number(process.env.X_FOLLOW_QUEUE_MAX_PENDING) > 0
    ? Number(process.env.X_FOLLOW_QUEUE_MAX_PENDING)
    : 10_000;
import {
  getXFollowRateLimitForIntegration,
  recordXFollowsForIntegration,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-rate-limit.store';

type StoreShape = Record<string, XFollowQueueItem[]>;

function resolveFilePath(): string {
  const raw = process.env.X_FOLLOW_QUEUE_FILE?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  }
  return path.join(process.cwd(), '.data', 'x-follow-queue.json');
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

function storeKey(integrationId: string): string {
  return integrationId;
}

function countByStatus(items: XFollowQueueItem[]) {
  const counts = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const item of items) {
    if (item.status in counts) {
      counts[item.status as keyof typeof counts] += 1;
    }
  }
  return counts;
}

export async function enqueueXFollowQueueItems(
  integrationId: string,
  orgId: string,
  entries: {
    targetUserId: string;
    targetUsername?: string;
    targetName?: string;
  }[]
): Promise<{ added: number; skipped: number }> {
  if (!entries.length) {
    return { added: 0, skipped: 0 };
  }

  const store = await readStore();
  const key = storeKey(integrationId);
  const existing = store[key] ?? [];
  const pendingActive = existing.filter(
    (i) => i.status === 'pending' || i.status === 'processing'
  );
  const pendingIds = new Set(pendingActive.map((i) => i.targetUserId));

  const now = new Date().toISOString();
  const toAdd: XFollowQueueItem[] = [];
  let skipped = 0;

  for (const entry of entries) {
    if (pendingIds.has(entry.targetUserId)) {
      skipped += 1;
      continue;
    }
    pendingIds.add(entry.targetUserId);
    toAdd.push({
      id: randomUUID(),
      integrationId,
      orgId,
      targetUserId: entry.targetUserId,
      targetUsername: entry.targetUsername,
      targetName: entry.targetName,
      status: 'pending',
      createdAt: now,
    });
  }

  const wouldAdd = toAdd.length;
  if (pendingActive.length + wouldAdd > MAX_PENDING_QUEUE) {
    const allowed = Math.max(0, MAX_PENDING_QUEUE - pendingActive.length);
    toAdd.splice(allowed);
    skipped += wouldAdd - allowed;
  }

  if (toAdd.length) {
    store[key] = [...existing, ...toAdd];
    await writeStore(store);
  }

  return { added: toAdd.length, skipped };
}

export async function cancelXFollowQueueItem(
  integrationId: string,
  itemId: string
): Promise<boolean> {
  const store = await readStore();
  const key = storeKey(integrationId);
  const items = store[key];
  if (!items?.length) {
    return false;
  }

  let changed = false;
  store[key] = items.map((item) => {
    if (item.id !== itemId || item.status !== 'pending') {
      return item;
    }
    changed = true;
    return { ...item, status: 'cancelled' as XFollowQueueItemStatus };
  });

  if (changed) {
    await writeStore(store);
  }
  return changed;
}

export async function clearXFollowQueueCompleted(
  integrationId: string
): Promise<number> {
  const store = await readStore();
  const key = storeKey(integrationId);
  const items = store[key];
  if (!items?.length) {
    return 0;
  }

  const before = items.length;
  store[key] = items.filter(
    (i) => i.status !== 'completed' && i.status !== 'cancelled'
  );
  const removed = before - store[key].length;
  if (removed > 0) {
    await writeStore(store);
  }
  return removed;
}

export async function listIntegrationIdsWithPendingQueue(): Promise<
  { integrationId: string; orgId: string }[]
> {
  const store = await readStore();
  const out: { integrationId: string; orgId: string }[] = [];
  for (const integrationId of Object.keys(store)) {
    const pending = (store[integrationId] ?? []).find(
      (i) => i.status === 'pending'
    );
    if (pending) {
      out.push({ integrationId, orgId: pending.orgId });
    }
  }
  return out;
}

export async function getXFollowQueueStatus(
  integrationId: string,
  orgId: string,
  listLimit = 50
): Promise<XFollowQueueStatus> {
  const store = await readStore();
  const items = (store[storeKey(integrationId)] ?? []).filter(
    (i) => i.orgId === orgId
  );
  const rateLimit = await getXFollowRateLimitForIntegration(integrationId);
  const counts = countByStatus(items);
  const pending = counts.pending + counts.processing;
  const window = buildQueueWindowEstimate(rateLimit, pending);
  const slots = followSlotsAvailableNow(rateLimit);
  const pendingItems = items
    .filter((i) => i.status === 'pending')
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  const scheduledPending = buildPendingFollowSchedule(pendingItems, rateLimit);

  return {
    ...counts,
    totalQueued: items.filter(
      (i) =>
        i.status === 'pending' ||
        i.status === 'processing' ||
        i.status === 'failed'
    ).length,
    pending: counts.pending,
    processing: counts.processing,
    items: [
      ...scheduledPending,
      ...items.filter((i) => i.status === 'processing' || i.status === 'failed'),
    ]
      .slice(-listLimit)
      .reverse(),
    rateLimit,
    window,
    dailyLimit: rateLimit.daily?.limit ?? X_FOLLOW_DAILY_LIMIT_MAX,
    dailyRemaining: rateLimit.daily?.remaining ?? rateLimit.remaining,
    nextWindowAt: slots > 0 ? null : rateLimit.resetsAt,
  };
}

export type ProcessXFollowQueueResult = {
  processed: number;
  succeeded: number;
  failed: number;
  rateLimit: Awaited<ReturnType<typeof getXFollowRateLimitForIntegration>>;
};

export async function processXFollowQueueBatch(
  integrationId: string,
  orgId: string,
  followUsers: (
    userIds: string[]
  ) => Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }>
): Promise<ProcessXFollowQueueResult> {
  const store = await readStore();
  const key = storeKey(integrationId);
  const items = store[key] ?? [];

  const rateBefore = await getXFollowRateLimitForIntegration(integrationId);
  const slots = followSlotsAvailableNow(rateBefore);
  if (slots <= 0) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      rateLimit: rateBefore,
    };
  }

  const pending = items.filter(
    (i) => i.orgId === orgId && i.status === 'pending'
  );
  if (!pending.length) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      rateLimit: rateBefore,
    };
  }

  const batch = pending.slice(0, slots);
  const batchIds = new Set(batch.map((b) => b.id));
  const now = new Date().toISOString();

  store[key] = items.map((item) =>
    batchIds.has(item.id) ? { ...item, status: 'processing' as const } : item
  );
  await writeStore(store);

  let succeeded: string[] = [];
  let failed: { id: string; error: string }[] = [];

  try {
    const result = await followUsers(batch.map((b) => b.targetUserId));
    succeeded = result.succeeded;
    failed = result.failed;
  } catch (err: any) {
    const msg = err?.message || 'Follow batch failed';
    failed = batch.map((b) => ({
      id: b.targetUserId,
      error: String(msg),
    }));
  }

  const succeededSet = new Set(succeeded);
  const failedMap = new Map(failed.map((f) => [f.id, f.error]));

  const storeAfter = await readStore();
  const list = storeAfter[key] ?? [];

  storeAfter[key] = list.map((item) => {
    if (!batchIds.has(item.id)) {
      return item;
    }
    if (succeededSet.has(item.targetUserId)) {
      return {
        ...item,
        status: 'completed' as XFollowQueueItemStatus,
        processedAt: now,
      };
    }
    const err = failedMap.get(item.targetUserId);
    return {
      ...item,
      status: 'failed' as XFollowQueueItemStatus,
      processedAt: now,
      error: err || 'Follow failed',
    };
  });

  await writeStore(storeAfter);

  const rateLimit = await recordXFollowsForIntegration(
    integrationId,
    succeeded.length
  );

  return {
    processed: batch.length,
    succeeded: succeeded.length,
    failed: failed.length,
    rateLimit,
  };
}
