"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateOAuthAppDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class UpdateOAuthAppDto {
}
exports.UpdateOAuthAppDto = UpdateOAuthAppDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(100),
    tslib_1.__metadata("design:type", String)
], UpdateOAuthAppDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(500),
    tslib_1.__metadata("design:type", String)
], UpdateOAuthAppDto.prototype, "description", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], UpdateOAuthAppDto.prototype, "pictureId", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], UpdateOAuthAppDto.prototype, "redirectUrl", void 0);
//# sourceMappingURL=update-oauth-app.dto.js.map