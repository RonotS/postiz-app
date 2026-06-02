"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserDetailDto = void 0;
const tslib_1 = require("tslib");
const media_dto_1 = require("../media/media.dto");
const class_validator_1 = require("class-validator");
class UserDetailDto {
}
exports.UserDetailDto = UserDetailDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    tslib_1.__metadata("design:type", String)
], UserDetailDto.prototype, "fullname", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], UserDetailDto.prototype, "bio", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    tslib_1.__metadata("design:type", media_dto_1.MediaDto)
], UserDetailDto.prototype, "picture", void 0);
//# sourceMappingURL=user.details.dto.js.map