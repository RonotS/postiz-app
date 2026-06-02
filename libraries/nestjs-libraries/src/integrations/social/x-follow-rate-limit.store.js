"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getXGraphRateLimitForIntegration = getXGraphRateLimitForIntegration;
exports.getXFollowRateLimitForIntegration = getXFollowRateLimitForIntegration;
exports.getXUnfollowRateLimitForIntegration = getXUnfollowRateLimitForIntegration;
exports.recordXGraphActionsForIntegration = recordXGraphActionsForIntegration;
exports.recordXFollowsForIntegration = recordXFollowsForIntegration;
exports.recordXUnfollowsForIntegration = recordXUnfollowsForIntegration;
const tslib_1 = require("tslib");
const fs_1 = require("fs");
const path_1 = tslib_1.__importDefault(require("path"));
const x_follow_rate_limit_1 = require("./x-follow-rate-limit");
function resolveFilePath() {
    const raw = process.env.X_FOLLOW_RATE_LIMIT_FILE?.trim();
    if (raw) {
        return path_1.default.isAbsolute(raw) ? raw : path_1.default.join(process.cwd(), raw);
    }
    return path_1.default.join(process.cwd(), '.data', 'x-follow-rate-limits.json');
}
function storeKey(integrationId, action) {
    return `${integrationId}:${action}`;
}
let cache = null;
async function readStore() {
    if (cache) {
        return cache;
    }
    const file = resolveFilePath();
    try {
        const text = await fs_1.promises.readFile(file, 'utf8');
        cache = JSON.parse(text);
        return cache;
    }
    catch {
        cache = {};
        return cache;
    }
}
async function writeStore(data) {
    const file = resolveFilePath();
    await fs_1.promises.mkdir(path_1.default.dirname(file), { recursive: true });
    await fs_1.promises.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
    cache = data;
}
function readTimestamps(store, integrationId, action) {
    const key = storeKey(integrationId, action);
    if (store[key]?.length) {
        return store[key];
    }
    if (action === 'follow' && store[integrationId]?.length) {
        return store[integrationId];
    }
    return [];
}
async function getXGraphRateLimitForIntegration(integrationId, action) {
    const store = await readStore();
    const timestamps = readTimestamps(store, integrationId, action);
    return (0, x_follow_rate_limit_1.buildXGraphRateLimitStatus)(timestamps, action);
}
/** @deprecated Use getXGraphRateLimitForIntegration(id, 'follow') */
async function getXFollowRateLimitForIntegration(integrationId) {
    return getXGraphRateLimitForIntegration(integrationId, 'follow');
}
async function getXUnfollowRateLimitForIntegration(integrationId) {
    return getXGraphRateLimitForIntegration(integrationId, 'unfollow');
}
async function recordXGraphActionsForIntegration(integrationId, action, actionCount) {
    if (actionCount <= 0) {
        return getXGraphRateLimitForIntegration(integrationId, action);
    }
    const { windowMs } = (0, x_follow_rate_limit_1.getGraphRateLimitConfig)(action);
    const pruneMs = action === 'follow'
        ? Math.max(windowMs, x_follow_rate_limit_1.X_FOLLOW_DAILY_LIMIT_WINDOW_MS)
        : windowMs;
    const store = await readStore();
    const now = Date.now();
    const key = storeKey(integrationId, action);
    const existing = (0, x_follow_rate_limit_1.pruneGraphTimestamps)(readTimestamps(store, integrationId, action), pruneMs, now);
    const added = Array.from({ length: actionCount }, () => now);
    store[key] = [...existing, ...added];
    if (store[integrationId]) {
        delete store[integrationId];
    }
    await writeStore(store);
    return (0, x_follow_rate_limit_1.buildXGraphRateLimitStatus)(store[key], action, now);
}
/** @deprecated Use recordXGraphActionsForIntegration(id, 'follow', count) */
async function recordXFollowsForIntegration(integrationId, followCount) {
    return recordXGraphActionsForIntegration(integrationId, 'follow', followCount);
}
async function recordXUnfollowsForIntegration(integrationId, unfollowCount) {
    return recordXGraphActionsForIntegration(integrationId, 'unfollow', unfollowCount);
}
//# sourceMappingURL=x-follow-rate-limit.store.js.map