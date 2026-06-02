"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateAgencyDto = exports.CreateAgencyLogoDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class CreateAgencyLogoDto {
}
exports.CreateAgencyLogoDto = CreateAgencyLogoDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], CreateAgencyLogoDto.prototype, "id", void 0);
class CreateAgencyDto {
}
exports.CreateAgencyDto = CreateAgencyDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    tslib_1.__metadata("design:type", String)
], CreateAgencyDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsUrl)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], CreateAgencyDto.prototype, "website", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsUrl)(),
    (0, class_validator_1.ValidateIf)((o) => o.facebook),
    tslib_1.__metadata("design:type", String)
], CreateAgencyDto.prototype, "facebook", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], CreateAgencyDto.prototype, "instagram", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], CreateAgencyDto.prototype, "twitter", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsUrl)(),
    (0, class_validator_1.ValidateIf)((o) => o.linkedIn),
    tslib_1.__metadata("design:type", String)
], CreateAgencyDto.prototype, "linkedIn", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsUrl)(),
    (0, class_validator_1.ValidateIf)((o) => o.youtube),
    tslib_1.__metadata("design:type", String)
], CreateAgencyDto.prototype, "youtube", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], CreateAgencyDto.prototype, "tiktok", void 0);
tslib_1.__decorate([
    (0, class_transformer_1.Type)(() => CreateAgencyLogoDto),
    tslib_1.__metadata("design:type", CreateAgencyLogoDto)
], CreateAgencyDto.prototype, "logo", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateAgencyDto.prototype, "shortDescription", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateAgencyDto.prototype, "description", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)({
        each: true,
    }),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(3),
    (0, class_validator_1.IsIn)([
        'Real Estate',
        'Fashion',
        'Health and Fitness',
        'Beauty',
        'Travel',
        'Food',
        'Tech',
        'Gaming',
        'Parenting',
        'Education',
        'Business',
        'Finance',
        'DIY',
        'Pets',
        'Lifestyle',
        'Sports',
        'Entertainment',
        'Art',
        'Photography',
        'Sustainability',
    ], {
        each: true,
    }),
    tslib_1.__metadata("design:type", Array)
], CreateAgencyDto.prototype, "niches", void 0);
//# sourceMappingURL=create.agency.dto.js.map