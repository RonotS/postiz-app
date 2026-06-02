"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutopostDto = exports.Integrations = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const webhook_url_validator_1 = require("../webhooks/webhook.url.validator");
class Integrations {
}
exports.Integrations = Integrations;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], Integrations.prototype, "id", void 0);
class AutopostDto {
}
exports.AutopostDto = AutopostDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", String)
], AutopostDto.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], AutopostDto.prototype, "content", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], AutopostDto.prototype, "lastUrl", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Boolean)
], AutopostDto.prototype, "onSlot", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Boolean)
], AutopostDto.prototype, "syncLast", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsUrl)(),
    (0, class_validator_1.IsDefined)(),
    (0, webhook_url_validator_1.IsSafeWebhookUrl)({
        message: 'Autopost URL must be a public HTTPS URL and cannot point to internal network addresses',
    }),
    tslib_1.__metadata("design:type", String)
], AutopostDto.prototype, "url", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Boolean)
], AutopostDto.prototype, "active", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Boolean)
], AutopostDto.prototype, "addPicture", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsDefined)(),
    tslib_1.__metadata("design:type", Boolean)
], AutopostDto.prototype, "generateContent", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_transformer_1.Type)(() => Integrations),
    (0, class_validator_1.ValidateNested)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], AutopostDto.prototype, "integrations", void 0);
//# sourceMappingURL=autopost.dto.js.map