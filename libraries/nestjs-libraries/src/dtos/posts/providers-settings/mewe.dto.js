"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeweDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_validator_jsonschema_1 = require("class-validator-jsonschema");
class MeweDto {
}
exports.MeweDto = MeweDto;
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['timeline', 'group']),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Where to post: timeline or group',
    }),
    tslib_1.__metadata("design:type", String)
], MeweDto.prototype, "postType", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.postType === 'group'),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.IsString)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Group must be an id',
    }),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], MeweDto.prototype, "group", void 0);
//# sourceMappingURL=mewe.dto.js.map