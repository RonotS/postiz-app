"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TweetStreamWebSocketClient = void 0;
const tslib_1 = require("tslib");
const ws_1 = tslib_1.__importDefault(require("ws"));
const common_1 = require("@nestjs/common");
const tweetstream_env_1 = require("../../../../helpers/src/x/tweetstream.env");
const redis_service_1 = require("../../redis/redis.service");
const RECONNECT_MS = 5_000;
const RECONNECT_MAX_MS = 300_000;
const RATE_LIMIT_COOLDOWN_MS = 180_000;
class TweetStreamWebSocketClient {
    constructor(onMessage, apiKey = (0, tweetstream_env_1.getTweetStreamApiKey)() ?? '', callbacks) {
        this.onMessage = onMessage;
        this.apiKey = apiKey;
        this.callbacks = callbacks;
        this.log = new common_1.Logger(TweetStreamWebSocketClient.name);
        this.ws = null;
        this.stopped = false;
        this.reconnectDelayMs = RECONNECT_MS;
        this.rateLimitedUntil = 0;
    }
    async start() {
        if (!this.apiKey) {
            this.log.warn('TweetStream WebSocket not started: missing TWEETSTREAM_API_KEY');
            return;
        }
        const cooldownUntil = await redis_service_1.ioRedis.get((0, tweetstream_env_1.getTweetStreamWsCooldownRedisKey)());
        if (cooldownUntil && Number(cooldownUntil) > Date.now()) {
            const waitSec = Math.ceil((Number(cooldownUntil) - Date.now()) / 1000);
            this.log.warn(`TweetStream WS cooldown active (~${waitSec}s left). Not connecting yet.`);
            this.scheduleReconnect();
            return;
        }
        this.stopped = false;
        this.connect();
    }
    stop() {
        this.stopped = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (this.ws) {
            try {
                this.ws.close();
            }
            catch {
                /* ignore */
            }
            this.ws = null;
        }
    }
    connect() {
        if (this.stopped) {
            return;
        }
        const url = (0, tweetstream_env_1.getTweetStreamWsUrl)();
        const protocols = [
            'tweetstream.v1',
            `tweetstream.auth.token.${this.apiKey}`,
        ];
        try {
            this.ws = new ws_1.default(url, protocols);
        }
        catch (err) {
            this.log.error('TweetStream WebSocket construct failed:', err);
            this.scheduleReconnect();
            return;
        }
        this.ws.on('open', () => {
            this.reconnectDelayMs = RECONNECT_MS;
            this.rateLimitedUntil = 0;
            this.log.log('Connected to TweetStream WebSocket');
            this.callbacks?.onOpen?.();
        });
        this.ws.on('message', (data) => {
            void this.handleRawMessage(data).catch((err) => this.log.error('TweetStream message handler failed:', err));
        });
        this.ws.on('close', (code, reason) => {
            this.log.warn(`TweetStream WebSocket closed code=${code} reason=${reason?.toString() || ''}`);
            this.ws = null;
            this.callbacks?.onClose?.();
            this.scheduleReconnect();
        });
        this.ws.on('error', (err) => {
            const msg = String(err?.message ?? err);
            if (msg.includes('429')) {
                const until = Date.now() + RATE_LIMIT_COOLDOWN_MS;
                this.rateLimitedUntil = until;
                void redis_service_1.ioRedis.set((0, tweetstream_env_1.getTweetStreamWsCooldownRedisKey)(), String(until), 'EX', Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000));
                this.reconnectDelayMs = Math.min(Math.max(this.reconnectDelayMs * 2, 90_000), RECONNECT_MAX_MS);
                this.log.warn(`TweetStream WebSocket rate limited (429). Trial allows 1 connection — ` +
                    `stop other backends/CLI listen, wait ~3 min. Next retry in ${Math.round(this.reconnectDelayMs / 1000)}s.`);
            }
            else {
                this.log.error('TweetStream WebSocket error:', err);
            }
            try {
                this.ws?.close();
            }
            catch {
                /* ignore */
            }
        });
    }
    scheduleReconnect() {
        if (this.stopped || this.reconnectTimer) {
            return;
        }
        const now = Date.now();
        const delay = Math.max(this.reconnectDelayMs, this.rateLimitedUntil > now ? this.rateLimitedUntil - now : 0);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect();
        }, delay);
    }
    async handleRawMessage(data) {
        const text = typeof data === 'string'
            ? data
            : Buffer.isBuffer(data)
                ? data.toString('utf8')
                : Array.isArray(data)
                    ? Buffer.concat(data).toString('utf8')
                    : String(data ?? '');
        let envelope;
        try {
            envelope = JSON.parse(text);
        }
        catch {
            return;
        }
        if (envelope.t === 'control') {
            return;
        }
        await this.onMessage(envelope);
    }
}
exports.TweetStreamWebSocketClient = TweetStreamWebSocketClient;
//# sourceMappingURL=tweetstream.client.js.map