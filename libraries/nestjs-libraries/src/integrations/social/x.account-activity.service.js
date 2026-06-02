"use strict";
var XAccountActivityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XAccountActivityService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const twitter_api_v2_1 = require("twitter-api-v2");
const crypto_1 = tslib_1.__importDefault(require("crypto"));
const x_account_activity_env_1 = require("../../../../helpers/src/x/x.account-activity.env");
const redis_service_1 = require("../../redis/redis.service");
const X_API = 'https://api.x.com';
let XAccountActivityService = XAccountActivityService_1 = class XAccountActivityService {
    constructor() {
        this.log = new common_1.Logger(XAccountActivityService_1.name);
    }
    isEnabled() {
        return ((0, x_account_activity_env_1.isXAccountActivityWebhooksEnabled)() &&
            !!process.env.X_API_KEY?.trim() &&
            !!process.env.X_API_SECRET?.trim() &&
            !!(0, x_account_activity_env_1.getXAccountActivityWebhookUrl)());
    }
    consumerSecret() {
        return process.env.X_API_SECRET.trim();
    }
    /** HMAC-SHA256 digest, base64-encoded (X Account Activity / Webhooks format). */
    hmacSha256Base64(message) {
        return crypto_1.default
            .createHmac('sha256', this.consumerSecret())
            .update(message)
            .digest('base64');
    }
    /**
     * CRC challenge for webhook registration (GET ?crc_token=...).
     * @see https://developer.x.com/en/docs/twitter-api/enterprise/account-activity-api/guides/securing-webhooks
     */
    buildCrcResponse(crcToken) {
        const digest = this.hmacSha256Base64(crcToken);
        return { response_token: `sha256=${digest}` };
    }
    /**
     * Validates `x-twitter-webhooks-signature: sha256=<base64>` against raw body.
     */
    verifyWebhookSignature(rawBody, signatureHeader) {
        if (!signatureHeader?.trim()) {
            return false;
        }
        const expected = signatureHeader.trim().replace(/^sha256=/i, '');
        const computed = this.hmacSha256Base64(rawBody);
        try {
            return crypto_1.default.timingSafeEqual(Buffer.from(expected, 'base64'), Buffer.from(computed, 'base64'));
        }
        catch {
            return false;
        }
    }
    buildUserClient(accessToken) {
        const [accessTokenSplit, accessSecretSplit] = accessToken.split(':');
        return new twitter_api_v2_1.TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
            accessToken: accessTokenSplit,
            accessSecret: accessSecretSplit,
        });
    }
    async getAppBearerClient() {
        const app = new twitter_api_v2_1.TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
        });
        return app.appLogin();
    }
    async getStoredWebhookId() {
        return (await redis_service_1.ioRedis.get((0, x_account_activity_env_1.getXAccountActivityRedisWebhookKey)())) || null;
    }
    async storeWebhookId(webhookId) {
        await redis_service_1.ioRedis.set((0, x_account_activity_env_1.getXAccountActivityRedisWebhookKey)(), webhookId);
    }
    normalizeWebhookUrl(url) {
        return url.trim().replace(/\/+$/, '');
    }
    extractWebhookId(entry) {
        const id = entry?.id ?? entry?.webhook_id ?? entry?.data?.id;
        return id != null ? String(id) : undefined;
    }
    /** List webhooks already registered on this X app (GET /2/webhooks). */
    async listRegisteredWebhooks(appClient) {
        try {
            const res = await appClient.v2.get('webhooks');
            const rows = res?.data ?? res?.data?.data ?? [];
            if (!Array.isArray(rows)) {
                return [];
            }
            return rows
                .map((row) => {
                const id = this.extractWebhookId(row);
                if (!id)
                    return null;
                const url = row?.url ??
                    row?.webhook_url ??
                    row?.data?.url ??
                    row?.data?.webhook_url;
                return { id, url: url ? String(url) : undefined };
            })
                .filter(Boolean);
        }
        catch (err) {
            this.log.warn('listRegisteredWebhooks failed:', err?.data || err?.message || err);
            return [];
        }
    }
    /**
     * Resolve webhook id: env → Redis → X API list (portal-created) → POST create.
     */
    async ensureWebhookRegistered() {
        if (!this.isEnabled()) {
            return null;
        }
        const targetUrl = this.normalizeWebhookUrl((0, x_account_activity_env_1.getXAccountActivityWebhookUrl)());
        const fromEnv = (0, x_account_activity_env_1.getXAccountActivityWebhookIdFromEnv)();
        if (fromEnv) {
            await this.storeWebhookId(fromEnv);
            return fromEnv;
        }
        const existing = await this.getStoredWebhookId();
        if (existing) {
            return existing;
        }
        const appClient = await this.getAppBearerClient();
        const listed = await this.listRegisteredWebhooks(appClient);
        const match = listed.find((w) => w.url && this.normalizeWebhookUrl(w.url) === targetUrl);
        if (match?.id) {
            await this.storeWebhookId(match.id);
            this.log.log(`Reusing existing X webhook id=${match.id} (portal or prior registration)`);
            return match.id;
        }
        if (listed.length > 0 && !match) {
            const fallback = listed[0].id;
            await this.storeWebhookId(fallback);
            this.log.warn(`WebhookLimitExceeded likely — reusing first X webhook id=${fallback}. ` +
                `Set X_ACCOUNT_ACTIVITY_WEBHOOK_ID if this is wrong.`);
            return fallback;
        }
        try {
            const res = await appClient.v2.post('webhooks', { url: targetUrl });
            const webhookId = this.extractWebhookId(res?.data ?? res);
            if (!webhookId) {
                this.log.warn('ensureWebhookRegistered: missing webhook id in response');
                return null;
            }
            await this.storeWebhookId(webhookId);
            this.log.log(`Registered X Account Activity webhook id=${webhookId}`);
            return webhookId;
        }
        catch (err) {
            const msg = JSON.stringify(err?.data || err?.message || err);
            if (msg.includes('WebhookLimitExceeded')) {
                const retryList = await this.listRegisteredWebhooks(appClient);
                const retryMatch = retryList.find((w) => w.url && this.normalizeWebhookUrl(w.url) === targetUrl);
                const id = retryMatch?.id ?? retryList[0]?.id;
                if (id) {
                    await this.storeWebhookId(id);
                    this.log.warn(`WebhookLimitExceeded — reusing X webhook id=${id}. ` +
                        `Add X_ACCOUNT_ACTIVITY_WEBHOOK_ID in .env from the X portal if needed.`);
                    return id;
                }
            }
            this.log.error('ensureWebhookRegistered failed:', err?.data || err?.message || err);
            return null;
        }
    }
    /**
     * Subscribe a connected X user to the app webhook (POST .../subscriptions/all).
     */
    async subscribeUser(accessToken, webhookId) {
        try {
            const client = this.buildUserClient(accessToken);
            await client.post(`${X_API}/2/account_activity/webhooks/${webhookId}/subscriptions/all`, {});
            return true;
        }
        catch (err) {
            const msg = JSON.stringify(err?.data || err?.message || err);
            if (msg.includes('DuplicateSubscription')) {
                return true;
            }
            this.log.warn(`subscribeUser failed webhookId=${webhookId}:`, msg);
            return false;
        }
    }
    async unsubscribeUser(accessToken, webhookId, xUserId) {
        try {
            const appClient = await this.getAppBearerClient();
            await appClient.delete(`${X_API}/2/account_activity/webhooks/${webhookId}/subscriptions/${xUserId}/all`);
        }
        catch (err) {
            this.log.warn(`unsubscribeUser failed user=${xUserId}:`, err?.data || err?.message || err);
        }
    }
};
exports.XAccountActivityService = XAccountActivityService;
exports.XAccountActivityService = XAccountActivityService = XAccountActivityService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)()
], XAccountActivityService);
//# sourceMappingURL=x.account-activity.service.js.map