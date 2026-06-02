import type { XActivityStreamKind } from '@gitroom/nestjs-libraries/integrations/social/x-activity-stream.types';

export type XCustomIngestKind = Extract<
  XActivityStreamKind,
  'like' | 'reply' | 'retweet' | 'follow'
>;

/** One engagement on a monitored @handle (connected X channel in Postiz). */
export type XCustomIngestEvent = {
  /** Monitored account handle (matches integration.profile, without @). */
  handle: string;
  kind: XCustomIngestKind;
  /** Engager X user id (required unless `payload` is set). */
  userId?: string;
  username?: string;
  /** Liked/replied-to/retweeted post id (required for like/reply/retweet). */
  tweetId?: string;
  /**
   * Full X Account Activity–shaped payload for this handle.
   * When set, `kind` / `userId` / `tweetId` are optional.
   */
  payload?: Record<string, unknown>;
};

export type XCustomIngestBody = {
  events?: XCustomIngestEvent[];
} & Partial<XCustomIngestEvent>;
