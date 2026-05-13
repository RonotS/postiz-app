'use client';
import { FC, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';

export const MenuItem: FC<{ label: string; icon: ReactNode; path: string; onClick?: () => void }> = ({
  label,
  icon,
  path,
  onClick,
}) => {
  const currentPath = usePathname();
  // Home is exactly `/dashboard` so `/dashboard/followers` does not stay highlighted on Home.
  const isActive =
    path === '/dashboard'
      ? currentPath === '/dashboard'
      : currentPath === path ||
        (path.length > 1 && currentPath.startsWith(path.endsWith('/') ? path : `${path}/`));

  const className = clsx(
    'w-full min-h-[44px] py-[8px] px-[12px] gap-[12px] flex flex-row items-center justify-start rounded-[12px] hover:text-textItemFocused hover:bg-boxFocused transition-all duration-200',
    isActive ? 'text-textItemFocused bg-boxFocused' : 'text-textItemBlur'
  );

  if (onClick) {
    return (
      <button onClick={onClick} className={className}>
        <div className="flex-shrink-0">{icon}</div>
        <div className="text-[14px] font-[500] text-start leading-[1.2] flex-1 truncate">{label}</div>
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
      <div className="text-[14px] font-[500] text-start leading-[1.2] flex-1 truncate">{label}</div>
    </Link>
  );
};
