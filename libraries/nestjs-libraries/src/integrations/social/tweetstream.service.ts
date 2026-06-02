import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { shouldDisableTweetStreamForXquik } from '@gitroom/helpers/x/xquik.env';
import {
  getTweetStreamApiKey,
  getTweetStreamRecentEventsMax,
  getTweetStreamRecentEventsRedisKey,
  getTweetStreamWsLeaderRedisKey,
  getTweetStreamWsStartDelayMs,
  isTweetStreamEnabled,
  isTweetStreamPublishEvents,
  isTweetStreamWebSocketDisabled,
  isPostizBackendWorker,
} from '@gitroom/helpers/x/tweetstream.env';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { XAccountActivityHandler } from '@gitroom/nestjs-libraries/integrations/social/x.account-activity.handler';
import { isXActivityStreamEnabled } from '@gitroom/helpers/x/x.activity-stream.env';
import { isTweetStreamRealtimeStack } from '@gitroom/helpers/x/x.realtime.env';
import {
  TweetStreamAccountOpResult,
  TweetStreamApiClient,
} from '@gitroom/nestjs-libraries/integrations/social/tweetstream.api';
import { TweetStreamWebSocketClient } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.client';
import {
  buildMappedFromTweetContent,
  mapTweetStreamEnvelope,
} from '@gitroom/nestjs-libraries/integrations/social/tweetstream.mapper';
import {
  TweetStreamEnvelope,
  TweetStreamTweetContent,
  TweetStreamTweetUpdate,
} from '@gitroom/nestjs-libraries/integrations/social/tweetstream.types';
import { normalizeTweetStreamHandle } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.normalize';
import {
  clearTweetStreamWsConsumerActive,
  isTweetStreamWsConsumerActive,
  markTweetStreamWsConsumerActive,
} from '@gitroom/nestjs-libraries/integrations/social/tweetstream.ws-state';

@Injectable()
export class TweetStreamService implements OnModuleInit, OnModuleDestroy {
  private static wsStartScheduledGlobal = false;

  private readonly log = new Logger(TweetStreamService.name);
  private wsClient: TweetStreamWebSocketClient | null = null;
  private wsLeaderToken: string | null = null;
  private wsStartTimer: ReturnType<typeof setTimeout> | undefined;
  private wsActiveRefreshTimer: ReturnType<typeof setInterval> | undefined;
  /** TweetStream sends `content` before `update` with reply ref — buffer until merged. */
  private readonly pendingTweetContent = new Map<
    string,
    { tweet: TweetStreamTweetContent; receivedAt: number }
  >();
  /** `update` can arrive before `content` or after we processed a non-reply tweet. */
  private readonly pendingTweetUpdates = new Map<
    string,
    { update: TweetStreamTweetUpdate; receivedAt: number }
  >();
  private readonly processedEngagementKeys = new Set<string>();
  private static readonly PENDING_TWEET_TTL_MS = 120_000;
  private static readonly PROCESSED_ENGAGEMENT_MAX = 10_000;

  constructor(
    private readonly _integrationRepository: IntegrationRepository,
    private readonly _handler: XAccountActivityHandler,
    @Inject(forwardRef(() => IntegrationService))
    private readonly _integrationService: IntegrationService
  ) {}

  isEnabled(): boolean {
    if (shouldDisableTweetStreamForXquik()) {
      return false;
    }
    return isTweetStreamEnabled() && !!getTweetStreamApiKey();
  }

