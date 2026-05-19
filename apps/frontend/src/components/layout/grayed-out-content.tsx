'use client';

import clsx from 'clsx';
import { FC, ReactNode } from 'react';

/** Visible, read-only panel: content stays on screen but cannot be interacted with. */
export const GrayedOutContent: FC<{
  children: ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    aria-disabled="true"
    className={clsx(
      'opacity-40 grayscale pointer-events-none select-none',
      className
    )}
  >
    {children}
  </div>
);
