"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeId = void 0;
const makeId = (length) => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i += 1) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};
exports.makeId = makeId;
//# sourceMappingURL=make.is.js.map