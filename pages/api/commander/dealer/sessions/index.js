/**
 * Dealer Table Sessions API
 * GET /api/commander/dealer/sessions?table=X
 * 
 * Returns active sessions for a table with calculated time_remaining.
 * time_remaining = (time_allocated + time_added) * 60 - elapsed_seconds
 * 
 * Both dealer tablet and player display poll this endpoint.
 * No auth guard — tablet is unauthenticated (same as other tablet endpoints).
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { table, venue_id } = req.query;

  if (!table) {
    return res.status(400).json({ success: false, error: 'table parameter is required' });
  }

  try {
    let query = supabase
      .from('commander_table_sessions')
      .select('*')
      .eq('table_number', parseInt(table))
      .in('status', ['active', 'paused', 'meal_break'])
      .order('seat_number', { ascending: true });

    // Filter by venue_id if provided (security: prevents cross-venue leakage)
    if (venue_id) {
      query = query.eq('venue_id', parseInt(venue_id));
    }

    const { data: sessions, error } = await query;
    if (error) throw error;

    const now = new Date();

    // Batch-fetch member balances for sessions with member IDs
    const memberIds = [...new Set((sessions || []).filter(s => s.member_id).map(s => s.member_id))];
    let memberMap = {};
    if (memberIds.length > 0) {
      const { data: members } = await supabase
        .from('commander_members')
        .select('id, time_balance_minutes, membership_tier, membership_status, membership_expires')
        .in('id', memberIds);
      if (members) {
        memberMap = Object.fromEntries(members.map(m => [m.id, m]));
      }
    }

    const withTimeRemaining = (sessions || []).map(s => {
      const totalAllocatedSeconds = ((s.time_allocated_minutes || 0) + (s.time_added_minutes || 0)) * 60;
      const elapsedSeconds = Math.floor((now - new Date(s.started_at)) / 1000);
      const timeRemaining = Math.max(0, totalAllocatedSeconds - elapsedSeconds);
      const member = memberMap[s.member_id] || null;

      return {
        session_id: s.id,
        member_id: s.member_id,
        player_name: s.player_name,
        table_number: s.table_number,
        seat_number: s.seat_number,
        session_status: s.status, // 'active' | 'paused' | 'meal_break'
        membership_tier: member?.membership_tier || s.membership_tier,
        membership_status: member?.membership_status || null,
        membership_expires: member?.membership_expires || null,
        member_number: s.member_number,
        time_allocated_minutes: s.time_allocated_minutes,
        time_added_minutes: s.time_added_minutes,
        time_balance_minutes: member?.time_balance_minutes || 0,
        missed_blinds: s.missed_blinds || 0,
        started_at: s.started_at,
        time_remaining: timeRemaining, // seconds
        is_low: timeRemaining <= 900 && timeRemaining > 0,    // < 15 min
        is_critical: timeRemaining <= 300 && timeRemaining > 0, // < 5 min
        is_expired: timeRemaining <= 0
      };
    });

    return res.status(200).json({ success: true, data: withTimeRemaining });
  } catch (err) {
    console.error('Dealer sessions error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
