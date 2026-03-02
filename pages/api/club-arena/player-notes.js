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

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // ── Auth: verify JWT identity ──
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Auth required' });
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  try {
    const { action, targetUserId, targetUserIds, note } = req.body;
    const userId = user.id; // From JWT, not body — prevents reading/writing other users' notes

    switch (action) {
      // ── GET single note ──────────────────────────────────────
      case 'get': {
        if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

        const { data, error } = await supabaseAdmin
          .from('player_notes')
          .select('*')
          .eq('user_id', userId)
          .eq('target_user_id', targetUserId)
          .maybeSingle();

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true, note: data });
      }

      // ── GET BULK — for all players at a table ────────────────
      case 'get_bulk': {
        if (!targetUserIds?.length) return res.json({ success: true, notes: {} });

        const { data, error } = await supabaseAdmin
          .from('player_notes')
          .select('target_user_id, player_type, color_label, notes, tells, tendencies')
          .eq('user_id', userId)
          .in('target_user_id', targetUserIds);

        if (error) return res.status(500).json({ error: error.message });

        // Return as map: { targetUserId: note }
        const noteMap = {};
        (data || []).forEach(n => { noteMap[n.target_user_id] = n; });
        return res.json({ success: true, notes: noteMap });
      }

      // ── UPSERT — create or update a note ─────────────────────
      case 'upsert': {
        if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
        if (!note) return res.status(400).json({ error: 'note object required' });

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

        const { data, error } = await supabaseAdmin
          .from('player_notes')
          .upsert(upsertData, {
            onConflict: 'user_id,target_user_id',
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (error) {
          // Fallback: try insert then update
          const { data: existing } = await supabaseAdmin
            .from('player_notes')
            .select('id')
            .eq('user_id', userId)
            .eq('target_user_id', targetUserId)
            .maybeSingle();

          if (existing) {
            const { data: updated, error: updErr } = await supabaseAdmin
              .from('player_notes')
              .update(upsertData)
              .eq('id', existing.id)
              .select()
              .single();
            if (updErr) return res.status(500).json({ error: updErr.message });
            return res.json({ success: true, note: updated });
          } else {
            const { data: inserted, error: insErr } = await supabaseAdmin
              .from('player_notes')
              .insert(upsertData)
              .select()
              .single();
            if (insErr) return res.status(500).json({ error: insErr.message });
            return res.json({ success: true, note: inserted });
          }
        }

        return res.json({ success: true, note: data });
      }

      // ── DELETE ────────────────────────────────────────────────
      case 'delete': {
        if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

        const { error } = await supabaseAdmin
          .from('player_notes')
          .delete()
          .eq('user_id', userId)
          .eq('target_user_id', targetUserId);

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[player-notes]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
