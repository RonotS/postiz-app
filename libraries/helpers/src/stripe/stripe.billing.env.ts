/**
 * Central Stripe billing env resolution.
 * Supports Postiz legacy names and common Stripe / Next.js naming.
 */

/** When true, Stripe keys are ignored and billing is off (no first-billing gate, backend treats billing as disabled). */
function isStripeBillingDisabledByEnv(): boolean {
  const raw =
    process.env.POSTIZ_DISABLE_STRIPE_BILLING ??
    process.env.DISABLE_STRIPE_BILLING ??
    process.env.NEXT_PUBLIC_POSTIZ_DISABLE_STRIPE_BILLING ??
    '';
  return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

export function getStripePublishableKey(): string | undefined {
  if (isStripeBillingDisabledByEnv()) {
    return undefined;
  }
  return (
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    undefined
  );
}

export function isStripeBillingEnabled(): boolean {
  return !!getStripePublishableKey();
}

/** Webhook signing secret (Dashboard → Webhooks → Signing secret, starts with whsec_) */
export function getStripeWebhookSigningSecret(): string | undefined {
  return (
    process.env.STRIPE_SIGNING_KEY ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    undefined
  );
}
