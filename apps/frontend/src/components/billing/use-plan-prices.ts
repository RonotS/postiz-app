'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  pricing,
  PricingInterface,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

type PlanPricesResponse = {
  prices: Record<string, { month_price: number; year_price: number }>;
};

export function usePlanPrices() {
  const fetch = useFetch();
  const { data } = useSWR<PlanPricesResponse>(
    '/billing/plan-prices',
    async (path) => (await fetch(path)).json(),
    { revalidateOnFocus: true }
  );

  const effectivePricing: PricingInterface = useMemo(() => {
    const merged = { ...pricing };
    const fromApi = data?.prices;
    if (!fromApi) return merged;
    for (const [tier, row] of Object.entries(fromApi)) {
      if (merged[tier]) {
        merged[tier] = {
          ...merged[tier],
          month_price: row.month_price,
          year_price: row.year_price,
        };
      }
    }
    return merged;
  }, [data]);

  return { effectivePricing, loaded: !!data };
}
