import { proxyActivities, sleep } from '@temporalio/workflow';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';

const { runXEngagementPollerTick, hasActiveXEngagementPlugs } =
  proxyActivities<PostActivity>({
    startToCloseTimeout: '20 minute',
    taskQueue: 'x',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '2 minutes',
    },
  });

/**
 * Forever poller for post engagement plugs (auto DM engagers, auto reply, etc.).
 * Default tick interval is 5 minutes (override with X_ENGAGEMENT_POLL_INTERVAL_MS).
 */
export async function xEngagementPollerWorkflow({
  organizationId,
  integrationId,
  pollIntervalMs = 300_000,
}: {
  organizationId: string;
  integrationId: string;
  pollIntervalMs?: number;
}): Promise<void> {
  const tickMs = Math.max(30_000, Math.min(3_600_000, pollIntervalMs));

  while (true) {
    const active = await hasActiveXEngagementPlugs(integrationId);
    if (!active) {
      return;
    }

    await runXEngagementPollerTick(organizationId, integrationId);
    await sleep(tickMs);
  }
}
