"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPostizBackendWorker = isPostizBackendWorker;
exports.isTweetStreamEnabled = isTweetStreamEnabled;
exports.getTweetStreamApiKey = getTweetStreamApiKey;
exports.getTweetStreamWsUrl = getTweetStreamWsUrl;
exports.getTweetStreamApiBase = getTweetStreamApiBase;
exports.isTweetStreamPollLikesWhenWsActive = isTweetStreamPollLikesWhenWsActive;
exports.isTweetStreamPollRepliesWhenWsActive = isTweetStreamPollRepliesWhenWsActive;
exports.isTweetStreamFollowerPollingDisabled = isTweetStreamFollowerPollingDisabled;
exports.isTweetStreamTrackAllX = isTweetStreamTrackAllX;
exports.isTweetStreamPublishEvents = isTweetStreamPublishEvents;
exports.getTweetStreamRecentEventsRedisKey = getTweetStreamRecentEventsRedisKey;
exports.getTweetStreamRecentEventsMax = getTweetStreamRecentEventsMax;
exports.isTweetStreamWebSocketDisabled = isTweetStreamWebSocketDisabled;
exports.getTweetStreamWsStartDelayMs = getTweetStreamWsStartDelayMs;
exports.getTweetStreamWsLeaderRedisKey = getTweetStreamWsLeaderRedisKey;
exports.getTweetStreamWsConsumerActiveRedisKey = getTweetStreamWsConsumerActiveRedisKey;
exports.getTweetStreamWsCooldownRedisKey = getTweetStreamWsCooldownRedisKey;
/** Set by apps/backend vs apps/orchestrator package.json scripts. */
function isPostizBackendWorker() {
    const worker = process.env.POSTIZ_WORKER?.trim();
    if (worker === 'backend') {
        return true;
    }
    if (worker === 'orchestrator') {
        return false;
    }
    const argv = process.argv.join(' ').toLowerCase();
    return (argv.includes('apps/backend') ||
        argv.includes('postiz-backend') ||
        argv.includes('apps\\backend'));
}
/** Master switch: connect to TweetStream WebSocket for realtime X events. */
function isTweetStreamEnabled() {
    const v = process.env.TWEETSTREAM_ENABLED?.trim();
    return v === 'true' || v === '1';
}
function getTweetStreamApiKey() {
    const key = process.env.TWEETSTREAM_API_KEY?.trim();
    return key || undefined;
}
function getTweetStreamWsUrl() {
    return (process.env.TWEETSTREAM_WS_URL?.trim() || 'wss://ws.tweetstream.io/ws');
}
function getTweetStreamApiBase() {
    return (process.env.TWEETSTREAM_API_BASE?.trim() ||
        'https://api.tweetstream.io').replace(/\/+$/, '');
}
/**
 * When TweetStream WS is up, reply/RT DMs use the socket. Likes still need REST unless this is true.
 * Default false — avoids fetchLikers 429 spam while testing comment/repost realtime DMs.
 */
function isTweetStreamPollLikesWhenWsActive() {
    const v = process.env.TWEETSTREAM_POLL_LIKES_WHEN_WS?.trim();
    return v === 'true' || v === '1';
}
/**
 * When TweetStream WS is up, still poll reply engagers as backup (one read/post/tick).
 * Default true — socket often omits ref.tweetId until update; some replies never map.
 * Set TWEETSTREAM_POLL_REPLIES_WHEN_WS=false to rely on WebSocket only.
 */
function isTweetStreamPollRepliesWhenWsActive() {
    const v = process.env.TWEETSTREAM_POLL_REPLIES_WHEN_WS?.trim();
    if (v === 'false' || v === '0') {
        return false;
    }
    return true;
}
/** When true, skip the follower-DM Temporal poller (TweetStream sends follow events). */
function isTweetStreamFollowerPollingDisabled() {
    if (!isTweetStreamEnabled()) {
        return false;
    }
    const v = process.env.TWEETSTREAM_DISABLE_FOLLOWER_POLLING?.trim();
    return v === 'true' || v === '1';
}
/** Track every active X channel, not only those with automation plugs. */
function isTweetStreamTrackAllX() {
    const v = process.env.TWEETSTREAM_TRACK_ALL_X?.trim();
    return v === 'true' || v === '1';
}
/** Store recent TweetStream events in Redis for dashboard/API (optional). */
function isTweetStreamPublishEvents() {
    const v = process.env.TWEETSTREAM_PUBLISH_EVENTS?.trim();
    return v === 'true' || v === '1';
}
function getTweetStreamRecentEventsRedisKey() {
    return 'x:tweetstream:recent-events';
}
function getTweetStreamRecentEventsMax() {
    const n = Number(process.env.TWEETSTREAM_RECENT_EVENTS_MAX);
    if (!Number.isFinite(n) || n < 1) {
        return 200;
    }
    return Math.min(Math.floor(n), 2000);
}
/** Skip WebSocket (REST sync only). Use while debugging 429 / connection limits. */
function isTweetStreamWebSocketDisabled() {
    const v = process.env.TWEETSTREAM_DISABLE_WEBSOCKET?.trim();
    return v === 'true' || v === '1';
}
/** Delay before first WS connect after backend start (lets stale connections expire). */
function getTweetStreamWsStartDelayMs() {
    const n = Number(process.env.TWEETSTREAM_WS_START_DELAY_MS);
    if (!Number.isFinite(n) || n < 0) {
        return 45_000;
    }
    return Math.min(Math.floor(n), 600_000);
}
function getTweetStreamWsLeaderRedisKey() {
    return 'x:tweetstream:ws:leader';
}
/** Set while the backend TweetStream WebSocket is connected (refreshed periodically). */
function getTweetStreamWsConsumerActiveRedisKey() {
    return 'x:tweetstream:ws:consumer:active';
}
function getTweetStreamWsCooldownRedisKey() {
    return 'x:tweetstream:ws:cooldown';
}
//# sourceMappingURL=tweetstream.env.js.map