"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingSubscribeDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class BillingSubscribeDto {
}
exports.BillingSubscribeDto = BillingSubscribeDto;
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['MONTHLY', 'YEARLY']),
    tslib_1.__metadata("design:type", String)
], BillingSubscribeDto.prototype, "period", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['STANDARD', 'PRO', 'TEAM', 'ULTIMATE']),
    tslib_1.__metadata("design:type", String)
], BillingSubscribeDto.prototype, "billing", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], BillingSubscribeDto.prototype, "skipTrial", void 0);
//# sourceMappingURL=billing.subscribe.dto.js.map