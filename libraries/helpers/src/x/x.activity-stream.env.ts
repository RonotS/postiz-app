/** Expose X engagement events to your site via WebSocket (and HTTP poll). */
export function isXActivityStreamEnabled(): boolean {
  const v = process.env.X_ACTIVITY_STREAM_ENABLED?.trim();
  return v === 'true' || v === '1';
}

/** Shared secret for WebSocket ?token= and HTTP ?token= (required when enabled). */
export function getXActivityStreamSecret(): string | undefined {
  const s = process.env.X_ACTIVITY_STREAM_SECRET?.trim();
  return s || undefined;
}

export function getXActivityStreamRecentMax(): number {
  const n = Number(process.env.X_ACTIVITY_STREAM_RECENT_MAX);
  if (!Number.isFinite(n) || n < 1) {
    return 200;
  }
  return Math.min(Math.floor(n), 2000);
}
