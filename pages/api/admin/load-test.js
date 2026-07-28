/**
 * Load Test API - Run load tests from admin panel
 *
 * POST /api/admin/load-test
 *   { url, method, concurrency, totalRequests, headers, body }
 *
 * GET /api/admin/load-test
 *   Returns default test suite configuration
 */
import { runLoadTest, getDefaultTestSuite } from '../../../src/lib/loadTest';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    // Basic auth check - only allow in development or with admin token
    if (process.env.NODE_ENV === 'production') {
        // SECURITY: a missing ADMIN_API_TOKEN is a server misconfiguration, not
        // a grant. This previously FAILED OPEN in production: with the token
        // unset the template collapsed to the literal string "Bearer undefined",
        // so `Authorization: Bearer undefined` authenticated any caller.
        const adminApiToken = process.env.ADMIN_API_TOKEN;
        if (!adminApiToken) {
            console.warn('[load-test] ADMIN_API_TOKEN is not configured — rejecting request');
            return res.status(500).json({ error: 'Server misconfigured' });
        }
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${adminApiToken}`) {
            return res.status(403).json({ error: 'Forbidden - Admin access required' });
        }
    }

    if (req.method === 'GET') {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:3000`;
        return res.status(200).json({
            success: true,
            defaultSuite: getDefaultTestSuite(baseUrl),
        });
    }

    if (req.method === 'POST') {
        const { url, method = 'GET', concurrency = 10, totalRequests = 50, headers = {}, body } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'url is required' });
        }

        // Limit concurrency and total requests to prevent abuse
        const safeConcurrency = Math.min(concurrency, 50);
        const safeTotal = Math.min(totalRequests, 500);

        try {
            const results = await runLoadTest({
                url,
                method,
                concurrency: safeConcurrency,
                totalRequests: safeTotal,
                headers,
                body,
            });

            return res.status(200).json({ success: true, results });
        } catch (error) {
            try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
