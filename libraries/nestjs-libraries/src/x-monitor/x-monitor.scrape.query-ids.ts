import { Logger } from '@nestjs/common';
import { scrapeDebug, scrapeGraphqlGet, type GuestSession } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.scrape.core';

const log = new Logger('XMonitorScrapeQueryIds');

const cache = new Map<string, string>();
let bundleFetchedAt = 0;
const BUNDLE_TTL_MS = 60 * 60 * 1000;

const DEFAULT_QUERY_IDS: Record<string, string> = {
  Followers: 'Enf9DNUZYiT037aersI5gg',
  UserByScreenName: 'IGgvgiOx4QZndDHuD3x9TQ',
  UserByRestId: 'IGgvgiOx4QZndDHuD3x9TQ',
  Favoriters: 'SoWvHOdzCsomAQdY-bFNDA',
  TweetResultByRestId: 'zy39CwTyYhU-_0LP7dljjg',
  TweetDetail: 'zy39CwTyYhU-_0LP7dljjg',
};

export function resolveScrapeQueryId(
  operationName: string,
  envOverride?: string
): string {
  const fromEnv = envOverride?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return cache.get(operationName) ?? DEFAULT_QUERY_IDS[operationName] ?? '';
}

export async function refreshScrapeQueryIdsFromWeb(): Promise<void> {
  const now = Date.now();
  if (now - bundleFetchedAt < BUNDLE_TTL_MS && cache.size) {
    return;
  }

  try {
    const res = await fetch('https://x.com/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    });
    if (!res.ok) {
      return;
    }
    const html = await res.text();
    const jsMatch = html.match(
      /https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[a-f0-9]+\.js/
    );
    if (!jsMatch) {
      scrapeDebug('Could not find x.com main.js URL in HTML');
      return;
    }
    const jsRes = await fetch(jsMatch[0]);
    if (!jsRes.ok) {
      return;
    }
    const js = await jsRes.text();
    const ops = [
      'Followers',
      'UserByScreenName',
      'Favoriters',
      'TweetResultByRestId',
      'TweetDetail',
    ];
    for (const op of ops) {
      const re = new RegExp(
        `queryId:"([A-Za-z0-9_-]{15,30})",operationName:"${op}"`
      );
      const m = js.match(re);
      if (m?.[1]) {
        cache.set(op, m[1]);
        if (op === 'UserByScreenName') {
          cache.set('UserByRestId', m[1]);
        }
        log.log(`Resolved GraphQL queryId for ${op}: ${m[1]}`);
      }
    }
    bundleFetchedAt = now;
  } catch (err) {
    scrapeDebug('refreshScrapeQueryIdsFromWeb failed', err);
  }
}

export async function scrapeGraphqlOperation(
  session: GuestSession,
  operationName: string,
  variables: Record<string, unknown>,
  features: Record<string, unknown>,
  envQueryId?: string,
  fieldToggles?: Record<string, unknown>,
  queue: 'heavy' | 'watch' = 'heavy'
): Promise<unknown> {
  await refreshScrapeQueryIdsFromWeb();
  let queryId = resolveScrapeQueryId(operationName, envQueryId);
  try {
    return await scrapeGraphqlGet(
      session,
      queryId,
      operationName,
      variables,
      features,
      fieldToggles,
      queue
    );
  } catch (err) {
    if (!String(err).includes('404')) {
      throw err;
    }
    log.warn(`${operationName} queryId ${queryId} returned 404 — refreshing from x.com bundle`);
    bundleFetchedAt = 0;
    await refreshScrapeQueryIdsFromWeb();
    queryId = resolveScrapeQueryId(operationName, envQueryId);
    return await scrapeGraphqlGet(
      session,
      queryId,
      operationName,
      variables,
      features,
      fieldToggles,
      queue
    );
  }
}
