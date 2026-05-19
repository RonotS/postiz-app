'use client';

import { useEffect } from 'react';
import useCookie from 'react-use-cookie';
import { modeEmitter } from '@gitroom/frontend/components/layout/mode.component';

/**
 * `mode` from cookie, kept in sync when the user toggles theme (ModeComponent
 * updates the cookie and emits `mode` before other hooks may re-read cookie).
 */
export function useSyncedThemeMode() {
  const [mode, setMode] = useCookie('mode', 'dark');

  useEffect(() => {
    const handler = (next: string) => {
      setMode(next);
    };
    modeEmitter.on('mode', handler);
    return () => {
      modeEmitter.off('mode', handler);
    };
  }, [setMode]);

  return mode;
}
