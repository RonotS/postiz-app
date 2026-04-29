'use client';

import React, { useState } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
import { MenuItem } from '@gitroom/frontend/components/new-layout/menu-item';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import clsx from 'clsx';

export const MobileDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { all } = useMenuItem();
  const user = useUser();

  if (!user) return null;

  return (
    <>
      {/* Hamburger Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className="md:hidden p-2 text-textItemBlur hover:text-newTextColor"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[100] md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sliding Sidebar */}
      <div className={clsx(
        "fixed top-0 left-0 h-full w-[280px] bg-newBgColorInner z-[101] shadow-2xl transition-transform duration-300 ease-in-out md:hidden flex flex-col p-6 gap-8",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex justify-between items-center">
          <Logo />
          <button onClick={() => setIsOpen(false)} className="text-textItemBlur">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 scrollbar-none">
          {all.map((item) => (
            <div key={item.name} onClick={() => setIsOpen(false)}>
              <MenuItem
                path={item.path}
                label={item.name}
                icon={item.icon}
                onClick={item.onClick}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
