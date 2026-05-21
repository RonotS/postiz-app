/** Master switch: receive X Account Activity via webhooks instead of polling only. */
export function isXAccountActivityWebhooksEnabled(): boolean {
  const v = process.env.X_ACCOUNT_ACTIVITY_WEBHOOKS_ENABLED?.trim();
  return v === 'true' || v === '1';
}

/** When webhooks are on, skip Temporal pollers for webhook-covered plugs (must be explicit). */
export function isXAccountActivityPollingDisabled(): boolean {
  if (!isXAccountActivityWebhooksEnabled()) {
    return false;
  }
  const v = process.env.X_ACCOUNT_ACTIVITY_DISABLE_POLLING?.trim();
  return v === 'true' || v === '1';
}

export function getXAccountActivityWebhookUrl(): string | undefined {
  const url = process.env.X_ACCOUNT_ACTIVITY_WEBHOOK_URL?.trim();
  return url || undefined;
}

/** Webhook id from X Developer Portal (when you created the webhook manually). */
export function getXAccountActivityWebhookIdFromEnv(): string | undefined {
  const id = process.env.X_ACCOUNT_ACTIVITY_WEBHOOK_ID?.trim();
  return id || undefined;
}

export function getXAccountActivityRedisWebhookKey(): string {
  return 'x:aaa:webhook_id';
}

export function getXAccountActivityRedisSubscribedKey(
  integrationId: string
): string {
  return `x:aaa:subscribed:${integrationId}`;
}