  /**
   * WebSocket + account sync only on the API backend — not the Temporal orchestrator
   * (orchestrator also loads DatabaseModule but must not open the 1 trial WS slot).
   */
  shouldRunConsumer(): boolean {
    if (!this.isEnabled()) {
      return false;
    }
    if (!isPostizBackendWorker()) {
      return false;
    }
    const runCron =
      process.env.RUN_CRON === 'true' || process.env.RUN_CRON === '1';
    if (runCron) {
      return true;
    }
    const forceDev =
      process.env.TWEETSTREAM_START_IN_DEV === 'true' ||
      process.env.TWEETSTREAM_START_IN_DEV === '1';
    return forceDev || process.env.NODE_ENV !== 'production';
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    if (!isPostizBackendWorker()) {
      this.log.log(
        'TweetStream: orchestrator worker — WebSocket runs on backend only (pnpm run dev:backend).'
      );
      return;
    }
    if (!this.shouldRunConsumer()) {
      return;
    }

    if (isTweetStreamRealtimeStack()) {
      this.log.log(
        `X realtime ingest=tweetstream (AAA subscriptions skipped). ` +
          `Site stream: ${isXActivityStreamEnabled() ? 'enabled (/api/x/activity-stream)' : 'off — set X_ACTIVITY_STREAM_ENABLED=true'}`
      );
    }

    try {
      await this.syncMonitoredAccounts();
    } catch (err) {
      this.log.error('TweetStream initial account sync failed:', err);
    }

    void this._integrationService
      .syncFollowerDmPollersWithTweetStreamFallback()
      .catch((err) =>
        this.log.error('syncFollowerDmPollersWithTweetStreamFallback:', err)
      );

    if (isTweetStreamWebSocketDisabled()) {
      this.log.log(
        'TweetStream WebSocket disabled (TWEETSTREAM_DISABLE_WEBSOCKET=true). REST sync only.'
      );
      this.onWebSocketInactive('ws_disabled');
      return;
    }

    if (TweetStreamService.wsStartScheduledGlobal) {
      return;
    }
    TweetStreamService.wsStartScheduledGlobal = true;

    if (process.env.NODE_ENV !== 'production') {
      await ioRedis.del(getTweetStreamWsLeaderRedisKey());
    }

    const delayMs = getTweetStreamWsStartDelayMs();
    this.log.log(
      `TweetStream WebSocket will start in ${Math.round(delayMs / 1000)}s (avoids 429 after restarts).`
    );
    this.wsStartTimer = setTimeout(() => {
      void this.startWebSocketConsumer().catch((err) =>
        this.log.error('TweetStream WebSocket start failed:', err)
      );
    }, delayMs);
  }

  onModuleDestroy(): void {
    if (this.wsStartTimer) {
      clearTimeout(this.wsStartTimer);
      this.wsStartTimer = undefined;
      TweetStreamService.wsStartScheduledGlobal = false;
    }
    this.wsClient?.stop();
    this.wsClient = null;
    void this.onWebSocketInactive('shutdown');
    void this.releaseWsLeaderLock();
  }

  private onWebSocketActive(): void {
    void markTweetStreamWsConsumerActive();
    if (this.wsActiveRefreshTimer) {
      clearInterval(this.wsActiveRefreshTimer);
    }
    this.wsActiveRefreshTimer = setInterval(() => {
      void markTweetStreamWsConsumerActive();
    }, 60_000);
    void this._integrationService
      .syncFollowerDmPollersWithTweetStreamFallback()
      .catch((err) =>
        this.log.error('syncFollowerDmPollersWithTweetStreamFallback:', err)
      );
    this.log.log(
      'TweetStream WebSocket active — realtime follow events enabled; follower-DM poller paused.'
    );
  }

  private onWebSocketInactive(reason: string): void {
    if (this.wsActiveRefreshTimer) {
      clearInterval(this.wsActiveRefreshTimer);
      this.wsActiveRefreshTimer = undefined;
    }
    void clearTweetStreamWsConsumerActive();
    void this._integrationService
      .syncFollowerDmPollersWithTweetStreamFallback()
      .catch((err) =>
        this.log.error('syncFollowerDmPollersWithTweetStreamFallback:', err)
      );
    if (reason !== 'shutdown') {
      this.log.warn(
        `TweetStream WebSocket inactive (${reason}) — follower-DM poller fallback will run if orchestrator is up.`
      );
    }
  }

