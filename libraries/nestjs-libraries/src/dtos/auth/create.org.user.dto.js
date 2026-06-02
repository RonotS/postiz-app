"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOrgUserDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateOrgUserDto {
}
exports.CreateOrgUserDto = CreateOrgUserDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(64),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateIf)((o) => !o.providerToken),
    tslib_1.__metadata("design:type", String)
], CreateOrgUserDto.prototype, "password", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], CreateOrgUserDto.prototype, "provider", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateIf)((o) => !o.password),
    tslib_1.__metadata("design:type", String)
], CreateOrgUserDto.prototype, "providerToken", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateIf)((o) => !o.providerToken),
    tslib_1.__metadata("design:type", String)
], CreateOrgUserDto.prototype, "email", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    tslib_1.__metadata("design:type", String)
], CreateOrgUserDto.prototype, "company", void 0);
//# sourceMappingURL=create.org.user.dto.js.map