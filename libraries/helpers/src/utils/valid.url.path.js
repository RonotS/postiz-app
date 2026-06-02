"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidUrlPath = exports.ValidUrlExtension = void 0;
const tslib_1 = require("tslib");
const class_validator_1 = require("class-validator");
let ValidUrlExtension = class ValidUrlExtension {
    validate(text, args) {
        return (!!text?.split?.('?')?.[0].endsWith('.png') ||
            !!text?.split?.('?')?.[0].endsWith('.jpg') ||
            !!text?.split?.('?')?.[0].endsWith('.jpeg') ||
            !!text?.split?.('?')?.[0].endsWith('.gif') ||
            !!text?.split?.('?')?.[0].endsWith('.webp') ||
            !!text?.split?.('?')?.[0].endsWith('.mp4'));
    }
    defaultMessage(args) {
        // here you can provide default error message if validation failed
        return ('File must have a valid extension: .png, .jpg, .jpeg, .gif, .webp, or .mp4');
    }
};
exports.ValidUrlExtension = ValidUrlExtension;
exports.ValidUrlExtension = ValidUrlExtension = tslib_1.__decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'checkValidExtension', async: false })
], ValidUrlExtension);
let ValidUrlPath = class ValidUrlPath {
    validate(text, args) {
        if (!process.env.RESTRICT_UPLOAD_DOMAINS) {
            return true;
        }
        return ((text || 'invalid url').indexOf(process.env.RESTRICT_UPLOAD_DOMAINS) > -1);
    }
    defaultMessage(args) {
        // here you can provide default error message if validation failed
        return ('URL must contain the domain: ' + process.env.RESTRICT_UPLOAD_DOMAINS + ' Make sure you first use the upload API route.');
    }
};
exports.ValidUrlPath = ValidUrlPath;
exports.ValidUrlPath = ValidUrlPath = tslib_1.__decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'checkValidPath', async: false })
], ValidUrlPath);
//# sourceMappingURL=valid.url.path.js.map