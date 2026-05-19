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
import { AdminStripeConnectivityPanel } from '@gitroom/frontend/components/admin/admin.hub.stripe-connectivity.panel';

export function AdminHubStripeTestPage() {
  const user = useUser();
  const { billingEnabled } = useVariables();
  const isSuper = !!user?.isSuperAdmin;

  if (!billingEnabled) {
    return (
      <AdminPage>
        <AdminHero
          eyebrow="Commerce"
          title="Stripe connectivity test"
          description="This page mirrors the tools on Admin → Billing. Publishable billing is off — open Billing for secret-key tests, or enable Stripe keys."
        />
        <AdminAlert variant="info">
          Go to{' '}
          <Link href="/adminisamazing/billing" className="font-semibold text-violet-300 underline">
            /adminisamazing/billing
          </Link>{' '}
          — super admins can run ping, pricing, and test Checkout there even when
          POSTIZ_DISABLE_STRIPE_BILLING is set.
        </AdminAlert>
      </AdminPage>
    );
  }

  if (!isSuper) {
    return (
      <AdminPage>
        <AdminHero
          eyebrow="Commerce"
          title="Stripe connectivity test"
          description="Only platform super administrators can run Stripe diagnostics."
        />
        <AdminSurface padding>
          <Link
            href="/adminisamazing/billing"
            className="text-[14px] font-semibold text-violet-400 hover:underline"
          >
            ← Back to Billing
          </Link>
        </AdminSurface>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Commerce"
        title="Stripe connectivity test"
        description="Same checks as Admin → Billing. Test Checkout returns to the billing page with ?result=."
      />
      <AdminSurface className="mb-4" padding>
        <Link
          href="/adminisamazing/billing"
          className="text-[14px] font-semibold text-violet-400 hover:underline"
        >
          ← Open Billing admin (recommended)
        </Link>
      </AdminSurface>
      <AdminStripeConnectivityPanel
        isSuper={isSuper}
        billingEnabled={billingEnabled}
        includePromoList
      />
    </AdminPage>
  );
}
