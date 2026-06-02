"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FacebookDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class FacebookDto {
}
exports.FacebookDto = FacebookDto;
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)(p => p.url),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], FacebookDto.prototype, "url", void 0);
//# sourceMappingURL=facebook.dto.js.map