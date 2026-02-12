/**
 * Waitlist Entry API
 * GET /api/commander/waitlist/[id] - Get a single waitlist entry
 * DELETE /api/commander/waitlist/[id] - Remove player from waitlist
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Auth guard: require staff auth for write operations
  const _authResult = await guardWriteStaff(req, res);
  if (!_authResult) return;

  const { id } = req.query;

  if (req.method === 'GET') {
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

  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('commander_waitlist')
        .delete()
        .eq('id', id);

      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true, message: 'Player removed from waitlist' });
    } catch (err) {
      console.error('Waitlist delete error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
