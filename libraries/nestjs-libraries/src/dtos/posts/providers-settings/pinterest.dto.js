"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PinterestSettingsDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_validator_jsonschema_1 = require("class-validator-jsonschema");
class PinterestSettingsDto {
}
exports.PinterestSettingsDto = PinterestSettingsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.ValidateIf)((o) => !!o.title),
    (0, class_validator_1.MaxLength)(100),
    tslib_1.__metadata("design:type", String)
], PinterestSettingsDto.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.ValidateIf)((o) => !!o.link),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], PinterestSettingsDto.prototype, "link", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.ValidateIf)((o) => !!o.dominant_color),
    tslib_1.__metadata("design:type", String)
], PinterestSettingsDto.prototype, "dominant_color", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)({
        message: 'Board is required',
    }),
    (0, class_validator_1.IsString)({
        message: 'Board is required',
    }),
    (0, class_validator_1.MinLength)(1, {
        message: 'Board is required',
    }),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'board must be an id',
    }),
    tslib_1.__metadata("design:type", String)
], PinterestSettingsDto.prototype, "board", void 0);
//# sourceMappingURL=pinterest.dto.js.map