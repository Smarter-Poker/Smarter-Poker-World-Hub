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
    
    if (authError || !user) {
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

        try {
            const { data, error } = await getSupabase()
                .from('player_notes')
                .select('*')
                .eq('user_id', user.id)
                .eq('target_player_id', targetPlayerId)
                .maybeSingle();

            if (error) throw error;
            return res.status(200).json({ note: data || null });
        } catch (err) {
            console.warn('[PlayerNotes API] GET error:', err);
            return res.status(500).json({ error: 'Failed to fetch player note' });
        }
    }

    // ─── POST: Upsert note ──────────────────────────────────────────────────
    if (req.method === 'POST') {
        const { targetPlayerId, targetPlayerName, noteContent, colorTag } = req.body;
        
        if (!targetPlayerId) return res.status(400).json({ error: 'targetPlayerId is required' });

        try {
            // Delete if content is completely empty
            if (!noteContent || noteContent.trim() === '') {
                const { error: err_player_notes_5rksk } = await getSupabase()
                  .from('player_notes')
                  .delete()
                    .eq('user_id', user.id)
                    .eq('target_player_id', targetPlayerId);
                if (err_player_notes_5rksk) console.warn('[Supabase] Silent mutation failed in player_notes:', err_player_notes_5rksk.message);
                    
                return res.status(200).json({ success: true, note: null, deleted: true });
            }

            // Upsert
            const { data, error } = await getSupabase()
                .from('player_notes')
                .upsert({
                    user_id: user.id,
                    target_player_id: targetPlayerId,
                    target_player_name: targetPlayerName || null,
                    note_content: noteContent.trim(),
                    color_tag: colorTag || '#B0B3B8',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, target_player_id' })
                .select()
                .maybeSingle();

            if (error) throw error;
            return res.status(200).json({ success: true, note: data });
        } catch (err) {
            try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
            console.warn('[PlayerNotes API] POST error:', err);
            return res.status(500).json({ error: 'Failed to save player note' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
