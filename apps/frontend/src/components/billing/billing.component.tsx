'use client';

import { useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { BillingAccountComponent } from './billing-account.component';
export const BillingComponent = () => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { isLoading: isLoadingTier, data: tiers } = useSWR(
    '/user/subscription/tiers',
    load
  );
  const { isLoading: isLoadingSubscription, data: subscription } = useSWR(
    '/user/subscription',
    load
  );
  if (isLoadingSubscription || isLoadingTier) {
    return <LoadingComponent />;
  }
  return (
    <BillingAccountComponent sub={subscription?.subscription} />
  );
};
