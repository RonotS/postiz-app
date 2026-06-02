/** Tweetmax X stream detector (push stream + WebSocket → Postiz custom ingest). */
export function isXMonitorEnabled(): boolean {
  const v = process.env.X_MONITOR_ENABLED?.trim();
  return v === 'true' || v === '1';
}

export function getXMonitorPostizIngestUrl(): string {
  const u =
    process.env.X_MONITOR_POSTIZ_INGEST_URL?.trim() ||
    process.env.MAIN_URL?.trim() ||
    'http://localhost:3000';
  return u.replace(/\/+$/, '');
}

export function getXMonitorIngestSecret(): string | undefined {
  return (
    process.env.X_MONITOR_INGEST_SECRET?.trim() ||
    process.env.X_CUSTOM_INGEST_SECRET?.trim() ||
    undefined
  );
}

/** Max @handles on the filtered stream (rule length limits apply). */
export function getXMonitorMaxChannels(): number {
  const n = Number(process.env.X_MONITOR_MAX_CHANNELS);
  if (!Number.isFinite(n) || n < 1) {
    return 50;
  }
  return Math.min(Math.floor(n), 200);
}

/** Handles per stream rule (X rule value max ~512 chars). */
export function getXMonitorHandlesPerRule(): number {
  const n = Number(process.env.X_MONITOR_HANDLES_PER_RULE);
  if (!Number.isFinite(n) || n < 1) {
    return 12;
  }
  return Math.min(Math.floor(n), 20);
}

export function getXMonitorRuleTagPrefix(): string {
  return process.env.X_MONITOR_RULE_TAG_PREFIX?.trim() || 'tweetmax';
}

/** Reload handles + rewrite stream rules (ms). Default 10 min. */
export function getXMonitorSyncHandlesMs(): number {
  const n = Number(process.env.X_MONITOR_SYNC_HANDLES_MS);
  if (!Number.isFinite(n) || n < 60_000) {
    return 600_000;
  }
  return Math.min(n, 3_600_000);
}

export function getXMonitorStreamReconnectMs(): number {
  const n = Number(process.env.X_MONITOR_STREAM_RECONNECT_MS);
  if (!Number.isFinite(n) || n < 1000) {
    return 5_000;
  }
  return Math.min(n, 120_000);
}

/** Wait after X TooManyConnections before reconnect (ms). Default 60s. */
export function getXMonitorStreamConnectionLimitWaitMs(): number {
  const n = Number(process.env.X_MONITOR_STREAM_CONNECTION_LIMIT_WAIT_MS);
  if (!Number.isFinite(n) || n < 15_000) {
    return 60_000;
  }
  return Math.min(n, 600_000);
}

/** Load @handles from Postiz DB (integrations). */
export function isXMonitorSyncFromDb(): boolean {
  const v = process.env.X_MONITOR_SYNC_FROM_DB?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return true;
}

/** Comma-separated handles when X_MONITOR_SYNC_FROM_DB=false. */
export function getXMonitorHandlesFromEnv(): string[] {
  const raw = process.env.X_MONITOR_HANDLES?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(/[,\s]+/)
    .map((h) => h.replace(/^@+/, '').toLowerCase())
    .filter(Boolean);
}

/** Fan-out WebSocket (TweetStream-style delivery to your apps). */
export function isXMonitorWsEnabled(): boolean {
  const v = process.env.X_MONITOR_WS_ENABLED?.trim();
  return v === 'true' || v === '1';
}

export function getXMonitorWsPort(): number {
  const n = Number(process.env.X_MONITOR_WS_PORT);
  if (!Number.isFinite(n) || n < 1) {
    return 8089;
  }
  return Math.floor(n);
}

export function getXMonitorWsToken(): string | undefined {
  return process.env.X_MONITOR_WS_TOKEN?.trim() || undefined;
}

/**
 * New followers via GET /2/users/:id/followers (own stack — not TweetStream/Xquik).
 * Default on when X_MONITOR_ENABLED=true; set X_MONITOR_FOLLOWERS_ENABLED=false to disable.
 */
