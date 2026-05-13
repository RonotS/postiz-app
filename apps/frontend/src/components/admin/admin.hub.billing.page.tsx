'use client';

import Link from 'next/link';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import {
  AdminPage,
  AdminHero,
  AdminSurface,
  AdminAlert,
} from '@gitroom/frontend/components/admin/admin.hub.ui';

export function AdminHubBillingPage() {
  const user = useUser();
  const { billingEnabled } = useVariables();
  const isSuper = !!user?.isSuperAdmin;

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Commerce"
        title="Billing"
        description="Subscription management, Stripe portal, and refund tooling live on the main Billing experience. Switch back to the main app shell when you need the full header and organization selector."
      />

      {billingEnabled ? (
        <AdminSurface className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6" padding>
          <p className="flex-1 text-[14px] text-textItemBlur leading-relaxed">
            Open the standard billing area with your current organization context.
          </p>
          <Link
            href="/billing"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-6 py-3 text-[14px] font-semibold text-white shadow-lg shadow-violet-900/30 hover:from-violet-500 hover:to-violet-400 transition-all"
          >
            Open billing
          </Link>
        </AdminSurface>
      ) : (
        <AdminAlert variant="info">
          Billing is not enabled in this environment (Stripe keys not configured).
        </AdminAlert>
      )}

      {isSuper && billingEnabled ? (
        <p className="mt-6 text-[13px] text-textItemBlur leading-relaxed max-w-[65ch]">
          On the main Billing page, platform super admins can use charge lists, refunds, and
          related actions when the backend exposes those controls.
        </p>
      ) : null}
    </AdminPage>
  );
}
