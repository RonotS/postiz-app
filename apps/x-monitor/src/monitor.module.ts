import { Module } from '@nestjs/common';
import { XMonitorModule } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.module';

@Module({
  imports: [XMonitorModule],
})
export class MonitorAppModule {}
