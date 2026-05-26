'use client';

import { FC, ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

export type AutomationPageKind = 'profile' | 'follow';

export function canAccessAutomationPage(
  user:
    | {
        isSuperAdmin?: boolean;
        admin?: boolean;
        role?: 'USER' | 'ADMIN' | 'SUPERADMIN';
        automationPages?: {
          profileAutomationsPublic?: boolean;
          followAutomationsPublic?: boolean;
          /** @deprecated */
          tweetAutomationsPublic?: boolean;
        };
      }
    | undefined
    | null,
  kind: AutomationPageKind
): boolean {
  if (!user) return false;
  const isPlatformSuperAdmin =
    user.isSuperAdmin === true || user.admin === true;
  const flags = user.automationPages;
  const isPublic =
    kind === 'profile'
      ? !!(
          flags?.profileAutomationsPublic ?? flags?.tweetAutomationsPublic
        )
      : !!flags?.followAutomationsPublic;
  if (isPublic) return true;
  return isPlatformSuperAdmin;
}

export const AutomationPageGate: FC<{
  kind: AutomationPageKind;
  children: ReactNode;
}> = ({ kind, children }) => {
  const user = useUser();
  const router = useRouter();
  const allowed = canAccessAutomationPage(user, kind);

  useEffect(() => {
    if (user && !allowed) {
      router.replace('/dashboard');
    }
  }, [user, allowed, router]);

  if (!user) {
    return <LoadingComponent />;
  }

  if (!allowed) {
    return <LoadingComponent />;
  }

  return <>{children}</>;
};
