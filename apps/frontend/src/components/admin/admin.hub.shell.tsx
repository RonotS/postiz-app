'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';

const navItems: { href: string; label: string; description: string }[] = [
  {
    href: '/adminisamazing',
    label: 'Overview',
    description: 'Stats and setup',
  },
  {
    href: '/adminisamazing/user-management',
    label: 'User management',
    description: 'Directory and roles',
  },
  {
    href: '/adminisamazing/analytics',
    label: 'Analytics',
    description: 'Whole platform',
  },
  {
    href: '/adminisamazing/post-notifications',
    label: 'Post alerts',
    description: 'In-app feed',
  },
  {
    href: '/adminisamazing/post-errors',
    label: 'Post errors',
    description: 'Failures + body',
  },
  {
    href: '/adminisamazing/posts',
    label: 'Posts',
    description: 'Browse & inspect',
  },
  {
    href: '/adminisamazing/billing',
    label: 'Billing',
    description: 'Refunds and plans',
  },
];

function NavLink({
  href,
  label,
  description,
  active,
}: {
  href: string;
  label: string;
  description: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        'group rounded-xl px-3 py-2.5 sm:px-3.5 flex flex-col gap-0.5 border border-transparent transition-all duration-200 shrink-0 md:shrink',
        active
          ? 'border-white/[0.12] bg-white/[0.06] text-newTextColor shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
          : 'text-textItemBlur hover:text-newTextColor hover:bg-white/[0.04] hover:border-white/[0.08]'
      )}
    >
      <span
        className={clsx(
          'text-[13px] sm:text-[14px] font-semibold tracking-tight',
          active && 'text-newTextColor'
        )}
      >
        {label}
      </span>
      <span className="text-[11px] font-normal leading-snug opacity-80 group-hover:opacity-95">
        {description}
      </span>
    </Link>
  );
}

export function AdminHubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col md:flex-row flex-1 min-h-0 min-w-0 gap-3 md:gap-5 p-3 sm:p-4 md:p-6 relative">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 90% 50% at 50% -10%, rgba(99, 102, 241, 0.12), transparent 55%), radial-gradient(ellipse 70% 40% at 100% 80%, rgba(34, 211, 238, 0.06), transparent 50%)',
        }}
      />
      <aside className="relative z-[1] flex flex-row md:flex-col gap-2 shrink-0 md:w-[248px] overflow-x-auto md:overflow-visible pb-1 md:pb-0 md:rounded-2xl md:border md:border-white/[0.08] md:bg-newBgColorInner/55 md:backdrop-blur-md md:shadow-[0_8px_40px_-16px_rgba(0,0,0,0.5)] md:p-3 border-b md:border-b-0 border-white/[0.08]">
        <div className="hidden md:flex flex-col gap-3 mb-1 ps-1">
          <Link href="/adminisamazing" className="inline-flex w-fit" aria-label="Admin home">
            <Logo />
          </Link>
          <div className="ps-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/80">
              Control center
            </div>
            <div className="text-[16px] font-bold text-newTextColor tracking-tight mt-0.5">
              Platform admin
            </div>
          </div>
        </div>
        <Link
          href="/adminisamazing"
          className="md:hidden flex items-center shrink-0 pe-2"
          aria-label="Admin home"
        >
          <Logo />
        </Link>
        <nav className="flex flex-row md:flex-col gap-1.5 min-w-min flex-1 md:flex-none md:max-h-[calc(100vh-220px)] md:overflow-y-auto custom-scrollbar pr-0.5">
          {navItems.map((item) => {
            const active =
              item.href === '/adminisamazing'
                ? pathname === '/adminisamazing'
                : pathname === item.href ||
                  pathname === '/adminisamazing/users' ||
                  pathname?.startsWith(`${item.href}/`);
            return <NavLink key={item.href} {...item} active={active} />;
          })}
        </nav>
        <Link
          href="/dashboard"
          className="md:hidden text-[12px] font-medium text-cyan-400/90 hover:text-cyan-300 shrink-0 self-center px-2"
        >
          Main app
        </Link>
        <div className="hidden md:flex flex-col gap-2 mt-auto pt-4 border-t border-white/[0.08]">
          <Link
            href="/dashboard"
            className="text-[13px] font-medium text-cyan-400/90 hover:text-cyan-300 ps-1 transition-colors"
          >
            ← Back to main app
          </Link>
          <p className="text-[11px] text-textItemBlur leading-snug ps-1 opacity-90">
            Impersonation, import debug, and announcements stay on standard pages (top purple
            bar).
          </p>
        </div>
      </aside>
      <div className="relative z-[1] flex-1 min-w-0 min-h-0 overflow-auto rounded-2xl md:rounded-3xl border border-white/[0.08] bg-newBgColorInner/25 md:bg-newBgColorInner/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
        <div className="min-h-full">{children}</div>
      </div>
    </div>
  );
}
