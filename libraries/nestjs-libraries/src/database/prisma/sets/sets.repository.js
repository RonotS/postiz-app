"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetsRepository = void 0;
const tslib_1 = require("tslib");
const prisma_service_1 = require("../prisma.service");
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
let SetsRepository = class SetsRepository {
    constructor(_sets) {
        this._sets = _sets;
    }
    getTotal(orgId) {
        return this._sets.model.sets.count({
            where: {
                organizationId: orgId,
            },
        });
    }
    getSets(orgId) {
        return this._sets.model.sets.findMany({
            where: {
                organizationId: orgId,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    deleteSet(orgId, id) {
        return this._sets.model.sets.delete({
            where: {
                id,
                organizationId: orgId,
            },
        });
    }
    async createSet(orgId, body) {
        const { id } = await this._sets.model.sets.upsert({
            where: {
                id: body.id || (0, uuid_1.v4)(),
                organizationId: orgId,
            },
            create: {
                id: body.id || (0, uuid_1.v4)(),
                organizationId: orgId,
                name: body.name,
                content: body.content,
            },
            update: {
                name: body.name,
                content: body.content,
            },
        });
        return { id };
    }
};
exports.SetsRepository = SetsRepository;
exports.SetsRepository = SetsRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [prisma_service_1.PrismaRepository])
], SetsRepository);
//# sourceMappingURL=sets.repository.js.map