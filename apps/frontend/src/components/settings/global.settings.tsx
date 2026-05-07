'use client';

import React from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import dynamic from 'next/dynamic';
import EmailNotificationsComponent from '@gitroom/frontend/components/settings/email-notifications.component';
import ShortlinkPreferenceComponent from '@gitroom/frontend/components/settings/shortlink-preference.component';
import { ChangeLanguageComponent } from '@gitroom/frontend/components/layout/language.component';

const MetricComponent = dynamic(
  () => import('@gitroom/frontend/components/settings/metric.component'),
  {
    ssr: false,
  }
);

export const GlobalSettings = () => {
  const t = useT();
  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('global_settings', 'Global Settings')}</h3>
      <MetricComponent />
      <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[16px]">
        <div className="text-[16px] font-[600]">{t('language', 'Language')}</div>
        <div className="text-[13px] text-newTableText">
          {t('select_language', 'Choose your preferred language for the interface.')}
        </div>
        <ChangeLanguageComponent />
      </div>
      <EmailNotificationsComponent />
      <ShortlinkPreferenceComponent />
    </div>
  );
};