export function isXMonitorFollowersEnabled(): boolean {
  const v = process.env.X_MONITOR_FOLLOWERS_ENABLED?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  if (v === 'true' || v === '1') {
    return true;
  }
  return isXMonitorEnabled();
}

/** Slow like scan on recent Postiz posts (uses tweetLikedBy — not on stream). */
export function isXMonitorLikesEnabled(): boolean {
  const v = process.env.X_MONITOR_LIKES_ENABLED?.trim();
  return v === 'true' || v === '1';
}

/** Min gap between scrape HTTP calls (ms). Default 4s — avoids 429 when many channels start together. */
export function getXMonitorScrapeMinGapMs(): number {
  const n = Number(process.env.X_MONITOR_SCRAPE_MIN_GAP_MS);
  if (!Number.isFinite(n) || n < 1000) {
    return 4_000;
  }
  return Math.min(n, 120_000);
}

/** Delay between each channel's first follower scrape on startup (ms). Default 12s. */
export function getXMonitorScrapeChannelStaggerMs(): number {
  const n = Number(process.env.X_MONITOR_SCRAPE_CHANNEL_STAGGER_MS);
  if (!Number.isFinite(n) || n < 0) {
    return 12_000;
  }
  return Math.min(n, 300_000);
}

/** Wait after HTTP 429 before retry (ms). Default 90s. */
export function getXMonitorScrapeRateLimitWaitMs(): number {
  const n = Number(process.env.X_MONITOR_SCRAPE_RATE_LIMIT_WAIT_MS);
  if (!Number.isFinite(n) || n < 30_000) {
    return 90_000;
  }
  return Math.min(n, 600_000);
}

/** Min gap between lightweight watch count GraphQL calls (ms). Default 1s. */
export function getXMonitorWatchScrapeMinGapMs(): number {
  const n = Number(process.env.X_MONITOR_WATCH_SCRAPE_MIN_GAP_MS);
  if (!Number.isFinite(n) || n < 200) {
    return 1_000;
  }
  return Math.min(n, 30_000);
}

/** Hard cap when env sets a numeric limit (avoids accidental 100k scrape loops). */
export const X_MONITOR_LIKES_POSTS_HARD_CAP = 1000;

/**
 * Published posts to track for likes per channel.
 * - unset / invalid → defaultLimit
 * - `all` or `0` → every PUBLISHED post in Postiz for that channel (no `take`)
 * - 1…1000 → newest N posts
 */
export function parseXMonitorLikesPostsLimit(
  envValue: string | undefined,
  defaultLimit: number
): number | undefined {
  const raw = envValue?.trim().toLowerCase();
  if (raw === 'all' || raw === '0') {
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return defaultLimit;
  }
  return Math.min(Math.floor(n), X_MONITOR_LIKES_POSTS_HARD_CAP);
}

/** Prisma `take` for published-post queries; omit when monitoring all posts. */
export function xMonitorPublishedPostsTake(
  limit: number | undefined
): { take?: number } {
  return limit != null ? { take: limit } : {};
}

/** Recent posts per channel for like-count watcher (cheaper than full liker scrape). Default 2. */
export function getXMonitorWatchLikesMaxPosts(): number | undefined {
  return parseXMonitorLikesPostsLimit(
    process.env.X_MONITOR_WATCH_LIKES_MAX_POSTS,
    2
  );
}

/** Per-channel poll interval (ms). Default 60s; min 15s. Uses X API credits each tick. */
export function getXMonitorFollowersIntervalMs(): number {
  const n = Number(process.env.X_MONITOR_FOLLOWERS_INTERVAL_MS);
  if (!Number.isFinite(n) || n < 15_000) {
    return 60_000;
  }
  return Math.min(n, 3_600_000);
}

/** Min 2 minutes. Default 10 minutes between like scans. */
export function getXMonitorLikesIntervalMs(): number {
  const n = Number(process.env.X_MONITOR_LIKES_INTERVAL_MS);
  if (!Number.isFinite(n) || n < 120_000) {
    return 600_000;
  }
  return Math.min(n, 3_600_000);
}

