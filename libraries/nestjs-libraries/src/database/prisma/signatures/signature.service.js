"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignatureService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const signature_repository_1 = require("./signature.repository");
let SignatureService = class SignatureService {
    constructor(_signatureRepository) {
        this._signatureRepository = _signatureRepository;
    }
    getSignaturesByOrgId(orgId) {
        return this._signatureRepository.getSignaturesByOrgId(orgId);
    }
    getDefaultSignature(orgId) {
        return this._signatureRepository.getDefaultSignature(orgId);
    }
    createOrUpdateSignature(orgId, signature, id) {
        return this._signatureRepository.createOrUpdateSignature(orgId, signature, id);
    }
    deleteSignature(orgId, id) {
        return this._signatureRepository.deleteSignature(orgId, id);
    }
};
exports.SignatureService = SignatureService;
exports.SignatureService = SignatureService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [signature_repository_1.SignatureRepository])
], SignatureService);
//# sourceMappingURL=signature.service.js.map