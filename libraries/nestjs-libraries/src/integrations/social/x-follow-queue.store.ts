import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  buildPendingFollowSchedule,
  computeFollowQueueScheduleCursor,
  buildQueueWindowEstimate,
  followSlotsAvailableNow,
  isCreditsDepletedError,
  X_FOLLOW_QUEUE_PROCESSING_TIMEOUT_MS,
  XFollowQueueItem,
  XFollowQueueItemStatus,
  XFollowQueueStatus,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-queue';
import {
  X_FOLLOW_BATCH_MAX,
  X_FOLLOW_DAILY_LIMIT_MAX,
  X_FOLLOW_RATE_LIMIT_WINDOW_MS,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-rate-limit';

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

type StoreCache = { data: StoreShape; mtimeMs: number };

let cache: StoreCache | null = null;

async function readStore(force = false): Promise<StoreShape> {
  const file = resolveFilePath();
  try {
    const stat = await fs.stat(file);
    if (!force && cache && cache.mtimeMs === stat.mtimeMs) {
      return cache.data;
    }
    const text = await fs.readFile(file, 'utf8');
    const data = JSON.parse(text) as StoreShape;
    cache = { data, mtimeMs: stat.mtimeMs };
    return data;
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      throw err;
    }
    cache = { data: {}, mtimeMs: 0 };
    return cache.data;
  }
}

async function writeStore(data: StoreShape): Promise<void> {
  const file = resolveFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  try {
    const stat = await fs.stat(file);
    cache = { data, mtimeMs: stat.mtimeMs };
  } catch {
    cache = { data, mtimeMs: Date.now() };
  }
}

function reclaimStuckFollowQueueItems(
  items: XFollowQueueItem[],
  maxAgeMs = X_FOLLOW_QUEUE_PROCESSING_TIMEOUT_MS
): { items: XFollowQueueItem[]; reclaimed: number } {
  const now = Date.now();
  let reclaimed = 0;

  const next = items.map((item) => {
    if (item.status !== 'processing') {
      return item;
    }

    const startedAt = item.processingStartedAt || item.createdAt;
    const ageMs = now - new Date(startedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < maxAgeMs) {
      return item;
    }

    reclaimed += 1;
    return {
      ...item,
      status: 'pending' as XFollowQueueItemStatus,
      processingStartedAt: undefined,
      error:
        item.error ||
        'Previous follow attempt was interrupted — queued again automatically.',
    };
  });

  return { items: next, reclaimed };
}

export async function reclaimStuckFollowQueueForIntegration(
  integrationId: string
): Promise<number> {
  const store = await readStore(true);
  const key = storeKey(integrationId);
  const items = store[key];
  if (!items?.length) {
    return 0;
  }

  const { items: reclaimedItems, reclaimed } = reclaimStuckFollowQueueItems(items);
  if (reclaimed > 0) {
    store[key] = reclaimedItems;
    await writeStore(store);
  }
  return reclaimed;
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
  }[],
  options?: { firstBatchNow?: boolean }
): Promise<{ added: number; skipped: number; addedItemIds: string[] }> {
  if (!entries.length) {
    return { added: 0, skipped: 0, addedItemIds: [] };
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
    await persistPendingFollowSchedule(integrationId, orgId, {
      firstBatchNow: options?.firstBatchNow,
    });
  }

  return {
    added: toAdd.length,
    skipped,
    addedItemIds: toAdd.map((item) => item.id),
  };
}

