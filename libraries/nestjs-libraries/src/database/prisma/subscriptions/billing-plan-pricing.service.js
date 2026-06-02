"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingPlanPricingService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const billing_plan_prices_store_1 = require("./billing-plan-prices.store");
let BillingPlanPricingService = class BillingPlanPricingService {
    constructor() {
        this.overrides = {};
    }
    async onModuleInit() {
        await this.reload();
    }
    async reload() {
        this.overrides = await (0, billing_plan_prices_store_1.readPlanPriceOverridesFromDisk)();
    }
    getTier(tier) {
        return (0, billing_plan_prices_store_1.tierPricing)(tier, this.overrides);
    }
    getAdminView() {
        return (0, billing_plan_prices_store_1.adminPlanPricesPayload)(this.overrides);
    }
    getPublicPrices() {
        return (0, billing_plan_prices_store_1.publicPlanPricesPayload)(this.overrides);
    }
    async updateFromAdmin(body) {
        const sanitized = (0, billing_plan_prices_store_1.sanitizeOverrides)(body);
        const err = (0, billing_plan_prices_store_1.validatePlanPriceOverrides)(sanitized);
        if (err) {
            return { ok: false, message: err };
        }
        await (0, billing_plan_prices_store_1.writePlanPriceOverridesToDisk)(sanitized);
        this.overrides = sanitized;
        return { ok: true, ...this.getAdminView() };
    }
};
exports.BillingPlanPricingService = BillingPlanPricingService;
exports.BillingPlanPricingService = BillingPlanPricingService = tslib_1.__decorate([
    (0, common_1.Injectable)()
], BillingPlanPricingService);
//# sourceMappingURL=billing-plan-pricing.service.js.map