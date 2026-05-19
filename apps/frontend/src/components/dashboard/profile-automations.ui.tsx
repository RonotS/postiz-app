'use client';

import { FC, ReactNode } from 'react';
import clsx from 'clsx';

/** Full-width page shell for Profile automations. */
export const ProfileAutomationsPageShell: FC<{ children: ReactNode }> = ({
  children,
}) => (
  <div className="flex flex-1 min-h-0 w-full min-w-0 flex-col bg-newBgColor text-newTextColor overflow-y-auto custom-scrollbar">
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {children}
    </div>
  </div>
);

export const ProfileAutomationsHero: FC<{
  title: string;
  description: string;
  icon?: ReactNode;
}> = ({ title, description, icon }) => (
  <header className="w-full min-w-0 mb-8 sm:mb-10">
    <div className="relative w-full overflow-hidden rounded-2xl border border-newBorder/80 bg-gradient-to-br from-newBgColorInner via-newBgColorInner to-btnPrimary/5 p-6 sm:p-8 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
      <div
        className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-btnPrimary/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -start-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl"
        aria-hidden
      />
      <div className="relative z-[1] flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        {icon && (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-newBorder/80 bg-newBgColorInner text-textItemFocused shadow-sm">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-btnPrimary mb-2">
            X · Automations
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-newTextColor">
            {title}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-newTableText max-w-3xl leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  </header>
);

export const ProfileAutomationsSection: FC<{
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}> = ({ title, subtitle, icon, children, className }) => (
  <section
    className={clsx(
      'w-full min-w-0 flex flex-col gap-4 sm:gap-5',
      className
    )}
  >
    <div className="flex items-start gap-3 min-w-0">
      {icon}
      <div className="min-w-0">
        <h2 className="text-base sm:text-lg font-semibold text-newTextColor tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs sm:text-sm text-newTableText leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {children}
  </section>
);

export const ProfileAutomationsCard: FC<{
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}> = ({ children, className, noPadding }) => (
  <div
    className={clsx(
      'w-full min-w-0 rounded-2xl border border-newBorder/80 bg-newBgColorInner/90 shadow-sm',
      'ring-1 ring-white/5 dark:ring-white/[0.02]',
      !noPadding && 'p-4 sm:p-5 lg:p-6',
      className
    )}
  >
    {children}
  </div>
);

export const ProfileAutomationsEmpty: FC<{
  children: ReactNode;
  variant?: 'warning' | 'neutral';
}> = ({ children, variant = 'neutral' }) => (
  <div
    className={clsx(
      'w-full rounded-2xl border px-4 py-4 sm:px-6 sm:py-5 text-sm leading-relaxed',
      variant === 'warning'
        ? 'border-customColor19/40 bg-customColor19/10 text-newTextColor'
        : 'border-newBorder/80 bg-newBgColorInner/50 text-newTableText'
    )}
  >
    {children}
  </div>
);

export const ProfileAutomationsPrimaryButton: FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }
> = ({ className, children, loading, disabled, ...props }) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={clsx(
      'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
      'bg-btnPrimary text-white shadow-md shadow-btnPrimary/20',
      'hover:opacity-95 active:scale-[0.98] transition-all',
      'disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none',
      className
    )}
    {...props}
  >
    {loading && (
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
    )}
    {children}
  </button>
);

export const ProfileAutomationsGhostButton: FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ className, children, ...props }) => (
  <button
    type="button"
    className={clsx(
      'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium',
      'border border-newBorder/80 bg-newBgColor/50 text-newTextColor',
      'hover:bg-boxHover active:scale-[0.98] transition-all',
      'disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
  </button>
);
