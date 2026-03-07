/**
 * GET /api/arcade/leaderboard
 * Get arcade leaderboard for a specific period
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CDN cache: fresh for 30s, serve stale up to 120s
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  }

    // Require JWT auth for write operations
    if (req.method !== 'GET') {
        const _token = req.headers.authorization?.replace('Bearer ', '');
        if (!_token) return res.status(401).json({ error: 'Authentication required' });
        const { data: { user: _authUser }, error: _authErr } = await supabaseAdmin.auth.getUser(_token);
        if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });
        if (req.body) req.body.userId = _authUser.id;
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { period = 'daily', limit = 20 } = req.query;

    try {
        const { data, error } = await supabaseAdmin.rpc('get_arcade_leaderboard', {
            p_period: period,
            p_limit: parseInt(limit)
        });

        if (error) {
            console.error('Leaderboard error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json(data || []);
    } catch (err) {
        console.error('API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
