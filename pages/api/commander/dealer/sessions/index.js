/**
 * Dealer Table Sessions API
 * GET /api/commander/dealer/sessions?table=X
 * 
 * Returns active sessions for a table with calculated time_remaining.
 * time_remaining = (time_allocated + time_added) * 60 - elapsed_seconds
 * 
 * Both dealer tablet and player display poll this endpoint.
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

  const { table } = req.query;

  if (!table) {
    return res.status(400).json({ success: false, error: 'table parameter is required' });
  }

  try {
    const { data: sessions, error } = await supabase
      .from('commander_table_sessions')
      .select('*')
      .eq('table_number', parseInt(table))
      .eq('status', 'active')
      .order('seat_number', { ascending: true });

    if (error) throw error;

    const now = new Date();

    const withTimeRemaining = (sessions || []).map(s => {
      const totalAllocatedSeconds = ((s.time_allocated_minutes || 0) + (s.time_added_minutes || 0)) * 60;
      const elapsedSeconds = Math.floor((now - new Date(s.started_at)) / 1000);
      const timeRemaining = Math.max(0, totalAllocatedSeconds - elapsedSeconds);

      return {
        session_id: s.id,
        member_id: s.member_id,
        player_name: s.player_name,
        table_number: s.table_number,
        seat_number: s.seat_number,
        membership_tier: s.membership_tier,
        member_number: s.member_number,
        time_allocated_minutes: s.time_allocated_minutes,
        time_added_minutes: s.time_added_minutes,
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
