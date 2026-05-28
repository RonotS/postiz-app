import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Integration } from '@prisma/client';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { XProvider } from '@gitroom/nestjs-libraries/integrations/social/x.provider';
import { isXAccountActivityWebhooksEnabled } from '@gitroom/helpers/x/x.account-activity.env';
import { normalizeTweetStreamHandle } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.normalize';
import { isXquikEnabled } from '@gitroom/helpers/x/xquik.env';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

type PlugFields = Record<string, string>;

@Injectable()
export class XAccountActivityHandler {
  private readonly log = new Logger(XAccountActivityHandler.name);

  constructor(
    private readonly _integrationRepository: IntegrationRepository,
    private readonly _integrationManager: IntegrationManager,
    @Inject(forwardRef(() => IntegrationService))
    private readonly _integrationService: IntegrationService
  ) {}

  async handlePayload(payload: Record<string, unknown>): Promise<void> {
    if (!isXAccountActivityWebhooksEnabled()) {
      return;
    }

    const forUserId = String(payload.for_user_id ?? '');
    if (!forUserId) {
      return;
    }

    const integrations =
      await this._integrationRepository.findActiveXIntegrationsByInternalId(
        forUserId
      );
    await this.dispatchToIntegrations(integrations, payload);
  }

  /** TweetStream WebSocket: resolve channel by @handle (integration.profile). */
  async handleTweetStreamPayload(
    monitoredHandle: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const handle = normalizeTweetStreamHandle(monitoredHandle);
    if (!handle) {
      return;
    }

    const integrations =
      await this._integrationRepository.findActiveXIntegrationsByProfile(handle);
    await this.dispatchToIntegrations(integrations, payload);
  }

  /**
   * Xquik webhook adapter. We normalize monitor events into the same X webhook
   * payload shape used by dispatchForIntegration() so DM/plug logic stays shared.
   */
  async handleXquikPayload(payload: Record<string, unknown>): Promise<void> {
    if (!isXquikEnabled()) {
      return;
    }

    const events = this.extractXquikEvents(payload);
    const processedEngagementKeys = new Set<string>();
    for (const event of events) {
      const rawEventType = this.pickString(
        event,
        'type',
        'eventType',
        'data.eventType',
        'data.type'
      )?.toLowerCase();
      if (rawEventType?.includes('unfollow')) {
        const monitoredHandle = normalizeTweetStreamHandle(
          this.pickString(
            event,
            'username',
            'monitor.username',
            'data.username'
          )
        );
        await this.handleXquikUnfollow(event, monitoredHandle);
        continue;
      }

      const monitoredHandle = normalizeTweetStreamHandle(
        this.pickString(
          event,
          'username',
          'monitor.username',
          'monitor.handle',
          'monitor.targetUsername',
          'target.username',
          'target.handle',
          'handle',
          'data.username',
          'data.monitor.username'
        )
      );
      const engagementDedupeKey = this.xquikEngagementDedupeKey(
        event,
        rawEventType
      );
      if (
        engagementDedupeKey &&
        processedEngagementKeys.has(engagementDedupeKey)
      ) {
        continue;
      }
      if (engagementDedupeKey) {
        processedEngagementKeys.add(engagementDedupeKey);
        const firstSeen = await this.markXquikEventSeen(engagementDedupeKey);
        if (!firstSeen) {
          continue;
        }
      }

      const normalized = await this.normalizeXquikEvent(event, monitoredHandle);
      if (!normalized) {
        const eventType = this.pickString(
          event,
          'type',
          'eventType',
          'data.eventType',
          'data.type'
        );
        if (eventType === 'tweet.new') {
          const tweetId = this.pickString(event, 'data.id', 'data.tweetId');
          this.log.log(
            `Xquik tweet.new @${monitoredHandle ?? '?'} tweetId=${tweetId ?? '?'} — own post event (likes/RTs via poller; immediate poll scheduled if Postiz owns this id)`
          );
          if (tweetId) {
            void this._integrationService
              .runImmediateEngagementPollForReleaseIds([tweetId])
              .catch((err) =>
                this.log.error('Xquik immediate engagement poll failed:', err)
              );
          }
        } else if (
          eventType === 'tweet.retweet' ||
          (eventType === 'tweet.mention' && this.isXquikRetweetMention(event))
        ) {
          await this.handleOutboundRetweetWebhook(event, monitoredHandle);
        } else {
          this.log.warn(
            `Xquik webhook: unmapped event type=${eventType ?? 'unknown'} handle=${monitoredHandle ?? '?'} tweetId=${this.pickString(event, 'data.id') ?? '?'}`
          );
        }
        continue;
      }

      const parentTweetId = this.extractParentPostTweetId(event, normalized);
      const favorites = (normalized.favorite_events as any[]) || [];
      const tweets = (normalized.tweet_create_events as any[]) || [];
      const follows = (normalized.follow_events as any[]) || [];
      const inboundOnPost =
        !!parentTweetId &&
        (favorites.length > 0 ||
          tweets.some(
            (tw) =>
              tw.retweeted_status ||
              tw.in_reply_to_status_id_str ||
              tw.in_reply_to_status_id
          ));

      if (inboundOnPost) {
        const kind = this.inboundEngagementLabel(normalized);
        const integrations = await this.resolveIntegrationsForPostTweet(
          parentTweetId,
          event
        );
        if (!integrations.length) {
          this.log.warn(
            `Xquik webhook: inbound ${kind} on tweet ${parentTweetId} but no Postiz channel owns that post (monitor @${monitoredHandle ?? '?'})`
          );
          continue;
        }
        for (const integration of integrations) {
          this.log.log(
            `Xquik webhook: inbound ${kind} on tweet ${parentTweetId} → DM from @${integration.profile} (monitor @${monitoredHandle ?? '?'})`
          );
          await this.dispatchToIntegrations([integration], normalized);
        }
        void this._integrationService
          .runImmediateEngagementPollForReleaseIds([parentTweetId])
          .catch((err) =>
            this.log.error('Xquik immediate engagement poll failed:', err)
          );
        continue;
      }

      if (follows.length > 0) {
        const integrations = monitoredHandle
          ? await this._integrationRepository.findActiveXIntegrationsByProfile(
              monitoredHandle
            )
          : [];
        if (!integrations.length) {
          this.log.warn(
            `Xquik webhook: follow event but no channel for @${monitoredHandle ?? '?'}`
          );
          continue;
        }
        for (const integration of integrations) {
          this.log.log(
            `Xquik webhook: new follower → welcome DM from @${integration.profile}`
          );
          await this.dispatchToIntegrations([integration], normalized);
        }
        continue;
      }

      if (!monitoredHandle) {
        this.log.warn('Xquik webhook: mapped event but missing monitor username');
        continue;
      }

      this.log.log(
        `Xquik webhook: dispatching @${monitoredHandle} (${Object.keys(normalized).join(',')})`
      );
      await this.handleTweetStreamPayload(monitoredHandle, normalized);
    }
  }