  private async acquireWsLeaderLock(): Promise<boolean> {
    const key = getTweetStreamWsLeaderRedisKey();
    const token = `${process.pid}:${Date.now()}`;
    const ok = await ioRedis.set(key, token, 'EX', 120, 'NX');
    if (ok === 'OK') {
      this.wsLeaderToken = token;
      return true;
    }

    const current = await ioRedis.get(key);
    if (current) {
      const parts = String(current).split(':');
      const lockPid = Number(parts[0]);
      const startedAt = Number(parts[parts.length - 1]);
      const ageMs = Number.isFinite(startedAt) ? Date.now() - startedAt : 999_999;
      const sameProcess = lockPid === process.pid;
      const devTakeover =
        process.env.NODE_ENV !== 'production' &&
        Number.isFinite(lockPid) &&
        lockPid !== process.pid;
      if (sameProcess || ageMs > 45_000 || devTakeover) {
        this.log.warn(
          sameProcess
            ? 'TweetStream WS duplicate start in this process; reclaiming lock.'
            : devTakeover
              ? `TweetStream WS lock from old pid ${lockPid} (current ${process.pid}); taking over in dev.`
              : `TweetStream WS lock stale (${Math.round(ageMs / 1000)}s, pid ${parts[0]}); taking over.`
        );
        await ioRedis.del(key);
        return this.acquireWsLeaderLock();
      }
      this.log.warn(
        `TweetStream WS lock held by pid ${parts[0]} (${Math.round(ageMs / 1000)}s old). Another backend may be running.`
      );
    }
    return false;
  }

  private async releaseWsLeaderLock(): Promise<void> {
    if (!this.wsLeaderToken) return;
    const key = getTweetStreamWsLeaderRedisKey();
    const current = await ioRedis.get(key);
    if (current === this.wsLeaderToken) {
      await ioRedis.del(key);
    }
    this.wsLeaderToken = null;
  }

