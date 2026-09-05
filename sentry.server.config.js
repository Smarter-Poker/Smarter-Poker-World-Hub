/**
 * Sentry Server Configuration (the ONLY Sentry runtime in this repo)
 * ═══════════════════════════════════════════════════════════════════════════
 * Policy: docs/SENTRY-FREE-TIER-POLICY.md (2026-09-04, binding).
 *
 * Sentry is on the free Developer plan: 5,000 errors a month shared by the
 * World Hub server, the Arena client and the engine. This runtime's share is
 * 60 events a day with a per-fingerprint cap of 3. Both are enforced in
 * `beforeSend` through src/lib/sentryBudget.js, which keeps the bucket in
 * Postgres because Vercel lambdas do not share memory. When the bucket is
 * empty (or unreachable) the event is dropped and console.warn says so.
 *
 * Tracing, profiling and replay are OFF, not sampled low. 5M spans a month is
 * six days of engine hand tracing; none of it is worth an error we cannot see.
 *
 * Who may send: see the allowlist in vendor/commander-shared/src/lib/sentryWrap.js.
 * The other ~500 API routes still call reportApiError(), which logs to the
 * console (Vercel captures it) and, for money-shaped failures, writes a row to
 * financial_alerts. They do not reach this file.
 *
 * Loaded by src/instrumentation.js in the Node runtime only. There is no
 * client config and no edge config any more; do not add them back.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as Sentry from '@sentry/nextjs';
import { takeBudget, DAILY_BUDGET, FINGERPRINT_BUDGET } from './src/lib/sentryBudget';

const SENTRY_DSN = (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim();

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Attribute every event to a deploy. withSentryConfig is bypassed for the
    // 8GB Vercel OOM, so nothing sets this automatically.
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,

    // Free tier: errors only. These are 0, not "low". Do not raise them.
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Only enable in production
    enabled: process.env.NODE_ENV === 'production',

    // Daily budget + per-fingerprint cap, then scrub. Async beforeSend is
    // supported by the SDK (v8+); callers on money paths await
    // flushSentry() so the lambda does not freeze before the send.
    async beforeSend(event) {
      const allowed = await takeBudget(event, {
        daily: DAILY_BUDGET,
        perFingerprint: FINGERPRINT_BUDGET,
      });
      if (!allowed) return null;

      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers['x-admin-secret'];
      }
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/token=[^&]+/g, 'token=REDACTED');
      }

      return event;
    },

    // Tag all WH server errors. The repo covers hub pages, landing, blog,
    // training, social, poker-near-me, Club Commander and the cron fleet.
    initialScope: {
      tags: {
        app: 'world-hub',
        runtime: 'server',
      },
    },
  });

  console.log(`Sentry initialized (server) - budget ${DAILY_BUDGET}/day, ${FINGERPRINT_BUDGET}/fingerprint/day`);
}
