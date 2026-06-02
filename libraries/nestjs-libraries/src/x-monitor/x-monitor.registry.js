"use strict";
var XMonitorRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XMonitorRegistry = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const integration_repository_1 = require("../database/prisma/integrations/integration.repository");
const x_monitor_env_1 = require("../../../helpers/src/x/x.monitor.env");
const tweetstream_normalize_1 = require("../integrations/social/tweetstream.normalize");
let XMonitorRegistry = XMonitorRegistry_1 = class XMonitorRegistry {
    constructor(_integrations) {
        this._integrations = _integrations;
        this.log = new common_1.Logger(XMonitorRegistry_1.name);
        this.handles = [];
        this.handleSet = new Set();
        this.tagToHandles = new Map();
    }
    getHandles() {
        return this.handles;
    }
    hasHandle(handle) {
        return this.handleSet.has((0, tweetstream_normalize_1.normalizeTweetStreamHandle)(handle));
    }
    resolveHandle(candidates) {
        for (const c of candidates) {
            const h = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(c);
            if (h && this.handleSet.has(h)) {
                return h;
            }
        }
        return undefined;
    }
    setRuleTagHandles(rules) {
        this.tagToHandles.clear();
        for (const r of rules) {
            this.tagToHandles.set(r.tag, r.handles);
        }
    }
    /** First handle in the stream rule batch that matched this tweet. */
    resolveHandleFromTag(tag) {
        if (!tag) {
            return undefined;
        }
        const batch = this.tagToHandles.get(tag);
        return batch?.[0];
    }
    async refresh() {
        const rows = (0, x_monitor_env_1.isXMonitorSyncFromDb)()
            ? await this._integrations.listXIntegrationsForMonitor((0, x_monitor_env_1.getXMonitorMaxChannels)())
            : (0, x_monitor_env_1.getXMonitorHandlesFromEnv)().map((profile) => ({
                id: profile,
                profile,
            }));
        const byHandle = new Map();
        for (const row of rows) {
            const h = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(row.profile ?? '');
            if (!h)
                continue;
            if (!byHandle.has(h)) {
                byHandle.set(h, new Set());
            }
            byHandle.get(h).add(String(row.id));
        }
        this.handles = [...byHandle.entries()].map(([handle, ids]) => ({
            handle,
            integrationIds: [...ids],
        }));
        this.handleSet = new Set(this.handles.map((h) => h.handle));
        this.log.log(`Monitor registry: ${this.handles.length} handle(s) — ${this.handles
            .map((h) => `@${h.handle}`)
            .join(', ')
            .slice(0, 200)}${this.handles.length > 8 ? '…' : ''}`);
        return this.handles.map((h) => h.handle);
    }
};
exports.XMonitorRegistry = XMonitorRegistry;
exports.XMonitorRegistry = XMonitorRegistry = XMonitorRegistry_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [integration_repository_1.IntegrationRepository])
], XMonitorRegistry);
//# sourceMappingURL=x-monitor.registry.js.map