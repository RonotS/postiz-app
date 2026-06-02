"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnnouncementDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class AnnouncementDto {
}
exports.AnnouncementDto = AnnouncementDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], AnnouncementDto.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], AnnouncementDto.prototype, "description", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['INFO', 'WARNING', 'ERROR']),
    tslib_1.__metadata("design:type", String)
], AnnouncementDto.prototype, "color", void 0);
//# sourceMappingURL=announcements.dto.js.map