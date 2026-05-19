'use client';
import { FC, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';

export const MenuItem: FC<{
  label: string;
  icon: ReactNode;
  path: string;
  onClick?: () => void;
  /** When set, overrides pathname-based active state (e.g. admin aliases). */
  active?: boolean;
  /** Visible but non-interactive (grayed out). */
  disabled?: boolean;
}> = ({
  label,
  icon,
  path,
  onClick,
  active: activeProp,
  disabled = false,
}) => {
  const currentPath = usePathname();
  // Home is exactly `/dashboard` so child routes (e.g. followers, tweet-automations) do not highlight Home.
  const isActive =
    activeProp !== undefined
      ? activeProp
      : path === '/dashboard'
        ? currentPath === '/dashboard'
        : currentPath === path ||
          (path.length > 1 &&
            currentPath.startsWith(path.endsWith('/') ? path : `${path}/`));

  const className = clsx(
    // min-w-0 so flex children can shrink and truncate works inside the narrow sidebar
    'w-full max-w-full min-w-0 min-h-[44px] py-[8px] px-[12px] gap-[12px] flex flex-row items-center justify-start rounded-[12px] transition-all duration-200',
    disabled
      ? 'text-textItemBlur opacity-40 grayscale cursor-not-allowed pointer-events-none'
      : clsx(
          'hover:text-textItemFocused hover:bg-boxFocused',
          isActive ? 'text-textItemFocused bg-boxFocused' : 'text-textItemBlur'
        )
  );

  if (disabled) {
    return (
      <div aria-disabled="true" className={className}>
        <div className="flex-shrink-0">{icon}</div>
        <div className="text-[14px] font-[500] text-start leading-[1.2] flex-1 min-w-0 truncate">
          {label}
        </div>
      </div>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <div className="flex-shrink-0">{icon}</div>
        <div className="text-[14px] font-[500] text-start leading-[1.2] flex-1 min-w-0 truncate">
          {label}
        </div>
      </button>
    );
  }

  return (
    <Link
      prefetch={true}
      href={path}
      {...path.indexOf('http') === 0 && { target: '_blank' }}
      className={className}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="text-[14px] font-[500] text-start leading-[1.2] flex-1 min-w-0 truncate">
        {label}
      </div>
    </Link>
  );
};
