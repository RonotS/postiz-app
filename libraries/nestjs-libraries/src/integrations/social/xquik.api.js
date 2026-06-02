"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XquikApiClient = void 0;
const xquik_env_1 = require("../../../../helpers/src/x/xquik.env");
const tweetstream_normalize_1 = require("./tweetstream.normalize");
/** Include tweet.mention for inbound replies/@mentions on the monitored account. */
const DEFAULT_MONITOR_EVENTS = [
    'tweet.new',
    'tweet.reply',
    'tweet.retweet',
    'tweet.quote',
    'tweet.mention',
    'tweet.like',
    'tweet.favorite',
    // Follow/unfollow are not Xquik monitor webhook types — use GET /x/users/:id/followers poll instead.
];
class XquikApiClient {
    constructor() {
        this.base = (0, xquik_env_1.getXquikApiBase)();
        this.key = (0, xquik_env_1.getXquikApiKey)();
    }
    headers(json = false) {
        const h = { 'x-api-key': this.key };
        if (json) {
            h['Content-Type'] = 'application/json';
        }
        return h;
    }
    async request(method, path, body) {
        if (!this.key) {
            throw new Error('XQUIK_API_KEY is not set');
        }
        const res = await fetch(`${this.base}${path}`, {
            method,
            headers: this.headers(!!body),
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const text = await res.text();
        let parsed = {};
        if (text) {
            try {
                parsed = JSON.parse(text);
            }
            catch {
                parsed = { raw: text };
            }
        }
        if (!res.ok) {
            const err = {
                code: res.status,
                data: parsed,
                message: parsed?.message || parsed?.error || text,
            };
            throw err;
        }
        return parsed;
    }
    async listMonitors() {
        const body = await this.request('GET', '/monitors');
        return body.monitors ?? [];
    }
    normalizeWebhookUrl(url) {
        return url.trim().replace(/\/+$/, '').toLowerCase();
    }
    async listWebhooks() {
        const body = await this.request('GET', '/webhooks');
        return body.webhooks ?? body.data ?? [];
    }
    async createWebhook(url, eventTypes = [...DEFAULT_MONITOR_EVENTS]) {
        return this.request('POST', '/webhooks', {
            url,
            eventTypes,
        });
    }
    /**
     * Find or create the webhook endpoint. `secret` is only returned on create —
     * store it in XQUIK_WEBHOOK_SECRET immediately.
     */
    async ensureWebhook(targetUrl) {
        const normalizedTarget = this.normalizeWebhookUrl(targetUrl);
        const existing = (await this.listWebhooks()).find((w) => w.url &&
            this.normalizeWebhookUrl(w.url) === normalizedTarget &&
            w.isActive !== false);
        if (existing?.id) {
            return { webhook: existing, created: false };
        }
        const created = await this.createWebhook(targetUrl, (0, xquik_env_1.getXquikWebhookEventTypes)());
        return { webhook: created, created: true };
    }
    async testWebhook(webhookId) {
        return this.request('POST', `/webhooks/${webhookId}/test`);
    }
    async ensureAccountMonitor(username) {
        const handle = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(username);
        if (!handle) {
            return null;
        }
        const existing = (await this.listMonitors()).find((m) => (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(m.username ?? '') === handle &&
            m.isActive !== false);
        if (existing?.id) {
            const required = [...DEFAULT_MONITOR_EVENTS];
            const current = existing.eventTypes ?? [];
            const missing = required.filter((e) => !current.includes(e));
            if (missing.length) {
                try {
                    const updated = await this.request('PATCH', `/monitors/${existing.id}`, { eventTypes: [...new Set([...current, ...required])] });
                    return updated;
                }
                catch {
                    console.warn(`Xquik monitor @${handle}: could not add events ${missing.join(',')} — update monitor in Xquik dashboard`);
                }
            }
            return existing;
        }
        try {
            return await this.request('POST', '/monitors', {
                username: handle,
                eventTypes: [...DEFAULT_MONITOR_EVENTS],
            });
        }
        catch (err) {
            if (err?.code === 409 || err?.data?.error === 'monitor_already_exists') {
                const again = (await this.listMonitors()).find((m) => (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(m.username ?? '') === handle);
                return again ?? null;
            }
            throw err;
        }
    }
}
exports.XquikApiClient = XquikApiClient;
//# sourceMappingURL=xquik.api.js.map