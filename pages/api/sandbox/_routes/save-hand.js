/**
 * POST / DELETE /api/sandbox/save-hand
 * W6-1: Persists or removes a configured sandbox scenario in a custom user folder.
 * Table: sandbox_saved_hands (id, user_id, folder_name, tags, state_json)
 *
 * Security & Honesty:
 *   - Rate limited BEFORE any DB or auth work.
 *   - Identity derived exclusively from Bearer token via getServerUserWithFallback.
 *   - Fail-closed active-play / live-table gate via checkSandboxAccess.
 *   - Canonical persistenceContract (persistedResult / persistenceFailure).
 *   - Never writes training progress, GTO grades, or EV records.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';
import { persistedResult, persistenceFailure } from '../../../../src/lib/personal-assistant/persistenceContract';
import { checkSandboxAccess } from '../../../../src/lib/personal-assistant/contextAuthority';

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

const MAX_STATE_BYTES = 50_000;

export default async function handler(req, res) {
    try {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Vary', 'Authorization');

        if (req.method !== 'POST' && req.method !== 'DELETE') {
            res.setHeader('Allow', 'POST, DELETE');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!applyRateLimit(req, res, LIMITS.write)) return;

        try {
            const supabase = getSupabase();

            const { user: authUser, status: authStatus } = await getServerUserWithFallback(req, supabase);
            if (authStatus === 503) {
                return res.status(503).json({ success: false, error: 'Session verification unavailable' });
            }
            const userId = authUser?.id || null;
            if (!userId) {
                return res.status(401).json({ success: false, error: 'Authentication required' });
            }

            // Fail-closed live-table / active-play gate
            const contextAccess = await checkSandboxAccess(supabase, userId);
            if (!contextAccess.allowed) {
                return res.status(403).json({
                    success: false,
                    persisted: false,
                    blocked: true,
                    code: 'SANDBOX_BLOCKED_LIVE_PLAY',
                    contextState: contextAccess.contextState,
                    accessLevel: contextAccess.accessLevel,
                    error: contextAccess.message || 'Sandbox is unavailable during live play.',
                });
            }

            // ── DELETE: remove one saved hand owned by the caller ──
            if (req.method === 'DELETE') {
                const id = (req.body && req.body.id) || req.query?.id;
                if (!id) return res.status(400).json({ success: false, error: 'Hand id required' });

                const { data: deletedRows, error: delError } = await supabase
                    .from('sandbox_saved_hands')
                    .delete()
                    .eq('id', String(id))
                    .eq('user_id', userId)
                    .select('id');

                if (delError) {
                    if (delError.code === '42P01') {
                        return res.status(503).json(persistenceFailure(
                            'Study folders are temporarily unavailable. Nothing was deleted.',
                            'storage_unavailable',
                            { deleted: 0 },
                        ));
                    }
                    console.warn('[save-hand] Delete error:', delError.message);
                    return res.status(500).json(persistenceFailure('Internal server error', 'write_failed'));
                }
                if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
                    return res.status(404).json({ success: false, error: 'Saved hand not found', persisted: false });
                }
                return res.status(200).json(persistedResult({ id: String(id) }, { deleted: deletedRows.length, id: String(id) }));
            }

            // ── POST: persist one authored scenario in a study folder ──
            const { folder_name, tags, state_json } = req.body || {};
            if (
                !folder_name
                || typeof folder_name !== 'string'
                || !folder_name.trim()
                || !state_json
                || typeof state_json !== 'object'
                || Array.isArray(state_json)
            ) {
                return res.status(400).json({ success: false, persisted: false, error: 'Folder name and valid state_json object required' });
            }

            let stateSize = 0;
            try {
                stateSize = JSON.stringify(state_json).length;
            } catch (_e) {
                return res.status(400).json({ success: false, persisted: false, error: 'state_json must be serializable JSON' });
            }
            if (stateSize > MAX_STATE_BYTES) {
                return res.status(413).json({ success: false, persisted: false, error: 'Saved hand too large' });
            }

            const { data, error } = await supabase
                .from('sandbox_saved_hands')
                .insert({
                    user_id: userId,
                    folder_name: String(folder_name).trim().slice(0, 80),
                    tags: Array.isArray(tags) ? tags.slice(0, 10).map((t) => String(t).slice(0, 40)) : [],
                    state_json,
                })
                .select('*')
                .maybeSingle();

            if (error) {
                if (error.code === '42P01') {
                    return res.status(503).json(persistenceFailure(
                        'Study folders are temporarily unavailable. Your hand was not saved.',
                        'storage_unavailable',
                    ));
                }
                console.warn('[save-hand] Insert error:', error.message);
                return res.status(500).json(persistenceFailure('Internal server error', 'write_failed'));
            }

            return res.status(200).json(persistedResult(data, { hand: data }));
        } catch (err) {
            console.warn('[save-hand] Error:', err);
            return res.status(500).json(persistenceFailure('Internal server error', 'write_failed'));
        }
    } catch (err) {
        try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