  private async waitForWsSlot(maxWaitMs = 120_000): Promise<boolean> {
    const client = new TweetStreamApiClient();
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      try {
        const me = await client.getMe();
        const count = me.websocket?.count ?? 0;
        const limit = me.websocket?.limit ?? 1;
        if (count < limit) {
          return true;
        }
        this.log.warn(
          `TweetStream WS slots full (${count}/${limit}). Waiting 90s for stale connection to clear...`
        );
      } catch (err) {
        this.log.warn('TweetStream /api/me before WS connect failed:', err);
        return true;
      }
      await new Promise((r) => setTimeout(r, 90_000));
    }
    return false;
  }

  private async startWebSocketConsumer(): Promise<void> {
    if (!(await this.acquireWsLeaderLock())) {
      this.log.warn(
        'TweetStream WebSocket: could not acquire leader lock. Run: node scripts/tweetstream-cli.mjs clear-ws-lock — then restart backend (one process only).'
      );
      this.onWebSocketInactive('no_leader_lock');
      return;
    }

    const slotOk = await this.waitForWsSlot();
    if (!slotOk) {
      this.log.warn(
        'TweetStream WebSocket: no free slot after waiting. Follower-DM poller fallback will run; fix: stop other WS clients (CLI listen, second backend), then restart.'
      );
      await this.releaseWsLeaderLock();
      this.onWebSocketInactive('no_ws_slot');
      return;
    }

    this.wsClient = new TweetStreamWebSocketClient(
      (envelope) => this.onEnvelope(envelope),
      undefined,
      {
        onOpen: () => this.onWebSocketActive(),
        onClose: () => this.onWebSocketInactive('ws_closed'),
      }
    );
    await this.wsClient.start();
    this.log.log('TweetStream WebSocket consumer starting');
  }

  async getStatus() {
    if (!this.isEnabled()) {
      return { enabled: false };
    }
    const client = new TweetStreamApiClient();
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
  async syncMonitoredAccounts(prune = false): Promise<{
    desired: string[];
    addResult?: Awaited<ReturnType<TweetStreamApiClient['addAccounts']>>;
    removeResult?: Awaited<ReturnType<TweetStreamApiClient['removeAccounts']>>;
  }> {
    if (!this.isEnabled()) {
      return { desired: [] };
    }

    const desired = await this.listDesiredHandles();
    const client = new TweetStreamApiClient();
    const me = await client.getMe();
    const tracked = new Set(
      (me.trackedAccounts?.handles ?? []).map((h) =>
        normalizeTweetStreamHandle(h)
      )
    );
    const toAdd = desired.filter((h) => !tracked.has(h));
    const addResult: TweetStreamAccountOpResult =
      toAdd.length > 0
        ? await client.addAccounts(toAdd)
        : {
            results: [],
            summary: { total: 0, succeeded: 0, failed: 0 },
          };

    let removeResult;
    if (prune) {
      const me = await client.getMe();
      const tracked = (me.trackedAccounts?.handles ?? []).map((h) =>
        normalizeTweetStreamHandle(h)
      );
      const desiredSet = new Set(desired);
      const toRemove = tracked.filter((h) => h && !desiredSet.has(h));
      if (toRemove.length) {
        removeResult = await client.removeAccounts(toRemove);
      }
    }

    const addedOk = addResult.summary?.succeeded ?? 0;
    const limitFailures =
      addResult.results?.filter(
        (r) =>
          !r.success &&
          /account limit reached/i.test(String(r.message ?? r.error ?? ''))
      ) ?? [];

    if (limitFailures.length) {
      const tracked = me.trackedAccounts;
      this.log.warn(
        `TweetStream tracked-account limit (${tracked?.count ?? '?'}/${tracked?.limit ?? '?'}). ` +
          `Could not add: ${limitFailures
            .map((r) => r.normalizedHandle || r.input)
            .join(', ')}. ` +
          `Remove unused handles (TweetStream dashboard or tweetstream-cli remove) — WebSocket stays up but events only arrive for already-tracked handles.`
      );
    }

    this.log.log(`TweetStream sync: desired=${desired.length} added_ok=${addedOk}`);

    return { desired, addResult, removeResult };
  }

  private async listDesiredHandles(): Promise<string[]> {
    const rows =
      await this._integrationRepository.listXIntegrationsForTweetStreamSync();
    const handles = rows
      .map((r) => normalizeTweetStreamHandle(r.profile ?? ''))
      .filter(Boolean);
    return [...new Set(handles)];
  }

  private async onEnvelope(envelope: TweetStreamEnvelope): Promise<void> {
    if (envelope.t === 'tweet' && envelope.op === 'content' && envelope.d) {
      await this.onTweetContent(envelope.d as TweetStreamTweetContent);
      return;
    }
    if (envelope.t === 'tweet' && envelope.op === 'update' && envelope.d) {
      await this.onTweetUpdate(envelope.d as TweetStreamTweetUpdate);
      return;
    }

    const mapped = mapTweetStreamEnvelope(envelope);
    if (!mapped) {
      return;
    }
    await this.dispatchMappedRealtime(mapped);
  }

  private prunePendingTweets(): void {
    const now = Date.now();
    for (const [id, entry] of this.pendingTweetContent) {
      if (now - entry.receivedAt > TweetStreamService.PENDING_TWEET_TTL_MS) {
        this.pendingTweetContent.delete(id);
      }
    }
    for (const [id, entry] of this.pendingTweetUpdates) {
      if (now - entry.receivedAt > TweetStreamService.PENDING_TWEET_TTL_MS) {
        this.pendingTweetUpdates.delete(id);
      }
    }
  }

  private cacheTweetContent(tweet: TweetStreamTweetContent): void {
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

  private needsTweetUpdateBeforeProcess(tweet: TweetStreamTweetContent): boolean {
    const ref = tweet.ref;
    if (!ref?.type || ref.type === 'quote') {
      return false;
    }
    if (ref.type !== 'reply' && ref.type !== 'retweet') {
      return false;
    }
    return !String(ref.tweetId ?? '').trim();
  }

  private engagementDedupKey(tweet: TweetStreamTweetContent): string | null {
    const engagerId = String(tweet.author?.id ?? '').trim();
    const parentId = String(tweet.ref?.tweetId ?? '').trim();
    const kind = tweet.ref?.type;
    if (!engagerId || !parentId || (kind !== 'reply' && kind !== 'retweet')) {
      return null;
    }
    return `${kind}:${parentId}:${engagerId}`;
  }

  private markEngagementProcessed(key: string): boolean {
    if (this.processedEngagementKeys.has(key)) {
      return false;
    }
    if (
      this.processedEngagementKeys.size >=
      TweetStreamService.PROCESSED_ENGAGEMENT_MAX
    ) {
      this.processedEngagementKeys.clear();
    }
    this.processedEngagementKeys.add(key);
    return true;
  }

  private mergeContentWithUpdate(
    tweet: TweetStreamTweetContent,
    update: TweetStreamTweetUpdate
  ): TweetStreamTweetContent {
    return {
      ...tweet,
      text: update.text ?? tweet.text,
      ref: this.mergeTweetRef(tweet.ref, update.ref),
    };
  }

  private async onTweetContent(tweet: TweetStreamTweetContent): Promise<void> {
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

  private mergeTweetRef(
    base: TweetStreamTweetContent['ref'],
    patch: TweetStreamTweetContent['ref']
  ): TweetStreamTweetContent['ref'] {
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

  private async onTweetUpdate(update: TweetStreamTweetUpdate): Promise<void> {
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
        this.log.warn(
          `TweetStream: merged update for tweet ${tweetId} missing author.id — cannot map reply/RT`
        );
        return;
      }
      const parentId = String(merged.ref?.tweetId ?? '').trim();
      if (merged.ref?.type === 'reply' || merged.ref?.type === 'retweet') {
        this.log.log(
          `TweetStream: update ${merged.ref?.type} tweet ${tweetId} → parent ${parentId || '(pending)'}`
        );
      }
      await this.processTweetContent(merged);
      return;
    }

    const isEngagementRef =
      update.ref?.type === 'reply' || update.ref?.type === 'retweet';
    if (isEngagementRef) {
      this.pendingTweetUpdates.set(tweetId, {
        update,
        receivedAt: Date.now(),
      });
      this.log.log(
        `TweetStream: buffering ${update.ref?.type} update for tweet ${tweetId} until content envelope arrives`
      );
      return;
    }

    // URL expansion / media on own posts — no content buffer left; safe to ignore.
  }

  private async processTweetContent(
    tweet: TweetStreamTweetContent
  ): Promise<void> {
    const ref = tweet.ref;
    if (
      (ref?.type === 'reply' || ref?.type === 'retweet') &&
      tweet.author?.id
    ) {
      this.log.log(
        `TweetStream: inbound ${ref.type} from @${normalizeTweetStreamHandle(tweet.author?.handle) || tweet.author?.id} ` +
          `→ @${normalizeTweetStreamHandle(ref.author?.handle) || '?'} parent=${ref.tweetId || '(no id yet)'}`
      );
    }

    const dedupKey = this.engagementDedupKey(tweet);
    if (dedupKey && !this.markEngagementProcessed(dedupKey)) {
      return;
    }

    let mapped = mapTweetStreamEnvelope({
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
      const parentAuthor = normalizeTweetStreamHandle(tweet.ref.author?.handle);
      if (
        parentAuthor &&
        (tweet.ref.type === 'reply' || tweet.ref.type === 'retweet')
      ) {
        mapped = buildMappedFromTweetContent(tweet, parentAuthor);
        if (mapped) {
          this.log.log(
            `TweetStream: mapped ${tweet.ref?.type} on @${parentAuthor} via ref.author (parent tweet ${tweet.ref.tweetId})`
          );
        }
      }
    }

    if (!mapped) {
      if (isTweetStreamPublishEvents()) {
        void this.publishRawTweetEnvelope(tweet, await this.rawUnmappedReason(tweet)).catch(
          (err) => this.log.error('publishRawTweetEnvelope:', err)
        );
      }
      return;
    }

    await this.dispatchMappedRealtime(mapped);
  }

  private async dispatchMappedRealtime(
    mapped: NonNullable<ReturnType<typeof mapTweetStreamEnvelope>>
  ): Promise<void> {
    if (isTweetStreamPublishEvents()) {
      void this.publishRecentEvent(mapped.monitoredHandle, mapped).catch((err) =>
        this.log.error('publishRecentEvent:', err)
      );
    }

    await this._handler.handleTweetStreamPayload(
      mapped.monitoredHandle,
      mapped.payload
    );

    const releaseId = mapped.eventSummary?.tweetId?.trim();
    const kind = mapped.eventSummary?.kind;
    if (
      releaseId &&
      (kind === 'reply' || kind === 'retweet') &&
      !(await isTweetStreamWsConsumerActive())
    ) {
      void this.triggerImmediateEngagementPlugs(
        mapped.monitoredHandle,
        releaseId
      ).catch((err) =>
        this.log.error('triggerImmediateEngagementPlugs:', err)
      );
    } else if (releaseId && (kind === 'reply' || kind === 'retweet')) {
      this.log.log(
        `TweetStream: ${kind} on ${mapped.monitoredHandle} tweet ${releaseId} — realtime DM handled via WebSocket (skipped poller liker fetch)`
      );
    }
  }

  /**
   * Likes are not on the TweetStream socket; run autoDmEngagers once immediately
   * when a reply/RT arrives so recent likers are picked up without waiting for the poller.
   */
  private async triggerImmediateEngagementPlugs(
    monitoredHandle: string,
    releaseId: string
  ): Promise<void> {
    const handle = normalizeTweetStreamHandle(monitoredHandle);
    if (!handle) {
      return;
    }
    const integrations =
      await this._integrationRepository.findActiveXIntegrationsByProfile(handle);
    for (const integration of integrations) {
      await this._integrationService.runEngagementPlugsForReleaseId(
        integration.organizationId,
        integration.id,
        releaseId
      );
    }
  }

  /**
   * TweetStream replies often lack ref.author; match parent tweet id to a Postiz post.
   */
  private async resolveMappedFromPublishedPost(
    tweet: TweetStreamTweetContent
  ): Promise<ReturnType<typeof mapTweetStreamEnvelope>> {
    const ref = tweet.ref;
    if (!ref?.tweetId || (ref.type !== 'reply' && ref.type !== 'retweet')) {
      return null;
    }
    const releaseId = String(ref.tweetId).trim();
    const channels =
      await this._integrationRepository.findXChannelsByPostReleaseId(releaseId);
    for (const channel of channels) {
      const handle = normalizeTweetStreamHandle(channel.profile ?? '');
      if (!handle) continue;
      const built = buildMappedFromTweetContent(tweet, handle);
      if (built) {
        this.log.log(
          `TweetStream: mapped ${ref.type} on ${handle} via post releaseId ${releaseId}`
        );
        return built;
      }
    }
    if (channels.length === 0) {
      this.log.warn(
        `TweetStream: parent tweet ${releaseId} not in Postiz DB (releaseId on published post row?)`
      );
    }
    return null;
  }

  /**
   * TweetStream often sends ref.author without ref.tweetId on `content`; infer parent
   * when exactly one recent Postiz-published post exists on that channel.
   */
  private async resolveMappedWithInferredParent(
    tweet: TweetStreamTweetContent
  ): Promise<ReturnType<typeof mapTweetStreamEnvelope>> {
    const ref = tweet.ref;
    if (ref?.type !== 'reply' && ref?.type !== 'retweet') {
      return null;
    }
    const parentAuthor = normalizeTweetStreamHandle(ref?.author?.handle);
    if (!parentAuthor) {
      return null;
    }
    if (String(ref?.tweetId ?? '').trim()) {
      return null;
    }

    const recent =
      await this._integrationRepository.findRecentPublishedXPostsByProfile(
        parentAuthor,
        72,
        10
      );
    if (!recent.length) {
      return null;
    }

    let chosen = recent.length === 1 ? recent[0] : null;
    const refText = (ref?.text ?? '').trim().toLowerCase();
    if (!chosen && refText) {
      chosen =
        recent.find((p) => {
          const content = (p.content ?? '').trim().toLowerCase();
          return (
            content &&
            (content.includes(refText) ||
              refText.includes(content.slice(0, 80)))
          );
        }) ?? null;
    }
    if (!chosen) {
      chosen = recent[0];
      this.log.warn(
        `TweetStream: reply on @${parentAuthor} without parent tweet id — using latest Postiz post ${chosen.releaseId} (${recent.length} recent posts)`
      );
    }

    const releaseId = String(chosen.releaseId ?? '').trim();
    if (!releaseId) {
      return null;
    }

    const enriched: TweetStreamTweetContent = {
      ...tweet,
      ref: { ...ref, tweetId: releaseId },
    };
    const built = buildMappedFromTweetContent(enriched, parentAuthor);
    if (built) {
      this.log.log(
        `TweetStream: mapped ${ref.type} on @${parentAuthor} via inferred Postiz post releaseId ${releaseId}`
      );
    }
    return built;
  }

  private async rawUnmappedReason(
    tweet: TweetStreamTweetContent
  ): Promise<string> {
    const ref = tweet.ref;
    if (ref?.type === 'reply' || ref?.type === 'retweet') {
      const parentAuthor = normalizeTweetStreamHandle(ref.author?.handle);
      const parentId = String(ref.tweetId ?? '').trim();
      if (!parentId && parentAuthor) {
        const recent =
          await this._integrationRepository.findRecentPublishedXPostsByProfile(
            parentAuthor,
            72,
            5
          );
        if (recent.length === 0) {
          return `Reply to @${parentAuthor} but no parent tweet id from TweetStream and no recent Postiz-published posts to infer from.`;
        }
        if (recent.length > 1) {
          return `Reply to @${parentAuthor} without parent tweet id; ${recent.length} recent Postiz posts — restart backend for inference fix, or wait for TweetStream update envelope.`;
        }
      }
      if (parentId) {
        const channels =
          await this._integrationRepository.findXChannelsByPostReleaseId(
            parentId
          );
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

  private async publishRawTweetEnvelope(
    tweet: TweetStreamTweetContent,
    note?: string
  ): Promise<void> {
    const key = getTweetStreamRecentEventsRedisKey();
    const max = getTweetStreamRecentEventsMax();
    const entry = {
      ts: Date.now(),
      kind: 'raw' as const,
      authorHandle: normalizeTweetStreamHandle(tweet.author?.handle),
      authorId: tweet.author?.id,
      refType: tweet.ref?.type,
      refTweetId: tweet.ref?.tweetId,
      refAuthorHandle: normalizeTweetStreamHandle(tweet.ref?.author?.handle),
      textPreview: (tweet.text ?? '').slice(0, 120),
      note:
        note ??
        'Received on WebSocket but not mapped to a Postiz channel.',
    };
    await ioRedis
      .multi()
      .lpush(key, JSON.stringify(entry))
      .ltrim(key, 0, max - 1)
      .exec();
  }

  private async publishRecentEvent(
    monitoredHandle: string,
    mapped: {
      monitoredHandle: string;
      eventSummary?: {
        kind: string;
        tweetId?: string;
        engagerUserId?: string;
        engagerHandle?: string;
      };
    }
  ): Promise<void> {
    const integrations =
      await this._integrationRepository.findActiveXIntegrationsByProfile(
        monitoredHandle
      );
    const entry = {
      ts: Date.now(),
      monitoredHandle,
      integrationIds: integrations.map((i) => i.id),
      organizationIds: [...new Set(integrations.map((i) => i.organizationId))],
      ...mapped.eventSummary,
    };
    const key = getTweetStreamRecentEventsRedisKey();
    const max = getTweetStreamRecentEventsMax();
    await ioRedis
      .multi()
      .lpush(key, JSON.stringify(entry))
      .ltrim(key, 0, max - 1)
      .exec();
  }

  async listRecentEvents(limit = 50): Promise<unknown[]> {
    const key = getTweetStreamRecentEventsRedisKey();
    const raw = await ioRedis.lrange(key, 0, Math.max(0, limit - 1));
    return raw
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  async clearRecentEvents(): Promise<{ cleared: number }> {
    const key = getTweetStreamRecentEventsRedisKey();
    const cleared = await ioRedis.del(key);
    return { cleared };
  }
}
