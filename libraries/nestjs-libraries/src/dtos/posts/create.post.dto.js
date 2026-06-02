"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatePostDto = exports.Post = exports.PostContent = exports.Integration = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const media_dto_1 = require("../media/media.dto");
const all_providers_settings_1 = require("./providers-settings/all.providers.settings");
const valid_images_1 = require("../../../../helpers/src/utils/valid.images");
class Integration {
}
exports.Integration = Integration;
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], Integration.prototype, "id", void 0);
class PostContent {
}
exports.PostContent = PostContent;
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Validate)(valid_images_1.ValidContent),
    tslib_1.__metadata("design:type", String)
], PostContent.prototype, "content", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], PostContent.prototype, "id", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    tslib_1.__metadata("design:type", Number)
], PostContent.prototype, "delay", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_transformer_1.Type)(() => media_dto_1.MediaDto),
    (0, class_validator_1.ValidateNested)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], PostContent.prototype, "image", void 0);
class Post {
}
exports.Post = Post;
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_transformer_1.Type)(() => Integration),
    (0, class_validator_1.ValidateNested)(),
    tslib_1.__metadata("design:type", Integration)
], Post.prototype, "integration", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.IsArray)(),
    (0, class_transformer_1.Type)(() => PostContent),
    (0, class_validator_1.ValidateNested)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], Post.prototype, "value", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], Post.prototype, "group", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.type !== 'draft'),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => all_providers_settings_1.EmptySettings, {
        keepDiscriminatorProperty: true,
        discriminator: {
            property: '__type',
            subTypes: (0, all_providers_settings_1.allProviders)(all_providers_settings_1.EmptySettings),
        },
    }),
    tslib_1.__metadata("design:type", Object)
], Post.prototype, "settings", void 0);
class Tags {
}
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], Tags.prototype, "value", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], Tags.prototype, "label", void 0);
class CreatePostDto {
}
exports.CreatePostDto = CreatePostDto;
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsIn)(['draft', 'schedule', 'now', 'update']),
    tslib_1.__metadata("design:type", String)
], CreatePostDto.prototype, "type", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreatePostDto.prototype, "order", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], CreatePostDto.prototype, "shortLink", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    tslib_1.__metadata("design:type", Number)
], CreatePostDto.prototype, "inter", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsDateString)(),
    tslib_1.__metadata("design:type", String)
], CreatePostDto.prototype, "date", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], CreatePostDto.prototype, "tags", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_transformer_1.Type)(() => Post),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_validator_1.ArrayMinSize)(1),
    tslib_1.__metadata("design:type", Array)
], CreatePostDto.prototype, "posts", void 0);
//# sourceMappingURL=create.post.dto.js.map