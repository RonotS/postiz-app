"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramDto = exports.Collaborators = void 0;
const tslib_1 = require("tslib");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class Collaborators {
}
exports.Collaborators = Collaborators;
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], Collaborators.prototype, "label", void 0);
class InstagramDto {
}
exports.InstagramDto = InstagramDto;
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['post', 'story']),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], InstagramDto.prototype, "post_type", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", Boolean)
], InstagramDto.prototype, "is_trial_reel", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['MANUAL', 'SS_PERFORMANCE']),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], InstagramDto.prototype, "graduation_strategy", void 0);
tslib_1.__decorate([
    (0, class_transformer_1.Type)(() => Collaborators),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", Array)
], InstagramDto.prototype, "collaborators", void 0);
//# sourceMappingURL=instagram.dto.js.map