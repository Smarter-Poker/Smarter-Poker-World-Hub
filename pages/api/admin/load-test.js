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

export default async function handler(req, res) {
    // Basic auth check - only allow in development or with admin token
    if (process.env.NODE_ENV === 'production') {
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_TOKEN}`) {
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
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
