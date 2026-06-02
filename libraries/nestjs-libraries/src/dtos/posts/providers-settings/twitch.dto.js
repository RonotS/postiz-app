"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitchDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class TwitchDto {
}
exports.TwitchDto = TwitchDto;
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['message', 'announcement']),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], TwitchDto.prototype, "messageType", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['primary', 'blue', 'green', 'orange', 'purple']),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], TwitchDto.prototype, "announcementColor", void 0);
//# sourceMappingURL=twitch.dto.js.map