"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmbSettingsDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class GmbSettingsDto {
}
exports.GmbSettingsDto = GmbSettingsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['STANDARD', 'EVENT', 'OFFER']),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "topicType", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([
        'NONE',
        'BOOK',
        'ORDER',
        'SHOP',
        'LEARN_MORE',
        'SIGN_UP',
        'GET_OFFER',
        'CALL',
    ]),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "callToActionType", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((o) => o.callToActionType),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "callToActionUrl", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((o) => o.topicType === 'EVENT'),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "eventTitle", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "eventStartDate", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "eventEndDate", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "eventStartTime", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "eventEndTime", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "offerCouponCode", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((o) => o.offerRedeemUrl),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "offerRedeemUrl", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], GmbSettingsDto.prototype, "offerTerms", void 0);
//# sourceMappingURL=gmb.settings.dto.js.map