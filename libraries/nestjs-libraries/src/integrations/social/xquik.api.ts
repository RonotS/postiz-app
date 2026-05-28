import {
  getXquikApiBase,
  getXquikApiKey,
  getXquikWebhookEventTypes,
  getXquikWebhookSecret,
} from '@gitroom/helpers/x/xquik.env';
import { normalizeTweetStreamHandle } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.normalize';

export type XquikMonitor = {
  id?: string;
  username?: string;
  xUserId?: string;
  eventTypes?: string[];
  isActive?: boolean;
};

export type XquikWebhook = {
  id?: string;
  url?: string;
  eventTypes?: string[];
  secret?: string;
  createdAt?: string;
  isActive?: boolean;
};

/** Include tweet.mention for inbound replies/@mentions on the monitored account. */
const DEFAULT_MONITOR_EVENTS = [
  'tweet.new',
  'tweet.reply',
  'tweet.retweet',
  'tweet.quote',
  'tweet.mention',
  'tweet.like',
  'tweet.favorite',
  // Follow/unfollow are not Xquik monitor webhook types — use GET /x/users/:id/followers poll instead.
] as const;

export class XquikApiClient {
  private readonly base = getXquikApiBase();
  private readonly key = getXquikApiKey();

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = { 'x-api-key': this.key! };
    if (json) {
      h['Content-Type'] = 'application/json';
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    if (!this.key) {
      throw new Error('XQUIK_API_KEY is not set');
    }
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: this.headers(!!body),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let parsed: any = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    if (!res.ok) {
      const err: any = {
        code: res.status,
        data: parsed,
        message: parsed?.message || parsed?.error || text,
      };
      throw err;
    }
    return parsed as T;
  }

  async listMonitors(): Promise<XquikMonitor[]> {
    const body = await this.request<{ monitors?: XquikMonitor[] }>(
      'GET',
      '/monitors'
    );
    return body.monitors ?? [];
  }

  private normalizeWebhookUrl(url: string): string {
    return url.trim().replace(/\/+$/, '').toLowerCase();
  }

  async listWebhooks(): Promise<XquikWebhook[]> {
    const body = await this.request<{
      webhooks?: XquikWebhook[];
      data?: XquikWebhook[];
    }>('GET', '/webhooks');
    return body.webhooks ?? body.data ?? [];
  }

  async createWebhook(
    url: string,
    eventTypes: string[] = [...DEFAULT_MONITOR_EVENTS]
  ): Promise<XquikWebhook> {
    return this.request<XquikWebhook>('POST', '/webhooks', {
      url,
      eventTypes,
    });
  }

  /**
   * Find or create the webhook endpoint. `secret` is only returned on create —
   * store it in XQUIK_WEBHOOK_SECRET immediately.
   */
  async ensureWebhook(targetUrl: string): Promise<{
    webhook: XquikWebhook;
    created: boolean;
  }> {
    const normalizedTarget = this.normalizeWebhookUrl(targetUrl);
    const existing = (await this.listWebhooks()).find(
      (w) =>
        w.url &&
        this.normalizeWebhookUrl(w.url) === normalizedTarget &&
        w.isActive !== false
    );
    if (existing?.id) {
      return { webhook: existing, created: false };
    }

    const created = await this.createWebhook(
      targetUrl,
      getXquikWebhookEventTypes()
    );
    return { webhook: created, created: true };
  }

  async testWebhook(webhookId: string): Promise<unknown> {
    return this.request('POST', `/webhooks/${webhookId}/test`);
  }

  async ensureAccountMonitor(username: string): Promise<XquikMonitor | null> {
    const handle = normalizeTweetStreamHandle(username);
    if (!handle) {
      return null;
    }
    const existing = (await this.listMonitors()).find(
      (m) =>
        normalizeTweetStreamHandle(m.username ?? '') === handle &&
        m.isActive !== false
    );
    if (existing?.id) {
      const required = [...DEFAULT_MONITOR_EVENTS];
      const current = existing.eventTypes ?? [];
      const missing = required.filter((e) => !current.includes(e));
      if (missing.length) {
        try {
          const updated = await this.request<XquikMonitor>(
            'PATCH',
            `/monitors/${existing.id}`,
            { eventTypes: [...new Set([...current, ...required])] }
          );
          return updated;
        } catch {
          console.warn(
            `Xquik monitor @${handle}: could not add events ${missing.join(',')} — update monitor in Xquik dashboard`
          );
        }
      }
      return existing;
    }
    try {
      return await this.request<XquikMonitor>('POST', '/monitors', {
        username: handle,
        eventTypes: [...DEFAULT_MONITOR_EVENTS],
      });
    } catch (err: any) {
      if (err?.code === 409 || err?.data?.error === 'monitor_already_exists') {
        const again = (await this.listMonitors()).find(
          (m) => normalizeTweetStreamHandle(m.username ?? '') === handle
        );
        return again ?? null;
      }
      throw err;
    }
  }
}
