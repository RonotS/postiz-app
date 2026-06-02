"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acquireXPollerTickLock = acquireXPollerTickLock;
const redis_service_1 = require("../../redis/redis.service");
/**
 * Ensures at most one poller tick per integration per interval (Redis SET NX).
 * Prevents duplicate X API usage when Temporal retries activities or backend
 * bootstrap overlaps a still-running forever workflow.
 */
async function acquireXPollerTickLock(kind, integrationId, ttlMs) {
    const ttlSec = Math.max(1, Math.floor(ttlMs / 1000));
    const key = `x:poller:tick:${kind}:${integrationId}`;
    const ok = await redis_service_1.ioRedis.set(key, String(Date.now()), 'EX', ttlSec, 'NX');
    return ok === 'OK';
}
//# sourceMappingURL=x-poller-tick.guard.js.map