"use strict";
var XquikEngagementPollerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XquikEngagementPollerService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const integration_service_1 = require("../../database/prisma/integrations/integration.service");
const xquik_env_1 = require("../../../../helpers/src/x/xquik.env");
const tweetstream_env_1 = require("../../../../helpers/src/x/tweetstream.env");
const xquik_api_1 = require("./xquik.api");
const integration_repository_1 = require("../../database/prisma/integrations/integration.repository");
const x_follower_dm_constants_1 = require("../../temporal/x.follower.dm.constants");
/**
 * Fast engagement polling via Xquik read APIs (replies/likes/RT/followers).
 * Runs on backend when X_DISABLE_ENGAGEMENT_POLLING would otherwise stop Temporal pollers.
 */
let XquikEngagementPollerService = XquikEngagementPollerService_1 = class XquikEngagementPollerService {
    constructor(_integrationService, _integrationRepository) {
        this._integrationService = _integrationService;
        this._integrationRepository = _integrationRepository;
        this.log = new common_1.Logger(XquikEngagementPollerService_1.name);
    }
    async onModuleInit() {
        if (!(0, xquik_env_1.isXquikEngagementPollerEnabled)() || !(0, tweetstream_env_1.isPostizBackendWorker)()) {
            return;
        }
        const engagementMs = (0, xquik_env_1.getXquikEngagementPollIntervalMs)();
        const followerMs = (0, xquik_env_1.getXquikFollowersPollIntervalMs)();
        this.log.log(`Xquik engagement poller starting (engagement=${engagementMs}ms, followers=${followerMs}ms)`);
        void this.syncMonitors().catch((err) => this.log.error('Xquik initial monitor sync failed:', err));
        void this.syncWebhook().catch((err) => this.log.error('Xquik webhook sync failed:', err));
        void this.runEngagementTick().catch((err) => this.log.error('Xquik engagement tick failed:', err));
        this.engagementTimer = setInterval(() => {
            void this.runEngagementTick().catch((err) => this.log.error('Xquik engagement tick failed:', err));
        }, engagementMs);
        void this.runFollowerTick().catch((err) => this.log.error('Xquik follower tick failed:', err));
        this.followerTimer = setInterval(() => {
            void this.runFollowerTick().catch((err) => this.log.error('Xquik follower tick failed:', err));
        }, followerMs);
    }
    onModuleDestroy() {
        if (this.engagementTimer) {
            clearInterval(this.engagementTimer);
        }
        if (this.followerTimer) {
            clearInterval(this.followerTimer);
        }
    }
    async syncWebhook() {
        if (!(0, xquik_env_1.isXquikWebhookAutoRegisterEnabled)()) {
            const url = (0, xquik_env_1.getXquikWebhookUrl)();
            if (!url) {
                this.log.warn('Xquik webhooks: set XQUIK_WEBHOOK_URL to your public HTTPS URL (e.g. ngrok …/api/x/xquik/webhook) to auto-register, or create POST https://xquik.com/api/v1/webhooks manually');
            }
            return;
        }
        const targetUrl = (0, xquik_env_1.getXquikWebhookUrl)();
        const client = new xquik_api_1.XquikApiClient();
        const { webhook, created } = await client.ensureWebhook(targetUrl);
        if (!webhook.id) {
            this.log.warn('Xquik webhook sync: no webhook id in response');
            return;
        }
        if (created) {
            this.log.warn(`Xquik webhook CREATED id=${webhook.id} url=${targetUrl} — copy the new secret into XQUIK_WEBHOOK_SECRET in .env (shown once by Xquik; restart backend after)`);
            if (webhook.secret && !(0, xquik_env_1.getXquikWebhookSecret)()) {
                this.log.warn(`Xquik webhook secret (save to .env): ${webhook.secret}`);
            }
        }
        else {
            this.log.log(`Xquik webhook ready id=${webhook.id} url=${webhook.url ?? targetUrl}`);
        }
        if ((0, xquik_env_1.getXquikWebhookSecret)()) {
            try {
                await client.testWebhook(webhook.id);
                this.log.log(`Xquik webhook test sent to id=${webhook.id}`);
            }
            catch (err) {
                this.log.warn(`Xquik webhook test failed for id=${webhook.id} (check ngrok + XQUIK_WEBHOOK_SECRET):`, err);
            }
        }
        else {
            this.log.warn(`Xquik webhook id=${webhook.id} — set XQUIK_WEBHOOK_SECRET then restart to verify signatures`);
        }
    }
    async syncMonitors() {
        const rows = await this._integrationRepository.listXIntegrationsForTweetStreamSync();
        const client = new xquik_api_1.XquikApiClient();
        for (const row of rows) {
            const handle = row.profile?.trim();
            if (!handle)
                continue;
            try {
                const monitor = await client.ensureAccountMonitor(handle);
                if (monitor?.id) {
                    this.log.log(`Xquik monitor ready @${handle} id=${monitor.id} events=${(monitor.eventTypes ?? []).join(',')}`);
                }
            }
            catch (err) {
                this.log.warn(`Xquik monitor sync failed for @${handle}:`, err);
            }
        }
    }
    async runEngagementTick() {
        const rows = await this._integrationRepository.listXIntegrationsWithActiveEngagementPlugs();
        for (const row of rows) {
            try {
                await this._integrationService.runXEngagementPollerTick(row.organizationId, row.integrationId);
            }
            catch (err) {
                this.log.error(`Xquik engagement tick integration=${row.integrationId}:`, err);
            }
        }
    }
    async runFollowerTick() {
        const plugs = await this._integrationRepository.listActiveFollowerDmPlugs();
        for (const plug of plugs) {
            try {
                await this._integrationService.processPlugs({
                    plugId: plug.id,
                    postId: x_follower_dm_constants_1.X_FOLLOWER_DM_POLL_RELEASE_ID,
                    delay: 0,
                    totalRuns: 1,
                    currentRun: 1,
                });
            }
            catch (err) {
                this.log.error(`Xquik follower tick integration=${plug.integrationId}:`, err);
            }
        }
    }
};
exports.XquikEngagementPollerService = XquikEngagementPollerService;
exports.XquikEngagementPollerService = XquikEngagementPollerService = XquikEngagementPollerService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [integration_service_1.IntegrationService,
        integration_repository_1.IntegrationRepository])
], XquikEngagementPollerService);
//# sourceMappingURL=xquik.engagement.poller.service.js.map