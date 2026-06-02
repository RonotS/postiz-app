"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readOrFetch = void 0;
const tslib_1 = require("tslib");
const fs_1 = require("fs");
const axios_1 = tslib_1.__importDefault(require("axios"));
const readOrFetch = async (path) => {
    if (path.indexOf('http') === 0) {
        return (await (0, axios_1.default)({
            url: path,
            method: 'GET',
            responseType: 'arraybuffer',
        })).data;
    }
    return (0, fs_1.readFileSync)(path);
};
exports.readOrFetch = readOrFetch;
//# sourceMappingURL=read.or.fetch.js.map