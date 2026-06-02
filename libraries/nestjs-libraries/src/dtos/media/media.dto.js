"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const valid_url_path_1 = require("../../../../helpers/src/utils/valid.url.path");
class MediaDto {
}
exports.MediaDto = MediaDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], MediaDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.Validate)(valid_url_path_1.ValidUrlPath),
    (0, class_validator_1.Validate)(valid_url_path_1.ValidUrlExtension),
    tslib_1.__metadata("design:type", String)
], MediaDto.prototype, "path", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.alt),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], MediaDto.prototype, "alt", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.thumbnail),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], MediaDto.prototype, "thumbnail", void 0);
//# sourceMappingURL=media.dto.js.map