import { Logger } from '@nestjs/common';
import { getXMonitorScrapeLikersQueryId } from '@gitroom/helpers/x/x.monitor.env';
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
import { X_SCRAPE_FEATURES_FAVORITERS } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.scrape.features';
import { scrapeGraphqlOperation } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.scrape.query-ids';

const log = new Logger('XMonitorLikesScrape');

function extractLikersFromGraphql(payload: unknown): {
  users: ScrapedUser[];
  nextCursor?: string;
} {
  const instructionPaths = [
    ['data', 'favoriters_timeline', 'timeline', 'instructions'],
    [
      'data',
      'tweetResult',
      'result',
      'favoriters_timeline',
      'timeline',
      'instructions',
    ],
    ['data', 'tweet', 'result', 'favoriters_timeline', 'timeline', 'instructions'],
  ];
  for (const path of instructionPaths) {
    const instructions = dig(payload, ...path) as unknown[] | undefined;
    if (Array.isArray(instructions)) {
      return extractUsersFromTimelineInstructions(instructions);
    }
  }
  return { users: [] };
}

async function fetchLikersHtmlFallback(
  tweetId: string,
  maxResults: number
): Promise<ScrapeFetchResult> {
  const html = await fetchHtmlPage([
    `https://x.com/i/status/${tweetId}/likes`,
    `https://twitter.com/i/status/${tweetId}/likes`,
  ]);
  if (!html) {
    return { users: [], method: 'empty' };
  }
  const users = extractUsersFromHtml(html, maxResults);
  return { users, method: users.length ? 'html' : 'empty' };
}

export async function fetchLikersViaScrape(options: {
  tweetId: string;
  maxResults: number;
}): Promise<ScrapeFetchResult> {
  const tweetId = String(options.tweetId ?? '').trim();
  const maxResults = Math.min(Math.max(options.maxResults, 10), 100);
  const context = `tweet ${tweetId} likers`;

  if (!tweetId) {
    return { users: [], method: 'empty' };
  }

  const session = await buildScrapeSession();
  const collected = new Map<string, ScrapedUser>();
  let cursor: string | undefined;

  for (let page = 0; page < 3 && collected.size < maxResults; page++) {
    const variables: Record<string, unknown> = {
      tweetId,
      count: Math.min(50, maxResults - collected.size),
      includePromotedContent: false,
    };
    if (cursor) {
      variables.cursor = cursor;
    }

    try {
      const payload = await scrapeGraphqlOperation(
        session,
        'Favoriters',
        variables,
        X_SCRAPE_FEATURES_FAVORITERS,
        getXMonitorScrapeLikersQueryId()
      );
      const { users, nextCursor } = extractLikersFromGraphql(payload);
      for (const u of users) {
        collected.set(u.id, u);
      }
      if (!nextCursor || !users.length) {
        break;
      }
      cursor = nextCursor;
    } catch (err) {
      log.warn(`tweet ${tweetId}: GraphQL Favoriters failed:`, err);
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

  const htmlResult = await fetchLikersHtmlFallback(tweetId, maxResults);
  logScrapeOutcome(context, htmlResult);
  return htmlResult;
}
