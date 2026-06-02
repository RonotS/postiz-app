"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationTimeDto = exports.IntegrationValidateTimeDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class IntegrationValidateTimeDto {
}
exports.IntegrationValidateTimeDto = IntegrationValidateTimeDto;
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsNumber)(),
    tslib_1.__metadata("design:type", Number)
], IntegrationValidateTimeDto.prototype, "time", void 0);
class IntegrationTimeDto {
}
exports.IntegrationTimeDto = IntegrationTimeDto;
tslib_1.__decorate([
    (0, class_transformer_1.Type)(() => IntegrationValidateTimeDto),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], IntegrationTimeDto.prototype, "time", void 0);
//# sourceMappingURL=integration.time.dto.js.map