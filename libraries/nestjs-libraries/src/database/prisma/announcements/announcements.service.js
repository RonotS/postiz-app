"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnnouncementsService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const announcements_repository_1 = require("./announcements.repository");
let AnnouncementsService = class AnnouncementsService {
    constructor(_announcementsRepository) {
        this._announcementsRepository = _announcementsRepository;
    }
    getAnnouncements() {
        return this._announcementsRepository.getAnnouncements();
    }
    createAnnouncement(body) {
        return this._announcementsRepository.createAnnouncement(body);
    }
    deleteAnnouncement(id) {
        return this._announcementsRepository.deleteAnnouncement(id);
    }
};
exports.AnnouncementsService = AnnouncementsService;
exports.AnnouncementsService = AnnouncementsService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [announcements_repository_1.AnnouncementsRepository])
], AnnouncementsService);
//# sourceMappingURL=announcements.service.js.map