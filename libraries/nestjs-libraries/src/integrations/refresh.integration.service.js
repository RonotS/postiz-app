"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshIntegrationService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const integration_manager_1 = require("./integration.manager");
const integration_service_1 = require("../database/prisma/integrations/integration.service");
const nestjs_temporal_core_1 = require("nestjs-temporal-core");
let RefreshIntegrationService = class RefreshIntegrationService {
    constructor(_integrationManager, _integrationService, _temporalService) {
        this._integrationManager = _integrationManager;
        this._integrationService = _integrationService;
        this._temporalService = _temporalService;
    }
    async refresh(integration, cause = '') {
        const socialProvider = this._integrationManager.getSocialIntegration(integration.providerIdentifier);
        const refresh = await this.refreshProcess(integration, socialProvider, cause);
        if (!refresh) {
            return false;
        }
        await this._integrationService.createOrUpdateIntegration(undefined, !!socialProvider.oneTimeToken, integration.organizationId, integration.name, integration.picture, 'social', integration.internalId, integration.providerIdentifier, refresh.accessToken, refresh.refreshToken, refresh.expiresIn);
        return refresh;
    }
    async setBetweenSteps(integration, cause = '') {
        await this._integrationService.setBetweenRefreshSteps(integration.id);
        await this._integrationService.informAboutRefreshError(integration.organizationId, integration, cause);
    }
    async startRefreshWorkflow(orgId, id, integration) {
        if (!integration.refreshCron) {
            return false;
        }
        return this._temporalService.client
            .getRawClient()
            ?.workflow.start(`refreshTokenWorkflow`, {
            workflowId: `refresh_${id}`,
            args: [{ integrationId: id, organizationId: orgId }],
            taskQueue: 'main',
            workflowIdConflictPolicy: 'TERMINATE_EXISTING',
        });
    }
    async refreshProcess(integration, socialProvider, cause = '') {
        const refresh = await socialProvider
            .refreshToken(integration.refreshToken)
            .catch((err) => false);
        if (!refresh || !refresh.accessToken) {
            await this._integrationService.refreshNeeded(integration.organizationId, integration.id);
            await this._integrationService.informAboutRefreshError(integration.organizationId, integration, cause);
            await this._integrationService.disconnectChannel(integration.organizationId, integration);
            return false;
        }
        if (!socialProvider.reConnect ||
            integration.rootInternalId === integration.internalId) {
            return refresh;
        }
        const reConnect = await socialProvider.reConnect(integration.rootInternalId, integration.internalId, refresh.accessToken);
        return {
            ...refresh,
            ...reConnect,
        };
    }
};
exports.RefreshIntegrationService = RefreshIntegrationService;
exports.RefreshIntegrationService = RefreshIntegrationService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => integration_service_1.IntegrationService))),
    tslib_1.__metadata("design:paramtypes", [integration_manager_1.IntegrationManager,
        integration_service_1.IntegrationService,
        nestjs_temporal_core_1.TemporalService])
], RefreshIntegrationService);
//# sourceMappingURL=refresh.integration.service.js.map