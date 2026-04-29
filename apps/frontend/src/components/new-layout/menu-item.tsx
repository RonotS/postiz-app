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
  const isActive = currentPath === path || (path !== '/' && currentPath.startsWith(path));

  const className = clsx(
    'w-full minCustom:h-[52px] custom:h-[32px] py-[8px] px-[12px] gap-[12px] flex flex-row md:flex-col items-center justify-start md:justify-center rounded-[12px] hover:text-textItemFocused hover:bg-boxFocused transition-all duration-200',
    isActive ? 'text-textItemFocused bg-boxFocused' : 'text-textItemBlur'
  );

  if (onClick) {
    return (
      <button onClick={onClick} className={className}>
        <div className="flex-shrink-0">{icon}</div>
        <div className="text-[14px] md:text-[10px] font-[500]">{label}</div>
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
      <div className="text-[14px] md:text-[9px] font-[500] text-start md:text-center leading-[1] truncate flex-1 md:w-full">{label}</div>
    </Link>
  );
};
