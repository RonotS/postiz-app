"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateStripePromotionDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class CreateStripePromotionDto {
}
exports.CreateStripePromotionDto = CreateStripePromotionDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(40),
    tslib_1.__metadata("design:type", String)
], CreateStripePromotionDto.prototype, "code", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(120),
    tslib_1.__metadata("design:type", String)
], CreateStripePromotionDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.amountOffCents == null),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    tslib_1.__metadata("design:type", Number)
], CreateStripePromotionDto.prototype, "percentOff", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.percentOff == null),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100_000_000),
    tslib_1.__metadata("design:type", Number)
], CreateStripePromotionDto.prototype, "amountOffCents", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['once', 'repeating', 'forever']),
    tslib_1.__metadata("design:type", String)
], CreateStripePromotionDto.prototype, "duration", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.duration === 'repeating'),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(36),
    tslib_1.__metadata("design:type", Number)
], CreateStripePromotionDto.prototype, "durationInMonths", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1_000_000),
    tslib_1.__metadata("design:type", Number)
], CreateStripePromotionDto.prototype, "maxRedemptions", void 0);
//# sourceMappingURL=create-stripe-promotion.dto.js.map