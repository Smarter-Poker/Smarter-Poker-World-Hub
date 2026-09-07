function stripeKeyMode(value, expectedPrefix) {
  const key = String(value || '').trim();
  if (new RegExp(`^${expectedPrefix}_live_[A-Za-z0-9]+$`).test(key)) return 'live';
  if (new RegExp(`^${expectedPrefix}_test_[A-Za-z0-9]+$`).test(key)) return 'test';
  return null;
}

function stripeWebhookSecretConfigured(value) {
  const secret = String(value || '').trim();
  return /^whsec_[A-Za-z0-9]{16,256}$/.test(secret);
}

function isProductionRuntime(env = process.env) {
  if (env.VERCEL_ENV === 'production') return true;
  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development') return false;
  return env.NODE_ENV === 'production';
}

function inspectStripeRuntime(env = process.env, {
  requirePublishable = true,
  requireWebhook = false,
} = {}) {
  const secretConfigured = Boolean(String(env.STRIPE_SECRET_KEY || '').trim());
  const publishableConfigured = Boolean(String(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '').trim());
  // A nonempty placeholder must not authorize production charges. Stripe
  // endpoint signing secrets use the whsec_ object prefix and a bounded
  // alphanumeric payload; their actual value remains provider-verified when
  // a signed webhook arrives.
  const webhookConfigured = stripeWebhookSecretConfigured(env.STRIPE_WEBHOOK_SECRET);
  const secretMode = stripeKeyMode(env.STRIPE_SECRET_KEY, 'sk');
  const publishableMode = requirePublishable
    ? stripeKeyMode(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, 'pk')
    : null;
  const keyMode = requirePublishable
    ? secretMode && secretMode === publishableMode ? secretMode : null
    : secretMode;
  const productionModeAllowed = !isProductionRuntime(env) || keyMode === 'live';
  const ready = secretConfigured
    && Boolean(secretMode)
    && (!requirePublishable || (publishableConfigured && Boolean(publishableMode)))
    && (!requireWebhook || webhookConfigured)
    && Boolean(keyMode)
    && productionModeAllowed;

  return {
    ready,
    secretConfigured,
    publishableConfigured,
    webhookConfigured,
    secretMode,
    publishableMode,
    keyMode,
    productionModeAllowed,
  };
}

function stripeEventModeAllowed(event, env = process.env) {
  return !isProductionRuntime(env) || event?.livemode === true;
}

module.exports = {
  inspectStripeRuntime,
  isProductionRuntime,
  stripeEventModeAllowed,
  stripeKeyMode,
  stripeWebhookSecretConfigured,
};
