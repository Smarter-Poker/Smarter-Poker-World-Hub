/**
 * Sentry Edge Runtime Configuration — World Hub
 *
 * REQUIRED for @sentry/nextjs >= 8 when any middleware.ts or edge-runtime
 * API route is present. Without this file, errors thrown in the edge
 * runtime (our middleware.ts enforces admin/debug/emergency 403s and
 * geo-blocking) are silently swallowed and never reach Sentry.
 *
 * Env:
 *   NEXT_PUBLIC_SENTRY_DSN — same DSN as client+server; edge runtime
 *   reads this at build time.
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim();

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Edge runtime has stricter compute budgets — sample lower than server.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

    // Only enable in production (same pattern as client/server configs).
    enabled: process.env.NODE_ENV === 'production',

    // Scope all edge-runtime events to the correct app tag.
    initialScope: {
      tags: {
        app: 'world-hub',
        runtime: 'edge',
      },
    },

    // Scrub sensitive headers (middleware sees every admin request).
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers['x-admin-secret'];
      }
      return event;
    },
  });

  console.log('Sentry initialized (edge)');
}
