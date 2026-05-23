'use client';

import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';

const BRAND = 'TweetMax';
const TAGLINE = 'Maximize Your 𝕏 Engagement';

function pageLabel(path: string | null, menuName?: string): string {
  if (!path) return 'Dashboard';

  if (path.startsWith('/adminisamazing/post-notifications')) return 'Post notifications';
  if (path.startsWith('/adminisamazing/post-errors')) return 'Post errors';
  if (path.startsWith('/adminisamazing/posts/')) return 'Post detail';
  if (path.startsWith('/adminisamazing/posts')) return 'Posts';
  if (path.startsWith('/adminisamazing/analytics')) return 'Platform analytics';
  if (
    path.startsWith('/adminisamazing/user-management') ||
    path === '/adminisamazing/users'
  ) {
    return 'User management';
  }
  if (path.startsWith('/adminisamazing/billing')) return 'Billing';
  if (path.startsWith('/adminisamazing/stripe-test')) return 'Stripe test';
  if (path === '/adminisamazing') return 'Overview';
  if (path.startsWith('/adminisamazing')) return 'Admin';

  if (path === '/dashboard' || path === '/') return 'Dashboard';
  if (path.startsWith('/dashboard/tweet-automations')) return 'Tweet Automations';
  if (path.startsWith('/dashboard/followers')) return 'Followers';
  if (path.startsWith('/dashboard/profile-automations')) return 'Profile Automations';
  if (path.startsWith('/settings')) return 'Settings';
  if (path.startsWith('/launches')) return 'Calendar';
  if (path.startsWith('/analytics')) return 'Analytics';
  if (path.startsWith('/media')) return 'Media';
  if (path.startsWith('/billing')) return 'Billing';
  if (path === '/subscribe' || path.startsWith('/subscribe/')) return 'Subscribe';

  return menuName || 'Dashboard';
}

export function DocumentTitle(): null {
  const path = usePathname();
  const { all: menuItems } = useMenuItem();

  const menuName = useMemo(
    () =>
      menuItems.find(
        (item) =>
          path === item.path ||
          (item.path !== '/' &&
            item.path !== '/dashboard' &&
            path?.startsWith(item.path))
      )?.name,
    [path, menuItems]
  );

  const title = useMemo(() => {
    const label = pageLabel(path, menuName);
    return `${BRAND} | ${label} — ${TAGLINE}`;
  }, [path, menuName]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}
