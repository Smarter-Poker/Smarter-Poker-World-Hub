/**
 * Waitlist Entry API
 * GET /api/commander/waitlist/[id] - Get a single waitlist entry
 * DELETE /api/commander/waitlist/[id] - Remove player from waitlist (player or staff)
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Guard: write methods (POST/PUT/PATCH/DELETE) require staff auth; GET passes through
  const staff = await guardWriteStaff(req, res); if (!staff) return;

  const { id } = req.query;

  // ── GET: Return a single waitlist entry ──────────────────────────
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('commander_waitlist')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, error: 'Waitlist entry not found' });
      }

      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('Waitlist entry error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── DELETE: Remove player from waitlist ────────────────────────────
  if (req.method === 'DELETE') {
    try {
      // Fetch entry
      const { data: entry, error: fetchErr } = await supabase
        .from('commander_waitlist')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr || !entry) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' } });
      }

      // Log to history (non-blocking)
      try {
        await supabase.from('commander_waitlist_history').insert({
          venue_id: entry.venue_id,
          player_id: entry.player_id,
          game_type: entry.game_type,
          stakes: entry.stakes,
          wait_time_minutes: Math.round((Date.now() - new Date(entry.created_at).getTime()) / (1000 * 60)),
          was_seated: false,
          signup_method: entry.signup_method
        });
      } catch { /* history logging is non-critical */ }

      // Delete entry
      const { error: delErr } = await supabase.from('commander_waitlist').delete().eq('id', id);
      if (delErr) {
        return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: delErr.message } });
      }

      return res.status(200).json({ success: true, data: { removed: true } });
    } catch (err) {
      console.error('Waitlist delete error:', err);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }

  // ── PATCH: Update waitlist entry fields (e.g. check-in) ─────────
  if (req.method === 'PATCH') {
    try {
      // Require staff auth
      const staffSession = req.headers['x-staff-session'];
      if (!staffSession) {
        return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Staff authentication required' } });
      }

      let isStaff = false;
      try {
        const sessionData = JSON.parse(staffSession);
        if (sessionData.id) {
          const { data: staff } = await supabase
            .from('commander_staff')
            .select('id, venue_id, is_active')
            .eq('id', sessionData.id)
            .eq('is_active', true)
            .single();
          if (staff) isStaff = true;
        } else if (sessionData.user_id && sessionData.venue_id) {
          const { data: staff } = await supabase
            .from('commander_staff')
            .select('id, venue_id, is_active')
            .eq('user_id', sessionData.user_id)
            .eq('venue_id', sessionData.venue_id)
            .eq('is_active', true)
            .single();
          if (staff) isStaff = true;
          // Owner fallback
          if (!isStaff && sessionData.role === 'owner') {
            const { data: sub } = await supabase
              .from('commander_subscriptions')
              .select('id')
              .eq('owner_id', sessionData.user_id)
              .eq('venue_id', sessionData.venue_id)
              .in('status', ['active', 'trialing'])
              .single();
            if (sub) isStaff = true;
          }
        }
      } catch { /* invalid session */ }

      if (!isStaff) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff access required' } });
      }

      // Only allow specific fields to be updated
      const allowedFields = ['checked_in_at', 'notes', 'player_phone', 'game_type', 'stakes'];
      const updates = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: { code: 'NO_UPDATES', message: 'No valid fields to update' } });
      }

      const { data, error } = await supabase
        .from('commander_waitlist')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } });
      }

      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('Waitlist patch error:', err);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
