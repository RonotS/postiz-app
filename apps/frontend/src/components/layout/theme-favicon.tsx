'use client';

import { useEffect } from 'react';
import { themeFaviconHref } from '@gitroom/frontend/components/layout/theme-favicon.shared';
import { useSyncedThemeMode } from '@gitroom/frontend/components/layout/use-synced-theme-mode';

/** Updates all `link[data-theme-favicon]` and `#theme-apple-touch` when theme changes. */
export function ThemeFavicon(): null {
  const mode = useSyncedThemeMode();

  useEffect(() => {
    const href = themeFaviconHref(mode);
    document.querySelectorAll('link[data-theme-favicon]').forEach((node) => {
      (node as HTMLLinkElement).href = href;
    });
    const apple = document.getElementById('theme-apple-touch') as HTMLLinkElement | null;
    if (apple) {
      apple.href = href;
    }
  }, [mode]);

  return null;
}
