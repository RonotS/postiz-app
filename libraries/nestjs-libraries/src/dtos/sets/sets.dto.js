"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateSetsDto = exports.SetsDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class SetsDto {
}
exports.SetsDto = SetsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], SetsDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], SetsDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], SetsDto.prototype, "content", void 0);
class UpdateSetsDto {
}
exports.UpdateSetsDto = UpdateSetsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], UpdateSetsDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], UpdateSetsDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], UpdateSetsDto.prototype, "content", void 0);
//# sourceMappingURL=sets.dto.js.map