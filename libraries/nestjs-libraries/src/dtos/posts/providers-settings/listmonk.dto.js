"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListmonkDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_validator_jsonschema_1 = require("class-validator-jsonschema");
class ListmonkDto {
}
exports.ListmonkDto = ListmonkDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    tslib_1.__metadata("design:type", String)
], ListmonkDto.prototype, "subject", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], ListmonkDto.prototype, "preview", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'List must be an id',
    }),
    tslib_1.__metadata("design:type", String)
], ListmonkDto.prototype, "list", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Template must be an id',
    }),
    tslib_1.__metadata("design:type", String)
], ListmonkDto.prototype, "template", void 0);
//# sourceMappingURL=listmonk.dto.js.map