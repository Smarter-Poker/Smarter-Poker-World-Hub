import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../src/lib/commander/auth';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  const { venue_id } = req.query;

  if (req.method === 'GET') {
    if (!venue_id) return res.status(400).json({ success: false, error: 'venue_id required' });
    const { data, error } = await supabase
      .from('commander_club_announcements')
      .select('*')
      .eq('venue_id', venue_id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: { announcements: data } });
  }

  if (req.method === 'POST') {
    const { venue_id: vid, title, message, type, priority } = req.body;
    if (!vid || !message) return res.status(400).json({ success: false, error: 'venue_id and message required' });
    const { data, error } = await supabase
      .from('commander_club_announcements')
      .insert({ venue_id: vid, title, message, type: type || 'general', priority: priority || 'normal' })
      .select()
      .single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: { announcement: data } });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
