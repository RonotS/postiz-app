export type FollowerPublicMetrics = {
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  listedCount?: number;
};

export type FollowerListUser = {
  id: string;
  name: string;
  username: string;
  picture?: string;
  alreadyFollowing?: boolean;
  publicMetrics?: FollowerPublicMetrics;
  createdAt?: string;
  verified?: boolean;
};

export type FollowerListFilter =
  | 'all'
  | 'i_follow'
  | 'low_engagement'
  | 'inactive'
  | 'low_followers';

export type EngagementLevel =
  | 'inactive'
  | 'low'
  | 'moderate'
  | 'active'
  | 'high';

export type EngagementFilter = 'all' | EngagementLevel;

export type FollowerListSort =
  | 'api'
  | 'lowest_followers'
  | 'lowest_tweets'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'tweets_asc'
  | 'tweets_desc'
  | 'joined_asc'
  | 'joined_desc'
  | 'following_asc'
  | 'following_desc'
  | 'followers_asc'
  | 'followers_desc'
  | 'ratio_asc'
  | 'ratio_desc';

export type SpreadsheetColumn =
  | 'name'
  | 'tweets'
  | 'joined'
  | 'following'
  | 'followers'
  | 'ratio'
  | 'engagement';

const LOW_ENGAGEMENT_MAX_FOLLOWERS = 500;
const LOW_ENGAGEMENT_MAX_TWEETS = 50;
const INACTIVE_MAX_TWEETS = 10;
const LOW_FOLLOWERS_MAX = 100;

function metric(
  user: FollowerListUser,
  key: keyof FollowerPublicMetrics
): number {
  return user.publicMetrics?.[key] ?? 0;
}

export function getFollowRatio(user: FollowerListUser): number {
  const following = metric(user, 'followingCount');
  const followers = metric(user, 'followersCount');
  if (following <= 0) return followers > 0 ? followers : 0;
  return followers / following;
}

export function getUserEngagement(user: FollowerListUser): {
  level: EngagementLevel;
  label: string;
  description: string;
} {
  const tweets = metric(user, 'tweetCount');
  const followers = metric(user, 'followersCount');

  if (tweets < INACTIVE_MAX_TWEETS) {
    return {
      level: 'inactive',
      label: 'Inactive',
      description: 'Low Engagement user',
    };
  }
  if (tweets < LOW_ENGAGEMENT_MAX_TWEETS && followers < LOW_ENGAGEMENT_MAX_FOLLOWERS) {
    return {
      level: 'low',
      label: 'Low Active',
      description: 'Low Engagement user',
    };
  }
  if (tweets < 200 || followers < 1000) {
    return {
      level: 'moderate',
      label: 'Moderate Active',
      description: 'Medium Engagement user',
    };
  }
  if (tweets < 1000) {
    return {
      level: 'active',
      label: 'Active',
      description: 'High Engagement user',
    };
  }
  return {
    level: 'high',
    label: 'Highly Active',
    description: 'High Engagement user',
  };
}

