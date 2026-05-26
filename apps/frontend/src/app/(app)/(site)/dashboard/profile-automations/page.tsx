'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ProfileAutomationsPanel } from '@gitroom/frontend/components/dashboard/profile-automations.panel';
import { ProfileAutomationsPageShell } from '@gitroom/frontend/components/dashboard/profile-automations.ui';
import {
  ProfileAutomationsNavIcon,
  ProfileAutomationsSectionIcon,
} from '@gitroom/frontend/components/dashboard/profile-automations.icons';
import { AutomationPageGate } from '@gitroom/frontend/components/dashboard/automation-page-gate';

export default function DashboardProfileAutomationsPage() {
  const t = useT();

  return (
    <AutomationPageGate kind="profile">
      <ProfileAutomationsPageShell>
        <header className="mb-6">
          <div className="flex items-start gap-3 min-w-0">
            <ProfileAutomationsSectionIcon>
              <ProfileAutomationsNavIcon />
            </ProfileAutomationsSectionIcon>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-newTextColor mb-2">
                {t('profile_automations', 'Profile automations')}
              </h1>
              <p className="text-[13px] text-newTableText max-w-[min(100%,52ch)] leading-snug">
                {t(
                  'profile_automations_page_intro',
                  'Welcome new followers, auto-delete posts, clean up reposts, and send DMs when people engage with your pinned post.'
                )}
              </p>
            </div>
          </div>
        </header>

        <ProfileAutomationsPanel />
      </ProfileAutomationsPageShell>
    </AutomationPageGate>
  );
}
