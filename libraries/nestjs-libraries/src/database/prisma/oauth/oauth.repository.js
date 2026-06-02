"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthRepository = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let OAuthRepository = class OAuthRepository {
    constructor(_oauthApp, _oauthAuth) {
        this._oauthApp = _oauthApp;
        this._oauthAuth = _oauthAuth;
    }
    getAppByOrgId(orgId) {
        return this._oauthApp.model.oAuthApp.findFirst({
            where: {
                organizationId: orgId,
                deletedAt: null,
            },
            include: {
                picture: true,
            },
        });
    }
    getAppByClientId(clientId) {
        return this._oauthApp.model.oAuthApp.findFirst({
            where: {
                clientId,
                deletedAt: null,
            },
            include: {
                picture: true,
            },
        });
    }
    createApp(orgId, data) {
        return this._oauthApp.model.oAuthApp.create({
            data: {
                organizationId: orgId,
                name: data.name,
                description: data.description,
                pictureId: data.pictureId,
                redirectUrl: data.redirectUrl,
                clientId: data.clientId,
                clientSecret: data.clientSecret,
            },
            include: {
                picture: true,
            },
        });
    }
    async updateApp(orgId, data) {
        const app = await this._oauthApp.model.oAuthApp.findFirst({
            where: {
                organizationId: orgId,
                deletedAt: null,
            },
        });
        if (!app) {
            return null;
        }
        return this._oauthApp.model.oAuthApp.update({
            where: { id: app.id },
            data,
            include: {
                picture: true,
            },
        });
    }
    async deleteApp(orgId) {
        const app = await this._oauthApp.model.oAuthApp.findFirst({
            where: {
                organizationId: orgId,
                deletedAt: null,
            },
        });
        if (!app) {
            return null;
        }
        return this._oauthApp.model.oAuthApp.update({
            where: { id: app.id },
            data: {
                deletedAt: new Date(),
            },
        });
    }
    async updateClientSecret(orgId, newSecret) {
        const app = await this._oauthApp.model.oAuthApp.findFirst({
            where: {
                organizationId: orgId,
                deletedAt: null,
            },
        });
        if (!app) {
            return null;
        }
        return this._oauthApp.model.oAuthApp.update({
            where: { id: app.id },
            data: {
                clientSecret: newSecret,
            },
        });
    }
    createAuthorization(data) {
        return this._oauthAuth.model.oAuthAuthorization.upsert({
            where: {
                oauthAppId_userId_organizationId: {
                    oauthAppId: data.oauthAppId,
                    userId: data.userId,
                    organizationId: data.organizationId,
                },
            },
            create: {
                oauthAppId: data.oauthAppId,
                userId: data.userId,
                organizationId: data.organizationId,
                authorizationCode: data.authorizationCode,
                codeExpiresAt: data.codeExpiresAt,
            },
            update: {
                authorizationCode: data.authorizationCode,
                codeExpiresAt: data.codeExpiresAt,
                accessToken: null,
                revokedAt: null,
            },
        });
    }
    findByCode(encryptedCode) {
        return this._oauthAuth.model.oAuthAuthorization.findFirst({
            where: {
                authorizationCode: encryptedCode,
                revokedAt: null,
            },
        });
    }
    exchangeCodeForToken(id, encryptedToken) {
        return this._oauthAuth.model.oAuthAuthorization.update({
            where: { id },
            select: {
                organizationId: true,
                organization: {
                    select: {
                        paymentId: true,
                    }
                }
            },
            data: {
                accessToken: encryptedToken,
                authorizationCode: null,
                codeExpiresAt: null,
            },
        });
    }
    findByAccessToken(encryptedToken) {
        return this._oauthAuth.model.oAuthAuthorization.findFirst({
            where: {
                accessToken: encryptedToken,
                revokedAt: null,
            },
            include: {
                organization: {
                    include: {
                        subscription: {
                            select: {
                                subscriptionTier: true,
                                totalChannels: true,
                                isLifetime: true,
                            },
                        },
                    },
                },
                user: {
                    select: { id: true },
                },
            },
        });
    }
    getApprovedApps(userId) {
        return this._oauthAuth.model.oAuthAuthorization.findMany({
            where: {
                userId,
                revokedAt: null,
                accessToken: { not: null },
            },
            include: {
                oauthApp: {
                    include: {
                        picture: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    revokeAuthorization(userId, authId) {
        return this._oauthAuth.model.oAuthAuthorization.update({
            where: {
                id: authId,
                userId,
            },
            data: {
                revokedAt: new Date(),
            },
        });
    }
    revokeAllForApp(oauthAppId) {
        return this._oauthAuth.model.oAuthAuthorization.updateMany({
            where: {
                oauthAppId,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
            },
        });
    }
};
exports.OAuthRepository = OAuthRepository;
exports.OAuthRepository = OAuthRepository = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [prisma_service_1.PrismaRepository,
        prisma_service_1.PrismaRepository])
], OAuthRepository);
//# sourceMappingURL=oauth.repository.js.map