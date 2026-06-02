"use strict";
var XActivityStreamService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XActivityStreamService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const events_1 = require("events");
const crypto_1 = require("crypto");
const x_activity_stream_env_1 = require("../../../../helpers/src/x/x.activity-stream.env");
const tweetstream_normalize_1 = require("./tweetstream.normalize");
let XActivityStreamService = XActivityStreamService_1 = class XActivityStreamService {
    constructor() {
        this.log = new common_1.Logger(XActivityStreamService_1.name);
        this.emitter = new events_1.EventEmitter();
        this.recent = [];
        this.clients = new Map();
    }
    isEnabled() {
        return (0, x_activity_stream_env_1.isXActivityStreamEnabled)();
    }
    isWsEnabled() {
        return this.isEnabled();
    }
    verifyClientToken(token) {
        const secret = (0, x_activity_stream_env_1.getXActivityStreamSecret)();
        if (!secret) {
            return this.isEnabled();
        }
        return !!token?.trim() && token.trim() === secret;
    }
    registerClient(ws, filter) {
        this.clients.set(ws, filter);
        ws.on('close', () => this.clients.delete(ws));
        ws.on('error', () => this.clients.delete(ws));
    }
    publish(partial) {
        if (!this.isEnabled()) {
            return;
        }
        const event = {
            id: (0, crypto_1.randomUUID)(),
            ts: Date.now(),
            ...partial,
            monitoredHandle: partial.monitoredHandle
                ? (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(partial.monitoredHandle) ||
                    partial.monitoredHandle
                : undefined,
        };
        const max = (0, x_activity_stream_env_1.getXActivityStreamRecentMax)();
        this.recent.unshift(event);
        if (this.recent.length > max) {
            this.recent.length = max;
        }
        this.emitter.emit('activity', event);
        this.broadcastToClients(event);
    }
    listRecent(limit = 50, filter) {
        const n = Math.min(Math.max(limit, 1), (0, x_activity_stream_env_1.getXActivityStreamRecentMax)());
        return this.recent
            .filter((e) => this.matchesFilter(filter, e))
            .slice(0, n);
    }
    getConnectionInfo() {
        const base = process.env.MAIN_URL?.trim() ||
            process.env.BACKEND_URL?.trim() ||
            process.env.FRONTEND_URL?.trim();
        const wsPath = '/api/x/activity-stream';
        const normalizedBase = base?.replace(/\/+$/, '');
        const wsBase = normalizedBase
            ? normalizedBase.replace(/^http/i, 'ws')
            : undefined;
        return {
            enabled: this.isEnabled(),
            wsPath,
            wsUrlExample: wsBase
                ? `${wsBase}${wsPath}?token=YOUR_SECRET&handle=monitored_handle`
                : undefined,
            eventsUrlExample: normalizedBase
                ? `${normalizedBase}${wsPath}/events?token=YOUR_SECRET&limit=50`
                : undefined,
            authRequired: !!(0, x_activity_stream_env_1.getXActivityStreamSecret)(),
            recentMax: (0, x_activity_stream_env_1.getXActivityStreamRecentMax)(),
        };
    }
    broadcastToClients(event) {
        const payload = JSON.stringify({ type: 'activity', event });
        for (const [ws, filter] of this.clients) {
            if (ws.readyState !== 1) {
                this.clients.delete(ws);
                continue;
            }
            if (!this.matchesFilter(filter, event)) {
                continue;
            }
            try {
                ws.send(payload);
            }
            catch (err) {
                this.log.warn('WebSocket send failed:', err);
                this.clients.delete(ws);
            }
        }
    }
    matchesFilter(filter, event) {
        if (!filter) {
            return true;
        }
        if (filter.integrationId &&
            event.integrationId &&
            filter.integrationId !== event.integrationId) {
            return false;
        }
        if (filter.organizationId &&
            event.organizationId &&
            filter.organizationId !== event.organizationId) {
            return false;
        }
        if (filter.handle) {
            const h = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(filter.handle);
            const monitored = event.monitoredHandle
                ? (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(event.monitoredHandle)
                : '';
            if (h && monitored && h !== monitored) {
                return false;
            }
        }
        return true;
    }
};
exports.XActivityStreamService = XActivityStreamService;
exports.XActivityStreamService = XActivityStreamService = XActivityStreamService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)()
], XActivityStreamService);
//# sourceMappingURL=x-activity-stream.service.js.map