/** Recent published posts per channel to check for new likers (lower = fewer credits). Default 3. */
export function getXMonitorLikesMaxPostsPerChannel(): number | undefined {
  return parseXMonitorLikesPostsLimit(
    process.env.X_MONITOR_LIKES_MAX_POSTS,
    3
  );
}

/** Max follower ids fetched per check (one API page). */
export function getXMonitorFollowersPageSize(): number {
  const n = Number(process.env.X_MONITOR_FOLLOWERS_PAGE_SIZE);
  if (!Number.isFinite(n) || n < 10) {
    return 50;
  }
  return Math.min(Math.floor(n), 100);
}

/** Postiz can connect as client instead of monitor pushing HTTP. */
export function isXMonitorPushIngestViaHttp(): boolean {
  const v = process.env.X_MONITOR_PUSH_INGEST_HTTP?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return true;
}

export type XMonitorFollowersSource = 'api' | 'scrape';

/**
 * How to detect new followers: `api` (default, uses your X API credits) or `scrape` (no v2 credits).
 * Scrape may violate X ToS and break when X changes their site — opt-in only.
 */
export function getXMonitorFollowersSource(): XMonitorFollowersSource {
  const raw = process.env.X_MONITOR_FOLLOWERS_SOURCE?.trim().toLowerCase();
  if (raw === 'scrape' || raw === 'scraping') {
    return 'scrape';
  }
  return 'api';
}

export function isXMonitorFollowersScrapeEnabled(): boolean {
  return getXMonitorFollowersSource() === 'scrape';
}

/** If scrape fails, fall back to API when channel token is available. Default true. */
export function isXMonitorFollowersScrapeFallbackApi(): boolean {
  const v = process.env.X_MONITOR_FOLLOWERS_SCRAPE_FALLBACK_API?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return true;
}

/**
 * Optional `auth_token=...; ct0=...` from logged-in x.com session — improves scrape reliability.
 * Never commit; treat as a secret.
 */
