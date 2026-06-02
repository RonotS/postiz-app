"use strict";
var TweetStreamService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TweetStreamService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const integration_service_1 = require("../../database/prisma/integrations/integration.service");
const xquik_env_1 = require("../../../../helpers/src/x/xquik.env");
const tweetstream_env_1 = require("../../../../helpers/src/x/tweetstream.env");
const redis_service_1 = require("../../redis/redis.service");
const integration_repository_1 = require("../../database/prisma/integrations/integration.repository");
const x_account_activity_handler_1 = require("./x.account-activity.handler");
const x_activity_stream_env_1 = require("../../../../helpers/src/x/x.activity-stream.env");
const x_realtime_env_1 = require("../../../../helpers/src/x/x.realtime.env");
const tweetstream_api_1 = require("./tweetstream.api");
const tweetstream_client_1 = require("./tweetstream.client");
const tweetstream_mapper_1 = require("./tweetstream.mapper");
const tweetstream_normalize_1 = require("./tweetstream.normalize");
const tweetstream_ws_state_1 = require("./tweetstream.ws-state");
let TweetStreamService = TweetStreamService_1 = class TweetStreamService {
    constructor(_integrationRepository, _handler, _integrationService) {
        this._integrationRepository = _integrationRepository;
        this._handler = _handler;
        this._integrationService = _integrationService;
        this.log = new common_1.Logger(TweetStreamService_1.name);
        this.wsClient = null;
        this.wsLeaderToken = null;
        /** TweetStream sends `content` before `update` with reply ref — buffer until merged. */
        this.pendingTweetContent = new Map();
        /** `update` can arrive before `content` or after we processed a non-reply tweet. */
        this.pendingTweetUpdates = new Map();
        this.processedEngagementKeys = new Set();
    }
    isEnabled() {
        if ((0, xquik_env_1.shouldDisableTweetStreamForXquik)()) {
            return false;
        }
        return (0, tweetstream_env_1.isTweetStreamEnabled)() && !!(0, tweetstream_env_1.getTweetStreamApiKey)();
    }
    /**
     * WebSocket + account sync only on the API backend — not the Temporal orchestrator
     * (orchestrator also loads DatabaseModule but must not open the 1 trial WS slot).
     */
    shouldRunConsumer() {
        if (!this.isEnabled()) {
            return false;
        }
        if (!(0, tweetstream_env_1.isPostizBackendWorker)()) {
            return false;
        }
        const runCron = process.env.RUN_CRON === 'true' || process.env.RUN_CRON === '1';
        if (runCron) {
            return true;
        }
        const forceDev = process.env.TWEETSTREAM_START_IN_DEV === 'true' ||
            process.env.TWEETSTREAM_START_IN_DEV === '1';
        return forceDev || process.env.NODE_ENV !== 'production';
    }
    async onModuleInit() {
        if (!this.isEnabled()) {
            return;
        }
        if (!(0, tweetstream_env_1.isPostizBackendWorker)()) {
            this.log.log('TweetStream: orchestrator worker — WebSocket runs on backend only (pnpm run dev:backend).');
            return;
        }
        if (!this.shouldRunConsumer()) {
            return;
        }
        if ((0, x_realtime_env_1.isTweetStreamRealtimeStack)()) {
            this.log.log(`X realtime ingest=tweetstream (AAA subscriptions skipped). ` +
                `Site stream: ${(0, x_activity_stream_env_1.isXActivityStreamEnabled)() ? 'enabled (/api/x/activity-stream)' : 'off — set X_ACTIVITY_STREAM_ENABLED=true'}`);
        }
        try {
            await this.syncMonitoredAccounts();
        }
        catch (err) {
            this.log.error('TweetStream initial account sync failed:', err);
        }
        void this._integrationService
            .syncFollowerDmPollersWithTweetStreamFallback()
            .catch((err) => this.log.error('syncFollowerDmPollersWithTweetStreamFallback:', err));
        if ((0, tweetstream_env_1.isTweetStreamWebSocketDisabled)()) {
            this.log.log('TweetStream WebSocket disabled (TWEETSTREAM_DISABLE_WEBSOCKET=true). REST sync only.');
            this.onWebSocketInactive('ws_disabled');
            return;
        }
        if (TweetStreamService_1.wsStartScheduledGlobal) {
            return;
        }
        TweetStreamService_1.wsStartScheduledGlobal = true;
        if (process.env.NODE_ENV !== 'production') {
            await redis_service_1.ioRedis.del((0, tweetstream_env_1.getTweetStreamWsLeaderRedisKey)());
        }
        const delayMs = (0, tweetstream_env_1.getTweetStreamWsStartDelayMs)();
        this.log.log(`TweetStream WebSocket will start in ${Math.round(delayMs / 1000)}s (avoids 429 after restarts).`);
        this.wsStartTimer = setTimeout(() => {
            void this.startWebSocketConsumer().catch((err) => this.log.error('TweetStream WebSocket start failed:', err));
        }, delayMs);
    }
    onModuleDestroy() {
        if (this.wsStartTimer) {
            clearTimeout(this.wsStartTimer);
            this.wsStartTimer = undefined;
            TweetStreamService_1.wsStartScheduledGlobal = false;
        }
        this.wsClient?.stop();
        this.wsClient = null;
        void this.onWebSocketInactive('shutdown');
        void this.releaseWsLeaderLock();
    }
    onWebSocketActive() {
        void (0, tweetstream_ws_state_1.markTweetStreamWsConsumerActive)();
        if (this.wsActiveRefreshTimer) {
            clearInterval(this.wsActiveRefreshTimer);
        }
        this.wsActiveRefreshTimer = setInterval(() => {
            void (0, tweetstream_ws_state_1.markTweetStreamWsConsumerActive)();
        }, 60_000);
        void this._integrationService
            .syncFollowerDmPollersWithTweetStreamFallback()
            .catch((err) => this.log.error('syncFollowerDmPollersWithTweetStreamFallback:', err));
        this.log.log('TweetStream WebSocket active — realtime follow events enabled; follower-DM poller paused.');
    }
    onWebSocketInactive(reason) {
        if (this.wsActiveRefreshTimer) {
            clearInterval(this.wsActiveRefreshTimer);
            this.wsActiveRefreshTimer = undefined;
        }
        void (0, tweetstream_ws_state_1.clearTweetStreamWsConsumerActive)();
        void this._integrationService
            .syncFollowerDmPollersWithTweetStreamFallback()
            .catch((err) => this.log.error('syncFollowerDmPollersWithTweetStreamFallback:', err));
        if (reason !== 'shutdown') {
            this.log.warn(`TweetStream WebSocket inactive (${reason}) — follower-DM poller fallback will run if orchestrator is up.`);
        }
    }
    async acquireWsLeaderLock() {
        const key = (0, tweetstream_env_1.getTweetStreamWsLeaderRedisKey)();
        const token = `${process.pid}:${Date.now()}`;
        const ok = await redis_service_1.ioRedis.set(key, token, 'EX', 120, 'NX');
        if (ok === 'OK') {
            this.wsLeaderToken = token;
            return true;
        }
        const current = await redis_service_1.ioRedis.get(key);
        if (current) {
            const parts = String(current).split(':');
            const lockPid = Number(parts[0]);
            const startedAt = Number(parts[parts.length - 1]);
            const ageMs = Number.isFinite(startedAt) ? Date.now() - startedAt : 999_999;
            const sameProcess = lockPid === process.pid;
            const devTakeover = process.env.NODE_ENV !== 'production' &&
                Number.isFinite(lockPid) &&
                lockPid !== process.pid;
            if (sameProcess || ageMs > 45_000 || devTakeover) {
                this.log.warn(sameProcess
                    ? 'TweetStream WS duplicate start in this process; reclaiming lock.'
                    : devTakeover
                        ? `TweetStream WS lock from old pid ${lockPid} (current ${process.pid}); taking over in dev.`
                        : `TweetStream WS lock stale (${Math.round(ageMs / 1000)}s, pid ${parts[0]}); taking over.`);
                await redis_service_1.ioRedis.del(key);
                return this.acquireWsLeaderLock();
            }
            this.log.warn(`TweetStream WS lock held by pid ${parts[0]} (${Math.round(ageMs / 1000)}s old). Another backend may be running.`);
        }
        return false;
    }
    async releaseWsLeaderLock() {
        if (!this.wsLeaderToken)
            return;
        const key = (0, tweetstream_env_1.getTweetStreamWsLeaderRedisKey)();
        const current = await redis_service_1.ioRedis.get(key);
        if (current === this.wsLeaderToken) {
            await redis_service_1.ioRedis.del(key);
        }
        this.wsLeaderToken = null;
    }
    async waitForWsSlot(maxWaitMs = 120_000) {
        const client = new tweetstream_api_1.TweetStreamApiClient();
        const deadline = Date.now() + maxWaitMs;
        while (Date.now() < deadline) {
            try {
                const me = await client.getMe();
                const count = me.websocket?.count ?? 0;
                const limit = me.websocket?.limit ?? 1;
                if (count < limit) {
                    return true;
                }
                this.log.warn(`TweetStream WS slots full (${count}/${limit}). Waiting 90s for stale connection to clear...`);
            }
            catch (err) {
                this.log.warn('TweetStream /api/me before WS connect failed:', err);
                return true;
            }
            await new Promise((r) => setTimeout(r, 90_000));
        }
        return false;
    }
    async startWebSocketConsumer() {
        if (!(await this.acquireWsLeaderLock())) {
            this.log.warn('TweetStream WebSocket: could not acquire leader lock. Run: node scripts/tweetstream-cli.mjs clear-ws-lock — then restart backend (one process only).');
            this.onWebSocketInactive('no_leader_lock');
            return;
        }
        const slotOk = await this.waitForWsSlot();
        if (!slotOk) {
            this.log.warn('TweetStream WebSocket: no free slot after waiting. Follower-DM poller fallback will run; fix: stop other WS clients (CLI listen, second backend), then restart.');
            await this.releaseWsLeaderLock();
            this.onWebSocketInactive('no_ws_slot');
            return;
        }
        this.wsClient = new tweetstream_client_1.TweetStreamWebSocketClient((envelope) => this.onEnvelope(envelope), undefined, {
            onOpen: () => this.onWebSocketActive(),
            onClose: () => this.onWebSocketInactive('ws_closed'),
        });
        await this.wsClient.start();
        this.log.log('TweetStream WebSocket consumer starting');
    }
    async getStatus() {
        if (!this.isEnabled()) {
            return { enabled: false };
        }
        const client = new tweetstream_api_1.TweetStreamApiClient();
        const me = await client.getMe();
        const desired = await this.listDesiredHandles();
        return {
            enabled: true,
            me,
            desiredHandleCount: desired.length,
            desiredHandles: desired,
        };
    }
    /** Register Postiz X channel handles on TweetStream (add missing, optional prune). */
    async syncMonitoredAccounts(prune = false) {
        if (!this.isEnabled()) {
            return { desired: [] };
        }
        const desired = await this.listDesiredHandles();
        const client = new tweetstream_api_1.TweetStreamApiClient();
        const me = await client.getMe();
        const tracked = new Set((me.trackedAccounts?.handles ?? []).map((h) => (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(h)));
        const toAdd = desired.filter((h) => !tracked.has(h));
        const addResult = toAdd.length > 0
            ? await client.addAccounts(toAdd)
            : {
                results: [],
                summary: { total: 0, succeeded: 0, failed: 0 },
            };
        let removeResult;
        if (prune) {
            const me = await client.getMe();
            const tracked = (me.trackedAccounts?.handles ?? []).map((h) => (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(h));
            const desiredSet = new Set(desired);
            const toRemove = tracked.filter((h) => h && !desiredSet.has(h));
            if (toRemove.length) {
                removeResult = await client.removeAccounts(toRemove);
            }
        }
        const addedOk = addResult.summary?.succeeded ?? 0;
        const limitFailures = addResult.results?.filter((r) => !r.success &&
            /account limit reached/i.test(String(r.message ?? r.error ?? ''))) ?? [];
        if (limitFailures.length) {
            const tracked = me.trackedAccounts;
            this.log.warn(`TweetStream tracked-account limit (${tracked?.count ?? '?'}/${tracked?.limit ?? '?'}). ` +
                `Could not add: ${limitFailures
                    .map((r) => r.normalizedHandle || r.input)
                    .join(', ')}. ` +
                `Remove unused handles (TweetStream dashboard or tweetstream-cli remove) — WebSocket stays up but events only arrive for already-tracked handles.`);
        }
        this.log.log(`TweetStream sync: desired=${desired.length} added_ok=${addedOk}`);
        return { desired, addResult, removeResult };
    }
    async listDesiredHandles() {
        const rows = await this._integrationRepository.listXIntegrationsForTweetStreamSync();
        const handles = rows
            .map((r) => (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(r.profile ?? ''))
            .filter(Boolean);
        return [...new Set(handles)];
    }
    async onEnvelope(envelope) {
        if (envelope.t === 'tweet' && envelope.op === 'content' && envelope.d) {
            await this.onTweetContent(envelope.d);
            return;
        }
        if (envelope.t === 'tweet' && envelope.op === 'update' && envelope.d) {
            await this.onTweetUpdate(envelope.d);
            return;
        }
        const mapped = (0, tweetstream_mapper_1.mapTweetStreamEnvelope)(envelope);
        if (!mapped) {
            return;
        }
        await this.dispatchMappedRealtime(mapped);
    }
    prunePendingTweets() {
        const now = Date.now();
        for (const [id, entry] of this.pendingTweetContent) {
            if (now - entry.receivedAt > TweetStreamService_1.PENDING_TWEET_TTL_MS) {
                this.pendingTweetContent.delete(id);
            }
        }
        for (const [id, entry] of this.pendingTweetUpdates) {
            if (now - entry.receivedAt > TweetStreamService_1.PENDING_TWEET_TTL_MS) {
                this.pendingTweetUpdates.delete(id);
            }
        }
    }
    cacheTweetContent(tweet) {
        const tweetId = String(tweet.tweetId ?? '').trim();
        if (!tweetId) {
            return;
        }
        this.prunePendingTweets();
        this.pendingTweetContent.set(tweetId, {
            tweet,
            receivedAt: Date.now(),
        });
    }
    needsTweetUpdateBeforeProcess(tweet) {
        const ref = tweet.ref;
        if (!ref?.type || ref.type === 'quote') {
            return false;
        }
        if (ref.type !== 'reply' && ref.type !== 'retweet') {
            return false;
        }
        return !String(ref.tweetId ?? '').trim();
    }
    engagementDedupKey(tweet) {
        const engagerId = String(tweet.author?.id ?? '').trim();
        const parentId = String(tweet.ref?.tweetId ?? '').trim();
        const kind = tweet.ref?.type;
        if (!engagerId || !parentId || (kind !== 'reply' && kind !== 'retweet')) {
            return null;
        }
        return `${kind}:${parentId}:${engagerId}`;
    }
    markEngagementProcessed(key) {
        if (this.processedEngagementKeys.has(key)) {
            return false;
        }
        if (this.processedEngagementKeys.size >=
            TweetStreamService_1.PROCESSED_ENGAGEMENT_MAX) {
            this.processedEngagementKeys.clear();
        }
        this.processedEngagementKeys.add(key);
        return true;
    }
    mergeContentWithUpdate(tweet, update) {
        return {
            ...tweet,
            text: update.text ?? tweet.text,
            ref: this.mergeTweetRef(tweet.ref, update.ref),
        };
    }
    async onTweetContent(tweet) {
        this.cacheTweetContent(tweet);
        const tweetId = String(tweet.tweetId ?? '').trim();
        const bufferedUpdate = tweetId
            ? this.pendingTweetUpdates.get(tweetId)
            : undefined;
        if (bufferedUpdate) {
            this.pendingTweetUpdates.delete(tweetId);
            this.pendingTweetContent.delete(tweetId);
            const merged = this.mergeContentWithUpdate(tweet, bufferedUpdate.update);
            await this.processTweetContent(merged);
            return;
        }
        if (this.needsTweetUpdateBeforeProcess(tweet)) {
            return;
        }
        await this.processTweetContent(tweet);
        if (tweetId) {
            this.pendingTweetContent.delete(tweetId);
        }
    }
    mergeTweetRef(base, patch) {
        if (!patch) {
            return base;
        }
        if (!base) {
            return patch;
        }
        return {
            ...base,
            ...patch,
            type: patch.type ?? base.type,
            tweetId: patch.tweetId ?? base.tweetId,
            text: patch.text ?? base.text,
            author: patch.author ?? base.author,
        };
    }
    async onTweetUpdate(update) {
        const tweetId = String(update.tweetId ?? '').trim();
        if (!tweetId) {
            return;
        }
        this.prunePendingTweets();
        const pending = this.pendingTweetContent.get(tweetId);
        if (pending) {
            this.pendingTweetContent.delete(tweetId);
            this.pendingTweetUpdates.delete(tweetId);
            const merged = this.mergeContentWithUpdate(pending.tweet, update);
            if (!merged.author?.id) {
                this.log.warn(`TweetStream: merged update for tweet ${tweetId} missing author.id — cannot map reply/RT`);
                return;
            }
            const parentId = String(merged.ref?.tweetId ?? '').trim();
            if (merged.ref?.type === 'reply' || merged.ref?.type === 'retweet') {
                this.log.log(`TweetStream: update ${merged.ref?.type} tweet ${tweetId} → parent ${parentId || '(pending)'}`);
            }
            await this.processTweetContent(merged);
            return;
        }
        const isEngagementRef = update.ref?.type === 'reply' || update.ref?.type === 'retweet';
        if (isEngagementRef) {
            this.pendingTweetUpdates.set(tweetId, {
                update,
                receivedAt: Date.now(),
            });
            this.log.log(`TweetStream: buffering ${update.ref?.type} update for tweet ${tweetId} until content envelope arrives`);
            return;
        }
        // URL expansion / media on own posts — no content buffer left; safe to ignore.
    }
    async processTweetContent(tweet) {
        const ref = tweet.ref;
        if ((ref?.type === 'reply' || ref?.type === 'retweet') &&
            tweet.author?.id) {
            this.log.log(`TweetStream: inbound ${ref.type} from @${(0, tweetstream_normalize_1.normalizeTweetStreamHandle)(tweet.author?.handle) || tweet.author?.id} ` +
                `→ @${(0, tweetstream_normalize_1.normalizeTweetStreamHandle)(ref.author?.handle) || '?'} parent=${ref.tweetId || '(no id yet)'}`);
        }
        const dedupKey = this.engagementDedupKey(tweet);
        if (dedupKey && !this.markEngagementProcessed(dedupKey)) {
            return;
        }
        let mapped = (0, tweetstream_mapper_1.mapTweetStreamEnvelope)({
            t: 'tweet',
            op: 'content',
            d: tweet,
        });
        if (!mapped) {
            mapped = await this.resolveMappedFromPublishedPost(tweet);
        }
        if (!mapped) {
            mapped = await this.resolveMappedWithInferredParent(tweet);
        }
        if (!mapped && tweet.ref?.tweetId) {
            const parentAuthor = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(tweet.ref.author?.handle);
            if (parentAuthor &&
                (tweet.ref.type === 'reply' || tweet.ref.type === 'retweet')) {
                mapped = (0, tweetstream_mapper_1.buildMappedFromTweetContent)(tweet, parentAuthor);
                if (mapped) {
                    this.log.log(`TweetStream: mapped ${tweet.ref?.type} on @${parentAuthor} via ref.author (parent tweet ${tweet.ref.tweetId})`);
                }
            }
        }
        if (!mapped) {
            if ((0, tweetstream_env_1.isTweetStreamPublishEvents)()) {
                void this.publishRawTweetEnvelope(tweet, await this.rawUnmappedReason(tweet)).catch((err) => this.log.error('publishRawTweetEnvelope:', err));
            }
            return;
        }
        await this.dispatchMappedRealtime(mapped);
    }
    async dispatchMappedRealtime(mapped) {
        if ((0, tweetstream_env_1.isTweetStreamPublishEvents)()) {
            void this.publishRecentEvent(mapped.monitoredHandle, mapped).catch((err) => this.log.error('publishRecentEvent:', err));
        }
        await this._handler.handleTweetStreamPayload(mapped.monitoredHandle, mapped.payload);
        const releaseId = mapped.eventSummary?.tweetId?.trim();
        const kind = mapped.eventSummary?.kind;
        if (releaseId &&
            (kind === 'reply' || kind === 'retweet') &&
            !(await (0, tweetstream_ws_state_1.isTweetStreamWsConsumerActive)())) {
            void this.triggerImmediateEngagementPlugs(mapped.monitoredHandle, releaseId).catch((err) => this.log.error('triggerImmediateEngagementPlugs:', err));
        }
        else if (releaseId && (kind === 'reply' || kind === 'retweet')) {
            this.log.log(`TweetStream: ${kind} on ${mapped.monitoredHandle} tweet ${releaseId} — realtime DM handled via WebSocket (skipped poller liker fetch)`);
        }
    }
    /**
     * Likes are not on the TweetStream socket; run autoDmEngagers once immediately
     * when a reply/RT arrives so recent likers are picked up without waiting for the poller.
     */
    async triggerImmediateEngagementPlugs(monitoredHandle, releaseId) {
        const handle = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(monitoredHandle);
        if (!handle) {
            return;
        }
        const integrations = await this._integrationRepository.findActiveXIntegrationsByProfile(handle);
        for (const integration of integrations) {
            await this._integrationService.runEngagementPlugsForReleaseId(integration.organizationId, integration.id, releaseId);
        }
    }
    /**
     * TweetStream replies often lack ref.author; match parent tweet id to a Postiz post.
     */
    async resolveMappedFromPublishedPost(tweet) {
        const ref = tweet.ref;
        if (!ref?.tweetId || (ref.type !== 'reply' && ref.type !== 'retweet')) {
            return null;
        }
        const releaseId = String(ref.tweetId).trim();
        const channels = await this._integrationRepository.findXChannelsByPostReleaseId(releaseId);
        for (const channel of channels) {
            const handle = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(channel.profile ?? '');
            if (!handle)
                continue;
            const built = (0, tweetstream_mapper_1.buildMappedFromTweetContent)(tweet, handle);
            if (built) {
                this.log.log(`TweetStream: mapped ${ref.type} on ${handle} via post releaseId ${releaseId}`);
                return built;
            }
        }
        if (channels.length === 0) {
            this.log.warn(`TweetStream: parent tweet ${releaseId} not in Postiz DB (releaseId on published post row?)`);
        }
        return null;
    }
    /**
     * TweetStream often sends ref.author without ref.tweetId on `content`; infer parent
     * when exactly one recent Postiz-published post exists on that channel.
     */
    async resolveMappedWithInferredParent(tweet) {
        const ref = tweet.ref;
        if (ref?.type !== 'reply' && ref?.type !== 'retweet') {
            return null;
        }
        const parentAuthor = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(ref?.author?.handle);
        if (!parentAuthor) {
            return null;
        }
        if (String(ref?.tweetId ?? '').trim()) {
            return null;
        }
        const recent = await this._integrationRepository.findRecentPublishedXPostsByProfile(parentAuthor, 72, 10);
        if (!recent.length) {
            return null;
        }
        let chosen = recent.length === 1 ? recent[0] : null;
        const refText = (ref?.text ?? '').trim().toLowerCase();
        if (!chosen && refText) {
            chosen =
                recent.find((p) => {
                    const content = (p.content ?? '').trim().toLowerCase();
                    return (content &&
                        (content.includes(refText) ||
                            refText.includes(content.slice(0, 80))));
                }) ?? null;
        }
        if (!chosen) {
            chosen = recent[0];
            this.log.warn(`TweetStream: reply on @${parentAuthor} without parent tweet id — using latest Postiz post ${chosen.releaseId} (${recent.length} recent posts)`);
        }
        const releaseId = String(chosen.releaseId ?? '').trim();
        if (!releaseId) {
            return null;
        }
        const enriched = {
            ...tweet,
            ref: { ...ref, tweetId: releaseId },
        };
        const built = (0, tweetstream_mapper_1.buildMappedFromTweetContent)(enriched, parentAuthor);
        if (built) {
            this.log.log(`TweetStream: mapped ${ref.type} on @${parentAuthor} via inferred Postiz post releaseId ${releaseId}`);
        }
        return built;
    }
    async rawUnmappedReason(tweet) {
        const ref = tweet.ref;
        if (ref?.type === 'reply' || ref?.type === 'retweet') {
            const parentAuthor = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(ref.author?.handle);
            const parentId = String(ref.tweetId ?? '').trim();
            if (!parentId && parentAuthor) {
                const recent = await this._integrationRepository.findRecentPublishedXPostsByProfile(parentAuthor, 72, 5);
                if (recent.length === 0) {
                    return `Reply to @${parentAuthor} but no parent tweet id from TweetStream and no recent Postiz-published posts to infer from.`;
                }
                if (recent.length > 1) {
                    return `Reply to @${parentAuthor} without parent tweet id; ${recent.length} recent Postiz posts — restart backend for inference fix, or wait for TweetStream update envelope.`;
                }
            }
            if (parentId) {
                const channels = await this._integrationRepository.findXChannelsByPostReleaseId(parentId);
                if (!channels.length) {
                    return `Parent tweet ${parentId} not linked in Postiz (releaseId missing on queue row?). Use attach-published-tweet if posted outside Postiz.`;
                }
            }
            if (!parentAuthor) {
                return 'Reply/RT without ref.author — wait for TweetStream update envelope or restart backend.';
            }
        }
        return 'Not a reply/RT to a mapped channel, or channel author tweet (own posts are not auto-DM targets).';
    }
    async publishRawTweetEnvelope(tweet, note) {
        const key = (0, tweetstream_env_1.getTweetStreamRecentEventsRedisKey)();
        const max = (0, tweetstream_env_1.getTweetStreamRecentEventsMax)();
        const entry = {
            ts: Date.now(),
            kind: 'raw',
            authorHandle: (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(tweet.author?.handle),
            authorId: tweet.author?.id,
            refType: tweet.ref?.type,
            refTweetId: tweet.ref?.tweetId,
            refAuthorHandle: (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(tweet.ref?.author?.handle),
            textPreview: (tweet.text ?? '').slice(0, 120),
            note: note ??
                'Received on WebSocket but not mapped to a Postiz channel.',
        };
        await redis_service_1.ioRedis
            .multi()
            .lpush(key, JSON.stringify(entry))
            .ltrim(key, 0, max - 1)
            .exec();
    }
    async publishRecentEvent(monitoredHandle, mapped) {
        const integrations = await this._integrationRepository.findActiveXIntegrationsByProfile(monitoredHandle);
        const entry = {
            ts: Date.now(),
            monitoredHandle,
            integrationIds: integrations.map((i) => i.id),
            organizationIds: [...new Set(integrations.map((i) => i.organizationId))],
            ...mapped.eventSummary,
        };
        const key = (0, tweetstream_env_1.getTweetStreamRecentEventsRedisKey)();
        const max = (0, tweetstream_env_1.getTweetStreamRecentEventsMax)();
        await redis_service_1.ioRedis
            .multi()
            .lpush(key, JSON.stringify(entry))
            .ltrim(key, 0, max - 1)
            .exec();
    }
    async listRecentEvents(limit = 50) {
        const key = (0, tweetstream_env_1.getTweetStreamRecentEventsRedisKey)();
        const raw = await redis_service_1.ioRedis.lrange(key, 0, Math.max(0, limit - 1));
        return raw
            .map((line) => {
            try {
                return JSON.parse(line);
            }
            catch {
                return null;
            }
        })
            .filter(Boolean);
    }
    async clearRecentEvents() {
        const key = (0, tweetstream_env_1.getTweetStreamRecentEventsRedisKey)();
        const cleared = await redis_service_1.ioRedis.del(key);
        return { cleared };
    }
};
exports.TweetStreamService = TweetStreamService;
TweetStreamService.wsStartScheduledGlobal = false;
TweetStreamService.PENDING_TWEET_TTL_MS = 120_000;
TweetStreamService.PROCESSED_ENGAGEMENT_MAX = 10_000;
exports.TweetStreamService = TweetStreamService = TweetStreamService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => integration_service_1.IntegrationService))),
    tslib_1.__metadata("design:paramtypes", [integration_repository_1.IntegrationRepository,
        x_account_activity_handler_1.XAccountActivityHandler,
        integration_service_1.IntegrationService])
], TweetStreamService);
//# sourceMappingURL=tweetstream.service.js.map