"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YoutubeSettingsDto = exports.YoutubeTagsSettings = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const media_dto_1 = require("../../media/media.dto");
const class_transformer_1 = require("class-transformer");
class YoutubeTagsSettings {
}
exports.YoutubeTagsSettings = YoutubeTagsSettings;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], YoutubeTagsSettings.prototype, "value", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], YoutubeTagsSettings.prototype, "label", void 0);
class YoutubeSettingsDto {
}
exports.YoutubeSettingsDto = YoutubeSettingsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(100),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], YoutubeSettingsDto.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['public', 'private', 'unlisted']),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], YoutubeSettingsDto.prototype, "type", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['yes', 'no']),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], YoutubeSettingsDto.prototype, "selfDeclaredMadeForKids", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => media_dto_1.MediaDto),
    tslib_1.__metadata("design:type", media_dto_1.MediaDto)
], YoutubeSettingsDto.prototype, "thumbnail", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => YoutubeTagsSettings),
    tslib_1.__metadata("design:type", Array)
], YoutubeSettingsDto.prototype, "tags", void 0);
//# sourceMappingURL=youtube.settings.dto.js.map