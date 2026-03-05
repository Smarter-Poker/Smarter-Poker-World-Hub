/**
 * Add Time to Session API
 * POST /api/commander/dealer/sessions/[id]/add-time
 * 
 * Adds additional minutes to an active session's countdown.
 * Can be triggered by dealer when player purchases more time,
 * or by the front desk/kiosk.
 * 
 * Body: { minutes: 60 }
 */
import { createClient } from '@supabase/supabase-js';
import { guardStaff } from '../../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  // Auth guard: require staff auth
  const _staff = await guardStaff(req, res);
  if (!_staff) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const { minutes } = req.body;

  if (!minutes || minutes <= 0) {
    return res.status(400).json({ success: false, error: 'minutes must be a positive number' });
  }

  try {
    // Get current session
    const { data: session, error: fetchError } = await supabase
      .from('commander_table_sessions')
      .select('*')
      .eq('id', id)
      .eq('status', 'active')
      .single();

    if (fetchError || !session) {
      return res.status(404).json({ success: false, error: 'Active session not found' });
    }

    // TOURNAMENT GUARD: Never add time to tournament sessions
    const { data: tableRow } = await supabase
      .from('commander_tables')
      .select('mode')
      .eq('venue_id', session.venue_id)
      .eq('table_number', session.table_number)
      .single();

    if (tableRow?.mode === 'tournament') {
      return res.status(400).json({
        success: false,
        error: 'Cannot add time to tournament sessions — tournaments pay a one-time seat fee'
      });
    }

    // Add time to session
    const newAddedMinutes = (session.time_added_minutes || 0) + parseInt(minutes);

    const { error: updateError } = await supabase
      .from('commander_table_sessions')
      .update({
        time_added_minutes: newAddedMinutes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Recalculate time remaining
    const now = new Date();
    const totalAllocatedSeconds = ((session.time_allocated_minutes || 0) + newAddedMinutes) * 60;
    const elapsedSeconds = Math.floor((now - new Date(session.started_at)) / 1000);
    const timeRemaining = Math.max(0, totalAllocatedSeconds - elapsedSeconds);

    // Deduct from member's prepaid balance if available
    let paymentMethod = 'cash_at_table';
    if (session.member_id) {
      const { data: member } = await supabase
        .from('commander_members')
        .select('time_balance_minutes')
        .eq('id', session.member_id)
        .single();

      const memberBalance = member?.time_balance_minutes || 0;
      if (memberBalance >= parseInt(minutes)) {
        // Deduct from prepaid balance
        await supabase
          .from('commander_members')
          .update({
            time_balance_minutes: memberBalance - parseInt(minutes),
            updated_at: new Date().toISOString()
          })
          .eq('id', session.member_id);
        paymentMethod = 'from_balance';
      }

      // Log the time purchase
      await supabase
        .from('commander_time_purchases')
        .insert({
          venue_id: session.venue_id,
          member_id: session.member_id,
          minutes_purchased: parseInt(minutes),
          payment_method: paymentMethod,
          purchased_by: 'dealer'
        });
    }

    return res.status(200).json({
      success: true,
      data: {
        session_id: id,
        minutes_added: parseInt(minutes),
        total_added_minutes: newAddedMinutes,
        time_remaining_seconds: timeRemaining
      }
    });
  } catch (err) {
    console.error('Add time error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
