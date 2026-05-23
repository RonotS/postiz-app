/**
 * Single source of truth for public subscription plans (/subscribe + admin pricing).
 * Stripe billing tier keys (TEAM, ULTIMATE, PRO) are internal; display names match the pricing page.
 */
export const SUBSCRIBE_BILLING_TIERS = ['TEAM', 'ULTIMATE', 'PRO'] as const;

export type SubscribeBillingTier = (typeof SUBSCRIBE_BILLING_TIERS)[number];

export type SubscribePlanConfig = {
  id: 'core' | 'pro' | 'enterprise';
  name: string;
  billing: SubscribeBillingTier;
  defaultMonthPrice: number;
  description: string;
  features: string[];
  featured?: boolean;
  accent?: 'white' | 'blue';
};

export const SUBSCRIBE_PLANS: SubscribePlanConfig[] = [
  {
    id: 'core',
    name: 'Core Plan',
    billing: 'TEAM',
    defaultMonthPrice: 39,
    accent: 'white',
    description: 'Everything you need to start automating your X engagement.',
    features: [
      '1 connected account',
      '2,000 auto DMs per month',
      'Auto-reply and post plug',
      'Full engagement analytics',
    ],
  },
  {
    id: 'pro',
    name: 'Pro Plan',
    billing: 'ULTIMATE',
    defaultMonthPrice: 99,
    accent: 'blue',
    featured: true,
    description: 'Scale your outreach across multiple accounts and unlimited posts.',
    features: [
      'Up to 3 connected accounts',
      '7,500 auto DMs per month',
      'Unlimited scheduled posts',
      'Full engagement analytics',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    billing: 'PRO',
    defaultMonthPrice: 199,
    accent: 'white',
    description: 'Maximum throughput for agencies and power creators.',
    features: [
      '15,000 auto DMs per month',
      'Up to 3 connected accounts',
      'Unlimited scheduled posts',
      'Full engagement analytics',
    ],
  },
];

export function subscribePlanByBilling(
  billing: string
): SubscribePlanConfig | undefined {
  return SUBSCRIBE_PLANS.find((p) => p.billing === billing);
}

export function subscribePlanDisplayName(billing: string): string {
  return subscribePlanByBilling(billing)?.name ?? billing;
}

export function isSubscribeBillingTier(
  tier: string
): tier is SubscribeBillingTier {
  return (SUBSCRIBE_BILLING_TIERS as readonly string[]).includes(tier);
}