export function formatJoinedAgo(createdAt?: string): string {
  if (!createdAt) return '—';
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '—';
  const days = Math.floor(
    (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days < 1) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days.toLocaleString()} days ago`;
}

export function formatFollowRatio(user: FollowerListUser): string {
  const ratio = getFollowRatio(user);
  if (!metric(user, 'followingCount') && !metric(user, 'followersCount')) {
    return '—';
  }
  return ratio.toFixed(3);
}

export function matchesFollowerFilter(
  user: FollowerListUser,
  filter: FollowerListFilter
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'i_follow':
      return !!user.alreadyFollowing;
    case 'low_engagement':
      return (
        !!user.alreadyFollowing &&
        metric(user, 'followersCount') < LOW_ENGAGEMENT_MAX_FOLLOWERS &&
        metric(user, 'tweetCount') < LOW_ENGAGEMENT_MAX_TWEETS
      );
    case 'inactive':
      return (
        !!user.alreadyFollowing && metric(user, 'tweetCount') < INACTIVE_MAX_TWEETS
      );
    case 'low_followers':
      return (
        !!user.alreadyFollowing &&
        metric(user, 'followersCount') < LOW_FOLLOWERS_MAX
      );
    default:
      return true;
  }
}

export function matchesEngagementFilter(
  user: FollowerListUser,
  engagement: EngagementFilter
): boolean {
  if (engagement === 'all') return true;
  return getUserEngagement(user).level === engagement;
}

export function matchesTableSearch(
  user: FollowerListUser,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = (user.name || '').toLowerCase();
  const username = (user.username || '').toLowerCase();
  return name.includes(q) || username.includes(q) || `@${username}`.includes(q);
}

export function sortFollowerList(
  users: FollowerListUser[],
  sort: FollowerListSort
): FollowerListUser[] {
  if (sort === 'api') {
    return users;
  }
  const copy = [...users];
  copy.sort((a, b) => {
    switch (sort) {
      case 'lowest_followers':
        return metric(a, 'followersCount') - metric(b, 'followersCount');
      case 'lowest_tweets':
        return metric(a, 'tweetCount') - metric(b, 'tweetCount');
      case 'oldest': {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
        return ta - tb;
      }
      case 'name_asc':
        return (a.username || a.name).localeCompare(b.username || b.name);
      case 'name_desc':
        return (b.username || b.name).localeCompare(a.username || a.name);
      case 'tweets_asc':
        return metric(a, 'tweetCount') - metric(b, 'tweetCount');
      case 'tweets_desc':
        return metric(b, 'tweetCount') - metric(a, 'tweetCount');
      case 'joined_asc': {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
        return ta - tb;
      }
      case 'joined_desc': {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      }
      case 'following_asc':
        return metric(a, 'followingCount') - metric(b, 'followingCount');
      case 'following_desc':
        return metric(b, 'followingCount') - metric(a, 'followingCount');
      case 'followers_asc':
        return metric(a, 'followersCount') - metric(b, 'followersCount');
      case 'followers_desc':
        return metric(b, 'followersCount') - metric(a, 'followersCount');
      case 'ratio_asc':
        return getFollowRatio(a) - getFollowRatio(b);
      case 'ratio_desc':
        return getFollowRatio(b) - getFollowRatio(a);
      default:
        return 0;
    }
  });
  return copy;
}

export function columnToSort(
  column: SpreadsheetColumn,
  direction: 'asc' | 'desc'
): FollowerListSort {
  const map: Record<SpreadsheetColumn, [FollowerListSort, FollowerListSort]> = {
    name: ['name_asc', 'name_desc'],
    tweets: ['tweets_asc', 'tweets_desc'],
    joined: ['joined_asc', 'joined_desc'],
    following: ['following_asc', 'following_desc'],
    followers: ['followers_asc', 'followers_desc'],
    ratio: ['ratio_asc', 'ratio_desc'],
    engagement: ['lowest_tweets', 'tweets_desc'],
  };
  const [asc, desc] = map[column];
  return direction === 'asc' ? asc : desc;
}

export function sortFromColumn(
  column: SpreadsheetColumn | null,
  direction: 'asc' | 'desc'
): FollowerListSort {
  if (!column) return 'api';
  return columnToSort(column, direction);
}

export type ExplorerListVisibility = {
  hideWhitelisted: boolean;
  hideBlacklisted: boolean;
};

export function filterAndSortFollowers(
  users: FollowerListUser[],
  filter: FollowerListFilter,
  sort: FollowerListSort,
  options?: {
    engagement?: EngagementFilter;
    tableSearch?: string;
    whitelist?: Set<string>;
    blacklist?: Set<string>;
    visibility?: ExplorerListVisibility;
  }
): FollowerListUser[] {
  const engagement = options?.engagement ?? 'all';
  const tableSearch = options?.tableSearch ?? '';
  const whitelist = options?.whitelist;
  const blacklist = options?.blacklist;
  const visibility = options?.visibility ?? {
    hideWhitelisted: false,
    hideBlacklisted: true,
  };

  const filtered = users.filter((u) => {
    if (!matchesFollowerFilter(u, filter)) return false;
    if (!matchesEngagementFilter(u, engagement)) return false;
    if (!matchesTableSearch(u, tableSearch)) return false;
    const isWhitelisted = whitelist?.has(u.id);
    const isBlacklisted = blacklist?.has(u.id);
    if (visibility.hideWhitelisted && isWhitelisted) return false;
    if (visibility.hideBlacklisted && isBlacklisted) return false;
    return true;
  });
  return sortFollowerList(filtered, sort);
}

export function formatFollowerMetrics(user: FollowerListUser): string {
  const m = user.publicMetrics;
  if (!m) return '';
  const parts: string[] = [];
  parts.push(`${m.followersCount.toLocaleString()} followers`);
  parts.push(`${m.tweetCount.toLocaleString()} posts`);
  if (m.followingCount > 0) {
    parts.push(`${m.followingCount.toLocaleString()} following`);
  }
  return parts.join(' · ');
}
