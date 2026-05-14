'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { FollowersPanel } from '@gitroom/frontend/components/dashboard/followers.panel';

type IntegrationItem = {
  id: string;
  name: string;
  identifier: string;
  disabled?: boolean;
};

export default function DashboardFollowersPage() {
  const t = useT();
  const fetch = useFetch();
  const { data: integrations = [] } = useSWR(
    '/integrations/list',
    async () => {
      const res = await fetch('/integrations/list');
      if (!res.ok) return [] as IntegrationItem[];
      const data = await res.json();
      return (data.integrations || []) as IntegrationItem[];
    },
    { revalidateOnFocus: false, revalidateIfStale: false }
  );

  const xIntegration = useMemo(
    () =>
      integrations.find(
        (i) => !i.disabled && (i.identifier === 'x' || i.identifier === 'twitter')
      ),
    [integrations]
  );

  return (
    <div className="flex flex-1 min-h-0 bg-newBgColor text-newTextColor flex-col w-full p-4 sm:p-6 lg:p-8 overflow-y-auto custom-scrollbar">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-newTextColor mb-2">
          {t('profile_automations', 'Profile Automations')}
        </h1>
        <p className="text-newTableText text-sm max-w-[72ch] leading-relaxed">
          {t(
            'profile_automations_page_intro',
            'Automatically welcome new followers on X with a direct message. Your queue and published posts stay on Home.'
          )}
        </p>
      </header>
      <FollowersPanel xIntegrationId={xIntegration?.id} />
    </div>
  );
}
