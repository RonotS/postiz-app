"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const class_validator_jsonschema_1 = require("class-validator-jsonschema");
class DiscordDto {
}
exports.DiscordDto = DiscordDto;
tslib_1.__decorate([
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.IsDefined)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: 'Channel must be an id',
    }),
    tslib_1.__metadata("design:type", String)
], DiscordDto.prototype, "channel", void 0);
//# sourceMappingURL=discord.dto.js.map