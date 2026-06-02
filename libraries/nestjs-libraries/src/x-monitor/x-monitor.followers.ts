import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  getXMonitorFollowersIntervalMs,
  getXMonitorFollowersPageSize,
  getXMonitorScrapeChannelStaggerMs,
  isXMonitorFollowersEnabled,
  isXMonitorFollowersPollEnabled,
  isXMonitorFollowersScrapeEnabled,
  isXMonitorActivityOnlyMode,
  isXMonitorFollowersScrapeFallbackApi,
  isXMonitorPushIngestViaHttp,
  isXMonitorScrapeDebug,
} from '@gitroom/helpers/x/x.monitor.env';
import { fetchFollowersViaScrape } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.followers.scrape';
import {
  XMonitorRegistry,
  type MonitoredChannel,
} from '@gitroom/nestjs-libraries/x-monitor/x-monitor.registry';
import { buildXMonitorUserClient } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.twitter';
import {
  clearEngagementDedup,
  loadFollowerBaseline,
  markEngagementOnce,
  saveFollowerBaseline,
} from '@gitroom/nestjs-libraries/x-monitor/x-monitor.state';
import { XMonitorIngestClient } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.ingest.client';
import { XMonitorWebSocketHub } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.ws';
import { mapNewFollowerToIngestEvent } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.follow.mapper';
import type { XCustomIngestEvent } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.types';

type FollowerUser = { id: string; username?: string };

/**
 * New-follower detection via X API GET /2/users/:id/followers (own stack — no TweetStream/Xquik).
 * X does not push follow events on filtered stream; this polls each channel on a staggered schedule.
 */
