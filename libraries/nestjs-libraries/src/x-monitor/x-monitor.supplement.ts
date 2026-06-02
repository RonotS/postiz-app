import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  getXMonitorLikesIntervalMs,
  getXMonitorLikesMaxPostsPerChannel,
  xMonitorPublishedPostsTake,
  isXMonitorLikesEnabled,
  isXMonitorLikesPollEnabled,
  isXMonitorLikesScrapeEnabled,
  isXMonitorActivityOnlyMode,
  isXMonitorLikesScrapeFallbackApi,
  isXMonitorPushIngestViaHttp,
  isXMonitorScrapeDebug,
} from '@gitroom/helpers/x/x.monitor.env';
import {
  XMonitorRegistry,
  type MonitoredChannel,
} from '@gitroom/nestjs-libraries/x-monitor/x-monitor.registry';
import { buildXMonitorUserClient } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.twitter';
import { markEngagementOnce } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.state';
import { XMonitorIngestClient } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.ingest.client';
import { XMonitorWebSocketHub } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.ws';
import { fetchLikersViaScrape } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.likes.scrape';
import type { XCustomIngestEvent } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.types';

type LikerUser = { id: string; username?: string };

/**
 * Likes are not tweets — filtered stream cannot see them.
 * API or optional scrape (no TweetStream/Xquik).
 */
@Injectable()
export class XMonitorSupplementService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(XMonitorSupplementService.name);
  private likesTimer: ReturnType<typeof setInterval> | undefined;
  private likesRunning = false;

  constructor(
    private readonly registry: XMonitorRegistry,
    private readonly prisma: PrismaService,
    private readonly ingest: XMonitorIngestClient,
    private readonly ws: XMonitorWebSocketHub
  ) {}

  onModuleInit(): void {
    if (isXMonitorLikesEnabled()) {
      const mode = isXMonitorLikesScrapeEnabled() ? 'scrape' : 'X API';
      if (isXMonitorLikesPollEnabled()) {
        const ms = getXMonitorLikesIntervalMs();
        const likeLimit = getXMonitorLikesMaxPostsPerChannel();
        this.log.log(
          `Like poll enabled (every ${Math.round(ms / 1000)}s, ${likeLimit ?? 'all'} published post(s) per channel via ${mode})`
        );
        void this.runLikesCycle();
        this.likesTimer = setInterval(() => void this.runLikesCycle(), ms);
      } else if (isXMonitorActivityOnlyMode()) {
        this.log.log(
          `Like detection: activity-only (${mode}) — full liker scrape on watch_signal / stream, no interval poll`
        );
      }
      if (isXMonitorLikesScrapeEnabled()) {
        this.log.warn(
          'Like scrape mode is on — unofficial, may break, may violate X ToS.'
        );
      }
      if (isXMonitorScrapeDebug()) {
        this.log.log('X_MONITOR_SCRAPE_DEBUG=true — verbose scrape logs enabled');
      }
    }
  }

  onModuleDestroy(): void {
    if (this.likesTimer) clearInterval(this.likesTimer);
  }

  private async runLikesCycle(): Promise<void> {
    if (this.likesRunning) return;
    this.likesRunning = true;
    try {
      for (const ch of this.registry.getChannels()) {
        await this.checkNewLikers(ch);
      }
    } finally {
      this.likesRunning = false;
    }
  }

  /** Scrape/API likers for specific tweet ids (e.g. after stream sees activity on that tweet). */
  checkLikesForTweetIds(
    ch: MonitoredChannel,
    tweetIds: string[],
    reason = 'manual'
  ): Promise<void> {
    const ids = [...new Set(tweetIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) {
      return Promise.resolve();
    }
    return this.checkLikesForTweets(ch, ids, reason);
  }

  private async checkNewLikers(ch: MonitoredChannel): Promise<void> {
    const scrape = isXMonitorLikesScrapeEnabled();
    if (!scrape && !ch.token) {
      return;
    }

    const maxPosts = getXMonitorLikesMaxPostsPerChannel();
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

    const tweetIds = posts
      .map((p) => String(p.releaseId ?? '').trim())
      .filter(Boolean);
    if (!tweetIds.length) {
      return;
    }

    await this.checkLikesForTweets(ch, tweetIds, 'interval');
  }

  private async checkLikesForTweets(
    ch: MonitoredChannel,
    tweetIds: string[],
    reason: string
  ): Promise<void> {
    if (!isXMonitorLikesEnabled()) {
      return;
    }
    try {
      for (const tweetId of tweetIds) {
        const likers = await this.loadLikersForTweet(ch, tweetId);
        let newLikes = 0;
        for (const liker of likers) {
          if (liker.id === ch.internalId) continue;
          const first = await markEngagementOnce(
            ch.integrationId,
            'like',
            liker.id,
            tweetId
          );
          if (!first) continue;
          newLikes += 1;
          await this.emitIngest({
            handle: ch.handle,
            kind: 'like',
            tweetId,
            userId: liker.id,
            username: liker.username,
          });
        }
        if (newLikes > 0) {
          this.log.log(
            `@${ch.handle}: ${newLikes} new like(s) on tweet ${tweetId} → ingest (${reason})`
          );
        }
      }
    } catch (err: any) {
      this.log.warn(
        `Like check @${ch.handle} failed:`,
        err?.data || err?.message || err
      );
    }
  }

  private async loadLikersForTweet(
    ch: MonitoredChannel,
    tweetId: string
  ): Promise<LikerUser[]> {
    if (isXMonitorLikesScrapeEnabled()) {
      try {
        const scraped = await fetchLikersViaScrape({
          tweetId,
          maxResults: 100,
        });
        if (scraped.users.length) {
          return scraped.users;
        }
      } catch (err) {
        this.log.warn(`@${ch.handle} tweet ${tweetId}: like scrape failed:`, err);
      }
      if (!isXMonitorLikesScrapeFallbackApi() || !ch.token) {
        return [];
      }
      this.log.warn(
        `@${ch.handle} tweet ${tweetId}: scrape empty/failed — falling back to X API`
      );
    }

    const client = buildXMonitorUserClient(ch.token);
    const res = await client.v2.tweetLikedBy(tweetId, { max_results: 100 });
    return (res?.data ?? [])
      .map((u) => ({
        id: String(u.id ?? ''),
        username: u.username,
      }))
      .filter((u) => u.id);
  }

  private async emitIngest(event: XCustomIngestEvent): Promise<void> {
    this.ws.broadcast(event);
    if (isXMonitorPushIngestViaHttp()) {
      await this.ingest.push(event);
    }
  }
}
