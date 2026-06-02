"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadFactory = void 0;
const cloudflare_storage_1 = require("./cloudflare.storage");
const local_storage_1 = require("./local.storage");
class UploadFactory {
    static createStorage() {
        const storageProvider = process.env.STORAGE_PROVIDER || 'local';
        switch (storageProvider) {
            case 'local':
                return new local_storage_1.LocalStorage(process.env.UPLOAD_DIRECTORY);
            case 'cloudflare':
                return new cloudflare_storage_1.CloudflareStorage(process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_ACCESS_KEY, process.env.CLOUDFLARE_SECRET_ACCESS_KEY, process.env.CLOUDFLARE_REGION, process.env.CLOUDFLARE_BUCKETNAME, process.env.CLOUDFLARE_BUCKET_URL);
            default:
                throw new Error(`Invalid storage type ${storageProvider}`);
        }
    }
}
exports.UploadFactory = UploadFactory;
//# sourceMappingURL=upload.factory.js.map