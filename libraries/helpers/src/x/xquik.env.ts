export function isXquikEnabled(): boolean {
  const v = process.env.XQUIK_ENABLED?.trim();
  return v === 'true' || v === '1';
}

export function getXquikApiBase(): string {
  return (process.env.XQUIK_API_BASE?.trim() || 'https://xquik.com/api/v1').replace(
    /\/+$/,
    ''
  );
}

export function getXquikApiKey(): string | undefined {
  const key = process.env.XQUIK_API_KEY?.trim();
  return key || undefined;
}

export function getXquikWebhookSecret(): string | undefined {
  const secret = process.env.XQUIK_WEBHOOK_SECRET?.trim();
  return secret || undefined;
}

/** Public HTTPS URL Xquik should POST to (include /api/x/xquik/webhook). */
export function getXquikWebhookUrl(): string | undefined {
  const explicit = process.env.XQUIK_WEBHOOK_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (backend?.startsWith('https://')) {
    return `${backend.replace(/\/+$/, '')}/x/xquik/webhook`;
  }
  return undefined;
}

export function isXquikWebhookAutoRegisterEnabled(): boolean {
  if (!isXquikEnabled() || !getXquikApiKey()) {
    return false;
  }
  const v = process.env.XQUIK_WEBHOOK_AUTO_REGISTER?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return !!getXquikWebhookUrl();
}

export function getXquikWebhookEventTypes(): string[] {
  const raw = process.env.XQUIK_WEBHOOK_EVENT_TYPES?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [
    'tweet.new',
    'tweet.reply',
    'tweet.retweet',
    'tweet.quote',
    'tweet.mention',
    'tweet.like',
    'tweet.favorite',
  ];
}

export function getXquikLikesPollIntervalMs(): number {
  const n = Number(process.env.XQUIK_LIKES_POLL_INTERVAL_MS);
  if (!Number.isFinite(n) || n < 10_000) {
    return 20_000;
  }
  return Math.min(Math.floor(n), 300_000);
}

export function getXquikFollowersPollIntervalMs(): number {
  const n = Number(process.env.XQUIK_FOLLOWERS_POLL_INTERVAL_MS);
  if (!Number.isFinite(n) || n < 10_000) {
    return 20_000;
  }
  return Math.min(Math.floor(n), 300_000);
}

/** Default 20s — polls recent posts for likers/repliers/retweeters via Xquik API. */
export function getXquikEngagementPollIntervalMs(): number {
  const n = Number(process.env.XQUIK_ENGAGEMENT_POLL_INTERVAL_MS);
  if (!Number.isFinite(n) || n < 10_000) {
    return 20_000;
  }
  return Math.min(Math.floor(n), 300_000);
}

/**
 * When true, backend runs Xquik engagement poll loop (even if X_DISABLE_ENGAGEMENT_POLLING).
 */
export function isXquikEngagementPollerEnabled(): boolean {
  if (!isXquikEnabled() || !getXquikApiKey()) {
    return false;
  }
  const v = process.env.XQUIK_ENGAGEMENT_POLLING?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return true;
}

/** Prefer Xquik over TweetStream WebSocket when both could be enabled. */
export function shouldDisableTweetStreamForXquik(): boolean {
  if (!isXquikEnabled()) {
    return false;
  }
  const v = process.env.XQUIK_DISABLE_TWEETSTREAM?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return true;
}

/** Posts scanned per Xquik engagement tick (prioritize posts with replies). */
export function getXquikEngagementMaxPostsPerTick(): number {
  const n = Number(process.env.XQUIK_ENGAGEMENT_MAX_POSTS_PER_TICK);
  if (Number.isFinite(n) && n > 0) {
    return Math.min(Math.floor(n), 20);
  }
  return 8;
}

/** DM attempts per poller tick when Xquik mode is on (avoid backlog starving new posts). */
export function getXquikDmBatchMaxPerTick(): number {
  const n = Number(process.env.XQUIK_PLUG_DM_BATCH_MAX_PER_TICK);
  if (Number.isFinite(n) && n > 0) {
    return Math.min(Math.floor(n), 15);
  }
  return 5;
}