  private extractXquikEvents(payload: Record<string, unknown>): Record<string, unknown>[] {
    const rows =
      (Array.isArray(payload.events) ? payload.events : null) ||
      (Array.isArray((payload.data as any)?.events)
        ? (payload.data as any).events
        : null) ||
      (Array.isArray((payload.body as any)?.events)
        ? (payload.body as any).events
        : null);
    if (rows) {
      return rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
    }
    return [payload];
  }

  private pickString(obj: Record<string, unknown>, ...paths: string[]): string | undefined {
    for (const path of paths) {
      const parts = path.split('.');
      let cur: unknown = obj;
      for (const part of parts) {
        if (!cur || typeof cur !== 'object') {
          cur = undefined;
          break;
        }
        cur = (cur as Record<string, unknown>)[part];
      }
      const value = String(cur ?? '').trim();
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  /** Inbound reply/mention on the monitored account's posts (not the monitor posting). */
  private isInboundXquikEngagement(
    event: Record<string, unknown>,
    monitoredHandle?: string
  ): boolean {
    const replyToUser = normalizeTweetStreamHandle(
      this.pickString(
        event,
        'data.inReplyToUsername',
        'data.in_reply_to_username',
        'data.inReplyToUser.username'
      ) ?? ''
    );
    const monitored = normalizeTweetStreamHandle(monitoredHandle ?? '');
    if (replyToUser && monitored && replyToUser !== monitored) {
      return true;
    }
    if (!monitoredHandle) {
      return true;
    }
    const authorHandle = normalizeTweetStreamHandle(
      this.pickString(
        event,
        'data.author.userName',
        'data.author.username',
        'data.author.screen_name',
        'data.author.handle',
        'author.userName',
        'author.username'
      ) ?? ''
    );
    if (!authorHandle || !monitored) {
      return true;
    }
    return authorHandle !== monitored;
  }

  /**
   * Parent tweet id on YOUR channel (liked / RT'd / replied-to post).
   */
  private extractParentPostTweetId(
    event: Record<string, unknown>,
    normalized: Record<string, unknown>
  ): string | undefined {
    const fromEvent = this.pickString(
      event,
      'data.inReplyToId',
      'data.in_reply_to_tweet_id',
      'data.retweetedTweetId',
      'data.retweeted_tweet_id',
      'data.tweet.retweetedTweetId',
      'data.retweetedStatusId',
      'data.likedTweetId',
      'data.targetTweetId',
      'data.tweet.id',
      'data.tweetId'
    );
    if (fromEvent) {
      return fromEvent;
    }

    const favorites = (normalized.favorite_events as any[]) || [];
    if (favorites.length) {
      const id = this.tweetIdFromStatus(favorites[0].favorited_status);
      if (id) {
        return id;
      }
    }

    const tweets = (normalized.tweet_create_events as any[]) || [];
    for (const tw of tweets) {
      const rt = this.tweetIdFromStatus(tw.retweeted_status);
      if (rt) {
        return rt;
      }
      const replyTo = String(
        tw.in_reply_to_status_id_str ?? tw.in_reply_to_status_id ?? ''
      ).trim();
      if (replyTo) {
        return replyTo;
      }
    }

    return undefined;
  }

  private inboundEngagementLabel(
    normalized: Record<string, unknown>
  ): 'like' | 'retweet' | 'reply' | 'engagement' {
    if ((normalized.favorite_events as any[])?.length) {
      return 'like';
    }
    const tweets = (normalized.tweet_create_events as any[]) || [];
    if (tweets.some((tw) => tw.retweeted_status)) {
      return 'retweet';
    }
    if (
      tweets.some(
        (tw) => tw.in_reply_to_status_id_str || tw.in_reply_to_status_id
      )
    ) {
      return 'reply';
    }
    return 'engagement';
  }

  /**
   * Who should send the auto-DM: the account that published the parent tweet,
   * not the Xquik monitor username on the payload (often the engager's monitor).
   */
  private async resolveIntegrationsForPostTweet(
    parentTweetId: string,
    event?: Record<string, unknown>
  ): Promise<Integration[]> {
    const integrations: Integration[] = [];
    const seen = new Set<string>();

    if (parentTweetId) {
      const channels =
        await this._integrationRepository.findXChannelsByPostReleaseId(
          parentTweetId
        );
      for (const ch of channels) {
        if (!ch?.id || seen.has(ch.id)) continue;
        const full = await this._integrationRepository.getIntegrationById(
          ch.organizationId,
          ch.id
        );
        if (full) {
          seen.add(full.id);
          integrations.push(full);
        }
      }
    }

    if (!integrations.length && event) {
      const ownerHandle = normalizeTweetStreamHandle(
        this.pickString(
          event,
          'data.inReplyToUsername',
          'data.in_reply_to_username',
          'data.tweet.author.userName',
          'data.tweet.author.username'
        ) ?? ''
      );
      if (ownerHandle) {
        const rows =
          await this._integrationRepository.findActiveXIntegrationsByProfile(
            ownerHandle
          );
        for (const row of rows) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            integrations.push(row);
          }
        }
      }
    }

    return integrations;
  }

