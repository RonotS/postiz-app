import {
  authorToAaUser,
  normalizeTweetStreamHandle,
} from '@gitroom/nestjs-libraries/integrations/social/tweetstream.normalize';
import type {
  XCustomIngestEvent,
  XCustomIngestKind,
} from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.types';

function aaUser(userId: string, username?: string) {
  return {
    id_str: String(userId),
    id: String(userId),
    ...(username?.trim() ? { screen_name: username.trim() } : {}),
  };
}

export function mapCustomIngestEventToPayload(
  event: XCustomIngestEvent
): { handle: string; payload: Record<string, unknown> } | null {
  const handle = normalizeTweetStreamHandle(event.handle);
  if (!handle) {
    return null;
  }

  if (event.payload && typeof event.payload === 'object') {
    return { handle, payload: event.payload };
  }

  const userId = String(event.userId ?? '').trim();
  if (!userId) {
    return null;
  }

  const user = aaUser(userId, event.username);
  const tweetId = String(event.tweetId ?? '').trim();

  switch (event.kind as XCustomIngestKind) {
    case 'follow':
      return {
        handle,
        payload: {
          follow_events: [{ source: user }],
        },
      };
    case 'like':
      if (!tweetId) return null;
      return {
        handle,
        payload: {
          favorite_events: [
            {
              user,
              favorited_status: { id_str: tweetId, id: tweetId },
            },
          ],
        },
      };
    case 'retweet':
      if (!tweetId) return null;
      return {
        handle,
        payload: {
          tweet_create_events: [
            {
              user,
              retweeted_status: { id_str: tweetId, id: tweetId },
            },
          ],
        },
      };
    case 'reply':
      if (!tweetId) return null;
      return {
        handle,
        payload: {
          tweet_create_events: [
            {
              user,
              in_reply_to_status_id_str: tweetId,
              in_reply_to_status_id: tweetId,
            },
          ],
        },
      };
    default:
      return null;
  }
}

/** Normalize request body to a list of events. */
export function normalizeCustomIngestBody(
  body: Record<string, unknown>
): XCustomIngestEvent[] {
  const rows = Array.isArray(body.events) ? body.events : null;
  if (rows?.length) {
    return rows.filter((r) => r && typeof r === 'object') as XCustomIngestEvent[];
  }
  if (body.handle && body.kind) {
    return [body as XCustomIngestEvent];
  }
  return [];
}

export { authorToAaUser };
