"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isXActivityStreamEnabled = isXActivityStreamEnabled;
exports.getXActivityStreamSecret = getXActivityStreamSecret;
exports.getXActivityStreamRecentMax = getXActivityStreamRecentMax;
/** Expose X engagement events to your site via WebSocket (and HTTP poll). */
function isXActivityStreamEnabled() {
    const v = process.env.X_ACTIVITY_STREAM_ENABLED?.trim();
    return v === 'true' || v === '1';
}
/** Shared secret for WebSocket ?token= and HTTP ?token= (required when enabled). */
function getXActivityStreamSecret() {
    const s = process.env.X_ACTIVITY_STREAM_SECRET?.trim();
    return s || undefined;
}
function getXActivityStreamRecentMax() {
    const n = Number(process.env.X_ACTIVITY_STREAM_RECENT_MAX);
    if (!Number.isFinite(n) || n < 1) {
        return 200;
    }
    return Math.min(Math.floor(n), 2000);
}
//# sourceMappingURL=x.activity-stream.env.js.map