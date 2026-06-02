"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoltbookDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class MoltbookDto {
}
exports.MoltbookDto = MoltbookDto;
tslib_1.__decorate([
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], MoltbookDto.prototype, "submolt", void 0);
//# sourceMappingURL=moltbook.dto.js.map