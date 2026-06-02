import { Logger } from '@nestjs/common';
import WebSocket from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import {
  getXMonitorWsPort,
  getXMonitorWsToken,
  isXMonitorWsEnabled,
} from '@gitroom/helpers/x/x.monitor.env';
import type { XCustomIngestEvent } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.types';
import type { WatchSignal } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.change-watcher';

export class XMonitorWebSocketHub {
  private readonly log = new Logger(XMonitorWebSocketHub.name);
  private wss: WebSocket.Server | null = null;
  private clients = new Set<WebSocket>();

  start(httpServer?: Server): void {
    if (!isXMonitorWsEnabled()) {
      return;
    }

    const port = getXMonitorWsPort();
    this.wss = httpServer
      ? new WebSocket.Server({ server: httpServer, path: '/ws' })
      : new WebSocket.Server({ port, path: '/ws' });

    this.wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
      if (!this.verify(req)) {
        socket.close(4401, 'Unauthorized');
        return;
      }
      this.clients.add(socket);
      socket.on('close', () => this.clients.delete(socket));
      socket.on('error', () => this.clients.delete(socket));
      socket.send(
        JSON.stringify({
          type: 'connected',
          ts: Date.now(),
          service: 'x-monitor',
        })
      );
    });

    this.log.log(
      `X Monitor WebSocket on ${httpServer ? 'HTTP server /ws' : `port ${port}/ws`}`
    );
  }

  broadcast(event: XCustomIngestEvent): void {
    this.sendJson({ type: 'activity', event, ts: Date.now() });
  }

  /** Fired when change-watcher sees follower/like count go up (before full scrape). */
  broadcastWatchSignal(signal: WatchSignal): void {
    this.sendJson({
      type: 'watch_signal',
      signal,
      ts: Date.now(),
    });
  }

  private sendJson(payload: Record<string, unknown>): void {
    if (!this.clients.size) {
      return;
    }
    const text = JSON.stringify(payload);
    for (const socket of this.clients) {
      if (socket.readyState === 1) {
        try {
          socket.send(text);
        } catch {
          this.clients.delete(socket);
        }
      }
    }
  }

  stop(): void {
    for (const socket of this.clients) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }

  private verify(req: IncomingMessage): boolean {
    const token = getXMonitorWsToken();
    if (!token) {
      return true;
    }
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const q = url.searchParams.get('token')?.trim();
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    return q === token || auth === token;
  }
}
