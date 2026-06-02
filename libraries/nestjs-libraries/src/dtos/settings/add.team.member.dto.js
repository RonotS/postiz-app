"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddTeamMemberDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class AddTeamMemberDto {
}
exports.AddTeamMemberDto = AddTeamMemberDto;
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.ValidateIf)((o) => o.sendEmail),
    tslib_1.__metadata("design:type", String)
], AddTeamMemberDto.prototype, "email", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['USER', 'ADMIN']),
    tslib_1.__metadata("design:type", String)
], AddTeamMemberDto.prototype, "role", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], AddTeamMemberDto.prototype, "sendEmail", void 0);
//# sourceMappingURL=add.team.member.dto.js.map