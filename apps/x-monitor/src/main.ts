import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MonitorAppModule } from './monitor.module';
import {
  isXMonitorActivityOnlyMode,
  isXMonitorEnabled,
} from '@gitroom/helpers/x/x.monitor.env';

async function bootstrap() {
  if (!isXMonitorEnabled()) {
    console.error(
      'X_MONITOR_ENABLED is not true. Set it in .env and restart.'
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(MonitorAppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const log = new Logger('XMonitorBootstrap');
  const mode = isXMonitorActivityOnlyMode()
    ? 'filtered stream + activity watch → scrape on signal'
    : 'filtered stream + interval poll';
  log.log(`Tweetmax X monitor running (${mode} + WebSocket → Postiz ingest)`);

  process.on('SIGINT', () => {
    void app.close().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void app.close().then(() => process.exit(0));
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
