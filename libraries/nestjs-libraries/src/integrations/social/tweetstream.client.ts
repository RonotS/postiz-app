import WebSocket from 'ws';
import { Logger } from '@nestjs/common';
import {
  getTweetStreamApiKey,
  getTweetStreamWsCooldownRedisKey,
  getTweetStreamWsUrl,
} from '@gitroom/helpers/x/tweetstream.env';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { TweetStreamEnvelope } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.types';

export type TweetStreamMessageHandler = (
  envelope: TweetStreamEnvelope
) => void | Promise<void>;

export type TweetStreamWebSocketCallbacks = {
  onOpen?: () => void;
  onClose?: () => void;
};

const RECONNECT_MS = 5_000;
const RECONNECT_MAX_MS = 300_000;
const RATE_LIMIT_COOLDOWN_MS = 180_000;

export class TweetStreamWebSocketClient {
  private readonly log = new Logger(TweetStreamWebSocketClient.name);
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private reconnectDelayMs = RECONNECT_MS;
  private rateLimitedUntil = 0;

  constructor(
    private readonly onMessage: TweetStreamMessageHandler,
    private readonly apiKey = getTweetStreamApiKey() ?? '',
    private readonly callbacks?: TweetStreamWebSocketCallbacks
  ) {}

  async start(): Promise<void> {
    if (!this.apiKey) {
      this.log.warn('TweetStream WebSocket not started: missing TWEETSTREAM_API_KEY');
      return;
    }
    const cooldownUntil = await ioRedis.get(getTweetStreamWsCooldownRedisKey());
    if (cooldownUntil && Number(cooldownUntil) > Date.now()) {
      const waitSec = Math.ceil((Number(cooldownUntil) - Date.now()) / 1000);
      this.log.warn(
        `TweetStream WS cooldown active (~${waitSec}s left). Not connecting yet.`
      );
      this.scheduleReconnect();
      return;
    }
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }

    const url = getTweetStreamWsUrl();
    const protocols = [
      'tweetstream.v1',
      `tweetstream.auth.token.${this.apiKey}`,
    ];

    try {
      this.ws = new WebSocket(url, protocols);
    } catch (err) {
      this.log.error('TweetStream WebSocket construct failed:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.reconnectDelayMs = RECONNECT_MS;
      this.rateLimitedUntil = 0;
      this.log.log('Connected to TweetStream WebSocket');
      this.callbacks?.onOpen?.();
    });

    this.ws.on('message', (data) => {
      void this.handleRawMessage(data).catch((err) =>
        this.log.error('TweetStream message handler failed:', err)
      );
    });

    this.ws.on('close', (code, reason) => {
      this.log.warn(
        `TweetStream WebSocket closed code=${code} reason=${reason?.toString() || ''}`
      );
      this.ws = null;
      this.callbacks?.onClose?.();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err: Error & { message?: string }) => {
      const msg = String(err?.message ?? err);
      if (msg.includes('429')) {
        const until = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        this.rateLimitedUntil = until;
        void ioRedis.set(
          getTweetStreamWsCooldownRedisKey(),
          String(until),
          'EX',
          Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000)
        );
        this.reconnectDelayMs = Math.min(
          Math.max(this.reconnectDelayMs * 2, 90_000),
          RECONNECT_MAX_MS
        );
        this.log.warn(
          `TweetStream WebSocket rate limited (429). Trial allows 1 connection — ` +
            `stop other backends/CLI listen, wait ~3 min. Next retry in ${Math.round(this.reconnectDelayMs / 1000)}s.`
        );
      } else {
        this.log.error('TweetStream WebSocket error:', err);
      }
      try {
        this.ws?.close();
      } catch {
        /* ignore */
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const now = Date.now();
    const delay = Math.max(
      this.reconnectDelayMs,
      this.rateLimitedUntil > now ? this.rateLimitedUntil - now : 0
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private async handleRawMessage(data: unknown): Promise<void> {
    const text =
      typeof data === 'string'
        ? data
        : Buffer.isBuffer(data)
          ? data.toString('utf8')
          : Array.isArray(data)
            ? Buffer.concat(data as Buffer[]).toString('utf8')
            : String(data ?? '');

    let envelope: TweetStreamEnvelope;
    try {
      envelope = JSON.parse(text) as TweetStreamEnvelope;
    } catch {
      return;
    }

    if (envelope.t === 'control') {
      return;
    }

    await this.onMessage(envelope);
  }
}
