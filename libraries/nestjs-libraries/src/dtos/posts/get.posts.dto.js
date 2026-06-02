"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetPostsDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class GetPostsDto {
}
exports.GetPostsDto = GetPostsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsDateString)(),
    tslib_1.__metadata("design:type", String)
], GetPostsDto.prototype, "startDate", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsDateString)(),
    tslib_1.__metadata("design:type", String)
], GetPostsDto.prototype, "endDate", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], GetPostsDto.prototype, "customer", void 0);
//# sourceMappingURL=get.posts.dto.js.map