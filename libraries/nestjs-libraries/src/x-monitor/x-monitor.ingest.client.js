"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XMonitorIngestClient = void 0;
const common_1 = require("@nestjs/common");
const x_monitor_env_1 = require("../../../helpers/src/x/x.monitor.env");
class XMonitorIngestClient {
    constructor() {
        this.log = new common_1.Logger(XMonitorIngestClient.name);
    }
    async push(event) {
        const secret = (0, x_monitor_env_1.getXMonitorIngestSecret)();
        if (!secret) {
            this.log.warn('X_MONITOR_INGEST_SECRET / X_CUSTOM_INGEST_SECRET not set');
            return false;
        }
        const url = `${(0, x_monitor_env_1.getXMonitorPostizIngestUrl)()}/api/x/activity-ingest`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${secret}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                this.log.warn(`Ingest POST ${res.status}: ${text.slice(0, 200)}`);
                return false;
            }
            return true;
        }
        catch (err) {
            this.log.warn('Ingest POST failed:', err);
            return false;
        }
    }
    async pushBatch(events) {
        if (!events.length) {
            return;
        }
        const secret = (0, x_monitor_env_1.getXMonitorIngestSecret)();
        if (!secret) {
            return;
        }
        const url = `${(0, x_monitor_env_1.getXMonitorPostizIngestUrl)()}/api/x/activity-ingest`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${secret}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ events }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                this.log.warn(`Ingest batch ${res.status}: ${text.slice(0, 200)}`);
            }
        }
        catch (err) {
            this.log.warn('Ingest batch failed:', err);
        }
    }
}
exports.XMonitorIngestClient = XMonitorIngestClient;
//# sourceMappingURL=x-monitor.ingest.client.js.map