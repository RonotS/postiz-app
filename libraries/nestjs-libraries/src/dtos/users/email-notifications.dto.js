"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailNotificationsDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class EmailNotificationsDto {
}
exports.EmailNotificationsDto = EmailNotificationsDto;
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], EmailNotificationsDto.prototype, "sendSuccessEmails", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], EmailNotificationsDto.prototype, "sendFailureEmails", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], EmailNotificationsDto.prototype, "sendStreakEmails", void 0);
//# sourceMappingURL=email-notifications.dto.js.map