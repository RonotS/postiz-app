"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const oauth_repository_1 = require("./oauth.repository");
const make_is_1 = require("../../../services/make.is");
const auth_service_1 = require("../../../../../helpers/src/auth/auth.service");
let OAuthService = class OAuthService {
    constructor(_oauthRepository) {
        this._oauthRepository = _oauthRepository;
    }
    async getApp(orgId) {
        const app = await this._oauthRepository.getAppByOrgId(orgId);
        if (!app)
            return false;
        const { clientSecret, ...rest } = app;
        return rest;
    }
    async createApp(orgId, dto) {
        const existing = await this._oauthRepository.getAppByOrgId(orgId);
        if (existing) {
            throw new common_1.HttpException('You can only have one OAuth application per organization', common_1.HttpStatus.BAD_REQUEST);
        }
        const clientId = 'pca_' + (0, make_is_1.makeId)(32);
        const clientSecret = 'pcs_' + (0, make_is_1.makeId)(48);
        const encryptedSecret = auth_service_1.AuthService.fixedEncryption(clientSecret);
        const app = await this._oauthRepository.createApp(orgId, {
            name: dto.name,
            description: dto.description,
            pictureId: dto.pictureId,
            redirectUrl: dto.redirectUrl,
            clientId,
            clientSecret: encryptedSecret,
        });
        return { ...app, clientSecret };
    }
    async updateApp(orgId, dto) {
        return this._oauthRepository.updateApp(orgId, {
            ...(dto.name && { name: dto.name }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.pictureId !== undefined && { pictureId: dto.pictureId }),
            ...(dto.redirectUrl && { redirectUrl: dto.redirectUrl }),
        });
    }
    async deleteApp(orgId) {
        const app = await this._oauthRepository.getAppByOrgId(orgId);
        if (!app) {
            throw new common_1.HttpException('No OAuth app found', common_1.HttpStatus.NOT_FOUND);
        }
        await this._oauthRepository.revokeAllForApp(app.id);
        await this._oauthRepository.deleteApp(orgId);
        return { success: true };
    }
    async rotateSecret(orgId) {
        const app = await this._oauthRepository.getAppByOrgId(orgId);
        if (!app) {
            throw new common_1.HttpException('No OAuth app found', common_1.HttpStatus.NOT_FOUND);
        }
        const newSecret = 'pcs_' + (0, make_is_1.makeId)(48);
        const encrypted = auth_service_1.AuthService.fixedEncryption(newSecret);
        await this._oauthRepository.updateClientSecret(orgId, encrypted);
        return { clientSecret: newSecret };
    }
    async validateAuthorizationRequest(clientId) {
        const app = await this._oauthRepository.getAppByClientId(clientId);
        if (!app) {
            throw new common_1.HttpException('Invalid client_id', common_1.HttpStatus.BAD_REQUEST);
        }
        return app;
    }
    async createAuthorizationCode(oauthAppId, userId, organizationId) {
        const code = (0, make_is_1.makeId)(32);
        const encryptedCode = auth_service_1.AuthService.fixedEncryption(code);
        const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await this._oauthRepository.createAuthorization({
            oauthAppId,
            userId,
            organizationId,
            authorizationCode: encryptedCode,
            codeExpiresAt,
        });
        return code;
    }
    async exchangeCodeForToken(code, clientId, clientSecret) {
        const app = await this._oauthRepository.getAppByClientId(clientId);
        if (!app) {
            throw new common_1.HttpException({ error: 'invalid_client' }, common_1.HttpStatus.UNAUTHORIZED);
        }
        if (app.clientSecret !== auth_service_1.AuthService.fixedEncryption(clientSecret)) {
            throw new common_1.HttpException({ error: 'invalid_client' }, common_1.HttpStatus.UNAUTHORIZED);
        }
        const encryptedCode = auth_service_1.AuthService.fixedEncryption(code);
        const auth = await this._oauthRepository.findByCode(encryptedCode);
        if (!auth || auth.oauthAppId !== app.id) {
            throw new common_1.HttpException({ error: 'invalid_grant' }, common_1.HttpStatus.BAD_REQUEST);
        }
        if (!auth.codeExpiresAt || new Date() > auth.codeExpiresAt) {
            throw new common_1.HttpException({ error: 'invalid_grant', error_description: 'Code has expired' }, common_1.HttpStatus.BAD_REQUEST);
        }
        const token = 'pos_' + (0, make_is_1.makeId)(40);
        const encryptedToken = auth_service_1.AuthService.fixedEncryption(token);
        const { organizationId, organization: { paymentId }, } = await this._oauthRepository.exchangeCodeForToken(auth.id, encryptedToken);
        return {
            id: organizationId,
            cus: paymentId,
            access_token: token,
            token_type: 'bearer',
        };
    }
    async getOrgByOAuthToken(token) {
        const encrypted = auth_service_1.AuthService.fixedEncryption(token);
        return this._oauthRepository.findByAccessToken(encrypted);
    }
    async getApprovedApps(userId) {
        return this._oauthRepository.getApprovedApps(userId);
    }
    async revokeApp(userId, authId) {
        await this._oauthRepository.revokeAuthorization(userId, authId);
        return { success: true };
    }
};
exports.OAuthService = OAuthService;
exports.OAuthService = OAuthService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [oauth_repository_1.OAuthRepository])
], OAuthService);
//# sourceMappingURL=oauth.service.js.map