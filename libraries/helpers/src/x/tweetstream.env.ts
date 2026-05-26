/** Set by apps/backend vs apps/orchestrator package.json scripts. */
export function isPostizBackendWorker(): boolean {
  const worker = process.env.POSTIZ_WORKER?.trim();
  if (worker === 'backend') {
    return true;
  }
  if (worker === 'orchestrator') {
    return false;
  }
  const argv = process.argv.join(' ').toLowerCase();
  return (
    argv.includes('apps/backend') ||
    argv.includes('postiz-backend') ||
    argv.includes('apps\\backend')
  );
}

/** Master switch: connect to TweetStream WebSocket for realtime X events. */
export function isTweetStreamEnabled(): boolean {
  const v = process.env.TWEETSTREAM_ENABLED?.trim();
  return v === 'true' || v === '1';
}

export function getTweetStreamApiKey(): string | undefined {
  const key = process.env.TWEETSTREAM_API_KEY?.trim();
  return key || undefined;
}

export function getTweetStreamWsUrl(): string {
  return (
    process.env.TWEETSTREAM_WS_URL?.trim() || 'wss://ws.tweetstream.io/ws'
  );
}

export function getTweetStreamApiBase(): string {
  return (
    process.env.TWEETSTREAM_API_BASE?.trim() ||
    'https://api.tweetstream.io'
  ).replace(/\/+$/, '');
}

/** When true, skip the follower-DM Temporal poller (TweetStream sends follow events). */
export function isTweetStreamFollowerPollingDisabled(): boolean {
  if (!isTweetStreamEnabled()) {
    return false;
  }
  const v = process.env.TWEETSTREAM_DISABLE_FOLLOWER_POLLING?.trim();
  return v === 'true' || v === '1';
}

/** Track every active X channel, not only those with automation plugs. */
export function isTweetStreamTrackAllX(): boolean {
  const v = process.env.TWEETSTREAM_TRACK_ALL_X?.trim();
  return v === 'true' || v === '1';
}

/** Store recent TweetStream events in Redis for dashboard/API (optional). */
export function isTweetStreamPublishEvents(): boolean {
  const v = process.env.TWEETSTREAM_PUBLISH_EVENTS?.trim();
  return v === 'true' || v === '1';
}

export function getTweetStreamRecentEventsRedisKey(): string {
  return 'x:tweetstream:recent-events';
}

export function getTweetStreamRecentEventsMax(): number {
  const n = Number(process.env.TWEETSTREAM_RECENT_EVENTS_MAX);
  if (!Number.isFinite(n) || n < 1) {
    return 200;
  }
  return Math.min(Math.floor(n), 2000);
}

/** Skip WebSocket (REST sync only). Use while debugging 429 / connection limits. */
export function isTweetStreamWebSocketDisabled(): boolean {
  const v = process.env.TWEETSTREAM_DISABLE_WEBSOCKET?.trim();
  return v === 'true' || v === '1';
}

/** Delay before first WS connect after backend start (lets stale connections expire). */
export function getTweetStreamWsStartDelayMs(): number {
  const n = Number(process.env.TWEETSTREAM_WS_START_DELAY_MS);
  if (!Number.isFinite(n) || n < 0) {
    return 45_000;
  }
  return Math.min(Math.floor(n), 600_000);
}

export function getTweetStreamWsLeaderRedisKey(): string {
  return 'x:tweetstream:ws:leader';
}

/** Set while the backend TweetStream WebSocket is connected (refreshed periodically). */
export function getTweetStreamWsConsumerActiveRedisKey(): string {
  return 'x:tweetstream:ws:consumer:active';
}

export function getTweetStreamWsCooldownRedisKey(): string {
  return 'x:tweetstream:ws:cooldown';
}
