import { proxyActivities, sleep } from '@temporalio/workflow';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import { X_FOLLOWER_DM_POLL_RELEASE_ID } from '@gitroom/nestjs-libraries/temporal/x.follower.dm.constants';

const { processPlug, isFollowerDmPlugActive } = proxyActivities<PostActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'x',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

/**
 * Long-running poller for the `autoDmFollowers` plug. Independent of posting:
 * wakes on an interval, checks the plug is still active, then runs `processPlug`.
 */
export async function xFollowerDmPollerWorkflow({
  organizationId: _organizationId,
  integrationId: _integrationId,
  plugId,
  pollIntervalMs = 300_000,
}: {
  organizationId: string;
  integrationId: string;
  plugId: string;
  /** Passed at workflow start (from backend); optional for older workflow histories. */
  pollIntervalMs?: number;
}): Promise<void> {
  void _organizationId;
  void _integrationId;

  const tickMs = Math.max(30_000, Math.min(3_600_000, pollIntervalMs));

  while (true) {
    const active = await isFollowerDmPlugActive(plugId);
    if (!active) {
      return;
    }
    await processPlug({
      plugId,
      postId: X_FOLLOWER_DM_POLL_RELEASE_ID,
      delay: 0,
      totalRuns: 1,
      currentRun: 1,
    });
    await sleep(tickMs);
  }
}
