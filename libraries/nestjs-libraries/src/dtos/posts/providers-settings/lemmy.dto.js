"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LemmySettingsDto = exports.LemmySettingsValueDto = exports.LemmySettingsDtoInner = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class LemmySettingsDtoInner {
}
exports.LemmySettingsDtoInner = LemmySettingsDtoInner;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], LemmySettingsDtoInner.prototype, "subreddit", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], LemmySettingsDtoInner.prototype, "id", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], LemmySettingsDtoInner.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.url),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], LemmySettingsDtoInner.prototype, "url", void 0);
class LemmySettingsValueDto {
}
exports.LemmySettingsValueDto = LemmySettingsValueDto;
tslib_1.__decorate([
    (0, class_transformer_1.Type)(() => LemmySettingsDtoInner),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateNested)(),
    tslib_1.__metadata("design:type", LemmySettingsDtoInner)
], LemmySettingsValueDto.prototype, "value", void 0);
class LemmySettingsDto {
}
exports.LemmySettingsDto = LemmySettingsDto;
tslib_1.__decorate([
    (0, class_transformer_1.Type)(() => LemmySettingsValueDto),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_validator_1.ArrayMinSize)(1),
    tslib_1.__metadata("design:type", Array)
], LemmySettingsDto.prototype, "subreddit", void 0);
//# sourceMappingURL=lemmy.dto.js.map