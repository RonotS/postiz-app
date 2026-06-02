import { Logger } from '@nestjs/common';
import {
  getXMonitorScrapeCookie,
  getXMonitorScrapeExtraCookies,
  getXMonitorScrapeMinGapMs,
  getXMonitorScrapeRateLimitWaitMs,
  getXMonitorWatchScrapeMinGapMs,
  isXMonitorScrapeDebug,
} from '@gitroom/helpers/x/x.monitor.env';

const log = new Logger('XMonitorScrape');

export const X_GUEST_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

export type ScrapedUser = { id: string; username?: string };

export type ScrapeFetchMethod = 'graphql' | 'html' | 'empty';

export type ScrapeFetchResult = {
  users: ScrapedUser[];
  method: ScrapeFetchMethod;
};

export type GuestSession = {
  guestToken?: string;
  cookieHeader?: string;
};

export function browserHeaders(
  extra?: Record<string, string>
): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    ...extra,
  };
}

function stripEnvQuotes(value: string): string {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function parseCookieMap(raw?: string): Map<string, string> {
  const map = new Map<string, string>();
  const cookie = stripEnvQuotes(raw ?? '');
  if (!cookie) {
    return map;
  }
  for (const part of cookie.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = stripEnvQuotes(trimmed.slice(eq + 1));
    if (k && v) {
      map.set(k, v);
    }
  }
  return map;
}

function parseCookiePair(raw?: string): { authToken?: string; ct0?: string } {
  const map = parseCookieMap(raw);
  return {
    authToken: map.get('auth_token'),
    ct0: map.get('ct0'),
  };
}

const COOKIE_ORDER = [
  'auth_token',
  'ct0',
  'twid',
  'kdt',
  'att',
  'guest_id',
  'gt',
  'personalization_id',
  'lang',
];

function buildCookieHeader(raw?: string, extraRaw?: string): string | undefined {
  const merged = parseCookieMap(raw);
  for (const [k, v] of parseCookieMap(extraRaw)) {
    merged.set(k, v);
  }
  const authToken = merged.get('auth_token');
  const ct0 = merged.get('ct0');
  if (!authToken || !ct0) {
    return undefined;
  }
  const parts: string[] = [];
  const used = new Set<string>();
  for (const key of COOKIE_ORDER) {
    const v = merged.get(key);
    if (v) {
      parts.push(`${key}=${v}`);
      used.add(key);
    }
  }
  for (const [k, v] of merged) {
    if (!used.has(k)) {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.join('; ');
}

let scrapeCookieStatusLogged = false;
let scrapeCookieDebugLogged = false;
let cachedScrapeSession: { session: GuestSession; at: number } | undefined;
const SCRAPE_SESSION_TTL_MS = 10 * 60 * 1000;

function logScrapeCookieStatus(raw?: string, extraRaw?: string): void {
  if (scrapeCookieStatusLogged) {
    return;
  }
  scrapeCookieStatusLogged = true;
  const header = buildCookieHeader(raw, extraRaw);
  if (header) {
    const merged = parseCookieMap(raw);
    for (const [k, v] of parseCookieMap(extraRaw)) {
      merged.set(k, v);
    }
    log.log(
      `Scrape session: ${merged.size} cookie(s) (${[...merged.keys()].join(', ')})`
    );
    return;
  }
  if (raw?.trim()) {
    log.warn(
      'Scrape session: X_MONITOR_SCRAPE_COOKIE is set but auth_token or ct0 could not be parsed. ' +
        'Use exactly: auth_token=...; ct0=... (no quotes, both from the same x.com login)'
    );
    return;
  }
  log.warn(
    'Scrape session: no X_MONITOR_SCRAPE_COOKIE — guest mode (expect 401/403 on Followers/Likers)'
  );
}

async function activateGuestToken(): Promise<string | undefined> {
  const endpoints = [
    'https://api.twitter.com/1.1/guest/activate.json',
    'https://api.x.com/1.1/guest/activate.json',
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: browserHeaders({
          Authorization: `Bearer ${X_GUEST_BEARER}`,
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { guest_token?: string };
      if (data.guest_token) {
        return data.guest_token;
      }
    } catch {
      /* try next */
    }
  }
  return undefined;
}

export async function buildScrapeSession(): Promise<GuestSession> {
  const now = Date.now();
  if (
    cachedScrapeSession &&
    now - cachedScrapeSession.at < SCRAPE_SESSION_TTL_MS
  ) {
    return cachedScrapeSession.session;
  }

  const rawCookie = getXMonitorScrapeCookie();
  const extraCookie = getXMonitorScrapeExtraCookies();
  logScrapeCookieStatus(rawCookie, extraCookie);
  const cookieHeader = buildCookieHeader(rawCookie, extraCookie);
  let session: GuestSession;
  if (cookieHeader) {
    if (!scrapeCookieDebugLogged && isXMonitorScrapeDebug()) {
      scrapeCookieDebugLogged = true;
      const map = parseCookieMap(rawCookie);
      for (const [k, v] of parseCookieMap(extraCookie)) {
        map.set(k, v);
      }
      scrapeDebug(
        `Using scrape cookie session (${map.size} cookie(s): ${[...map.keys()].join(', ')})`
      );
    }
    session = { cookieHeader };
  } else {
    const guestToken = await activateGuestToken();
    if (guestToken && !scrapeCookieDebugLogged && isXMonitorScrapeDebug()) {
      scrapeCookieDebugLogged = true;
      scrapeDebug('Using guest token (no scrape cookie)');
    } else if (!guestToken && !scrapeCookieDebugLogged && isXMonitorScrapeDebug()) {
      scrapeCookieDebugLogged = true;
      scrapeDebug('No guest token — set X_MONITOR_SCRAPE_COOKIE');
    }
    session = { guestToken };
  }

  cachedScrapeSession = { session, at: now };
  return session;
}

function graphqlHeaders(
  session: GuestSession,
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = browserHeaders({
    Authorization: `Bearer ${X_GUEST_BEARER}`,
    'Content-Type': 'application/json',
    Origin: 'https://x.com',
    Referer: 'https://x.com/',
    ...extra,
  });
  if (session.cookieHeader) {
    headers.Cookie = session.cookieHeader;
    const ct0 = parseCookieMap(session.cookieHeader).get('ct0');
    if (ct0) {
      headers['x-csrf-token'] = ct0;
      headers['x-twitter-auth-type'] = 'OAuth2Session';
    }
  } else if (session.guestToken) {
    headers['x-guest-token'] = session.guestToken;
  }
  return headers;
}

let lastHeavyScrapeRequestAt = 0;
let lastWatchScrapeRequestAt = 0;
let heavyScrapeQueue: Promise<unknown> = Promise.resolve();
let watchScrapeQueue: Promise<unknown> = Promise.resolve();
let lastQueueWaitLogAt = 0;

export type ScrapeQueueKind = 'heavy' | 'watch';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function logQueueWait(waitMs: number, kind: ScrapeQueueKind): void {
  if (!isXMonitorScrapeDebug() || waitMs < 500) {
    return;
  }
  const now = Date.now();
  if (now - lastQueueWaitLogAt < 15_000) {
    return;
  }
  lastQueueWaitLogAt = now;
  scrapeDebug(
    `${kind} scrape queue waiting ${Math.round(waitMs / 1000)}s`
  );
}

/** Serialize scrape calls — heavy (follower/liker lists) vs watch (count-only). */
function enqueueScrape<T>(
  fn: () => Promise<T>,
  kind: ScrapeQueueKind = 'heavy'
): Promise<T> {
  const run = async (): Promise<T> => {
    const minGap =
      kind === 'watch'
        ? getXMonitorWatchScrapeMinGapMs()
        : getXMonitorScrapeMinGapMs();
    const lastAt =
      kind === 'watch' ? lastWatchScrapeRequestAt : lastHeavyScrapeRequestAt;
    const wait = Math.max(0, minGap - (Date.now() - lastAt));
    if (wait > 0) {
      logQueueWait(wait, kind);
      await sleep(wait);
    }
    const now = Date.now();
    if (kind === 'watch') {
      lastWatchScrapeRequestAt = now;
    } else {
      lastHeavyScrapeRequestAt = now;
    }
    return fn();
  };
  const chain = kind === 'watch' ? watchScrapeQueue : heavyScrapeQueue;
  const next = chain.then(run, run);
  if (kind === 'watch') {
    watchScrapeQueue = next.then(
      () => undefined,
      () => undefined
    );
  } else {
    heavyScrapeQueue = next.then(
      () => undefined,
      () => undefined
    );
  }
  return next;
}

async function fetchGraphqlOnce(
  session: GuestSession,
  queryId: string,
  operationName: string,
  variables: Record<string, unknown>,
  features: Record<string, unknown>,
  base: string,
  fieldToggles?: Record<string, unknown>
): Promise<{ ok: true; data: unknown } | { ok: false; status: number }> {
  const featuresParam = encodeURIComponent(JSON.stringify(features));
  const vars = encodeURIComponent(JSON.stringify(variables));
  const togglesParam = fieldToggles
    ? `&fieldToggles=${encodeURIComponent(JSON.stringify(fieldToggles))}`
    : '';
  const url = `${base}/i/api/graphql/${queryId}/${operationName}?variables=${vars}&features=${featuresParam}${togglesParam}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: graphqlHeaders(session, {
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    scrapeDebug(
      `${operationName} HTTP ${res.status} from ${base}: ${errBody.slice(0, 240)}`
    );
    return { ok: false as const, status: res.status };
  }
  return { ok: true as const, data: await res.json() };
}

export async function scrapeGraphqlGet(
  session: GuestSession,
  queryId: string,
  operationName: string,
  variables: Record<string, unknown>,
  features: Record<string, unknown> = {},
  fieldToggles?: Record<string, unknown>,
  queue: ScrapeQueueKind = 'heavy'
): Promise<unknown> {
  return enqueueScrape(async () => {
    const bases = ['https://x.com', 'https://twitter.com'];
    let lastStatus = 0;

    for (const base of bases) {
      const result = await fetchGraphqlOnce(
        session,
        queryId,
        operationName,
        variables,
        features,
        base,
        fieldToggles
      );
      if (result.ok) {
        return result.data;
      }
      if (result.ok === false) {
        lastStatus = result.status;
        if (result.status !== 429) {
          continue;
        }

        const waitMs = getXMonitorScrapeRateLimitWaitMs();
        log.warn(
          `Scrape ${operationName} rate limited (429) — waiting ${Math.round(waitMs / 1000)}s then retry once`
        );
        await sleep(waitMs);
        const retry = await fetchGraphqlOnce(
          session,
          queryId,
          operationName,
          variables,
          features,
          base,
          fieldToggles
        );
        if (retry.ok) {
          return retry.data;
        }
        if (retry.ok === false) {
          lastStatus = retry.status;
        }
      }
    }
    throw new Error(
      `GraphQL ${operationName} failed${lastStatus ? ` (last HTTP ${lastStatus})` : ''}`
    );
  }, queue);
}

export function dig(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function extractUsersFromTimelineInstructions(
  instructions: unknown[]
): { users: ScrapedUser[]; nextCursor?: string } {
  const users: ScrapedUser[] = [];
  let nextCursor: string | undefined;

  for (const instruction of instructions) {
    const entries = (instruction as { entries?: unknown[] })?.entries;
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      const entryObj = entry as Record<string, unknown>;
      const content = entryObj?.content as Record<string, unknown> | undefined;
      const cursorType = content?.cursorType;
      if (cursorType === 'Bottom') {
        const value = (content?.value as string | undefined)?.trim();
        if (value) nextCursor = value;
      }

      const itemContent = content?.itemContent as
        | Record<string, unknown>
        | undefined;
      const userResults = itemContent?.user_results as
        | Record<string, unknown>
        | undefined;
      const result = userResults?.result as Record<string, unknown> | undefined;
      const restId = String(result?.rest_id ?? result?.id ?? '').trim();
      if (!restId) continue;

      const legacy = result?.legacy as Record<string, unknown> | undefined;
      const core = result?.core as Record<string, unknown> | undefined;
      const username = String(
        legacy?.screen_name ??
          (core?.screen_name as string | undefined) ??
          ''
      ).trim();

      users.push({
        id: restId,
        ...(username ? { username } : {}),
      });
    }
  }

  return { users, nextCursor };
}

export function extractUsersFromHtml(
  html: string,
  maxResults: number
): ScrapedUser[] {
  const byId = new Map<string, ScrapedUser>();
  const pairRe =
    /"rest_id":"(\d{5,25})"[\s\S]{0,400}?"screen_name":"([a-zA-Z0-9_]{1,15})"/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(html)) !== null) {
    byId.set(m[1], { id: m[1], username: m[2] });
    if (byId.size >= maxResults) break;
  }
  if (!byId.size) {
    const idRe = /"rest_id":"(\d{5,25})"/g;
    while ((m = idRe.exec(html)) !== null) {
      byId.set(m[1], { id: m[1] });
      if (byId.size >= maxResults) break;
    }
  }
  return [...byId.values()].slice(0, maxResults);
}

export async function fetchHtmlPage(urls: string[]): Promise<string | undefined> {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: browserHeaders({
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }),
      });
      if (!res.ok) continue;
      return await res.text();
    } catch {
      /* try next */
    }
  }
  return undefined;
}

export function scrapeDebug(message: string, err?: unknown): void {
  if (!isXMonitorScrapeDebug()) {
    return;
  }
  if (err !== undefined) {
    log.log(`[scrape debug] ${message} ${String(err)}`);
  } else {
    log.log(`[scrape debug] ${message}`);
  }
}

export function readGraphqlErrors(payload: unknown): string[] {
  const errors = (payload as { errors?: Array<{ message?: string }> })?.errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .map((e) => String(e?.message ?? '').trim())
    .filter(Boolean);
}

/** Log lines to confirm scrape is working — look for [scrape ok] in x-monitor logs. */
export function logScrapeOutcome(
  context: string,
  result: ScrapeFetchResult
): void {
  if (result.users.length > 0) {
    log.log(
      `[scrape ok] ${context}: ${result.users.length} user(s) via ${result.method}`
    );
    return;
  }
  log.warn(
    `[scrape empty] ${context}: 0 users (method=${result.method}). ` +
      `Set X_MONITOR_SCRAPE_COOKIE or check query IDs / X_MONITOR_SCRAPE_DEBUG=true`
  );
}
