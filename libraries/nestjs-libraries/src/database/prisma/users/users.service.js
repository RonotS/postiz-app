"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const users_repository_1 = require("./users.repository");
const organization_repository_1 = require("../organizations/organization.repository");
let UsersService = class UsersService {
    constructor(_usersRepository, _organizationRepository) {
        this._usersRepository = _usersRepository;
        this._organizationRepository = _organizationRepository;
    }
    getUserByEmail(email) {
        return this._usersRepository.getUserByEmail(email);
    }
    getUserById(id) {
        return this._usersRepository.getUserById(id);
    }
    getImpersonateUser(name) {
        return this._organizationRepository.getImpersonateUser(name);
    }
    getUserByProvider(providerId, provider) {
        return this._usersRepository.getUserByProvider(providerId, provider);
    }
    activateUser(id) {
        return this._usersRepository.activateUser(id);
    }
    updatePassword(id, password) {
        return this._usersRepository.updatePassword(id, password);
    }
    getPersonal(userId) {
        return this._usersRepository.getPersonal(userId);
    }
    changePersonal(userId, body) {
        return this._usersRepository.changePersonal(userId, body);
    }
    getEmailNotifications(userId) {
        return this._usersRepository.getEmailNotifications(userId);
    }
    updateEmailNotifications(userId, body) {
        return this._usersRepository.updateEmailNotifications(userId, body);
    }
    /** Returns true when at least one user in the given organization has the
     *  platform-level `isSuperAdmin` flag set. Used as a bypass for
     *  subscription/usage gates so platform admins can operate on FREE orgs. */
    async orgHasPlatformSuperAdmin(orgId) {
        return this._usersRepository.orgHasPlatformSuperAdmin(orgId);
    }
    async listUsersForPlatformAdmin(take = 200) {
        const rows = await this._usersRepository.listUsersForPlatformAdmin(take);
        return rows.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            providerName: u.providerName,
            activated: u.activated,
            isSuperAdmin: u.isSuperAdmin,
            createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
            organizations: u.organizations.map((m) => ({
                role: m.role,
                organizationId: m.organization.id,
                organizationName: m.organization.name,
                subscriptionTier: m.organization.subscription?.subscriptionTier ?? 'FREE',
                subscriptionPeriod: m.organization.subscription?.period ?? null,
                subscriptionCancelAt: m.organization.subscription?.cancelAt
                    ? m.organization.subscription.cancelAt instanceof Date
                        ? m.organization.subscription.cancelAt.toISOString()
                        : String(m.organization.subscription.cancelAt)
                    : null,
                subscriptionLifetime: m.organization.subscription?.isLifetime ?? false,
            })),
        }));
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [users_repository_1.UsersRepository,
        organization_repository_1.OrganizationRepository])
], UsersService);
//# sourceMappingURL=users.service.js.map