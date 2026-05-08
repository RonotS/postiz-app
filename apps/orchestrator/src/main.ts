import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
initializeSentry('orchestrator', true);
import 'source-map-support/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import { NestFactory } from '@nestjs/core';
import { AppModule } from '@gitroom/orchestrator/app.module';
import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT || 3002;
  await app.listen(port);
  console.log(`Orchestrator health check listening on port ${port}`);

  // Periodic self-restart workaround for Temporal worker silently
  // dropping its task-queue connection after long idle periods.
  // After ORCHESTRATOR_RESTART_HOURS (default 4h), the process exits
  // cleanly. pm2 (which manages this process inside the Railway
  // container) detects the exit and restarts the orchestrator with
  // a fresh Temporal client connection. This causes a brief
  // (~5 second) gap where new workflow signals queue at Temporal
  // before the worker reconnects and drains them — acceptable for
  // social-post throughput; far better than the current state where
  // the worker stays alive but stops processing tasks indefinitely.
  //
  // Disable by setting ORCHESTRATOR_RESTART_HOURS=0 in env.
  const restartHours = Number(process.env.ORCHESTRATOR_RESTART_HOURS ?? 4);
  if (restartHours > 0) {
    const restartMs = restartHours * 60 * 60 * 1000;
    setTimeout(() => {
      console.log(
        `Orchestrator scheduled self-restart after ${restartHours}h uptime. ` +
        `Exiting cleanly so pm2 can restart with a fresh Temporal connection.`
      );
      // Exit code 0 so pm2 sees a clean exit and auto-restarts. Do not
      // use a non-zero code: that would also burn through Railway's
      // ON_FAILURE retry budget (10 attempts) every 4 hours.
      process.exit(0);
    }, restartMs);
    console.log(
      `Orchestrator scheduled self-restart in ${restartHours}h ` +
      `(set ORCHESTRATOR_RESTART_HOURS to override; 0 disables).`
    );
  }
}


bootstrap();
