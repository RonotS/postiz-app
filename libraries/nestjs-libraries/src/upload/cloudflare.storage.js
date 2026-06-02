"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudflareStorage = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
require("multer");
const make_is_1 = require("../services/make.is");
const webhook_url_validator_1 = require("../dtos/webhooks/webhook.url.validator");
const ssrf_safe_dispatcher_1 = require("../dtos/webhooks/ssrf.safe.dispatcher");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');
const ALLOWED_MIME_TYPES = new Set([
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
class CloudflareStorage {
    constructor(accountID, accessKey, secretKey, region, _bucketName, _uploadUrl) {
        this.region = region;
        this._bucketName = _bucketName;
        this._uploadUrl = _uploadUrl;
        this._client = new client_s3_1.S3Client({
            endpoint: `https://${accountID}.r2.cloudflarestorage.com`,
            region,
            credentials: {
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
            },
            requestChecksumCalculation: 'WHEN_REQUIRED',
        });
        this._client.middlewareStack.add((next) => async (args) => {
            const request = args.request;
            // Remove checksum headers
            const headers = request.headers;
            delete headers['x-amz-checksum-crc32'];
            delete headers['x-amz-checksum-crc32c'];
            delete headers['x-amz-checksum-sha1'];
            delete headers['x-amz-checksum-sha256'];
            request.headers = headers;
            Object.entries(request.headers).forEach(
            // @ts-ignore
            ([key, value]) => {
                if (!request.headers) {
                    request.headers = {};
                }
                request.headers[key] = value;
            });
            return next(args);
        }, { step: 'build', name: 'customHeaders' });
    }
    async uploadSimple(path) {
        if (!(await (0, webhook_url_validator_1.isSafePublicHttpsUrl)(path))) {
            throw new Error('Unsafe URL');
        }
        const loadImage = await fetch(path, {
            // @ts-ignore — undici option, not in lib.dom fetch types
            dispatcher: ssrf_safe_dispatcher_1.ssrfSafeDispatcher,
        });
        const body = Buffer.from(await loadImage.arrayBuffer());
        const detected = await fromBuffer(body);
        if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
            throw new Error('Unsupported file type.');
        }
        const extension = detected.ext;
        const safeContentType = detected.mime;
        const id = (0, make_is_1.makeId)(10);
        const params = {
            Bucket: this._bucketName,
            Key: `${id}.${extension}`,
            Body: body,
            ContentType: safeContentType,
            ChecksumMode: 'DISABLED',
        };
        const command = new client_s3_1.PutObjectCommand({ ...params });
        await this._client.send(command);
        return `${this._uploadUrl}/${id}.${extension}`;
    }
    async uploadFile(file) {
        try {
            const detected = await fromBuffer(file.buffer);
            if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
                throw new Error('Unsupported file type.');
            }
            const id = (0, make_is_1.makeId)(10);
            const extension = detected.ext;
            const safeContentType = detected.mime;
            // Create the PutObjectCommand to upload the file to Cloudflare R2
            const command = new client_s3_1.PutObjectCommand({
                Bucket: this._bucketName,
                ACL: 'public-read',
                Key: `${id}.${extension}`,
                Body: file.buffer,
                ContentType: safeContentType,
            });
            await this._client.send(command);
            return {
                filename: `${id}.${extension}`,
                mimetype: file.mimetype,
                size: file.size,
                buffer: file.buffer,
                originalname: `${id}.${extension}`,
                fieldname: 'file',
                path: `${this._uploadUrl}/${id}.${extension}`,
                destination: `${this._uploadUrl}/${id}.${extension}`,
                encoding: '7bit',
                stream: file.buffer,
            };
        }
        catch (err) {
            console.error('Error uploading file to Cloudflare R2:', err);
            throw err;
        }
    }
    // Implement the removeFile method from IUploadProvider
    async removeFile(filePath) {
        // const fileName = filePath.split('/').pop(); // Extract the filename from the path
        // const command = new DeleteObjectCommand({
        //   Bucket: this._bucketName,
        //   Key: fileName,
        // });
        // await this._client.send(command);
    }
}
exports.CloudflareStorage = CloudflareStorage;
exports.default = CloudflareStorage;
//# sourceMappingURL=cloudflare.storage.js.map