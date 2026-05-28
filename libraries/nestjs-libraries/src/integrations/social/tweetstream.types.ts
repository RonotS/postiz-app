export type TweetStreamEnvelope<T extends object = Record<string, unknown>> = {
  v?: number;
  t: 'tweet' | 'account' | 'control';
  op: string;
  id?: string;
  ts?: number;
  d: T;
};

export type TweetStreamAuthor = {
  id?: string;
  handle?: string;
  name?: string;
};

export type TweetStreamTweetRef = {
  type?: 'reply' | 'quote' | 'retweet';
  tweetId?: string;
  text?: string;
  author?: TweetStreamAuthor;
};

export type TweetStreamTweetContent = {
  tweetId: string;
  text?: string;
  createdAt?: number;
  author?: TweetStreamAuthor;
  ref?: TweetStreamTweetRef;
};

/** Follow-up envelope after `content` — often carries reply/quote ref context. */
export type TweetStreamTweetUpdate = {
  tweetId: string;
  text?: string;
  ref?: TweetStreamTweetRef;
};

export type TweetStreamFollowEvent = {
  kind?: string;
  eventId?: string;
  observedAt?: number;
  actor: TweetStreamAuthor;
  target: TweetStreamAuthor;
};

export type TweetStreamMappedRealtime = {
  monitoredHandle: string;
  payload: Record<string, unknown>;
  eventSummary?: {
    kind: 'follow' | 'reply' | 'retweet';
    tweetId?: string;
    engagerUserId?: string;
    engagerHandle?: string;
  };
};
