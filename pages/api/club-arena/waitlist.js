import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * Player Waitlist API — Queue management for full tables
 * ═══════════════════════════════════════════════════════
 * POST /api/club-arena/waitlist
 *
 * Actions:
 *   - join:       Player joins the waitlist for a table
 *   - leave:      Player leaves the waitlist
 *   - list:       Get current waitlist for a table (admin)
 *   - notify:     Mark next player as notified (admin)
 *   - clear:      Clear entire waitlist (admin)
 *   - position:   Get caller's position in the waitlist
 */

import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/waitlist')) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { action, tableId, clubId, targetUserId } = req.body;

      if (!tableId) return res.status(400).json({ error: 'tableId required' });

      try {
          switch (action) {
              case 'join': {
                  // Check if already on waitlist
                  const { data: existing } = await getSupabase()
                      .from('table_waitlist')
                      .select('id')
                      .eq('table_id', tableId)
                      .eq('user_id', user.id)
                      .eq('status', 'waiting')
                      .maybeSingle();

                  if (existing) return res.status(409).json({ error: 'Already on waitlist' });

                  // Get next position
                  const { count } = await getSupabase()
                      .from('table_waitlist')
                      .select('id', { count: 'exact', head: true })
                      .eq('table_id', tableId)
                      .eq('status', 'waiting');

                  const { data, error } = await getSupabase()
                      .from('table_waitlist')
                      .insert({
                          table_id: tableId,
                          user_id: user.id,
                          position: (count || 0) + 1,
                          status: 'waiting',
                      })
                      .select()
                      .maybeSingle();

                  if (error) throw error;
                  return res.status(201).json({ success: true, entry: data, position: (count || 0) + 1 });
              }

              case 'leave': {
                  const { error } = await getSupabase()
                      .from('table_waitlist')
                      .update({ status: 'left' })
                      .eq('table_id', tableId)
                      .eq('user_id', user.id)
                      .eq('status', 'waiting');

                  if (error) throw error;
                  return res.status(200).json({ success: true });
              }

              case 'position': {
                  const { data } = await getSupabase()
                      .from('table_waitlist')
                      .select('position')
                      .eq('table_id', tableId)
                      .eq('user_id', user.id)
                      .eq('status', 'waiting')
                      .maybeSingle();

                  return res.status(200).json({
                      success: true,
                      position: data?.position || null,
                      onWaitlist: !!data,
                  });
              }

              case 'list': {
                  // Admin only — get full waitlist
                  if (!clubId) return res.status(400).json({ error: 'clubId required for list' });
                  const { data: membership } = await getSupabase()
                      .from('club_members')
                      .select('role')
                      .eq('club_id', clubId)
                      .eq('user_id', user.id)
                      .maybeSingle();
                  if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
                      return res.status(403).json({ error: 'Admin access required' });
                  }

                  const { data, error } = await getSupabase()
                      .from('table_waitlist')
                      .select(`
                          *,
                          profiles:user_id ( display_name, avatar_url )
                      `)
                      .eq('table_id', tableId)
                      .eq('status', 'waiting')
                      .order('position', { ascending: true })
                      .limit(50);

                  if (error) throw error;
                  return res.status(200).json({ success: true, waitlist: data || [] });
              }

              case 'notify': {
                  // Admin notifies next player
                  if (!clubId) return res.status(400).json({ error: 'clubId required' });
                  const { data: membership } = await getSupabase()
                      .from('club_members')
                      .select('role')
                      .eq('club_id', clubId)
                      .eq('user_id', user.id)
                      .maybeSingle();
                  if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
                      return res.status(403).json({ error: 'Admin access required' });
                  }

                  const userId = targetUserId;
                  if (!userId) return res.status(400).json({ error: 'targetUserId required' });

                  const { error } = await getSupabase()
                      .from('table_waitlist')
                      .update({ status: 'notified', notified_at: new Date().toISOString() })
                      .eq('table_id', tableId)
                      .eq('user_id', userId)
                      .eq('status', 'waiting');

                  if (error) throw error;
                  return res.status(200).json({ success: true });
              }

              case 'clear': {
                  if (!clubId) return res.status(400).json({ error: 'clubId required' });
                  const { data: membership } = await getSupabase()
                      .from('club_members')
                      .select('role')
                      .eq('club_id', clubId)
                      .eq('user_id', user.id)
                      .maybeSingle();
                  if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
                      return res.status(403).json({ error: 'Admin access required' });
                  }

                  const { error } = await getSupabase()
                      .from('table_waitlist')
                      .update({ status: 'cleared' })
                      .eq('table_id', tableId)
                      .eq('status', 'waiting');

                  if (error) throw error;
                  return res.status(200).json({ success: true });
              }

              default:
                  return res.status(400).json({ error: `Unknown action: ${action}` });
          }
      } catch (err) {
          console.warn('[waitlist]', err);
          return res.status(500).json({ error: 'Internal error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
