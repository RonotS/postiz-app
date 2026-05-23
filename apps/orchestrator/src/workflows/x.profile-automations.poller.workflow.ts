import { proxyActivities, sleep } from '@temporalio/workflow';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import { X_PROFILE_AUTOMATIONS_POLL_RELEASE_ID } from '@gitroom/nestjs-libraries/temporal/x.follower.dm.constants';

const { processPlug, listActiveProfileAutomationPlugIds } =
  proxyActivities<PostActivity>({
    startToCloseTimeout: '15 minute',
    taskQueue: 'x',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '2 minutes',
    },
  });

/**
 * Polls integration-wide profile automations (auto-delete, repost delete, pinned DM).
 */
export async function xProfileAutomationsPollerWorkflow({
  organizationId: _organizationId,
  integrationId,
  pollIntervalMs = 300_000,
}: {
  organizationId: string;
  integrationId: string;
  pollIntervalMs?: number;
}): Promise<void> {
  void _organizationId;

  const tickMs = Math.max(30_000, Math.min(3_600_000, pollIntervalMs));

  while (true) {
    const plugIds = await listActiveProfileAutomationPlugIds(integrationId);
    if (!plugIds.length) {
      return;
    }

    for (const plugId of plugIds) {
      await processPlug({
        plugId,
        postId: X_PROFILE_AUTOMATIONS_POLL_RELEASE_ID,
        delay: 0,
        totalRuns: 1,
        currentRun: 1,
      });
    }

    await sleep(tickMs);
  }
}
