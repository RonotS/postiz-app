"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isXMonitorEnabled = isXMonitorEnabled;
exports.getXMonitorPostizIngestUrl = getXMonitorPostizIngestUrl;
exports.getXMonitorIngestSecret = getXMonitorIngestSecret;
exports.getXMonitorMaxChannels = getXMonitorMaxChannels;
exports.getXMonitorHandlesPerRule = getXMonitorHandlesPerRule;
exports.getXMonitorRuleTagPrefix = getXMonitorRuleTagPrefix;
exports.getXMonitorSyncHandlesMs = getXMonitorSyncHandlesMs;
exports.getXMonitorStreamReconnectMs = getXMonitorStreamReconnectMs;
exports.isXMonitorSyncFromDb = isXMonitorSyncFromDb;
exports.getXMonitorHandlesFromEnv = getXMonitorHandlesFromEnv;
exports.isXMonitorWsEnabled = isXMonitorWsEnabled;
exports.getXMonitorWsPort = getXMonitorWsPort;
exports.getXMonitorWsToken = getXMonitorWsToken;
exports.isXMonitorPushIngestViaHttp = isXMonitorPushIngestViaHttp;
/** Tweetmax X stream detector (push stream + WebSocket → Postiz custom ingest). */
function isXMonitorEnabled() {
    const v = process.env.X_MONITOR_ENABLED?.trim();
    return v === 'true' || v === '1';
}
function getXMonitorPostizIngestUrl() {
    const u = process.env.X_MONITOR_POSTIZ_INGEST_URL?.trim() ||
        process.env.MAIN_URL?.trim() ||
        'http://localhost:3000';
    return u.replace(/\/+$/, '');
}
function getXMonitorIngestSecret() {
    return (process.env.X_MONITOR_INGEST_SECRET?.trim() ||
        process.env.X_CUSTOM_INGEST_SECRET?.trim() ||
        undefined);
}
/** Max @handles on the filtered stream (rule length limits apply). */
function getXMonitorMaxChannels() {
    const n = Number(process.env.X_MONITOR_MAX_CHANNELS);
    if (!Number.isFinite(n) || n < 1) {
        return 50;
    }
    return Math.min(Math.floor(n), 200);
}
/** Handles per stream rule (X rule value max ~512 chars). */
function getXMonitorHandlesPerRule() {
    const n = Number(process.env.X_MONITOR_HANDLES_PER_RULE);
    if (!Number.isFinite(n) || n < 1) {
        return 12;
    }
    return Math.min(Math.floor(n), 20);
}
function getXMonitorRuleTagPrefix() {
    return process.env.X_MONITOR_RULE_TAG_PREFIX?.trim() || 'tweetmax';
}
/** Reload handles + rewrite stream rules (ms). Default 10 min. */
function getXMonitorSyncHandlesMs() {
    const n = Number(process.env.X_MONITOR_SYNC_HANDLES_MS);
    if (!Number.isFinite(n) || n < 60_000) {
        return 600_000;
    }
    return Math.min(n, 3_600_000);
}
function getXMonitorStreamReconnectMs() {
    const n = Number(process.env.X_MONITOR_STREAM_RECONNECT_MS);
    if (!Number.isFinite(n) || n < 1000) {
        return 5_000;
    }
    return Math.min(n, 120_000);
}
/** Load @handles from Postiz DB (integrations). */
function isXMonitorSyncFromDb() {
    const v = process.env.X_MONITOR_SYNC_FROM_DB?.trim();
    if (v === 'false' || v === '0') {
        return false;
    }
    return true;
}
/** Comma-separated handles when X_MONITOR_SYNC_FROM_DB=false. */
function getXMonitorHandlesFromEnv() {
    const raw = process.env.X_MONITOR_HANDLES?.trim();
    if (!raw) {
        return [];
    }
    return raw
        .split(/[,\s]+/)
        .map((h) => h.replace(/^@+/, '').toLowerCase())
        .filter(Boolean);
}
/** Fan-out WebSocket (TweetStream-style delivery to your apps). */
function isXMonitorWsEnabled() {
    const v = process.env.X_MONITOR_WS_ENABLED?.trim();
    return v === 'true' || v === '1';
}
function getXMonitorWsPort() {
    const n = Number(process.env.X_MONITOR_WS_PORT);
    if (!Number.isFinite(n) || n < 1) {
        return 8089;
    }
    return Math.floor(n);
}
function getXMonitorWsToken() {
    return process.env.X_MONITOR_WS_TOKEN?.trim() || undefined;
}
/** Postiz can connect as client instead of monitor pushing HTTP. */
function isXMonitorPushIngestViaHttp() {
    const v = process.env.X_MONITOR_PUSH_INGEST_HTTP?.trim();
    if (v === 'false' || v === '0') {
        return false;
    }
    return true;
}
//# sourceMappingURL=x.monitor.env.js.map