'use client';

import { FC, ReactNode } from 'react';
import clsx from 'clsx';

/** Full-width page shell for dashboard automation pages. */
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
    <div className="relative w-full overflow-hidden rounded-2xl border border-newBorder bg-newBgColorInner p-6 sm:p-8">
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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-newBorder bg-newBgColor text-newTextColor">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-btnPrimary mb-2">
            X · Follow
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
  borderless?: boolean;
}> = ({ children, className, noPadding, borderless }) => (
  <div
    className={clsx(
      'w-full min-w-0 rounded-2xl bg-newBgColorInner',
      !borderless && 'border border-newBorder',
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
        : 'border-newBorder bg-newBgColorInner text-newTableText'
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

export const ProfileAutomationsToggle: FC<{
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ enabled, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!enabled)}
    disabled={disabled}
    className={clsx(
      'relative h-8 w-14 shrink-0 rounded-full transition-all duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary/50',
      enabled
        ? 'bg-btnPrimary border-2 border-btnPrimary shadow-lg shadow-btnPrimary/30'
        : 'bg-gray-200 border-2 border-gray-400 dark:bg-newBgLineColor dark:border-gray-500',
      disabled && 'opacity-50 cursor-not-allowed'
    )}
    aria-pressed={enabled}
  >
    <span
      className={clsx(
        'absolute top-0.5 left-0.5 h-6 w-6 rounded-full border-2 bg-white transition-transform duration-200',
        enabled ? 'translate-x-6 border-white' : 'border-gray-500'
      )}
    />
  </button>
);

export const ProfileAutomationsInfoIcon: FC<{ title?: string }> = ({
  title,
}) => (
  <span
    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-[10px] font-bold text-gray-500 dark:border-newBorder dark:text-newTableText"
    title={title}
    aria-label={title}
  >
    i
  </span>
);

export const ProfileAutomationsInnerBox: FC<{
  title: string;
  children: ReactNode;
  className?: string;
  borderless?: boolean;
}> = ({ title, children, className, borderless }) => (
  <div
    className={clsx(
      'rounded-xl p-4',
      borderless
        ? 'bg-newBgColorInner/40'
        : 'border border-gray-200 bg-gray-50/80 dark:border-newBorder dark:bg-newBgColor/40',
      className
    )}
  >
    <p className="mb-3 text-xs font-semibold text-newTextColor">{title}</p>
    {children}
  </div>
);

export const ProfileAutomationsGhostButton: FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ className, children, ...props }) => (
  <button
    type="button"
    className={clsx(
      'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium',
      'border border-gray-300 bg-gray-100 text-newTextColor',
      'dark:border-newBorder dark:bg-newBgColorInner',
      'hover:bg-gray-200 dark:hover:bg-boxHover active:scale-[0.98] transition-all',
      'disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
  </button>
);
