'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { FollowersPanel } from '@gitroom/frontend/components/dashboard/followers.panel';
import { XFollowersExplorerPanel } from '@gitroom/frontend/components/dashboard/x-followers-explorer.panel';
import {
  ProfileAutomationsHero,
  ProfileAutomationsPageShell,
  ProfileAutomationsSection,
} from '@gitroom/frontend/components/dashboard/profile-automations.ui';
import {
  ProfileAutomationsIcon,
  ProfileAutomationsSectionIcon,
} from '@gitroom/frontend/components/dashboard/profile-automations.icons';

export default function DashboardFollowersPage() {
  const t = useT();

  return (
    <ProfileAutomationsPageShell>
      <ProfileAutomationsHero
        title={t('profile_automations', 'Profile automations')}
        description={t(
          'profile_automations_page_intro_v2',
          'Browse followers, explore followers-of-followers, and follow accounts from your connected X profiles. Auto-DM welcomes new followers below.'
        )}
        icon={<ProfileAutomationsIcon size={24} />}
      />

      <div className="w-full min-w-0 grid grid-cols-1 gap-8 xl:grid-cols-12 xl:gap-8 2xl:gap-10">
        <ProfileAutomationsSection
          className="xl:col-span-7 2xl:col-span-8"
          title={t('follower_explorer', 'Follower explorer')}
          subtitle={t(
            'follower_explorer_section_sub',
            'Drill into networks and follow accounts in bulk from the profile you select.'
          )}
          icon={
            <ProfileAutomationsSectionIcon>
              <ProfileAutomationsIcon />
            </ProfileAutomationsSectionIcon>
          }
        >
          <XFollowersExplorerPanel />
        </ProfileAutomationsSection>

        <ProfileAutomationsSection
          className="xl:col-span-5 2xl:col-span-4"
          title={t('auto_dm_new_followers', 'Auto DM new followers')}
          subtitle={t(
            'auto_dm_section_sub',
            'Send an automatic welcome message when someone new follows you.'
          )}
          icon={
            <ProfileAutomationsSectionIcon>
              <ProfileAutomationsIcon />
            </ProfileAutomationsSectionIcon>
          }
        >
          <FollowersPanel />
        </ProfileAutomationsSection>
      </div>
    </ProfileAutomationsPageShell>
  );
}
