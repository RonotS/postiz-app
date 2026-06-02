"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidContent = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
const striptags_1 = tslib_1.__importDefault(require("striptags"));
let ValidContent = class ValidContent {
    validate(contentRaw, args) {
        const content = (0, striptags_1.default)(contentRaw || '');
        if (
        // @ts-ignore
        (!args?.object?.image || !Array.isArray(args?.object?.image) || !args?.object?.image.length) &&
            (!content || typeof content !== 'string' || content?.trim() === '')) {
            return false;
        }
        return true;
    }
    defaultMessage(args) {
        // here you can provide default error message if validation failed
        return ' If images do not exist, content must be a non-empty string.';
    }
};
exports.ValidContent = ValidContent;
exports.ValidContent = ValidContent = tslib_1.__decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'validateContent', async: false })
], ValidContent);
//# sourceMappingURL=valid.images.js.map