"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedditSettingsDto = exports.RedditSettingsValueDto = exports.RedditSettingsDtoInner = exports.RedditFlairDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const class_validator_jsonschema_1 = require("class-validator-jsonschema");
class RedditFlairDto {
}
exports.RedditFlairDto = RedditFlairDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], RedditFlairDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], RedditFlairDto.prototype, "name", void 0);
class RedditSettingsDtoInner {
}
exports.RedditSettingsDtoInner = RedditSettingsDtoInner;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Subreddit must start with /r',
    }),
    tslib_1.__metadata("design:type", String)
], RedditSettingsDtoInner.prototype, "subreddit", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], RedditSettingsDtoInner.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Must be any of link, self (normal post), image, video, videogif',
    }),
    tslib_1.__metadata("design:type", String)
], RedditSettingsDtoInner.prototype, "type", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsUrl)(),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateIf)((o) => o.type === 'link' && o?.url?.indexOf('(post:') === -1),
    (0, class_validator_1.Matches)(/^(|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})$/, {
        message: 'Invalid URL',
    }),
    tslib_1.__metadata("design:type", String)
], RedditSettingsDtoInner.prototype, "url", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Boolean)
], RedditSettingsDtoInner.prototype, "is_flair_required", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateIf)((e) => e.is_flair_required),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RedditFlairDto),
    tslib_1.__metadata("design:type", RedditFlairDto)
], RedditSettingsDtoInner.prototype, "flair", void 0);
class RedditSettingsValueDto {
}
exports.RedditSettingsValueDto = RedditSettingsValueDto;
tslib_1.__decorate([
    (0, class_transformer_1.Type)(() => RedditSettingsDtoInner),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateNested)(),
    tslib_1.__metadata("design:type", RedditSettingsDtoInner)
], RedditSettingsValueDto.prototype, "value", void 0);
class RedditSettingsDto {
}
exports.RedditSettingsDto = RedditSettingsDto;
tslib_1.__decorate([
    (0, class_transformer_1.Type)(() => RedditSettingsValueDto),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_validator_1.ArrayMinSize)(1),
    tslib_1.__metadata("design:type", Array)
], RedditSettingsDto.prototype, "subreddit", void 0);
//# sourceMappingURL=reddit.dto.js.map