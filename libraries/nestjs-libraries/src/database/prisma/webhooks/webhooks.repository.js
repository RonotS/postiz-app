"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhooksRepository = void 0;
const tslib_1 = require("tslib");
const prisma_service_1 = require("../prisma.service");
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
let WebhooksRepository = class WebhooksRepository {
    constructor(_webhooks) {
        this._webhooks = _webhooks;
    }
    getTotal(orgId) {
        return this._webhooks.model.webhooks.count({
            where: {
                organizationId: orgId,
                deletedAt: null,
            },
        });
    }
    getWebhooks(orgId) {
        return this._webhooks.model.webhooks.findMany({
            where: {
                organizationId: orgId,
                deletedAt: null,
            },
            include: {
                integrations: {
                    select: {
                        integration: {
                            select: {
                                id: true,
                                picture: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });
    }
    deleteWebhook(orgId, id) {
        return this._webhooks.model.webhooks.update({
            where: {
                id,
                organizationId: orgId,
            },
            data: {
                deletedAt: new Date(),
            },
        });
    }
    async createWebhook(orgId, body) {
        const { id } = await this._webhooks.model.webhooks.upsert({
            where: {
                id: body.id || (0, uuid_1.v4)(),
                organizationId: orgId,
            },
            create: {
                organizationId: orgId,
                url: body.url,
                name: body.name,
            },
            update: {
                url: body.url,
                name: body.name,
            },
        });
        await this._webhooks.model.webhooks.update({
            where: {
                id,
                organizationId: orgId,
            },
            data: {
                integrations: {
                    deleteMany: {},
                    create: body.integrations.map((integration) => ({
                        integrationId: integration.id,
                    })),
                },
            },
        });
        return { id };
    }
};
exports.WebhooksRepository = WebhooksRepository;
exports.WebhooksRepository = WebhooksRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [prisma_service_1.PrismaRepository])
], WebhooksRepository);
//# sourceMappingURL=webhooks.repository.js.map