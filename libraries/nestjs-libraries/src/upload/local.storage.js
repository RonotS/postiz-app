"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorage = void 0;
const tslib_1 = require("tslib");
const fs_1 = require("fs");
// @ts-ignore
const mime_1 = tslib_1.__importDefault(require("mime"));
const webhook_url_validator_1 = require("../dtos/webhooks/webhook.url.validator");
const ssrf_safe_dispatcher_1 = require("../dtos/webhooks/ssrf.safe.dispatcher");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');
const LOCAL_STORAGE_ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/bmp',
    'image/tiff',
    'video/mp4',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/ogg',
]);
class LocalStorage {
    constructor(uploadDirectory) {
        this.uploadDirectory = uploadDirectory;
    }
    async uploadSimple(path) {
        if (!(await (0, webhook_url_validator_1.isSafePublicHttpsUrl)(path))) {
            throw new Error('Unsafe URL');
        }
        const loadImage = await fetch(path, {
            // @ts-ignore — undici option, not in lib.dom fetch types
            dispatcher: ssrf_safe_dispatcher_1.ssrfSafeDispatcher,
        });
        const contentType = loadImage?.headers?.get('content-type') ||
            loadImage?.headers?.get('Content-Type');
        const findExtension = mime_1.default.getExtension(contentType) ||
            path.split('?')[0].split('#')[0].split('.').pop() ||
            'bin';
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const innerPath = `/${year}/${month}/${day}`;
        const dir = `${this.uploadDirectory}${innerPath}`;
        (0, fs_1.mkdirSync)(dir, { recursive: true });
        const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
        const filePath = `${dir}/${randomName}.${findExtension}`;
        const publicPath = `${innerPath}/${randomName}.${findExtension}`;
        // Logic to save the file to the filesystem goes here
        (0, fs_1.writeFileSync)(filePath, Buffer.from(await loadImage.arrayBuffer()));
        return process.env.FRONTEND_URL + '/uploads' + publicPath;
    }
    async uploadFile(file) {
        try {
            const detected = await fromBuffer(file.buffer);
            if (!detected || !LOCAL_STORAGE_ALLOWED_MIME.has(detected.mime)) {
                throw new Error('Unsupported file type.');
            }
            const safeExt = `.${detected.ext}`;
            const safeMime = detected.mime;
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const innerPath = `/${year}/${month}/${day}`;
            const dir = `${this.uploadDirectory}${innerPath}`;
            (0, fs_1.mkdirSync)(dir, { recursive: true });
            const randomName = Array(32)
                .fill(null)
                .map(() => Math.round(Math.random() * 16).toString(16))
                .join('');
            const filePath = `${dir}/${randomName}${safeExt}`;
            const publicPath = `${innerPath}/${randomName}${safeExt}`;
            (0, fs_1.writeFileSync)(filePath, file.buffer);
            return {
                filename: `${randomName}${safeExt}`,
                path: process.env.FRONTEND_URL + '/uploads' + publicPath,
                mimetype: safeMime,
                originalname: `${randomName}${safeExt}`,
            };
        }
        catch (err) {
            console.error('Error uploading file to Local Storage:', err);
            throw err;
        }
    }
    async removeFile(filePath) {
        // Logic to remove the file from the filesystem goes here
        return new Promise((resolve, reject) => {
            (0, fs_1.unlink)(filePath, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
}
exports.LocalStorage = LocalStorage;
//# sourceMappingURL=local.storage.js.map