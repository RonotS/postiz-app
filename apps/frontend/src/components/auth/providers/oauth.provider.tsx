'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export const OauthProvider = () => {
  const fetch = useFetch();
  const t = useT();
  const gotoLogin = useCallback(async () => {
    try {
      const response = await fetch('/auth/oauth/X');
      if (!response.ok) {
        throw new Error(
          `Login link request failed with status ${response.status}`
        );
      }
      const link = await response.text();
      window.location.href = link;
    } catch (error) {
      console.error('Failed to get X login link:', error);
    }
  }, []);
  return (
    <div
      onClick={gotoLogin}
      className="cursor-pointer flex w-full items-center justify-center bg-[#0F1419] min-h-[56px] py-3.5 px-5 rounded-[10px] text-white gap-3 border border-white/10 text-[15px] font-semibold leading-none"
    >
      <div className="flex shrink-0 items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.9 2H22l-7.2 8.2L23.3 22h-6.8l-5.3-6.9L5.1 22H2l7.8-8.9L.7 2h6.9l4.8 6.3L18.9 2Zm-1.2 18h1.8L6.5 3.9H4.6L17.7 20Z" />
        </svg>
      </div>
      <div>
        {t('continue_with', 'Continue with')}&nbsp;X
      </div>
    </div>
  );
};
