'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { XFollowersExplorerPanel } from '@gitroom/frontend/components/dashboard/x-followers-explorer.panel';
import {
  ProfileAutomationsPageShell,
  ProfileAutomationsSection,
} from '@gitroom/frontend/components/dashboard/profile-automations.ui';
import {
  FollowAutomationsIcon,
  ProfileAutomationsSectionIcon,
} from '@gitroom/frontend/components/dashboard/profile-automations.icons';

export default function DashboardFollowersPage() {
  const t = useT();

  return (
    <ProfileAutomationsPageShell>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-newTextColor mb-2">
          {t('follow_automations', 'Follow automations')}
        </h1>
        <p className="text-[13px] text-newTableText max-w-[min(100%,52ch)] leading-snug">
          {t(
            'follow_automations_page_intro',
            'Search any X user, browse their followers in a spreadsheet view, and follow or unfollow in bulk.'
          )}
        </p>
      </header>

      <ProfileAutomationsSection
        className="w-full min-w-0"
        title={t('follower_explorer', 'Follower explorer')}
        subtitle={t(
          'follower_explorer_section_sub',
          'Search any @handle, browse followers in a spreadsheet view, filter by engagement, and follow or unfollow in bulk.'
        )}
        icon={
          <ProfileAutomationsSectionIcon>
            <FollowAutomationsIcon />
          </ProfileAutomationsSectionIcon>
        }
      >
        <XFollowersExplorerPanel />
      </ProfileAutomationsSection>
    </ProfileAutomationsPageShell>
  );
}
