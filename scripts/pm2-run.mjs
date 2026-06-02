/**
 * Production PM2 bootstrap. Does NOT run `prisma db push` unless explicitly requested.
 *
 * Running db push on every restart drops Mastra-managed columns; Mastra re-adds them
 * on init, leaving "ghost" dropped columns until mastra_ai_spans hits Postgres's
 * 1600-column limit. See: https://github.com/gitroomhq/postiz-app/issues/1473
 */
import { execSync } from 'node:child_process';

const shell = true;

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', shell });
}

try {
  run('pm2 delete all || true');

  if (process.env.RUN_PRISMA_DB_PUSH_ON_START === 'true') {
    console.log(
      '[pm2-run] RUN_PRISMA_DB_PUSH_ON_START=true — applying Prisma schema (db push)...'
    );
    run('pnpm run prisma-db-push');
  } else {
    console.log(
      '[pm2-run] Skipping prisma db push. Set RUN_PRISMA_DB_PUSH_ON_START=true only when you changed schema.prisma.'
    );
  }

  const xMonitorOn =
    process.env.X_MONITOR_ENABLED?.trim() === 'true' ||
    process.env.X_MONITOR_ENABLED?.trim() === '1';
  const pm2Cmd = xMonitorOn
    ? 'pnpm run --parallel --filter ./apps/backend --filter ./apps/frontend --filter ./apps/orchestrator --filter ./apps/x-monitor pm2'
    : 'pnpm run --parallel --filter ./apps/backend --filter ./apps/frontend --filter ./apps/orchestrator pm2';
  if (xMonitorOn) {
    console.log('[pm2-run] Starting x-monitor (X_MONITOR_ENABLED=true)');
  }
  run(pm2Cmd);
  run('pm2 logs');
} catch (err) {
  process.exit(err.status ?? 1);
}
