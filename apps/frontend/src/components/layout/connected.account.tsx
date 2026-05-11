'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import useSWR from 'swr';

type IntegrationItem = {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
  disabled?: boolean;
};

export const ConnectedAccount = () => {
  const t = useT();
  const fetch = useFetch();
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/integrations/list');
    if (!res.ok) return [] as IntegrationItem[];
    const data = await res.json();
    return (data.integrations || []) as IntegrationItem[];
  }, [fetch]);

  const { data: integrations = [] } = useSWR('/integrations/list', load, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  const xIntegration = integrations.find(
    (i) => !i.disabled && (i.identifier === 'x' || i.identifier === 'twitter')
  );

  // Kick off the X OAuth flow directly from the sidebar — same call the
  // /launches "Add X" button uses, just inlined here so the user doesn't have
  // to navigate to a separate page first.
  const connectX = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const res = await fetch('/integrations/social/x');
      if (!res.ok) {
        setConnecting(false);
        return;
      }
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setConnecting(false);
      }
    } catch {
      setConnecting(false);
    }
  }, [fetch, connecting]);

  if (!xIntegration) {
    return (
      <button
        type="button"
        onClick={connectX}
        disabled={connecting}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-[8px] hover:bg-boxHover transition-colors disabled:opacity-60 text-left"
        title={t('connect_x_account', 'Connect an X account')}
      >
        <div className="w-8 h-8 rounded-full bg-newBgColor border border-newBorder flex items-center justify-center text-newTableText text-xs flex-shrink-0">
          𝕏
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-newTextColor text-[12px] font-semibold truncate">
            {connecting
              ? t('connecting', 'Connecting…')
              : t('not_connected', 'Not connected')}
          </span>
          <span className="text-customColor26 text-[10px] truncate">
            {connecting
              ? t('please_wait', 'Please wait')
              : t('connect_account', 'Connect account')}
          </span>
        </div>
      </button>
    );
  }

  return (
    <Link
      href="/launches"
      className="flex items-center gap-2 px-2 py-2 rounded-[8px] hover:bg-boxHover transition-colors"
      title={xIntegration.name}
    >
      <div className="relative w-8 h-8 flex-shrink-0">
        <img
          src={xIntegration.picture || '/no-picture.svg'}
          alt={xIntegration.name}
          className="w-8 h-8 rounded-full object-cover bg-newBgColor"
        />
        <img
          src={`/icons/platforms/${xIntegration.identifier}.png`}
          alt={xIntegration.identifier}
          className="absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full border border-newBorder bg-newBgColorInner"
        />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-newTextColor text-[12px] font-semibold truncate">
          {xIntegration.name}
        </span>
        <span className="text-newTableText text-[10px] truncate">
          {t('connected_to_x', 'Connected to X')}
        </span>
      </div>
    </Link>
  );
};
