import { proxyActivities, sleep } from '@temporalio/workflow';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import { staggerMsFromIntegrationId } from '@gitroom/nestjs-libraries/temporal/x.poller.workflow.helpers';

const { runXEngagementPollerTick, hasActiveXEngagementPlugs } =
  proxyActivities<PostActivity>({
    startToCloseTimeout: '20 minute',
    taskQueue: 'x',
    retry: {
      maximumAttempts: 2,
      backoffCoefficient: 1,
      initialInterval: '30 seconds',
    },
  });

/**
 * Forever poller for post engagement plugs (auto DM engagers, auto reply, etc.).
 * Default tick: 30s when TweetStream is enabled (likes), else 5m with AAA / 1m without.
 * Override with X_ENGAGEMENT_POLL_INTERVAL_MS (minimum 30s).
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

  // After orchestrator/backend restart, avoid an immediate API burst for every channel.
  await sleep(staggerMsFromIntegrationId(integrationId, tickMs));

  while (true) {
    const active = await hasActiveXEngagementPlugs(integrationId);
    if (!active) {
      return;
    }

    await runXEngagementPollerTick(organizationId, integrationId);
    await sleep(tickMs);
  }
}
