'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Slider } from '@gitroom/react/form/slider';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface EmailNotifications {
  sendSuccessEmails: boolean;
  sendFailureEmails: boolean;
  sendStreakEmails: boolean;
}

export const useEmailNotifications = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/user/email-notifications')).json();
  }, []);

  return useSWR<EmailNotifications>('email-notifications', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const EmailNotificationsComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading } = useEmailNotifications();

  const [localSettings, setLocalSettings] = useState<EmailNotifications>({
    sendSuccessEmails: true,
    sendFailureEmails: true,
    sendStreakEmails: true,
  });

  // Keep a ref to always have the latest state
  const settingsRef = useRef(localSettings);
  settingsRef.current = localSettings;

  // Sync local state with fetched data
  useEffect(() => {
    if (data) {
      setLocalSettings(data);
    }
  }, [data]);

  const updateSetting = useCallback(
    async (key: keyof EmailNotifications, value: boolean) => {
      // Use ref to get the latest state
      const currentSettings = settingsRef.current;
      const newData = {
        ...currentSettings,
        [key]: value,
      };

      // Update local state immediately
      setLocalSettings(newData);

      await fetch('/user/email-notifications', {
        method: 'POST',
        body: JSON.stringify(newData),
      });

      toaster.show(t('settings_updated', 'Settings updated'), 'success');
    },
    []
  );

  const handleSuccessEmailsChange = useCallback(
    (value: 'on' | 'off') => {
      updateSetting('sendSuccessEmails', value === 'on');
    },
    [updateSetting]
  );

  const handleFailureEmailsChange = useCallback(
    (value: 'on' | 'off') => {
      updateSetting('sendFailureEmails', value === 'on');
    },
    [updateSetting]
  );

  const handleStreakEmailsChange = useCallback(
    (value: 'on' | 'off') => {
      updateSetting('sendStreakEmails', value === 'on');
    },
    [updateSetting]
  );

  if (isLoading) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-4 sm:p-6 min-w-0">
        <div className="animate-pulse">
          {t('loading', 'Loading...')}
        </div>
      </div>
    );
  }

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-4 sm:p-6 flex flex-col gap-[24px] min-w-0">
      <div className="mt-[4px]">
        {t('email_notifications', 'Email Notifications')}
      </div>
      {(
        [
          {
            key: 'sendSuccessEmails' as const,
            title: t('success_emails', 'Success Emails'),
            description: t(
              'success_emails_description',
              'Receive email notifications when posts are published successfully'
            ),
            value: localSettings.sendSuccessEmails,
            onChange: handleSuccessEmailsChange,
          },
          {
            key: 'sendFailureEmails' as const,
            title: t('failure_emails', 'Failure Emails'),
            description: t(
              'failure_emails_description',
              'Receive email notifications when posts fail to publish'
            ),
            value: localSettings.sendFailureEmails,
            onChange: handleFailureEmailsChange,
          },
          {
            key: 'sendStreakEmails' as const,
            title: t('streak_emails', 'Streak Reminder Emails'),
            description: t(
              'streak_emails_description',
              'Receive email reminders when your posting streak is about to end'
            ),
            value: localSettings.sendStreakEmails,
            onChange: handleStreakEmailsChange,
          },
        ] as const
      ).map((row) => (
        <div
          key={row.key}
          className="flex items-start gap-4 min-w-0 w-full"
        >
          <div className="flex flex-col flex-1 min-w-0">
            <div className="text-[14px]">{row.title}</div>
            <div className="text-[12px] text-customColor18 leading-snug">
              {row.description}
            </div>
          </div>
          <div className="shrink-0 ms-1 pt-0.5">
            <Slider
              value={row.value ? 'on' : 'off'}
              onChange={row.onChange}
              fill={true}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default EmailNotificationsComponent;

