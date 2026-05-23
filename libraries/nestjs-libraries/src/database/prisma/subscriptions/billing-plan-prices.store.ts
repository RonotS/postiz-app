import { promises as fs } from 'fs';
import path from 'path';
import {
  pricing,
  PricingInnerInterface,
  PricingInterface,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  SUBSCRIBE_BILLING_TIERS,
  SUBSCRIBE_PLANS,
  subscribePlanByBilling,
  type SubscribeBillingTier,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscribe-plans.config';

/** Same tiers as /subscribe — admin pricing edits these only. */
export const EDITABLE_BILLING_TIERS = SUBSCRIBE_BILLING_TIERS;

export type EditableBillingTier = SubscribeBillingTier;

export type PlanPriceRow = {
  month_price: number;
  year_price: number;
};

export type PlanPriceOverrides = Partial<
  Record<EditableBillingTier, PlanPriceRow>
>;

function resolveFilePath(): string {
  const raw = process.env.BILLING_PLAN_PRICES_FILE?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  }
  return path.join(process.cwd(), '.data', 'billing-plan-prices.json');
}

export function defaultPlanPriceOverrides(): PlanPriceOverrides {
  const out: PlanPriceOverrides = {};
  for (const tier of EDITABLE_BILLING_TIERS) {
    const p = pricing[tier];
    out[tier] = {
      month_price: p.month_price,
      year_price: p.year_price,
    };
  }
  return out;
}

export async function readPlanPriceOverridesFromDisk(): Promise<PlanPriceOverrides> {
  const file = resolveFilePath();
  try {
    const text = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(text) as PlanPriceOverrides;
    return sanitizeOverrides(parsed);
  } catch {
    return {};
  }
}

export async function writePlanPriceOverridesToDisk(
  data: PlanPriceOverrides
): Promise<void> {
  const file = resolveFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

export function sanitizeOverrides(raw: PlanPriceOverrides): PlanPriceOverrides {
  const out: PlanPriceOverrides = {};
  for (const tier of EDITABLE_BILLING_TIERS) {
    const row = raw[tier];
    if (!row) continue;
    const month = Number(row.month_price);
    const year = Number(row.year_price);
    if (!Number.isFinite(month) || !Number.isFinite(year)) continue;
    out[tier] = {
      month_price: Math.max(0, Math.round(month * 100) / 100),
      year_price: Math.max(0, Math.round(year * 100) / 100),
    };
  }
  return out;
}

export function mergePlanPrices(
  overrides: PlanPriceOverrides
): PricingInterface {
  const merged = { ...pricing };
  for (const tier of EDITABLE_BILLING_TIERS) {
    const row = overrides[tier];
    if (!row) continue;
    merged[tier] = {
      ...merged[tier],
      month_price: row.month_price,
      year_price: row.year_price,
    };
  }
  return merged;
}

export function tierPricing(
  tier: string,
  overrides: PlanPriceOverrides
): PricingInnerInterface {
  const base = pricing[tier];
  if (!base) {
    throw new Error(`Unknown billing tier: ${tier}`);
  }
  const row = overrides[tier as EditableBillingTier];
  if (!row) return base;
  return {
    ...base,
    month_price: row.month_price,
    year_price: row.year_price,
  };
}

export function validatePlanPriceOverrides(
  data: PlanPriceOverrides
): string | null {
  const sanitized = sanitizeOverrides(data);
  if (Object.keys(sanitized).length === 0) {
    return 'Provide at least one tier with month and year prices.';
  }
  for (const tier of EDITABLE_BILLING_TIERS) {
    const row = sanitized[tier];
    if (!row) continue;
    for (const [label, usd] of [
      ['monthly', row.month_price],
      ['yearly', row.year_price],
    ] as const) {
      if (usd > 0 && usd < 0.5) {
        return `${tier} ${label} price must be at least $0.50 USD when not free (Stripe minimum).`;
      }
    }
  }
  return null;
}

export function adminPlanPricesPayload(overrides: PlanPriceOverrides) {
  const defaults = defaultPlanPriceOverrides();
  const tiers = EDITABLE_BILLING_TIERS.map((tier) => {
    const def = defaults[tier]!;
    const saved = overrides[tier];
    const effective = saved ?? def;
    const meta = subscribePlanByBilling(tier);
    return {
      tier,
      planId: meta?.id ?? tier,
      planName: meta?.name ?? tier,
      month_price: effective.month_price,
      year_price: effective.year_price,
      default_month_price: def.month_price,
      default_year_price: def.year_price,
      isCustom: !!saved,
    };
  });
  return {
    tiers,
    plans: SUBSCRIBE_PLANS,
    storagePath: resolveFilePath(),
    editableTiers: [...EDITABLE_BILLING_TIERS],
  };
}

export function publicPlanPricesPayload(overrides: PlanPriceOverrides) {
  const merged = mergePlanPrices(overrides);
  const prices: Record<string, PlanPriceRow> = {};
  for (const tier of EDITABLE_BILLING_TIERS) {
    prices[tier] = {
      month_price: merged[tier].month_price,
      year_price: merged[tier].year_price,
    };
  }
  if (pricing.FREE) {
    prices.FREE = {
      month_price: pricing.FREE.month_price,
      year_price: pricing.FREE.year_price,
    };
  }
  return {
    prices,
    plans: SUBSCRIBE_PLANS.map((plan) => ({
      id: plan.id,
      name: plan.name,
      billing: plan.billing,
      defaultMonthPrice: plan.defaultMonthPrice,
      description: plan.description,
      features: plan.features,
      featured: plan.featured ?? false,
      accent: plan.accent ?? 'white',
    })),
  };
}
