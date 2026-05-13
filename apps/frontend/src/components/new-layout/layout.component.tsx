'use client';

import React, { ReactNode, useCallback } from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { Plus_Jakarta_Sans } from 'next/font/google';
const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { usePathname, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { ShowMediaBoxModal } from '@gitroom/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@gitroom/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { ShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';
import { NewSubscription } from '@gitroom/frontend/components/layout/new.subscription';
import { Support } from '@gitroom/frontend/components/layout/support';
import { ContinueProvider } from '@gitroom/frontend/components/layout/continue.provider';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import { CopilotKit } from '@copilotkit/react-core';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { AnnouncementBanner } from '@gitroom/frontend/components/layout/announcement.banner';
import { Title } from '@gitroom/frontend/components/layout/title';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { ChromeExtensionComponent } from '@gitroom/frontend/components/layout/chrome.extension.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';
import { FirstBillingComponent } from '@gitroom/frontend/components/billing/first.billing.component';
import { MobileDrawer } from '@gitroom/frontend/components/new-layout/mobile.drawer';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();

  const { backendUrl, billingEnabled, isGeneral } = useVariables();

  // Feedback icon component attaches Sentry feedback to a top-bar icon when DSN is present
  const pathname = usePathname();
  const isAdminHubRoute =
    pathname === '/adminisamazing' || pathname?.startsWith('/adminisamazing/');
  const searchParams = useSearchParams();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: user, mutate } = useSWR('/user/self', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  if (!user) return null;

  return (
    <ContextWrapper user={user}>
      <CopilotKit
        credentials="include"
        runtimeUrl={backendUrl + '/copilot/chat'}
        showDevConsole={false}
      >
        <MantineWrapper>
          <ToolTip />
          <Toaster />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            <ShowMediaBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <NewSubscription />
            <ContinueProvider />
            <div
              className={clsx(
                'flex flex-col min-h-screen min-w-screen text-newTextColor p-[12px]',
                jakartaSans.className
              )}
            >
              <div />
              {user.tier === 'FREE' && isGeneral && billingEnabled ? (
                <FirstBillingComponent />
              ) : (
                <>
                  {!isAdminHubRoute && <AnnouncementBanner />}
                  <div
                    className={clsx(
                      'flex-1 flex gap-[8px]',
                      isAdminHubRoute && 'min-w-0'
                    )}
                  >
                    {!isAdminHubRoute && <Support />}
                    {!isAdminHubRoute && (
                      <div className="hidden md:flex flex-col bg-newBgColorInner w-[180px] rounded-[12px]">
                        <div
                          id="left-menu"
                          className={clsx(
                            'hidden md:flex fixed h-full w-[164px] start-[20px] top-0',
                            user?.admin &&
                              !isAdminHubRoute &&
                              'pt-[60px] max-h-[1000px]:w-[500px]'
                          )}
                        >
                          <div className="flex flex-col h-full gap-[32px] flex-1 py-[12px] px-[8px]">
                            <div className="flex items-center justify-start ps-[12px]">
                              <Logo />
                            </div>
                            <TopMenu />
                          </div>
                        </div>
                      </div>
                    )}
                    <div
                      className={clsx(
                        'flex-1 bg-newBgLineColor rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe',
                        isAdminHubRoute && 'min-w-0 w-full'
                      )}
                    >
                      <div className="flex bg-newBgColorInner h-[80px] px-[20px] items-center shrink-0">
                        <div className="text-[24px] font-[600] flex flex-1 items-center gap-3 min-w-0">
                          {!isAdminHubRoute && <MobileDrawer />}
                          {isAdminHubRoute && (
                            <Link
                              href="/dashboard"
                              className="shrink-0 text-[13px] font-[500] text-textItemBlur hover:text-newTextColor underline-offset-2 hover:underline"
                            >
                              Exit admin
                            </Link>
                          )}
                          <Title />
                        </div>
                        <div className="flex gap-[10px] md:gap-[20px] text-textItemBlur items-center shrink-0">
                          {!isAdminHubRoute && (
                            <div className="hidden sm:block">
                              <StreakComponent />
                            </div>
                          )}
                          {!isAdminHubRoute && <OrganizationSelector />}
                          {!isAdminHubRoute && (
                            <div className="hidden lg:block">
                              <ChromeExtensionComponent />
                            </div>
                          )}
                          {!isAdminHubRoute && <AttachToFeedbackIcon />}
                          {!isAdminHubRoute && (
                            <div className="hidden sm:block w-[1px] h-[20px] bg-blockSeparator" />
                          )}
                          <div className="hidden sm:block hover:text-newTextColor">
                            <ModeComponent />
                          </div>
                          <NotificationComponent />
                        </div>
                      </div>
                      <div className="flex flex-1 gap-[1px] min-h-0 min-w-0">
                        {children}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CheckPayment>
        </MantineWrapper>
      </CopilotKit>
    </ContextWrapper>
  );
};
