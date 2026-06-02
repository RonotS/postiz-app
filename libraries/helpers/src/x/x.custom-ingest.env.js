"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isXCustomIngestEnabled = isXCustomIngestEnabled;
exports.getXCustomIngestSecret = getXCustomIngestSecret;
exports.isXCustomIngestAutoDmEnabled = isXCustomIngestAutoDmEnabled;
exports.isXCustomWsClientEnabled = isXCustomWsClientEnabled;
exports.getXCustomWsUrl = getXCustomWsUrl;
exports.getXCustomWsToken = getXCustomWsToken;
exports.getXCustomWsReconnectMs = getXCustomWsReconnectMs;
/** Your stack ingests X events (HTTP and/or your WebSocket URL) — not TweetStream or X AAA. */
function isXCustomIngestEnabled() {
    const v = process.env.X_CUSTOM_INGEST_ENABLED?.trim();
    return v === 'true' || v === '1';
}
function getXCustomIngestSecret() {
    const s = process.env.X_CUSTOM_INGEST_SECRET?.trim();
    return s || undefined;
}
/** When false, ingest only fans out to X_ACTIVITY_STREAM (no auto-DM from ingest). */
function isXCustomIngestAutoDmEnabled() {
    const v = process.env.X_CUSTOM_INGEST_AUTO_DM?.trim();
    if (v === 'false' || v === '0') {
        return false;
    }
    return true;
}
/** Postiz connects as a WebSocket client to your server (optional). */
function isXCustomWsClientEnabled() {
    const v = process.env.X_CUSTOM_WS_CLIENT_ENABLED?.trim();
    return v === 'true' || v === '1';
}
function getXCustomWsUrl() {
    const u = process.env.X_CUSTOM_WS_URL?.trim();
    return u || undefined;
}
function getXCustomWsToken() {
    const t = process.env.X_CUSTOM_WS_TOKEN?.trim();
    return t || undefined;
}
function getXCustomWsReconnectMs() {
    const n = Number(process.env.X_CUSTOM_WS_RECONNECT_MS);
    if (!Number.isFinite(n) || n < 1000) {
        return 5_000;
    }
    return Math.min(n, 300_000);
}
//# sourceMappingURL=x.custom-ingest.env.js.map