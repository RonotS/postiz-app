"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X_FOLLOW_QUEUE_PROCESSING_TIMEOUT_MS = void 0;
exports.followSlotsAvailableNow = followSlotsAvailableNow;
exports.isCreditsDepletedError = isCreditsDepletedError;
exports.buildQueueWindowEstimate = buildQueueWindowEstimate;
exports.defaultDailyLimit = defaultDailyLimit;
exports.defaultWindowLimit = defaultWindowLimit;
exports.defaultWindowMinutes = defaultWindowMinutes;
exports.computeFollowQueueScheduleCursor = computeFollowQueueScheduleCursor;
exports.buildPendingFollowSchedule = buildPendingFollowSchedule;
const x_follow_rate_limit_1 = require("./x-follow-rate-limit");
function followSlotsAvailableNow(rateLimit) {
    const dailyRemaining = rateLimit.daily?.remaining ?? rateLimit.remaining;
    const windowRemaining = Math.max(0, rateLimit.limit - rateLimit.count);
    return Math.min(dailyRemaining, windowRemaining, x_follow_rate_limit_1.X_FOLLOW_BATCH_MAX);
}
function isCreditsDepletedError(message) {
    if (!message)
        return false;
    const m = message.toLowerCase();
    return (m.includes('creditsdepleted') ||
        m.includes('credits depleted') ||
        m.includes('credit depleted') ||
        m.includes('insufficient credits') ||
        m.includes('not enough credits'));
}
exports.X_FOLLOW_QUEUE_PROCESSING_TIMEOUT_MS = Number(process.env.X_FOLLOW_QUEUE_PROCESSING_TIMEOUT_MS) > 0
    ? Number(process.env.X_FOLLOW_QUEUE_PROCESSING_TIMEOUT_MS)
    : 10 * 60 * 1000;
function buildQueueWindowEstimate(rateLimit, pendingCount) {
    const remaining = Math.max(0, rateLimit.limit - rateLimit.count);
    const nextBatchSize = Math.min(remaining, x_follow_rate_limit_1.X_FOLLOW_BATCH_MAX, pendingCount);
    return {
        windowMinutes: rateLimit.windowMinutes,
        limit: rateLimit.limit,
        used: rateLimit.count,
        remaining,
        resetsAt: rateLimit.resetsAt,
        nextBatchSize,
    };
}
function defaultDailyLimit() {
    return x_follow_rate_limit_1.X_FOLLOW_DAILY_LIMIT_MAX;
}
function defaultWindowLimit() {
    return x_follow_rate_limit_1.X_FOLLOW_RATE_LIMIT_MAX;
}
function defaultWindowMinutes() {
    return Math.round(x_follow_rate_limit_1.X_FOLLOW_RATE_LIMIT_WINDOW_MS / 60_000);
}
/**
 * Where to continue scheduling when appending new queue items after existing slots.
 */
function computeFollowQueueScheduleCursor(scheduledPending, rateLimit) {
    const perSlot = x_follow_rate_limit_1.X_FOLLOW_BATCH_MAX;
    const windowMs = x_follow_rate_limit_1.X_FOLLOW_RATE_LIMIT_WINDOW_MS;
    if (!scheduledPending.length) {
        const windowRemaining = Math.max(0, rateLimit.limit - rateLimit.count);
        let startAfter = Date.now();
        if (windowRemaining <= 0) {
            startAfter = new Date(rateLimit.resetsAt).getTime();
        }
        return { startAfter, slotLeft: perSlot };
    }
    const bySlot = new Map();
    for (const item of scheduledPending) {
        if (!item.scheduledFollowAt)
            continue;
        const ts = new Date(item.scheduledFollowAt).getTime();
        const slot = Math.floor(ts / windowMs) * windowMs;
        bySlot.set(slot, (bySlot.get(slot) ?? 0) + 1);
    }
    const lastSlot = Math.max(...bySlot.keys());
    const countInLast = bySlot.get(lastSlot) ?? 0;
    if (countInLast >= perSlot) {
        return { startAfter: lastSlot + windowMs, slotLeft: perSlot };
    }
    return { startAfter: lastSlot, slotLeft: perSlot - countInLast };
}
/**
 * Assign each pending item a 15-minute time slot (25 follows per slot by default).
 * All profiles in the same slot share the same timestamp so the queue tab can show
 * batch 1 done while batches 2–4 stay pending.
 */
function buildPendingFollowSchedule(pendingItems, rateLimit, options) {
    const sorted = [...pendingItems].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let dailyLeft = rateLimit.daily?.remaining ?? rateLimit.remaining;
    let slotLeft = options?.slotLeft ?? x_follow_rate_limit_1.X_FOLLOW_BATCH_MAX;
    let windowCursor = options?.startAfter ?? Date.now();
    if (options?.startAfter === undefined) {
        const windowRemaining = Math.max(0, rateLimit.limit - rateLimit.count);
        if (windowRemaining <= 0) {
            windowCursor = new Date(rateLimit.resetsAt).getTime();
        }
    }
    return sorted.map((item) => {
        if (dailyLeft <= 0) {
            return { ...item, scheduledFollowAt: undefined };
        }
        if (slotLeft <= 0) {
            windowCursor += x_follow_rate_limit_1.X_FOLLOW_RATE_LIMIT_WINDOW_MS;
            slotLeft = x_follow_rate_limit_1.X_FOLLOW_BATCH_MAX;
        }
        const scheduledFollowAt = new Date(windowCursor).toISOString();
        slotLeft -= 1;
        dailyLeft -= 1;
        return { ...item, scheduledFollowAt };
    });
}
//# sourceMappingURL=x-follow-queue.js.map