import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import {
  getXquikWebhookSecret,
  isXquikEnabled,
} from '@gitroom/helpers/x/xquik.env';

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export type XquikWebhookHeaders = {
  timestamp?: string;
  nonce?: string;
  signature?: string;
};

@Injectable()
export class XquikService {
  /** nonce -> expiresAt (ms). In-memory replay guard per process. */
  private readonly seenNonces = new Map<string, number>();

  isEnabled(): boolean {
    return isXquikEnabled() && !!getXquikWebhookSecret();
  }

  /**
   * Xquik signs: HMAC-SHA256(secret, `${timestamp}.${nonce}.${rawBody}`) as
   * `X-Xquik-Signature: sha256=<hex>`. See https://docs.xquik.com/webhooks/verification
   */
  verifyWebhookSignature(
    rawBody: Buffer | string,
    headers: XquikWebhookHeaders
  ): boolean {
    const secret = getXquikWebhookSecret();
    const timestamp = headers.timestamp?.trim();
    const nonce = headers.nonce?.trim();
    const signatureHeader = headers.signature?.trim();
    if (!secret || !timestamp || !nonce || !signatureHeader) {
      return false;
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
      return false;
    }

    this.pruneSeenNonces();
    const nonceKey = `${timestamp}:${nonce}`;
    if (this.seenNonces.has(nonceKey)) {
      return false;
    }
    this.seenNonces.set(nonceKey, Date.now() + REPLAY_WINDOW_MS);

    const body =
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const signingString = `${timestamp}.${nonce}.${body}`;
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(signingString).digest('hex');

    const received = signatureHeader.startsWith('sha256=')
      ? signatureHeader
      : `sha256=${signatureHeader.replace(/^sha256=/i, '')}`;

    try {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(received, 'utf8');
      if (a.length !== b.length) {
        return false;
      }
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private pruneSeenNonces(): void {
    const now = Date.now();
    for (const [key, exp] of this.seenNonces) {
      if (exp <= now) {
        this.seenNonces.delete(key);
      }
    }
  }
}
