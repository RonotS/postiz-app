"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhopDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_validator_jsonschema_1 = require("class-validator-jsonschema");
class WhopDto {
}
exports.WhopDto = WhopDto;
tslib_1.__decorate([
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Company ID',
    }),
    tslib_1.__metadata("design:type", String)
], WhopDto.prototype, "company", void 0);
tslib_1.__decorate([
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Experience ID for the Whop forum',
    }),
    tslib_1.__metadata("design:type", String)
], WhopDto.prototype, "experience", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], WhopDto.prototype, "title", void 0);
//# sourceMappingURL=whop.dto.js.map