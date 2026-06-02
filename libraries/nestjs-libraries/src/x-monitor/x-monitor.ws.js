"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XMonitorWebSocketHub = void 0;
const common_1 = require("@nestjs/common");
const ws_1 = require("ws");
const x_monitor_env_1 = require("../../../helpers/src/x/x.monitor.env");
class XMonitorWebSocketHub {
    constructor() {
        this.log = new common_1.Logger(XMonitorWebSocketHub.name);
        this.wss = null;
        this.clients = new Set();
    }
    start(httpServer) {
        if (!(0, x_monitor_env_1.isXMonitorWsEnabled)()) {
            return;
        }
        const port = (0, x_monitor_env_1.getXMonitorWsPort)();
        this.wss = httpServer
            ? new ws_1.WebSocketServer({ server: httpServer, path: '/ws' })
            : new ws_1.WebSocketServer({ port, path: '/ws' });
        this.wss.on('connection', (ws, req) => {
            if (!this.verify(req)) {
                ws.close(4401, 'Unauthorized');
                return;
            }
            this.clients.add(ws);
            ws.on('close', () => this.clients.delete(ws));
            ws.on('error', () => this.clients.delete(ws));
            ws.send(JSON.stringify({
                type: 'connected',
                ts: Date.now(),
                service: 'x-monitor',
            }));
        });
        this.log.log(`X Monitor WebSocket on ${httpServer ? 'HTTP server /ws' : `port ${port}/ws`}`);
    }
    broadcast(event) {
        if (!this.clients.size) {
            return;
        }
        const payload = JSON.stringify({ type: 'activity', event, ts: Date.now() });
        for (const ws of this.clients) {
            if (ws.readyState === 1) {
                try {
                    ws.send(payload);
                }
                catch {
                    this.clients.delete(ws);
                }
            }
        }
    }
    stop() {
        for (const ws of this.clients) {
            try {
                ws.close();
            }
            catch {
                /* ignore */
            }
        }
        this.clients.clear();
        this.wss?.close();
        this.wss = null;
    }
    verify(req) {
        const token = (0, x_monitor_env_1.getXMonitorWsToken)();
        if (!token) {
            return true;
        }
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const q = url.searchParams.get('token')?.trim();
        const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
        return q === token || auth === token;
    }
}
exports.XMonitorWebSocketHub = XMonitorWebSocketHub;
//# sourceMappingURL=x-monitor.ws.js.map