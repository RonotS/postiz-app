/**
 * Activity-execution heartbeat.
 *
 * Every Temporal activity method should call `markActivity()` at the start
 * of its body. The orchestrator's main.ts polls `getMillisSinceActivity()` —
 * if no activity has run for too long while the orchestrator has uptime,
 * we treat the worker as silently stuck and exit so pm2 restarts.
 *
 * This catches the failure mode where the Temporal client gRPC connection
 * is technically up (so server pings succeed) but the worker has stopped
 * pulling tasks from its task queue. Server-side ping cannot detect this.
 */

let lastActivityAt = Date.now();

export function markActivity(): void {
  lastActivityAt = Date.now();
}

export function getMillisSinceActivity(): number {
  return Date.now() - lastActivityAt;
}

/**
 * Seed the timestamp at module load so it represents "orchestrator startup
 * time" until the first real activity runs. Without this, on a freshly-
 * started orchestrator with no traffic yet, the heartbeat-stuck check would
 * misfire because the timestamp would be 0/Date.now() races with bootstrap.
 */
export function initActivityHeartbeat(): void {
  lastActivityAt = Date.now();
}

/**
 * Class decorator that wraps every method of a class so each invocation
 * calls markActivity() before delegating to the original implementation.
 *
 * Apply this to each Temporal activity class (e.g. PostActivity) so that
 * every activity execution updates the heartbeat — without having to
 * sprinkle markActivity() calls into every individual method body.
 *
 * Constructor and getter/setter properties are skipped; only function
 * properties on the prototype are wrapped.
 */
export function TrackActivities(): ClassDecorator {
  return (target: any) => {
    const proto = target.prototype;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc || typeof desc.value !== 'function') continue;
      const original = desc.value;
      const wrapped = function (this: any, ...args: any[]) {
        markActivity();
        return original.apply(this, args);
      };
      // Preserve any metadata other decorators have already attached
      // (notably nestjs-temporal-core's @ActivityMethod()).
      Object.getOwnPropertyNames(original).forEach((prop) => {
        try {
          (wrapped as any)[prop] = (original as any)[prop];
        } catch { /* read-only props on Function — ignore */ }
      });
      Object.defineProperty(proto, name, {
        ...desc,
        value: wrapped,
      });
    }
    return target;
  };
}
