"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HashnodeSettingsDto = exports.HashnodeTagsSettings = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const media_dto_1 = require("../../media/media.dto");
class HashnodeTagsSettings {
}
exports.HashnodeTagsSettings = HashnodeTagsSettings;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], HashnodeTagsSettings.prototype, "value", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], HashnodeTagsSettings.prototype, "label", void 0);
class HashnodeSettingsDto {
}
exports.HashnodeSettingsDto = HashnodeSettingsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(6),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], HashnodeSettingsDto.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], HashnodeSettingsDto.prototype, "subtitle", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => media_dto_1.MediaDto),
    tslib_1.__metadata("design:type", media_dto_1.MediaDto)
], HashnodeSettingsDto.prototype, "main_image", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.ValidateIf)((o) => o.canonical && o.canonical.indexOf('(post:') === -1),
    (0, class_validator_1.Matches)(/^(|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})$/, {
        message: 'Invalid URL',
    }),
    tslib_1.__metadata("design:type", String)
], HashnodeSettingsDto.prototype, "canonical", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], HashnodeSettingsDto.prototype, "publication", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_transformer_1.Type)(() => HashnodeTagsSettings),
    (0, class_validator_1.ValidateNested)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], HashnodeSettingsDto.prototype, "tags", void 0);
//# sourceMappingURL=hashnode.settings.dto.js.map