/** Default interval between X plug poller ticks (5 minutes). */
export const X_DEFAULT_POLL_INTERVAL_MS = 300_000;

const MIN_POLL_MS = 30_000;
const MAX_POLL_MS = 3_600_000;

/**
 * Resolve poller interval from an optional env var; defaults to 5 minutes.
 */
export function resolveXPollIntervalMs(envVarName: string): number {
  const fromEnv = Number(process.env[envVarName]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, fromEnv));
  }
  return X_DEFAULT_POLL_INTERVAL_MS;
}
