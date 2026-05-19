'use client';

import { useSyncedThemeMode } from '@gitroom/frontend/components/layout/use-synced-theme-mode';

export const Logo = () => {
  const mode = useSyncedThemeMode();
  const src =
    mode === 'light' ? '/favicon(black).png' : '/favicon(white).png';

  return (
    <img
      key={src}
      src={src}
      alt="TweetMax"
      width={220}
      height={64}
      className="mt-[4px] w-full max-w-[min(208px,100%)] h-auto max-h-[56px] sm:max-h-[64px] object-contain object-left"
      draggable={false}
    />
  );
};
