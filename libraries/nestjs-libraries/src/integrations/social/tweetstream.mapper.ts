import {
  TweetStreamEnvelope,
  TweetStreamFollowEvent,
  TweetStreamMappedRealtime,
  TweetStreamTweetContent,
} from '@gitroom/nestjs-libraries/integrations/social/tweetstream.types';
import {
  authorToAaUser,
  normalizeTweetStreamHandle,
} from '@gitroom/nestjs-libraries/integrations/social/tweetstream.normalize';

/**
 * Map TweetStream envelopes into X Account Activity–shaped payloads for the shared handler.
 */
export function mapTweetStreamEnvelope(
  envelope: TweetStreamEnvelope
): TweetStreamMappedRealtime | null {
  if (envelope.t === 'account' && envelope.op === 'follow') {
    return mapFollowEvent(envelope.d as TweetStreamFollowEvent);
  }

  if (envelope.t === 'tweet' && envelope.op === 'content') {
    return mapTweetContent(envelope.d as TweetStreamTweetContent);
  }

  return null;
}

function mapFollowEvent(data: TweetStreamFollowEvent): TweetStreamMappedRealtime | null {
  const followerId = data.actor?.id;
  const targetHandle = normalizeTweetStreamHandle(data.target?.handle);
  if (!followerId || !targetHandle) {
    return null;
  }

  return {
    monitoredHandle: targetHandle,
    payload: {
      follow_events: [
        {
          source: authorToAaUser(data.actor),
          target: authorToAaUser(data.target),
        },
      ],
    },
    eventSummary: {
      kind: 'follow',
      engagerUserId: String(followerId),
      engagerHandle: normalizeTweetStreamHandle(data.actor?.handle),
    },
  };
}

function mapTweetContent(
  tweet: TweetStreamTweetContent
): TweetStreamMappedRealtime | null {
  const ref = tweet.ref;
  if (!ref?.type || !ref.tweetId) {
    return null;
  }

  const engagerId = tweet.author?.id;
  if (!engagerId) {
    return null;
  }

  const originalId = String(ref.tweetId).trim();
  const engagerUser = authorToAaUser(tweet.author);

  if (ref.type === 'retweet') {
    const monitoredHandle =
      normalizeTweetStreamHandle(ref.author?.handle) ||
      normalizeTweetStreamHandle(tweet.author?.handle);
    if (!monitoredHandle) {
      return null;
    }

    return {
      monitoredHandle,
      payload: {
        tweet_create_events: [
          {
            user: engagerUser,
            retweeted_status: { id_str: originalId, id: originalId },
          },
        ],
      },
      eventSummary: {
        kind: 'retweet',
        tweetId: originalId,
        engagerUserId: String(engagerId),
        engagerHandle: normalizeTweetStreamHandle(tweet.author?.handle),
      },
    };
  }

  if (ref.type === 'reply') {
    const monitoredHandle = normalizeTweetStreamHandle(ref.author?.handle);
    if (!monitoredHandle) {
      return null;
    }
    return buildReplyMapping(
      tweet,
      monitoredHandle,
      originalId,
      engagerUser,
      engagerId
    );
  }

  return null;
}

/** When TweetStream omits ref.author, resolve monitoredHandle via Postiz post releaseId. */
export function buildMappedFromTweetContent(
  tweet: TweetStreamTweetContent,
  monitoredHandle: string
): TweetStreamMappedRealtime | null {
  const ref = tweet.ref;
  const engagerId = tweet.author?.id;
  if (!ref?.type || !ref.tweetId || !engagerId) {
    return null;
  }
  const handle = normalizeTweetStreamHandle(monitoredHandle);
  if (!handle) {
    return null;
  }
  const originalId = String(ref.tweetId).trim();
  const engagerUser = authorToAaUser(tweet.author);

  if (ref.type === 'retweet') {
    return {
      monitoredHandle: handle,
      payload: {
        tweet_create_events: [
          {
            user: engagerUser,
            retweeted_status: { id_str: originalId, id: originalId },
          },
        ],
      },
      eventSummary: {
        kind: 'retweet',
        tweetId: originalId,
        engagerUserId: String(engagerId),
        engagerHandle: normalizeTweetStreamHandle(tweet.author?.handle),
      },
    };
  }
  if (ref.type === 'reply') {
    return buildReplyMapping(
      tweet,
      handle,
      originalId,
      engagerUser,
      engagerId
    );
  }
  return null;
}

function buildReplyMapping(
  tweet: TweetStreamTweetContent,
  monitoredHandle: string,
  originalId: string,
  engagerUser: ReturnType<typeof authorToAaUser>,
  engagerId: string
): TweetStreamMappedRealtime {
  return {
    monitoredHandle,
    payload: {
      tweet_create_events: [
        {
          user: engagerUser,
          in_reply_to_status_id_str: originalId,
          in_reply_to_status_id: originalId,
        },
      ],
    },
    eventSummary: {
      kind: 'reply',
      tweetId: originalId,
      engagerUserId: String(engagerId),
      engagerHandle: normalizeTweetStreamHandle(tweet.author?.handle),
    },
  };
}
