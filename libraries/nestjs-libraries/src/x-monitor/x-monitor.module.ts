import { Module } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { XMonitorService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.service';
import { XMonitorSupplementService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.supplement';
import { XMonitorFollowersService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.followers';
import { XMonitorReactiveScrapeService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.reactive-scrape';
import { XMonitorChangeWatcherService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.change-watcher';
import { XMonitorRegistry } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.registry';
import { XMonitorStreamService } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.stream';
import { XMonitorIngestClient } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.ingest.client';
import { XMonitorWebSocketHub } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.ws';

@Module({
  providers: [
    PrismaService,
    XMonitorRegistry,
    XMonitorIngestClient,
    XMonitorWebSocketHub,
    XMonitorStreamService,
    XMonitorService,
    XMonitorSupplementService,
    XMonitorFollowersService,
    XMonitorReactiveScrapeService,
    XMonitorChangeWatcherService,
  ],
})
export class XMonitorModule { }
