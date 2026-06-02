"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isXAccountActivityWebhooksEnabled = isXAccountActivityWebhooksEnabled;
exports.isXAccountActivityPollingDisabled = isXAccountActivityPollingDisabled;
exports.isXEngagementPollingDisabled = isXEngagementPollingDisabled;
exports.getXAccountActivityWebhookUrl = getXAccountActivityWebhookUrl;
exports.getXAccountActivityWebhookIdFromEnv = getXAccountActivityWebhookIdFromEnv;
exports.getXAccountActivityRedisWebhookKey = getXAccountActivityRedisWebhookKey;
exports.getXAccountActivityRedisSubscribedKey = getXAccountActivityRedisSubscribedKey;
exports.getXWebhookDmDelayMs = getXWebhookDmDelayMs;
/** Master switch: receive X Account Activity via webhooks instead of polling only. */
function isXAccountActivityWebhooksEnabled() {
    const v = process.env.X_ACCOUNT_ACTIVITY_WEBHOOKS_ENABLED?.trim();
    return v === 'true' || v === '1';
}
/** When webhooks are on, skip Temporal pollers for webhook-covered plugs (must be explicit). */
function isXAccountActivityPollingDisabled() {
    if (!isXAccountActivityWebhooksEnabled()) {
        return false;
    }
    const v = process.env.X_ACCOUNT_ACTIVITY_DISABLE_POLLING?.trim();
    return v === 'true' || v === '1';
}
/**
 * Skip engagement/profile Temporal pollers (likes still need another path, e.g. TweetStream + liker poll).
 * Works without AAA when X_DISABLE_ENGAGEMENT_POLLING=true.
 */
function isXEngagementPollingDisabled() {
    if (isXAccountActivityPollingDisabled()) {
        return true;
    }
    const v = process.env.X_DISABLE_ENGAGEMENT_POLLING?.trim();
    return v === 'true' || v === '1';
}
function getXAccountActivityWebhookUrl() {
    const url = process.env.X_ACCOUNT_ACTIVITY_WEBHOOK_URL?.trim();
    return url || undefined;
}
/** Webhook id from X Developer Portal (when you created the webhook manually). */
function getXAccountActivityWebhookIdFromEnv() {
    const id = process.env.X_ACCOUNT_ACTIVITY_WEBHOOK_ID?.trim();
    return id || undefined;
}
function getXAccountActivityRedisWebhookKey() {
    return 'x:aaa:webhook_id';
}
function getXAccountActivityRedisSubscribedKey(integrationId) {
    return `x:aaa:subscribed:${integrationId}`;
}
/**
 * Delay before sending a DM from Account Activity webhooks (ms).
 * Default 0 for near-real-time; poller-driven DMs use a longer default in XProvider.
 */
function getXWebhookDmDelayMs() {
    const raw = process.env.X_WEBHOOK_DM_DELAY_MS?.trim();
    if (raw === '' || raw === undefined) {
        return 0;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
        return 0;
    }
    return Math.min(n, 60_000);
}
//# sourceMappingURL=x.account-activity.env.js.map