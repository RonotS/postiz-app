'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';

/** Consistent horizontal layout for every admin route. */
export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'w-full max-w-[1240px] mx-auto pb-12 sm:pb-14 px-3 sm:px-5 md:px-6',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Top-of-page title band with soft gradient (matches product dark theme). */
export function AdminHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative mb-8 sm:mb-10 overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[rgb(24_24_32)]/95 via-newBgColorInner to-newBgColorInner shadow-[0_24px_48px_-28px_rgba(0,0,0,0.55)]">
      <div
        className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full opacity-35 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.22) 0%, transparent 70%)' }}
      />
      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <p className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-300/90">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-[22px] sm:text-[30px] font-bold tracking-tight text-newTextColor leading-[1.15]">
          {title}
        </h2>
        {description ? (
          <div className="mt-3 max-w-[78ch] text-[14px] sm:text-[15px] text-textItemBlur leading-relaxed">
            {description}
          </div>
        ) : null}
        {children ? <div className="mt-5 flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

/** Card / panel with depth. */
export function AdminSurface({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl bg-newBgColorInner/70 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.45)]',
        padding && 'p-4 sm:p-6',
        className
      )}
    >
      {children}
    </div>
  );
}

export function AdminSectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={clsx(
        'text-[13px] sm:text-[14px] font-bold uppercase tracking-[0.12em] text-newTextColor/95',
        className
      )}
    >
      {children}
    </h3>
  );
}

export function AdminAlert({
  variant,
  children,
}: {
  variant: 'info' | 'success' | 'warning' | 'error';
  children: ReactNode;
}) {
  const map = {
    info: 'border border-white/[0.1] bg-cyan-950/25 text-cyan-50/95',
    success: 'border border-white/[0.1] bg-emerald-950/20 text-emerald-50/95',
    warning: 'border border-white/[0.1] bg-amber-950/25 text-amber-50/95',
    error: 'border border-white/[0.1] bg-rose-950/30 text-rose-50/95',
  } as const;
  return (
    <div
      className={clsx('rounded-xl px-4 py-3.5 text-[14px] leading-relaxed shadow-sm', map[variant])}
      role="status"
    >
      {children}
    </div>
  );
}

export function AdminBadgeYesNo({ value }: { value: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold border border-white/[0.12]',
        value ? 'bg-emerald-500/15 text-emerald-200' : 'bg-newBgLineColor/60 text-textItemBlur'
      )}
    >
      {value ? 'Yes' : 'No'}
    </span>
  );
}

export const adminTableWrap =
  'overflow-x-auto rounded-xl sm:rounded-2xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] shadow-inner bg-black/10';

export const adminTable = 'w-full text-left text-[13px] text-newTextColor border-collapse';

export const adminTh =
  'px-3 sm:px-4 py-3 font-semibold text-[10px] sm:text-[11px] uppercase tracking-[0.12em] text-textItemBlur bg-gradient-to-b from-newBgLineColor to-newBgLineColor/50 border-b border-white/[0.08]';

export const adminTr =
  'border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors last:border-0';

export const adminTd = 'px-3 sm:px-4 py-3 align-middle';

/** Ghost / secondary button */
export function AdminButtonLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-xl bg-newBgLineColor/35 px-4 py-2.5 text-[13px] font-semibold text-newTextColor hover:bg-newBgLineColor/55 transition-all"
    >
      {children}
    </Link>
  );
}
