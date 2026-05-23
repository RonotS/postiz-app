'use client';

import React, { ReactNode, useCallback, useEffect, useState } from 'react';
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
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { DocumentTitle } from '@gitroom/frontend/components/layout/document-title';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { MobileDrawer } from '@gitroom/frontend/components/new-layout/mobile.drawer';
import {
  AdminHubBreadcrumbs,
  AdminHubMenuButton,
  AdminHubMobileDrawer,
  AdminHubSidebar,
} from '@gitroom/frontend/components/admin/admin.hub.navigation';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();
  const [adminMobileOpen, setAdminMobileOpen] = useState(false);

  const { backendUrl, billingEnabled, isGeneral } = useVariables();

  // Feedback icon component attaches Sentry feedback to a top-bar icon when DSN is present
  const pathname = usePathname();
  const router = useRouter();
  const isSubscribeRoute = pathname === '/subscribe';
  const isAdminHubRoute =
    pathname === '/adminisamazing' || pathname?.startsWith('/adminisamazing/');
  const searchParams = useSearchParams();

  useEffect(() => {
    setAdminMobileOpen(false);
  }, [pathname]);
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

  const isBillingRoute =
    pathname === '/billing' || pathname?.startsWith('/billing/');
  const isPlatformAdminUser =
    !!user &&
    ((user as { admin?: boolean }).admin === true ||
      (user as { isSuperAdmin?: boolean }).isSuperAdmin === true);

  const showFirstBillingGate =
    !!user &&
    user.tier === 'FREE' &&
    isGeneral &&
    billingEnabled &&
    !isBillingRoute &&
    !isSubscribeRoute &&
    !isPlatformAdminUser;

  useEffect(() => {
    if (showFirstBillingGate) {
      router.replace('/subscribe');
    }
  }, [showFirstBillingGate, router]);

  if (!user) return null;

  if (isSubscribeRoute) {
    return (
      <ContextWrapper user={user}>
        <MantineWrapper>
          <DocumentTitle />
          <Toaster />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            {children}
          </CheckPayment>
        </MantineWrapper>
      </ContextWrapper>
    );
  }

  if (showFirstBillingGate) {
    return (
      <ContextWrapper user={user}>
        <MantineWrapper>
          <LoadingComponent />
        </MantineWrapper>
      </ContextWrapper>
    );
  }

  return (
    <ContextWrapper user={user}>
      <CopilotKit
        credentials="include"
        runtimeUrl={backendUrl + '/copilot/chat'}
        showDevConsole={false}
      >
        <MantineWrapper>
          <DocumentTitle />
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
                      <div className="hidden md:flex flex-col bg-newBgColorInner w-[240px] max-w-[240px] shrink-0 overflow-hidden rounded-[12px]">
                        <div
                          id="left-menu"
                          className={clsx(
                            'hidden md:flex fixed h-full w-[224px] max-w-[224px] min-w-0 start-[20px] top-0 overflow-hidden flex flex-col',
                            user?.admin &&
                              !isAdminHubRoute &&
                              'pt-[60px] max-h-[1000px]:w-[500px]'
                          )}
                        >
                          <div className="flex min-h-0 flex-1 flex-col gap-[24px] max-w-full min-w-0 px-[8px] py-[12px]">
                            <div className="flex shrink-0 items-center justify-start ps-[12px] pe-[4px]">
                              <Logo />
                            </div>
                            <div className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
                              <TopMenu />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {isAdminHubRoute && (
                      <div className="hidden md:flex flex-col bg-newBgColorInner w-[240px] max-w-[240px] shrink-0 overflow-hidden rounded-[12px]">
                        <div
                          id="admin-left-menu"
                          className="scrollbar-none hidden md:flex fixed h-full w-[224px] max-w-[224px] min-w-0 start-[20px] top-0 flex-col overflow-x-hidden overflow-y-auto"
                        >
                          <AdminHubSidebar />
                        </div>
                      </div>
                    )}
                    <div
                      className={clsx(
                        'flex-1 bg-newBgLineColor rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe',
                        isAdminHubRoute && 'min-w-0 w-full'
                      )}
                    >
                      <div className="flex bg-newBgColorInner h-[80px] px-[20px] items-center shrink-0 border-b border-newBorder/80 overflow-visible relative z-[50]">
                        <div className="text-[24px] font-[600] flex flex-1 items-center gap-3 min-w-0">
                          {isAdminHubRoute && (
                            <>
                              <AdminHubMenuButton onOpen={() => setAdminMobileOpen(true)} />
                              <AdminHubMobileDrawer
                                open={adminMobileOpen}
                                onClose={() => setAdminMobileOpen(false)}
                              />
                            </>
                          )}
                          {!isAdminHubRoute && <MobileDrawer />}
                          {isAdminHubRoute && (
                            <Link
                              href="/dashboard"
                              className="hidden sm:inline shrink-0 text-[12px] font-[600] px-3 py-1.5 rounded-lg border border-newBorder text-textItemBlur hover:text-newTextColor hover:bg-boxFocused transition-colors"
                            >
                              Exit admin
                            </Link>
                          )}
                          <Title />
                        </div>
                        <div className="flex gap-[10px] md:gap-[20px] text-textItemBlur items-center shrink-0 overflow-visible">
                          {!isAdminHubRoute && (
                            <div className="hidden sm:block">
                              <StreakComponent />
                            </div>
                          )}
                          {!isAdminHubRoute && <OrganizationSelector />}
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
                      <div className="flex flex-1 flex-col min-h-0 min-w-0 gap-0">
                        {isAdminHubRoute && (
                          <div className="md:hidden shrink-0 px-[20px] py-2.5 border-b border-newBorder bg-newBgLineColor/80">
                            <AdminHubBreadcrumbs />
                          </div>
                        )}
                        <div className="flex flex-1 gap-[1px] min-h-0 min-w-0">
                          {children}
                        </div>
                      </div>
                    </div>
                  </div>
              </>
            </div>
          </CheckPayment>
        </MantineWrapper>
      </CopilotKit>
    </ContextWrapper>
  );
};
