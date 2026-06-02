import type { XCustomIngestEvent } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.types';
import { userToAaShape } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.normalize';

/** Account Activity–shaped follow event (same contract as webhook / custom ingest). */
export function mapNewFollowerToIngestEvent(
  monitored: { handle: string; internalId: string },
  follower: { id: string; username?: string }
): XCustomIngestEvent {
  const source = userToAaShape({
    id: follower.id,
    username: follower.username,
  });
  const target = userToAaShape({ id: monitored.internalId });

  return {
    handle: monitored.handle,
    kind: 'follow',
    userId: follower.id,
    username: follower.username,
    payload: {
      follow_events: [{ source, target }],
    },
  };
}
