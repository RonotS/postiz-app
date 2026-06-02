"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X_FOLLOW_BATCH_MAX = exports.X_UNFOLLOW_RATE_LIMIT_WINDOW_MS = exports.X_UNFOLLOW_RATE_LIMIT_MAX = exports.X_FOLLOW_DAILY_LIMIT_WINDOW_MS = exports.X_FOLLOW_DAILY_LIMIT_MAX = exports.X_FOLLOW_RATE_LIMIT_WINDOW_MS = exports.X_FOLLOW_RATE_LIMIT_MAX = void 0;
exports.getGraphRateLimitConfig = getGraphRateLimitConfig;
exports.pruneGraphTimestamps = pruneGraphTimestamps;
exports.buildXGraphRateLimitStatus = buildXGraphRateLimitStatus;
exports.formatFollowRateLimitMessage = formatFollowRateLimitMessage;
exports.pruneFollowTimestamps = pruneFollowTimestamps;
exports.buildXFollowRateLimitStatus = buildXFollowRateLimitStatus;
exports.maxFollowsAllowedNow = maxFollowsAllowedNow;
exports.X_FOLLOW_RATE_LIMIT_MAX = Number(process.env.X_FOLLOW_RATE_LIMIT_MAX) > 0
    ? Number(process.env.X_FOLLOW_RATE_LIMIT_MAX)
    : 50;
exports.X_FOLLOW_RATE_LIMIT_WINDOW_MS = Number(process.env.X_FOLLOW_RATE_LIMIT_WINDOW_MS) > 0
    ? Number(process.env.X_FOLLOW_RATE_LIMIT_WINDOW_MS)
    : 15 * 60 * 1000;
/** X account-style daily follow cap (rolling window, follow only). */
exports.X_FOLLOW_DAILY_LIMIT_MAX = Number(process.env.X_FOLLOW_DAILY_LIMIT_MAX) > 0
    ? Number(process.env.X_FOLLOW_DAILY_LIMIT_MAX)
    : 400;
exports.X_FOLLOW_DAILY_LIMIT_WINDOW_MS = Number(process.env.X_FOLLOW_DAILY_LIMIT_WINDOW_MS) > 0
    ? Number(process.env.X_FOLLOW_DAILY_LIMIT_WINDOW_MS)
    : 24 * 60 * 60 * 1000;
exports.X_UNFOLLOW_RATE_LIMIT_MAX = Number(process.env.X_UNFOLLOW_RATE_LIMIT_MAX) > 0
    ? Number(process.env.X_UNFOLLOW_RATE_LIMIT_MAX)
    : exports.X_FOLLOW_RATE_LIMIT_MAX;
exports.X_UNFOLLOW_RATE_LIMIT_WINDOW_MS = Number(process.env.X_UNFOLLOW_RATE_LIMIT_WINDOW_MS) > 0
    ? Number(process.env.X_UNFOLLOW_RATE_LIMIT_WINDOW_MS)
    : exports.X_FOLLOW_RATE_LIMIT_WINDOW_MS;
exports.X_FOLLOW_BATCH_MAX = 25;
function getGraphRateLimitConfig(action) {
    if (action === 'unfollow') {
        return {
            max: exports.X_UNFOLLOW_RATE_LIMIT_MAX,
            windowMs: exports.X_UNFOLLOW_RATE_LIMIT_WINDOW_MS,
        };
    }
    return {
        max: exports.X_FOLLOW_RATE_LIMIT_MAX,
        windowMs: exports.X_FOLLOW_RATE_LIMIT_WINDOW_MS,
    };
}
function pruneGraphTimestamps(timestamps, windowMs, now = Date.now()) {
    const cutoff = now - windowMs;
    return timestamps.filter((t) => t > cutoff);
}
function buildWindowRateLimitStatus(timestamps, max, windowMs, now = Date.now()) {
    const pruned = pruneGraphTimestamps(timestamps, windowMs, now);
    const count = pruned.length;
    const remaining = Math.max(0, max - count);
    const oldest = pruned.length ? Math.min(...pruned) : now;
    const resetsAt = new Date(oldest + windowMs).toISOString();
    return {
        count,
        limit: max,
        windowMinutes: Math.round(windowMs / 60_000),
        remaining,
        resetsAt,
        limited: remaining <= 0,
    };
}
function buildFollowRateLimitWithDaily(timestamps, now = Date.now()) {
    const windowCfg = getGraphRateLimitConfig('follow');
    const window = buildWindowRateLimitStatus(timestamps, windowCfg.max, windowCfg.windowMs, now);
    const dailyPruned = pruneGraphTimestamps(timestamps, exports.X_FOLLOW_DAILY_LIMIT_WINDOW_MS, now);
    const dailyCount = dailyPruned.length;
    const dailyLimit = exports.X_FOLLOW_DAILY_LIMIT_MAX;
    const dailyRemaining = Math.max(0, dailyLimit - dailyCount);
    const dailyOldest = dailyPruned.length ? Math.min(...dailyPruned) : now;
    const dailyResetsAt = new Date(dailyOldest + exports.X_FOLLOW_DAILY_LIMIT_WINDOW_MS).toISOString();
    const daily = {
        count: dailyCount,
        limit: dailyLimit,
        remaining: dailyRemaining,
        resetsAt: dailyResetsAt,
        limited: dailyRemaining <= 0,
        windowHours: Math.round(exports.X_FOLLOW_DAILY_LIMIT_WINDOW_MS / 3_600_000),
    };
    // Product decision: in Follow automations we enforce only the daily cap.
    // Keep the short-window metrics for observability, but do not limit by them.
    const effectiveRemaining = daily.remaining;
    const limited = daily.limited;
    const limitedBy = limited ? 'daily' : null;
    const resetsAt = daily.resetsAt;
    return {
        count: window.count,
        limit: window.limit,
        windowMinutes: window.windowMinutes,
        remaining: effectiveRemaining,
        resetsAt,
        limited,
        limitedBy,
        daily,
    };
}
function buildXGraphRateLimitStatus(timestamps, action, now = Date.now()) {
    if (action === 'follow') {
        return buildFollowRateLimitWithDaily(timestamps, now);
    }
    const { max: limit, windowMs } = getGraphRateLimitConfig(action);
    const window = buildWindowRateLimitStatus(timestamps, limit, windowMs, now);
    return {
        ...window,
        limitedBy: window.limited ? 'window' : null,
    };
}
function formatFollowRateLimitMessage(status) {
    if (status.daily) {
        return `Daily follow limit reached (${status.daily.count} of ${status.daily.limit} in the last ${status.daily.windowHours} hours). Try again after ${status.daily.resetsAt}.`;
    }
    return `Follow limit reached. Try again after ${status.resetsAt}.`;
}
/** @deprecated Use buildXGraphRateLimitStatus(timestamps, 'follow') */
function pruneFollowTimestamps(timestamps, now = Date.now()) {
    return pruneGraphTimestamps(timestamps, exports.X_FOLLOW_RATE_LIMIT_WINDOW_MS, now);
}
/** @deprecated Use buildXGraphRateLimitStatus(timestamps, 'follow') */
function buildXFollowRateLimitStatus(timestamps, now = Date.now()) {
    return buildXGraphRateLimitStatus(timestamps, 'follow', now);
}
function maxFollowsAllowedNow(timestamps) {
    return buildXGraphRateLimitStatus(timestamps, 'follow').remaining;
}
//# sourceMappingURL=x-follow-rate-limit.js.map