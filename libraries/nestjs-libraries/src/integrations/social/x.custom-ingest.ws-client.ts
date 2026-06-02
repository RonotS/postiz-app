import WebSocket from 'ws';
import { Logger } from '@nestjs/common';
import {
  getXCustomWsReconnectMs,
  getXCustomWsToken,
  getXCustomWsUrl,
} from '@gitroom/helpers/x/x.custom-ingest.env';
import { XCustomIngestService } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.service';

const RECONNECT_MAX_MS = 300_000;

export class XCustomIngestWebSocketClient {
  private readonly log = new Logger(XCustomIngestWebSocketClient.name);
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private reconnectDelayMs = getXCustomWsReconnectMs();

  constructor(private readonly ingest: XCustomIngestService) {}

  start(): void {
    const url = getXCustomWsUrl();
    if (!url) {
      this.log.warn('X_CUSTOM_WS_URL not set — custom WebSocket client not started');
      return;
    }
    this.stopped = false;
    this.connect(url);
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

  private connect(url: string): void {
    if (this.stopped) {
      return;
    }

    const token = getXCustomWsToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      this.ws = new WebSocket(url, token ? [`auth.${token}`] : undefined, {
        headers,
      });
    } catch (err) {
      this.log.error('Custom ingest WebSocket construct failed:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.reconnectDelayMs = getXCustomWsReconnectMs();
      this.log.log(`Connected to custom ingest WebSocket ${url}`);
    });

    this.ws.on('message', (data) => {
      void this.ingest.processRawMessage(wsMessagePayload(data)).catch((err) =>
        this.log.error('Custom ingest message failed:', err)
      );
    });

    this.ws.on('close', (code, reason) => {
      this.log.warn(
        `Custom ingest WebSocket closed code=${code} reason=${reason?.toString() || ''}`
      );
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.log.error('Custom ingest WebSocket error:', err);
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(
      this.reconnectDelayMs * 2,
      RECONNECT_MAX_MS
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      const url = getXCustomWsUrl();
      if (url) {
        this.connect(url);
      }
    }, delay);
  }
}

type WsRawMessage = string | Buffer | ArrayBuffer | Buffer[];

function wsMessagePayload(data: WsRawMessage): string | Buffer {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.from(data);
}
