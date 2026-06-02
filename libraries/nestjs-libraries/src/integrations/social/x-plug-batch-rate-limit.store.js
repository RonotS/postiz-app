"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLimitedUntilMs = getLimitedUntilMs;
exports.setLimitedUntilMs = setLimitedUntilMs;
exports.clearLimitedUntil = clearLimitedUntil;
exports.syncPlugDmCooldown = syncPlugDmCooldown;
exports.isXPlugApiReadPaused = isXPlugApiReadPaused;
exports.isXPlugDmWindowFull = isXPlugDmWindowFull;
exports.recordDmSent = recordDmSent;
exports.addQueuedEstimate = addQueuedEstimate;
exports.decayQueuedEstimate = decayQueuedEstimate;
exports.createDmBatchGate = createDmBatchGate;
exports.buildXPlugBatchRateLimitStatus = buildXPlugBatchRateLimitStatus;
exports.rateLimitResetMsFromError = rateLimitResetMsFromError;
exports.isXApiRateLimitError = isXApiRateLimitError;
exports.markPlugBatchLimitedFromError = markPlugBatchLimitedFromError;
const redis_service_1 = require("../../redis/redis.service");
const x_plug_batch_rate_limit_1 = require("./x-plug-batch-rate-limit");
const x_poll_interval_env_1 = require("../../../../helpers/src/x/x.poll-interval.env");
const DM_TS_KEY = (integrationId) => `x:plug:dm:ts:${integrationId}`;
const LIMITED_UNTIL_KEY = (integrationId) => `x:plug:limited:${integrationId}`;
const QUEUED_ESTIMATE_KEY = (integrationId) => `x:plug:queued:${integrationId}`;
function pruneTimestamps(timestamps, now = Date.now()) {
    const cutoff = now - x_plug_batch_rate_limit_1.X_PLUG_DM_WINDOW_MS;
    return timestamps.filter((t) => t >= cutoff);
}
async function readDmTimestamps(integrationId) {
    const raw = await redis_service_1.ioRedis.get(DM_TS_KEY(integrationId));
    if (!raw)
        return [];
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    }
    catch {
        return [];
    }
}
async function writeDmTimestamps(integrationId, timestamps) {
    await redis_service_1.ioRedis.set(DM_TS_KEY(integrationId), JSON.stringify(timestamps));
}
async function getLimitedUntilMs(integrationId) {
    const raw = await redis_service_1.ioRedis.get(LIMITED_UNTIL_KEY(integrationId));
    if (!raw)
        return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}
