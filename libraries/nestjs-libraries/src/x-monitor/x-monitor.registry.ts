import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  getXMonitorHandlesFromEnv,
  getXMonitorMaxChannels,
  isXMonitorSyncFromDb,
} from '@gitroom/helpers/x/x.monitor.env';
import { normalizeXHandle } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.normalize';

export type MonitoredChannel = {
  integrationId: string;
  handle: string;
  internalId: string;
  token: string;
};

export type MonitoredHandle = {
  handle: string;
  integrationIds: string[];
};

@Injectable()
export class XMonitorRegistry {
  private readonly log = new Logger(XMonitorRegistry.name);
  private channels: MonitoredChannel[] = [];
  private handles: MonitoredHandle[] = [];
  private handleSet = new Set<string>();
  private tagToHandles = new Map<string, string[]>();

  constructor(private readonly prisma: PrismaService) {}

  getChannels(): MonitoredChannel[] {
    return this.channels;
  }

  getHandles(): MonitoredHandle[] {
    return this.handles;
  }

  hasHandle(handle: string): boolean {
    return this.handleSet.has(normalizeXHandle(handle));
  }

  resolveHandle(candidates: string[]): string | undefined {
    for (const c of candidates) {
      const h = normalizeXHandle(c);
      if (h && this.handleSet.has(h)) {
        return h;
      }
    }
    return undefined;
  }

  setRuleTagHandles(rules: { tag: string; handles: string[] }[]): void {
    this.tagToHandles.clear();
    for (const r of rules) {
      this.tagToHandles.set(r.tag, r.handles);
    }
  }

  resolveHandleFromTag(tag?: string): string | undefined {
    if (!tag) {
      return undefined;
    }
    const batch = this.tagToHandles.get(tag);
    return batch?.[0];
  }

  async refresh(): Promise<string[]> {
    const limit = getXMonitorMaxChannels();
    const rows = isXMonitorSyncFromDb()
      ? await this.prisma.integration.findMany({
          where: {
            providerIdentifier: 'x',
            deletedAt: null,
            disabled: false,
            profile: { not: null },
          },
          select: {
            id: true,
            profile: true,
            internalId: true,
            token: true,
          },
          take: limit,
          orderBy: { createdAt: 'asc' },
        })
      : getXMonitorHandlesFromEnv().map((profile) => ({
          id: profile,
          profile,
          internalId: '',
          token: '',
        }));

    const byHandle = new Map<string, MonitoredChannel>();
    for (const row of rows) {
      const h = normalizeXHandle(row.profile ?? '');
      if (!h) continue;
      const existing = byHandle.get(h);
      if (!existing) {
        byHandle.set(h, {
          integrationId: String(row.id),
          handle: h,
          internalId: String(row.internalId ?? ''),
          token: String(row.token ?? ''),
        });
      }
    }

    this.channels = [...byHandle.values()];
    this.handles = this.channels.map((c) => ({
      handle: c.handle,
      integrationIds: [c.integrationId],
    }));
    this.handleSet = new Set(this.channels.map((c) => c.handle));

    this.log.log(
      `Monitor registry: ${this.channels.length} channel(s) — ${this.channels
        .map((c) => `@${c.handle}`)
        .join(', ')
        .slice(0, 200)}${this.channels.length > 8 ? '…' : ''}`
    );

    return this.channels.map((c) => c.handle);
  }
}