/** Persist 15-minute slot times on pending items (stable across completed + pending in the UI). */
export async function persistPendingFollowSchedule(
  integrationId: string,
  orgId: string,
  options?: { firstBatchNow?: boolean }
): Promise<void> {
  const store = await readStore(true);
  const key = storeKey(integrationId);
  const items = store[key] ?? [];
  const needsSchedule = items
    .filter(
      (i) =>
        i.orgId === orgId && i.status === 'pending' && !i.scheduledFollowAt
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  if (!needsSchedule.length) {
    return;
  }

  const rateLimit = await getXFollowRateLimitForIntegration(integrationId);

  if (options?.firstBatchNow) {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const firstCount = Math.min(X_FOLLOW_BATCH_MAX, needsSchedule.length);
    const firstIds = new Set(
      needsSchedule.slice(0, firstCount).map((item) => item.id)
    );
    const rest = needsSchedule.slice(firstCount);
    const restScheduled = rest.length
      ? buildPendingFollowSchedule(rest, rateLimit, {
          startAfter: nowMs + X_FOLLOW_RATE_LIMIT_WINDOW_MS,
          slotLeft: X_FOLLOW_BATCH_MAX,
        })
      : [];
    const restById = new Map(
      restScheduled.map((i) => [i.id, i.scheduledFollowAt] as const)
    );

    store[key] = items.map((item) => {
      if (firstIds.has(item.id)) {
        return { ...item, scheduledFollowAt: nowIso };
      }
      if (restById.has(item.id)) {
        return { ...item, scheduledFollowAt: restById.get(item.id) };
      }
      return item;
    });
    await writeStore(store);
    return;
  }

  const alreadyScheduled = items.filter(
    (i) =>
      i.orgId === orgId && i.status === 'pending' && !!i.scheduledFollowAt
  );
  const { startAfter, slotLeft } = computeFollowQueueScheduleCursor(
    alreadyScheduled,
    rateLimit
  );
  const scheduled = buildPendingFollowSchedule(needsSchedule, rateLimit, {
    startAfter,
    slotLeft,
  });
  const byId = new Map(
    scheduled.map((i) => [i.id, i.scheduledFollowAt] as const)
  );

  store[key] = items.map((item) =>
    byId.has(item.id)
      ? { ...item, scheduledFollowAt: byId.get(item.id) }
      : item
  );
  await writeStore(store);
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

export async function resumeXFollowQueueAfterCredits(
  integrationId: string,
  orgId: string
): Promise<number> {
  const store = await readStore(true);
  const key = storeKey(integrationId);
  const items = store[key];
  if (!items?.length) {
    return 0;
  }

  let cleared = 0;
  store[key] = items.map((item) => {
    if (item.orgId !== orgId || item.status !== 'pending' || !item.creditHold) {
      return item;
    }
    cleared += 1;
    const { creditHold: _hold, error: _err, ...rest } = item;
    return rest;
  });

  if (cleared > 0) {
    await writeStore(store);
  }
  return cleared;
}

function integrationQueuePausedForCredits(
  items: XFollowQueueItem[],
  orgId: string
): boolean {
  return items.some(
    (i) =>
      i.orgId === orgId &&
      i.status === 'pending' &&
      i.creditHold === true
  );
}

function pauseIntegrationQueueForCredits(
  items: XFollowQueueItem[],
  orgId: string
): XFollowQueueItem[] {
  return items.map((item) => {
    if (item.orgId !== orgId) {
      return item;
    }
    if (item.status !== 'pending' && item.status !== 'processing') {
      return item;
    }
    return {
      ...item,
      status: 'pending' as XFollowQueueItemStatus,
      creditHold: true,
      processingStartedAt: undefined,
      error: undefined,
    };
  });
}

export async function clearXFollowQueueCompleted(
  integrationId: string
): Promise<number> {
  const store = await readStore(true);
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

export async function clearXFollowQueueItems(
  integrationId: string,
  orgId: string,
  itemIds: string[]
): Promise<number> {
  if (!itemIds.length) {
    return 0;
  }
  const store = await readStore(true);
  const key = storeKey(integrationId);
  const items = store[key];
  if (!items?.length) {
    return 0;
  }

  const idSet = new Set(itemIds);
  let removed = 0;
  store[key] = items.filter((item) => {
    if (item.orgId !== orgId || !idSet.has(item.id)) {
      return true;
    }
    if (item.status === 'completed' || item.status === 'cancelled') {
      removed += 1;
      return false;
    }
    return true;
  });

  if (removed > 0) {
    await writeStore(store);
  }
  return removed;
}

export async function listIntegrationIdsWithPendingQueue(): Promise<
  { integrationId: string; orgId: string }[]
> {
  const store = await readStore(true);
  const out: { integrationId: string; orgId: string }[] = [];
  for (const integrationId of Object.keys(store)) {
    const { items: reclaimedItems, reclaimed } = reclaimStuckFollowQueueItems(
      store[integrationId] ?? []
    );
    if (reclaimed > 0) {
      store[integrationId] = reclaimedItems;
    }

    const nowMs = Date.now();
    const active = reclaimedItems.find((i) =>
      isFollowQueueItemRunnable(i, nowMs)
    );
    if (active) {
      out.push({ integrationId, orgId: active.orgId });
    }
  }
  if (out.length) {
    await writeStore(store);
  }
  return out;
}

function buildQueueItemsForDisplay(
  items: XFollowQueueItem[],
  rateLimit: Awaited<ReturnType<typeof getXFollowRateLimitForIntegration>>
): XFollowQueueItem[] {
  const pendingItems = items
    .filter((i) => i.status === 'pending')
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  const needsSchedule = pendingItems.filter((i) => !i.scheduledFollowAt);
  const alreadyScheduled = pendingItems.filter((i) => i.scheduledFollowAt);
  const { startAfter, slotLeft } = computeFollowQueueScheduleCursor(
    alreadyScheduled,
    rateLimit
  );
  const computed = needsSchedule.length
    ? buildPendingFollowSchedule(needsSchedule, rateLimit, { startAfter, slotLeft })
    : [];
  const computedById = new Map(computed.map((i) => [i.id, i]));
  const scheduledPending = pendingItems.map(
    (item) => computedById.get(item.id) ?? item
  );

  const processing = items
    .filter((i) => i.status === 'processing')
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  const failed = items
    .filter((i) => i.status === 'failed')
    .sort(
      (a, b) =>
        new Date(b.processedAt || b.createdAt).getTime() -
        new Date(a.processedAt || a.createdAt).getTime()
    );
  const completed = items
    .filter((i) => i.status === 'completed' || i.status === 'cancelled')
    .sort(
      (a, b) =>
        new Date(b.processedAt || b.createdAt).getTime() -
        new Date(a.processedAt || a.createdAt).getTime()
    );

  return [
    ...scheduledPending,
    ...processing,
    ...failed,
    ...completed,
  ];
}

export async function getXFollowQueueStatus(
  integrationId: string,
  orgId: string
): Promise<XFollowQueueStatus> {
  await reclaimStuckFollowQueueForIntegration(integrationId);
  await persistPendingFollowSchedule(integrationId, orgId);
  const store = await readStore(true);
  const key = storeKey(integrationId);
  const allItems = store[key] ?? [];
  const { items: reclaimedItems, reclaimed } = reclaimStuckFollowQueueItems(allItems);
  if (reclaimed > 0) {
    store[key] = reclaimedItems;
    await writeStore(store);
  }
  const items = reclaimedItems.filter((i) => i.orgId === orgId);
  const rateLimit = await getXFollowRateLimitForIntegration(integrationId);
  const counts = countByStatus(items);
  const pending = counts.pending + counts.processing;
  const window = buildQueueWindowEstimate(rateLimit, pending);
  const slots = followSlotsAvailableNow(rateLimit);
  const creditsPaused = integrationQueuePausedForCredits(items, orgId);

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
    items: buildQueueItemsForDisplay(items, rateLimit),
    rateLimit,
    window,
    dailyLimit: rateLimit.daily?.limit ?? X_FOLLOW_DAILY_LIMIT_MAX,
    dailyRemaining: rateLimit.daily?.remaining ?? rateLimit.remaining,
    nextWindowAt: slots > 0 ? null : rateLimit.resetsAt,
    creditsPaused,
  };
}

export type ProcessXFollowQueueResult = {
  processed: number;
  succeeded: number;
  failed: number;
  succeededUserIds: string[];
  rateLimit: Awaited<ReturnType<typeof getXFollowRateLimitForIntegration>>;
};

export function isFollowQueueItemDue(
  item: XFollowQueueItem,
  now = Date.now()
): boolean {
  if (!item.scheduledFollowAt) {
    return true;
  }
  const at = new Date(item.scheduledFollowAt).getTime();
  return Number.isFinite(at) && at <= now;
}

export function isFollowQueueItemRunnable(
  item: XFollowQueueItem,
  now = Date.now()
): boolean {
  if (item.status === 'processing') {
    return true;
  }
  if (item.status === 'pending' && !item.creditHold) {
    return isFollowQueueItemDue(item, now);
  }
  return false;
}

export async function processXFollowQueueBatch(
  integrationId: string,
  orgId: string,
  followUsers: (
    userIds: string[]
  ) => Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }>,
  options?: { limitToItemIds?: string[] }
): Promise<ProcessXFollowQueueResult> {
  await reclaimStuckFollowQueueForIntegration(integrationId);
  const store = await readStore(true);
  const key = storeKey(integrationId);
  const rawItems = store[key] ?? [];
  const { items: reclaimedItems, reclaimed } = reclaimStuckFollowQueueItems(rawItems);
  if (reclaimed > 0) {
    store[key] = reclaimedItems;
    await writeStore(store);
  }
  const items = reclaimedItems;

  const rateBefore = await getXFollowRateLimitForIntegration(integrationId);

  if (integrationQueuePausedForCredits(items, orgId)) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      succeededUserIds: [],
      rateLimit: rateBefore,
    };
  }

  const slots = followSlotsAvailableNow(rateBefore);
  if (slots <= 0) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      succeededUserIds: [],
      rateLimit: rateBefore,
    };
  }

  const nowMs = Date.now();
  const limitIds = options?.limitToItemIds?.length
    ? new Set(options.limitToItemIds)
    : null;
  const pending = items
    .filter((i) => {
      if (i.orgId !== orgId || i.status !== 'pending') {
        return false;
      }
      if (limitIds) {
        return limitIds.has(i.id);
      }
      return isFollowQueueItemDue(i, nowMs);
    })
    .sort((a, b) => {
      const aAt = new Date(a.scheduledFollowAt || a.createdAt).getTime();
      const bAt = new Date(b.scheduledFollowAt || b.createdAt).getTime();
      if (aAt !== bAt) return aAt - bAt;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  if (!pending.length) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      succeededUserIds: [],
      rateLimit: rateBefore,
    };
  }

  const batch = pending.slice(0, slots);
  const batchIds = new Set(batch.map((b) => b.id));
  const now = new Date().toISOString();

  const processingStartedAt = now;
  store[key] = items.map((item) =>
    batchIds.has(item.id)
      ? {
          ...item,
          status: 'processing' as const,
          processingStartedAt,
        }
      : item
  );
  await writeStore(store);

  let succeeded: string[] = [];
  let failed: { id: string; error: string }[] = [];
  let batchFailed = false;

  try {
    const result = await followUsers(batch.map((b) => b.targetUserId));
    succeeded = result.succeeded;
    failed = result.failed;
  } catch (err: any) {
    batchFailed = true;
    const msg = err?.message || 'Follow batch failed';
    failed = batch.map((b) => ({
      id: b.targetUserId,
      error: String(msg),
    }));
  }

  const succeededSet = new Set(succeeded);
  const failedMap = new Map(failed.map((f) => [f.id, f.error]));

  const storeAfter = await readStore(true);
  const list = storeAfter[key] ?? [];

  let creditsDepletedInBatch = false;

  const updated = list.map((item) => {
    if (!batchIds.has(item.id)) {
      return item;
    }
    if (succeededSet.has(item.targetUserId)) {
      return {
        ...item,
        status: 'completed' as XFollowQueueItemStatus,
        processedAt: now,
        processingStartedAt: undefined,
        creditHold: undefined,
      };
    }
    const err = failedMap.get(item.targetUserId);
    if (isCreditsDepletedError(err) || (batchFailed && isCreditsDepletedError(err))) {
      creditsDepletedInBatch = true;
      return {
        ...item,
        status: 'pending' as XFollowQueueItemStatus,
        processingStartedAt: undefined,
        creditHold: true,
        error: undefined,
      };
    }
    if (batchFailed) {
      return {
        ...item,
        status: 'pending' as XFollowQueueItemStatus,
        processingStartedAt: undefined,
        error: err || 'Follow batch failed — will retry automatically',
      };
    }
    if (err) {
      return {
        ...item,
        status: 'failed' as XFollowQueueItemStatus,
        processedAt: now,
        processingStartedAt: undefined,
        error: err,
      };
    }
    return {
      ...item,
      status: 'pending' as XFollowQueueItemStatus,
      processingStartedAt: undefined,
      error: 'No follow result returned — queued again automatically',
    };
  });

  storeAfter[key] = creditsDepletedInBatch
    ? pauseIntegrationQueueForCredits(updated, orgId)
    : updated;

  await writeStore(storeAfter);

  const rateLimit = await recordXFollowsForIntegration(
    integrationId,
    succeeded.length
  );

  return {
    processed: batch.length,
    succeeded: succeeded.length,
    failed: failed.length,
    succeededUserIds: succeeded,
    rateLimit,
  };
}
