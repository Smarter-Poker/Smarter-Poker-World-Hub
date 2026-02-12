/**
 * Call Waitlist Player
 * POST /api/commander/waitlist/call
 * Marks player as 'called' and sends SMS if phone number on file
 */
import { createClient } from '@supabase/supabase-js';
import { sendSeatNotification, isTwilioConfigured } from '../../../../src/lib/commander/twilio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { waitlist_id, table_number } = req.body;
    if (!waitlist_id) return res.status(400).json({ success: false, error: 'waitlist_id required' });

    // Get current waitlist entry
    const { data: entry } = await supabase
      .from('commander_waitlist')
      .select('id, player_name, phone, game_type, stakes, venue_id, status')
      .eq('id', waitlist_id)
      .single();

    if (!entry) return res.status(404).json({ success: false, error: 'Waitlist entry not found' });
    if (entry.status !== 'waiting') {
      return res.status(400).json({ success: false, error: `Player already ${entry.status}` });
    }

    // Update status to called
    const { data, error } = await supabase
      .from('commander_waitlist')
      .update({
        status: 'called',
        called_at: new Date().toISOString(),
        called_by: user.id
      })
      .eq('id', waitlist_id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Send SMS notification if phone on file
    let smsResult = null;
    if (entry.phone) {
      let venueName = 'Your poker room';
      try {
        const { data: venue } = await supabase
          .from('poker_venues')
          .select('name')
          .eq('id', entry.venue_id)
          .single();
        if (venue?.name) venueName = venue.name;
      } catch {}

      const gameLabel = `${entry.game_type || 'Cash Game'} ${entry.stakes || ''}`.trim();
      const tableInfo = table_number ? ` at Table ${table_number}` : '';

      if (isTwilioConfigured()) {
        smsResult = await sendSeatNotification(
          entry.phone,
          venueName,
          `${gameLabel}${tableInfo}`,
          { timeout: 5 }
        );
      } else {
        console.log(`[SMS WOULD SEND] To: ${entry.phone} | ${venueName} | ${gameLabel}${tableInfo}`);
        smsResult = { success: false, reason: 'Twilio not configured' };
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        ...data,
        sms_sent: smsResult?.success || false,
        sms_status: smsResult?.success ? 'sent' : (entry.phone ? (smsResult?.reason || 'no_config') : 'no_phone'),
      }
    });
  } catch (err) {
    console.error('Waitlist call error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
