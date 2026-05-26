'use client';

import Link from 'next/link';
import { FC, ReactNode } from 'react';
import { ProfileAutomationsPageShell } from '@gitroom/frontend/components/dashboard/profile-automations.ui';

export const AutomationComingSoonPage: FC<{
  title: string;
  description: string;
  icon?: ReactNode;
  previewHref?: string;
}> = ({ title, description, icon, previewHref }) => (
  <ProfileAutomationsPageShell>
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center py-8 sm:py-14">
      {icon && (
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-newBorder bg-newBgColorInner text-newTextColor shadow-[0_0_40px_-12px_rgba(99,102,241,0.35)]">
          {icon}
        </div>
      )}
      <span className="mb-3 inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
        Coming soon
      </span>
      <h1 className="text-2xl sm:text-3xl font-semibold text-newTextColor tracking-tight">
        {title}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-newTableText max-w-lg">
        {description}
      </p>
      <p className="mt-6 text-[13px] text-textItemBlur">
        We&apos;re finishing this for launch. You can still use Home, Profile
        automations, and Billing in the meantime.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-full bg-btnPrimary px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
        >
          Back to Home
        </Link>
        <Link
          href="/dashboard/profile-automations"
          className="rounded-full border border-newBorder px-5 py-2.5 text-[14px] font-medium text-newTextColor hover:bg-boxFocused"
        >
          Profile automations
        </Link>
        {previewHref && (
          <Link
            href={previewHref}
            className="text-[13px] text-btnPrimary hover:underline"
          >
            Admin preview
          </Link>
        )}
      </div>
    </div>
  </ProfileAutomationsPageShell>
);
