import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  getXMonitorSyncHandlesMs,
  isXMonitorEnabled,
  isXMonitorWsEnabled,
} from '@gitroom/helpers/x/x.monitor.env';
import { XMonitorRegistry } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.registry';
import { XMonitorStreamService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.stream';
import { XMonitorWebSocketHub } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.ws';
import { XMonitorFollowersService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.followers';

@Injectable()
export class XMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(XMonitorService.name);
  private syncTimer: ReturnType<typeof setInterval> | undefined;
  private streamStarted = false;

  constructor(
    private readonly registry: XMonitorRegistry,
    private readonly stream: XMonitorStreamService,
    private readonly ws: XMonitorWebSocketHub,
    private readonly followers: XMonitorFollowersService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isXMonitorEnabled()) {
      return;
    }

    if (isXMonitorWsEnabled()) {
      this.ws.start();
    }

    await this.refreshAndStart();

    const ms = getXMonitorSyncHandlesMs();
    this.syncTimer = setInterval(() => {
      void this.refreshAndStart().catch((err) =>
        this.log.error('Handle sync failed:', err)
      );
    }, ms);
  }

  onModuleDestroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    this.stream.stop();
    this.ws.stop();
  }

  private async refreshAndStart(): Promise<void> {
    const handles = await this.registry.refresh();
    this.followers.reconcileChannelTimers();
    await this.stream.syncRules(handles);
    if (!this.streamStarted) {
      this.streamStarted = true;
      this.stream.startStreamLoop();
    }
  }
}
