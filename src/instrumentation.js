/**
 * Next.js instrumentation hook — runs once at server startup.
 * ════════════════════════════════════════════════════════════════════════
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Two jobs:
 *   1. Production env guardrail (Phase 6.1.18) — runs once per server boot.
 *   2. Sentry SERVER init. `withSentryConfig` is intentionally disabled in
 *      next.config.js (its build-time webpack plugin OOM'd the 8GB Vercel
 *      container on this 950-page repo), so the runtime config has to be
 *      imported by hand. This is a plain runtime import: no source-map upload,
 *      no auto-instrumentation, so the OOM does not come back.
 *
 * 2026-09-04 (docs/SENTRY-FREE-TIER-POLICY.md): the edge and client inits are
 * GONE, not moved. Sentry is on the free Developer plan (5,000 errors a month
 * shared across three projects) and the Hub's browser and edge runtimes were
 * pure quota exposure. Only the Node runtime initialises Sentry now, with a
 * 60-a-day budget enforced inside sentry.server.config.js. middleware.ts
 * reports through POST /api/internal/edge-error, which runs in Node.
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { checkProductionEnv } = require('./lib/envGuard');
        checkProductionEnv({ force: true });
        // Sentry server runtime (Node lambdas + cron). The only runtime that
        // initialises Sentry in this repo.
        await import('../sentry.server.config');
    }
}

// Sentry v8+ nested-RSC / navigation error capture hook. Harmless if unused.
// Runs in whichever runtime threw; in the edge runtime Sentry is not
// initialised and captureRequestError is a no-op there.
export async function onRequestError(...args) {
    try {
        const Sentry = await import('@sentry/nextjs');
        if (typeof Sentry.captureRequestError === 'function') {
            Sentry.captureRequestError(...args);
        }
    } catch (_e) { /* Sentry unavailable — never let instrumentation throw */ }
}
