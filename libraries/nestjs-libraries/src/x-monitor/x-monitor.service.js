"use strict";
var XMonitorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XMonitorService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const x_monitor_env_1 = require("../../../helpers/src/x/x.monitor.env");
const x_monitor_registry_1 = require("./x-monitor.registry");
const x_monitor_stream_1 = require("./x-monitor.stream");
const x_monitor_ws_1 = require("./x-monitor.ws");
let XMonitorService = XMonitorService_1 = class XMonitorService {
    constructor(registry, stream, ws) {
        this.registry = registry;
        this.stream = stream;
        this.ws = ws;
        this.log = new common_1.Logger(XMonitorService_1.name);
        this.streamStarted = false;
    }
    async onModuleInit() {
        if (!(0, x_monitor_env_1.isXMonitorEnabled)()) {
            return;
        }
        if ((0, x_monitor_env_1.isXMonitorWsEnabled)()) {
            this.ws.start();
        }
        await this.refreshAndStart();
        const ms = (0, x_monitor_env_1.getXMonitorSyncHandlesMs)();
        this.syncTimer = setInterval(() => {
            void this.refreshAndStart().catch((err) => this.log.error('Handle sync failed:', err));
        }, ms);
    }
    onModuleDestroy() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }
        this.stream.stop();
        this.ws.stop();
    }
    async refreshAndStart() {
        const handles = await this.registry.refresh();
        await this.stream.syncRules(handles);
        if (!this.streamStarted) {
            this.streamStarted = true;
            this.stream.startStreamLoop();
        }
    }
};
exports.XMonitorService = XMonitorService;
exports.XMonitorService = XMonitorService = XMonitorService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [x_monitor_registry_1.XMonitorRegistry,
        x_monitor_stream_1.XMonitorStreamService,
        x_monitor_ws_1.XMonitorWebSocketHub])
], XMonitorService);
//# sourceMappingURL=x-monitor.service.js.map