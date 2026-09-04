/**
 * Sentry Server Configuration
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim();

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Attribute every event to a deploy. withSentryConfig is bypassed for the
    // 8GB Vercel OOM, so nothing sets this automatically.
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Only enable in production
    enabled: process.env.NODE_ENV === 'production',

    // Before sending, scrub sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }

      return event;
    },

    // Tag all WH server errors — the repo covers hub pages, landing,
    // blog, training, social, poker-near-me, Club Commander, and the
    // 57 cron jobs. Commander gets its own sub-tag via withSentry per-page
    // where finer granularity is needed.
    initialScope: {
      tags: {
        app: 'world-hub',
        runtime: 'server',
      },
    },
  });

  console.log('Sentry initialized (server)');
}