async function setLimitedUntilMs(integrationId, untilMs, _reason) {
    const existing = await getLimitedUntilMs(integrationId);
    const next = existing != null ? Math.max(existing, untilMs) : untilMs;
    await redis_service_1.ioRedis.set(LIMITED_UNTIL_KEY(integrationId), String(next));
}
async function clearLimitedUntil(integrationId) {
    await redis_service_1.ioRedis.del(LIMITED_UNTIL_KEY(integrationId));
}
/** Clears expired API cooldown keys so 0/15 DM window is not blocked by a stale timer. */
async function syncPlugDmCooldown(integrationId) {
    const now = Date.now();
    const limitedUntilMs = await getLimitedUntilMs(integrationId);
    if (limitedUntilMs != null && now >= limitedUntilMs) {
        await clearLimitedUntil(integrationId);
    }
}
/** True while X API read/write cooldown is active (typically after HTTP 429). */
async function isXPlugApiReadPaused(integrationId) {
    await syncPlugDmCooldown(integrationId);
    const untilMs = await getLimitedUntilMs(integrationId);
    if (untilMs != null && Date.now() < untilMs) {
        return { paused: true, until: new Date(untilMs).toISOString() };
    }
    return { paused: false, until: null };
}
/** True when the 15-minute DM cap is exhausted (not poller batch timer). */
async function isXPlugDmWindowFull(integrationId) {
    await syncPlugDmCooldown(integrationId);
    const now = Date.now();
    const pruned = pruneTimestamps(await readDmTimestamps(integrationId), now);
    return pruned.length >= x_plug_batch_rate_limit_1.X_PLUG_DM_WINDOW_MAX;
}
async function recordDmSent(integrationId) {
    const now = Date.now();
    const pruned = pruneTimestamps(await readDmTimestamps(integrationId), now);
    pruned.push(now);
    await writeDmTimestamps(integrationId, pruned);
}
async function addQueuedEstimate(integrationId, delta) {
    if (delta <= 0)
        return;
    const key = QUEUED_ESTIMATE_KEY(integrationId);
    const raw = await redis_service_1.ioRedis.get(key);
    const prev = Number(raw) || 0;
    await redis_service_1.ioRedis.set(key, String(prev + delta));
}
async function decayQueuedEstimate(integrationId, processed) {
    if (processed <= 0)
        return;
    const key = QUEUED_ESTIMATE_KEY(integrationId);
    const raw = await redis_service_1.ioRedis.get(key);
    const prev = Number(raw) || 0;
    await redis_service_1.ioRedis.set(key, String(Math.max(0, prev - processed)));
}
function createDmBatchGate(integrationId, batchMaxPerTick = x_plug_batch_rate_limit_1.X_PLUG_DM_BATCH_MAX_PER_TICK) {
    let sentThisTick = 0;
    return {
        tryReserveDm: async () => {
            const now = Date.now();
            await syncPlugDmCooldown(integrationId);
            const limitedUntil = await getLimitedUntilMs(integrationId);
            if (limitedUntil != null && now < limitedUntil) {
                return false;
            }
            if (sentThisTick >= batchMaxPerTick) {
                return false;
            }
            const pruned = pruneTimestamps(await readDmTimestamps(integrationId), now);
            if (pruned.length >= x_plug_batch_rate_limit_1.X_PLUG_DM_WINDOW_MAX) {
                const oldest = Math.min(...pruned);
                await setLimitedUntilMs(integrationId, oldest + x_plug_batch_rate_limit_1.X_PLUG_DM_WINDOW_MS, 'dm_window');
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
async function buildXPlugBatchRateLimitStatus(integrationId, options) {
    const now = Date.now();
    await syncPlugDmCooldown(integrationId);
    const pruned = pruneTimestamps(await readDmTimestamps(integrationId), now);
    const count = pruned.length;
    const remaining = Math.max(0, x_plug_batch_rate_limit_1.X_PLUG_DM_WINDOW_MAX - count);
    const oldest = pruned.length ? Math.min(...pruned) : now;
    const resetsAt = new Date(oldest + x_plug_batch_rate_limit_1.X_PLUG_DM_WINDOW_MS).toISOString();
    const limitedUntilMs = await getLimitedUntilMs(integrationId);
    const limitedByApi = limitedUntilMs != null && now < limitedUntilMs;
    const limitedByDm = !limitedByApi && remaining <= 0;
    const limited = limitedByApi || limitedByDm;
    let limitedUntil = null;
    let limitedBy = null;
    if (limitedByApi && limitedUntilMs) {
        limitedUntil = new Date(limitedUntilMs).toISOString();
        limitedBy = 'api_429';
    }
    else if (limitedByDm) {
        limitedUntil = resetsAt;
        limitedBy = 'dm_window';
    }
    const queuedRaw = await redis_service_1.ioRedis.get(QUEUED_ESTIMATE_KEY(integrationId));
    const queuedEstimate = options?.queuedEstimate ??
        (Number(queuedRaw) > 0 ? Number(queuedRaw) : 0);
    return {
        limited,
        limitedUntil,
        limitedBy,
        pollIntervalMs: (0, x_poll_interval_env_1.resolveXEngagementPollIntervalMs)(),
        dmWindow: {
            count,
            limit: x_plug_batch_rate_limit_1.X_PLUG_DM_WINDOW_MAX,
            remaining,
            resetsAt,
        },
        batchMaxPerTick: x_plug_batch_rate_limit_1.X_PLUG_DM_BATCH_MAX_PER_TICK,
        engagementMaxPostsPerTick: Number(process.env.X_ENGAGEMENT_MAX_POSTS_PER_TICK) > 0
            ? Number(process.env.X_ENGAGEMENT_MAX_POSTS_PER_TICK)
            : 5,
        queuedEstimate,
    };
}
/** Parse X 429 reset from twitter-api-v2 style errors when present. */
function rateLimitResetMsFromError(err) {
    const anyErr = err;
    if (anyErr?.rateLimit?.reset) {
        return anyErr.rateLimit.reset * 1000;
    }
    const resetHeader = anyErr?.headers?.['x-rate-limit-reset'] ??
        anyErr?.headers?.['X-Rate-Limit-Reset'];
    if (resetHeader) {
        const sec = Number(resetHeader);
        if (Number.isFinite(sec) && sec > 0) {
            return sec * 1000;
        }
    }
    return null;
}
/** True only for X HTTP 429 (rate limit). Other errors must not pause the integration. */
function isXApiRateLimitError(err) {
    const anyErr = err;
    return anyErr?.code === 429 || anyErr?.data?.status === 429;
}
async function markPlugBatchLimitedFromError(integrationId, err) {
    if (!isXApiRateLimitError(err)) {
        return;
    }
    const resetMs = rateLimitResetMsFromError(err);
    const until = resetMs ?? Date.now() + x_plug_batch_rate_limit_1.X_PLUG_DM_WINDOW_MS;
    await setLimitedUntilMs(integrationId, until, 'api_429');
}
//# sourceMappingURL=x-plug-batch-rate-limit.store.js.map