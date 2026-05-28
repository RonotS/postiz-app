'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { getActiveXIntegrations } from '@gitroom/frontend/components/layout/x-integration.util';
import {
  XProfilePickerIntegration,
  XProfileSingleSelect,
} from '@gitroom/frontend/components/launches/x-profile-picker.component';
import {
  ProfileAutomationsPageShell,
  ProfileAutomationsSection,
} from '@gitroom/frontend/components/dashboard/profile-automations.ui';
import {
  FollowAutomationsIcon,
  ProfileAutomationsSectionIcon,
} from '@gitroom/frontend/components/dashboard/profile-automations.icons';
import { XFollowQueuePanel } from '@gitroom/frontend/components/dashboard/x-follow-queue.panel';
import { XFollowRateLimitBanner } from '@gitroom/frontend/components/dashboard/x-follow-rate-limit-banner';
import { useXFollowRateLimit } from '@gitroom/frontend/components/dashboard/use-x-follow-rate-limit';
import { AutomationPageGate } from '@gitroom/frontend/components/dashboard/automation-page-gate';

export default function DashboardFollowQueuePage() {
  const t = useT();
  const fetch = useFetch();

  const { data: integrations = [], isLoading } = useSWR(
    '/integrations/list',
    async () => {
      const res = await fetch('/integrations/list');
      if (!res.ok) return [] as XProfilePickerIntegration[];
      const data = await res.json();
      return (data.integrations || []) as XProfilePickerIntegration[];
    },
    { revalidateOnFocus: false }
  );

  const xIntegrations = useMemo(
    () => getActiveXIntegrations(integrations),
    [integrations]
  );

  const [integrationId, setIntegrationId] = useState('');

  useEffect(() => {
    if (!xIntegrations.length) {
      setIntegrationId('');
      return;
    }
    if (
      !integrationId ||
      !xIntegrations.some((i) => i.id === integrationId)
    ) {
      setIntegrationId(xIntegrations[0].id!);
    }
  }, [xIntegrations, integrationId]);

  const {
    rateLimit: followRateLimit,
    countdown: followCountdown,
    dailyCountdown: followDailyCountdown,
  } = useXFollowRateLimit(integrationId);

  return (
    <AutomationPageGate kind="follow">
    <ProfileAutomationsPageShell>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-newTextColor mb-2">
            {t('follow_queue_page_title', 'Follow queue')}
          </h1>
          <p className="text-[13px] text-newTableText max-w-[min(100%,52ch)] leading-snug">
            {t(
              'follow_queue_page_intro',
              'Schedule bulk follows automatically. Up to 400 follows per day per connected profile.'
            )}
          </p>
        </div>
        <Link
          href="/dashboard/followers"
          className="text-sm font-medium text-btnPrimary hover:underline shrink-0"
        >
          {t('back_to_explorer', '← Follower explorer')}
        </Link>
      </header>

      {isLoading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-newBgLineColor/40" />
      ) : !xIntegrations.length ? (
        <p className="text-sm text-newTableText">
          {t('connect_x_for_queue', 'Connect an X account to use the follow queue.')}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {xIntegrations.length > 1 && (
            <XProfileSingleSelect
              integrations={xIntegrations}
              selectedId={integrationId}
              onChange={setIntegrationId}
            />
          )}

          {followRateLimit && (
            <XFollowRateLimitBanner
              rateLimit={followRateLimit}
              countdown={followCountdown}
              dailyCountdown={followDailyCountdown}
              action="follow"
            />
          )}

          <ProfileAutomationsSection
            title={t('queue_status', 'Queue status')}
            subtitle={t(
              'queue_status_sub',
              'Pending follows and the upcoming processing batches.'
            )}
            icon={
              <ProfileAutomationsSectionIcon>
                <FollowAutomationsIcon />
              </ProfileAutomationsSectionIcon>
            }
          >
            {integrationId ? (
              <XFollowQueuePanel integrationId={integrationId} />
            ) : null}
          </ProfileAutomationsSection>
        </div>
      )}
    </ProfileAutomationsPageShell>
    </AutomationPageGate>
  );
}
