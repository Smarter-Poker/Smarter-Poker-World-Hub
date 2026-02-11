/**
 * End Player Session API
 * POST /api/commander/dealer/sessions/[id]/end
 * 
 * Ends an active table session. Returns unused time back to member's balance.
 * Updates seat status to empty.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  try {
    // Get session
    const { data: session, error: fetchError } = await supabase
      .from('commander_table_sessions')
      .select('*')
      .eq('id', id)
      .eq('status', 'active')
      .single();

    if (fetchError || !session) {
      return res.status(404).json({ success: false, error: 'Active session not found' });
    }

    const now = new Date();
    const totalAllocatedSeconds = ((session.time_allocated_minutes || 0) + (session.time_added_minutes || 0)) * 60;
    const elapsedSeconds = Math.floor((now - new Date(session.started_at)) / 1000);
    const unusedSeconds = Math.max(0, totalAllocatedSeconds - elapsedSeconds);
    const unusedMinutes = Math.floor(unusedSeconds / 60);

    // End the session
    const { error: endError } = await supabase
      .from('commander_table_sessions')
      .update({
        status: 'ended',
        ended_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .eq('id', id);

    if (endError) throw endError;

    // Return unused time to member's balance
    if (session.member_id && unusedMinutes > 0) {
      const { data: member } = await supabase
        .from('commander_members')
        .select('time_balance_minutes')
        .eq('id', session.member_id)
        .single();

      if (member) {
        await supabase
          .from('commander_members')
          .update({
            time_balance_minutes: (member.time_balance_minutes || 0) + unusedMinutes,
            updated_at: now.toISOString()
          })
          .eq('id', session.member_id);
      }
    }

    // Clear the seat
    await supabase
      .from('commander_table_seats')
      .update({
        status: 'empty',
        player_name: null,
        member_id: null,
        seated_at: null
      })
      .eq('venue_id', session.venue_id)
      .eq('table_number', session.table_number)
      .eq('seat_number', session.seat_number);

    return res.status(200).json({
      success: true,
      data: {
        session_id: id,
        elapsed_minutes: Math.floor(elapsedSeconds / 60),
        unused_minutes_returned: unusedMinutes
      }
    });
  } catch (err) {
    console.error('End session error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
