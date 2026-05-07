import { timer } from '@gitroom/helpers/utils/timer';
import { Integration } from '@prisma/client';
import { ApplicationFailure } from '@temporalio/activity';

export class RefreshToken extends ApplicationFailure {
  constructor(identifier: string, json: string, body: BodyInit, message = '') {
    super(message, 'refresh_token', true, [
      {
        identifier,
        json,
        body,
      },
    ]);
  }
}

export class BadBody extends ApplicationFailure {
  constructor(identifier: string, json: string, body: BodyInit, message = '') {
    super(message, 'bad_body', true, [
      {
        identifier,
        json,
        body,
      },
    ]);
  }
}

export class NotEnoughScopes {
  constructor(
    public message = 'Not enough scopes, when choosing a provider, please add all the scopes'
  ) { }
}

function safeStringify(obj: any) {
  const seen = new WeakSet();

  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

export abstract class SocialAbstract {
  abstract identifier: string;
  maxConcurrentJob = 1;

  // Per-instance serialization lock. When `maxConcurrentJob = 1` and
  // `ignoreConcurrency` is not set, runInConcurrent uses this to chain calls
  // so that two posts scheduled at the same instant (e.g., both at 3:20 PM)
  // hit the upstream API one at a time instead of in parallel — preventing
  // the upstream from seeing two concurrent requests from the same token,
  // which several providers (notably X) treat as a rate-limit / abuse signal
  // and reject with 401/429.
  private _serialLock: Promise<void> = Promise.resolve();

  public handleErrors(
    body: string,
    status: number,
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    return undefined;
  }

  public async mention(
    token: string,
    d: { query: string },
    id: string,
    integration: Integration
  ): Promise<
    | { id: string; label: string; image: string; doNotCache?: boolean }[]
    | { none: true }
  > {
    return { none: true };
  }

  async runInConcurrent<T>(
    func: (...args: any[]) => Promise<T>,
    ignoreConcurrency?: boolean
  ) {
    const shouldSerialize = this.maxConcurrentJob === 1 && !ignoreConcurrency;

    if (shouldSerialize) {
      // Wait for the previous call (success or failure) to fully release.
      const previousLock = this._serialLock;
      let release!: () => void;
      this._serialLock = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        await previousLock;
      } catch {
        /* prior failure must not block this call */
      }

      try {
        return await this._runOnce(func);
      } finally {
        release();
      }
    }

    return this._runOnce(func);
  }

  private async _runOnce<T>(func: (...args: any[]) => Promise<T>): Promise<any> {
    let value: any;
    try {
      value = await func();
    } catch (err: any) {
      console.error('--- RAW SOCIAL API ERROR ---');
      console.error('Message:', err?.message);
      console.error('Data:', JSON.stringify(err?.data || err, null, 2));
      console.error('----------------------------');
      const handle = this.handleErrors(safeStringify(err), 200);
      const fallback =
        err?.data?.detail ||
        err?.data?.errors?.[0]?.message ||
        err?.data?.title ||
        err?.requestError?.message ||
        err?.cause?.message ||
        err?.message ||
        'Unknown Error';
      const rawDiag = JSON.stringify(err?.data || err?.message || '');
      value = { err: true, value: fallback, ...(handle || {}), rawDiag };
    }

    if (value && value?.err && value?.value) {
      if (value.type === 'refresh-token') {
        throw new RefreshToken(
          'Refresh token is needed',
          safeStringify({}),
          {} as any,
          value.value || ''
        );
      }
      const rawDiagMsg = value.rawDiag ? ` | DIAGNOSTICS: ${value.rawDiag}` : '';
      throw new BadBody('', safeStringify({}), {} as any, (value.value || '') + rawDiagMsg);
    }

    return value;
  }

  async fetch(
    url: string,
    options: RequestInit = {},
    identifier = '',
    totalRetries = 0,
    ignoreConcurrency = false
  ): Promise<Response> {
    const request = await fetch(url, options);

    if (request.status === 200 || request.status === 201) {
      return request;
    }

    if (totalRetries > 2) {
      throw new BadBody(identifier, '{}', options.body || '{}');
    }

    let json = '{}';
    try {
      json = await request.text();
    } catch (err) {
      json = '{}';
    }

    const handleError = this.handleErrors(json || '{}', request.status);

    if (
      request.status === 429 ||
      (request.status === 500 && !handleError) ||
      json.includes('rate_limit_exceeded') ||
      json.includes('Rate limit')
    ) {
      await timer(5000);
      return this.fetch(
        url,
        options,
        identifier,
        totalRetries + 1,
        ignoreConcurrency
      );
    }

    if (handleError?.type === 'retry') {
      await timer(5000);
      return this.fetch(
        url,
        options,
        identifier,
        totalRetries + 1,
        ignoreConcurrency
      );
    }

    if (
      (request.status === 401 &&
        (handleError?.type === 'refresh-token' || !handleError)) ||
      handleError?.type === 'refresh-token'
    ) {
      throw new RefreshToken(
        identifier,
        json,
        options.body!,
        handleError?.value
      );
    }

    throw new BadBody(
      identifier,
      json,
      options.body!,
      handleError?.value || ''
    );
  }

  checkScopes(required: string[], got: string | string[]) {
    if (Array.isArray(got)) {
      if (!required.every((scope) => got.includes(scope))) {
        throw new NotEnoughScopes();
      }

      return true;
    }

    const newGot = decodeURIComponent(got);

    const splitType = newGot.indexOf(',') > -1 ? ',' : ' ';
    const gotArray = newGot.split(splitType);
    if (!required.every((scope) => gotArray.includes(scope))) {
      throw new NotEnoughScopes();
    }

    return true;
  }
}
