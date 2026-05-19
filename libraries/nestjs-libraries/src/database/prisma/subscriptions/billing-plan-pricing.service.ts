import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  adminPlanPricesPayload,
  PlanPriceOverrides,
  publicPlanPricesPayload,
  readPlanPriceOverridesFromDisk,
  sanitizeOverrides,
  tierPricing,
  validatePlanPriceOverrides,
  writePlanPriceOverridesToDisk,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/billing-plan-prices.store';

@Injectable()
export class BillingPlanPricingService implements OnModuleInit {
  private overrides: PlanPriceOverrides = {};

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    this.overrides = await readPlanPriceOverridesFromDisk();
  }

  getTier(tier: string) {
    return tierPricing(tier, this.overrides);
  }

  getAdminView() {
    return adminPlanPricesPayload(this.overrides);
  }

  getPublicPrices() {
    return publicPlanPricesPayload(this.overrides);
  }

  async updateFromAdmin(body: PlanPriceOverrides) {
    const sanitized = sanitizeOverrides(body);
    const err = validatePlanPriceOverrides(sanitized);
    if (err) {
      return { ok: false as const, message: err };
    }
    await writePlanPriceOverridesToDisk(sanitized);
    this.overrides = sanitized;
    return { ok: true as const, ...this.getAdminView() };
  }
}
