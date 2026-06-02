/** Your stack ingests X events (HTTP and/or your WebSocket URL) — not TweetStream or X AAA. */
export function isXCustomIngestEnabled(): boolean {
  const v = process.env.X_CUSTOM_INGEST_ENABLED?.trim();
  return v === 'true' || v === '1';
}

export function getXCustomIngestSecret(): string | undefined {
  const s = process.env.X_CUSTOM_INGEST_SECRET?.trim();
  return s || undefined;
}

/** When false, ingest only fans out to X_ACTIVITY_STREAM (no auto-DM from ingest). */
export function isXCustomIngestAutoDmEnabled(): boolean {
  const v = process.env.X_CUSTOM_INGEST_AUTO_DM?.trim();
  if (v === 'false' || v === '0') {
    return false;
  }
  return true;
}

/** Postiz connects as a WebSocket client to your server (optional). */
export function isXCustomWsClientEnabled(): boolean {
  const v = process.env.X_CUSTOM_WS_CLIENT_ENABLED?.trim();
  return v === 'true' || v === '1';
}

export function getXCustomWsUrl(): string | undefined {
  const u = process.env.X_CUSTOM_WS_URL?.trim();
  return u || undefined;
}

export function getXCustomWsToken(): string | undefined {
  const t = process.env.X_CUSTOM_WS_TOKEN?.trim();
  return t || undefined;
}

export function getXCustomWsReconnectMs(): number {
  const n = Number(process.env.X_CUSTOM_WS_RECONNECT_MS);
  if (!Number.isFinite(n) || n < 1000) {
    return 5_000;
  }
  return Math.min(n, 300_000);
}
