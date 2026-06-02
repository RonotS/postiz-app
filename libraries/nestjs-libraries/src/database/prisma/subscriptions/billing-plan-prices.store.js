"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDITABLE_BILLING_TIERS = void 0;
exports.defaultPlanPriceOverrides = defaultPlanPriceOverrides;
exports.readPlanPriceOverridesFromDisk = readPlanPriceOverridesFromDisk;
exports.writePlanPriceOverridesToDisk = writePlanPriceOverridesToDisk;
exports.sanitizeOverrides = sanitizeOverrides;
exports.mergePlanPrices = mergePlanPrices;
exports.tierPricing = tierPricing;
exports.validatePlanPriceOverrides = validatePlanPriceOverrides;
exports.adminPlanPricesPayload = adminPlanPricesPayload;
exports.publicPlanPricesPayload = publicPlanPricesPayload;
const tslib_1 = require("tslib");
const fs_1 = require("fs");
const path_1 = tslib_1.__importDefault(require("path"));
const pricing_1 = require("./pricing");
const subscribe_plans_config_1 = require("./subscribe-plans.config");
/** Same tiers as /subscribe — admin pricing edits these only. */
exports.EDITABLE_BILLING_TIERS = subscribe_plans_config_1.SUBSCRIBE_BILLING_TIERS;
function resolveFilePath() {
    const raw = process.env.BILLING_PLAN_PRICES_FILE?.trim();
    if (raw) {
        return path_1.default.isAbsolute(raw) ? raw : path_1.default.join(process.cwd(), raw);
    }
    return path_1.default.join(process.cwd(), '.data', 'billing-plan-prices.json');
}
function defaultPlanPriceOverrides() {
    const out = {};
    for (const tier of exports.EDITABLE_BILLING_TIERS) {
        const p = pricing_1.pricing[tier];
        out[tier] = {
            month_price: p.month_price,
            year_price: p.year_price,
        };
    }
    return out;
}
async function readPlanPriceOverridesFromDisk() {
    const file = resolveFilePath();
    try {
        const text = await fs_1.promises.readFile(file, 'utf8');
        const parsed = JSON.parse(text);
        return sanitizeOverrides(parsed);
    }
    catch {
        return {};
    }
}
async function writePlanPriceOverridesToDisk(data) {
    const file = resolveFilePath();
    await fs_1.promises.mkdir(path_1.default.dirname(file), { recursive: true });
    await fs_1.promises.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}
function sanitizeOverrides(raw) {
    const out = {};
    for (const tier of exports.EDITABLE_BILLING_TIERS) {
        const row = raw[tier];
        if (!row)
            continue;
        const month = Number(row.month_price);
        const year = Number(row.year_price);
        if (!Number.isFinite(month) || !Number.isFinite(year))
            continue;
        out[tier] = {
            month_price: Math.max(0, Math.round(month * 100) / 100),
            year_price: Math.max(0, Math.round(year * 100) / 100),
        };
    }
    return out;
}
function mergePlanPrices(overrides) {
    const merged = { ...pricing_1.pricing };
    for (const tier of exports.EDITABLE_BILLING_TIERS) {
        const row = overrides[tier];
        if (!row)
            continue;
        merged[tier] = {
            ...merged[tier],
            month_price: row.month_price,
            year_price: row.year_price,
        };
    }
    return merged;
}
function tierPricing(tier, overrides) {
    const base = pricing_1.pricing[tier];
    if (!base) {
        throw new Error(`Unknown billing tier: ${tier}`);
    }
    const row = overrides[tier];
    if (!row)
        return base;
    return {
        ...base,
        month_price: row.month_price,
        year_price: row.year_price,
    };
}
function validatePlanPriceOverrides(data) {
    const sanitized = sanitizeOverrides(data);
    if (Object.keys(sanitized).length === 0) {
        return 'Provide at least one tier with month and year prices.';
    }
    for (const tier of exports.EDITABLE_BILLING_TIERS) {
        const row = sanitized[tier];
        if (!row)
            continue;
        for (const [label, usd] of [
            ['monthly', row.month_price],
            ['yearly', row.year_price],
        ]) {
            if (usd > 0 && usd < 0.5) {
                return `${tier} ${label} price must be at least $0.50 USD when not free (Stripe minimum).`;
            }
        }
    }
    return null;
}
function adminPlanPricesPayload(overrides) {
    const defaults = defaultPlanPriceOverrides();
    const tiers = exports.EDITABLE_BILLING_TIERS.map((tier) => {
        const def = defaults[tier];
        const saved = overrides[tier];
        const effective = saved ?? def;
        const meta = (0, subscribe_plans_config_1.subscribePlanByBilling)(tier);
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
        plans: subscribe_plans_config_1.SUBSCRIBE_PLANS,
        storagePath: resolveFilePath(),
        editableTiers: [...exports.EDITABLE_BILLING_TIERS],
    };
}
function publicPlanPricesPayload(overrides) {
    const merged = mergePlanPrices(overrides);
    const prices = {};
    for (const tier of exports.EDITABLE_BILLING_TIERS) {
        prices[tier] = {
            month_price: merged[tier].month_price,
            year_price: merged[tier].year_price,
        };
    }
    if (pricing_1.pricing.FREE) {
        prices.FREE = {
            month_price: pricing_1.pricing.FREE.month_price,
            year_price: pricing_1.pricing.FREE.year_price,
        };
    }
    return {
        prices,
        plans: subscribe_plans_config_1.SUBSCRIBE_PLANS.map((plan) => ({
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
//# sourceMappingURL=billing-plan-prices.store.js.map