  /**
   * BM7 RT of wakabitawa fires on @BM7's monitor. Resolve original tweet id and DM
   * from the post owner's channel (@wakabitawa), not from BM7's channel.
   */
  private async handleOutboundRetweetWebhook(
    event: Record<string, unknown>,
    monitoredHandle?: string
  ): Promise<void> {
    const rtRowId = this.pickString(event, 'data.id', 'data.tweetId');
    const authorHandle = normalizeTweetStreamHandle(
      this.pickString(
        event,
        'data.author.userName',
        'data.author.username',
        'data.author.screen_name'
      ) ?? ''
    );
    const monitored = normalizeTweetStreamHandle(monitoredHandle ?? '');
    if (!authorHandle || !monitored || authorHandle !== monitored) {
      return;
    }

    const originalId = await this.resolveOriginalTweetIdForRetweetEvent(
      event,
      monitoredHandle,
      rtRowId
    );
    const engagerId = this.pickString(
      event,
      'data.author.id',
      'data.author_id',
      'author.id'
    );

    this.log.log(
      `Xquik webhook: outbound retweet by @${monitored} (rt row ${rtRowId ?? '?'} → original ${originalId ?? 'unknown'})`
    );

    if (!originalId) {
      return;
    }

    const integrations = await this.resolveIntegrationsForPostTweet(
      originalId,
      event
    );
    if (integrations.length && engagerId) {
      const normalized = {
        tweet_create_events: [
          {
            user: { id: engagerId },
            retweeted_status: { id_str: originalId },
          },
        ],
      };
      for (const integration of integrations) {
        this.log.log(
          `Xquik webhook: @${monitored} RT'd tweet ${originalId} → DM from @${integration.profile}`
        );
        await this.dispatchToIntegrations([integration], normalized);
      }
    } else if (!integrations.length) {
      this.log.warn(
        `Xquik webhook: RT on original ${originalId} but no Postiz channel owns that post`
      );
    }

    void this._integrationService
      .runImmediateEngagementPollForReleaseIds([originalId])
      .catch((err) =>
        this.log.error('Xquik immediate engagement poll failed:', err)
      );
  }

  private async resolveOriginalTweetIdForRetweetEvent(
    event: Record<string, unknown>,
    monitoredHandle?: string,
    rtRowId?: string
  ): Promise<string | undefined> {
    const fromPayload = this.extractXquikRetweetedTweetId(event);
    if (fromPayload) {
      return fromPayload;
    }

    const rowId =
      rtRowId ?? this.pickString(event, 'data.id', 'data.tweetId');
    const xProvider = this._integrationManager.getSocialIntegration(
      'x'
    ) as XProvider;

    if (rowId) {
      const fromXquik = await xProvider.resolveXquikRetweetedTweetId(rowId);
      if (fromXquik) {
        return fromXquik;
      }

      const monitored = normalizeTweetStreamHandle(monitoredHandle ?? '');
      if (monitored) {
        const rows =
          await this._integrationRepository.findActiveXIntegrationsByProfile(
            monitored
          );
        const rtAuthorIntegration = rows[0];
        if (rtAuthorIntegration) {
          const fromXApi = await xProvider.resolveRetweetedTweetIdViaXApi(
            rtAuthorIntegration,
            rowId
          );
          if (fromXApi) {
            return fromXApi;
          }
        }
      }
    }

    return this.inferOriginalTweetIdFromRtText(event);
  }

