import {
  getTweetStreamApiBase,
  getTweetStreamApiKey,
} from '@gitroom/helpers/x/tweetstream.env';
import { normalizeTweetStreamHandle } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.normalize';

export type TweetStreamMeResponse = {
  plan?: string;
  websocket?: { count: number; limit: number };
  trackedAccounts?: {
    count: number;
    limit: number;
    handles: string[];
  };
};

export type TweetStreamAccountOpResult = {
  results?: Array<{
    handle?: string;
    success?: boolean;
    error?: string;
    message?: string;
    state?: string;
    input?: string;
    normalizedHandle?: string;
  }>;
  summary?: { total: number; succeeded: number; failed: number };
  action?: string;
  error?: string | null;
};

const ALREADY_TRACKED_STATES = new Set([
  'already_following',
  'already_tracked',
  'already_exists',
  'already_monitored',
]);

function isBenignAccountState(state?: string): boolean {
  if (!state) return false;
  return ALREADY_TRACKED_STATES.has(String(state).toLowerCase());
}

function isAccountLimitMessage(message?: string): boolean {
  return /account limit reached/i.test(String(message ?? ''));
}

function normalizeAddAccountBody(
  body: TweetStreamAccountOpResult,
  httpStatus: number
): TweetStreamAccountOpResult {
  const results = body.results ?? [];
  const normalized = results.map((row) => {
    const ok =
      row.success === true ||
      isBenignAccountState(row.state) ||
      (httpStatus === 400 && isBenignAccountState(row.state));
    return { ...row, success: ok };
  });
  const succeeded = normalized.filter((r) => r.success).length;
  const failed = normalized.length - succeeded;
  return {
    ...body,
    results: normalized,
    summary: {
      total: normalized.length,
      succeeded,
      failed,
    },
  };
}

export class TweetStreamApiClient {
  private readonly base: string;
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? getTweetStreamApiKey();
    if (!key) {
      throw new Error('TWEETSTREAM_API_KEY is not set');
    }
    this.apiKey = key;
    this.base = getTweetStreamApiBase();
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (json) {
      h['Content-Type'] = 'application/json';
    }
    return h;
  }

  async getMe(): Promise<TweetStreamMeResponse> {
    const res = await fetch(`${this.base}/api/me`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`TweetStream /api/me failed (${res.status}): ${text}`);
    }
    return (await res.json()) as TweetStreamMeResponse;
  }

  async addAccounts(handles: string[]): Promise<TweetStreamAccountOpResult> {
    const accounts = handles
      .map((h) => normalizeTweetStreamHandle(h))
      .filter(Boolean);
    if (!accounts.length) {
      return { results: [], summary: { total: 0, succeeded: 0, failed: 0 } };
    }

    const res = await fetch(`${this.base}/api/add-account`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ accounts }),
    });
    const body = (await res.json().catch(() => ({}))) as TweetStreamAccountOpResult;
    const normalized = normalizeAddAccountBody(body, res.status);
    const allBenign =
      normalized.results?.length &&
      normalized.results.every((r) => r.success);
    const allAccountLimit =
      normalized.results?.length &&
      normalized.results.every(
        (r) => !r.success && isAccountLimitMessage(r.message ?? r.error)
      );
    if (!res.ok && res.status !== 207 && !allBenign && !allAccountLimit) {
      throw new Error(
        `TweetStream add-account failed (${res.status}): ${JSON.stringify(body)}`
      );
    }
    return normalized;
  }

  async removeAccounts(handles: string[]): Promise<TweetStreamAccountOpResult> {
    const accounts = handles
      .map((h) => normalizeTweetStreamHandle(h))
      .filter(Boolean);
    if (!accounts.length) {
      return { results: [], summary: { total: 0, succeeded: 0, failed: 0 } };
    }

    const res = await fetch(`${this.base}/api/remove-account`, {
      method: 'DELETE',
      headers: this.headers(true),
      body: JSON.stringify({ accounts }),
    });
    const body = (await res.json().catch(() => ({}))) as TweetStreamAccountOpResult;
    if (!res.ok && res.status !== 207) {
      throw new Error(
        `TweetStream remove-account failed (${res.status}): ${JSON.stringify(body)}`
      );
    }
    return body;
  }
}
