import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  getXMonitorWatchIntervalMs,
  getXMonitorWatchLikesMaxPosts,
  xMonitorPublishedPostsTake,
  isXMonitorFollowersEnabled,
  isXMonitorLikesEnabled,
  isXMonitorActivityOnlyMode,
  isXMonitorWatchEnabled,
  isXMonitorWatchFollowers,
  isXMonitorWatchLikes,
} from '@gitroom/helpers/x/x.monitor.env';
import {
  XMonitorRegistry,
  type MonitoredChannel,
} from '@gitroom/nestjs-libraries/x-monitor/x-monitor.registry';
import {
  getWatchedCount,
  setWatchedCount,
} from '@gitroom/nestjs-libraries/x-monitor/x-monitor.state';
import {
  fetchAccountFollowersCount,
  fetchTweetFavoriteCount,
} from '@gitroom/nestjs-libraries/x-monitor/x-monitor.watch.metrics';
import { buildScrapeSession } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.scrape.core';
import { XMonitorFollowersService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.followers';
import { XMonitorSupplementService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.supplement';
import { XMonitorWebSocketHub } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.ws';

export type WatchSignal = {
  kind: 'follow' | 'like';
  handle: string;
  tweetId?: string;
  previousCount: number;
  currentCount: number;
};

/**
 * "Watcher" loop: cheap count checks on an interval. When followers_count or
 * favorite_count increases, run full scrape + ingest.
 *
 * This is NOT an X-owned WebSocket subscription — X does not expose public WS
 * for arbitrary account/tweet like-follower deltas. This mimics watch→scrape.
 */
@Injectable()
export class XMonitorChangeWatcherService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(XMonitorChangeWatcherService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly countFailWarned = new Set<string>();

  constructor(
    private readonly registry: XMonitorRegistry,
    private readonly prisma: PrismaService,
    private readonly followers: XMonitorFollowersService,
    private readonly likes: XMonitorSupplementService,
    private readonly ws: XMonitorWebSocketHub
  ) {}

  onModuleInit(): void {
    if (!isXMonitorWatchEnabled()) {
      return;
    }

    const ms = getXMonitorWatchIntervalMs();
    this.log.log(
      `Change watcher on (every ${Math.round(ms / 1000)}s): cheap count checks → watch_signal on WS → full scrape on increase`
    );
    if (isXMonitorActivityOnlyMode()) {
      this.log.log(
        'Activity-only mode: no interval follower/like list scraping — scrape runs only after count delta or stream activity'
      );
    }

    this.timer = setInterval(() => void this.runTick(), ms);
  }

  /** First tick after registry + DB are ready (avoids empty-channel race on startup). */
  onApplicationBootstrap(): void {
    if (!isXMonitorWatchEnabled()) {
      return;
    }
    void this.runTick();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async runTick(): Promise<void> {
    if (this.running) {
      this.log.debug('Change watcher tick skipped — previous tick still running');
      return;
    }
    this.running = true;
    const started = Date.now();
    let followerBaselines = 0;
    let likeBaselines = 0;
    let followerFails = 0;
    let likeFails = 0;
    const followerStatus: string[] = [];
    const likeStatus: string[] = [];
    try {
      const channels = this.registry.getChannels();
      if (!channels.length) {
        this.log.warn(
          'Change watcher tick: no channels in registry (wait for handle sync)'
        );
        return;
      }

      const session = await buildScrapeSession();
      for (const ch of channels) {
        if (isXMonitorWatchFollowers() && isXMonitorFollowersEnabled()) {
          const ok = await this.watchAccountFollowers(ch, session, followerStatus);
          if (ok === 'baseline') followerBaselines += 1;
          if (ok === 'fail') followerFails += 1;
        }
        if (isXMonitorWatchLikes() && isXMonitorLikesEnabled()) {
          const stats = await this.watchTweetLikes(ch, session, likeStatus);
          likeBaselines += stats.baselines;
          likeFails += stats.fails;
        }
      }

      const followerPart =
        followerStatus.length > 0
          ? `followers [${followerStatus.join(', ')}]`
          : 'followers [off]';
      const likePart =
        likeStatus.length > 0
          ? `likes [${likeStatus.join(', ')}]`
          : 'likes [no posts to watch]';

      this.log.log(
        `Change watcher tick done (${Math.round((Date.now() - started) / 1000)}s): ` +
          `${channels.length} channel(s), ${followerPart}; ${likePart}` +
          (followerBaselines || likeBaselines
            ? `; new baselines +${followerBaselines} follower / +${likeBaselines} like`
            : '') +
          (followerFails || likeFails
            ? `; count fetch failed: ${followerFails} follower / ${likeFails} like`
            : '')
      );
    } finally {
      this.running = false;
    }
  }

  private warnCountFetchOnce(key: string, message: string): void {
    if (this.countFailWarned.has(key)) {
      return;
    }
    this.countFailWarned.add(key);
    this.log.warn(message);
  }

  private async watchAccountFollowers(
    ch: MonitoredChannel,
    session: Awaited<ReturnType<typeof buildScrapeSession>>,
    statusOut: string[]
  ): Promise<'baseline' | 'ok' | 'fail'> {
    const count = await fetchAccountFollowersCount(
      {
        handle: ch.handle,
        userId: ch.internalId || undefined,
      },
      session
    );
    if (count === undefined) {
      statusOut.push(`@${ch.handle}:?`);
      this.warnCountFetchOnce(
        `followers:${ch.handle}`,
        `@${ch.handle}: could not read followers_count — check X_MONITOR_SCRAPE_COOKIE and scrape debug logs`
      );
      return 'fail';
    }

    const key = `followers_count:${ch.integrationId}`;
    const prev = await getWatchedCount(key);
    if (prev === undefined) {
      await setWatchedCount(key, count);
      this.log.log(`@${ch.handle}: watch baseline followers_count=${count}`);
      statusOut.push(`@${ch.handle}:${count} new`);
      return 'baseline';
    }

    statusOut.push(
      `@${ch.handle}:${count}${count === prev ? '' : ` (was ${prev})`}`
    );

    if (count > prev) {
      this.log.log(
        `@${ch.handle}: [watch] followers ${prev} → ${count} — full scrape`
      );
      this.emitWatchSignal({
        kind: 'follow',
        handle: ch.handle,
        previousCount: prev,
        currentCount: count,
      });
      await setWatchedCount(key, count);
      await this.followers.checkChannelNow(ch, 'watch');
      return 'ok';
    }

    if (count < prev) {
      await setWatchedCount(key, count);
      if (isXMonitorFollowersEnabled()) {
        this.log.log(
          `@${ch.handle}: [watch] followers ${prev} → ${count} — sync follower list`
        );
        void this.followers.checkChannelNow(ch, 'watch-decrease');
      }
    }
    return 'ok';
  }

  private async watchTweetLikes(
    ch: MonitoredChannel,
    session: Awaited<ReturnType<typeof buildScrapeSession>>,
    statusOut: string[]
  ): Promise<{ baselines: number; fails: number }> {
    let baselines = 0;
    let fails = 0;
    let tracked = 0;
    const maxPosts = getXMonitorWatchLikesMaxPosts();
    const posts = await this.prisma.post.findMany({
      where: {
        integrationId: ch.integrationId,
        state: 'PUBLISHED',
        deletedAt: null,
        releaseId: { not: null, notIn: ['missing', ''] },
      },
      orderBy: { publishDate: 'desc' },
      ...xMonitorPublishedPostsTake(maxPosts),
      select: { releaseId: true },
    });

    if (!posts.length) {
      return { baselines, fails };
    }

    for (const post of posts) {
      const tweetId = String(post.releaseId ?? '').trim();
      if (!tweetId) continue;

      const count = await fetchTweetFavoriteCount(tweetId, session);
      if (count === undefined) {
        fails += 1;
        this.warnCountFetchOnce(
          `likes:${ch.handle}:${tweetId}`,
          `@${ch.handle} tweet ${tweetId}: could not read favorite_count`
        );
        continue;
      }

      tracked += 1;
      const key = `likes_count:${ch.integrationId}:${tweetId}`;
      const prev = await getWatchedCount(key);
      if (prev === undefined) {
        await setWatchedCount(key, count);
        this.log.log(
          `@${ch.handle} tweet ${tweetId}: watch baseline favorite_count=${count}`
        );
        baselines += 1;
        // If likes already exist when we first see this tweet, scrape now — otherwise
        // we only store the count and miss likers until the *next* like (common right
        // after publish when the first watcher tick runs late).
        if (count > 0) {
          await this.likes.checkLikesForTweetIds(
            ch,
            [tweetId],
            'watch-baseline'
          );
        }
        continue;
      }

      if (count > prev) {
        this.log.log(
          `@${ch.handle}: [watch] tweet ${tweetId} likes ${prev} → ${count} — full scrape`
        );
        this.emitWatchSignal({
          kind: 'like',
          handle: ch.handle,
          tweetId,
          previousCount: prev,
          currentCount: count,
        });
        await setWatchedCount(key, count);
        await this.likes.checkLikesForTweetIds(ch, [tweetId], 'watch');
      } else if (count < prev) {
        await setWatchedCount(key, count);
      }
    }

    if (tracked > 0) {
      statusOut.push(`@${ch.handle}:${tracked} tweet(s)`);
    }
    return { baselines, fails };
  }

  private emitWatchSignal(signal: WatchSignal): void {
    this.ws.broadcastWatchSignal(signal);
  }
}
