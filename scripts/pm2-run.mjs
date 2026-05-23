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

  run('pnpm run --parallel pm2');
  run('pm2 logs');
} catch (err) {
  process.exit(err.status ?? 1);
}
