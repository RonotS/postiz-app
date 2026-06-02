"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevToSettingsDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const media_dto_1 = require("../../media/media.dto");
const class_transformer_1 = require("class-transformer");
const dev_to_tags_settings_dto_1 = require("./dev.to.tags.settings.dto");
class DevToSettingsDto {
    constructor() {
        this.tags = [];
    }
}
exports.DevToSettingsDto = DevToSettingsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], DevToSettingsDto.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => media_dto_1.MediaDto),
    tslib_1.__metadata("design:type", media_dto_1.MediaDto)
], DevToSettingsDto.prototype, "main_image", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.ValidateIf)((o) => o.canonical && o.canonical.indexOf('(post:') === -1),
    (0, class_validator_1.Matches)(/^(|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})$/, {
        message: 'Invalid URL',
    }),
    tslib_1.__metadata("design:type", String)
], DevToSettingsDto.prototype, "canonical", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], DevToSettingsDto.prototype, "organization", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(4),
    (0, class_transformer_1.Type)(() => dev_to_tags_settings_dto_1.DevToTagsSettingsDto),
    (0, class_validator_1.ValidateNested)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], DevToSettingsDto.prototype, "tags", void 0);
//# sourceMappingURL=dev.to.settings.dto.js.map