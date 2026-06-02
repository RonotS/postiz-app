import { Injectable, Logger } from '@nestjs/common';
import type { TweetV2 } from 'twitter-api-v2';
import {
  getXMonitorReactiveScrapeDebounceMs,
  isXMonitorFollowersEnabled,
  isXMonitorLikesEnabled,
  isXMonitorReactiveScrapeEnabled,
  isXMonitorReactiveScrapeFollowersOnStream,
  isXMonitorActivityOnlyMode,
} from '@gitroom/helpers/x/x.monitor.env';
import { normalizeXHandle } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.normalize';
import { XMonitorRegistry } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.registry';
import { XMonitorFollowersService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.followers';
import { XMonitorSupplementService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.supplement';

/**
 * When the X filtered stream (persistent push connection) delivers a tweet involving a
 * monitored @handle, immediately run like/follower scrape instead of waiting for the poll timer.
 *
 * This is NOT a separate WebSocket that sees likes/follows — X does not push those on the stream.
 * Silent likes (no reply) and silent follows still need interval poll or Account Activity webhooks.
 */
@Injectable()
export class XMonitorReactiveScrapeService {
  private readonly log = new Logger(XMonitorReactiveScrapeService.name);
  private readonly likeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly followerTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly registry: XMonitorRegistry,
    private readonly followers: XMonitorFollowersService,
    private readonly likes: XMonitorSupplementService
  ) {}

  onModuleInit(): void {
    if (!isXMonitorReactiveScrapeEnabled()) {
      return;
    }
    this.log.log(
      'Reactive scrape enabled: filtered stream activity triggers immediate like/follower checks (debounced)'
    );
    if (isXMonitorActivityOnlyMode()) {
      this.log.log(
        'Activity-only: stream tweet on a monitored @handle can trigger scrape without waiting for count watcher'
      );
    }
  }

  /**
   * Called for every tweet the filtered stream delivers (before ingest mapping).
   */
  onStreamTweet(tweet: TweetV2, ruleTag?: string): void {
    if (!isXMonitorReactiveScrapeEnabled()) {
      return;
    }

    const handle = this.resolveMonitoredHandle(tweet, ruleTag);
    if (!handle) {
      return;
    }

    const ch = this.registry
      .getChannels()
      .find((c) => c.handle === handle);
    if (!ch) {
      return;
    }

    const tweetIds = collectTweetIdsForLikeCheck(tweet);
    if (isXMonitorLikesEnabled() && tweetIds.length) {
      this.scheduleLikeCheck(ch.integrationId, ch, tweetIds);
    }

    if (isXMonitorReactiveScrapeFollowersOnStream() && isXMonitorFollowersEnabled()) {
      this.scheduleFollowerCheck(ch.integrationId, ch);
    }
  }

  private resolveMonitoredHandle(tweet: TweetV2, ruleTag?: string): string | undefined {
    const fromTag = this.registry.resolveHandleFromTag(ruleTag);
    if (fromTag) {
      return fromTag;
    }

    const text = String(tweet.text ?? '');
    const handlesInText = [...text.matchAll(/@([a-zA-Z0-9_]{1,15})/g)].map((m) =>
      normalizeXHandle(m[1])
    );
    return this.registry.resolveHandle(handlesInText);
  }

  private scheduleLikeCheck(
    key: string,
    ch: Parameters<XMonitorSupplementService['checkLikesForTweetIds']>[0],
    tweetIds: string[]
  ): void {
    const debounceMs = getXMonitorReactiveScrapeDebounceMs();
    const timerKey = `${key}:likes:${tweetIds.sort().join(',')}`;
    const existing = this.likeTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
    }

    this.likeTimers.set(
      timerKey,
      setTimeout(() => {
        this.likeTimers.delete(timerKey);
        this.log.log(
          `[reactive] stream → like scrape @${ch.handle} tweet(s) ${tweetIds.join(', ')}`
        );
        void this.likes.checkLikesForTweetIds(ch, tweetIds, 'stream');
      }, debounceMs)
    );
  }

  private scheduleFollowerCheck(
    integrationId: string,
    ch: Parameters<XMonitorFollowersService['checkChannelNow']>[0]
  ): void {
    const debounceMs = Math.max(getXMonitorReactiveScrapeDebounceMs(), 5_000);
    const existing = this.followerTimers.get(integrationId);
    if (existing) {
      clearTimeout(existing);
    }

    this.followerTimers.set(
      integrationId,
      setTimeout(() => {
        this.followerTimers.delete(integrationId);
        this.log.log(`[reactive] stream → follower scrape @${ch.handle}`);
        void this.followers.checkChannelNow(ch, 'stream');
      }, debounceMs)
    );
  }
}

function collectTweetIdsForLikeCheck(tweet: TweetV2): string[] {
  const ids = new Set<string>();
  const selfId = String(tweet.id ?? '').trim();
  if (selfId) {
    ids.add(selfId);
  }
  for (const ref of tweet.referenced_tweets ?? []) {
    const id = String(ref.id ?? '').trim();
    if (id && (ref.type === 'replied_to' || ref.type === 'retweeted')) {
      ids.add(id);
    }
  }
  return [...ids];
}
