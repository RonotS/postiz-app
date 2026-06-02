import { Logger } from '@nestjs/common';
import {
  getXMonitorFollowersScrapeUserQueryId,
  getXMonitorScrapeTweetQueryId,
} from '@gitroom/helpers/x/x.monitor.env';
import { normalizeXHandle } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.normalize';
import {
  buildScrapeSession,
  dig,
  readGraphqlErrors,
  scrapeDebug,
  type GuestSession,
} from '@gitroom/nestjs-libraries/x-monitor/x-monitor.scrape.core';
import {
  X_SCRAPE_FEATURES_TWEET,
  X_SCRAPE_FEATURES_USER,
  X_SCRAPE_FIELD_TOGGLES_TWEET,
  X_SCRAPE_FIELD_TOGGLES_USER,
  xScrapeVariablesTweetById,
  xScrapeVariablesTweetDetail,
} from '@gitroom/nestjs-libraries/x-monitor/x-monitor.scrape.features';
import { scrapeGraphqlOperation } from '@gitroom/nestjs-libraries/x-monitor/x-monitor.scrape.query-ids';

const log = new Logger('XMonitorWatchMetrics');
const WATCH_QUEUE = 'watch' as const;

/** Lightweight public counts (no full liker/follower lists). */
export async function fetchAccountFollowersCount(
  options: {
    handle: string;
    userId?: string;
  },
  sessionIn?: GuestSession
): Promise<number | undefined> {
  const handle = normalizeXHandle(options.handle);
  if (!handle) {
    return undefined;
  }

  const session = sessionIn ?? (await buildScrapeSession());

  try {
    const payload = await scrapeGraphqlOperation(
      session,
      'UserByScreenName',
      { screen_name: handle, withGrokTranslatedBio: false },
      X_SCRAPE_FEATURES_USER,
      getXMonitorFollowersScrapeUserQueryId(),
      X_SCRAPE_FIELD_TOGGLES_USER,
      WATCH_QUEUE
    );
    const gqlErrors = readGraphqlErrors(payload);
    if (gqlErrors.length) {
      log.warn(`UserByScreenName @${handle}: ${gqlErrors.join('; ')}`);
    }
    const unavailable = dig(payload, 'data', 'user', 'result', '__typename');
    if (unavailable === 'UserUnavailable') {
      log.warn(`UserByScreenName @${handle}: user unavailable`);
      return undefined;
    }
    const count = readFollowersCount(payload);
    if (count !== undefined) {
      return count;
    }
    scrapeDebug(`UserByScreenName @${handle}: no followers_count in payload`);
  } catch (err) {
    scrapeDebug(`UserByScreenName count @${handle} failed`, err);
  }

  const userId = String(options.userId ?? '').trim();
  if (!userId) {
    return undefined;
  }

  try {
    const payload = await scrapeGraphqlOperation(
      session,
      'UserByRestId',
      { userId, withGrokTranslatedBio: false },
      X_SCRAPE_FEATURES_USER,
      getXMonitorFollowersScrapeUserQueryId(),
      X_SCRAPE_FIELD_TOGGLES_USER,
      WATCH_QUEUE
    );
    return readFollowersCount(payload);
  } catch (err) {
    log.warn(`UserByRestId count failed for ${userId}:`, err);
    return undefined;
  }
}

export async function fetchTweetFavoriteCount(
  tweetId: string,
  sessionIn?: GuestSession
): Promise<number | undefined> {
  const id = String(tweetId ?? '').trim();
  if (!id) {
    return undefined;
  }

  const session = sessionIn ?? (await buildScrapeSession());

  try {
    const payload = await scrapeGraphqlOperation(
      session,
      'TweetResultByRestId',
      xScrapeVariablesTweetById(id),
      X_SCRAPE_FEATURES_TWEET,
      getXMonitorScrapeTweetQueryId(),
      X_SCRAPE_FIELD_TOGGLES_TWEET,
      WATCH_QUEUE
    );
    const count = readFavoriteCount(payload);
    if (count !== undefined) {
      return count;
    }
    scrapeDebug(`TweetResultByRestId ${id}: no favorite_count in payload`);
  } catch (err) {
    scrapeDebug(`TweetResultByRestId ${id} failed`, err);
  }

  try {
    const payload = await scrapeGraphqlOperation(
      session,
      'TweetDetail',
      xScrapeVariablesTweetDetail(id),
      X_SCRAPE_FEATURES_TWEET,
      getXMonitorScrapeTweetQueryId(),
      undefined,
      WATCH_QUEUE
    );
    return readFavoriteCount(payload);
  } catch (err) {
    scrapeDebug(`Tweet count ${id} failed`, err);
    return undefined;
  }
}

function readFollowersCount(payload: unknown): number | undefined {
  const paths = [
    ['data', 'user', 'result', 'legacy', 'followers_count'],
    ['data', 'user', 'result', 'legacy', 'normal_followers_count'],
    [
      'data',
      'user',
      'result',
      'core',
      'user_results',
      'result',
      'legacy',
      'followers_count',
    ],
    ['data', 'user', 'result', 'followers_count'],
  ];
  for (const path of paths) {
    const v = dig(payload, ...path);
    if (typeof v === 'number' && v >= 0) {
      return v;
    }
  }
  return findNestedFollowersCount(payload);
}

function readFavoriteCount(payload: unknown): number | undefined {
  const paths = [
    ['data', 'tweetResult', 'result', 'legacy', 'favorite_count'],
    ['data', 'tweetResult', 'result', 'tweet', 'legacy', 'favorite_count'],
    ['data', 'tweet', 'result', 'legacy', 'favorite_count'],
    ['data', 'tweetResult', 'result', 'favorite_count'],
  ];
  for (const path of paths) {
    const v = dig(payload, ...path);
    if (typeof v === 'number' && v >= 0) {
      return v;
    }
  }
  return findNestedFavoriteCount(payload);
}

function findNestedFollowersCount(
  obj: unknown,
  depth = 0,
  seen = new Set<unknown>()
): number | undefined {
  if (depth > 14 || !obj || typeof obj !== 'object' || seen.has(obj)) {
    return undefined;
  }
  seen.add(obj);
  if (
    'legacy' in obj &&
    typeof (obj as { legacy?: { followers_count?: unknown } }).legacy
      ?.followers_count === 'number'
  ) {
    const count = (obj as { legacy: { followers_count: number } }).legacy
      .followers_count;
    if (count >= 0) {
      return count;
    }
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findNestedFollowersCount(item, depth + 1, seen);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  for (const value of Object.values(obj)) {
    const found = findNestedFollowersCount(value, depth + 1, seen);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findNestedFavoriteCount(
  obj: unknown,
  depth = 0,
  seen = new Set<unknown>()
): number | undefined {
  if (depth > 14 || !obj || typeof obj !== 'object' || seen.has(obj)) {
    return undefined;
  }
  seen.add(obj);
  if (
    'legacy' in obj &&
    typeof (obj as { legacy?: { favorite_count?: unknown } }).legacy
      ?.favorite_count === 'number'
  ) {
    const count = (obj as { legacy: { favorite_count: number } }).legacy
      .favorite_count;
    if (count >= 0) {
      return count;
    }
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findNestedFavoriteCount(item, depth + 1, seen);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  for (const value of Object.values(obj)) {
    const found = findNestedFavoriteCount(value, depth + 1, seen);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
