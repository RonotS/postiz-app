"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TikTokDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class TikTokDto {
}
exports.TikTokDto = TikTokDto;
tslib_1.__decorate([
    (0, class_validator_1.ValidateIf)((p) => p.title),
    (0, class_validator_1.MaxLength)(90),
    tslib_1.__metadata("design:type", String)
], TikTokDto.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsIn)([
        'PUBLIC_TO_EVERYONE',
        'MUTUAL_FOLLOW_FRIENDS',
        'FOLLOWER_OF_CREATOR',
        'SELF_ONLY',
    ]),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], TikTokDto.prototype, "privacy_level", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], TikTokDto.prototype, "duet", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], TikTokDto.prototype, "stitch", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], TikTokDto.prototype, "comment", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['yes', 'no']),
    tslib_1.__metadata("design:type", String)
], TikTokDto.prototype, "autoAddMusic", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], TikTokDto.prototype, "brand_content_toggle", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", Boolean)
], TikTokDto.prototype, "video_made_with_ai", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], TikTokDto.prototype, "brand_organic_toggle", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['DIRECT_POST', 'UPLOAD']),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], TikTokDto.prototype, "content_posting_method", void 0);
//# sourceMappingURL=tiktok.dto.js.map