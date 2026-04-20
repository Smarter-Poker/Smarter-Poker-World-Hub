/**
 * Production Env Guardrails — Phase 6.1.18
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fails fast at boot if any critical security-related env var is missing in
 * production. Prevents silent signature-skip (e.g. the Twilio webhook handler
 * falls open to unsigned requests when TWILIO_AUTH_TOKEN is unset — fine for
 * dev/staging, disastrous in prod).
 *
 * Usage: imported for side-effects by `next.config.js` (build-time) and by
 * the Next.js instrumentation hook `src/instrumentation.js` (runtime). Either
 * path triggers it before the first request is served.
 *
 * Required in production (VERCEL_ENV === 'production'):
 *   - STRIPE_WEBHOOK_SECRET          → commander + store Stripe webhooks
 *   - STRIPE_WEBHOOK_SECRET_COMMANDER → optional venue-scoped override
 *   - TWILIO_AUTH_TOKEN              → Twilio SMS delivery-status webhook
 *   - KYC_WEBHOOK_SECRET             → KYC stub provider auth
 *   - DEPLOY_WEBHOOK_SECRET          → Vercel deploy-monitor webhook
 *   - SUPABASE_SERVICE_ROLE_KEY      → server-side Supabase writes
 *   - NEXT_PUBLIC_SUPABASE_URL       → client + server Supabase SDK
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY  → client Supabase SDK
 *
 * Recommended-but-not-fatal in production (logs a warning):
 *   - OPENAI_API_KEY                 → Geeves assistant
 *   - RESEND_API_KEY                 → transactional email
 *   - SENTRY_DSN                     → error tracking
 *
 * We intentionally DO NOT gate preview/staging on these — partial envs are
 * the whole point of preview deployments.
 */

const REQUIRED_IN_PRODUCTION = [
    'STRIPE_WEBHOOK_SECRET',
    'TWILIO_AUTH_TOKEN',
    'KYC_WEBHOOK_SECRET',
    'DEPLOY_WEBHOOK_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
];

const RECOMMENDED_IN_PRODUCTION = [
    'OPENAI_API_KEY',
    'RESEND_API_KEY',
    'SENTRY_DSN'
];

let _checked = false;

/**
 * Runs the env-guard check. Idempotent — safe to call from multiple entry
 * points. Throws an Error (aborting boot / the request) if required vars are
 * missing in production. In non-production, logs a console.warn and returns.
 *
 * @param {object} opts
 * @param {boolean} [opts.force=false] — re-run the check even if already run.
 * @returns {{ checked: boolean, missing: string[], warnings: string[] }}
 */
function checkProductionEnv(opts = {}) {
    if (_checked && !opts.force) {
        return { checked: false, missing: [], warnings: [] };
    }
    _checked = true;

    const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
    const isProduction = env === 'production';

    const missing = REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]);
    const warnings = RECOMMENDED_IN_PRODUCTION.filter((k) => !process.env[k]);

    if (!isProduction) {
        // Dev / preview / staging: log, don't fail.
        if (missing.length > 0) {
            console.warn(
                `[envGuard] Non-production env (${env}) missing ${missing.length} required vars:`,
                missing.join(', ')
            );
        }
        return { checked: true, missing, warnings };
    }

    // Production path.
    if (missing.length > 0) {
        const msg =
            `[envGuard] FATAL: production deployment missing ${missing.length} required env vars: ${missing.join(', ')}.\n` +
            `Each of these guards a security boundary (webhook signatures, server-side DB auth). ` +
            `Refusing to boot to prevent silent signature-skip or anonymous-service-role exposure.`;
        console.error(msg);
        throw new Error(msg);
    }

    if (warnings.length > 0) {
        console.warn(
            `[envGuard] Production missing ${warnings.length} recommended env vars (degraded features):`,
            warnings.join(', ')
        );
    }

    console.log('[envGuard] All required production env vars present.');
    return { checked: true, missing: [], warnings };
}

// Side-effect export: importing this module triggers the check once.
// This makes it safe to drop into `next.config.js` or the instrumentation
// hook without a separate bootstrap call site.
try {
    checkProductionEnv();
} catch (err) {
    // Re-throw on production so Vercel marks the build/start as failed.
    if (process.env.VERCEL_ENV === 'production') throw err;
    // Non-production: swallow so local dev doesn't get blocked.
}

module.exports = { checkProductionEnv, REQUIRED_IN_PRODUCTION, RECOMMENDED_IN_PRODUCTION };
