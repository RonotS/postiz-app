"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedinDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class LinkedinDto {
}
exports.LinkedinDto = LinkedinDto;
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", Boolean)
], LinkedinDto.prototype, "post_as_images_carousel", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], LinkedinDto.prototype, "carousel_name", void 0);
//# sourceMappingURL=linkedin.dto.js.map