"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X_TWEETSTREAM_ENGAGEMENT_POLL_MS = exports.X_DEFAULT_POLL_WITHOUT_AAA_MS = exports.X_DEFAULT_POLL_INTERVAL_MS = void 0;
exports.resolveXPollIntervalMs = resolveXPollIntervalMs;
exports.resolveXEngagementPollIntervalMs = resolveXEngagementPollIntervalMs;
exports.getXPollerDmDelayMs = getXPollerDmDelayMs;
const x_account_activity_env_1 = require("./x.account-activity.env");
const tweetstream_env_1 = require("./tweetstream.env");
/** Default interval between X plug poller ticks when Account Activity webhooks are on. */
exports.X_DEFAULT_POLL_INTERVAL_MS = 300_000;
/** Default poller interval when AAA is unavailable (Basic/Free tier). */
exports.X_DEFAULT_POLL_WITHOUT_AAA_MS = 60_000;
/** Like-DM backup poll when TweetStream is on (likes are not streamed over WS). */
exports.X_TWEETSTREAM_ENGAGEMENT_POLL_MS = 30_000;
const MIN_POLL_MS = 30_000;
const MAX_POLL_MS = 3_600_000;
function pollDefaultMs() {
    if ((0, x_account_activity_env_1.isXAccountActivityWebhooksEnabled)()) {
        return exports.X_DEFAULT_POLL_INTERVAL_MS;
    }
    const override = Number(process.env.X_POLL_DEFAULT_WITHOUT_AAA_MS);
    if (Number.isFinite(override) && override > 0) {
        return Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, override));
    }
    return exports.X_DEFAULT_POLL_WITHOUT_AAA_MS;
}
/**
 * Resolve poller interval from an optional env var.
 * Without AAA webhooks: defaults to 1 minute (override with X_POLL_DEFAULT_WITHOUT_AAA_MS).
 * With AAA: defaults to 5 minutes unless the specific *_POLL_INTERVAL_MS env is set.
 */
function resolveXPollIntervalMs(envVarName) {
    const fromEnv = Number(process.env[envVarName]);
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
        return Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, fromEnv));
    }
    return pollDefaultMs();
}
/**
 * Engagement poller (auto-DM likers, etc.). When TweetStream is enabled and
 * X_ENGAGEMENT_POLL_INTERVAL_MS is unset, defaults to 30s so like-DMs stay
 * within one poll cycle (TweetStream WS does not emit like events).
 */
function resolveXEngagementPollIntervalMs() {
    const fromEnv = Number(process.env.X_ENGAGEMENT_POLL_INTERVAL_MS);
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
        return Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, fromEnv));
    }
    if ((0, tweetstream_env_1.isTweetStreamEnabled)()) {
        return exports.X_TWEETSTREAM_ENGAGEMENT_POLL_MS;
    }
    return pollDefaultMs();
}
/** Delay before poller-driven auto-DMs (ms). Webhook path uses getXWebhookDmDelayMs(). */
function getXPollerDmDelayMs() {
    const raw = process.env.X_POLLER_DM_DELAY_MS?.trim();
    if (raw === '' || raw === undefined) {
        return (0, x_account_activity_env_1.isXAccountActivityWebhooksEnabled)() ? 2000 : 500;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
        return 500;
    }
    return Math.min(n, 60_000);
}
//# sourceMappingURL=x.poll-interval.env.js.map