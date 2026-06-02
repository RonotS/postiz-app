"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignatureDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class SignatureDto {
}
exports.SignatureDto = SignatureDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], SignatureDto.prototype, "content", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Boolean)
], SignatureDto.prototype, "autoAdd", void 0);
//# sourceMappingURL=signature.dto.js.map