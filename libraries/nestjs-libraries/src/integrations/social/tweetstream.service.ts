import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
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
import { TweetStreamApiClient } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.api';
import { TweetStreamWebSocketClient } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.client';
import {
  buildMappedFromTweetContent,
  mapTweetStreamEnvelope,
} from '@gitroom/nestjs-libraries/integrations/social/tweetstream.mapper';
import { TweetStreamTweetContent } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.types';
import { normalizeTweetStreamHandle } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.normalize';
import { TweetStreamEnvelope } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.types';
import {
  clearTweetStreamWsConsumerActive,
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

  constructor(
    private readonly _integrationRepository: IntegrationRepository,
    private readonly _handler: XAccountActivityHandler,
    @Inject(forwardRef(() => IntegrationService))
    private readonly _integrationService: IntegrationService
  ) {}

  isEnabled(): boolean {
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
    const addResult =
      toAdd.length > 0
        ? await client.addAccounts(toAdd)
        : {
            results: [],
            summary: { total: 0, succeeded: 0, failed: 0 },
            skippedAlreadyTracked: desired.length,
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
    let mapped = mapTweetStreamEnvelope(envelope);
    if (
      !mapped &&
      envelope.t === 'tweet' &&
      envelope.op === 'content' &&
      envelope.d
    ) {
      mapped = await this.resolveMappedFromPublishedPost(
        envelope.d as TweetStreamTweetContent
      );
    }

    if (!mapped) {
      if (
        isTweetStreamPublishEvents() &&
        envelope.t === 'tweet' &&
        envelope.op === 'content'
      ) {
        void this.publishRawTweetEnvelope(
          envelope.d as TweetStreamTweetContent
        ).catch((err) => this.log.error('publishRawTweetEnvelope:', err));
      }
      return;
    }

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
    if (
      releaseId &&
      (mapped.eventSummary?.kind === 'reply' ||
        mapped.eventSummary?.kind === 'retweet')
    ) {
      void this.triggerImmediateEngagementPlugs(
        mapped.monitoredHandle,
        releaseId
      ).catch((err) =>
        this.log.error('triggerImmediateEngagementPlugs:', err)
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
    return null;
  }

  private async publishRawTweetEnvelope(
    tweet: TweetStreamTweetContent
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
        'Received on WebSocket but not mapped to a Postiz channel. Parent tweet may not be a Postiz-published releaseId, or TweetStream omitted ref.author.',
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
}
