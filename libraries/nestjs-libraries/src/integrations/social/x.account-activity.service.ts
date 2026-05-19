import { Injectable, Logger } from '@nestjs/common';
import { TwitterApi } from 'twitter-api-v2';
import crypto from 'crypto';
import {
  getXAccountActivityRedisWebhookKey,
  getXAccountActivityWebhookIdFromEnv,
  getXAccountActivityWebhookUrl,
  isXAccountActivityWebhooksEnabled,
} from '@gitroom/helpers/x/x.account-activity.env';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

const X_API = 'https://api.x.com';

@Injectable()
export class XAccountActivityService {
  private readonly log = new Logger(XAccountActivityService.name);

  isEnabled(): boolean {
    return (
      isXAccountActivityWebhooksEnabled() &&
      !!process.env.X_API_KEY?.trim() &&
      !!process.env.X_API_SECRET?.trim() &&
      !!getXAccountActivityWebhookUrl()
    );
  }

  private consumerSecret(): string {
    return process.env.X_API_SECRET!.trim();
  }

  /** HMAC-SHA256 digest, base64-encoded (X Account Activity / Webhooks format). */
  private hmacSha256Base64(message: string | Buffer): string {
    return crypto
      .createHmac('sha256', this.consumerSecret())
      .update(message)
      .digest('base64');
  }

  /**
   * CRC challenge for webhook registration (GET ?crc_token=...).
   * @see https://developer.x.com/en/docs/twitter-api/enterprise/account-activity-api/guides/securing-webhooks
   */
  buildCrcResponse(crcToken: string): { response_token: string } {
    const digest = this.hmacSha256Base64(crcToken);
    return { response_token: `sha256=${digest}` };
  }

