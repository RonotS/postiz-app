"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaRepository = void 0;
const tslib_1 = require("tslib");
const prisma_service_1 = require("../prisma.service");
const common_1 = require("@nestjs/common");
let MediaRepository = class MediaRepository {
    constructor(_media) {
        this._media = _media;
    }
    saveFile(org, fileName, filePath, originalName) {
        return this._media.model.media.create({
            data: {
                organization: {
                    connect: {
                        id: org,
                    },
                },
                name: fileName,
                path: filePath,
                originalName: originalName || null,
            },
            select: {
                id: true,
                name: true,
                originalName: true,
                path: true,
                thumbnail: true,
                alt: true,
            },
        });
    }
    getMediaById(id) {
        return this._media.model.media.findUnique({
            where: {
                id,
            },
        });
    }
    deleteMedia(org, id) {
        return this._media.model.media.update({
            where: {
                id,
                organizationId: org,
            },
            data: {
                deletedAt: new Date(),
            },
        });
    }
    saveMediaInformation(org, data) {
        return this._media.model.media.update({
            where: {
                id: data.id,
                organizationId: org,
            },
            data: {
                alt: data.alt,
                thumbnail: data.thumbnail,
                thumbnailTimestamp: data.thumbnailTimestamp,
            },
            select: {
                id: true,
                name: true,
                originalName: true,
                alt: true,
                thumbnail: true,
                path: true,
                thumbnailTimestamp: true,
            },
        });
    }
    async getMedia(org, page, search) {
        const pageNum = (page || 1) - 1;
        const trimmedSearch = search?.trim();
        const searchFilter = trimmedSearch
            ? {
                originalName: {
                    contains: trimmedSearch,
                    mode: 'insensitive',
                },
            }
            : {};
        const query = {
            where: {
                organization: {
                    id: org,
                },
                deletedAt: null,
                ...searchFilter,
            },
        };
        const pages = Math.ceil((await this._media.model.media.count(query)) / 18);
        const results = await this._media.model.media.findMany({
            where: {
                organizationId: org,
                deletedAt: null,
                ...searchFilter,
            },
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                name: true,
                originalName: true,
                path: true,
                thumbnail: true,
                alt: true,
                thumbnailTimestamp: true,
            },
            skip: pageNum * 18,
            take: 18,
        });
        return {
            pages,
            results,
        };
    }
};
exports.MediaRepository = MediaRepository;
exports.MediaRepository = MediaRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [prisma_service_1.PrismaRepository])
], MediaRepository);
//# sourceMappingURL=media.repository.js.map