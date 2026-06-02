"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reclaimStuckFollowQueueForIntegration = reclaimStuckFollowQueueForIntegration;
exports.enqueueXFollowQueueItems = enqueueXFollowQueueItems;
exports.persistPendingFollowSchedule = persistPendingFollowSchedule;
exports.cancelXFollowQueueItem = cancelXFollowQueueItem;
exports.resumeXFollowQueueAfterCredits = resumeXFollowQueueAfterCredits;
exports.clearXFollowQueueCompleted = clearXFollowQueueCompleted;
exports.clearXFollowQueueItems = clearXFollowQueueItems;
exports.listIntegrationIdsWithPendingQueue = listIntegrationIdsWithPendingQueue;
exports.getXFollowQueueStatus = getXFollowQueueStatus;
exports.isFollowQueueItemDue = isFollowQueueItemDue;
exports.isFollowQueueItemRunnable = isFollowQueueItemRunnable;
exports.processXFollowQueueBatch = processXFollowQueueBatch;
const tslib_1 = require("tslib");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = tslib_1.__importDefault(require("path"));
const x_follow_queue_1 = require("./x-follow-queue");
const x_follow_rate_limit_1 = require("./x-follow-rate-limit");
const MAX_PENDING_QUEUE = Number(process.env.X_FOLLOW_QUEUE_MAX_PENDING) > 0
    ? Number(process.env.X_FOLLOW_QUEUE_MAX_PENDING)
    : 10_000;
