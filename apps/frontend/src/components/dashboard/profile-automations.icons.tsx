'use client';

import { FC, ReactNode } from 'react';
import clsx from 'clsx';

type SidebarIconProps = {
  size?: number;
  className?: string;
};

/** Same SVG as Profile Automations in the sidebar (`top.menu`). */
export const ProfileAutomationsIcon: FC<SidebarIconProps> = ({
  size = 21,
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/** Wraps a sidebar icon for section headers on Profile automations pages. */
export const ProfileAutomationsSectionIcon: FC<{
  children: ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={clsx(
      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-newBorder/80 bg-newBgColorInner text-textItemBlur shadow-sm',
      className
    )}
  >
    {children}
  </div>
);