function stripEnvQuotes(value: string): string {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

export function getXMonitorScrapeCookie(): string | undefined {
  const raw = process.env.X_MONITOR_SCRAPE_COOKIE?.trim();
  if (!raw) {
    return undefined;
  }
  return stripEnvQuotes(raw) || undefined;
}

/** Optional extra cookies from x.com (e.g. twid=...; kdt=...). Paste from DevTools → Application → Cookies. */
export function getXMonitorScrapeExtraCookies(): string | undefined {
  const raw = process.env.X_MONITOR_SCRAPE_EXTRA_COOKIES?.trim();
  if (!raw) {
    return undefined;
  }
  return stripEnvQuotes(raw) || undefined;
}

/** @deprecated use getXMonitorScrapeCookie */
export function getXMonitorFollowersScrapeCookie(): string | undefined {
  return getXMonitorScrapeCookie();
}

export function isXMonitorScrapeDebug(): boolean {
  const v = process.env.X_MONITOR_SCRAPE_DEBUG?.trim();
  return v === 'true' || v === '1';
}

/** GraphQL query id for Followers (override when X changes web client). */
export function getXMonitorFollowersScrapeFollowersQueryId(): string {
  return (
    process.env.X_MONITOR_SCRAPE_FOLLOWERS_QUERY_ID?.trim() ||
    'Enf9DNUZYiT037aersI5gg'
  );
}

/** GraphQL query id for UserByScreenName. */
export function getXMonitorFollowersScrapeUserQueryId(): string {
  return (
    process.env.X_MONITOR_SCRAPE_USER_QUERY_ID?.trim() ||
    'IGgvgiOx4QZndDHuD3x9TQ'
  );
}

export type XMonitorLikesSource = 'api' | 'scrape';

export function getXMonitorLikesSource(): XMonitorLikesSource {
  const raw = process.env.X_MONITOR_LIKES_SOURCE?.trim().toLowerCase();
  if (raw === 'scrape' || raw === 'scraping') {
    return 'scrape';
  }
  return 'api';
}

export function isXMonitorLikesScrapeEnabled(): boolean {
  return getXMonitorLikesSource() === 'scrape';
}

export function isXMonitorLikesScrapeFallbackApi(): boolean {
  const v = process.env.X_MONITOR_LIKES_SCRAPE_FALLBACK_API?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return true;
}

/** GraphQL query id for Favoriters (likers on a tweet). */
export function getXMonitorScrapeLikersQueryId(): string {
  return (
    process.env.X_MONITOR_SCRAPE_LIKERS_QUERY_ID?.trim() ||
    'SoWvHOdzCsomAQdY-bFNDA'
  );
}

/**
 * Watch (stream + count deltas) then full scrape — no interval follower/like list scraping.
 * Default on when follower or like source is scrape (avoids 429 from polling GraphQL).
 */
export function isXMonitorActivityOnlyMode(): boolean {
  const v = process.env.X_MONITOR_ACTIVITY_ONLY?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  if (v === 'true' || v === '1') {
    return true;
  }
  return isXMonitorFollowersScrapeEnabled() || isXMonitorLikesScrapeEnabled();
}

/** Interval full follower list scrape/API poll. Off in activity-only mode. */
export function isXMonitorFollowersPollEnabled(): boolean {
  const v = process.env.X_MONITOR_FOLLOWERS_POLL?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  if (v === 'true' || v === '1') {
    return true;
  }
  return !isXMonitorActivityOnlyMode();
}

/** Interval full liker list scrape/API poll. Off in activity-only mode. */
export function isXMonitorLikesPollEnabled(): boolean {
  const v = process.env.X_MONITOR_LIKES_POLL?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  if (v === 'true' || v === '1') {
    return true;
  }
  if (!isXMonitorLikesEnabled()) {
    return false;
  }
  return !isXMonitorActivityOnlyMode();
}

/**
 * When filtered stream delivers a tweet for a monitored @handle, run like/follower scrape
 * immediately (debounced) instead of only on the poll timer.
 * Does not replace stream for replies — stream still handles those; this adds scrape for likes.
 */
export function isXMonitorReactiveScrapeEnabled(): boolean {
  const v = process.env.X_MONITOR_REACTIVE_SCRAPE?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  if (v === 'true' || v === '1') {
    return true;
  }
  return isXMonitorActivityOnlyMode();
}

export function getXMonitorReactiveScrapeDebounceMs(): number {
  const n = Number(process.env.X_MONITOR_REACTIVE_SCRAPE_DEBOUNCE_MS);
  if (!Number.isFinite(n) || n < 500) {
    return 2_000;
  }
  return Math.min(n, 60_000);
}

/**
 * Change watcher: fast public count checks; on increase → full scrape.
 * Closest to "WS watches account/tweet then scrape" without TweetStream/Xquik.
 */
export function isXMonitorWatchEnabled(): boolean {
  const v = process.env.X_MONITOR_WATCH_ENABLED?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  if (v === 'true' || v === '1') {
    return true;
  }
  return isXMonitorActivityOnlyMode();
}

export function getXMonitorWatchIntervalMs(): number {
  const n = Number(process.env.X_MONITOR_WATCH_INTERVAL_MS);
  if (Number.isFinite(n) && n >= 5_000) {
    return Math.min(n, 300_000);
  }
  // Activity-only runs many cheap count checks per tick — default slower than 20s.
  if (isXMonitorActivityOnlyMode()) {
    return 60_000;
  }
  return 20_000;
}

export function isXMonitorWatchFollowers(): boolean {
  const v = process.env.X_MONITOR_WATCH_FOLLOWERS?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return true;
}

export function isXMonitorWatchLikes(): boolean {
  const v = process.env.X_MONITOR_WATCH_LIKES?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return true;
}

/** GraphQL query id for tweet detail (favorite_count). */
export function getXMonitorScrapeTweetQueryId(): string {
  return (
    process.env.X_MONITOR_SCRAPE_TWEET_QUERY_ID?.trim() ||
    'zy39CwTyYhU-_0LP7dljjg'
  );
}

/** Also run follower scrape when stream sees any tweet activity on that handle. */
export function isXMonitorReactiveScrapeFollowersOnStream(): boolean {
  const v = process.env.X_MONITOR_REACTIVE_SCRAPE_FOLLOWERS?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  if (v === 'true' || v === '1') {
    return true;
  }
  return true;
}
