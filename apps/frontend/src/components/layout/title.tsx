'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
export const Title = () => {
  const path = usePathname();
  const { all: menuItems } = useMenuItem();
  const currentTitle = useMemo(() => {
    if (path?.startsWith('/adminisamazing/post-notifications')) {
      return 'Post notifications';
    }
    if (path?.startsWith('/adminisamazing/post-errors')) {
      return 'Post errors';
    }
    if (path?.startsWith('/adminisamazing/posts/')) {
      return 'Post detail';
    }
    if (path?.startsWith('/adminisamazing/posts')) {
      return 'Posts';
    }
    if (path?.startsWith('/adminisamazing/analytics')) {
      return 'Platform analytics';
    }
    if (
      path?.startsWith('/adminisamazing/user-management') ||
      path === '/adminisamazing/users'
    ) {
      return 'User management';
    }
    if (path?.startsWith('/adminisamazing/billing')) {
      return 'Billing';
    }
    if (path?.startsWith('/adminisamazing')) {
      return 'Admin';
    }
    return menuItems.find((item) => path === item.path || (item.path !== '/' && item.path !== '/dashboard' && path.startsWith(item.path)))?.name;
  }, [path]);

  return <h1 className="text-[18px] md:text-[24px] truncate">{currentTitle}</h1>;
};
