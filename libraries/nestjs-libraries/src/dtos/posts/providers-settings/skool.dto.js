"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkoolDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_validator_jsonschema_1 = require("class-validator-jsonschema");
class SkoolDto {
}
exports.SkoolDto = SkoolDto;
tslib_1.__decorate([
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Group must be an id',
    }),
    tslib_1.__metadata("design:type", String)
], SkoolDto.prototype, "group", void 0);
tslib_1.__decorate([
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Label must be an id',
    }),
    tslib_1.__metadata("design:type", String)
], SkoolDto.prototype, "label", void 0);
tslib_1.__decorate([
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Title of the post',
    }),
    tslib_1.__metadata("design:type", String)
], SkoolDto.prototype, "title", void 0);
//# sourceMappingURL=skool.dto.js.map