'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { MenuItem } from '@gitroom/frontend/components/new-layout/menu-item';

export type AdminNavEntry = {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
};

const iconClass = 'text-current';

const IconOverview = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <rect width="7" height="9" x="3" y="3" rx="1" />
    <rect width="7" height="5" x="14" y="3" rx="1" />
    <rect width="7" height="9" x="14" y="12" rx="1" />
    <rect width="7" height="5" x="3" y="16" rx="1" />
  </svg>
);

const IconUsers = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconChart = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
  </svg>
);

const IconBell = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const IconAlert = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const IconPosts = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" x2="8" y1="13" y2="13" />
    <line x1="16" x2="8" y1="17" y2="17" />
    <line x1="10" x2="8" y1="9" y2="9" />
  </svg>
);

const IconBilling = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <rect width="20" height="14" x="2" y="5" rx="2" />
    <line x1="2" x2="22" y1="10" y2="10" />
  </svg>
);

const IconAutomations = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <path d="M12 2v4" />
    <path d="M12 18v4" />
    <path d="M4.93 4.93l2.83 2.83" />
    <path d="M16.24 16.24l2.83 2.83" />
    <path d="M2 12h4" />
    <path d="M18 12h4" />
    <path d="M4.93 19.07l2.83-2.83" />
    <path d="M16.24 7.76l2.83-2.83" />
  </svg>
);

const IconStripeTest = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M12 18v-6" />
    <path d="M9 15h6" />
  </svg>
);

export const ADMIN_NAV: AdminNavEntry[] = [
  {
    href: '/adminisamazing',
    label: 'Overview',
    description: 'Stats and setup',
    icon: <IconOverview />,
  },
  {
    href: '/adminisamazing/user-management',
    label: 'Users',
    description: 'Directory & roles',
    icon: <IconUsers />,
  },
  {
    href: '/adminisamazing/analytics',
    label: 'Analytics',
    description: 'Platform metrics',
    icon: <IconChart />,
  },
  {
    href: '/adminisamazing/post-notifications',
    label: 'Alerts',
    description: 'In-app feed',
    icon: <IconBell />,
  },
  {
    href: '/adminisamazing/post-errors',
    label: 'Errors',
    description: 'Failures',
    icon: <IconAlert />,
  },
  {
    href: '/adminisamazing/posts',
    label: 'Posts',
    description: 'Browse & inspect',
    icon: <IconPosts />,
  },
  {
    href: '/adminisamazing/automation-pages',
    label: 'Automations',
    description: 'Page visibility',
    icon: <IconAutomations />,
  },
  {
    href: '/adminisamazing/billing',
    label: 'Billing',
    description: 'Plans & refunds',
    icon: <IconBilling />,
  },
  {
    href: '/adminisamazing/stripe-test',
    label: 'Stripe test',
    description: 'API & test checkout',
    icon: <IconStripeTest />,
  },
];

function isAdminNavActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/adminisamazing') {
    return pathname === '/adminisamazing';
  }
  if (href === '/adminisamazing/user-management') {
    return pathname === href || pathname.startsWith('/adminisamazing/users');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminHubSidebar() {
  const pathname = usePathname();
  return (
    <div className="flex flex-col h-full gap-[28px] flex-1 min-w-0 max-w-full py-[12px] px-[8px]">
      <div className="flex items-center justify-start ps-[12px] min-w-0">
        <Link href="/adminisamazing" className="inline-flex min-w-0" aria-label="Admin home">
          <Logo />
        </Link>
      </div>
      <div className="flex flex-col gap-[2px] min-w-0">
        <p className="ps-[12px] pe-1 text-[10px] font-semibold uppercase tracking-wider text-newTableText/90 mb-1">
          Admin
        </p>
        {ADMIN_NAV.map((item) => (
          <MenuItem
            key={item.href}
            path={item.href}
            label={item.label}
            icon={item.icon}
            active={isAdminNavActive(pathname, item.href)}
          />
        ))}
      </div>
      <div className="mt-auto pt-3 border-t border-newBorder min-w-0">
        <Link
          href="/dashboard"
          className="block mx-[4px] rounded-[10px] px-[10px] py-2 text-[12px] font-medium text-textItemBlur hover:text-newTextColor hover:bg-boxFocused transition-colors"
        >
          ← Main app
        </Link>
        <p className="mt-2 px-[10px] text-[10px] text-newTableText leading-snug">
          Impersonation and announcements use the main app chrome.
        </p>
      </div>
    </div>
  );
}

/** Mobile / sm: compact path trail under the top bar */
export function AdminHubBreadcrumbs() {
  const pathname = usePathname();
  if (!pathname?.startsWith('/adminisamazing')) return null;

  const labelMap: Record<string, string> = {
    'user-management': 'Users',
    users: 'Users',
    analytics: 'Analytics',
    'post-notifications': 'Alerts',
    'post-errors': 'Errors',
    posts: 'Posts',
    billing: 'Billing',
    'automation-pages': 'Automations',
    'stripe-test': 'Stripe test',
  };

  const crumbs: { label: string; href?: string }[] = [
    { label: 'Admin', href: '/adminisamazing' },
  ];

  if (pathname === '/adminisamazing') {
    crumbs.push({ label: 'Overview' });
  } else {
    const rest = pathname.replace(/^\/adminisamazing\/?/, '');
    const segments = rest.split('/').filter(Boolean);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const label =
        labelMap[seg] || (seg.length > 12 ? `${seg.slice(0, 10)}…` : seg);
      const hrefPath = `/adminisamazing/${segments.slice(0, i + 1).join('/')}`;
      const isLast = i === segments.length - 1;
      crumbs.push({ label, href: isLast ? undefined : hrefPath });
    }
  }

  return (
    <nav className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px]" aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <Fragment key={`${c.label}-${i}`}>
          {i > 0 && (
            <span className="text-newTableText/50 select-none px-0.5" aria-hidden>
              /
            </span>
          )}
          {c.href ? (
            <Link
              href={c.href}
              className="text-textItemBlur hover:text-newTextColor font-medium truncate max-w-[min(140px,40vw)]"
            >
              {c.label}
            </Link>
          ) : (
            <span className="text-newTextColor font-semibold truncate max-w-[min(180px,55vw)]">
              {c.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

export function AdminHubMobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[100] md:hidden backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />
      <div
        className={clsx(
          'fixed top-0 left-0 h-full w-[280px] max-w-[90vw] z-[101] md:hidden flex flex-col',
          'bg-newBgColorInner border-r border-newBorder shadow-2xl transition-transform duration-200'
        )}
      >
        <div className="flex justify-between items-center p-4 border-b border-newBorder shrink-0">
          <Link href="/adminisamazing" onClick={onClose} aria-label="Admin home">
            <Logo />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-textItemBlur hover:text-newTextColor hover:bg-boxFocused"
            aria-label="Close menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {ADMIN_NAV.map((item) => {
            const active = isAdminNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  'rounded-[12px] px-3 py-2.5 flex flex-col gap-0.5 transition-colors',
                  active
                    ? 'bg-boxFocused text-newTextColor'
                    : 'text-textItemBlur hover:bg-boxFocused/60 hover:text-newTextColor'
                )}
              >
                <span className="text-[14px] font-semibold">{item.label}</span>
                <span className="text-[11px] opacity-80">{item.description}</span>
              </Link>
            );
          })}
          <Link
            href="/dashboard"
            onClick={onClose}
            className="mt-4 rounded-[12px] px-3 py-2 text-[13px] font-medium text-textItemBlur border border-newBorder hover:bg-boxFocused"
          >
            ← Main app
          </Link>
        </div>
      </div>
    </>
  );
}

export function AdminHubMenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="md:hidden p-2 -ms-1 rounded-lg text-textItemBlur hover:text-newTextColor hover:bg-boxFocused shrink-0"
      aria-label="Open admin menu"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" x2="20" y1="12" y2="12" />
        <line x1="4" x2="20" y1="6" y2="6" />
        <line x1="4" x2="20" y1="18" y2="18" />
      </svg>
    </button>
  );
}
