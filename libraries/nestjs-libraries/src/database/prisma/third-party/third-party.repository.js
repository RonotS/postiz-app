"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThirdPartyRepository = void 0;
const tslib_1 = require("tslib");
const prisma_service_1 = require("../prisma.service");
const common_1 = require("@nestjs/common");
const auth_service_1 = require("../../../../../helpers/src/auth/auth.service");
let ThirdPartyRepository = class ThirdPartyRepository {
    constructor(_thirdParty) {
        this._thirdParty = _thirdParty;
    }
    getAllThirdPartiesByOrganization(org) {
        return this._thirdParty.model.thirdParty.findMany({
            where: { organizationId: org, deletedAt: null },
            select: {
                id: true,
                name: true,
                identifier: true,
            },
        });
    }
    deleteIntegration(org, id) {
        return this._thirdParty.model.thirdParty.update({
            where: { id, organizationId: org },
            data: { deletedAt: new Date() },
        });
    }
    getIntegrationById(org, id) {
        return this._thirdParty.model.thirdParty.findFirst({
            where: { id, organizationId: org, deletedAt: null },
        });
    }
    saveIntegration(org, identifier, apiKey, data) {
        return this._thirdParty.model.thirdParty.upsert({
            where: {
                organizationId_internalId: {
                    internalId: data.id,
                    organizationId: org,
                },
            },
            create: {
                organizationId: org,
                name: data.name,
                internalId: data.id,
                identifier,
                apiKey: auth_service_1.AuthService.fixedEncryption(apiKey),
                deletedAt: null,
            },
            update: {
                organizationId: org,
                name: data.name,
                internalId: data.id,
                identifier,
                apiKey: auth_service_1.AuthService.fixedEncryption(apiKey),
                deletedAt: null,
            },
        });
    }
};
exports.ThirdPartyRepository = ThirdPartyRepository;
exports.ThirdPartyRepository = ThirdPartyRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [prisma_service_1.PrismaRepository])
], ThirdPartyRepository);
//# sourceMappingURL=third-party.repository.js.map