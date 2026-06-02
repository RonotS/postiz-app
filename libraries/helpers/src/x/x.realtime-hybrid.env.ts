import { isXAccountActivityWebhooksEnabled } from '@gitroom/helpers/x/x.account-activity.env';

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/i, '').toLowerCase();
}

/**
 * Stream for all @handles (replies/mentions) + X webhooks for VIP @handles only (likes/follows).
 * Webhooks = X pushes events (realtime, not polling reads). VIP count limited by your X tier.
 */
export function isXRealtimeHybridEnabled(): boolean {
  const v = process.env.X_REALTIME_HYBRID?.trim();
  return v === 'true' || v === '1';
}

/** Max Account Activity subscriptions when hybrid (match your X tier, often 3). */
export function getXAccountActivityVipMaxSubscriptions(): number {
  const n = Number(process.env.X_ACCOUNT_ACTIVITY_VIP_MAX);
  if (!Number.isFinite(n) || n < 1) {
    return 3;
  }
  return Math.min(Math.floor(n), 50);
}

/** VIP handles for webhook likes/follows (comma-separated, without @). */
export function getXAccountActivityVipHandles(): string[] {
  const raw = process.env.X_ACCOUNT_ACTIVITY_VIP_HANDLES?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(/[,\s]+/)
    .map((h) => normalizeHandle(h))
    .filter(Boolean);
}

export function isXAccountActivityVipHandle(profile?: string | null): boolean {
  const h = normalizeHandle(profile ?? '');
  if (!h) {
    return false;
  }
  return getXAccountActivityVipHandles().includes(h);
}

/** Hybrid mode uses AAA webhooks for VIP; stream monitor handles the rest. */
export function shouldUseAccountActivityInHybridMode(): boolean {
  return isXRealtimeHybridEnabled() && isXAccountActivityWebhooksEnabled();
}
