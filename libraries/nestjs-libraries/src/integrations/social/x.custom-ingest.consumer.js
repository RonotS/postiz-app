"use strict";
var XCustomIngestConsumer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XCustomIngestConsumer = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const x_custom_ingest_env_1 = require("../../../../helpers/src/x/x.custom-ingest.env");
const tweetstream_env_1 = require("../../../../helpers/src/x/tweetstream.env");
const x_realtime_env_1 = require("../../../../helpers/src/x/x.realtime.env");
const x_custom_ingest_service_1 = require("./x.custom-ingest.service");
const x_custom_ingest_ws_client_1 = require("./x.custom-ingest.ws-client");
let XCustomIngestConsumer = XCustomIngestConsumer_1 = class XCustomIngestConsumer {
    constructor(_ingest) {
        this._ingest = _ingest;
        this.log = new common_1.Logger(XCustomIngestConsumer_1.name);
        this.wsClient = null;
    }
    onModuleInit() {
        if (!(0, x_custom_ingest_env_1.isXCustomIngestEnabled)() || !(0, x_realtime_env_1.isCustomRealtimeIngest)()) {
            return;
        }
        if (!(0, tweetstream_env_1.isPostizBackendWorker)()) {
            this.log.log('Custom ingest: orchestrator worker — WS client runs on backend only.');
            return;
        }
        if (!(0, x_custom_ingest_env_1.isXCustomWsClientEnabled)()) {
            this.log.log('Custom ingest: HTTP POST /api/x/activity-ingest ready (X_CUSTOM_WS_CLIENT_ENABLED=false).');
            return;
        }
        this.wsClient = new x_custom_ingest_ws_client_1.XCustomIngestWebSocketClient(this._ingest);
        this.wsClient.start();
        this.log.log('Custom ingest: WebSocket client started (X_CUSTOM_WS_URL).');
    }
    onModuleDestroy() {
        this.wsClient?.stop();
        this.wsClient = null;
    }
};
exports.XCustomIngestConsumer = XCustomIngestConsumer;
exports.XCustomIngestConsumer = XCustomIngestConsumer = XCustomIngestConsumer_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [x_custom_ingest_service_1.XCustomIngestService])
], XCustomIngestConsumer);
//# sourceMappingURL=x.custom-ingest.consumer.js.map