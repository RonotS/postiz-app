"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const integration_repository_1 = require("./integration.repository");
const integration_manager_1 = require("../../../integrations/integration.manager");
const notification_service_1 = require("../notifications/notification.service");
const dayjs_1 = tslib_1.__importDefault(require("dayjs"));
const timer_1 = require("../../../../../helpers/src/utils/timer");
const stripe_billing_env_1 = require("../../../../../helpers/src/stripe/stripe.billing.env");
const redis_service_1 = require("../../../redis/redis.service");
const social_abstract_1 = require("../../../integrations/social.abstract");
const upload_factory_1 = require("../../../upload/upload.factory");
const lodash_1 = require("lodash");
const utc_1 = tslib_1.__importDefault(require("dayjs/plugin/utc"));
const autopost_repository_1 = require("../autopost/autopost.repository");
const refresh_integration_service_1 = require("../../../integrations/refresh.integration.service");
const nestjs_temporal_core_1 = require("nestjs-temporal-core");
const x_follower_dm_constants_1 = require("../../../temporal/x.follower.dm.constants");
const x_poller_tick_guard_1 = require("../../../integrations/social/x-poller-tick.guard");
const x_poll_interval_env_1 = require("../../../../../helpers/src/x/x.poll-interval.env");
const x_plug_batch_rate_limit_1 = require("../../../integrations/social/x-plug-batch-rate-limit");
const xquik_env_1 = require("../../../../../helpers/src/x/xquik.env");
const x_plug_batch_rate_limit_store_1 = require("../../../integrations/social/x-plug-batch-rate-limit.store");
const tweetstream_env_1 = require("../../../../../helpers/src/x/tweetstream.env");
const tweetstream_ws_state_1 = require("../../../integrations/social/tweetstream.ws-state");
const x_account_activity_service_1 = require("../../../integrations/social/x.account-activity.service");
const x_account_activity_handler_1 = require("../../../integrations/social/x.account-activity.handler");
const x_provider_1 = require("../../../integrations/social/x.provider");
const x_follow_rate_limit_1 = require("../../../integrations/social/x-follow-rate-limit");
const x_follow_rate_limit_store_1 = require("../../../integrations/social/x-follow-rate-limit.store");
const x_follow_queue_store_1 = require("../../../integrations/social/x-follow-queue.store");
const x_account_activity_env_1 = require("../../../../../helpers/src/x/x.account-activity.env");
const x_realtime_env_1 = require("../../../../../helpers/src/x/x.realtime.env");
const tweetstream_env_2 = require("../../../../../helpers/src/x/tweetstream.env");
const tweetstream_service_1 = require("../../../integrations/social/tweetstream.service");
dayjs_1.default.extend(utc_1.default);
let IntegrationService = class IntegrationService {
    constructor(_integrationRepository, _autopostsRepository, _integrationManager, _notificationService, _refreshIntegrationService, _temporalService, _xAccountActivity, _xAccountActivityHandler, _tweetStream) {
        this._integrationRepository = _integrationRepository;
        this._autopostsRepository = _autopostsRepository;
        this._integrationManager = _integrationManager;
        this._notificationService = _notificationService;
        this._refreshIntegrationService = _refreshIntegrationService;
        this._temporalService = _temporalService;
        this._xAccountActivity = _xAccountActivity;
        this._xAccountActivityHandler = _xAccountActivityHandler;
        this._tweetStream = _tweetStream;
        this.storage = upload_factory_1.UploadFactory.createStorage();
    }
    async onModuleInit() {
        if (process.env.RUN_CRON && (0, tweetstream_env_2.isPostizBackendWorker)()) {
            void this.bootstrapXPlugPollersWhenTemporalReady().catch((err) => console.error('bootstrapXPlugPollers:', err));
        }
        if (!(0, tweetstream_env_2.isPostizBackendWorker)()) {
            return;
        }
        const queueIntervalMs = Math.max(15_000, Number(process.env.X_FOLLOW_QUEUE_POLL_MS) || 60_000);
        const runFollowQueueWorker = () => {
            void this.processAllPendingXFollowQueues().catch((err) => console.error('[x-follow-queue] worker tick failed:', err));
        };
        console.log(`[x-follow-queue] worker started (poll every ${queueIntervalMs}ms, file=${process.env.X_FOLLOW_QUEUE_FILE?.trim() || '.data/x-follow-queue.json'})`);
        runFollowQueueWorker();
        setInterval(runFollowQueueWorker, queueIntervalMs);
    }
    async changeActiveCron(orgId) {
        const data = await this._autopostsRepository.getAutoposts(orgId);
        for (const item of data.filter((f) => f.active)) {
            try {
                await this._temporalService.terminateWorkflow(`autopost-${item.id}`);
            }
            catch (err) { }
        }
        return true;
    }
    getMentions(platform, q) {
        return this._integrationRepository.getMentions(platform, q);
    }
    insertMentions(platform, mentions) {
        return this._integrationRepository.insertMentions(platform, mentions);
    }
    async setTimes(orgId, integrationId, times) {
        return this._integrationRepository.setTimes(orgId, integrationId, times);
    }
    updateProviderSettings(org, id, additionalSettings) {
        return this._integrationRepository.updateProviderSettings(org, id, additionalSettings);
    }
    checkPreviousConnections(org, id) {
        return this._integrationRepository.checkPreviousConnections(org, id);
    }
    async createOrUpdateIntegration(additionalSettings, oneTimeToken, org, name, picture, type, internalId, provider, token, refreshToken = '', expiresIn, username, isBetweenSteps = false, refresh, timezone, customInstanceDetails) {
        const uploadedPicture = picture
            ? picture?.indexOf('imagedelivery.net') > -1
                ? picture
                : await this.storage.uploadSimple(picture)
            : undefined;
        const row = await this._integrationRepository.createOrUpdateIntegration(additionalSettings, oneTimeToken, org, name, uploadedPicture, type, internalId, provider, token, refreshToken, expiresIn, username, isBetweenSteps, refresh, timezone, customInstanceDetails);
        if (provider === 'x') {
            void this.syncXAccountActivitySubscription(row).catch((err) => console.error('syncXAccountActivitySubscription:', err));
            void this.syncTweetStreamForIntegration(row).catch((err) => console.error('syncTweetStreamForIntegration:', err));
        }
        return row;
    }
    updateIntegrationGroup(org, id, group) {
        return this._integrationRepository.updateIntegrationGroup(org, id, group);
    }
    updateOnCustomerName(org, id, name) {
        return this._integrationRepository.updateOnCustomerName(org, id, name);
    }
    getIntegrationsList(org) {
        return this._integrationRepository.getIntegrationsList(org);
    }
    getIntegrationForOrder(id, order, user, org) {
        return this._integrationRepository.getIntegrationForOrder(id, order, user, org);
    }
    updateNameAndUrl(id, name, url) {
        return this._integrationRepository.updateNameAndUrl(id, name, url);
    }
    getIntegrationById(org, id) {
        return this._integrationRepository.getIntegrationById(org, id);
    }
    /** Per-tweet count of recorded auto-DM engager sends (dedup store). */
    countAutoDmEngagersByTweetIds(integrationId, tweetIds) {
        return this._integrationRepository.countAutoDmEngagersByTweetIds(integrationId, tweetIds);
    }
    async refreshToken(provider, refresh) {
        try {
            const { refreshToken, accessToken, expiresIn } = await provider.refreshToken(refresh);
            if (!refreshToken || !accessToken || !expiresIn) {
                return false;
            }
            return { refreshToken, accessToken, expiresIn };
        }
        catch (e) {
            return false;
        }
    }
    async disconnectChannel(orgId, integration) {
        if (integration.providerIdentifier === 'x') {
            void this.unsyncXAccountActivitySubscription(integration).catch((err) => console.error('unsyncXAccountActivitySubscription:', err));
            void this.syncTweetStreamMonitoredAccounts().catch((err) => console.error('syncTweetStreamMonitoredAccounts:', err));
        }
        await this._integrationRepository.disconnectChannel(orgId, integration.id);
        await this.informAboutRefreshError(orgId, integration);
    }
    /** Inbound X Account Activity webhook payload (CRC + events). */
    async handleXAccountActivityPayload(payload) {
        return this._xAccountActivityHandler.handlePayload(payload);
    }
    /** Inbound Xquik webhook payload (monitor events). */
    async handleXquikPayload(payload) {
        return this._xAccountActivityHandler.handleXquikPayload(payload);
    }
    /**
     * Run engagement plugs immediately for published tweet ids (likes/RTs are poller-first;
     * this reduces delay right after tweet.new or when a retweet hints at new engagers).
     */
    async runImmediateEngagementPollForReleaseIds(releaseIds) {
        const seen = new Set();
        for (const releaseId of releaseIds) {
            const id = String(releaseId ?? '').trim();
            if (!id || seen.has(id)) {
                continue;
            }
            seen.add(id);
            const channels = await this._integrationRepository.findXChannelsByPostReleaseId(id);
            for (const ch of channels) {
                if (!ch?.id || !ch.organizationId) {
                    continue;
                }
                try {
                    await this.runEngagementPlugsForReleaseId(ch.organizationId, ch.id, id);
                }
                catch (err) {
                    console.error(`Xquik immediate engagement poll failed release=${id} integration=${ch.id}:`, err);
                }
            }
        }
    }
    async syncXAccountActivitySubscription(integration) {
        if (integration.providerIdentifier !== 'x' ||
            !this._xAccountActivity.isEnabled() ||
            !(0, x_realtime_env_1.shouldSyncXAccountActivitySubscriptions)()) {
            return;
        }
        const webhookId = await this._xAccountActivity.ensureWebhookRegistered();
        if (!webhookId) {
            return;
        }
        const ok = await this._xAccountActivity.subscribeUser(integration.token, webhookId);
        if (ok) {
            await redis_service_1.ioRedis.set((0, x_account_activity_env_1.getXAccountActivityRedisSubscribedKey)(integration.id), '1', 'EX', 60 * 60 * 24 * 365);
        }
    }
    async unsyncXAccountActivitySubscription(integration) {
        if (integration.providerIdentifier !== 'x') {
            return;
        }
        const webhookId = await this._xAccountActivity.getStoredWebhookId();
        if (!webhookId || !integration.internalId) {
            return;
        }
        await this._xAccountActivity.unsubscribeUser(integration.token, webhookId, integration.internalId);
        await redis_service_1.ioRedis.del((0, x_account_activity_env_1.getXAccountActivityRedisSubscribedKey)(integration.id));
    }
    async syncXAccountActivityForIntegrationId(orgId, integrationId) {
        const integration = await this._integrationRepository.getIntegrationById(orgId, integrationId);
        if (integration) {
            await this.syncXAccountActivitySubscription(integration);
        }
    }
    async syncTweetStreamMonitoredAccounts() {
        if (!this._tweetStream.isEnabled()) {
            return { desired: [] };
        }
        return this._tweetStream.syncMonitoredAccounts();
    }
    async getTweetStreamStatus() {
        return this._tweetStream.getStatus();
    }
    async listTweetStreamRecentEvents(limit) {
        return this._tweetStream.listRecentEvents(limit);
    }
    async clearTweetStreamRecentEvents() {
        return this._tweetStream.clearRecentEvents();
    }
    async syncTweetStreamForIntegration(integration) {
        if (integration.providerIdentifier !== 'x' || !integration.profile?.trim()) {
            return;
        }
        await this.syncTweetStreamMonitoredAccounts();
    }
    async informAboutRefreshError(orgId, integration, err = '') {
        await this._notificationService.inAppNotification(orgId, `Could not refresh your ${integration.providerIdentifier} channel ${err}`, `Could not refresh your ${integration.providerIdentifier} channel ${err}. Please go back to the system and connect it again ${process.env.FRONTEND_URL}/launches`, true, false, 'info');
    }
    async refreshNeeded(org, id) {
        return this._integrationRepository.refreshNeeded(org, id);
    }
    async setBetweenRefreshSteps(id) {
        return this._integrationRepository.setBetweenRefreshSteps(id);
    }
    async refreshTokens() {
        const integrations = await this._integrationRepository.needsToBeRefreshed();
        for (const integration of integrations) {
            const provider = this._integrationManager.getSocialIntegration(integration.providerIdentifier);
            const data = await this.refreshToken(provider, integration.refreshToken);
            if (!data) {
                await this.informAboutRefreshError(integration.organizationId, integration);
                await this._integrationRepository.refreshNeeded(integration.organizationId, integration.id);
                return;
            }
            const { refreshToken, accessToken, expiresIn } = data;
            await this.createOrUpdateIntegration(undefined, !!provider.oneTimeToken, integration.organizationId, integration.name, undefined, 'social', integration.internalId, integration.providerIdentifier, accessToken, refreshToken, expiresIn);
        }
    }
    async disableChannel(org, id) {
        return this._integrationRepository.disableChannel(org, id);
    }
    async enableChannel(org, totalChannels, id) {
        const integrations = (await this._integrationRepository.getIntegrationsList(org)).filter((f) => !f.disabled);
        if ((0, stripe_billing_env_1.isStripeBillingEnabled)() &&
            integrations.length >= totalChannels) {
            throw new Error('You have reached the maximum number of channels');
        }
        return this._integrationRepository.enableChannel(org, id);
    }
    async getPostsForChannel(org, id) {
        return this._integrationRepository.getPostsForChannel(org, id);
    }
    async deleteChannel(org, id) {
        return this._integrationRepository.deleteChannel(org, id);
    }
    async disableIntegrations(org, totalChannels) {
        return this._integrationRepository.disableIntegrations(org, totalChannels);
    }
    async checkForDeletedOnceAndUpdate(org, page) {
        return this._integrationRepository.checkForDeletedOnceAndUpdate(org, page);
    }
    async saveProviderPage(org, id, data) {
        const getIntegration = await this._integrationRepository.getIntegrationById(org, id);
        if (!getIntegration) {
            throw new common_1.HttpException('Integration not found', common_1.HttpStatus.NOT_FOUND);
        }
        if (!getIntegration.inBetweenSteps) {
            throw new common_1.HttpException('Invalid request', common_1.HttpStatus.BAD_REQUEST);
        }
        const provider = this._integrationManager.getSocialIntegration(getIntegration.providerIdentifier);
        if (!provider.fetchPageInformation) {
            throw new common_1.HttpException('Provider does not support page selection', common_1.HttpStatus.BAD_REQUEST);
        }
        const getIntegrationInformation = await provider.fetchPageInformation(getIntegration.token, data);
        await this.checkForDeletedOnceAndUpdate(org, String(getIntegrationInformation.id));
        await this._integrationRepository.updateIntegration(id, {
            picture: getIntegrationInformation.picture,
            internalId: String(getIntegrationInformation.id),
            organizationId: org,
            name: getIntegrationInformation.name,
            inBetweenSteps: false,
            token: getIntegrationInformation.access_token,
            profile: getIntegrationInformation.username,
        });
        return { success: true };
    }
    async checkAnalytics(org, integration, date, forceRefresh = false) {
        const getIntegration = await this.getIntegrationById(org.id, integration);
        if (!getIntegration) {
            throw new Error('Invalid integration');
        }
        if (getIntegration.type !== 'social') {
            return [];
        }
        const integrationProvider = this._integrationManager.getSocialIntegration(getIntegration.providerIdentifier);
        if ((0, dayjs_1.default)(getIntegration?.tokenExpiration).isBefore((0, dayjs_1.default)()) ||
            forceRefresh) {
            const data = await this._refreshIntegrationService.refresh(getIntegration);
            if (!data) {
                return [];
            }
            const { accessToken } = data;
            if (accessToken) {
                getIntegration.token = accessToken;
                if (integrationProvider.refreshWait) {
                    await (0, timer_1.timer)(10000);
                }
            }
            else {
                await this.disconnectChannel(org.id, getIntegration);
                return [];
            }
        }
        const getIntegrationData = await redis_service_1.ioRedis.get(`integration:${org.id}:${integration}:${date}`);
        if (getIntegrationData) {
            return JSON.parse(getIntegrationData);
        }
        if (integrationProvider.analytics) {
            try {
                const loadAnalytics = await integrationProvider.analytics(getIntegration.internalId, getIntegration.token, +date);
                await redis_service_1.ioRedis.set(`integration:${org.id}:${integration}:${date}`, JSON.stringify(loadAnalytics), 'EX', !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
                    ? 1
                    : 3600);
                return loadAnalytics;
            }
            catch (e) {
                if (e instanceof social_abstract_1.RefreshToken) {
                    return this.checkAnalytics(org, integration, date, true);
                }
            }
        }
        return [];
    }
    customers(orgId) {
        return this._integrationRepository.customers(orgId);
    }
    getPlugsByIntegrationId(org, integrationId) {
        return this._integrationRepository.getPlugsByIntegrationId(org, integrationId);
    }
    async processInternalPlug(data, forceRefresh = false) {
        const originalIntegration = await this._integrationRepository.getIntegrationById(data.orgId, data.originalIntegration);
        const getIntegration = await this._integrationRepository.getIntegrationById(data.orgId, data.integration);
        if (!getIntegration || !originalIntegration) {
            return;
        }
        const getAllInternalPlugs = this._integrationManager
            .getInternalPlugs(getIntegration.providerIdentifier)
            .internalPlugs.find((p) => p.identifier === data.plugName);
        if (!getAllInternalPlugs) {
            return;
        }
        const getSocialIntegration = this._integrationManager.getSocialIntegration(getIntegration.providerIdentifier);
        // @ts-ignore
        await getSocialIntegration?.[getAllInternalPlugs.methodName]?.(getIntegration, originalIntegration, data.post, data.information);
        return;
    }
    async processPlugs(data) {
        const getPlugById = await this._integrationRepository.getPlug(data.plugId);
        if (!getPlugById) {
            return true;
        }
        if (getPlugById.integration.providerIdentifier === 'x') {
            const integrationId = getPlugById.integration.id;
            if (data.postId === x_follower_dm_constants_1.X_FOLLOWER_DM_POLL_RELEASE_ID) {
                const intervalMs = (0, x_poll_interval_env_1.resolveXPollIntervalMs)('X_FOLLOWER_DM_POLL_INTERVAL_MS');
                const acquired = await (0, x_poller_tick_guard_1.acquireXPollerTickLock)('follower', integrationId, intervalMs);
                if (!acquired) {
                    return true;
                }
            }
            else if (data.postId === x_follower_dm_constants_1.X_PROFILE_AUTOMATIONS_POLL_RELEASE_ID) {
                const intervalMs = (0, x_poll_interval_env_1.resolveXPollIntervalMs)('X_PROFILE_AUTOMATIONS_POLL_INTERVAL_MS');
                const acquired = await (0, x_poller_tick_guard_1.acquireXPollerTickLock)('profile', integrationId, intervalMs);
                if (!acquired) {
                    return true;
                }
            }
        }
        const integration = this._integrationManager.getSocialIntegration(getPlugById.integration.providerIdentifier);
        // Look up the Postiz post that was published as this tweet (data.postId is
        // the platform-side release ID, e.g. the X tweet ID). Pass its settings
        // JSON to the plug method so plugs can honor per-post overrides
        // (e.g. auto-DM message, target toggles) without breaking older plugs that
        // don't use the parameter.
        let postSettings = undefined;
        try {
            const post = await this._integrationRepository.getPostByReleaseId(getPlugById.integration.id, data.postId);
            if (post?.settings) {
                try {
                    postSettings = JSON.parse(post.settings);
                }
                catch {
                    /* invalid JSON in post.settings — ignore, plug will fall back to plug-level defaults */
                }
            }
        }
        catch (err) {
            console.error('processPlugs: failed to load post settings:', err);
        }
        // Build a small per-plug context that lets the plug method persist state
        // across runs (e.g., the auto-DM plug uses this to remember which user IDs
        // have already received a DM for this post, so a user who liked first and
        // then later retweeted the same post doesn't receive a second DM).
        //
        // Stored values are scoped to (methodName, integrationId, value) where
        // value is "<postReleaseId>:<userId>" — prefixing with the post ID makes
        // dedup per-post, not global. Different posts can DM the same user.
        //
        // autoDmFollowers uses integration-wide keys (fdm:/fds:) instead of tweet id.
        const integrationId = getPlugById.integration.id;
        const followerBaselineKey = '__fdm_baseline_v1__';
        const dmGate = getPlugById.integration.providerIdentifier === 'x'
            ? (0, x_plug_batch_rate_limit_store_1.createDmBatchGate)(integrationId)
            : null;
        const mergeDmBatchGate = (ctx) => dmGate
            ? {
                ...ctx,
                tryReserveDm: dmGate.tryReserveDm,
                confirmDmSent: dmGate.confirmDmSent,
            }
            : ctx;
        const engagerSnapshotPrefix = `esnap:${data.postId}:`;
        const loadEngagerSnapshotForPost = async () => {
            const rows = await this._integrationRepository.listExisingDataWithPrefix(getPlugById.plugFunction, integrationId, engagerSnapshotPrefix);
            return new Set(rows
                .map((r) => r.value.slice(engagerSnapshotPrefix.length))
                .filter(Boolean));
        };
        const saveEngagerSnapshotForPost = async (userIds) => {
            const rows = await this._integrationRepository.listExisingDataWithPrefix(getPlugById.plugFunction, integrationId, engagerSnapshotPrefix);
            if (rows.length) {
                await this._integrationRepository.deleteExisingDataValues(getPlugById.plugFunction, integrationId, rows.map((r) => r.value));
            }
            if (userIds.length) {
                await this._integrationRepository.saveExisingData(getPlugById.plugFunction, integrationId, userIds.map((uid) => `${engagerSnapshotPrefix}${uid}`));
            }
        };
        const engagementPlugContext = mergeDmBatchGate({
            loadEngagerSnapshot: loadEngagerSnapshotForPost,
            saveEngagerSnapshot: saveEngagerSnapshotForPost,
            // Returns the subset of `userIds` that have ALREADY been recorded for
            // this post (i.e., already DM'd in a prior run). Caller filters them out
            // before sending DMs.
            loadDmdUserIds: async (userIds) => {
                if (userIds.length === 0)
                    return new Set();
                const candidates = userIds.map((uid) => `${data.postId}:${uid}`);
                const existing = await this._integrationRepository.loadExisingData(getPlugById.plugFunction, integrationId, candidates);
                const existingValues = new Set(existing.map((e) => e.value));
                return new Set(userIds.filter((uid) => existingValues.has(`${data.postId}:${uid}`)));
            },
            // Persist the user IDs that were successfully DM'd in this run so the
            // next run doesn't DM them again.
            saveDmdUserIds: async (userIds) => {
                if (userIds.length === 0)
                    return;
                const values = userIds.map((uid) => `${data.postId}:${uid}`);
                await this._integrationRepository.saveExisingData(getPlugById.plugFunction, integrationId, values);
                if (getPlugById.plugFunction === 'autoDmEngagers' &&
                    userIds.length > 0) {
                    await this._integrationRepository.incrementAutoDmSentCountForPost(integrationId, data.postId, userIds.length);
                }
            },
        });
        const followerPlugContext = mergeDmBatchGate({
            loadDmdUserIds: async (userIds) => {
                if (userIds.length === 0)
                    return new Set();
                const candidates = userIds.map((uid) => `fdm:${uid}`);
                const existing = await this._integrationRepository.loadExisingData(getPlugById.plugFunction, integrationId, candidates);
                const existingValues = new Set(existing.map((e) => e.value));
                return new Set(userIds.filter((uid) => existingValues.has(`fdm:${uid}`)));
            },
            saveDmdUserIds: async (userIds) => {
                if (userIds.length === 0)
                    return;
                const values = userIds.map((uid) => `fdm:${uid}`);
                await this._integrationRepository.saveExisingData(getPlugById.plugFunction, integrationId, values);
            },
            hasFollowerBaselineMarker: async () => {
                const rows = await this._integrationRepository.loadExisingData(getPlugById.plugFunction, integrationId, [followerBaselineKey]);
                return rows.length > 0;
            },
            setFollowerBaselineMarker: async () => {
                await this._integrationRepository.saveExisingData(getPlugById.plugFunction, integrationId, [followerBaselineKey]);
            },
            loadFollowerSnapshotContains: async (userIds) => {
                if (userIds.length === 0)
                    return new Set();
                const candidates = userIds.map((uid) => `fds:${uid}`);
                const existing = await this._integrationRepository.loadExisingData(getPlugById.plugFunction, integrationId, candidates);
                const existingValues = new Set(existing.map((e) => e.value));
                return new Set(userIds.filter((uid) => existingValues.has(`fds:${uid}`)));
            },
            saveFollowerSnapshotIds: async (userIds) => {
                if (userIds.length === 0)
                    return;
                const values = userIds.map((uid) => `fds:${uid}`);
                await this._integrationRepository.saveExisingData(getPlugById.plugFunction, integrationId, values);
            },
            listFollowerSnapshotUserIds: async () => {
                const rows = await this._integrationRepository.listExisingDataWithPrefix(getPlugById.plugFunction, integrationId, 'fds:');
                return rows
                    .map((r) => r.value.replace(/^fds:/, ''))
                    .filter(Boolean);
            },
            removeFollowerTracking: async (userIds) => {
                if (!userIds.length)
                    return;
                const values = userIds.flatMap((uid) => [
                    `fdm:${uid}`,
                    `fds:${uid}`,
                    `fprev:${uid}`,
                ]);
                await this._integrationRepository.deleteExisingDataValues(getPlugById.plugFunction, integrationId, values);
            },
            /** Follower ids seen on the previous poll tick (for unfollow/re-follow delta). */
            loadPreviousFollowerPollIds: async () => {
                const rows = await this._integrationRepository.listExisingDataWithPrefix(getPlugById.plugFunction, integrationId, 'fprev:');
                return new Set(rows.map((r) => r.value.replace(/^fprev:/, '')).filter(Boolean));
            },
            savePreviousFollowerPollIds: async (userIds) => {
                const rows = await this._integrationRepository.listExisingDataWithPrefix(getPlugById.plugFunction, integrationId, 'fprev:');
                if (rows.length) {
                    await this._integrationRepository.deleteExisingDataValues(getPlugById.plugFunction, integrationId, rows.map((r) => r.value));
                }
                if (userIds.length) {
                    await this._integrationRepository.saveExisingData(getPlugById.plugFunction, integrationId, userIds.map((uid) => `fprev:${uid}`));
                }
            },
        });
        let engagementReleaseId = data.postId;
        if (getPlugById.plugFunction === 'autoDmPinnedPost') {
            const xProvider = integration;
            const pinnedId = await xProvider.resolvePinnedTweetId(getPlugById.integration);
            if (pinnedId) {
                engagementReleaseId = pinnedId;
            }
        }
        const pinnedSnapshotPrefix = `esnap:${engagementReleaseId}:`;
        const loadPinnedEngagerSnapshot = async () => {
            const rows = await this._integrationRepository.listExisingDataWithPrefix(getPlugById.plugFunction, integrationId, pinnedSnapshotPrefix);
            return new Set(rows
                .map((r) => r.value.slice(pinnedSnapshotPrefix.length))
                .filter(Boolean));
        };
        const savePinnedEngagerSnapshot = async (userIds) => {
            const rows = await this._integrationRepository.listExisingDataWithPrefix(getPlugById.plugFunction, integrationId, pinnedSnapshotPrefix);
            if (rows.length) {
                await this._integrationRepository.deleteExisingDataValues(getPlugById.plugFunction, integrationId, rows.map((r) => r.value));
            }
            if (userIds.length) {
                await this._integrationRepository.saveExisingData(getPlugById.plugFunction, integrationId, userIds.map((uid) => `${pinnedSnapshotPrefix}${uid}`));
            }
        };
        const pinnedEngagementPlugContext = mergeDmBatchGate({
            loadEngagerSnapshot: loadPinnedEngagerSnapshot,
            saveEngagerSnapshot: savePinnedEngagerSnapshot,
            loadDmdUserIds: async (userIds) => {
                if (userIds.length === 0)
                    return new Set();
                const candidates = userIds.map((uid) => `${engagementReleaseId}:${uid}`);
                const existing = await this._integrationRepository.loadExisingData(getPlugById.plugFunction, integrationId, candidates);
                const existingValues = new Set(existing.map((e) => e.value));
                return new Set(userIds.filter((uid) => existingValues.has(`${engagementReleaseId}:${uid}`)));
            },
            saveDmdUserIds: async (userIds) => {
                if (userIds.length === 0)
                    return;
                const values = userIds.map((uid) => `${engagementReleaseId}:${uid}`);
                await this._integrationRepository.saveExisingData(getPlugById.plugFunction, integrationId, values);
            },
        });
        const plugContext = getPlugById.plugFunction === 'autoDmFollowers'
            ? followerPlugContext
            : getPlugById.plugFunction === 'autoDmPinnedPost'
                ? pinnedEngagementPlugContext
                : engagementPlugContext;
        // @ts-ignore
        const process = await integration[getPlugById.plugFunction](getPlugById.integration, data.postId, JSON.parse(getPlugById.data).reduce((all, current) => {
            all[current.name] = current.value;
            return all;
        }, {}), postSettings, plugContext);
        if (process) {
            return true;
        }
        if (data.totalRuns === data.currentRun) {
            return true;
        }
        return false;
    }
    /**
     * Dashboard homepage enables Auto DM / Auto retweet without the Plugs UI.
     * Global workflows only schedule plugs that exist in DB with activated=true
     * (see PostsService.checkPlugs). Upsert the matching X plug rows here.
     */
    async ensureXHomepageAutomaticPlugs(organizationId, integrationId, settings) {
        if (!settings || settings.__type !== 'x') {
            return;
        }
        const s = settings;
        if (s.auto_dm_enabled === true) {
            const rawMsg = typeof s.auto_dm_message === 'string'
                ? s.auto_dm_message.trim()
                : '';
            const message = rawMsg.length >= 3 ? rawMsg : 'Thanks for your support!';
            const targets = (s.auto_dm_targets || {});
            const boolStr = (v) => v === true || v === 'true' || v === 1 || v === '1' ? 'true' : 'false';
            const fields = [
                { name: 'message', value: message },
                { name: 'targetLikes', value: boolStr(targets.likes) },
                { name: 'targetRetweets', value: boolStr(targets.retweets) },
                { name: 'targetReplies', value: boolStr(targets.replies) },
            ];
            await this.createOrUpdatePlug(organizationId, integrationId, {
                func: 'autoDmEngagers',
                fields,
            });
        }
        else if (s.auto_dm_enabled === false) {
            await this._integrationRepository.deactivatePlugByFunction(organizationId, integrationId, 'autoDmEngagers');
        }
        if (s.auto_retweet_enabled === true) {
            // autoRepostPost only uses likesAmount today. Homepage interval / #times are
            // stored on the post but not yet read by the plug (fixed poll interval in
            // @Plug metadata). Optional post setting auto_retweet_like_threshold if added later.
            const likesTrigger = String(Math.max(1, Number(s.auto_retweet_like_threshold ?? 1) || 1));
            await this.createOrUpdatePlug(organizationId, integrationId, {
                func: 'autoRepostPost',
                fields: [{ name: 'likesAmount', value: likesTrigger }],
            });
        }
        else if (s.auto_retweet_enabled === false) {
            await this._integrationRepository.deactivatePlugByFunction(organizationId, integrationId, 'autoRepostPost');
        }
        if (s.auto_thread_reply_enabled === true) {
            const rawText = typeof s.auto_thread_reply_text === 'string'
                ? s.auto_thread_reply_text.trim()
                : '';
            if (rawText.length >= 3) {
                const likesTrigger = String(Math.max(1, Number(s.auto_thread_reply_likes ?? 1) || 1));
                await this.createOrUpdatePlug(organizationId, integrationId, {
                    func: 'autoThreadReply',
                    fields: [
                        { name: 'likesAmount', value: likesTrigger },
                        { name: 'thread', value: rawText },
                    ],
                });
            }
        }
        else if (s.auto_thread_reply_enabled === false) {
            await this._integrationRepository.deactivatePlugByFunction(organizationId, integrationId, 'autoThreadReply');
        }
        await this.syncEngagementPoller(organizationId, integrationId);
    }
    /**
     * Follower-DM poller runs when TweetStream WS is down, even if
     * TWEETSTREAM_DISABLE_FOLLOWER_POLLING=true (that flag only applies while WS is live).
     */
    async shouldRunFollowerDmPoller() {
        if ((0, x_realtime_env_1.isCustomRealtimeIngest)()) {
            return false;
        }
        if ((0, x_account_activity_env_1.isXAccountActivityPollingDisabled)()) {
            return false;
        }
        if (!(0, tweetstream_env_2.isTweetStreamFollowerPollingDisabled)()) {
            return true;
        }
        return !(await (0, tweetstream_ws_state_1.isTweetStreamWsConsumerActive)());
    }
    /**
     * Start/stop follower-DM pollers based on TweetStream WebSocket availability.
     */
    async syncFollowerDmPollersWithTweetStreamFallback() {
        const plugs = await this._integrationRepository.listActiveFollowerDmPlugs();
        const wsActive = await (0, tweetstream_ws_state_1.isTweetStreamWsConsumerActive)();
        for (const plug of plugs) {
            if (wsActive && (0, tweetstream_env_2.isTweetStreamFollowerPollingDisabled)()) {
                await this.stopXFollowerDmPollerWorkflow(plug.integrationId);
                continue;
            }
            if (await this.shouldRunFollowerDmPoller()) {
                await this.startXFollowerDmPollerWorkflow(plug.organizationId, plug.integrationId, plug.id);
            }
        }
    }
    async startXFollowerDmPollerWorkflow(organizationId, integrationId, plugId) {
        if (!(await this.shouldRunFollowerDmPoller())) {
            return;
        }
        const pollIntervalMs = (0, x_poll_interval_env_1.resolveXPollIntervalMs)('X_FOLLOWER_DM_POLL_INTERVAL_MS');
        await this.startForeverPollerIfNotRunning('xFollowerDmPollerWorkflow', (0, x_follower_dm_constants_1.xFollowerDmPollerWorkflowId)(integrationId), [{ organizationId, integrationId, plugId, pollIntervalMs }]);
    }
    async stopXFollowerDmPollerWorkflow(integrationId) {
        await this.terminateForeverPollerIfRunning((0, x_follower_dm_constants_1.xFollowerDmPollerWorkflowId)(integrationId), 'TweetStream WebSocket active — follower-DM poller paused');
    }
    /**
     * Follower-DM poller workflow calls this each tick to self-terminate when the
     * plug is disabled or removed.
     */
    async isFollowerDmPlugActive(plugId) {
        const plug = await this._integrationRepository.getPlug(plugId);
        if (!plug)
            return false;
        return (plug.activated === true && plug.plugFunction === 'autoDmFollowers');
    }
    async listActiveProfileAutomationPlugIds(integrationId) {
        return this._integrationRepository.listActiveProfileAutomationPlugIds(integrationId);
    }
    isProfileAutomationPlug(func) {
        return x_follower_dm_constants_1.X_PROFILE_AUTOMATION_PLUG_FUNCTIONS.includes(func);
    }
    async startXProfileAutomationsPollerWorkflow(organizationId, integrationId) {
        const pollIntervalMs = (0, x_poll_interval_env_1.resolveXPollIntervalMs)('X_PROFILE_AUTOMATIONS_POLL_INTERVAL_MS');
        await this.startForeverPollerIfNotRunning('xProfileAutomationsPollerWorkflow', (0, x_follower_dm_constants_1.xProfileAutomationsPollerWorkflowId)(integrationId), [{ organizationId, integrationId, pollIntervalMs }]);
    }
    async stopXProfileAutomationsPollerWorkflow(integrationId) {
        await this.terminateForeverPollerIfRunning((0, x_follower_dm_constants_1.xProfileAutomationsPollerWorkflowId)(integrationId));
    }
    async syncProfileAutomationsPoller(organizationId, integrationId) {
        const plugIds = await this.listActiveProfileAutomationPlugIds(integrationId);
        if (plugIds.length) {
            await this.startXProfileAutomationsPollerWorkflow(organizationId, integrationId);
        }
        else {
            await this.stopXProfileAutomationsPollerWorkflow(integrationId);
        }
    }
    isEngagementPlug(func) {
        return x_follower_dm_constants_1.X_ENGAGEMENT_PLUG_FUNCTIONS.includes(func);
    }
    async hasActiveXEngagementPlugs(integrationId) {
        const rows = await this._integrationRepository.listActiveEngagementPlugIds(integrationId);
        return rows.length > 0;
    }
    /**
     * Start a forever poller only when it is not already RUNNING.
     * Avoids TERMINATE_EXISTING on every plug upsert (attach flow), which caused
     * Temporal "Workflow task not found" warnings and reset the poll timer.
     */
    /** Avoid throwing when nestjs-temporal-core is not connected yet (backend boot). */
    getTemporalRawClientSafe() {
        try {
            return this._temporalService.client?.getRawClient() ?? null;
        }
        catch {
            return null;
        }
    }
    async bootstrapXPlugPollersWhenTemporalReady() {
        const maxAttempts = 24;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (this.getTemporalRawClientSafe()) {
                await this.bootstrapXPlugPollers();
                return;
            }
            await (0, timer_1.timer)(5000);
        }
        console.warn('bootstrapXPlugPollers: Temporal client not ready after retries; pollers start on next plug sync or publish');
    }
    /** Terminate only RUNNING forever pollers (avoids Temporal ERROR on completed workflows). */
    async terminateForeverPollerIfRunning(workflowId, reason = 'Stopped by Postiz') {
        const raw = this.getTemporalRawClientSafe();
        if (!raw) {
            return;
        }
        try {
            const handle = raw.workflow.getHandle(workflowId);
            const description = await handle.describe();
            if (description.status.name !== 'RUNNING') {
                return;
            }
            await handle.terminate(reason);
        }
        catch {
            /* workflow not found or already completed */
        }
    }
    async startForeverPollerIfNotRunning(workflowType, workflowId, args) {
        const raw = this.getTemporalRawClientSafe();
        if (!raw) {
            return;
        }
        try {
            const handle = raw.workflow.getHandle(workflowId);
            const description = await handle.describe();
            if (description.status.name === 'RUNNING') {
                return;
            }
        }
        catch {
            /* workflow does not exist yet */
        }
        try {
            await raw.workflow.start(workflowType, {
                taskQueue: 'main',
                workflowId,
                workflowIdConflictPolicy: 'USE_EXISTING',
                args,
            });
        }
        catch (err) {
            const name = err?.name;
            if (name === 'WorkflowExecutionAlreadyStartedError') {
                return;
            }
            console.error(`startForeverPollerIfNotRunning ${workflowType}:`, err);
        }
    }
    async startXEngagementPollerWorkflow(organizationId, integrationId) {
        if ((0, x_account_activity_env_1.isXEngagementPollingDisabled)()) {
            return;
        }
        const pollIntervalMs = (0, x_poll_interval_env_1.resolveXEngagementPollIntervalMs)();
        await this.startForeverPollerIfNotRunning('xEngagementPollerWorkflow', (0, x_follower_dm_constants_1.xEngagementPollerWorkflowId)(integrationId), [{ organizationId, integrationId, pollIntervalMs }]);
    }
    async stopXEngagementPollerWorkflow(integrationId) {
        await this.terminateForeverPollerIfRunning((0, x_follower_dm_constants_1.xEngagementPollerWorkflowId)(integrationId));
    }
    async syncEngagementPoller(organizationId, integrationId) {
        const active = await this.hasActiveXEngagementPlugs(integrationId);
        if (active) {
            await this.startXEngagementPollerWorkflow(organizationId, integrationId);
        }
        else {
            await this.stopXEngagementPollerWorkflow(integrationId);
        }
    }
    /**
     * One 5-minute (default) engagement poller tick: run post-bound plugs on recent
     * published tweets, respecting DM batch caps (defer to next tick when limited).
     */
    /** Run engagement plugs for one tweet id (e.g. right after attach-published-tweet). */
    async runEngagementPlugsForReleaseId(organizationId, integrationId, releaseId, postSettings) {
        if (await (0, x_plug_batch_rate_limit_store_1.isXPlugDmWindowFull)(integrationId)) {
            return;
        }
        const plugs = await this._integrationRepository.listActiveEngagementPlugIds(integrationId);
        if (!plugs.length || !releaseId?.trim()) {
            return;
        }
        let plugsForPost = plugs.filter((plug) => this.isEngagementPlugActiveForPost(plug.plugFunction, postSettings));
        // Right after publish there are no engagers yet; realtime handles DMs.
        if ((0, x_realtime_env_1.shouldSkipXEngagerPlugPolling)() ||
            ((0, tweetstream_env_1.isTweetStreamEnabled)() && !(0, xquik_env_1.isXquikEngagementPollerEnabled)())) {
            plugsForPost = plugsForPost.filter((plug) => plug.plugFunction !== 'autoDmEngagers');
        }
        for (const plug of plugsForPost) {
            try {
                await this.processPlugs({
                    plugId: plug.id,
                    postId: releaseId,
                    delay: 0,
                    totalRuns: 1,
                    currentRun: 1,
                });
            }
            catch (err) {
                console.error(`runEngagementPlugsForReleaseId plug=${plug.plugFunction} release=${releaseId}:`, err);
            }
        }
    }
    async runXEngagementPollerTick(organizationId, integrationId) {
        void organizationId;
        const pollIntervalMs = (0, x_poll_interval_env_1.resolveXEngagementPollIntervalMs)();
        const acquired = await (0, x_poller_tick_guard_1.acquireXPollerTickLock)('engagement', integrationId, pollIntervalMs);
        if (!acquired) {
            return;
        }
        if (await (0, x_plug_batch_rate_limit_store_1.isXPlugDmWindowFull)(integrationId)) {
            const status = await (0, x_plug_batch_rate_limit_store_1.buildXPlugBatchRateLimitStatus)(integrationId);
            console.warn(`X engagement poller: skipping tick integration=${integrationId} dmWindow=${status.dmWindow.count}/${status.dmWindow.limit}`);
            return;
        }
        const xquikMode = (0, xquik_env_1.isXquikEngagementPollerEnabled)();
        const readPause = await (0, x_plug_batch_rate_limit_store_1.isXPlugApiReadPaused)(integrationId);
        if (readPause.paused && !xquikMode) {
            console.warn(`X engagement poller: skipping tick integration=${integrationId} — X API 429 cooldown until ${readPause.until}. TweetStream realtime DMs still work.`);
            return;
        }
        const tweetStreamWsActive = xquikMode
            ? false
            : await (0, tweetstream_ws_state_1.isTweetStreamWsConsumerActive)();
        const plugs = await this._integrationRepository.listActiveEngagementPlugIds(integrationId);
        if (!plugs.length) {
            return;
        }
        const posts = await this._integrationRepository.listPublishedPostReleaseIds(integrationId, 100);
        const maxPosts = xquikMode
            ? (0, xquik_env_1.getXquikEngagementMaxPostsPerTick)()
            : tweetStreamWsActive
                ? Math.min(3, x_plug_batch_rate_limit_1.X_ENGAGEMENT_MAX_POSTS_PER_TICK)
                : x_plug_batch_rate_limit_1.X_ENGAGEMENT_MAX_POSTS_PER_TICK;
        const published = posts.filter((p) => !!p.releaseId?.trim());
        let toProcess = published.slice(0, maxPosts);
        if (xquikMode && published.length > 0) {
            const integration = await this._integrationRepository.getIntegrationById(organizationId, integrationId);
            const xProvider = this._integrationManager.getSocialIntegration('x');
            const ownerId = integration?.internalId;
            const scan = published.slice(0, Math.min(15, published.length));
            const scored = await Promise.all(scan.map(async (post) => ({
                post,
                repliers: await xProvider.countInboundRepliersViaXquik(post.releaseId.trim(), ownerId),
            })));
            scored.sort((a, b) => b.repliers - a.repliers);
            const withReplies = scored
                .filter((s) => s.repliers > 0)
                .map((s) => s.post);
            const newestFirst = published.slice(0, Math.min(5, published.length));
            const merged = new Map();
            for (const p of [...withReplies, ...newestFirst]) {
                merged.set(p.releaseId.trim(), p);
            }
            toProcess = Array.from(merged.values()).slice(0, maxPosts);
            if (toProcess.length > 0) {
                console.log(`Xquik engagement poller: tick posts (ids=${toProcess.map((p) => p.releaseId).join(',')}${withReplies.length ? `; ${withReplies.length} with Xquik repliers` : ''})`);
            }
        }
        if (!xquikMode && tweetStreamWsActive && published.length > 0) {
            const integration = await this._integrationRepository.getIntegrationById(organizationId, integrationId);
            const xProvider = this._integrationManager.getSocialIntegration('x');
            if (integration?.token) {
                try {
                    const ids = published
                        .map((p) => p.releaseId.trim())
                        .slice(0, 20);
                    const metrics = await xProvider.batchTweetPublicMetrics(integration.token, ids);
                    const withEngagement = published.filter((p) => {
                        const m = metrics[p.releaseId.trim()];
                        return (m?.replyCount ?? 0) > 0 || (m?.likeCount ?? 0) > 0;
                    });
                    if (withEngagement.length > 0) {
                        toProcess = withEngagement.slice(0, maxPosts);
                    }
                }
                catch (err) {
                    console.warn(`X engagement poller: metrics prefetch failed integration=${integrationId}:`, err);
                }
            }
        }
        const skippedPosts = Math.max(0, posts.length - toProcess.length);
        if (skippedPosts > 0) {
            await (0, x_plug_batch_rate_limit_store_1.addQueuedEstimate)(integrationId, skippedPosts * plugs.length);
        }
        for (const post of toProcess) {
            const releaseId = post.releaseId.trim();
            let postSettings;
            if (post.settings) {
                try {
                    postSettings = JSON.parse(post.settings);
                }
                catch {
                    postSettings = undefined;
                }
            }
            let plugsForPost = plugs.filter((plug) => this.isEngagementPlugActiveForPost(plug.plugFunction, postSettings));
            if ((0, x_realtime_env_1.shouldSkipXEngagerPlugPolling)()) {
                plugsForPost = plugsForPost.filter((plug) => plug.plugFunction !== 'autoDmEngagers');
            }
            else if (tweetStreamWsActive && !xquikMode) {
                plugsForPost = plugsForPost.filter((plug) => ['autoDmPinnedPost', 'autoDmEngagers'].includes(plug.plugFunction));
            }
            if (!plugsForPost.length) {
                continue;
            }
            for (const plug of plugsForPost) {
                try {
                    await this.processPlugs({
                        plugId: plug.id,
                        postId: releaseId,
                        delay: 0,
                        totalRuns: 1,
                        currentRun: 1,
                    });
                }
                catch (err) {
                    console.error(`runXEngagementPollerTick plug=${plug.plugFunction} release=${releaseId}:`, err);
                }
            }
            await (0, x_plug_batch_rate_limit_store_1.decayQueuedEstimate)(integrationId, plugsForPost.length);
        }
    }
    /** Skip X API calls for posts with per-tweet automations turned off. */
    isEngagementPlugActiveForPost(plugFunction, postSettings) {
        if (plugFunction === 'autoDmEngagers') {
            return postSettings?.auto_dm_enabled !== false;
        }
        if (plugFunction === 'autoRepostPost') {
            return postSettings?.auto_retweet_enabled === true;
        }
        if (plugFunction === 'autoThreadReply') {
            return postSettings?.auto_thread_reply_enabled === true;
        }
        if (plugFunction === 'autoPlugPost') {
            const text = typeof postSettings?.auto_plug_reply_text === 'string'
                ? postSettings.auto_plug_reply_text.trim()
                : '';
            return text.length >= 3;
        }
        return true;
    }
    async getXPlugBatchRateLimit(orgId, integrationId) {
        const integration = await this.getIntegrationById(orgId, integrationId);
        if (!integration || integration.providerIdentifier !== 'x') {
            throw new common_1.HttpException('Invalid X integration', common_1.HttpStatus.BAD_REQUEST);
        }
        return (0, x_plug_batch_rate_limit_store_1.buildXPlugBatchRateLimitStatus)(integrationId);
    }
    /**
     * Ensures forever X pollers exist. Does not terminate running workflows (avoids
     * restart API credit spikes). Skips kinds disabled via env / TweetStream.
     */
    async bootstrapXPlugPollers() {
        if (!(0, x_account_activity_env_1.isXEngagementPollingDisabled)() && !(0, xquik_env_1.isXquikEngagementPollerEnabled)()) {
            const engagement = await this._integrationRepository.listXIntegrationsWithActiveEngagementPlugs();
            for (const row of engagement) {
                await this.syncEngagementPoller(row.organizationId, row.integrationId);
            }
            const profile = await this._integrationRepository.listXIntegrationsWithActiveProfileAutomationPlugs();
            for (const row of profile) {
                await this.syncProfileAutomationsPoller(row.organizationId, row.integrationId);
            }
        }
        const followerPlugs = await this._integrationRepository.listActiveFollowerDmPlugs();
        for (const plug of followerPlugs) {
            await this.startXFollowerDmPollerWorkflow(plug.organizationId, plug.integrationId, plug.id);
        }
    }
    async createOrUpdatePlug(orgId, integrationId, body) {
        const row = await this._integrationRepository.createOrUpdatePlug(orgId, integrationId, body);
        if (body.func === 'autoDmFollowers' && row.activated) {
            await this.startXFollowerDmPollerWorkflow(orgId, integrationId, row.id);
        }
        if ((body.func === 'autoDmEngagers' ||
            body.func === 'autoDmFollowers' ||
            body.func === 'autoDmPinnedPost') &&
            row.activated) {
            void this.syncTweetStreamMonitoredAccounts().catch((err) => console.error('syncTweetStreamMonitoredAccounts:', err));
        }
        if (this.isProfileAutomationPlug(body.func) && row.activated) {
            await this.syncProfileAutomationsPoller(orgId, integrationId);
        }
        if (this.isEngagementPlug(body.func)) {
            await this.syncEngagementPoller(orgId, integrationId);
        }
        if (row.activated && (0, x_account_activity_env_1.isXAccountActivityWebhooksEnabled)()) {
            void this.syncXAccountActivityForIntegrationId(orgId, integrationId).catch((err) => console.error('syncXAccountActivityForIntegrationId:', err));
        }
        return {
            activated: row.activated,
            id: row.id,
        };
    }
    async changePlugActivation(orgId, plugId, status) {
        const updated = await this._integrationRepository.changePlugActivation(orgId, plugId, status);
        if (updated.plugFunction === 'autoDmFollowers') {
            if (status) {
                await this.startXFollowerDmPollerWorkflow(orgId, updated.integrationId, plugId);
                if ((0, x_account_activity_env_1.isXAccountActivityWebhooksEnabled)()) {
                    void this.syncXAccountActivityForIntegrationId(orgId, updated.integrationId).catch((err) => console.error('syncXAccountActivityForIntegrationId:', err));
                }
            }
            else {
                await this.stopXFollowerDmPollerWorkflow(updated.integrationId);
            }
        }
        if (this.isProfileAutomationPlug(updated.plugFunction)) {
            await this.syncProfileAutomationsPoller(orgId, updated.integrationId);
        }
        if (this.isEngagementPlug(updated.plugFunction)) {
            await this.syncEngagementPoller(orgId, updated.integrationId);
        }
        return { id: updated.id };
    }
    async getPlugs(orgId, integrationId) {
        return this._integrationRepository.getPlugs(orgId, integrationId);
    }
    async loadExisingData(methodName, integrationId, id) {
        const exisingData = await this._integrationRepository.loadExisingData(methodName, integrationId, id);
        const loadOnlyIds = exisingData.map((p) => p.value);
        return (0, lodash_1.difference)(id, loadOnlyIds);
    }
    async listXFollowers(orgId, integrationId, subjectUserId, paginationToken, username, listType = 'followers') {
        const integration = await this.getIntegrationById(orgId, integrationId);
        if (!integration || integration.providerIdentifier !== 'x') {
            throw new common_1.HttpException('Invalid X integration', common_1.HttpStatus.BAD_REQUEST);
        }
        if (integration.disabled || integration.deletedAt) {
            throw new common_1.HttpException('Channel is disabled', common_1.HttpStatus.BAD_REQUEST);
        }
        const x = this._integrationManager.getSocialIntegration('x');
        let subject = subjectUserId?.trim() || '';
        if (username?.trim()) {
            const resolved = await x.resolveUserByUsername(integration, username.trim());
            subject = resolved.id;
        }
        if (!subject) {
            subject = integration.internalId || '';
        }
        if (!subject) {
            throw new common_1.HttpException('Missing user id', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            if (listType === 'following') {
                return await x.listFollowingPage(integration, subject, paginationToken?.trim() || undefined);
            }
            return await x.listFollowersPage(integration, subject, paginationToken?.trim() || undefined);
        }
        catch (err) {
            const fallback = listType === 'following'
                ? 'Could not load following list'
                : 'Could not load followers';
            const msg = (0, x_provider_1.formatXApiErrorMessage)(err, fallback);
            console.error(`listXFollowers (${listType}) integration=${integrationId} subject=${subject}:`, msg, err);
            throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getXFollowRateLimit(orgId, integrationId) {
        const integration = await this.getIntegrationById(orgId, integrationId);
        if (!integration || integration.providerIdentifier !== 'x') {
            throw new common_1.HttpException('Invalid X integration', common_1.HttpStatus.BAD_REQUEST);
        }
        return (0, x_follow_rate_limit_store_1.getXFollowRateLimitForIntegration)(integrationId);
    }
    async getXPinnedTweet(orgId, integrationId) {
        const integration = await this.getIntegrationById(orgId, integrationId);
        if (!integration || integration.providerIdentifier !== 'x') {
            throw new common_1.HttpException('Invalid X integration', common_1.HttpStatus.BAD_REQUEST);
        }
        const x = this._integrationManager.getSocialIntegration('x');
        return x.getPinnedTweetPreview(integration);
    }
    async getXUnfollowRateLimit(orgId, integrationId) {
        const integration = await this.getIntegrationById(orgId, integrationId);
        if (!integration || integration.providerIdentifier !== 'x') {
            throw new common_1.HttpException('Invalid X integration', common_1.HttpStatus.BAD_REQUEST);
        }
        return (0, x_follow_rate_limit_store_1.getXUnfollowRateLimitForIntegration)(integrationId);
    }
    async massFollowXUsers(orgId, integrationId, userIds) {
        const integration = await this.getIntegrationById(orgId, integrationId);
        if (!integration || integration.providerIdentifier !== 'x') {
            throw new common_1.HttpException('Invalid X integration', common_1.HttpStatus.BAD_REQUEST);
        }
        if (integration.disabled || integration.deletedAt) {
            throw new common_1.HttpException('Channel is disabled', common_1.HttpStatus.BAD_REQUEST);
        }
        if (integration.refreshNeeded) {
            throw new common_1.HttpException('Reconnect this X channel before following users', common_1.HttpStatus.BAD_REQUEST);
        }
        const rateBefore = await (0, x_follow_rate_limit_store_1.getXFollowRateLimitForIntegration)(integrationId);
        if (rateBefore.limited) {
            throw new common_1.HttpException({
                message: (0, x_follow_rate_limit_1.formatFollowRateLimitMessage)(rateBefore),
                rateLimit: rateBefore,
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const cappedIds = userIds.slice(0, Math.min(x_follow_rate_limit_1.X_FOLLOW_BATCH_MAX, rateBefore.remaining));
        if (cappedIds.length === 0) {
            throw new common_1.HttpException({
                message: (0, x_follow_rate_limit_1.formatFollowRateLimitMessage)(rateBefore),
                rateLimit: rateBefore,
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const x = this._integrationManager.getSocialIntegration('x');
        try {
            const result = await x.followUsers(integration, cappedIds);
            const rateLimit = await (0, x_follow_rate_limit_store_1.recordXFollowsForIntegration)(integrationId, result.succeeded.length);
            return { ...result, rateLimit };
        }
        catch (err) {
            const msg = err?.data?.detail ||
                err?.data?.title ||
                err?.message ||
                'Follow request failed';
            throw new common_1.HttpException(String(msg), common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async massUnfollowXUsers(orgId, integrationId, userIds) {
        const integration = await this.getIntegrationById(orgId, integrationId);
        if (!integration || integration.providerIdentifier !== 'x') {
            throw new common_1.HttpException('Invalid X integration', common_1.HttpStatus.BAD_REQUEST);
        }
        if (integration.disabled || integration.deletedAt) {
            throw new common_1.HttpException('Channel is disabled', common_1.HttpStatus.BAD_REQUEST);
        }
        if (integration.refreshNeeded) {
            throw new common_1.HttpException('Reconnect this X channel before unfollowing users', common_1.HttpStatus.BAD_REQUEST);
        }
        const rateBefore = await (0, x_follow_rate_limit_store_1.getXUnfollowRateLimitForIntegration)(integrationId);
        if (rateBefore.limited) {
            throw new common_1.HttpException({
                message: `Unfollow limit reached (${rateBefore.limit} per ${rateBefore.windowMinutes} minutes). Try again after ${rateBefore.resetsAt}.`,
                rateLimit: rateBefore,
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const cappedIds = userIds.slice(0, Math.min(x_follow_rate_limit_1.X_FOLLOW_BATCH_MAX, rateBefore.remaining));
        if (cappedIds.length === 0) {
            throw new common_1.HttpException({
                message: `Unfollow limit reached (${rateBefore.limit} per ${rateBefore.windowMinutes} minutes).`,
                rateLimit: rateBefore,
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const x = this._integrationManager.getSocialIntegration('x');
        try {
            const result = await x.unfollowUsers(integration, cappedIds);
            const rateLimit = await (0, x_follow_rate_limit_store_1.recordXUnfollowsForIntegration)(integrationId, result.succeeded.length);
            return { ...result, rateLimit };
        }
        catch (err) {
            const msg = err?.data?.detail ||
                err?.data?.title ||
                err?.message ||
                'Unfollow request failed';
            throw new common_1.HttpException(String(msg), common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async assertActiveXIntegration(orgId, integrationId) {
        const integration = await this.getIntegrationById(orgId, integrationId);
        if (!integration || integration.providerIdentifier !== 'x') {
            throw new common_1.HttpException('Invalid X integration', common_1.HttpStatus.BAD_REQUEST);
        }
        if (integration.disabled || integration.deletedAt) {
            throw new common_1.HttpException('Channel is disabled', common_1.HttpStatus.BAD_REQUEST);
        }
        if (integration.refreshNeeded) {
            throw new common_1.HttpException('Reconnect this X channel before following users', common_1.HttpStatus.BAD_REQUEST);
        }
        return integration;
    }
    async processAllPendingXFollowQueues() {
        if (!(0, tweetstream_env_2.isPostizBackendWorker)()) {
            return;
        }
        const pending = await (0, x_follow_queue_store_1.listIntegrationIdsWithPendingQueue)();
        if (!pending.length) {
            return;
        }
        for (const { integrationId, orgId } of pending) {
            try {
                const result = await this.processXFollowQueue(orgId, integrationId);
                if (result.processed > 0) {
                    console.log(`[x-follow-queue] integration=${integrationId} batch processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed}`);
                }
            }
            catch (err) {
                console.error(`[x-follow-queue] integration=${integrationId} org=${orgId} error:`, err);
            }
        }
    }
    async getXFollowQueue(orgId, integrationId) {
        await this.assertActiveXIntegration(orgId, integrationId);
        // Status reads must not drain the queue — background polling processes batches.
        return (0, x_follow_queue_store_1.getXFollowQueueStatus)(integrationId, orgId);
    }
    async enqueueXFollowQueue(orgId, integrationId, entries, options) {
        await this.assertActiveXIntegration(orgId, integrationId);
        const result = await (0, x_follow_queue_store_1.enqueueXFollowQueueItems)(integrationId, orgId, entries, { firstBatchNow: options?.processFirstBatch });
        const batch = options?.processFirstBatch
            ? await this.processXFollowQueue(orgId, integrationId, {
                limitToItemIds: result.addedItemIds,
            })
            : null;
        const status = await (0, x_follow_queue_store_1.getXFollowQueueStatus)(integrationId, orgId);
        return { ...result, batch, status };
    }
    async processXFollowQueue(orgId, integrationId, options) {
        const integration = await this.assertActiveXIntegration(orgId, integrationId);
        const x = this._integrationManager.getSocialIntegration('x');
        return (0, x_follow_queue_store_1.processXFollowQueueBatch)(integrationId, orgId, async (userIds) => {
            try {
                return await x.followUsers(integration, userIds);
            }
            catch (err) {
                const msg = err?.data?.detail ||
                    err?.data?.title ||
                    err?.message ||
                    'Follow request failed';
                throw new common_1.HttpException(String(msg), common_1.HttpStatus.BAD_REQUEST);
            }
        }, options);
    }
    async cancelXFollowQueueItem(orgId, integrationId, itemId) {
        await this.assertActiveXIntegration(orgId, integrationId);
        const ok = await (0, x_follow_queue_store_1.cancelXFollowQueueItem)(integrationId, itemId);
        if (!ok) {
            throw new common_1.HttpException('Queue item not found', common_1.HttpStatus.NOT_FOUND);
        }
        return (0, x_follow_queue_store_1.getXFollowQueueStatus)(integrationId, orgId);
    }
    async clearXFollowQueueCompleted(orgId, integrationId) {
        await this.assertActiveXIntegration(orgId, integrationId);
        const removed = await (0, x_follow_queue_store_1.clearXFollowQueueCompleted)(integrationId);
        return { removed, status: await (0, x_follow_queue_store_1.getXFollowQueueStatus)(integrationId, orgId) };
    }
    async clearXFollowQueueItems(orgId, integrationId, itemIds) {
        await this.assertActiveXIntegration(orgId, integrationId);
        const removed = await (0, x_follow_queue_store_1.clearXFollowQueueItems)(integrationId, orgId, itemIds);
        return { removed, status: await (0, x_follow_queue_store_1.getXFollowQueueStatus)(integrationId, orgId) };
    }
    async resumeXFollowQueueAfterCredits(orgId, integrationId) {
        await this.assertActiveXIntegration(orgId, integrationId);
        const cleared = await (0, x_follow_queue_store_1.resumeXFollowQueueAfterCredits)(integrationId, orgId);
        await this.processXFollowQueue(orgId, integrationId);
        return {
            cleared,
            status: await (0, x_follow_queue_store_1.getXFollowQueueStatus)(integrationId, orgId),
        };
    }
    async findFreeDateTime(orgId, integrationsId) {
        const findTimes = await this._integrationRepository.getPostingTimes(orgId, integrationsId);
        return (0, lodash_1.uniq)(findTimes.reduce((all, current) => {
            return [
                ...all,
                ...JSON.parse(current.postingTimes).map((p) => p.time),
            ];
        }, []));
    }
};
exports.IntegrationService = IntegrationService;
exports.IntegrationService = IntegrationService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => refresh_integration_service_1.RefreshIntegrationService))),
    tslib_1.__param(7, (0, common_1.Inject)((0, common_1.forwardRef)(() => x_account_activity_handler_1.XAccountActivityHandler))),
    tslib_1.__metadata("design:paramtypes", [integration_repository_1.IntegrationRepository,
        autopost_repository_1.AutopostRepository,
        integration_manager_1.IntegrationManager,
        notification_service_1.NotificationService,
        refresh_integration_service_1.RefreshIntegrationService,
        nestjs_temporal_core_1.TemporalService,
        x_account_activity_service_1.XAccountActivityService,
        x_account_activity_handler_1.XAccountActivityHandler,
        tweetstream_service_1.TweetStreamService])
], IntegrationService);
//# sourceMappingURL=integration.service.js.map