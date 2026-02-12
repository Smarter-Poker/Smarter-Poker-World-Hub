/**
 * Kiosk Buy Time API
 * POST /api/commander/kiosk/buy-time
 * 
 * Adds purchased time to a member's time_balance_minutes.
 * Logs the purchase in commander_time_purchases.
 * 
 * Body: { member_id, minutes, amount, payment_method }
 */
import { createClient } from '@supabase/supabase-js';
import { checkMemoryRateLimit } from '../../../../src/lib/commander/rateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: 10 purchases per minute per IP (kiosk device)
  const fwd = req.headers['x-forwarded-for'];
  const ip = fwd ? fwd.split(',')[0].trim() : req.socket?.remoteAddress || '0';
  const rl = checkMemoryRateLimit(`kiosk:${ip}`, 10, 60000);
  if (!rl.allowed) { return res.status(429).json({ error: 'Too many requests' }); }

  const { member_id, minutes, amount, payment_method } = req.body;

  if (!member_id || !minutes || minutes <= 0) {
    return res.status(400).json({ success: false, error: 'member_id and minutes are required' });
  }

  try {
    // Get current member
    const { data: member, error: fetchError } = await supabase
      .from('commander_members')
      .select('id, venue_id, time_balance_minutes, first_name, last_name')
      .eq('id', member_id)
      .single();

    if (fetchError || !member) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    const currentBalance = member.time_balance_minutes || 0;
    const newBalance = currentBalance + parseInt(minutes);

    // Update member balance
    const { error: updateError } = await supabase
      .from('commander_members')
      .update({
        time_balance_minutes: newBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', member_id);

    if (updateError) throw updateError;

    // Log the purchase
    await supabase
      .from('commander_time_purchases')
      .insert({
        venue_id: member.venue_id,
        member_id: member.id,
        minutes_purchased: parseInt(minutes),
        amount_paid: amount ? parseFloat(amount) : null,
        payment_method: payment_method || 'kiosk',
        purchased_by: 'kiosk_self_service'
      });

    // Also add time to active session if player is currently seated
    const { data: activeSession } = await supabase
      .from('commander_table_sessions')
      .select('id, time_added_minutes')
      .eq('member_id', member_id)
      .eq('status', 'active')
      .limit(1);

    if (activeSession?.length > 0) {
      // Player is at a table — add time to their active session too
      await supabase
        .from('commander_table_sessions')
        .update({
          time_added_minutes: (activeSession[0].time_added_minutes || 0) + parseInt(minutes),
          updated_at: new Date().toISOString()
        })
        .eq('id', activeSession[0].id);
    }

    return res.status(200).json({
      success: true,
      data: {
        member_id,
        minutes_added: parseInt(minutes),
        previous_balance: currentBalance,
        new_balance: newBalance,
        added_to_active_session: activeSession?.length > 0
      }
    });
  } catch (err) {
    console.error('Kiosk buy time error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
