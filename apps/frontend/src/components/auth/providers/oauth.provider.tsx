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
      className={`cursor-pointer flex-1 bg-[#0F1419] h-[52px] rounded-[10px] flex justify-center items-center text-white gap-[10px] border border-white/10`}
    >
      <div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.9 2H22l-7.2 8.2L23.3 22h-6.8l-5.3-6.9L5.1 22H2l7.8-8.9L.7 2h6.9l4.8 6.3L18.9 2Zm-1.2 18h1.8L6.5 3.9H4.6L17.7 20Z" />
        </svg>
      </div>
      <div>
        {t('continue_with', 'Continue with')}&nbsp;X
      </div>
    </div>
  );
};
