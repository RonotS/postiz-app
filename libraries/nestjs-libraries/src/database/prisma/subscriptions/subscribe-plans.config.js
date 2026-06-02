"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBSCRIBE_PLANS = exports.SUBSCRIBE_BILLING_TIERS = void 0;
exports.subscribePlanByBilling = subscribePlanByBilling;
exports.subscribePlanDisplayName = subscribePlanDisplayName;
exports.isSubscribeBillingTier = isSubscribeBillingTier;
/**
 * Single source of truth for public subscription plans (/subscribe + admin pricing).
 * Stripe billing tier keys (TEAM, ULTIMATE, PRO) are internal; display names match the pricing page.
 */
exports.SUBSCRIBE_BILLING_TIERS = ['TEAM', 'ULTIMATE', 'PRO'];
exports.SUBSCRIBE_PLANS = [
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
function subscribePlanByBilling(billing) {
    return exports.SUBSCRIBE_PLANS.find((p) => p.billing === billing);
}
function subscribePlanDisplayName(billing) {
    return subscribePlanByBilling(billing)?.name ?? billing;
}
function isSubscribeBillingTier(tier) {
    return exports.SUBSCRIBE_BILLING_TIERS.includes(tier);
}
//# sourceMappingURL=subscribe-plans.config.js.map