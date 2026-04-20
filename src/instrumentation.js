/**
 * Next.js instrumentation hook — runs once at server startup.
 * ════════════════════════════════════════════════════════════════════════
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use this hook to run the production env guardrail (Phase 6.1.18) once
 * per server boot. Requires `experimental.instrumentationHook: true` in
 * next.config.js for Next.js 14 (becomes stable / default-on in Next 15+).
 *
 * The envGuard module self-executes its check on import in any environment,
 * but the instrumentation hook is the canonical "runs once at boot, fails
 * hard if misconfigured" entry point — so we wire it here as the primary
 * call site. The side-effect import in envGuard.js covers the edge case
 * where instrumentation is disabled.
 */

export async function register() {
    // Only run on the Node.js server runtime — skip on Edge runtime to avoid
    // pulling `process.env.VERCEL_ENV` checks into edge workers that don't
    // carry the full env surface anyway.
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { checkProductionEnv } = require('./lib/envGuard');
        checkProductionEnv({ force: true });
    }
}
