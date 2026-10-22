/**
 * GET /api/cron/marketplace-health
 *
 * Runs the strict marketplace dependency probe on a schedule. A degraded
 * provider, catalog, or checkout capability returns 503 so Vercel cron health,
 */
import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getMarketplaceReadiness } from '../store/readiness';

export const config = { maxDuration: 30 };

const CONFIRM_DELAY_MS = 3_000;
const CONFIRM_BUDGET_MS = 12_000;

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, healthy: false, error: 'Method not allowed' });
  }
  if (!requireAdminSecret(req, res, { label: 'marketplace-health' })) return;

  try {
    const startedAt = Date.now();
    let readiness = await getMarketplaceReadiness({ force: true });
    let confirmed = false;
    // A single failed probe is usually a provider blip, not an outage: 177
    // alarms in 7 days (2026-10-22 audit) while every on-demand probe passed.
    // Confirm a failure once, after a short pause, before calling the
    // marketplace degraded. Skipped when the first probe already used most of
    // the 30 s budget, so the cron can never time out on the retry.
    if (readiness.ready !== true && Date.now() - startedAt < CONFIRM_BUDGET_MS) {
      await new Promise((resolve) => setTimeout(resolve, CONFIRM_DELAY_MS));
      readiness = await getMarketplaceReadiness({ force: true });
      confirmed = readiness.ready !== true;
    }
    const healthy = readiness.ready === true;
    if (!healthy) {
      const failed = Object.entries(readiness.checks || {})
        .filter(([, okay]) => okay !== true)
        .map(([name]) => name)
        .join(',') || 'capability';
      try {
        reportApiError(new Error(`Marketplace health degraded: ${failed}`), {
          route: '/api/cron/marketplace-health',
          failedDependencies: failed,
          confirmed,
        });
      } catch (_) {
        // The HTTP 503 and cron health row remain the primary signals.
      }
    }
    return res.status(healthy ? 200 : 503).json({
      ...readiness,
      healthy,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_) { /* best effort */ }
    return res.status(500).json({
      success: false,
      ready: false,
      healthy: false,
      status: 'error',
      error: 'marketplace_health_failed',
    });
  }
}

export default withCronHealth('marketplace-health', handler);
