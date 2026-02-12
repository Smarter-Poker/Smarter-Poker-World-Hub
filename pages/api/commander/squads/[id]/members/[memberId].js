import { createClient } from '@supabase/supabase-js';
import { guardUser } from '../../../../../../src/lib/commander/auth';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const _u = await guardUser(req, res); if (!_u) return;
  const { id, memberId } = req.query;

  if (req.method === 'DELETE') {
    // Only squad owner can remove members
    const { data: squad } = await supabase
      .from('commander_waitlist_groups')
      .select('leader_id')
      .eq('id', id)
      .single();

    if (!squad || squad.leader_id !== _u.id) {
      return res.status(403).json({ success: false, error: 'Only squad leader can remove members' });
    }

    const { error } = await supabase
      .from('commander_waitlist_group_members')
      .delete()
      .eq('group_id', id)
      .eq('id', memberId);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
