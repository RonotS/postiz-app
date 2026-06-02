export type XActivityStreamKind =
  | 'like'
  | 'retweet'
  | 'reply'
  | 'follow'
  | 'unfollow'
  | 'dm_sent'
  | 'mention'
  | 'quote'
  | 'tweet'
  | 'raw';

export type XActivityStreamSource =
  | 'account_activity'
  | 'tweetstream'
  | 'xquik'
  | 'custom'
  | 'poller';

export type XActivityStreamEvent = {
  id: string;
  ts: number;
  source: XActivityStreamSource;
  kind: XActivityStreamKind;
  monitoredHandle?: string;
  integrationId?: string;
  organizationId?: string;
  tweetId?: string;
  userId?: string;
  username?: string;
  /** True when auto-DM (or welcome DM) was sent for this engagement. */
  dmSent?: boolean;
  note?: string;
};

export type XActivityWsClientFilter = {
  handle?: string;
  integrationId?: string;
  organizationId?: string;
};