  /** Match `RT @wakabitawa94498: testing6` to a recent Postiz post on that channel. */
  private async inferOriginalTweetIdFromRtText(
    event: Record<string, unknown>
  ): Promise<string | undefined> {
    const text = this.pickString(event, 'data.text', 'data.full_text') ?? '';
    const match = text.match(/^RT\s+@([A-Za-z0-9_]+):\s*(.+)$/i);
    if (!match) {
      return undefined;
    }

    const handle = normalizeTweetStreamHandle(match[1]);
    const snippet = match[2].trim().toLowerCase();
    if (!handle || !snippet) {
      return undefined;
    }

    const recent =
      await this._integrationRepository.findRecentPublishedXPostsByProfile(
        handle,
        72,
        15
      );
    if (!recent.length) {
      return undefined;
    }

    const byText = recent.find((p) => {
      const content = (p.content ?? '').trim().toLowerCase();
      return (
        content &&
        (content.includes(snippet) ||
          snippet.includes(content.slice(0, 80)) ||
          content === snippet)
      );
    });
    const chosen = byText ?? (recent.length === 1 ? recent[0] : null);
    const releaseId = String(chosen?.releaseId ?? '').trim();
    if (releaseId) {
      this.log.log(
        `Xquik webhook: inferred original tweet ${releaseId} for RT of @${handle} ("${snippet.slice(0, 40)}")`
      );
    }
    return releaseId || undefined;
  }

  /** Xquik often sends tweet.reply + tweet.mention for one reply — process once. */
  private xquikEngagementDedupeKey(
    event: Record<string, unknown>,
    eventType?: string
  ): string | undefined {
    const rowId = this.pickString(event, 'data.id', 'data.tweetId');
    if (!rowId) {
      return undefined;
    }
    const type = (eventType ?? '').toLowerCase();
    if (type.includes('reply') || type.includes('mention')) {
      const parent = this.pickString(
        event,
        'data.inReplyToId',
        'data.in_reply_to_tweet_id'
      );
      if (parent) {
        return `reply:${rowId}:${parent}`;
      }
    }
    if (type.includes('like') || type.includes('favorite')) {
      const target = this.pickString(
        event,
        'data.targetTweetId',
        'data.likedTweetId',
        'data.favoritedTweetId'
      );
      return `like:${rowId}:${target ?? ''}`;
    }
    if (type.includes('retweet')) {
      return `rt:${rowId}`;
    }
    if (type.includes('follow')) {
      return `follow:${rowId}`;
    }
    return undefined;
  }

  /**
   * Cross-request dedupe: Xquik can deliver tweet.reply + tweet.mention as two
   * separate HTTP requests for the same comment. Keep a short Redis lock so one
   * engagement emits one DM.
   */
  private async markXquikEventSeen(key: string): Promise<boolean> {
    const redisKey = `xquik:evt:${key}`;
    try {
      const ret = await ioRedis.set(redisKey, '1', 'EX', 180, 'NX');
      return ret === 'OK';
    } catch (err) {
      this.log.warn(`Xquik dedupe unavailable for key=${key}:`, err);
      return true;
    }
  }

  private async handleXquikUnfollow(
    event: Record<string, unknown>,
    monitoredHandle?: string
  ): Promise<void> {
    const monitored = normalizeTweetStreamHandle(monitoredHandle ?? '');
    const unfollowerId = this.pickString(
      event,
      'data.author.id',
      'data.user.id',
      'data.actor.id',
      'actor.id'
    );
    if (!monitored || !unfollowerId) {
      return;
    }

    const integrations =
      await this._integrationRepository.findActiveXIntegrationsByProfile(
        monitored
      );
    for (const integration of integrations) {
      const followerPlug =
        await this._integrationRepository.getActivePlugByFunction(
          integration.organizationId,
          integration.id,
          'autoDmFollowers'
        );
      if (!followerPlug) {
        continue;
      }
      const ctx = this.buildFollowerPlugContext(
        'autoDmFollowers',
        integration.id
      );
      await ctx.removeFollowerTracking?.([unfollowerId]);
      this.log.log(
        `Xquik unfollow: user ${unfollowerId} unfollowed @${monitored} — follower auto-DM tracking cleared (re-follow can DM again)`
      );
    }
  }

  private isXquikRetweetMention(event: Record<string, unknown>): boolean {
    const text = this.pickString(event, 'data.text', 'data.full_text') ?? '';
    if (/^RT\s@/i.test(text)) {
      return true;
    }
    const data = event.data as Record<string, unknown> | undefined;
    const rtCount = Number(data?.retweetCount ?? data?.retweet_count ?? 0);
    return rtCount > 0 && data?.isReply !== true && data?.is_reply !== true;
  }

