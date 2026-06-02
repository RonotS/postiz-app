"use strict";
var XCustomIngestService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XCustomIngestService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const x_custom_ingest_env_1 = require("../../../../helpers/src/x/x.custom-ingest.env");
const x_account_activity_handler_1 = require("./x.account-activity.handler");
const x_custom_ingest_mapper_1 = require("./x.custom-ingest.mapper");
let XCustomIngestService = XCustomIngestService_1 = class XCustomIngestService {
    constructor(_handler) {
        this._handler = _handler;
        this.log = new common_1.Logger(XCustomIngestService_1.name);
    }
    isEnabled() {
        return (0, x_custom_ingest_env_1.isXCustomIngestEnabled)();
    }
    async processBody(body) {
        const events = (0, x_custom_ingest_mapper_1.normalizeCustomIngestBody)(body);
        return this.processEvents(events);
    }
    async processRawMessage(raw) {
        let parsed;
        try {
            parsed = JSON.parse(raw.toString('utf8'));
        }
        catch {
            return {
                accepted: 0,
                processed: 0,
                skipped: 0,
                errors: ['Invalid JSON'],
            };
        }
        return this.processBody(parsed);
    }
    async processEvents(events) {
        const result = {
            accepted: events.length,
            processed: 0,
            skipped: 0,
            errors: [],
        };
        if (!this.isEnabled()) {
            result.errors.push('X_CUSTOM_INGEST_ENABLED is not true');
            return result;
        }
        const runDm = (0, x_custom_ingest_env_1.isXCustomIngestAutoDmEnabled)();
        for (const event of events) {
            const mapped = (0, x_custom_ingest_mapper_1.mapCustomIngestEventToPayload)(event);
            if (!mapped) {
                result.skipped += 1;
                result.errors.push(`Invalid event for @${event.handle ?? '?'} kind=${event.kind ?? '?'}`);
                continue;
            }
            try {
                if (runDm) {
                    await this._handler.handleMonitoredHandlePayload(mapped.handle, mapped.payload, 'custom');
                }
                else {
                    await this._handler.emitMonitoredHandleActivityOnly(mapped.handle, mapped.payload, 'custom');
                }
                result.processed += 1;
            }
            catch (err) {
                result.skipped += 1;
                result.errors.push(`@${mapped.handle}: ${err?.message || String(err)}`);
                this.log.warn(`Custom ingest failed @${mapped.handle}:`, err);
            }
        }
        return result;
    }
};
exports.XCustomIngestService = XCustomIngestService;
exports.XCustomIngestService = XCustomIngestService = XCustomIngestService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [x_account_activity_handler_1.XAccountActivityHandler])
], XCustomIngestService);
//# sourceMappingURL=x.custom-ingest.service.js.map