  /**
   * Validates `x-twitter-webhooks-signature: sha256=<base64>` against raw body.
   */
  verifyWebhookSignature(rawBody: Buffer | string, signatureHeader?: string): boolean {
    if (!signatureHeader?.trim()) {
      return false;
    }
    const expected = signatureHeader.trim().replace(/^sha256=/i, '');
    const computed = this.hmacSha256Base64(rawBody);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'base64'),
        Buffer.from(computed, 'base64')
      );
    } catch {
      return false;
    }
  }

  private buildUserClient(accessToken: string): TwitterApi {
    const [accessTokenSplit, accessSecretSplit] = accessToken.split(':');
    return new TwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: accessTokenSplit,
      accessSecret: accessSecretSplit,
    });
  }

  private async getAppBearerClient(): Promise<TwitterApi> {
    const app = new TwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
    });
    return app.appLogin();
  }

  async getStoredWebhookId(): Promise<string | null> {
    return (await ioRedis.get(getXAccountActivityRedisWebhookKey())) || null;
  }

  private async storeWebhookId(webhookId: string): Promise<void> {
    await ioRedis.set(getXAccountActivityRedisWebhookKey(), webhookId);
  }

  private normalizeWebhookUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
  }

  private extractWebhookId(entry: any): string | undefined {
    const id = entry?.id ?? entry?.webhook_id ?? entry?.data?.id;
    return id != null ? String(id) : undefined;
  }

  /** List webhooks already registered on this X app (GET /2/webhooks). */
  private async listRegisteredWebhooks(
    appClient: TwitterApi
  ): Promise<{ id: string; url?: string }[]> {
    try {
      const res: any = await appClient.v2.get('webhooks');
      const rows = res?.data ?? res?.data?.data ?? [];
      if (!Array.isArray(rows)) {
        return [];
      }
      return rows
        .map((row: any) => {
          const id = this.extractWebhookId(row);
          if (!id) return null;
          const url =
            row?.url ??
            row?.webhook_url ??
            row?.data?.url ??
            row?.data?.webhook_url;
          return { id, url: url ? String(url) : undefined };
        })
        .filter(Boolean) as { id: string; url?: string }[];
    } catch (err: any) {
      this.log.warn(
        'listRegisteredWebhooks failed:',
        err?.data || err?.message || err
      );
      return [];
    }
  }

  /**
   * Resolve webhook id: env → Redis → X API list (portal-created) → POST create.
   */
  async ensureWebhookRegistered(): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const targetUrl = this.normalizeWebhookUrl(getXAccountActivityWebhookUrl()!);

    const fromEnv = getXAccountActivityWebhookIdFromEnv();
    if (fromEnv) {
      await this.storeWebhookId(fromEnv);
      return fromEnv;
    }

    const existing = await this.getStoredWebhookId();
    if (existing) {
      return existing;
    }

    const appClient = await this.getAppBearerClient();
    const listed = await this.listRegisteredWebhooks(appClient);
    const match = listed.find(
      (w) => w.url && this.normalizeWebhookUrl(w.url) === targetUrl
    );
    if (match?.id) {
      await this.storeWebhookId(match.id);
      this.log.log(
        `Reusing existing X webhook id=${match.id} (portal or prior registration)`
      );
      return match.id;
    }
    if (listed.length > 0 && !match) {
      const fallback = listed[0].id;
      await this.storeWebhookId(fallback);
      this.log.warn(
        `WebhookLimitExceeded likely — reusing first X webhook id=${fallback}. ` +
          `Set X_ACCOUNT_ACTIVITY_WEBHOOK_ID if this is wrong.`
      );
      return fallback;
    }

    try {
      const res: any = await appClient.v2.post('webhooks', { url: targetUrl });
      const webhookId = this.extractWebhookId(res?.data ?? res);
      if (!webhookId) {
        this.log.warn('ensureWebhookRegistered: missing webhook id in response');
        return null;
      }
      await this.storeWebhookId(webhookId);
      this.log.log(`Registered X Account Activity webhook id=${webhookId}`);
      return webhookId;
    } catch (err: any) {
      const msg = JSON.stringify(err?.data || err?.message || err);
      if (msg.includes('WebhookLimitExceeded')) {
        const retryList = await this.listRegisteredWebhooks(appClient);
        const retryMatch = retryList.find(
          (w) => w.url && this.normalizeWebhookUrl(w.url) === targetUrl
        );
        const id = retryMatch?.id ?? retryList[0]?.id;
        if (id) {
          await this.storeWebhookId(id);
          this.log.warn(
            `WebhookLimitExceeded — reusing X webhook id=${id}. ` +
              `Add X_ACCOUNT_ACTIVITY_WEBHOOK_ID in .env from the X portal if needed.`
          );
          return id;
        }
      }
      this.log.error('ensureWebhookRegistered failed:', err?.data || err?.message || err);
      return null;
    }
  }

  /**
   * Subscribe a connected X user to the app webhook (POST .../subscriptions/all).
   */
  async subscribeUser(accessToken: string, webhookId: string): Promise<boolean> {
    try {
      const client = this.buildUserClient(accessToken);
      await client.post(
        `${X_API}/2/account_activity/webhooks/${webhookId}/subscriptions/all`,
        {}
      );
      return true;
    } catch (err: any) {
      const msg = JSON.stringify(err?.data || err?.message || err);
      if (msg.includes('DuplicateSubscription')) {
        return true;
      }
      this.log.warn(`subscribeUser failed webhookId=${webhookId}:`, msg);
      return false;
    }
  }

  async unsubscribeUser(
    accessToken: string,
    webhookId: string,
    xUserId: string
  ): Promise<void> {
    try {
      const appClient = await this.getAppBearerClient();
      await appClient.delete(
        `${X_API}/2/account_activity/webhooks/${webhookId}/subscriptions/${xUserId}/all`
      );
    } catch (err: any) {
      this.log.warn(
        `unsubscribeUser failed user=${xUserId}:`,
        err?.data || err?.message || err
      );
    }
  }
}
