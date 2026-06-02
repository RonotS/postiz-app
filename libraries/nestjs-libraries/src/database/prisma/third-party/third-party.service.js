"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThirdPartyService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const third_party_repository_1 = require("./third-party.repository");
let ThirdPartyService = class ThirdPartyService {
    constructor(_thirdPartyRepository) {
        this._thirdPartyRepository = _thirdPartyRepository;
    }
    getAllThirdPartiesByOrganization(org) {
        return this._thirdPartyRepository.getAllThirdPartiesByOrganization(org);
    }
    deleteIntegration(org, id) {
        return this._thirdPartyRepository.deleteIntegration(org, id);
    }
    getIntegrationById(org, id) {
        return this._thirdPartyRepository.getIntegrationById(org, id);
    }
    saveIntegration(org, identifier, apiKey, data) {
        return this._thirdPartyRepository.saveIntegration(org, identifier, apiKey, data);
    }
};
exports.ThirdPartyService = ThirdPartyService;
exports.ThirdPartyService = ThirdPartyService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [third_party_repository_1.ThirdPartyRepository])
], ThirdPartyService);
//# sourceMappingURL=third-party.service.js.map