@Injectable()
export class XMonitorFollowersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(XMonitorFollowersService.name);
  private readonly channelTimers = new Map<string, NodeJS.Timeout>();
  private readonly channelRunning = new Set<string>();

  constructor(
    private readonly registry: XMonitorRegistry,
    private readonly ingest: XMonitorIngestClient,
    private readonly ws: XMonitorWebSocketHub
  ) {}

  onModuleInit(): void {
    if (!isXMonitorFollowersEnabled()) {
      return;
    }
    const mode = isXMonitorFollowersScrapeEnabled() ? 'scrape' : 'X API';
    if (isXMonitorFollowersPollEnabled()) {
      const ms = getXMonitorFollowersIntervalMs();
      this.log.log(
        `Follower poll enabled (every ${Math.round(ms / 1000)}s per channel via ${mode})`
      );
    } else if (isXMonitorActivityOnlyMode()) {
      this.log.log(
        `Follower detection: activity-only (${mode}) — full list scrape on watch_signal / stream, no interval poll`
      );
    }
    if (isXMonitorFollowersScrapeEnabled()) {
      this.log.warn(
        'Follower scrape mode is on — unofficial, may break, may violate X ToS. Look for [scrape ok] in logs.'
      );
    }
    if (isXMonitorScrapeDebug()) {
      this.log.log('X_MONITOR_SCRAPE_DEBUG=true — verbose scrape logs enabled');
    }
    this.reconcileChannelTimers();
  }

  onModuleDestroy(): void {
    for (const timer of this.channelTimers.values()) {
      clearInterval(timer);
    }
    this.channelTimers.clear();
  }

  /** Call after registry refresh to add/remove per-channel poll timers. */
  reconcileChannelTimers(): void {
    if (!isXMonitorFollowersEnabled() || !isXMonitorFollowersPollEnabled()) {
      return;
    }

    const ms = getXMonitorFollowersIntervalMs();
    const activeIds = new Set(
      this.registry.getChannels().map((c) => c.integrationId)
    );

    for (const [id, timer] of this.channelTimers) {
      if (!activeIds.has(id)) {
        clearInterval(timer);
        this.channelTimers.delete(id);
      }
    }

    let staggerIndex = 0;
    const staggerMs = getXMonitorScrapeChannelStaggerMs();

    for (const ch of this.registry.getChannels()) {
      if (this.channelTimers.has(ch.integrationId)) {
        continue;
      }
      const startDelay = staggerIndex * staggerMs;
      staggerIndex += 1;
      if (startDelay > 0) {
        setTimeout(() => {
          void this.checkChannelNow(ch, 'interval');
        }, startDelay);
      } else {
        void this.checkChannelNow(ch, 'interval');
      }
      const timer = setInterval(() => {
        void this.checkChannelNow(ch, 'interval');
      }, ms);
      this.channelTimers.set(ch.integrationId, timer);
    }
  }

  /** Immediate follower check (e.g. triggered by filtered stream activity). */
  checkChannelNow(ch: MonitoredChannel, reason = 'manual'): Promise<void> {
    return this.checkNewFollowers(ch, reason);
  }

  private async checkNewFollowers(
    ch: MonitoredChannel,
    reason = 'interval'
  ): Promise<void> {
    const scrape = isXMonitorFollowersScrapeEnabled();
    if (!scrape && (!ch.token || !ch.internalId)) {
      return;
    }
    if (scrape && !ch.handle) {
      return;
    }
    if (this.channelRunning.has(ch.integrationId)) {
      return;
    }
    this.channelRunning.add(ch.integrationId);

    try {
      const followers = await this.loadRecentFollowers(ch);

      const ids = followers.map((f) => f.id);
      const currentSet = new Set(ids);
      const baseline = await loadFollowerBaseline(ch.integrationId);

      if (!baseline) {
        await saveFollowerBaseline(ch.integrationId, ids);
        this.log.log(
          `@${ch.handle}: follower baseline set (${ids.length} ids, no welcome DMs on first run)`
        );
        return;
      }

      const departed = [...baseline].filter((id) => !currentSet.has(id));
      for (const id of departed) {
        await clearEngagementDedup(ch.integrationId, 'follow', id);
      }
      if (departed.length > 0) {
        this.log.log(
          `@${ch.handle}: ${departed.length} follower(s) no longer in list (${reason})`
        );
      }

      const activeBaseline = new Set(
        [...baseline].filter((id) => currentSet.has(id))
      );
      const newOnes = followers.filter((f) => !activeBaseline.has(f.id));
      await saveFollowerBaseline(ch.integrationId, ids);

      for (const follower of newOnes) {
        const event = mapNewFollowerToIngestEvent(
          { handle: ch.handle, internalId: ch.internalId },
          follower
        );
        const first = await markEngagementOnce(
          ch.integrationId,
          'follow',
          follower.id
        );
        if (!first) {
          continue;
        }
        await this.emitIngest(event);
      }

      if (newOnes.length) {
        this.log.log(
          `@${ch.handle}: ${newOnes.length} new follower(s) → ingest (${reason})`
        );
      } else if (reason === 'stream') {
        this.log.debug(`@${ch.handle}: stream-triggered follower check — no new followers`);
      }
    } catch (err: any) {
      this.log.warn(
        `Follower check @${ch.handle} failed:`,
        err?.data || err?.message || err
      );
    } finally {
      this.channelRunning.delete(ch.integrationId);
    }
  }

  private async loadRecentFollowers(ch: MonitoredChannel): Promise<FollowerUser[]> {
    const pageSize = getXMonitorFollowersPageSize();
    if (isXMonitorFollowersScrapeEnabled()) {
      try {
        const scraped = await fetchFollowersViaScrape({
          handle: ch.handle,
          userId: ch.internalId || undefined,
          maxResults: pageSize,
        });
        if (scraped.users.length) {
          return scraped.users;
        }
      } catch (err) {
        this.log.warn(`@${ch.handle}: follower scrape failed:`, err);
      }
      if (!isXMonitorFollowersScrapeFallbackApi() || !ch.token || !ch.internalId) {
        return [];
      }
      this.log.warn(`@${ch.handle}: scrape empty/failed — falling back to X API`);
    }
    return this.loadFollowersViaApi(ch, pageSize);
  }

  private async loadFollowersViaApi(
    ch: MonitoredChannel,
    pageSize: number
  ): Promise<FollowerUser[]> {
    const client = buildXMonitorUserClient(ch.token);
    const res = await client.v2.followers(ch.internalId, {
      max_results: pageSize,
      'user.fields': ['username'],
    });
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
