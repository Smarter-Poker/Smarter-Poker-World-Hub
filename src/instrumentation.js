/**
 * Next.js instrumentation hook — runs once at server startup.
 * ════════════════════════════════════════════════════════════════════════
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Two jobs:
 *   1. Production env guardrail (Phase 6.1.18) — runs once per server boot.
 *   2. [2026-07-25] Sentry server/edge init. `withSentryConfig` is intentionally
 *      disabled in next.config.js (its build-time webpack plugin OOM'd the 8GB
 *      Vercel container on this 950-page repo). But disabling the plugin ALSO
 *      stopped the runtime Sentry.init() in sentry.*.config.js from ever
 *      loading — so error tracking was silently DEAD in prod (no auth/signup
 *      errors, no API 500s, nothing reached Sentry). Importing the runtime
 *      config here restores capture WITHOUT re-enabling the build-time plugin:
 *      this is a plain runtime import, it does not trigger source-map upload or
 *      auto-instrumentation, so the OOM does not come back.
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { checkProductionEnv } = require('./lib/envGuard');
        checkProductionEnv({ force: true });
        // Sentry server runtime (Node lambdas + cron).
        await import('../sentry.server.config');
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        // Sentry edge runtime (middleware + edge routes).
        await import('../sentry.edge.config');
    }
}

// Sentry v8+ nested-RSC / navigation error capture hook. Harmless if unused.
export async function onRequestError(...args) {
    try {
        const Sentry = await import('@sentry/nextjs');
        if (typeof Sentry.captureRequestError === 'function') {
            Sentry.captureRequestError(...args);
        }
    } catch (_e) { /* Sentry unavailable — never let instrumentation throw */ }
}
