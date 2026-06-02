"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoDto = exports.ValidIn = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const video_interface_1 = require("../../videos/video.interface");
let ValidIn = class ValidIn {
    _load() {
        return (Reflect.getMetadata('video', video_interface_1.VideoAbstract) || [])
            .filter((f) => f.available)
            .map((p) => p.identifier);
    }
    validate(text, args) {
        // Check if the text is in the list of valid video types
        const validTypes = this._load();
        return validTypes.includes(text);
    }
    defaultMessage(args) {
        // here you can provide default error message if validation failed
        return 'type must be any of: ' + this._load().join(', ');
    }
};
exports.ValidIn = ValidIn;
exports.ValidIn = ValidIn = tslib_1.__decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'checkInRuntime', async: false })
], ValidIn);
class VideoDto {
}
exports.VideoDto = VideoDto;
tslib_1.__decorate([
    (0, class_validator_1.Validate)(ValidIn),
    tslib_1.__metadata("design:type", String)
], VideoDto.prototype, "type", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['vertical', 'horizontal']),
    tslib_1.__metadata("design:type", String)
], VideoDto.prototype, "output", void 0);
//# sourceMappingURL=video.dto.js.map