import { Logger } from '@nestjs/common';
import {
  getXMonitorFollowersScrapeFollowersQueryId,
  getXMonitorFollowersScrapeUserQueryId,
} from '@gitroom/helpers/x/x.monitor.env';
import { normalizeXHandle } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.normalize';
import {
  buildScrapeSession,
  dig,
  extractUsersFromHtml,
  extractUsersFromTimelineInstructions,
  fetchHtmlPage,
  logScrapeOutcome,
  type ScrapeFetchResult,
  type ScrapedUser,
} from '@gitroom/nestjs-libraries/x-monitor/x-monitor.scrape.core';
import { X_SCRAPE_FEATURES_FOLLOWERS, X_SCRAPE_FEATURES_USER } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.scrape.features';
import { scrapeGraphqlOperation } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.scrape.query-ids';

const log = new Logger('XMonitorFollowersScrape');

export type ScrapedFollower = ScrapedUser;

async function resolveUserIdByHandle(
  handle: string
): Promise<string | undefined> {
  const screenName = normalizeXHandle(handle);
  if (!screenName) {
    return undefined;
  }
  const session = await buildScrapeSession();
  const payload = await scrapeGraphqlOperation(
    session,
    'UserByScreenName',
    { screen_name: screenName, withGrokTranslatedBio: false },
    X_SCRAPE_FEATURES_USER,
    getXMonitorFollowersScrapeUserQueryId()
  );
  const id =
    (dig(payload, 'data', 'user', 'result', 'rest_id') as string | undefined) ??
    (dig(payload, 'data', 'user', 'result', 'id') as string | undefined);
  return id ? String(id) : undefined;
}

function extractFollowersFromGraphql(payload: unknown): {
  users: ScrapedUser[];
  nextCursor?: string;
} {
  const instructionPaths = [
    ['data', 'user', 'result', 'timeline', 'timeline', 'instructions'],
    ['data', 'user', 'result', 'followers_timeline', 'timeline', 'instructions'],
  ];
  for (const path of instructionPaths) {
    const instructions = dig(payload, ...path) as unknown[] | undefined;
    if (Array.isArray(instructions)) {
      return extractUsersFromTimelineInstructions(instructions);
    }
  }
  return { users: [] };
}

async function fetchFollowersHtmlFallback(
  handle: string,
  maxResults: number
): Promise<ScrapeFetchResult> {
  const screenName = normalizeXHandle(handle);
  const html = await fetchHtmlPage([
    `https://x.com/${screenName}/followers`,
    `https://twitter.com/${screenName}/followers`,
  ]);
  if (!html) {
    return { users: [], method: 'empty' };
  }
  const users = extractUsersFromHtml(html, maxResults);
  return { users, method: users.length ? 'html' : 'empty' };
}

export async function fetchFollowersViaScrape(options: {
  handle: string;
  userId?: string;
  maxResults: number;
}): Promise<ScrapeFetchResult> {
  const handle = normalizeXHandle(options.handle);
  const maxResults = Math.min(Math.max(options.maxResults, 10), 100);
  const session = await buildScrapeSession();
  const context = `@${handle} followers`;

  let userId = String(options.userId ?? '').trim();
  if (!userId) {
    try {
      userId = (await resolveUserIdByHandle(handle)) ?? '';
    } catch (err) {
      log.warn(`@${handle}: UserByScreenName failed:`, err);
    }
  }
  if (!userId) {
    log.warn(
      `@${handle}: scrape could not resolve user id — set X_MONITOR_SCRAPE_COOKIE or ensure internalId in DB`
    );
    const htmlResult = await fetchFollowersHtmlFallback(handle, maxResults);
    logScrapeOutcome(context, htmlResult);
    return htmlResult;
  }

  const collected = new Map<string, ScrapedUser>();
  let cursor: string | undefined;

  for (let page = 0; page < 3 && collected.size < maxResults; page++) {
    const variables: Record<string, unknown> = {
      userId,
      count: Math.min(50, maxResults - collected.size),
      includePromotedContent: false,
      withGrokTranslatedBio: false,
    };
    if (cursor) {
      variables.cursor = cursor;
    }

    try {
      const payload = await scrapeGraphqlOperation(
        session,
        'Followers',
        variables,
        X_SCRAPE_FEATURES_FOLLOWERS,
        getXMonitorFollowersScrapeFollowersQueryId()
      );
      const { users, nextCursor } = extractFollowersFromGraphql(payload);
      for (const u of users) {
        collected.set(u.id, u);
      }
      if (!nextCursor || !users.length) {
        break;
      }
      cursor = nextCursor;
    } catch (err) {
      log.warn(`@${handle}: GraphQL Followers failed:`, err);
      break;
    }
  }

  if (collected.size) {
    const result: ScrapeFetchResult = {
      users: [...collected.values()].slice(0, maxResults),
      method: 'graphql',
    };
    logScrapeOutcome(context, result);
    return result;
  }

  const htmlResult = await fetchFollowersHtmlFallback(handle, maxResults);
  logScrapeOutcome(context, htmlResult);
  return htmlResult;
}
