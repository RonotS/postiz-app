"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlugDto = exports.FieldsDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class FieldsDto {
}
exports.FieldsDto = FieldsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], FieldsDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], FieldsDto.prototype, "value", void 0);
class PlugDto {
}
exports.PlugDto = PlugDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], PlugDto.prototype, "func", void 0);
tslib_1.__decorate([
    (0, class_transformer_1.Type)(() => FieldsDto),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Array)
], PlugDto.prototype, "fields", void 0);
//# sourceMappingURL=plug.dto.js.map