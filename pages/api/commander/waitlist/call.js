/**
 * Call Waitlist Player
 * POST /api/commander/waitlist/call
 * Marks player as 'called' - seat is available
 */
import { createClient } from '@supabase/supabase-js';

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

    const { waitlist_id } = req.body;
    if (!waitlist_id) return res.status(400).json({ success: false, error: 'waitlist_id required' });

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

    // TODO: Send SMS/push notification to player if phone on file
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Waitlist call error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
