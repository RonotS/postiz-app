"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhooksService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const webhooks_repository_1 = require("./webhooks.repository");
let WebhooksService = class WebhooksService {
    constructor(_webhooksRepository) {
        this._webhooksRepository = _webhooksRepository;
    }
    getTotal(orgId) {
        return this._webhooksRepository.getTotal(orgId);
    }
    getWebhooks(orgId) {
        return this._webhooksRepository.getWebhooks(orgId);
    }
    createWebhook(orgId, body) {
        return this._webhooksRepository.createWebhook(orgId, body);
    }
    deleteWebhook(orgId, id) {
        return this._webhooksRepository.deleteWebhook(orgId, id);
    }
};
exports.WebhooksService = WebhooksService;
exports.WebhooksService = WebhooksService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [webhooks_repository_1.WebhooksRepository])
], WebhooksService);
//# sourceMappingURL=webhooks.service.js.map