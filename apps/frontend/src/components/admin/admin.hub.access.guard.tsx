'use client';

import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

function isPlatformAdmin(user: NonNullable<ReturnType<typeof useUser>>) {
  if ((user as { admin?: boolean }).admin === true) return true;
  return user.isSuperAdmin === true;
}

/** Only platform super-admins may open `/adminisamazing` and nested routes. */
export function AdminHubAccessGuard({ children }: { children: ReactNode }) {
  const user = useUser();
  const router = useRouter();

  const allowed = !!user && isPlatformAdmin(user);

  useEffect(() => {
    if (!user) return;
    if (!allowed) {
      router.replace('/dashboard');
    }
  }, [user, allowed, router]);

  if (!user) return null;
  if (!allowed) return null;

  return <>{children}</>;
}
