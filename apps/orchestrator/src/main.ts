import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
initializeSentry('orchestrator', true);
import 'source-map-support/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import { NestFactory } from '@nestjs/core';
import { AppModule } from '@gitroom/orchestrator/app.module';
import { Connection } from '@temporalio/client';
import {
  initActivityHeartbeat,
  getMillisSinceActivity,
} from '@gitroom/orchestrator/activities/activity.heartbeat';
import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  initActivityHeartbeat();
  const startedAt = Date.now();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT || 3002;
  await app.listen(port);
  console.log(`Orchestrator health check listening on port ${port}`);

  // Periodic self-restart fallback for Temporal worker silently
  // dropping its task-queue connection after long idle periods.
  // After ORCHESTRATOR_RESTART_HOURS (default 4h), the process exits
  // cleanly. pm2 detects the exit and restarts the orchestrator with
  // a fresh Temporal client connection. This is a safety net only —
  // the health-check loop below should catch most stuck states first.
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
      process.exit(0);
    }, restartMs);
    console.log(
      `Orchestrator scheduled self-restart in ${restartHours}h ` +
      `(set ORCHESTRATOR_RESTART_HOURS to override; 0 disables).`
    );
  }

  // Active Temporal connection health check.
  //
  // Independent of the worker setup in TemporalModule, we poll the Temporal
  // server every ORCHESTRATOR_HEALTH_INTERVAL_SECONDS (default 60s) using a
  // fresh standalone Connection. Each ping calls getSystemInfo() — a cheap
  // round-trip that confirms gRPC reachability and authentication.
  //
  // After ORCHESTRATOR_HEALTH_FAILURES_BEFORE_EXIT (default 3) consecutive
  // ping failures, exit the process. pm2 then restarts the orchestrator
  // with a fresh worker connection — recovering from the "alive but not
  // pulling tasks" state without waiting for the time-based fallback above.
  //
  // The ping uses its own short-lived Connection, so it does NOT mask
  // actual worker-connection problems by holding open a healthy parallel
  // connection — every ping opens its own gRPC stream.
  //
  // Disable by setting ORCHESTRATOR_HEALTH_INTERVAL_SECONDS=0.
  const healthIntervalSec = Number(
    process.env.ORCHESTRATOR_HEALTH_INTERVAL_SECONDS ?? 60
  );
  const healthMaxFailures = Number(
    process.env.ORCHESTRATOR_HEALTH_FAILURES_BEFORE_EXIT ?? 3
  );
  if (healthIntervalSec > 0) {
    let consecutiveFailures = 0;
    const temporalAddress = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
    const tlsEnabled = process.env.TEMPORAL_TLS === 'true';
    const apiKey = process.env.TEMPORAL_API_KEY;

    const checkHealth = async () => {
      try {
        const conn = await Connection.connect({
          address: temporalAddress,
          ...(tlsEnabled ? { tls: true } : {}),
          ...(apiKey ? { apiKey } : {}),
        });
        // getSystemInfo is a cheap server-side capability check.
        await conn.workflowService.getSystemInfo({});
        await conn.close();
        if (consecutiveFailures > 0) {
          console.log(
            `Temporal health: recovered after ${consecutiveFailures} failure(s).`
          );
        }
        consecutiveFailures = 0;
      } catch (err: any) {
        consecutiveFailures++;
        console.warn(
          `Temporal health: ping failed (${consecutiveFailures}/${healthMaxFailures}). ` +
          `Reason: ${err?.message || err}`
        );
        if (consecutiveFailures >= healthMaxFailures) {
          console.error(
            `Temporal health: ${consecutiveFailures} consecutive failures. ` +
            `Exiting so pm2 can restart with a fresh connection.`
          );
          process.exit(0); // exit 0 so pm2 restarts; non-zero would burn Railway retry budget
        }
      }
    };

    setInterval(checkHealth, healthIntervalSec * 1000);
    console.log(
      `Temporal health check enabled (every ${healthIntervalSec}s, ` +
      `${healthMaxFailures} consecutive failures triggers restart). ` +
      `Set ORCHESTRATOR_HEALTH_INTERVAL_SECONDS=0 to disable.`
    );
  }

  // Activity-execution heartbeat watchdog.
  //
  // The Temporal connection ping above can succeed while the worker is
  // silently failing to pull tasks from its task queue. To detect that
  // specific failure mode, every Temporal activity calls markActivity()
  // (via the @TrackActivities() class decorator). Here we periodically
  // check how long it has been since ANY activity ran. If silence exceeds
  // ORCHESTRATOR_ACTIVITY_STUCK_MINUTES (default 10) AND uptime is past
  // ORCHESTRATOR_ACTIVITY_GRACE_MINUTES (default 5, to avoid restarting
  // before the orchestrator is even fully started), exit so pm2 restarts
  // the worker with a fresh task-queue connection.
  //
  // The grace period also prevents tight restart loops on truly idle
  // periods — if the orchestrator has been silently idle for 10 minutes
  // because no posts are scheduled, restarting doesn't hurt (the new
  // process picks up where the old one left off).
  //
  // Disable by setting ORCHESTRATOR_ACTIVITY_STUCK_MINUTES=0.
  const stuckMinutes = Number(
    process.env.ORCHESTRATOR_ACTIVITY_STUCK_MINUTES ?? 10
  );
  const graceMinutes = Number(
    process.env.ORCHESTRATOR_ACTIVITY_GRACE_MINUTES ?? 5
  );
  if (stuckMinutes > 0) {
    const stuckMs = stuckMinutes * 60 * 1000;
    const graceMs = graceMinutes * 60 * 1000;
    setInterval(() => {
      const uptime = Date.now() - startedAt;
      if (uptime < graceMs) return;
      const silence = getMillisSinceActivity();
      if (silence >= stuckMs) {
        console.warn(
          `Activity heartbeat: no activity for ${(silence / 60000).toFixed(1)}m ` +
          `(threshold ${stuckMinutes}m). Worker likely stuck — exiting so pm2 ` +
          `can restart with a fresh task-queue connection.`
        );
        process.exit(0);
      }
    }, 60 * 1000); // check once a minute
    console.log(
      `Activity heartbeat watchdog enabled (restart if no activity for ` +
      `${stuckMinutes}m after ${graceMinutes}m grace period). ` +
      `Set ORCHESTRATOR_ACTIVITY_STUCK_MINUTES=0 to disable.`
    );
  }
}


bootstrap();