  private extractXquikRetweetedTweetId(
    event: Record<string, unknown>
  ): string | undefined {
    const fromPick = this.pickString(
      event,
      'tweet.retweetedTweetId',
      'tweet.retweeted_tweet_id',
      'retweetedTweetId',
      'tweet.targetTweetId',
      'targetTweetId',
      'data.retweetedTweetId',
      'data.retweeted_tweet_id',
      'data.tweet.retweetedTweetId',
      'data.retweetedStatusId',
      'data.targetTweetId',
      'data.sourceTweetId',
      'data.originalTweetId',
      'data.relatedTweetId'
    );
    if (fromPick) {
      return fromPick;
    }

    const data = event.data as Record<string, unknown> | undefined;
    if (!data) {
      return undefined;
    }

    for (const key of [
      'retweeted_status',
      'retweetedStatus',
      'retweetedTweet',
      'retweeted_tweet',
      'quoted_status',
      'quotedStatus',
      'quotedTweet',
    ]) {
      const nested = data[key];
      if (nested && typeof nested === 'object') {
        const id = this.pickString(
          nested as Record<string, unknown>,
          'id',
          'id_str',
          'tweetId',
          'tweet_id'
        );
        if (id) {
          return id;
        }
      }
    }

    const refs = (data.referenced_tweets ?? data.referencedTweets) as
      | { type?: string; id?: string; id_str?: string }[]
      | undefined;
    if (Array.isArray(refs)) {
      for (const r of refs) {
        const type = String(r?.type ?? '').toLowerCase();
        if (type === 'retweeted' || type === 'retweet') {
          const id = String(r?.id ?? r?.id_str ?? '').trim();
          if (id) {
            return id;
          }
        }
      }
    }

    const ref = data.ref as Record<string, unknown> | undefined;
    if (ref && String(ref.type ?? '').toLowerCase() === 'retweet') {
      return this.pickString(ref, 'tweetId', 'tweet_id', 'id', 'id_str');
    }

    return undefined;
  }

  private async normalizeXquikEvent(
    event: Record<string, unknown>,
    monitoredHandle?: string
  ): Promise<Record<string, unknown> | null> {
    const eventType = this.pickString(
      event,
      'type',
      'eventType',
      'event_type',
      'monitorEventType',
      'monitor.eventType',
      'event.type',
      'data.eventType',
      'data.type'
    )?.toLowerCase();
    if (!eventType) {
      return null;
    }

    const actorId = this.pickString(
      event,
      'actor.id',
      'source.id',
      'user.id',
      'author.id',
      'tweet.author.id',
      'tweet.user.id',
      'data.actor.id',
      'data.user.id',
      'data.author.id',
      'data.tweet.author.id'
    );

    const replyToId = this.pickString(
      event,
      'tweet.inReplyToTweetId',
      'tweet.in_reply_to_tweet_id',
      'inReplyToTweetId',
      'replyToTweetId',
      'data.inReplyToId',
      'data.inReplyToTweetId',
      'data.in_reply_to_tweet_id',
      'data.tweet.inReplyToTweetId',
      'data.tweet.inReplyToStatusId'
    );

    if (
      eventType.includes('mention') ||
      (eventType.includes('reply') &&
        this.isInboundXquikEngagement(event, monitoredHandle))
    ) {
      if (!replyToId || !actorId) {
        return null;
      }
      return {
        tweet_create_events: [
          {
            user: { id: actorId },
            in_reply_to_status_id_str: replyToId,
          },
        ],
      };
    }

    if (eventType.includes('reply')) {
      return null;
    }

    const data = event.data as Record<string, unknown> | undefined;
    const dataReply =
      data?.isReply === true ||
      data?.is_reply === true ||
      String(data?.type ?? '').toLowerCase() === 'reply';
    if (dataReply && replyToId && actorId) {
      if (this.isInboundXquikEngagement(event, monitoredHandle)) {
        return {
          tweet_create_events: [
            {
              user: { id: actorId },
              in_reply_to_status_id_str: replyToId,
            },
          ],
        };
      }
    }

    const isRtMention = this.isXquikRetweetMention(event);
    if (eventType.includes('retweet') || isRtMention) {
      const rtRowId = this.pickString(event, 'data.id', 'data.tweetId');
      const originalId = await this.resolveOriginalTweetIdForRetweetEvent(
        event,
        monitoredHandle,
        rtRowId
      );
      if (!originalId || !actorId) {
        return null;
      }
      if (!this.isInboundXquikEngagement(event, monitoredHandle)) {
        return null;
      }
      return {
        tweet_create_events: [
          {
            user: { id: actorId },
            retweeted_status: { id_str: originalId },
          },
        ],
      };
    }

    if (eventType.includes('like') || eventType.includes('favorite')) {
      const likedTweetId = this.pickString(
        event,
        'data.targetTweetId',
        'data.likedTweetId',
        'data.favoritedTweetId',
        'data.favoritedStatusId',
        'data.favorited_tweet_id',
        'data.statusId',
        'data.tweet.id',
        'data.tweetId',
        'tweet.id',
        'tweet.tweetId',
        'tweet.targetTweetId',
        'tweet_id',
        'tweetId',
        'targetTweetId'
      );
      if (!likedTweetId || !actorId) {
        return null;
      }
      if (!this.isInboundXquikEngagement(event, monitoredHandle)) {
        return null;
      }
      return {
        favorite_events: [
          {
            user: { id: actorId },
            favorited_status: { id_str: likedTweetId },
          },
        ],
      };
    }

    if (eventType.includes('follow')) {
      if (!actorId) {
        return null;
      }
      return {
        follow_events: [
          {
            source: { id: actorId },
          },
        ],
      };
    }

    return null;
  }

