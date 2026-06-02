"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetsService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const sets_repository_1 = require("./sets.repository");
let SetsService = class SetsService {
    constructor(_setsRepository) {
        this._setsRepository = _setsRepository;
    }
    getTotal(orgId) {
        return this._setsRepository.getTotal(orgId);
    }
    getSets(orgId) {
        return this._setsRepository.getSets(orgId);
    }
    createSet(orgId, body) {
        return this._setsRepository.createSet(orgId, body);
    }
    deleteSet(orgId, id) {
        return this._setsRepository.deleteSet(orgId, id);
    }
};
exports.SetsService = SetsService;
exports.SetsService = SetsService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [sets_repository_1.SetsRepository])
], SetsService);
//# sourceMappingURL=sets.service.js.map