import {
  DEFAULT_EXPLORER_ADVANCED_FILTERS,
  isDefaultProfilePicture,
  isLikelyFakeOrSpam,
  matchesAdvancedExplorerFilters,
} from '@gitroom/frontend/components/dashboard/follower-explorer-advanced-filters';
import type { FollowerListUser } from '@gitroom/frontend/components/dashboard/follower-list-filters';

const baseUser = (patch: Partial<FollowerListUser> = {}): FollowerListUser => ({
  id: '1',
  name: 'Test User',
  username: 'testuser',
  picture: 'https://pbs.twimg.com/profile_images/real/photo.jpg',
  publicMetrics: {
    followersCount: 100,
    followingCount: 50,
    tweetCount: 200,
  },
  createdAt: '2020-01-15T00:00:00.000Z',
  verified: false,
  protected: false,
  location: 'New York',
  description: 'hello world',
  ...patch,
});

describe('matchesAdvancedExplorerFilters', () => {
  it('passes when all filters are default', () => {
    expect(
      matchesAdvancedExplorerFilters(
        baseUser(),
        DEFAULT_EXPLORER_ADVANCED_FILTERS
      )
    ).toBe(true);
  });

  it('filters by follower count range', () => {
    const filters = {
      ...DEFAULT_EXPLORER_ADVANCED_FILTERS,
      followersMin: '50',
      followersMax: '150',
    };
    expect(matchesAdvancedExplorerFilters(baseUser(), filters)).toBe(true);
    expect(
      matchesAdvancedExplorerFilters(
        baseUser({ publicMetrics: { followersCount: 10, followingCount: 1, tweetCount: 1 } }),
        filters
      )
    ).toBe(false);
  });

  it('filters eggheads include only', () => {
    const filters = {
      ...DEFAULT_EXPLORER_ADVANCED_FILTERS,
      egghead: 'include' as const,
    };
    expect(
      matchesAdvancedExplorerFilters(
        baseUser({ picture: 'https://abs.twimg.com/sticky/default_profile_normal.png' }),
        filters
      )
    ).toBe(true);
    expect(matchesAdvancedExplorerFilters(baseUser(), filters)).toBe(false);
  });

  it('filters bio search', () => {
    const filters = {
      ...DEFAULT_EXPLORER_ADVANCED_FILTERS,
      bioSearch: 'crypto',
    };
    expect(
      matchesAdvancedExplorerFilters(
        baseUser({ description: 'I love crypto' }),
        filters
      )
    ).toBe(true);
    expect(matchesAdvancedExplorerFilters(baseUser(), filters)).toBe(false);
  });

  it('detects default profile pictures', () => {
    expect(isDefaultProfilePicture(undefined)).toBe(true);
    expect(
      isDefaultProfilePicture(
        'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'
      )
    ).toBe(true);
    expect(
      isDefaultProfilePicture('https://pbs.twimg.com/profile_images/abc/photo.jpg')
    ).toBe(false);
  });

  it('detects likely spam patterns', () => {
    expect(
      isLikelyFakeOrSpam(
        baseUser({
          publicMetrics: { followersCount: 5, followingCount: 2000, tweetCount: 2 },
        })
      )
    ).toBe(true);
  });
});
