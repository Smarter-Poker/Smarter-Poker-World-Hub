import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Player Notes API - CRUD for player-on-player intelligence
 * GET /api/poker/player-notes?targetPlayerId=xxx
 * POST /api/poker/player-notes 
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { LIMITS, applyRateLimit, rateLimit } from '../../../src/lib/apiRateLimit';
import { checkFeatureAccess } from '../../../src/lib/gates/premiumFeatureGate';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_COLOR = '#B0B3B8';

/**
 * The real `player_notes` columns are target_user_id / notes / color_label.
 * This route used to read and write target_player_id / note_content / color_tag /
 * target_player_name — none of which exist — so every GET and POST 500'd.
 * Queries now use the real columns; the response keeps the legacy aliases so the
 * existing client (src/components/poker/PlayerNotes.js) keeps working unchanged.
 */
function toClientNote(row) {
    if (!row) return null;
    return {
        ...row,
        target_player_id: row.target_user_id ?? null,
        target_player_name: row.real_name ?? row.nickname ?? null,
        note_content: row.notes ?? '',
        color_tag: row.color_label || DEFAULT_COLOR,
    };
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit — prevents enumeration + drain attacks.
  // NOTE: the prior version called a variable `apiRateLimit` that was no
  // longer imported after a rename, and also checked truthiness of the
  // result object (always truthy) — so it returned HTTP 429 on every call,
  // then 500'd after the rename because the symbol became undefined. The
  // canonical applyRateLimit + LIMITS gate replaces it.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  } else {
    if (!applyRateLimit(req, res, LIMITS.read)) return;
  }

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    
    if (authErr || !user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // VIP/Pro gate check (Infrastructure ready)
    // We enforce read/write access via premiumFeatureGate
    const access = await checkFeatureAccess(user.id, 'bankroll_pro');
    if (!access.hasAccess) {
        return res.status(403).json({ error: 'Bankroll Pro or VIP required to use Player Notes' });
    }

    // ─── GET: Fetch note for a specific player ──────────────────────────────
    if (req.method === 'GET') {
        const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
        const targetPlayerId = safeQ(req.query.targetPlayerId);
        if (!targetPlayerId) return res.status(400).json({ error: 'targetPlayerId is required' });
        if (!UUID_RE.test(targetPlayerId)) {
            return res.status(400).json({ error: 'targetPlayerId must be a valid UUID' });
        }

        try {
            const { data, error } = await getSupabase()
                .from('player_notes')
                .select('*')
                .eq('user_id', user.id)
                .eq('target_user_id', targetPlayerId)
                .maybeSingle();

            if (error) throw error;
            return res.status(200).json({ note: toClientNote(data) });
        } catch (err) {
            console.warn('[PlayerNotes API] GET error:', err);
            return res.status(500).json({ error: 'Failed to fetch player note' });
        }
    }

    // ─── POST: Upsert note ──────────────────────────────────────────────────
    if (req.method === 'POST') {
        const { targetPlayerId, targetPlayerName, noteContent, colorTag } = req.body;

        if (!targetPlayerId) return res.status(400).json({ error: 'targetPlayerId is required' });
        if (!UUID_RE.test(String(targetPlayerId))) {
            return res.status(400).json({ error: 'targetPlayerId must be a valid UUID' });
        }

        try {
            // Delete if content is completely empty
            if (!noteContent || noteContent.trim() === '') {
                const { error: err_player_notes_5rksk } = await getSupabase()
                  .from('player_notes')
                  .delete()
                    .eq('user_id', user.id)
                    .eq('target_user_id', targetPlayerId);
                if (err_player_notes_5rksk) {
                    // Do NOT report deleted:true when the delete actually failed —
                    // the client would clear its UI while the row survived.
                    console.warn('[PlayerNotes API] DELETE failed:', err_player_notes_5rksk.message);
                    return res.status(500).json({ error: 'Failed to delete player note' });
                }

                return res.status(200).json({ success: true, note: null, deleted: true });
            }

            // Upsert. `player_notes` has no documented unique index on
            // (user_id, target_user_id), so an onConflict upsert cannot be relied
            // on — resolve the existing row first, then update or insert.
            const { data: existing, error: lookupErr } = await getSupabase()
                .from('player_notes')
                .select('id')
                .eq('user_id', user.id)
                .eq('target_user_id', targetPlayerId)
                .maybeSingle();
            if (lookupErr) throw lookupErr;

            const payload = {
                user_id: user.id,
                target_user_id: targetPlayerId,
                notes: noteContent.trim(),
                color_label: colorTag || DEFAULT_COLOR,
                updated_at: new Date().toISOString()
            };
            // targetPlayerName is a denormalised display label; `real_name` is the
            // column that exists for it. Never blank an existing name.
            if (targetPlayerName) payload.real_name = String(targetPlayerName).slice(0, 200);

            let data, error;
            if (existing?.id) {
                ({ data, error } = await getSupabase()
                    .from('player_notes')
                    .update(payload)
                    .eq('id', existing.id)
                    .eq('user_id', user.id)
                    .select()
                    .maybeSingle());
            } else {
                ({ data, error } = await getSupabase()
                    .from('player_notes')
                    .insert(payload)
                    .select()
                    .maybeSingle());
            }

            if (error) throw error;
            return res.status(200).json({ success: true, note: toClientNote(data) });
        } catch (err) {
            try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
            console.warn('[PlayerNotes API] POST error:', err);
            return res.status(500).json({ error: 'Failed to save player note' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
