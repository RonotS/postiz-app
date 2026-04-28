'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { OauthProvider } from '@gitroom/frontend/components/auth/providers/oauth.provider';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export function Login() {
  const t = useT();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fetchData = useFetch();
  useEffect(() => {
    const provider = searchParams.get('provider')?.toUpperCase();
    const code = searchParams.get('oauth_verifier');
    const state = searchParams.get('oauth_token');

    if (provider !== 'X' || !code || !state) {
      return;
    }

    setLoading(true);
    setError('');

    fetchData('/auth/oauth/X/exists', {
      method: 'POST',
      body: JSON.stringify({
        code,
        state,
        redirect_uri: '',
      }),
    })
      .then(async (response) => {
        if (response.status >= 400) {
          setError(await response.text());
          setLoading(false);
          return;
        }

        const json = await response.json();
        if (json.login) {
          window.location.href = '/';
          return;
        }

        if (json.token) {
          // This is a new user, send them to the registration page with the backend token
          window.location.href = `/auth?token=${json.token}&provider=X`;
          return;
        }
      })
      .catch((caughtError) => {
        setError(caughtError?.message || 'Failed to complete X login');
        setLoading(false);
      });
  }, [fetchData, searchParams]);

  return (
    <div className="flex-1 flex">
      <div className="flex flex-col flex-1">
        <div>
          <h1 className="text-[40px] font-[500] -tracking-[0.8px] text-start cursor-pointer">
            {t('sign_in', 'Sign In')}
          </h1>
        </div>
        <div className="text-[14px] mt-[32px] mb-[12px]">
          {t('continue_with', 'Continue With')}
        </div>
        <div className="flex flex-col gap-[16px]">
          <OauthProvider />
          <div className="text-[13px] text-white/60">
            {t(
              'x_login_only',
              'Only X accounts can sign in to this workspace.'
            )}
          </div>
          {loading && (
            <div className="text-[13px] text-white/60">
              {t('loading', 'Loading...')}
            </div>
          )}
          {error && (
            <div className="rounded-[10px] border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
