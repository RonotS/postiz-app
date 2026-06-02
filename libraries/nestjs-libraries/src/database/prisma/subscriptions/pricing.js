"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricing = void 0;
/**
 * Optional micro-pricing for Stripe tests (set on server + client env).
 * Use the same value in `NEXT_PUBLIC_STRIPE_PLAN_PRICE_OVERRIDE_USD` (frontend)
 * and `STRIPE_PLAN_PRICE_OVERRIDE_USD` (backend) so UI and Stripe prices match.
 * Stripe USD card payments require at least $0.50 per charge — checkout will
 * error below that unless you use test mode / test cards per Stripe rules.
 */
function readUsdPlanOverride() {
    try {
        const raw = ((typeof process !== 'undefined' &&
            (process.env.NEXT_PUBLIC_STRIPE_PLAN_PRICE_OVERRIDE_USD ||
                process.env.STRIPE_PLAN_PRICE_OVERRIDE_USD)) ||
            '')
            .toString()
            .trim();
        if (!raw)
            return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    catch {
        return null;
    }
}
const _usdPlanOverride = readUsdPlanOverride();
function withUsdOverride(month, year) {
    if (_usdPlanOverride == null) {
        return { month_price: month, year_price: year };
    }
    const m = _usdPlanOverride;
    const y = Math.max(1, Math.round(m * 100 * 12) / 100);
    return { month_price: m, year_price: y };
}
exports.pricing = {
    FREE: {
        current: 'FREE',
        month_price: 0,
        year_price: 0,
        channel: 0,
        image_generation_count: 0,
        posts_per_month: 0,
        team_members: false,
        community_features: false,
        featured_by_gitroom: false,
        ai: false,
        import_from_channels: false,
        image_generator: false,
        public_api: false,
        webhooks: 0,
        autoPost: false,
        generate_videos: 0,
    },
    STANDARD: {
        current: 'STANDARD',
        ...(() => {
            const { month_price, year_price } = withUsdOverride(29, 278);
            return { month_price, year_price };
        })(),
        channel: 5,
        posts_per_month: 400,
        image_generation_count: 20,
        team_members: false,
        ai: true,
        community_features: false,
        featured_by_gitroom: false,
        import_from_channels: true,
        image_generator: false,
        public_api: true,
        webhooks: 2,
        autoPost: false,
        generate_videos: 3,
    },
    TEAM: {
        current: 'TEAM',
        month_price: 39,
        year_price: 374,
        channel: 10,
        posts_per_month: 1000000,
        image_generation_count: 100,
        community_features: true,
        team_members: true,
        featured_by_gitroom: true,
        ai: true,
        import_from_channels: true,
        image_generator: true,
        public_api: true,
        webhooks: 10,
        autoPost: true,
        generate_videos: 10,
    },
    PRO: {
        current: 'PRO',
        ...(() => {
            const { month_price, year_price } = withUsdOverride(199, 1910);
            return { month_price, year_price };
        })(),
        channel: 30,
        posts_per_month: 1000000,
        image_generation_count: 300,
        community_features: true,
        team_members: true,
        featured_by_gitroom: true,
        ai: true,
        import_from_channels: true,
        image_generator: true,
        public_api: true,
        webhooks: 30,
        autoPost: true,
        generate_videos: 30,
    },
    ULTIMATE: {
        current: 'ULTIMATE',
        month_price: 99,
        year_price: 950,
        channel: 100,
        posts_per_month: 1000000,
        image_generation_count: 500,
        community_features: true,
        team_members: true,
        featured_by_gitroom: true,
        ai: true,
        import_from_channels: true,
        image_generator: true,
        public_api: true,
        webhooks: 10000,
        autoPost: true,
        generate_videos: 60,
    },
};
//# sourceMappingURL=pricing.js.map