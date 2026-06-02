"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const pricing_1 = require("./pricing");
const subscription_repository_1 = require("./subscription.repository");
const integration_service_1 = require("../integrations/integration.service");
const organization_service_1 = require("../organizations/organization.service");
const dayjs_1 = tslib_1.__importDefault(require("dayjs"));
const make_is_1 = require("../../../services/make.is");
let SubscriptionService = class SubscriptionService {
    constructor(_subscriptionRepository, _integrationService, _organizationService) {
        this._subscriptionRepository = _subscriptionRepository;
        this._integrationService = _integrationService;
        this._organizationService = _organizationService;
    }
    getSubscriptionByOrganizationId(organizationId) {
        return this._subscriptionRepository.getSubscriptionByOrganizationId(organizationId);
    }
    useCredit(organization, type = 'ai_images', func) {
        return this._subscriptionRepository.useCredit(organization, type, func);
    }
    getCode(code) {
        return this._subscriptionRepository.getCode(code);
    }
    async deleteSubscription(customerId) {
        await this.modifySubscription(customerId, pricing_1.pricing.FREE.channel || 0, 'FREE');
        return this._subscriptionRepository.deleteSubscriptionByCustomerId(customerId);
    }
    updateCustomerId(organizationId, customerId) {
        return this._subscriptionRepository.updateCustomerId(organizationId, customerId);
    }
    async checkSubscription(organizationId, subscriptionId) {
        return await this._subscriptionRepository.checkSubscription(organizationId, subscriptionId);
    }
    async modifySubscriptionByOrg(organizationId, totalChannels, billing) {
        if (!organizationId) {
            return false;
        }
        const getCurrentSubscription = (await this._subscriptionRepository.getSubscriptionByOrgId(organizationId));
        const from = pricing_1.pricing[getCurrentSubscription?.subscriptionTier || 'FREE'];
        const to = pricing_1.pricing[billing];
        const currentTotalChannels = (await this._integrationService.getIntegrationsList(organizationId)).filter((f) => !f.disabled);
        if (currentTotalChannels.length > totalChannels) {
            await this._integrationService.disableIntegrations(organizationId, currentTotalChannels.length - totalChannels);
        }
        if (from.team_members && !to.team_members) {
            await this._organizationService.disableOrEnableNonSuperAdminUsers(organizationId, true);
        }
        if (!from.team_members && to.team_members) {
            await this._organizationService.disableOrEnableNonSuperAdminUsers(organizationId, false);
        }
        if (billing === 'FREE') {
            await this._integrationService.changeActiveCron(organizationId);
        }
        return true;
    }
    async modifySubscription(customerId, totalChannels, billing) {
        if (!customerId) {
            return false;
        }
        const getOrgByCustomerId = await this._subscriptionRepository.getOrganizationByCustomerId(customerId);
        const getCurrentSubscription = (await this._subscriptionRepository.getSubscriptionByCustomerId(customerId));
        if (!getOrgByCustomerId ||
            (getCurrentSubscription && getCurrentSubscription?.isLifetime)) {
            return false;
        }
        const from = pricing_1.pricing[getCurrentSubscription?.subscriptionTier || 'FREE'];
        const to = pricing_1.pricing[billing];
        const currentTotalChannels = (await this._integrationService.getIntegrationsList(getOrgByCustomerId?.id)).filter((f) => !f.disabled);
        if (currentTotalChannels.length > totalChannels) {
            await this._integrationService.disableIntegrations(getOrgByCustomerId?.id, currentTotalChannels.length - totalChannels);
        }
        if (from.team_members && !to.team_members) {
            await this._organizationService.disableOrEnableNonSuperAdminUsers(getOrgByCustomerId?.id, true);
        }
        if (!from.team_members && to.team_members) {
            await this._organizationService.disableOrEnableNonSuperAdminUsers(getOrgByCustomerId?.id, false);
        }
        if (billing === 'FREE') {
            await this._integrationService.changeActiveCron(getOrgByCustomerId?.id);
        }
        return true;
    }
    async createOrUpdateSubscription(isTrailing, identifier, customerId, totalChannels, billing, period, cancelAt, code, org) {
        if (!code) {
            try {
                const load = await this.modifySubscription(customerId, totalChannels, billing);
                if (!load) {
                    return {};
                }
            }
            catch (e) {
                return {};
            }
        }
        return this._subscriptionRepository.createOrUpdateSubscription(isTrailing, identifier, customerId, totalChannels, billing, period, cancelAt, code, org ? { id: org } : undefined);
    }
    getSubscriptionByIdentifier(identifier) {
        return this._subscriptionRepository.getSubscriptionByIdentifier(identifier);
    }
    async getSubscription(organizationId) {
        return this._subscriptionRepository.getSubscription(organizationId);
    }
    async checkCredits(organization, checkType = 'ai_images') {
        // @ts-ignore
        const type = organization?.subscription?.subscriptionTier || 'FREE';
        if (type === 'FREE') {
            return { credits: 0 };
        }
        // @ts-ignore
        let date = (0, dayjs_1.default)(organization.subscription.createdAt);
        while (date.isBefore((0, dayjs_1.default)())) {
            date = date.add(1, 'month');
        }
        const checkFromMonth = date.subtract(1, 'month');
        const imageGenerationCount = checkType === 'ai_images'
            ? pricing_1.pricing[type].image_generation_count
            : pricing_1.pricing[type].generate_videos;
        const totalUse = await this._subscriptionRepository.getCreditsFrom(organization.id, checkFromMonth, checkType);
        return {
            credits: imageGenerationCount - totalUse,
        };
    }
    async lifeTime(orgId, identifier, subscription) {
        return this.createOrUpdateSubscription(false, identifier, identifier, pricing_1.pricing[subscription].channel, subscription, 'YEARLY', null, identifier, orgId);
    }
    async addSubscription(orgId, userId, subscription) {
        await this._subscriptionRepository.setCustomerId(orgId, userId);
        return this.createOrUpdateSubscription(false, (0, make_is_1.makeId)(5), userId, pricing_1.pricing[subscription].channel, subscription, 'MONTHLY', null, undefined, orgId);
    }
    /**
     * Platform admin: set an organization's tier without Stripe (comp / support).
     * Does not cancel an existing Stripe subscription — use billing admin for that.
     */
    async adminSetOrganizationSubscription(organizationId, tier, period = 'MONTHLY') {
        const channels = pricing_1.pricing[tier].channel ?? 0;
        await this.modifySubscriptionByOrg(organizationId, channels, tier);
        if (tier === 'FREE') {
            await this._subscriptionRepository.softDeleteSubscriptionsForOrganization(organizationId);
            return { organizationId, tier, period: null };
        }
        const customerRow = await this._subscriptionRepository.getCustomerIdByOrgId(organizationId);
        const customerId = customerRow?.paymentId?.trim() || `admin_${organizationId}`;
        if (!customerRow?.paymentId) {
            await this._subscriptionRepository.updateCustomerId(organizationId, customerId);
        }
        await this.createOrUpdateSubscription(false, `admin_${organizationId}`, customerId, channels, tier, period, null, undefined, organizationId);
        return { organizationId, tier, period };
    }
};
exports.SubscriptionService = SubscriptionService;
exports.SubscriptionService = SubscriptionService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [subscription_repository_1.SubscriptionRepository,
        integration_service_1.IntegrationService,
        organization_service_1.OrganizationService])
], SubscriptionService);
//# sourceMappingURL=subscription.service.js.map