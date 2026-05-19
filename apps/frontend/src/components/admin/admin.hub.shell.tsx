'use client';

import type { ReactNode } from 'react';

/**
 * Admin page content wrapper. Primary navigation lives in the app shell
 * (`LayoutComponent` admin rail + mobile drawer) for parity with the main app.
 */
export function AdminHubShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col bg-newBgColor">
      <div className="flex flex-1 min-h-0 min-w-0 p-3 sm:p-5 md:p-6">
        <div className="flex flex-1 min-h-0 min-w-0 flex-col rounded-xl sm:rounded-2xl border border-newBorder bg-newBgColorInner shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] overflow-hidden">
          <div className="flex-1 min-h-0 min-w-0 overflow-auto custom-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
