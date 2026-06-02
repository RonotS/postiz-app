"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnnouncementsRepository = void 0;
const tslib_1 = require("tslib");
const prisma_service_1 = require("../prisma.service");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let AnnouncementsRepository = class AnnouncementsRepository {
    constructor(_announcements) {
        this._announcements = _announcements;
    }
    getAnnouncements() {
        return this._announcements.model.announcement.findMany({
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    createAnnouncement(body) {
        return this._announcements.model.announcement.create({
            data: {
                title: body.title,
                description: body.description,
                color: body.color || client_1.AnnouncementColor.INFO,
            },
        });
    }
    deleteAnnouncement(id) {
        return this._announcements.model.announcement.delete({
            where: {
                id,
            },
        });
    }
};
exports.AnnouncementsRepository = AnnouncementsRepository;
exports.AnnouncementsRepository = AnnouncementsRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [prisma_service_1.PrismaRepository])
], AnnouncementsRepository);
//# sourceMappingURL=announcements.repository.js.map