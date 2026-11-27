import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
/**
 * Sandbox Templates API
 * GET:    List user's saved templates
 * POST:   Save a new template
 * DELETE:  Remove a template by ID
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { persistedResult, persistenceFailure } from '../../../../src/lib/personal-assistant/persistenceContract';
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required');
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const limit = req.method === 'GET' ? (LIMITS.read || { max: 60, windowMs: 60_000 }) : LIMITS.write;
  if (!applyRateLimit(req, res, limit)) return;

    try {
        const { user: authUser, error: authErr, status: authStatus } = await getServerUserWithFallback(req, getSupabase());

        const user = authUser;
        if (authErr || !user) {
            return res.status(authStatus === 503 ? 503 : 401).json({
                error: authStatus === 503 ? 'Session verification unavailable' : 'Invalid token',
            });
        }

        if (req.method === 'GET') {
            const { data, error } = await getSupabase()
                .from('sandbox_templates')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(30);

            if (error) {
                if (error.code === '42P01') return res.status(503).json(persistenceFailure(
                    'Templates are temporarily unavailable.',
                    'storage_unavailable',
                    { templates: [] },
                ));
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }
            return res.status(200).json({ success: true, persisted: true, templates: data || [] });
        }

        if (req.method === 'POST') {
            const { name, scenario } = req.body || {};
            if (!name || !scenario) return res.status(400).json({ error: 'Name and scenario required' });

            // Bound the stored payload · scenario_json is otherwise unlimited.
            let scenarioSize = 0;
            try {
                scenarioSize = JSON.stringify(scenario).length;
            } catch (_e) {
                return res.status(400).json({ error: 'Scenario must be serializable JSON' });
            }
            if (scenarioSize > 20000) {
                return res.status(413).json({ error: 'Scenario too large' });
            }

            // Keep the per-user write cap aligned with the complete owner list.
            const { count, error: countErr } = await getSupabase()
                .from('sandbox_templates')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id);

            if (countErr) {
                return res.status(503).json(persistenceFailure(
                    'Templates are temporarily unavailable.',
                    countErr.code === '42P01' ? 'storage_unavailable' : 'read_failed',
                ));
            }
            if (typeof count === 'number' && count >= 30) {
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
                if (error.code === '42P01') return res.status(503).json(persistenceFailure(
                    'Templates are temporarily unavailable.',
                    'storage_unavailable',
                ));
                return res.status(500).json({ error: 'Internal server error' });
            }

            return res.status(201).json(persistedResult(data, { template: data }));
        }

        if (req.method === 'DELETE') {
            // Next parses an empty DELETE body to `{}` (truthy), so
            // `req.body || req.query` never reached the query string.
            const rawId = req.body?.id ?? req.query?.id;
            const id = String(rawId || '').trim();
            if (!id) return res.status(400).json({ error: 'Template ID required' });
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
                return res.status(400).json({ error: 'Valid template ID required' });
            }

            const { data: deletedRows, error } = await getSupabase()
                .from('sandbox_templates')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id)
                .select('id');

            if (error) {
                if (error.code === '42P01') return res.status(503).json(persistenceFailure(
                    'Templates are temporarily unavailable. Nothing was deleted.',
                    'storage_unavailable',
                ));
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }
            if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
                return res.status(404).json({ success: false, error: 'Template not found' });
            }
            return res.status(200).json(persistedResult({ id, deleted: deletedRows.length }));
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        try { reportApiError(e, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.warn('[Templates API] Error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
