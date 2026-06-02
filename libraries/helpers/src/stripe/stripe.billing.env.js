"use strict";
/**
 * Central Stripe billing env resolution.
 * Supports Postiz legacy names and common Stripe / Next.js naming.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStripePublishableKey = getStripePublishableKey;
exports.isStripeBillingEnabled = isStripeBillingEnabled;
exports.getStripeWebhookSigningSecret = getStripeWebhookSigningSecret;
/** When true, Stripe keys are ignored and billing is off (no first-billing gate, backend treats billing as disabled). */
function isStripeBillingDisabledByEnv() {
    const raw = process.env.POSTIZ_DISABLE_STRIPE_BILLING ??
        process.env.DISABLE_STRIPE_BILLING ??
        process.env.NEXT_PUBLIC_POSTIZ_DISABLE_STRIPE_BILLING ??
        '';
    return /^(1|true|yes|on)$/i.test(String(raw).trim());
}
function getStripePublishableKey() {
    if (isStripeBillingDisabledByEnv()) {
        return undefined;
    }
    return (process.env.STRIPE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
        undefined);
}
function isStripeBillingEnabled() {
    return !!getStripePublishableKey();
}
/** Webhook signing secret (Dashboard → Webhooks → Signing secret, starts with whsec_) */
function getStripeWebhookSigningSecret() {
    return (process.env.STRIPE_SIGNING_KEY ||
        process.env.STRIPE_WEBHOOK_SECRET ||
        undefined);
}
//# sourceMappingURL=stripe.billing.env.js.map