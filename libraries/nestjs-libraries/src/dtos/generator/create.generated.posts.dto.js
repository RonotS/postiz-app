"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateGeneratedPostsDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class InnerPost {
}
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], InnerPost.prototype, "post", void 0);
class PostGroup {
}
tslib_1.__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => InnerPost),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Array)
], PostGroup.prototype, "list", void 0);
class CreateGeneratedPostsDto {
}
exports.CreateGeneratedPostsDto = CreateGeneratedPostsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PostGroup),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Array)
], CreateGeneratedPostsDto.prototype, "posts", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Number)
], CreateGeneratedPostsDto.prototype, "week", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Number)
], CreateGeneratedPostsDto.prototype, "year", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateIf)((o) => !o.url),
    tslib_1.__metadata("design:type", String)
], CreateGeneratedPostsDto.prototype, "url", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateIf)((o) => !o.url),
    tslib_1.__metadata("design:type", String)
], CreateGeneratedPostsDto.prototype, "postId", void 0);
//# sourceMappingURL=create.generated.posts.dto.js.map