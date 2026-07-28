/**
 * Table Chat API — In-table messaging and dealer announcements
 * ═══════════════════════════════════════════════════════════════
 * POST /api/club-arena/table-chat
 *
 * Actions:
 *   - send:          Player sends a chat message to a table
 *   - dealer_msg:    Admin sends a dealer/system message
 *   - history:       Get recent chat history for a table
 *   - mute:          Admin mutes a player at a table
 */

import { createClient } from '@supabase/supabase-js';
import { sanitizeNote } from '../../../src/lib/club-arena/sanitize';
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
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { action, tableId, clubId, message, targetUserId } = req.body;
      if (!tableId) return res.status(400).json({ error: 'tableId required' });

      try {
          switch (action) {
              case 'send': {
                  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

                  // 1. Sanitize input to strip XSS, Null Bytes, and Unicode control chars
                  const cleanMessage = sanitizeNote(message, 200);
                  if (!cleanMessage) return res.status(400).json({ error: 'Invalid message content' });

                  // 2. Centralized Edge-friendly Rate Limiting (1 request per second)
                  // Use custom window for chat to prevent spam, allowing bursts but averaging 1/sec
                  if (!applyRateLimit(req, res, { max: 5, windowMs: 5000, scope: ':chat_send' })) return;

                  // Check if user is muted
                  const { data: muteCheck } = await getSupabase()
                      .from('table_chat_mutes')
                      .select('id')
                      .eq('table_id', tableId)
                      .eq('user_id', user.id)
                      .gte('expires_at', new Date().toISOString())
                      .maybeSingle();

                  if (muteCheck) return res.status(403).json({ error: 'You are muted at this table' });

                  // Check if user is seated at the table
                  const { data: tableData } = await getSupabase()
                      .from('active_tables')
                      .select('table_state')
                      .eq('id', tableId)
                      .maybeSingle();

                  if (!tableData || !tableData.table_state) {
                      return res.status(404).json({ error: 'Table not found' });
                  }

                  // Parse seats from the active_tables state payload
                  const seats = tableData.table_state.seats || [];
                  const isSeated = seats.some(s => s?.player?.id && String(s.player.id) === String(user.id));

                  if (!isSeated) {
                      // Admins allowed to chat as dealers, but not regular players
                      const { data: membership } = await getSupabase()
                          .from('club_members')
                          .select('role')
                          .eq('user_id', user.id)
                          .maybeSingle();
                      if (!membership || !['owner', 'admin'].includes(membership.role)) {
                          return res.status(403).json({ error: 'Spectators cannot chat at live tables' });
                      }
                  }

                  // Get user profile for display
                  const { data: profile } = await getSupabase()
                      .from('profiles')
                      .select('display_name, avatar_url')
                      .eq('id', user.id)
                      .maybeSingle();

                  const chatMsg = {
                      table_id: tableId,
                      user_id: user.id,
                      message: cleanMessage,
                      message_type: 'player',
                      display_name: profile?.display_name || 'Player',
                      avatar_url: profile?.avatar_url || null,
                  };

                  const { data, error } = await getSupabase()
                      .from('table_chat')
                      .insert(chatMsg)
                      .select()
                      .maybeSingle();

                  if (error) throw error;
                  return res.status(201).json({ success: true, chat: data });
              }

              case 'dealer_msg': {
                  if (!clubId) return res.status(400).json({ error: 'clubId required' });
                  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

                  // Verify admin
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
                      .from('table_chat')
                      .insert({
                          table_id: tableId,
                          user_id: user.id,
                          message: message.trim().slice(0, 500),
                          message_type: 'dealer',
                          display_name: '🎰 Dealer',
                      })
                      .select()
                      .maybeSingle();

                  if (error) throw error;
                  return res.status(201).json({ success: true, chat: data });
              }

              case 'history': {
                  const { data, error } = await getSupabase()
                      .from('table_chat')
                      .select('*')
                      .eq('table_id', tableId)
                      .order('created_at', { ascending: false })
                      .limit(50);

                  if (error) throw error;
                  return res.status(200).json({ success: true, messages: (data || []).reverse() });
              }

              case 'mute': {
                  if (!clubId || !targetUserId) return res.status(400).json({ error: 'clubId and targetUserId required' });

                  const { data: membership } = await getSupabase()
                      .from('club_members')
                      .select('role')
                      .eq('club_id', clubId)
                      .eq('user_id', user.id)
                      .maybeSingle();
                  if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
                      return res.status(403).json({ error: 'Admin access required' });
                  }

                  // Mute for 30 minutes
                  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
                  const { error } = await getSupabase()
                      .from('table_chat_mutes')
                      .upsert({
                          table_id: tableId,
                          user_id: targetUserId,
                          muted_by: user.id,
                          expires_at: expiresAt,
                      }, { onConflict: 'table_id,user_id' });

                  if (error) throw error;
                  return res.status(200).json({ success: true, expiresAt });
              }

              default:
                  return res.status(400).json({ error: `Unknown action: ${action}` });
          }
      } catch (err) {
          console.warn('[table-chat]', err);
          return res.status(500).json({ error: 'Internal error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
