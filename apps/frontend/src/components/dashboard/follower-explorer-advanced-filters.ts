import type { FollowerListUser } from '@gitroom/frontend/components/dashboard/follower-list-filters';
import {
  getFollowRatio,
  getUserEngagement,
  metric,
} from '@gitroom/frontend/components/dashboard/follower-list-filters';

export type TriFilter = 'any' | 'include' | 'exclude';

export type VerificationFilter = 'any' | 'verified' | 'not_verified';

export type ExplorerAdvancedFilters = {
  egghead: TriFilter;
  protected: TriFilter;
  fakeSpam: TriFilter;
  inactive: TriFilter;
  overactive: TriFilter;
  verification: VerificationFilter;
  bioSearch: string;
  followersMin: string;
  followersMax: string;
  followingMin: string;
  followingMax: string;
  tweetsMin: string;
  tweetsMax: string;
  ratioMin: string;
  ratioMax: string;
  joinEarliest: string;
  joinLatest: string;
  location: string;
};

export const DEFAULT_EXPLORER_ADVANCED_FILTERS: ExplorerAdvancedFilters = {
  egghead: 'any',
  protected: 'any',
  fakeSpam: 'any',
  inactive: 'any',
  overactive: 'any',
  verification: 'any',
  bioSearch: '',
  followersMin: '',
  followersMax: '',
  followingMin: '',
  followingMax: '',
  tweetsMin: '',
  tweetsMax: '',
  ratioMin: '',
  ratioMax: '',
  joinEarliest: '',
  joinLatest: '',
  location: '',
};

function parseOptionalNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalDate(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const ms = new Date(t).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

export function isDefaultProfilePicture(picture?: string): boolean {
  if (!picture?.trim()) return true;
  const p = picture.toLowerCase();
  return (
    p.includes('default_profile') ||
    p.includes('default_profile_images') ||
    p.endsWith('/default_profile_normal.png') ||
    p.endsWith('/default_profile_400x400.png')
  );
}

export function isProtectedAccount(user: FollowerListUser): boolean {
  return user.protected === true;
}

export function isLikelyFakeOrSpam(user: FollowerListUser): boolean {
  const followers = metric(user, 'followersCount');
  const following = metric(user, 'followingCount');
  const tweets = metric(user, 'tweetCount');
  if (following >= 1500 && followers < 30) return true;
  if (following >= 500 && followers > 0 && following / followers >= 15) return true;
  if (tweets < 5 && following >= 400) return true;
  const name = (user.name || '').toLowerCase();
  if (/^\d+$/.test((user.username || '').replace(/@/g, ''))) return true;
  if (name.includes('crypto') && followers < 100 && following > 800) return true;
  return false;
}

export function isInactiveAccount(user: FollowerListUser): boolean {
  return getUserEngagement(user).level === 'inactive';
}

export function isOveractiveAccount(user: FollowerListUser): boolean {
  const tweets = metric(user, 'tweetCount');
  const following = metric(user, 'followingCount');
  return tweets >= 8000 || following >= 7500;
}

function applyTriFilter(
  value: boolean,
  mode: TriFilter
): boolean {
  if (mode === 'any') return true;
  if (mode === 'include') return value;
  return !value;
}

function inNumericRange(
  value: number,
  minRaw: string,
  maxRaw: string
): boolean {
  const min = parseOptionalNumber(minRaw);
  const max = parseOptionalNumber(maxRaw);
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function matchesBioSearch(user: FollowerListUser, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    user.name,
    user.username,
    user.description,
    user.location,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function matchesJoinDate(
  user: FollowerListUser,
  earliest: string,
  latest: string
): boolean {
  const start = parseOptionalDate(earliest);
  const end = parseOptionalDate(latest);
  if (start === undefined && end === undefined) return true;
  if (!user.createdAt) return false;
  const ms = new Date(user.createdAt).getTime();
  if (Number.isNaN(ms)) return false;
  if (start !== undefined && ms < start) return false;
  if (end !== undefined) {
    const endOfDay = end + 24 * 60 * 60 * 1000 - 1;
    if (ms > endOfDay) return false;
  }
  return true;
}

function matchesLocation(user: FollowerListUser, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (user.location || '').toLowerCase().includes(q);
}

export function matchesAdvancedExplorerFilters(
  user: FollowerListUser,
  filters: ExplorerAdvancedFilters
): boolean {
  if (
    !applyTriFilter(isDefaultProfilePicture(user.picture), filters.egghead)
  ) {
    return false;
  }
  if (!applyTriFilter(isProtectedAccount(user), filters.protected)) {
    return false;
  }
  if (!applyTriFilter(isLikelyFakeOrSpam(user), filters.fakeSpam)) {
    return false;
  }
  if (!applyTriFilter(isInactiveAccount(user), filters.inactive)) {
    return false;
  }
  if (!applyTriFilter(isOveractiveAccount(user), filters.overactive)) {
    return false;
  }

  if (filters.verification === 'verified' && !user.verified) return false;
  if (filters.verification === 'not_verified' && user.verified) return false;

  if (!matchesBioSearch(user, filters.bioSearch)) return false;
  if (!matchesLocation(user, filters.location)) return false;
  if (
    !matchesJoinDate(user, filters.joinEarliest, filters.joinLatest)
  ) {
    return false;
  }

  const followers = metric(user, 'followersCount');
  const following = metric(user, 'followingCount');
  const tweets = metric(user, 'tweetCount');
  const ratio = getFollowRatio(user);

  if (
    !inNumericRange(
      followers,
      filters.followersMin,
      filters.followersMax
    )
  ) {
    return false;
  }
  if (
    !inNumericRange(
      following,
      filters.followingMin,
      filters.followingMax
    )
  ) {
    return false;
  }
  if (!inNumericRange(tweets, filters.tweetsMin, filters.tweetsMax)) {
    return false;
  }
  if (!inNumericRange(ratio, filters.ratioMin, filters.ratioMax)) {
    return false;
  }

  return true;
}

export function countActiveAdvancedFilters(
  filters: ExplorerAdvancedFilters
): number {
  let n = 0;
  if (filters.egghead !== 'any') n++;
  if (filters.protected !== 'any') n++;
  if (filters.fakeSpam !== 'any') n++;
  if (filters.inactive !== 'any') n++;
  if (filters.overactive !== 'any') n++;
  if (filters.verification !== 'any') n++;
  if (filters.bioSearch.trim()) n++;
  if (filters.location.trim()) n++;
  if (filters.followersMin.trim() || filters.followersMax.trim()) n++;
  if (filters.followingMin.trim() || filters.followingMax.trim()) n++;
  if (filters.tweetsMin.trim() || filters.tweetsMax.trim()) n++;
  if (filters.ratioMin.trim() || filters.ratioMax.trim()) n++;
  if (filters.joinEarliest.trim() || filters.joinLatest.trim()) n++;
  return n;
}
