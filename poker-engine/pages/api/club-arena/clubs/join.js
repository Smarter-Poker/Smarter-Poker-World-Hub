/**
 * /api/club-arena/clubs/join — Join a club via code
 * POST { code: "ABC123" }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Club code required' });

  // Find club
  const { data: club, error: findErr } = await supabase
    .from('clubs')
    .select('id, name, status, max_members, member_count')
    .eq('code', code.toUpperCase().trim())
    .single();

  if (findErr || !club) return res.status(404).json({ error: 'Club not found' });
  if (club.status !== 'active') return res.status(403).json({ error: 'Club is not active' });
  if (club.member_count >= club.max_members) return res.status(403).json({ error: 'Club is full' });

  // Check if already a member
  const { data: existing } = await supabase
    .from('club_members')
    .select('id, status')
    .eq('club_id', club.id)
    .eq('user_id', user.id)
    .single();

  if (existing?.status === 'active') {
    return res.status(409).json({ error: 'Already a member', clubId: club.id });
  }

  // Reactivate or create
  if (existing) {
    await supabase
      .from('club_members')
      .update({ status: 'active', last_active_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    const { error: joinErr } = await supabase
      .from('club_members')
      .insert({
        club_id: club.id,
        user_id: user.id,
        role: 'player',
        status: 'active',
      });
    if (joinErr) return res.status(500).json({ error: joinErr.message });
  }

  // Bump member count
  await supabase.rpc('update_club_treasury', { p_club_id: club.id, p_amount: 0 }); // just triggers updated_at
  await supabase
    .from('clubs')
    .update({ member_count: club.member_count + 1 })
    .eq('id', club.id);

  return res.json({ success: true, clubId: club.id, clubName: club.name });
}
