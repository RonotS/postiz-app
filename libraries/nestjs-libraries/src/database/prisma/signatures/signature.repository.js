"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignatureRepository = void 0;
const tslib_1 = require("tslib");
const prisma_service_1 = require("../prisma.service");
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
let SignatureRepository = class SignatureRepository {
    constructor(_signatures) {
        this._signatures = _signatures;
    }
    getSignaturesByOrgId(orgId) {
        return this._signatures.model.signatures.findMany({
            where: { organizationId: orgId, deletedAt: null },
        });
    }
    getDefaultSignature(orgId) {
        return this._signatures.model.signatures.findFirst({
            where: { organizationId: orgId, autoAdd: true, deletedAt: null },
        });
    }
    async createOrUpdateSignature(orgId, signature, id) {
        const values = {
            organizationId: orgId,
            content: signature.content,
            autoAdd: signature.autoAdd,
        };
        const { id: updatedId } = await this._signatures.model.signatures.upsert({
            where: { id: id || (0, uuid_1.v4)(), organizationId: orgId },
            update: values,
            create: values,
        });
        if (values.autoAdd) {
            await this._signatures.model.signatures.updateMany({
                where: { organizationId: orgId, id: { not: updatedId } },
                data: { autoAdd: false },
            });
        }
        return { id: updatedId };
    }
    deleteSignature(orgId, id) {
        return this._signatures.model.signatures.update({
            where: { id, organizationId: orgId },
            data: { deletedAt: new Date() },
        });
    }
};
exports.SignatureRepository = SignatureRepository;
exports.SignatureRepository = SignatureRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [prisma_service_1.PrismaRepository])
], SignatureRepository);
//# sourceMappingURL=signature.repository.js.map