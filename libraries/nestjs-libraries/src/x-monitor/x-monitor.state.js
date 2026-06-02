"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mentionSinceKey = mentionSinceKey;
exports.followersBaselineKey = followersBaselineKey;
exports.dedupKey = dedupKey;
exports.markEngagementOnce = markEngagementOnce;
exports.getMentionSinceId = getMentionSinceId;
exports.setMentionSinceId = setMentionSinceId;
exports.loadFollowerBaseline = loadFollowerBaseline;
exports.saveFollowerBaseline = saveFollowerBaseline;
const redis_service_1 = require("../redis/redis.service");
const PREFIX = 'x:monitor:v1';
function mentionSinceKey(integrationId) {
    return `${PREFIX}:mention_since:${integrationId}`;
}
function followersBaselineKey(integrationId) {
    return `${PREFIX}:followers_baseline:${integrationId}`;
}
function dedupKey(integrationId, kind, userId, tweetId) {
    return `${PREFIX}:dedup:${integrationId}:${kind}:${userId}:${tweetId ?? '_'}`;
}
/** Returns true if first time seeing this engagement (should ingest). */
async function markEngagementOnce(integrationId, kind, userId, tweetId, ttlSec = 60 * 60 * 24 * 7) {
    const key = dedupKey(integrationId, kind, userId, tweetId);
    const ok = await redis_service_1.ioRedis.set(key, '1', 'EX', ttlSec, 'NX');
    return ok === 'OK';
}
async function getMentionSinceId(integrationId) {
    const v = await redis_service_1.ioRedis.get(mentionSinceKey(integrationId));
    return v?.trim() || undefined;
}
async function setMentionSinceId(integrationId, tweetId) {
    await redis_service_1.ioRedis.set(mentionSinceKey(integrationId), tweetId);
}
async function loadFollowerBaseline(integrationId) {
    const raw = await redis_service_1.ioRedis.get(followersBaselineKey(integrationId));
    if (!raw) {
        return null;
    }
    try {
        const arr = JSON.parse(raw);
        return new Set(arr.map(String));
    }
    catch {
        return null;
    }
}
async function saveFollowerBaseline(integrationId, ids) {
    const trimmed = ids.slice(0, 5000);
    await redis_service_1.ioRedis.set(followersBaselineKey(integrationId), JSON.stringify(trimmed), 'EX', 60 * 60 * 24 * 30);
}
//# sourceMappingURL=x-monitor.state.js.map