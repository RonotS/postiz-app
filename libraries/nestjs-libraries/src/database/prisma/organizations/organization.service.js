"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizationService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const organization_repository_1 = require("./organization.repository");
const notification_service_1 = require("../notifications/notification.service");
const auth_service_1 = require("../../../../../helpers/src/auth/auth.service");
const dayjs_1 = tslib_1.__importDefault(require("dayjs"));
const make_is_1 = require("../../../services/make.is");
let OrganizationService = class OrganizationService {
    constructor(_organizationRepository, _notificationsService) {
        this._organizationRepository = _organizationRepository;
        this._notificationsService = _notificationsService;
    }
    async createOrgAndUser(body, ip, userAgent) {
        return this._organizationRepository.createOrgAndUser(body, this._notificationsService.hasEmailProvider(), ip, userAgent);
    }
    async getCount() {
        return this._organizationRepository.getCount();
    }
    getAdminHubSummary() {
        return this._organizationRepository.getAdminHubSummary();
    }
    getAdminPlatformAnalytics() {
        return this._organizationRepository.getAdminPlatformAnalytics();
    }
    listAdminPostNotifications(page, limit, scope) {
        return this._organizationRepository.listAdminPostNotifications(page, limit, scope);
    }
    listAdminPostErrors(page, limit) {
        return this._organizationRepository.listAdminPostErrors(page, limit);
    }
    listAdminPosts(page, limit, search) {
        return this._organizationRepository.listAdminPosts(page, limit, search);
    }
    getAdminPostDetail(postId) {
        return this._organizationRepository.getAdminPostDetail(postId);
    }
    async createMaxUser(id, name, saasName, email) {
        return this._organizationRepository.createMaxUser(id, name, saasName, email);
    }
    addUserToOrg(userId, id, orgId, role) {
        return this._organizationRepository.addUserToOrg(userId, id, orgId, role);
    }
    getOrgById(id) {
        return this._organizationRepository.getOrgById(id);
    }
    getOrgByApiKey(api) {
        return this._organizationRepository.getOrgByApiKey(api);
    }
    getUserOrg(id) {
        return this._organizationRepository.getUserOrg(id);
    }
    getOrgsByUserId(userId) {
        return this._organizationRepository.getOrgsByUserId(userId);
    }
    updateApiKey(orgId) {
        return this._organizationRepository.updateApiKey(orgId);
    }
    getTeam(orgId) {
        return this._organizationRepository.getTeam(orgId);
    }
    async setStreak(organizationId, type) {
        return this._organizationRepository.setStreak(organizationId, type);
    }
    getOrgByCustomerId(customerId) {
        return this._organizationRepository.getOrgByCustomerId(customerId);
    }
    async inviteTeamMember(orgId, body) {
        const timeLimit = (0, dayjs_1.default)().add(1, 'hour').format('YYYY-MM-DD HH:mm:ss');
        const id = (0, make_is_1.makeId)(5);
        const url = process.env.FRONTEND_URL +
            `/?org=${auth_service_1.AuthService.signJWT({ ...body, orgId, timeLimit, id })}`;
        if (body.sendEmail) {
            await this._notificationsService.sendEmail(body.email, 'You have been invited to join an organization', `You have been invited to join an organization. Click <a href="${url}">here</a> to join.<br />The link will expire in 1 hour.`);
        }
        return { url };
    }
    async deleteTeamMember(org, userId) {
        const userOrgs = await this._organizationRepository.getOrgsByUserId(userId);
        const findOrgToDelete = userOrgs.find((orgUser) => orgUser.id === org.id);
        if (!findOrgToDelete) {
            throw new Error('User is not part of this organization');
        }
        // @ts-ignore
        const myRole = org.users[0].role;
        const userRole = findOrgToDelete.users[0].role;
        const myLevel = myRole === 'USER' ? 0 : myRole === 'ADMIN' ? 1 : 2;
        const userLevel = userRole === 'USER' ? 0 : userRole === 'ADMIN' ? 1 : 2;
        if (myLevel < userLevel) {
            throw new Error('You do not have permission to delete this user');
        }
        return this._organizationRepository.deleteTeamMember(org.id, userId);
    }
    disableOrEnableNonSuperAdminUsers(orgId, disable) {
        return this._organizationRepository.disableOrEnableNonSuperAdminUsers(orgId, disable);
    }
    getShortlinkPreference(orgId) {
        return this._organizationRepository.getShortlinkPreference(orgId);
    }
    updateShortlinkPreference(orgId, shortlink) {
        return this._organizationRepository.updateShortlinkPreference(orgId, shortlink);
    }
};
exports.OrganizationService = OrganizationService;
exports.OrganizationService = OrganizationService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [organization_repository_1.OrganizationRepository,
        notification_service_1.NotificationService])
], OrganizationService);
//# sourceMappingURL=organization.service.js.map