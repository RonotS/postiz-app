"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XCustomIngestWebSocketClient = void 0;
const tslib_1 = require("tslib");
const ws_1 = tslib_1.__importDefault(require("ws"));
const common_1 = require("@nestjs/common");
const x_custom_ingest_env_1 = require("../../../../helpers/src/x/x.custom-ingest.env");
const RECONNECT_MAX_MS = 300_000;
class XCustomIngestWebSocketClient {
    constructor(ingest) {
        this.ingest = ingest;
        this.log = new common_1.Logger(XCustomIngestWebSocketClient.name);
        this.ws = null;
        this.stopped = false;
        this.reconnectDelayMs = (0, x_custom_ingest_env_1.getXCustomWsReconnectMs)();
    }
    start() {
        const url = (0, x_custom_ingest_env_1.getXCustomWsUrl)();
        if (!url) {
            this.log.warn('X_CUSTOM_WS_URL not set — custom WebSocket client not started');
            return;
        }
        this.stopped = false;
        this.connect(url);
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
    connect(url) {
        if (this.stopped) {
            return;
        }
        const token = (0, x_custom_ingest_env_1.getXCustomWsToken)();
        const headers = {};
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        try {
            this.ws = new ws_1.default(url, token ? [`auth.${token}`] : undefined, {
                headers,
            });
        }
        catch (err) {
            this.log.error('Custom ingest WebSocket construct failed:', err);
            this.scheduleReconnect();
            return;
        }
        this.ws.on('open', () => {
            this.reconnectDelayMs = (0, x_custom_ingest_env_1.getXCustomWsReconnectMs)();
            this.log.log(`Connected to custom ingest WebSocket ${url}`);
        });
        this.ws.on('message', (data) => {
            void this.ingest.processRawMessage(data).catch((err) => this.log.error('Custom ingest message failed:', err));
        });
        this.ws.on('close', (code, reason) => {
            this.log.warn(`Custom ingest WebSocket closed code=${code} reason=${reason?.toString() || ''}`);
            this.ws = null;
            this.scheduleReconnect();
        });
        this.ws.on('error', (err) => {
            this.log.error('Custom ingest WebSocket error:', err);
        });
    }
    scheduleReconnect() {
        if (this.stopped || this.reconnectTimer) {
            return;
        }
        const delay = this.reconnectDelayMs;
        this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            const url = (0, x_custom_ingest_env_1.getXCustomWsUrl)();
            if (url) {
                this.connect(url);
            }
        }, delay);
    }
}
exports.XCustomIngestWebSocketClient = XCustomIngestWebSocketClient;
//# sourceMappingURL=x.custom-ingest.ws-client.js.map