  private async dispatchToIntegrations(
    integrations: Integration[],
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!integrations.length) {
      return;
    }

    const xProvider = this._integrationManager.getSocialIntegration(
      'x'
    ) as XProvider;

    for (const integration of integrations) {
      try {
        await this.dispatchForIntegration(xProvider, integration, payload);
      } catch (err) {
        this.log.error(
          `dispatchToIntegrations integration=${integration.id}:`,
          err
        );
      }
    }
  }

  private parsePlugFields(dataJson: string): PlugFields {
    try {
      const arr = JSON.parse(dataJson) as { name: string; value: string }[];
      return arr.reduce((all, cur) => {
        all[cur.name] = cur.value;
        return all;
      }, {} as PlugFields);
    } catch {
      return {};
    }
  }

  private buildEngagementPlugContext(
    plugFunction: string,
    integrationId: string,
    postReleaseId: string
  ) {
    return {
      loadDmdUserIds: async (userIds: string[]): Promise<Set<string>> => {
        if (userIds.length === 0) return new Set();
        const candidates = userIds.map((uid) => `${postReleaseId}:${uid}`);
        const existing = await this._integrationRepository.loadExisingData(
          plugFunction,
          integrationId,
          candidates
        );
        const existingValues = new Set(existing.map((e: any) => e.value));
        return new Set(
          userIds.filter((uid) =>
            existingValues.has(`${postReleaseId}:${uid}`)
          )
        );
      },
      saveDmdUserIds: async (userIds: string[]) => {
        if (userIds.length === 0) return;
        const values = userIds.map((uid) => `${postReleaseId}:${uid}`);
        await this._integrationRepository.saveExisingData(
          plugFunction,
          integrationId,
          values
        );
      },
    };
  }

  private buildFollowerPlugContext(plugFunction: string, integrationId: string) {
    const followerBaselineKey = '__fdm_baseline_v1__';
    return {
      loadDmdUserIds: async (userIds: string[]): Promise<Set<string>> => {
        if (userIds.length === 0) return new Set();
        const candidates = userIds.map((uid) => `fdm:${uid}`);
        const existing = await this._integrationRepository.loadExisingData(
          plugFunction,
          integrationId,
          candidates
        );
        const existingValues = new Set(existing.map((e: any) => e.value));
        return new Set(
          userIds.filter((uid) => existingValues.has(`fdm:${uid}`))
        );
      },
      saveDmdUserIds: async (userIds: string[]) => {
        if (userIds.length === 0) return;
        const values = userIds.map((uid) => `fdm:${uid}`);
        await this._integrationRepository.saveExisingData(
          plugFunction,
          integrationId,
          values
        );
      },
      hasFollowerBaselineMarker: async () => {
        const rows = await this._integrationRepository.loadExisingData(
          plugFunction,
          integrationId,
          [followerBaselineKey]
        );
        return rows.length > 0;
      },
      setFollowerBaselineMarker: async () => {
        await this._integrationRepository.saveExisingData(
          plugFunction,
          integrationId,
          [followerBaselineKey]
        );
      },
      loadFollowerSnapshotContains: async (
        userIds: string[]
      ): Promise<Set<string>> => {
        if (userIds.length === 0) return new Set();
        const candidates = userIds.map((uid) => `fds:${uid}`);
        const existing = await this._integrationRepository.loadExisingData(
          plugFunction,
          integrationId,
          candidates
        );
        const existingValues = new Set(existing.map((e: any) => e.value));
        return new Set(
          userIds.filter((uid) => existingValues.has(`fds:${uid}`))
        );
      },
      saveFollowerSnapshotIds: async (userIds: string[]) => {
        if (userIds.length === 0) return;
        const values = userIds.map((uid) => `fds:${uid}`);
        await this._integrationRepository.saveExisingData(
          plugFunction,
          integrationId,
          values
        );
      },
      listFollowerSnapshotUserIds: async () => {
        const rows = await this._integrationRepository.listExisingDataWithPrefix(
          plugFunction,
          integrationId,
          'fds:'
        );
        return rows
          .map((r) => r.value.replace(/^fds:/, ''))
          .filter(Boolean);
      },
      removeFollowerTracking: async (userIds: string[]) => {
        if (!userIds.length) return;
        const values = userIds.flatMap((uid) => [
          `fdm:${uid}`,
          `fds:${uid}`,
          `fprev:${uid}`,
        ]);
        await this._integrationRepository.deleteExisingDataValues(
          plugFunction,
          integrationId,
          values
        );
      },
      loadPreviousFollowerPollIds: async (): Promise<Set<string>> => {
        const rows = await this._integrationRepository.listExisingDataWithPrefix(
          plugFunction,
          integrationId,
          'fprev:'
        );
        return new Set(
          rows.map((r) => r.value.replace(/^fprev:/, '')).filter(Boolean)
        );
      },
      savePreviousFollowerPollIds: async (userIds: string[]) => {
        const rows = await this._integrationRepository.listExisingDataWithPrefix(
          plugFunction,
          integrationId,
          'fprev:'
        );
        if (rows.length) {
          await this._integrationRepository.deleteExisingDataValues(
            plugFunction,
            integrationId,
            rows.map((r) => r.value)
          );
        }
        if (userIds.length) {
          await this._integrationRepository.saveExisingData(
            plugFunction,
            integrationId,
            userIds.map((uid) => `fprev:${uid}`)
          );
        }
      },
    };
  }

  private async loadPostSettings(integrationId: string, releaseId: string) {
    const post = await this._integrationRepository.getPostByReleaseId(
      integrationId,
      releaseId
    );
    if (!post?.settings) return undefined;
    try {
      return JSON.parse(post.settings);
    } catch {
      return undefined;
    }
  }

  private tweetIdFromStatus(status: any): string | undefined {
    if (!status) return undefined;
    return String(status.id_str ?? status.id ?? '').trim() || undefined;
  }

  private userIdFromUser(user: any): string | undefined {
    if (!user) return undefined;
    return String(user.id_str ?? user.id ?? '').trim() || undefined;
  }

  private async tryPinnedPostDm(
    xProvider: XProvider,
    integration: Integration,
    orgId: string,
    integrationId: string,
    tweetId: string,
    engagerUserId: string,
    eventType: 'like' | 'retweet' | 'reply',
    pinnedTweetId: string | undefined
  ) {
    if (!pinnedTweetId || tweetId !== pinnedTweetId) return;
    const pinnedPlug =
      await this._integrationRepository.getActivePlugByFunction(
        orgId,
        integrationId,
        'autoDmPinnedPost'
      );
    if (!pinnedPlug) return;
    const fields = this.parsePlugFields(pinnedPlug.data);
    const ctx = this.buildEngagementPlugContext(
      'autoDmPinnedPost',
      integrationId,
      pinnedTweetId
    );
    await xProvider.webhookPinnedPostDm(
      integration,
      pinnedTweetId,
      engagerUserId,
      eventType,
      fields as any,
      ctx
    );
  }

  private async dispatchForIntegration(
    xProvider: XProvider,
    integration: Integration,
    payload: Record<string, unknown>
  ) {
    const orgId = integration.organizationId;
    const integrationId = integration.id;
    const pinnedTweetId = await xProvider.resolvePinnedTweetId(integration);

    const favorites = (payload.favorite_events as any[]) || [];
    for (const ev of favorites) {
      const tweetId = this.tweetIdFromStatus(ev.favorited_status);
      const likerId = this.userIdFromUser(ev.user);
      if (!tweetId || !likerId) continue;

      await this.tryPinnedPostDm(
        xProvider,
        integration,
        orgId,
        integrationId,
        tweetId,
        likerId,
        'like',
        pinnedTweetId
      );

      const postSettings = await this.loadPostSettings(integrationId, tweetId);
      const dmPlug = await this._integrationRepository.getActivePlugByFunction(
        orgId,
        integrationId,
        'autoDmEngagers'
      );
      if (dmPlug) {
        const fields = this.parsePlugFields(dmPlug.data);
        const ctx = this.buildEngagementPlugContext(
          'autoDmEngagers',
          integrationId,
          tweetId
        );
        const sent = await xProvider.webhookDmEngager(
          integration,
          tweetId,
          likerId,
          'like',
          fields as any,
          postSettings,
          ctx
        );
        if (sent) {
          await this._integrationRepository.incrementAutoDmSentCountForPost(
            integrationId,
            tweetId,
            1
          );
        }
      }

      await this.runThresholdPlugs(
        xProvider,
        integration,
        orgId,
        integrationId,
        tweetId,
        postSettings
      );
    }

    const follows = (payload.follow_events as any[]) || [];
    if (follows.length > 0) {
      const followerPlug =
        await this._integrationRepository.getActivePlugByFunction(
          orgId,
          integrationId,
          'autoDmFollowers'
        );
      if (!followerPlug) {
        this.log.warn(
          `TweetStream follow event(s) for @${integration.profile} but autoDmFollowers plug is off — enable Auto-DM new followers in profile automations.`
        );
      } else {
        const fields = this.parsePlugFields(followerPlug.data);
        const fCtx = this.buildFollowerPlugContext(
          'autoDmFollowers',
          integrationId
        );
        for (const ev of follows) {
          const followerId = this.userIdFromUser(ev.source);
          if (!followerId) continue;
          const sent = await xProvider.webhookDmFollower(
            integration,
            followerId,
            fields as any,
            undefined,
            fCtx
          );
          if (sent) {
            this.log.log(
              `TweetStream: welcome DM sent to follower ${followerId} (@${integration.profile})`
            );
          } else {
            this.log.warn(
              `TweetStream: follow from ${followerId} — welcome DM not sent (baseline, empty message, X 403/429, or DM window). Check backend logs for X AUTO DM.`
            );
          }
        }
      }
    }

    const tweets = (payload.tweet_create_events as any[]) || [];
    for (const tw of tweets) {
      const authorId = this.userIdFromUser(tw.user);
      if (!authorId || authorId === integration.internalId) {
        continue;
      }

      const rtStatus = tw.retweeted_status;
      if (rtStatus) {
        const originalId = this.tweetIdFromStatus(rtStatus);
        if (!originalId) continue;

        await this.tryPinnedPostDm(
          xProvider,
          integration,
          orgId,
          integrationId,
          originalId,
          authorId,
          'retweet',
          pinnedTweetId
        );

        const postSettings = await this.loadPostSettings(
          integrationId,
          originalId
        );
        const dmPlug =
          await this._integrationRepository.getActivePlugByFunction(
            orgId,
            integrationId,
            'autoDmEngagers'
          );
        if (dmPlug) {
          const fields = this.parsePlugFields(dmPlug.data);
          const ctx = this.buildEngagementPlugContext(
            'autoDmEngagers',
            integrationId,
            originalId
          );
          await xProvider.webhookDmEngager(
            integration,
            originalId,
            authorId,
            'retweet',
            fields as any,
            postSettings,
            ctx
          );
        }
        continue;
      }

      const replyToId = String(
        tw.in_reply_to_status_id_str ?? tw.in_reply_to_status_id ?? ''
      ).trim();
      if (replyToId) {
        await this.tryPinnedPostDm(
          xProvider,
          integration,
          orgId,
          integrationId,
          replyToId,
          authorId,
          'reply',
          pinnedTweetId
        );

        const postSettings = await this.loadPostSettings(
          integrationId,
          replyToId
        );
        const dmPlug =
          await this._integrationRepository.getActivePlugByFunction(
            orgId,
            integrationId,
            'autoDmEngagers'
          );
        if (!dmPlug) {
          this.log.warn(
            `TweetStream reply on tweet ${replyToId} but autoDmEngagers plug is off for @${integration.profile} — enable Direct Message Engagers in plugs.`
          );
        } else {
          const fields = this.parsePlugFields(dmPlug.data);
          const ctx = this.buildEngagementPlugContext(
            'autoDmEngagers',
            integrationId,
            replyToId
          );
          const sent = await xProvider.webhookDmEngager(
            integration,
            replyToId,
            authorId,
            'reply',
            fields as any,
            postSettings,
            ctx
          );
          if (sent) {
            await this._integrationRepository.incrementAutoDmSentCountForPost(
              integrationId,
              replyToId,
              1
            );
            this.log.log(
              `Xquik/realtime: reply DM sent to ${authorId} for tweet ${replyToId} (@${integration.profile})`
            );
          } else {
            this.log.warn(
              `Xquik/realtime: reply from ${authorId} on tweet ${replyToId} — no DM sent (check post auto_dm_enabled, reply target, already-DMd, or X 403/429 in logs)`
            );
          }
        }
      }
    }
  }

  private async runThresholdPlugs(
    xProvider: XProvider,
    integration: Integration,
    orgId: string,
    integrationId: string,
    tweetId: string,
    postSettings: any
  ) {
    const plugs: {
      autoRepostPost?: { likesAmount: string };
      autoPlugPost?: { likesAmount: string; post: string };
      autoThreadReply?: { likesAmount: string; thread: string };
    } = {};

    const repost = await this._integrationRepository.getActivePlugByFunction(
      orgId,
      integrationId,
      'autoRepostPost'
    );
    if (repost) {
      plugs.autoRepostPost = this.parsePlugFields(repost.data) as any;
    }
    const plugReply = await this._integrationRepository.getActivePlugByFunction(
      orgId,
      integrationId,
      'autoPlugPost'
    );
    if (plugReply) {
      plugs.autoPlugPost = this.parsePlugFields(plugReply.data) as any;
    }
    const thread = await this._integrationRepository.getActivePlugByFunction(
      orgId,
      integrationId,
      'autoThreadReply'
    );
    if (thread) {
      plugs.autoThreadReply = this.parsePlugFields(thread.data) as any;
    }

    if (!plugs.autoRepostPost && !plugs.autoPlugPost && !plugs.autoThreadReply) {
      return;
    }

    const ctx = this.buildEngagementPlugContext(
      'autoThreadReply',
      integrationId,
      tweetId
    );
    await xProvider.webhookRunLikeThresholdPlugs(
      integration,
      tweetId,
      plugs,
      postSettings,
      ctx
    );
  }
}