const x_follow_rate_limit_store_1 = require("./x-follow-rate-limit.store");
function resolveFilePath() {
    const raw = process.env.X_FOLLOW_QUEUE_FILE?.trim();
    if (raw) {
        return path_1.default.isAbsolute(raw) ? raw : path_1.default.join(process.cwd(), raw);
    }
    return path_1.default.join(process.cwd(), '.data', 'x-follow-queue.json');
}
let cache = null;
async function readStore(force = false) {
    const file = resolveFilePath();
    try {
        const stat = await fs_1.promises.stat(file);
        if (!force && cache && cache.mtimeMs === stat.mtimeMs) {
            return cache.data;
        }
        const text = await fs_1.promises.readFile(file, 'utf8');
        const data = JSON.parse(text);
        cache = { data, mtimeMs: stat.mtimeMs };
        return data;
    }
    catch (err) {
        if (err?.code !== 'ENOENT') {
            throw err;
        }
        cache = { data: {}, mtimeMs: 0 };
        return cache.data;
    }
}
async function writeStore(data) {
    const file = resolveFilePath();
    await fs_1.promises.mkdir(path_1.default.dirname(file), { recursive: true });
    await fs_1.promises.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
    try {
        const stat = await fs_1.promises.stat(file);
        cache = { data, mtimeMs: stat.mtimeMs };
    }
    catch {
        cache = { data, mtimeMs: Date.now() };
    }
}
function reclaimStuckFollowQueueItems(items, maxAgeMs = x_follow_queue_1.X_FOLLOW_QUEUE_PROCESSING_TIMEOUT_MS) {
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
            status: 'pending',
            processingStartedAt: undefined,
            error: item.error ||
                'Previous follow attempt was interrupted — queued again automatically.',
        };
    });
    return { items: next, reclaimed };
}
async function reclaimStuckFollowQueueForIntegration(integrationId) {
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
function storeKey(integrationId) {
    return integrationId;
}
function countByStatus(items) {
    const counts = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
    };
    for (const item of items) {
        if (item.status in counts) {
            counts[item.status] += 1;
        }
    }
    return counts;
}
async function enqueueXFollowQueueItems(integrationId, orgId, entries, options) {
    if (!entries.length) {
        return { added: 0, skipped: 0, addedItemIds: [] };
    }
    const store = await readStore();
    const key = storeKey(integrationId);
    const existing = store[key] ?? [];
    const pendingActive = existing.filter((i) => i.status === 'pending' || i.status === 'processing');
    const pendingIds = new Set(pendingActive.map((i) => i.targetUserId));
    const now = new Date().toISOString();
    const toAdd = [];
    let skipped = 0;
    for (const entry of entries) {
        if (pendingIds.has(entry.targetUserId)) {
            skipped += 1;
            continue;
        }
        pendingIds.add(entry.targetUserId);
        toAdd.push({
            id: (0, crypto_1.randomUUID)(),
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
async function persistPendingFollowSchedule(integrationId, orgId, options) {
    const store = await readStore(true);
    const key = storeKey(integrationId);
    const items = store[key] ?? [];
    const needsSchedule = items
        .filter((i) => i.orgId === orgId && i.status === 'pending' && !i.scheduledFollowAt)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (!needsSchedule.length) {
        return;
    }
    const rateLimit = await (0, x_follow_rate_limit_store_1.getXFollowRateLimitForIntegration)(integrationId);
    if (options?.firstBatchNow) {
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const firstCount = Math.min(x_follow_rate_limit_1.X_FOLLOW_BATCH_MAX, needsSchedule.length);
        const firstIds = new Set(needsSchedule.slice(0, firstCount).map((item) => item.id));
        const rest = needsSchedule.slice(firstCount);
        const restScheduled = rest.length
            ? (0, x_follow_queue_1.buildPendingFollowSchedule)(rest, rateLimit, {
                startAfter: nowMs + x_follow_rate_limit_1.X_FOLLOW_RATE_LIMIT_WINDOW_MS,
                slotLeft: x_follow_rate_limit_1.X_FOLLOW_BATCH_MAX,
            })
            : [];
        const restById = new Map(restScheduled.map((i) => [i.id, i.scheduledFollowAt]));
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
    const alreadyScheduled = items.filter((i) => i.orgId === orgId && i.status === 'pending' && !!i.scheduledFollowAt);
    const { startAfter, slotLeft } = (0, x_follow_queue_1.computeFollowQueueScheduleCursor)(alreadyScheduled, rateLimit);
    const scheduled = (0, x_follow_queue_1.buildPendingFollowSchedule)(needsSchedule, rateLimit, {
        startAfter,
        slotLeft,
    });
    const byId = new Map(scheduled.map((i) => [i.id, i.scheduledFollowAt]));
    store[key] = items.map((item) => byId.has(item.id)
        ? { ...item, scheduledFollowAt: byId.get(item.id) }
        : item);
    await writeStore(store);
}
async function cancelXFollowQueueItem(integrationId, itemId) {
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
        return { ...item, status: 'cancelled' };
    });
    if (changed) {
        await writeStore(store);
    }
    return changed;
}
async function resumeXFollowQueueAfterCredits(integrationId, orgId) {
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
function integrationQueuePausedForCredits(items, orgId) {
    return items.some((i) => i.orgId === orgId &&
        i.status === 'pending' &&
        i.creditHold === true);
}
function pauseIntegrationQueueForCredits(items, orgId) {
    return items.map((item) => {
        if (item.orgId !== orgId) {
            return item;
        }
        if (item.status !== 'pending' && item.status !== 'processing') {
            return item;
        }
        return {
            ...item,
            status: 'pending',
            creditHold: true,
            processingStartedAt: undefined,
            error: undefined,
        };
    });
}
async function clearXFollowQueueCompleted(integrationId) {
    const store = await readStore(true);
    const key = storeKey(integrationId);
    const items = store[key];
    if (!items?.length) {
        return 0;
    }
    const before = items.length;
    store[key] = items.filter((i) => i.status !== 'completed' && i.status !== 'cancelled');
    const removed = before - store[key].length;
    if (removed > 0) {
        await writeStore(store);
    }
    return removed;
}
async function clearXFollowQueueItems(integrationId, orgId, itemIds) {
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
async function listIntegrationIdsWithPendingQueue() {
    const store = await readStore(true);
    const out = [];
    for (const integrationId of Object.keys(store)) {
        const { items: reclaimedItems, reclaimed } = reclaimStuckFollowQueueItems(store[integrationId] ?? []);
        if (reclaimed > 0) {
            store[integrationId] = reclaimedItems;
        }
        const nowMs = Date.now();
        const active = reclaimedItems.find((i) => isFollowQueueItemRunnable(i, nowMs));
        if (active) {
            out.push({ integrationId, orgId: active.orgId });
        }
    }
    if (out.length) {
        await writeStore(store);
    }
    return out;
}
function buildQueueItemsForDisplay(items, rateLimit) {
    const pendingItems = items
        .filter((i) => i.status === 'pending')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const needsSchedule = pendingItems.filter((i) => !i.scheduledFollowAt);
    const alreadyScheduled = pendingItems.filter((i) => i.scheduledFollowAt);
    const { startAfter, slotLeft } = (0, x_follow_queue_1.computeFollowQueueScheduleCursor)(alreadyScheduled, rateLimit);
    const computed = needsSchedule.length
        ? (0, x_follow_queue_1.buildPendingFollowSchedule)(needsSchedule, rateLimit, { startAfter, slotLeft })
        : [];
    const computedById = new Map(computed.map((i) => [i.id, i]));
    const scheduledPending = pendingItems.map((item) => computedById.get(item.id) ?? item);
    const processing = items
        .filter((i) => i.status === 'processing')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const failed = items
        .filter((i) => i.status === 'failed')
        .sort((a, b) => new Date(b.processedAt || b.createdAt).getTime() -
        new Date(a.processedAt || a.createdAt).getTime());
    const completed = items
        .filter((i) => i.status === 'completed' || i.status === 'cancelled')
        .sort((a, b) => new Date(b.processedAt || b.createdAt).getTime() -
        new Date(a.processedAt || a.createdAt).getTime());
    return [
        ...scheduledPending,
        ...processing,
        ...failed,
        ...completed,
    ];
}
async function getXFollowQueueStatus(integrationId, orgId) {
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
    const rateLimit = await (0, x_follow_rate_limit_store_1.getXFollowRateLimitForIntegration)(integrationId);
    const counts = countByStatus(items);
    const pending = counts.pending + counts.processing;
    const window = (0, x_follow_queue_1.buildQueueWindowEstimate)(rateLimit, pending);
    const slots = (0, x_follow_queue_1.followSlotsAvailableNow)(rateLimit);
    const creditsPaused = integrationQueuePausedForCredits(items, orgId);
    return {
        ...counts,
        totalQueued: items.filter((i) => i.status === 'pending' ||
            i.status === 'processing' ||
            i.status === 'failed').length,
        pending: counts.pending,
        processing: counts.processing,
        items: buildQueueItemsForDisplay(items, rateLimit),
        rateLimit,
        window,
        dailyLimit: rateLimit.daily?.limit ?? x_follow_rate_limit_1.X_FOLLOW_DAILY_LIMIT_MAX,
        dailyRemaining: rateLimit.daily?.remaining ?? rateLimit.remaining,
        nextWindowAt: slots > 0 ? null : rateLimit.resetsAt,
        creditsPaused,
    };
}
function isFollowQueueItemDue(item, now = Date.now()) {
    if (!item.scheduledFollowAt) {
        return true;
    }
    const at = new Date(item.scheduledFollowAt).getTime();
    return Number.isFinite(at) && at <= now;
}
function isFollowQueueItemRunnable(item, now = Date.now()) {
    if (item.status === 'processing') {
        return true;
    }
    if (item.status === 'pending' && !item.creditHold) {
        return isFollowQueueItemDue(item, now);
    }
    return false;
}
async function processXFollowQueueBatch(integrationId, orgId, followUsers, options) {
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
    const rateBefore = await (0, x_follow_rate_limit_store_1.getXFollowRateLimitForIntegration)(integrationId);
    if (integrationQueuePausedForCredits(items, orgId)) {
        return {
            processed: 0,
            succeeded: 0,
            failed: 0,
            succeededUserIds: [],
            rateLimit: rateBefore,
        };
    }
    const slots = (0, x_follow_queue_1.followSlotsAvailableNow)(rateBefore);
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
        if (aAt !== bAt)
            return aAt - bAt;
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
    store[key] = items.map((item) => batchIds.has(item.id)
        ? {
            ...item,
            status: 'processing',
            processingStartedAt,
        }
        : item);
    await writeStore(store);
    let succeeded = [];
    let failed = [];
    let batchFailed = false;
    try {
        const result = await followUsers(batch.map((b) => b.targetUserId));
        succeeded = result.succeeded;
        failed = result.failed;
    }
    catch (err) {
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
                status: 'completed',
                processedAt: now,
                processingStartedAt: undefined,
                creditHold: undefined,
            };
        }
        const err = failedMap.get(item.targetUserId);
        if ((0, x_follow_queue_1.isCreditsDepletedError)(err) || (batchFailed && (0, x_follow_queue_1.isCreditsDepletedError)(err))) {
            creditsDepletedInBatch = true;
            return {
                ...item,
                status: 'pending',
                processingStartedAt: undefined,
                creditHold: true,
                error: undefined,
            };
        }
        if (batchFailed) {
            return {
                ...item,
                status: 'pending',
                processingStartedAt: undefined,
                error: err || 'Follow batch failed — will retry automatically',
            };
        }
        if (err) {
            return {
                ...item,
                status: 'failed',
                processedAt: now,
                processingStartedAt: undefined,
                error: err,
            };
        }
        return {
            ...item,
            status: 'pending',
            processingStartedAt: undefined,
            error: 'No follow result returned — queued again automatically',
        };
    });
    storeAfter[key] = creditsDepletedInBatch
        ? pauseIntegrationQueueForCredits(updated, orgId)
        : updated;
    await writeStore(storeAfter);
    const rateLimit = await (0, x_follow_rate_limit_store_1.recordXFollowsForIntegration)(integrationId, succeeded.length);
    return {
        processed: batch.length,
        succeeded: succeeded.length,
        failed: failed.length,
        succeededUserIds: succeeded,
        rateLimit,
    };
}
//# sourceMappingURL=x-follow-queue.store.js.map