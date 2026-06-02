"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XMonitorModule = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const database_module_1 = require("../database/prisma/database.module");
const x_monitor_service_1 = require("./x-monitor.service");
const x_monitor_registry_1 = require("./x-monitor.registry");
const x_monitor_stream_1 = require("./x-monitor.stream");
const x_monitor_ingest_client_1 = require("./x-monitor.ingest.client");
const x_monitor_ws_1 = require("./x-monitor.ws");
let XMonitorModule = class XMonitorModule {
};
exports.XMonitorModule = XMonitorModule;
exports.XMonitorModule = XMonitorModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule],
        providers: [
            x_monitor_registry_1.XMonitorRegistry,
            x_monitor_ingest_client_1.XMonitorIngestClient,
            x_monitor_ws_1.XMonitorWebSocketHub,
            x_monitor_stream_1.XMonitorStreamService,
            x_monitor_service_1.XMonitorService,
        ],
    })
], XMonitorModule);
//# sourceMappingURL=x-monitor.module.js.map