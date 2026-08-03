import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
/**
 * Sandbox Templates API
 * GET:    List user's saved templates
 * POST:   Save a new template
 * DELETE:  Remove a template by ID
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    try {
        // Extract user from auth header
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());

        const user = authUser;
        if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

        if (req.method === 'GET') {
            const { data, error } = await getSupabase()
                .from('sandbox_templates')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) return res.status(500).json({ error: 'Internal server error' });
            return res.status(200).json({ templates: data || [] });
        }

        if (req.method === 'POST') {
            const { name, scenario } = req.body || {};
            if (!name || !scenario) return res.status(400).json({ error: 'Name and scenario required' });

            // Bound the stored payload — scenario_json is otherwise unlimited.
            let scenarioSize = 0;
            try {
                scenarioSize = JSON.stringify(scenario).length;
            } catch (_e) {
                return res.status(400).json({ error: 'Scenario must be serializable JSON' });
            }
            if (scenarioSize > 20000) {
                return res.status(413).json({ error: 'Scenario too large' });
            }

            // Per-user template cap (GET only lists 20; inserts were unbounded).
            const { count, error: countErr } = await getSupabase()
                .from('sandbox_templates')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id);

            if (!countErr && typeof count === 'number' && count >= 30) {
                return res.status(409).json({ error: 'Template limit reached (30). Delete one first.' });
            }

            const { data, error } = await getSupabase()
                .from('sandbox_templates')
                .insert({
                    user_id: user.id,
                    name: String(name).substring(0, 100),
                    scenario_json: scenario,
                })
                .select()
                .maybeSingle();

            if (error) {
                console.warn('[Templates] Save error:', error.message);
                return res.status(500).json({ error: 'Internal server error' });
            }

            return res.status(201).json({ template: data });
        }

        if (req.method === 'DELETE') {
            // Next parses an empty DELETE body to `{}` (truthy), so
            // `req.body || req.query` never reached the query string.
            const id = req.body?.id ?? req.query?.id;
            if (!id) return res.status(400).json({ error: 'Template ID required' });

            const { error } = await getSupabase()
                .from('sandbox_templates')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) return res.status(500).json({ error: 'Internal server error' });
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Templates API] Error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
