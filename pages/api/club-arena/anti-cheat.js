/**
 * /api/club-arena/anti-cheat
 * 
 * Anti-cheat administration for club owners/admins.
 * 
 * Actions:
 *   get_flags       — Get open flags for a club (with filters)
 *   get_events      — Get recent anti-cheat events
 *   get_sessions    — Get active table sessions
 *   review_flag     — Mark a flag as reviewed/dismissed/actioned
 *   kick_player     — Remove a player from a table for anti-cheat violation
 *   get_player_history — Get all flags/events for a specific player
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { action, clubId, ...params } = req.body;
    const userId = user.id; // From JWT, not body

    if (!clubId) return res.status(400).json({ error: 'clubId required' });

    // Verify caller is club owner/admin/manager
    const { data: membership } = await supabase
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .single();

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return res.status(403).json({ error: 'Not authorized. Club admin access required.' });
    }

    switch (action) {
      // ─────────────────────────────────────────────────────
      // GET FLAGS — Open flags for this club
      // ─────────────────────────────────────────────────────
      case 'get_flags': {
        const { status = 'open', severity, flagType, limit = 50, offset = 0 } = params;

        let query = supabase
          .from('anti_cheat_flags')
          .select(`
            *,
            player:player_id (id, display_name, avatar_url),
            reviewer:reviewed_by (id, display_name)
          `)
          .eq('club_id', clubId)
          .order('flagged_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (status !== 'all') query = query.eq('status', status);
        if (severity) query = query.eq('severity', severity);
        if (flagType) query = query.eq('flag_type', flagType);

        const { data, error, count } = await query;
        if (error) throw error;

        return res.status(200).json({ success: true, flags: data || [], count });
      }

      // ─────────────────────────────────────────────────────
      // GET EVENTS — Recent anti-cheat events
      // ─────────────────────────────────────────────────────
      case 'get_events': {
        const { limit = 50, offset = 0, eventType, playerId } = params;

        let query = supabase
          .from('anti_cheat_events')
          .select(`
            *,
            player:player_id (id, display_name, avatar_url)
          `)
          .eq('club_id', clubId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (eventType) query = query.eq('event_type', eventType);
        if (playerId) query = query.eq('player_id', playerId);

        const { data, error } = await query;
        if (error) throw error;

        return res.status(200).json({ success: true, events: data || [] });
      }

      // ─────────────────────────────────────────────────────
      // GET SESSIONS — Active table sessions
      // ─────────────────────────────────────────────────────
      case 'get_sessions': {
        const { tableId } = params;

        let query = supabase
          .from('table_sessions')
          .select(`
            *,
            player:player_id (id, display_name, avatar_url)
          `)
          .eq('club_id', clubId)
          .eq('is_active', true)
          .order('seated_at', { ascending: false });

        if (tableId) query = query.eq('table_id', tableId);

        const { data, error } = await query;
        if (error) throw error;

        return res.status(200).json({ success: true, sessions: data || [] });
      }

      // ─────────────────────────────────────────────────────
      // REVIEW FLAG — Update flag status
      // ─────────────────────────────────────────────────────
      case 'review_flag': {
        const { flagId, newStatus, notes } = params;

        if (!flagId) return res.status(400).json({ error: 'flagId required' });
        if (!['reviewed', 'dismissed', 'actioned'].includes(newStatus)) {
          return res.status(400).json({ error: 'newStatus must be reviewed, dismissed, or actioned' });
        }

        const { data, error } = await supabase
          .from('anti_cheat_flags')
          .update({
            status: newStatus,
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            review_notes: notes || null,
          })
          .eq('id', flagId)
          .eq('club_id', clubId)
          .select()
          .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Flag not found' });

        // Log the review event
        await supabase.from('anti_cheat_events').insert({
          event_type: `flag_${newStatus}`,
          player_id: data.player_id,
          club_id: clubId,
          table_id: data.table_id,
          details: { flag_id: flagId, new_status: newStatus, notes },
          triggered_by: userId,
        });

        return res.status(200).json({ success: true, flag: data });
      }

      // ─────────────────────────────────────────────────────
      // KICK PLAYER — Remove from table for violation
      // ─────────────────────────────────────────────────────
      case 'kick_player': {
        const { tableId, playerId: targetPlayerId, reason } = params;

        if (!tableId || !targetPlayerId) {
          return res.status(400).json({ error: 'tableId and playerId required' });
        }

        // Import game controller to issue stand_up
        const { getController } = require('../../../src/lib/poker-engine/GameController');
        const { controller } = getController();

        if (!controller) {
          return res.status(500).json({ error: 'Game controller not available' });
        }

        // Force stand up
        const result = await controller.standUp(tableId, targetPlayerId);

        if (result.success) {
          // Close the session with kick reason
          await supabase.rpc('close_table_session', {
            p_table_id: tableId,
            p_player_id: targetPlayerId,
            p_reason: reason || 'Anti-cheat violation: removed by admin',
          });

          // Handle chip return if club table
          const ChipBridge = require('../../../src/lib/poker-engine/ChipBridge');
          const cashoutAmount = result.cashout || 0;
          if (cashoutAmount > 0) {
            await ChipBridge.unlockChips(clubId, targetPlayerId, tableId, cashoutAmount);
          }

          // Log the kick
          await supabase.from('anti_cheat_events').insert({
            event_type: 'player_kicked',
            player_id: targetPlayerId,
            club_id: clubId,
            table_id: tableId,
            details: { reason, kicked_by: userId, cashout: cashoutAmount },
            triggered_by: userId,
          });
        }

        return res.status(200).json({
          success: result.success,
          message: result.success
            ? `Player removed from table. Chips returned: ${result.cashout || 0}`
            : result.error || 'Failed to remove player',
        });
      }

      // ─────────────────────────────────────────────────────
      // GET PLAYER HISTORY — All flags/events for a player
      // ─────────────────────────────────────────────────────
      case 'get_player_history': {
        const { playerId: targetPlayerId } = params;
        if (!targetPlayerId) return res.status(400).json({ error: 'playerId required' });

        const [flagsResult, eventsResult, sessionsResult] = await Promise.all([
          supabase
            .from('anti_cheat_flags')
            .select('*')
            .eq('club_id', clubId)
            .eq('player_id', targetPlayerId)
            .order('flagged_at', { ascending: false })
            .limit(50),

          supabase
            .from('anti_cheat_events')
            .select('*')
            .eq('club_id', clubId)
            .eq('player_id', targetPlayerId)
            .order('created_at', { ascending: false })
            .limit(50),

          supabase
            .from('table_sessions')
            .select('*')
            .eq('club_id', clubId)
            .eq('player_id', targetPlayerId)
            .order('seated_at', { ascending: false })
            .limit(20),
        ]);

        return res.status(200).json({
          success: true,
          flags: flagsResult.data || [],
          events: eventsResult.data || [],
          sessions: sessionsResult.data || [],
        });
      }

      // ─────────────────────────────────────────────────────
      // GET STATS — Anti-cheat summary for dashboard
      // ─────────────────────────────────────────────────────
      case 'get_stats': {
        const [openFlags, recentBlocks, activeSessions] = await Promise.all([
          supabase
            .from('anti_cheat_flags')
            .select('severity, flag_type', { count: 'exact' })
            .eq('club_id', clubId)
            .eq('status', 'open'),

          supabase
            .from('anti_cheat_events')
            .select('event_type', { count: 'exact' })
            .eq('club_id', clubId)
            .eq('event_type', 'seat_blocked')
            .gte('created_at', new Date(Date.now() - 86400000).toISOString()),

          supabase
            .from('table_sessions')
            .select('*', { count: 'exact' })
            .eq('club_id', clubId)
            .eq('is_active', true),
        ]);

        // Count by severity
        const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
        const byType = {};
        (openFlags.data || []).forEach(f => {
          bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
          byType[f.flag_type] = (byType[f.flag_type] || 0) + 1;
        });

        return res.status(200).json({
          success: true,
          stats: {
            open_flags: openFlags.count || 0,
            by_severity: bySeverity,
            by_type: byType,
            blocks_24h: recentBlocks.count || 0,
            active_sessions: activeSessions.count || 0,
          },
        });
      }

        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[AntiCheat API]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
