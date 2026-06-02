"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getXRealtimeIngestMode = getXRealtimeIngestMode;
exports.isCustomRealtimeIngest = isCustomRealtimeIngest;
exports.shouldSyncXAccountActivitySubscriptions = shouldSyncXAccountActivitySubscriptions;
exports.isTweetStreamRealtimeStack = isTweetStreamRealtimeStack;
exports.shouldSkipXEngagerPlugPolling = shouldSkipXEngagerPlugPolling;
const x_account_activity_env_1 = require("./x.account-activity.env");
const x_custom_ingest_env_1 = require("./x.custom-ingest.env");
const x_monitor_env_1 = require("./x.monitor.env");
const tweetstream_env_1 = require("./tweetstream.env");
/**
 * Explicit: X_REALTIME_INGEST=webhooks|tweetstream|custom|poll
 * Auto: custom ingest → TweetStream → AAA webhooks → poll.
 */
function getXRealtimeIngestMode() {
    const raw = process.env.X_REALTIME_INGEST?.trim().toLowerCase();
    if (raw === 'webhooks' ||
        raw === 'tweetstream' ||
        raw === 'custom' ||
        raw === 'poll') {
        return raw;
    }
    if ((0, x_monitor_env_1.isXMonitorEnabled)() || (0, x_custom_ingest_env_1.isXCustomIngestEnabled)()) {
        return 'custom';
    }
    if ((0, tweetstream_env_1.isTweetStreamEnabled)()) {
        return 'tweetstream';
    }
    if ((0, x_account_activity_env_1.isXAccountActivityWebhooksEnabled)()) {
        return 'webhooks';
    }
    return 'poll';
}
function isCustomRealtimeIngest() {
    return getXRealtimeIngestMode() === 'custom';
}
/** Register X Account Activity per-user subscriptions (X "unique subscriptions" cap). */
function shouldSyncXAccountActivitySubscriptions() {
    if (!(0, x_account_activity_env_1.isXAccountActivityWebhooksEnabled)()) {
        return false;
    }
    const mode = getXRealtimeIngestMode();
    return mode === 'webhooks';
}
/** TweetStream WS ingest + optional Postiz → your site activity stream. */
function isTweetStreamRealtimeStack() {
    return getXRealtimeIngestMode() === 'tweetstream';
}
/** Post-bound autoDmEngagers polling duplicates custom ingest / TweetStream realtime DMs. */
function shouldSkipXEngagerPlugPolling() {
    return isCustomRealtimeIngest();
}
//# sourceMappingURL=x.realtime.env.js.map