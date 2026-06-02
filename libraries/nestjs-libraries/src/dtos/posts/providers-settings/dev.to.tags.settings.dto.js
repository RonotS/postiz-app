"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevToTagsSettingsDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class DevToTagsSettingsDto {
}
exports.DevToTagsSettingsDto = DevToTagsSettingsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsNumber)(),
    tslib_1.__metadata("design:type", Number)
], DevToTagsSettingsDto.prototype, "value", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], DevToTagsSettingsDto.prototype, "label", void 0);
//# sourceMappingURL=dev.to.tags.settings.dto.js.map