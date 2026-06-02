"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FarcasterDto = exports.FarcasterValue = exports.FarcasterId = void 0;
const tslib_1 = require("tslib");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class FarcasterId {
}
exports.FarcasterId = FarcasterId;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], FarcasterId.prototype, "id", void 0);
class FarcasterValue {
}
exports.FarcasterValue = FarcasterValue;
tslib_1.__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => FarcasterId),
    tslib_1.__metadata("design:type", FarcasterId)
], FarcasterValue.prototype, "value", void 0);
class FarcasterDto {
}
exports.FarcasterDto = FarcasterDto;
tslib_1.__decorate([
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => FarcasterValue),
    tslib_1.__metadata("design:type", Array)
], FarcasterDto.prototype, "subreddit", void 0);
//# sourceMappingURL=farcaster.dto.js.map