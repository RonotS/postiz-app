'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
export const Title = () => {
  const path = usePathname();
  const { all: menuItems } = useMenuItem();
  const currentTitle = useMemo(() => {
    return menuItems.find((item) => path === item.path || (item.path !== '/' && item.path !== '/dashboard' && path.startsWith(item.path)))?.name;
  }, [path]);

  return <h1>{currentTitle}</h1>;
};
