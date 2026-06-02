"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersRepository = void 0;
const tslib_1 = require("tslib");
const prisma_service_1 = require("../prisma.service");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const auth_service_1 = require("../../../../../helpers/src/auth/auth.service");
let UsersRepository = class UsersRepository {
    constructor(_user) {
        this._user = _user;
    }
    getImpersonateUser(name) {
        return this._user.model.user.findMany({
            where: {
                OR: [
                    {
                        name: {
                            contains: name,
                        },
                    },
                    {
                        email: {
                            contains: name,
                        },
                    },
                    {
                        id: {
                            contains: name,
                        },
                    },
                ],
            },
            select: {
                id: true,
                name: true,
                email: true,
            },
            take: 10,
        });
    }
    getUserById(id) {
        return this._user.model.user.findFirst({
            where: {
                id,
            },
        });
    }
    getUserByEmail(email) {
        return this._user.model.user.findFirst({
            where: {
                email,
                providerName: client_1.Provider.LOCAL,
            },
            include: {
                picture: {
                    select: {
                        id: true,
                        path: true,
                    },
                },
            },
        });
    }
    activateUser(id) {
        return this._user.model.user.update({
            where: {
                id,
            },
            data: {
                activated: true,
            },
        });
    }
    getUserByProvider(providerId, provider) {
        return this._user.model.user.findFirst({
            where: {
                providerId,
                providerName: provider,
            },
        });
    }
    updatePassword(id, password) {
        return this._user.model.user.update({
            where: {
                id,
                providerName: client_1.Provider.LOCAL,
            },
            data: {
                password: auth_service_1.AuthService.hashPassword(password),
            },
        });
    }
    changeAudienceSize(userId, audience) {
        return this._user.model.user.update({
            where: {
                id: userId,
            },
            data: {
                audience,
            },
        });
    }
    async getPersonal(userId) {
        const user = await this._user.model.user.findUnique({
            where: {
                id: userId,
            },
            select: {
                id: true,
                name: true,
                bio: true,
                picture: {
                    select: {
                        id: true,
                        path: true,
                    },
                },
            },
        });
        return user;
    }
    async changePersonal(userId, body) {
        await this._user.model.user.update({
            where: {
                id: userId,
            },
            data: {
                name: body.fullname,
                bio: body.bio,
                picture: body.picture
                    ? {
                        connect: {
                            id: body.picture.id,
                        },
                    }
                    : {
                        disconnect: true,
                    },
            },
        });
    }
    async getEmailNotifications(userId) {
        return this._user.model.user.findUnique({
            where: {
                id: userId,
            },
            select: {
                sendSuccessEmails: true,
                sendFailureEmails: true,
                sendStreakEmails: true,
            },
        });
    }
    async updateEmailNotifications(userId, body) {
        await this._user.model.user.update({
            where: {
                id: userId,
            },
            data: {
                sendSuccessEmails: body.sendSuccessEmails,
                sendFailureEmails: body.sendFailureEmails,
                sendStreakEmails: body.sendStreakEmails,
            },
        });
    }
    async orgHasPlatformSuperAdmin(orgId) {
        const found = await this._user.model.user.findFirst({
            where: {
                isSuperAdmin: true,
                organizations: {
                    some: {
                        organizationId: orgId,
                        disabled: false,
                    },
                },
            },
            select: { id: true },
        });
        return !!found;
    }
    listUsersForPlatformAdmin(take) {
        return this._user.model.user.findMany({
            take,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                email: true,
                name: true,
                providerName: true,
                activated: true,
                isSuperAdmin: true,
                createdAt: true,
                organizations: {
                    where: { disabled: false },
                    select: {
                        role: true,
                        organization: {
                            select: {
                                id: true,
                                name: true,
                                subscription: {
                                    where: { deletedAt: null },
                                    select: {
                                        subscriptionTier: true,
                                        period: true,
                                        cancelAt: true,
                                        isLifetime: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
    }
};
exports.UsersRepository = UsersRepository;
exports.UsersRepository = UsersRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [prisma_service_1.PrismaRepository])
], UsersRepository);
//# sourceMappingURL=users.repository.js.map