"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaveMediaInformationDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class SaveMediaInformationDto {
}
exports.SaveMediaInformationDto = SaveMediaInformationDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], SaveMediaInformationDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], SaveMediaInformationDto.prototype, "alt", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsUrl)(),
    (0, class_validator_1.ValidateIf)((o) => !!o.thumbnail),
    tslib_1.__metadata("design:type", String)
], SaveMediaInformationDto.prototype, "thumbnail", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.ValidateIf)((o) => !!o.thumbnailTimestamp),
    tslib_1.__metadata("design:type", Number)
], SaveMediaInformationDto.prototype, "thumbnailTimestamp", void 0);
//# sourceMappingURL=save.media.information.dto.js.map