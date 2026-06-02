import type { TweetV2 } from 'twitter-api-v2';
import type { XCustomIngestEvent } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.types';
import { normalizeXHandle } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.normalize';
import type { XMonitorRegistry } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.registry';

export function mapStreamTweetToIngestEvents(
  tweet: TweetV2,
  registry: XMonitorRegistry,
  ruleTag?: string
): XCustomIngestEvent[] {
  const authorId = String(tweet.author_id ?? '').trim();
  if (!authorId) {
    return [];
  }

  const text = String(tweet.text ?? '');
  const handlesInText = [...text.matchAll(/@([a-zA-Z0-9_]{1,15})/g)].map((m) =>
    normalizeXHandle(m[1])
  );

  let monitoredHandle =
    registry.resolveHandle(handlesInText) ||
    registry.resolveHandleFromTag(ruleTag);

  const refs = tweet.referenced_tweets ?? [];
  const replyRef = refs.find((r) => r.type === 'replied_to');
  const rtRef = refs.find((r) => r.type === 'retweeted');

  if (rtRef?.id && monitoredHandle) {
    return [
      {
        handle: monitoredHandle,
        kind: 'retweet',
        tweetId: String(rtRef.id),
        userId: authorId,
      },
    ];
  }

  if (replyRef?.id) {
    if (!monitoredHandle) {
      monitoredHandle = registry.resolveHandle(handlesInText);
    }
    if (monitoredHandle) {
      return [
        {
          handle: monitoredHandle,
          kind: 'reply',
          tweetId: String(replyRef.id),
          userId: authorId,
        },
      ];
    }
  }

  if (monitoredHandle && handlesInText.includes(monitoredHandle)) {
    return [
      {
        handle: monitoredHandle,
        kind: 'reply',
        tweetId: String(tweet.id ?? ''),
        userId: authorId,
      },
    ];
  }

  return [];
}
