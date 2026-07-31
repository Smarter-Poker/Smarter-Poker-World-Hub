import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Player Notes API — CRUD for online opponent notes
 * ═══════════════════════════════════════════════════
 * 
 * Actions:
 *   get      — Get note for a specific target player
 *   get_bulk — Get notes for multiple players (e.g. all at table)
 *   upsert   — Create or update a note
 *   delete   — Remove a note
 * 
 * Auth: JWT required — user can only access their own notes
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    try {
      const { action, targetUserId, targetUserIds, note } = req.body;
      const userId = user.id; // From JWT, not body — prevents reading/writing other users' notes

      switch (action) {
        // ── GET single note ──────────────────────────────────────
        case 'get': {
          if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

          const { data, error } = await getSupabase()
            .from('player_notes')
            .select('*')
            .eq('user_id', userId)
            .eq('target_user_id', targetUserId)
            .maybeSingle();

          if (error) return res.status(500).json({ success: false, error: 'Failed to load note' });
          return res.json({ success: true, note: data || null });
        }

        // ── GET BULK — for all players at a table ────────────────
        case 'get_bulk': {
          if (!targetUserIds?.length) return res.json({ success: true, notes: {} });

          const { data, error } = await getSupabase()
            .from('player_notes')
            .select('target_user_id, player_type, color_label, notes, tells, tendencies')
            .eq('user_id', userId)
            .in('target_user_id', targetUserIds)
                .limit(100);

          if (error) return res.status(500).json({ success: false, error: 'Failed to load notes' });

          // Return as map: { targetUserId: note }
          const noteMap = {};
          (data || []).forEach(n => { noteMap[n.target_user_id] = n; });
          return res.json({ success: true, notes: noteMap });
        }

        // ── UPSERT — create or update a note ─────────────────────
        case 'upsert': {
          if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });
          if (!note) return res.status(400).json({ success: false, error: 'note object required' });

          // Validate player_type
          const validTypes = ['unknown', 'fish', 'reg', 'shark', 'whale', 'nit', 'lag', 'tag'];
          const validColors = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'];

          const upsertData = {
            user_id: userId,
            target_user_id: targetUserId,
            player_type: validTypes.includes(note.player_type) ? note.player_type : 'unknown',
            color_label: validColors.includes(note.color_label) ? note.color_label : 'none',
            notes: (note.notes || '').slice(0, 2000),
            tells: (note.tells || '').slice(0, 1000),
            tendencies: (note.tendencies || '').slice(0, 1000),
            nickname: (note.nickname || '').slice(0, 100),
            updated_at: new Date().toISOString(),
          };

          const { data, error } = await getSupabase()
            .from('player_notes')
            .upsert(upsertData, {
              onConflict: 'user_id,target_user_id',
              ignoreDuplicates: false,
            })
            .select()
            .maybeSingle();

          if (error) {
            // Fallback: try insert then update
            const { data: existing } = await getSupabase()
              .from('player_notes')
              .select('id')
              .eq('user_id', userId)
              .eq('target_user_id', targetUserId)
              .maybeSingle();

            if (existing) {
              const { data: updated, error: updErr } = await getSupabase()
                .from('player_notes')
                .update(upsertData)
                .eq('id', existing.id)
                .select()
                .maybeSingle();
              if (updErr || !updated) return res.status(500).json({ success: false, error: 'Failed to update note' });
              return res.json({ success: true, note: updated });
            } else {
              const { data: inserted, error: insErr } = await getSupabase()
                .from('player_notes')
                .insert(upsertData)
                .select()
                .maybeSingle();
              if (insErr || !inserted) return res.status(500).json({ success: false, error: 'Failed to create note' });
              return res.json({ success: true, note: inserted });
            }
          }

          if (!data) return res.status(500).json({ success: false, error: 'Failed to upsert note' });
          return res.json({ success: true, note: data });
        }

        // ── DELETE ────────────────────────────────────────────────
        case 'delete': {
          if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

          const { error } = await getSupabase()
            .from('player_notes')
            .delete()
            .eq('user_id', userId)
            .eq('target_user_id', targetUserId);

          if (error) return res.status(500).json({ success: false, error: 'Failed to delete note' });
          return res.json({ success: true });
        }

        default:
          return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (err) {
      console.warn('[player-notes]', err);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
