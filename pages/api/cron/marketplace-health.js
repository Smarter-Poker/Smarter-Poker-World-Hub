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

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, healthy: false, error: 'Method not allowed' });
  }
  if (!requireAdminSecret(req, res, { label: 'marketplace-health' })) return;

  try {
    const readiness = await getMarketplaceReadiness({ force: true });
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
