import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import {
  getXActivityStreamRecentMax,
  getXActivityStreamSecret,
  isXActivityStreamEnabled,
} from '@gitroom/helpers/x/x.activity-stream.env';
import {
  XActivityStreamEvent,
  XActivityWsClientFilter,
} from '@gitroom/nestjs-libraries/integrations/social/x-activity-stream.types';
import { normalizeTweetStreamHandle } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.normalize';

@Injectable()
export class XActivityStreamService {
  private readonly log = new Logger(XActivityStreamService.name);
  private readonly emitter = new EventEmitter();
  private readonly recent: XActivityStreamEvent[] = [];
  private readonly clients = new Map<WebSocket, XActivityWsClientFilter>();

  isEnabled(): boolean {
    return isXActivityStreamEnabled();
  }

  isWsEnabled(): boolean {
    return this.isEnabled();
  }

  verifyClientToken(token: string | null | undefined): boolean {
    const secret = getXActivityStreamSecret();
    if (!secret) {
      return this.isEnabled();
    }
    return !!token?.trim() && token.trim() === secret;
  }

  registerClient(ws: WebSocket, filter: XActivityWsClientFilter): void {
    this.clients.set(ws, filter);
    ws.on('close', () => this.clients.delete(ws));
    ws.on('error', () => this.clients.delete(ws));
  }

  publish(partial: Omit<XActivityStreamEvent, 'id' | 'ts'>): void {
    if (!this.isEnabled()) {
      return;
    }

    const event: XActivityStreamEvent = {
      id: randomUUID(),
      ts: Date.now(),
      ...partial,
      monitoredHandle: partial.monitoredHandle
        ? normalizeTweetStreamHandle(partial.monitoredHandle) ||
          partial.monitoredHandle
        : undefined,
    };

    const max = getXActivityStreamRecentMax();
    this.recent.unshift(event);
    if (this.recent.length > max) {
      this.recent.length = max;
    }

    this.emitter.emit('activity', event);
    this.broadcastToClients(event);
  }

  listRecent(limit = 50, filter?: XActivityWsClientFilter): XActivityStreamEvent[] {
    const n = Math.min(Math.max(limit, 1), getXActivityStreamRecentMax());
    return this.recent
      .filter((e) => this.matchesFilter(filter, e))
      .slice(0, n);
  }

  getConnectionInfo(): {
    enabled: boolean;
    wsPath: string;
    wsUrlExample?: string;
    eventsUrlExample?: string;
    authRequired: boolean;
    recentMax: number;
  } {
    const base =
      process.env.MAIN_URL?.trim() ||
      process.env.BACKEND_URL?.trim() ||
      process.env.FRONTEND_URL?.trim();
    const wsPath = '/api/x/activity-stream';
    const normalizedBase = base?.replace(/\/+$/, '');
    const wsBase = normalizedBase
      ? normalizedBase.replace(/^http/i, 'ws')
      : undefined;

    return {
      enabled: this.isEnabled(),
      wsPath,
      wsUrlExample: wsBase
        ? `${wsBase}${wsPath}?token=YOUR_SECRET&handle=monitored_handle`
        : undefined,
      eventsUrlExample: normalizedBase
        ? `${normalizedBase}${wsPath}/events?token=YOUR_SECRET&limit=50`
        : undefined,
      authRequired: !!getXActivityStreamSecret(),
      recentMax: getXActivityStreamRecentMax(),
    };
  }

  private broadcastToClients(event: XActivityStreamEvent): void {
    const payload = JSON.stringify({ type: 'activity', event });
    for (const [ws, filter] of this.clients) {
      if (ws.readyState !== 1) {
        this.clients.delete(ws);
        continue;
      }
      if (!this.matchesFilter(filter, event)) {
        continue;
      }
      try {
        ws.send(payload);
      } catch (err) {
        this.log.warn('WebSocket send failed:', err);
        this.clients.delete(ws);
      }
    }
  }

  private matchesFilter(
    filter: XActivityWsClientFilter | undefined,
    event: XActivityStreamEvent
  ): boolean {
    if (!filter) {
      return true;
    }
    if (
      filter.integrationId &&
      event.integrationId &&
      filter.integrationId !== event.integrationId
    ) {
      return false;
    }
    if (
      filter.organizationId &&
      event.organizationId &&
      filter.organizationId !== event.organizationId
    ) {
      return false;
    }
    if (filter.handle) {
      const h = normalizeTweetStreamHandle(filter.handle);
      const monitored = event.monitoredHandle
        ? normalizeTweetStreamHandle(event.monitoredHandle)
        : '';
      if (h && monitored && h !== monitored) {
        return false;
      }
    }
    return true;
  }
}
