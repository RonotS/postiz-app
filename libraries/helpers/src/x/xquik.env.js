"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isXquikEnabled = isXquikEnabled;
exports.getXquikApiBase = getXquikApiBase;
exports.getXquikApiKey = getXquikApiKey;
exports.getXquikWebhookSecret = getXquikWebhookSecret;
exports.getXquikWebhookUrl = getXquikWebhookUrl;
exports.isXquikWebhookAutoRegisterEnabled = isXquikWebhookAutoRegisterEnabled;
exports.getXquikWebhookEventTypes = getXquikWebhookEventTypes;
exports.getXquikLikesPollIntervalMs = getXquikLikesPollIntervalMs;
exports.getXquikFollowersPollIntervalMs = getXquikFollowersPollIntervalMs;
exports.getXquikEngagementPollIntervalMs = getXquikEngagementPollIntervalMs;
exports.isXquikEngagementPollerEnabled = isXquikEngagementPollerEnabled;
exports.shouldDisableTweetStreamForXquik = shouldDisableTweetStreamForXquik;
exports.getXquikEngagementMaxPostsPerTick = getXquikEngagementMaxPostsPerTick;
exports.getXquikDmBatchMaxPerTick = getXquikDmBatchMaxPerTick;
function isXquikEnabled() {
    const v = process.env.XQUIK_ENABLED?.trim();
    return v === 'true' || v === '1';
}
function getXquikApiBase() {
    return (process.env.XQUIK_API_BASE?.trim() || 'https://xquik.com/api/v1').replace(/\/+$/, '');
}
function getXquikApiKey() {
    const key = process.env.XQUIK_API_KEY?.trim();
    return key || undefined;
}
function getXquikWebhookSecret() {
    const secret = process.env.XQUIK_WEBHOOK_SECRET?.trim();
    return secret || undefined;
}
/** Public HTTPS URL Xquik should POST to (include /api/x/xquik/webhook). */
function getXquikWebhookUrl() {
    const explicit = process.env.XQUIK_WEBHOOK_URL?.trim();
    if (explicit) {
        return explicit.replace(/\/+$/, '');
    }
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
    if (backend?.startsWith('https://')) {
        return `${backend.replace(/\/+$/, '')}/x/xquik/webhook`;
    }
    return undefined;
}
function isXquikWebhookAutoRegisterEnabled() {
    if (!isXquikEnabled() || !getXquikApiKey()) {
        return false;
    }
    const v = process.env.XQUIK_WEBHOOK_AUTO_REGISTER?.trim();
    if (v === 'false' || v === '0') {
        return false;
    }
    return !!getXquikWebhookUrl();
}
function getXquikWebhookEventTypes() {
    const raw = process.env.XQUIK_WEBHOOK_EVENT_TYPES?.trim();
    if (raw) {
        return raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }
    return [
        'tweet.new',
        'tweet.reply',
        'tweet.retweet',
        'tweet.quote',
        'tweet.mention',
        'tweet.like',
        'tweet.favorite',
    ];
}
function getXquikLikesPollIntervalMs() {
    const n = Number(process.env.XQUIK_LIKES_POLL_INTERVAL_MS);
    if (!Number.isFinite(n) || n < 10_000) {
        return 20_000;
    }
    return Math.min(Math.floor(n), 300_000);
}
function getXquikFollowersPollIntervalMs() {
    const n = Number(process.env.XQUIK_FOLLOWERS_POLL_INTERVAL_MS);
    if (!Number.isFinite(n) || n < 10_000) {
        return 20_000;
    }
    return Math.min(Math.floor(n), 300_000);
}
/** Default 20s — polls recent posts for likers/repliers/retweeters via Xquik API. */
function getXquikEngagementPollIntervalMs() {
    const n = Number(process.env.XQUIK_ENGAGEMENT_POLL_INTERVAL_MS);
    if (!Number.isFinite(n) || n < 10_000) {
        return 20_000;
    }
    return Math.min(Math.floor(n), 300_000);
}
/**
 * When true, backend runs Xquik engagement poll loop (even if X_DISABLE_ENGAGEMENT_POLLING).
 */
function isXquikEngagementPollerEnabled() {
    if (!isXquikEnabled() || !getXquikApiKey()) {
        return false;
    }
    const v = process.env.XQUIK_ENGAGEMENT_POLLING?.trim();
    if (v === 'false' || v === '0') {
        return false;
    }
    return true;
}
/** Prefer Xquik over TweetStream WebSocket when both could be enabled. */
function shouldDisableTweetStreamForXquik() {
    if (!isXquikEnabled()) {
        return false;
    }
    const v = process.env.XQUIK_DISABLE_TWEETSTREAM?.trim();
    if (v === 'false' || v === '0') {
        return false;
    }
    return true;
}
/** Posts scanned per Xquik engagement tick (prioritize posts with replies). */
function getXquikEngagementMaxPostsPerTick() {
    const n = Number(process.env.XQUIK_ENGAGEMENT_MAX_POSTS_PER_TICK);
    if (Number.isFinite(n) && n > 0) {
        return Math.min(Math.floor(n), 20);
    }
    return 8;
}
/** DM attempts per poller tick when Xquik mode is on (avoid backlog starving new posts). */
function getXquikDmBatchMaxPerTick() {
    const n = Number(process.env.XQUIK_PLUG_DM_BATCH_MAX_PER_TICK);
    if (Number.isFinite(n) && n > 0) {
        return Math.min(Math.floor(n), 15);
    }
    return 5;
}
//# sourceMappingURL=xquik.env.js.map