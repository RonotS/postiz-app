'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { getActiveXIntegrations } from '@gitroom/frontend/components/layout/x-integration.util';
import {
  XProfilePickerIntegration,
  XProfileSingleSelect,
} from '@gitroom/frontend/components/launches/x-profile-picker.component';
import { XFollowersExplorerPanel } from '@gitroom/frontend/components/dashboard/x-followers-explorer.panel';
import { AutomationComingSoonPage } from '@gitroom/frontend/components/dashboard/automation-coming-soon.page';
import { AutomationPageGate } from '@gitroom/frontend/components/dashboard/automation-page-gate';
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

type FollowTab = 'explorer' | 'queue';

function FollowAutomationsContent() {
  const t = useT();
  const user = useUser();
  const fetch = useFetch();
  const isPublic = !!user?.automationPages?.followAutomationsPublic;
  const [tab, setTab] = useState<FollowTab>('explorer');
  const [integrationId, setIntegrationId] = useState('');

  const { data: integrations = [], isLoading: integrationsLoading } = useSWR(
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

  if (!isPublic) {
    return (
      <AutomationComingSoonPage
        title={t('follow_automations', 'Follow automations')}
        description={t(
          'follow_automations_coming_soon',
          'Bulk follow and unfollow, follower explorer, and follow queues — launching soon.'
        )}
        icon={<FollowAutomationsIcon />}
      />
    );
  }

  return (
    <ProfileAutomationsPageShell>
      <header className="mb-4 sm:mb-6 min-w-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-newBorder bg-newBgColorInner text-newTextColor">
              <FollowAutomationsIcon />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-bold text-newTextColor mb-1.5 sm:mb-2">
                {t('follow_automations', 'Follow automations')}
              </h1>
              <p className="text-[13px] text-newTableText leading-snug max-w-3xl">
                {t(
                  'follow_automations_page_intro',
                  'Search any account’s followers, queue bulk follows (up to 400 per day per profile), and let the system pace requests within X API limits.'
                )}
              </p>
            </div>
          </div>
          {xIntegrations.length > 1 && (
            <XProfileSingleSelect
              integrations={xIntegrations}
              selectedId={integrationId}
              onChange={setIntegrationId}
            />
          )}
        </div>

        <div className="mt-4 flex gap-2 border-b border-newBorder">
          <button
            type="button"
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === 'explorer'
                ? 'border-btnPrimary text-btnPrimary'
                : 'border-transparent text-newTableText hover:text-newTextColor'
            )}
            onClick={() => setTab('explorer')}
          >
            {t('tab_explorer', 'Explorer')}
          </button>
          <button
            type="button"
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === 'queue'
                ? 'border-btnPrimary text-btnPrimary'
                : 'border-transparent text-newTableText hover:text-newTextColor'
            )}
            onClick={() => setTab('queue')}
          >
            {t('tab_follow_queue', 'Follow queue')}
          </button>
        </div>
      </header>

      {tab === 'explorer' ? (
        <XFollowersExplorerPanel />
      ) : integrationsLoading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-newBgLineColor/40" />
      ) : !xIntegrations.length ? (
        <p className="text-sm text-newTableText">
          {t('connect_x_for_queue', 'Connect an X account to use the follow queue.')}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
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
              'Pending follows with estimated run times. Up to 50 per 15 minutes and 400 per day (X API limits).'
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
  );
}

export default function DashboardFollowersPage() {
  return (
    <AutomationPageGate kind="follow">
      <FollowAutomationsContent />
    </AutomationPageGate>
  );
}
