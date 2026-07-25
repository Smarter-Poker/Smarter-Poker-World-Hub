/**
 * Next.js CLIENT instrumentation — runs once when the app boots in the browser.
 * ════════════════════════════════════════════════════════════════════════
 * [2026-07-25] Restores client-side Sentry. With `withSentryConfig` disabled
 * (build OOM workaround, see src/instrumentation.js), the Sentry SDK's normal
 * client-config injection never happened, so sentry.client.config.js was dead
 * code and browser errors went uncaptured. Next.js 15.3+/16 auto-loads this
 * file in the browser; importing the config here runs Sentry.init() client-side
 * without the build-time plugin. Init is gated to production inside the config
 * (`enabled: NODE_ENV === 'production'`), so dev is unaffected.
 */
import '../sentry.client.config';

// Capture client-side navigation transitions (Sentry v8+ App Router hook).
export async function onRouterTransitionStart(...args) {
    try {
        const Sentry = await import('@sentry/nextjs');
        if (typeof Sentry.captureRouterTransitionStart === 'function') {
            Sentry.captureRouterTransitionStart(...args);
        }
    } catch (_e) { /* never let instrumentation throw */ }
}
