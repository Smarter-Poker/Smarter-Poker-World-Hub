/**
 * Waitlist Entry API
 * GET /api/commander/waitlist/[id] - Get a single waitlist entry by ID
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase
      .from('commander_waitlist')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Waitlist entry not found' });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Waitlist entry error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
