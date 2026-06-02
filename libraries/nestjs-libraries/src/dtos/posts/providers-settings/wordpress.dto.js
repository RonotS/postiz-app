"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordpressDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const media_dto_1 = require("../../media/media.dto");
const class_transformer_1 = require("class-transformer");
class WordpressDto {
}
exports.WordpressDto = WordpressDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], WordpressDto.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => media_dto_1.MediaDto),
    tslib_1.__metadata("design:type", media_dto_1.MediaDto)
], WordpressDto.prototype, "main_image", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], WordpressDto.prototype, "type", void 0);
//# sourceMappingURL=wordpress.dto.js.map