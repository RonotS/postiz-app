'use client';

import React from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
import { MenuItem } from '@gitroom/frontend/components/new-layout/menu-item';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

export const MobileMenu = () => {
  const { all } = useMenuItem();
  const { billingEnabled } = useVariables();
  const user = useUser();

  if (!user) return null;

  // Filter items to show only the most important ones for the bottom bar
  const mobileItems = all.filter(item => 
    ['Home', 'Calendar', 'Launches', 'Analytics', 'Settings', 'Media'].includes(item.name)
  ).slice(0, 5); // Limit to 5 items for bottom bar

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-[64px] bg-newBgColorInner border-t border-blockSeparator z-[50] flex items-center justify-around px-2 pb-safe">
      {mobileItems.map((item) => (
        <div key={item.name} className="flex-1 max-w-[70px]">
          <MenuItem
            path={item.path}
            label={item.name}
            icon={item.icon}
            onClick={item.onClick}
          />
        </div>
      ))}
    </div>
  );
};
