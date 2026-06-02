"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttachPublishedTweetDto = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
class AttachPublishedTweetDto {
}
exports.AttachPublishedTweetDto = AttachPublishedTweetDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    tslib_1.__metadata("design:type", String)
], AttachPublishedTweetDto.prototype, "integrationId", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    tslib_1.__metadata("design:type", String)
], AttachPublishedTweetDto.prototype, "tweetUrl", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsObject)(),
    tslib_1.__metadata("design:type", Object)
], AttachPublishedTweetDto.prototype, "settings", void 0);
//# sourceMappingURL=attach.published.tweet.dto.js.map