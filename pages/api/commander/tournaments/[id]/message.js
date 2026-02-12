/**
 * Tournament Message API
 * POST /api/commander/tournaments/[id]/message
 * Broadcasts a message to tournament clock displays
 * Messages appear on TV/projector clock screens and can push to players
 * Used for announcements like "Table 3 is breaking", "Hand for hand", "Color up"
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id: tournamentId } = req.query;
  if (!tournamentId) return res.status(400).json({ success: false, error: 'Tournament ID required' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: tournament } = await supabase
      .from('commander_tournaments')
      .select('id, venue_id, clock_state')
      .eq('id', tournamentId)
      .single();
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id')
      .eq('venue_id', tournament.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    const { message, type, duration_seconds } = req.body;
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Message text required' });
    }

    const msgType = type || 'announcement'; // announcement, alert, info, break_table, hand_for_hand
    const duration = duration_seconds || 30;

    // Store message in clock_state so display screens can read it
    const clockState = tournament.clock_state || {};
    const messages = clockState.messages || [];
    const newMessage = {
      id: `msg_${Date.now()}`,
      text: message.trim(),
      type: msgType,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + duration * 1000).toISOString(),
      created_by: user.id
    };

    messages.push(newMessage);
    // Keep only last 20 messages
    const trimmedMessages = messages.slice(-20);

    const { error: uErr } = await supabase
      .from('commander_tournaments')
      .update({
        clock_state: {
          ...clockState,
          messages: trimmedMessages,
          current_message: newMessage
        }
      })
      .eq('id', tournamentId);

    if (uErr) return res.status(500).json({ success: false, error: 'Failed to broadcast message' });

    return res.status(200).json({
      success: true,
      data: {
        message: newMessage,
        broadcast: true
      }
    });
  } catch (err) {
    console.error('Tournament message error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
