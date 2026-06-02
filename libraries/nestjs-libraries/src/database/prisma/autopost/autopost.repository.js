"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutopostRepository = void 0;
const tslib_1 = require("tslib");
const prisma_service_1 = require("../prisma.service");
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
let AutopostRepository = class AutopostRepository {
    constructor(_autoPost) {
        this._autoPost = _autoPost;
    }
    getTotal(orgId) {
        return this._autoPost.model.autoPost.count({
            where: {
                organizationId: orgId,
                deletedAt: null,
            },
        });
    }
    getAutoposts(orgId) {
        return this._autoPost.model.autoPost.findMany({
            where: {
                organizationId: orgId,
                deletedAt: null,
            },
        });
    }
    deleteAutopost(orgId, id) {
        return this._autoPost.model.autoPost.update({
            where: {
                id,
                organizationId: orgId,
            },
            data: {
                deletedAt: new Date(),
            },
        });
    }
    getAutopost(id) {
        return this._autoPost.model.autoPost.findUnique({
            where: {
                id,
                deletedAt: null,
            },
        });
    }
    updateUrl(id, url) {
        return this._autoPost.model.autoPost.update({
            where: {
                id,
            },
            data: {
                lastUrl: url,
            },
        });
    }
    changeActive(orgId, id, active) {
        return this._autoPost.model.autoPost.update({
            where: {
                id,
                organizationId: orgId,
            },
            data: {
                active,
            },
        });
    }
    async createAutopost(orgId, body, id) {
        const { id: newId, active } = await this._autoPost.model.autoPost.upsert({
            where: {
                id: id || (0, uuid_1.v4)(),
                organizationId: orgId,
            },
            create: {
                organizationId: orgId,
                url: body.url,
                title: body.title,
                integrations: JSON.stringify(body.integrations),
                active: body.active,
                content: body.content,
                generateContent: body.generateContent,
                addPicture: body.addPicture,
                syncLast: body.syncLast,
                onSlot: body.onSlot,
                lastUrl: body.lastUrl,
            },
            update: {
                url: body.url,
                title: body.title,
                integrations: JSON.stringify(body.integrations),
                active: body.active,
                content: body.content,
                generateContent: body.generateContent,
                addPicture: body.addPicture,
                syncLast: body.syncLast,
                onSlot: body.onSlot,
                lastUrl: body.lastUrl,
            },
        });
        return { id: newId, active };
    }
};
exports.AutopostRepository = AutopostRepository;
exports.AutopostRepository = AutopostRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [prisma_service_1.PrismaRepository])
], AutopostRepository);
//# sourceMappingURL=autopost.repository.js.map