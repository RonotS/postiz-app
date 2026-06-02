import { Injectable, Logger } from '@nestjs/common';
import { ETwitterStreamEvent, TwitterApi, type TweetV2 } from 'twitter-api-v2';
import {
  getXMonitorRuleTagPrefix,
  getXMonitorStreamConnectionLimitWaitMs,
  getXMonitorStreamReconnectMs,
  isXMonitorPushIngestViaHttp,
} from '@gitroom/helpers/x/x.monitor.env';
import { buildStreamRules } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.rules';
import { XMonitorRegistry } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.registry';
import { mapStreamTweetToIngestEvents } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.mapper';
import { markEngagementOnce } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.state';
import { XMonitorIngestClient } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.ingest.client';
import { XMonitorWebSocketHub } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.ws';
import { XMonitorReactiveScrapeService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.reactive-scrape';

@Injectable()
export class XMonitorStreamService {
  private readonly log = new Logger(XMonitorStreamService.name);
  private stopped = false;
  private running = false;
  private activeStream: { close: () => void } | null = null;

  constructor(
    private readonly registry: XMonitorRegistry,
    private readonly ingest: XMonitorIngestClient,
    private readonly ws: XMonitorWebSocketHub,
    private readonly reactiveScrape: XMonitorReactiveScrapeService
  ) {}

  stop(): void {
    this.stopped = true;
    this.closeActiveStream();
  }

  private closeActiveStream(): void {
    const stream = this.activeStream;
    this.activeStream = null;
    if (!stream) {
      return;
    }
    try {
      stream.close();
    } catch {
      /* ignore */
    }
  }

  private isTooManyConnectionsError(err: unknown): boolean {
    const text = JSON.stringify(
      (err as { data?: unknown; message?: string })?.data ??
        (err as { message?: string })?.message ??
        err ??
        ''
    ).toLowerCase();
    return (
      text.includes('toomanyconnections') ||
      text.includes('maximum allowed connection limit')
    );
  }

  private reconnectDelayMs(err: unknown): number {
    if (this.isTooManyConnectionsError(err)) {
      const wait = getXMonitorStreamConnectionLimitWaitMs();
      this.log.warn(
        `Filtered stream at connection limit — waiting ${Math.round(wait / 1000)}s before reconnect (close other stream clients using the same app keys)`
      );
      return wait;
    }
    return getXMonitorStreamReconnectMs();
  }

  async syncRules(handles: string[]): Promise<void> {
    if (!process.env.X_API_KEY?.trim() || !process.env.X_API_SECRET?.trim()) {
      throw new Error('X_API_KEY and X_API_SECRET required for filtered stream');
    }

    const rules = buildStreamRules(handles);
    this.registry.setRuleTagHandles(rules);

    const client = await this.appClient();
    const prefix = getXMonitorRuleTagPrefix();
    const existing = await client.v2.streamRules();
    const toDelete =
      existing.data
        ?.filter((r) => r.tag?.startsWith(prefix))
        .map((r) => r.id)
        .filter(Boolean) ?? [];

    if (toDelete.length) {
      await client.v2.updateStreamRules({ delete: { ids: toDelete } });
    }

    if (!rules.length) {
      this.log.warn(
        'No stream rules — connect X channels in Postiz or set X_MONITOR_HANDLES'
      );
      return;
    }

    await client.v2.updateStreamRules({
      add: rules.map((r) => ({ value: r.value, tag: r.tag })),
    });

    this.log.log(
      `Filtered stream rules: ${rules.length} batch(es), ${handles.length} @handle(s) (push, not polling)`
    );
  }

  startStreamLoop(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.stopped = false;
    void this.runForever();
  }

  private async appClient(): Promise<TwitterApi> {
    const app = new TwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
    });
    return app.appLogin();
  }

  private async runForever(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.consumeStream();
      } catch (err: unknown) {
        this.closeActiveStream();
        this.log.error(
          'Filtered stream error (reconnecting):',
          (err as { data?: unknown; message?: string })?.data ||
            (err as { message?: string })?.message ||
            err
        );
        if (this.stopped) {
          break;
        }
        await sleep(this.reconnectDelayMs(err));
        continue;
      }
      if (this.stopped) {
        break;
      }
      this.closeActiveStream();
      await sleep(getXMonitorStreamReconnectMs());
    }
    this.running = false;
  }

  private consumeStream(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        fn();
      };

      try {
        this.closeActiveStream();
        const client = await this.appClient();
        const stream = await client.v2.searchStream({
          'tweet.fields': [
            'author_id',
            'referenced_tweets',
            'created_at',
            'text',
          ],
        });

        // We reconnect in runForever — library autoReconnect would open a 2nd connection.
        stream.autoReconnect = false;
        this.activeStream = stream;

        stream.on(ETwitterStreamEvent.Data, (payload) => {
          void this.onStreamPayload(payload).catch((err) =>
            this.log.error('onStreamPayload:', err)
          );
        });

        stream.on(ETwitterStreamEvent.Error, (err) => {
          this.log.error('Stream error event:', err);
          this.closeActiveStream();
          finish(() => reject(err));
        });

        stream.on(ETwitterStreamEvent.ConnectionError, (err) => {
          this.log.error('Stream connection error:', err);
          this.closeActiveStream();
          finish(() => reject(err));
        });

        stream.on(ETwitterStreamEvent.ConnectionClosed, () => {
          this.log.warn('Stream connection closed');
          this.closeActiveStream();
          finish(() => resolve());
        });

        stream.on(ETwitterStreamEvent.Connected, () => {
          this.log.log(
            'X filtered stream connected — X pushes matching tweets (not polling)'
          );
        });
      } catch (err) {
        this.closeActiveStream();
        finish(() => reject(err));
      }
    });
  }

  private async onStreamPayload(payload: {
    data?: TweetV2;
    matching_rules?: { tag?: string }[];
  }): Promise<void> {
    const tweet = payload.data;
    if (!tweet?.id) {
      return;
    }

    const ruleTag = payload.matching_rules?.[0]?.tag;
    this.reactiveScrape.onStreamTweet(tweet, ruleTag);
    const events = mapStreamTweetToIngestEvents(tweet, this.registry, ruleTag);

    for (const event of events) {
        const integrationId =
          this.registry
            .getChannels()
            .find((c) => c.handle === event.handle)?.integrationId ?? 'stream';

      const first = await markEngagementOnce(
        integrationId,
        event.kind,
        event.userId!,
        event.tweetId
      );
      if (!first) {
        continue;
      }

      this.ws.broadcast(event);

      if (isXMonitorPushIngestViaHttp()) {
        void this.ingest.push(event);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
