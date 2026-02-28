/**
 * /api/club-arena/clubs/[clubId] — Club details + management
 * 
 * GET     → Club details + tables + members (for club members)
 * PUT     → Update club settings (owner/agent only)
 * DELETE  → Leave club (or close if owner)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function getMembership(clubId, userId) {
  const { data } = await supabase
    .from('club_members')
    .select('id, role, chip_balance, status')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  return data;
}

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId } = req.query;
  if (!clubId) return res.status(400).json({ error: 'Club ID required' });

  // Verify membership
  const membership = await getMembership(clubId, user.id);
  if (!membership) return res.status(403).json({ error: 'Not a member of this club' });

  if (req.method === 'GET') {
    // Club info
    const { data: club } = await supabase
      .from('clubs')
      .select('*')
      .eq('id', clubId)
      .single();

    if (!club) return res.status(404).json({ error: 'Club not found' });

    // Active tables
    const { data: tables } = await supabase
      .from('club_tables')
      .select('*')
      .eq('club_id', clubId)
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false });

    // Members (limited info for players, full for owner/agent)
    let memberQuery = supabase
      .from('club_members')
      .select('id, user_id, role, chip_balance, status, nickname, hands_played, last_active_at')
      .eq('club_id', clubId)
      .eq('status', 'active')
      .order('last_active_at', { ascending: false });

    const { data: members } = await memberQuery;

    // Enrich with profile names
    const userIds = (members || []).map(m => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);
    
    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const enrichedMembers = (members || []).map(m => ({
      ...m,
      displayName: m.nickname || profileMap[m.user_id]?.display_name || 'Player',
      avatarUrl: profileMap[m.user_id]?.avatar_url,
    }));

    return res.json({
      club,
      tables: tables || [],
      members: enrichedMembers,
      myMembership: membership,
    });
  }

  if (req.method === 'PUT') {
    if (membership.role !== 'owner' && membership.role !== 'agent') {
      return res.status(403).json({ error: 'Only owners/agents can update club settings' });
    }

    const allowed = ['name', 'description', 'logo_url', 'banner_url', 'rake_percent', 'rake_cap_bb', 'settings', 'game_variants', 'max_tables'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase.from('clubs').update(updates).eq('id', clubId);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    // Leave club
    if (membership.role === 'owner') {
      // Check if there are other members
      const { count } = await supabase
        .from('club_members')
        .select('id', { count: 'exact' })
        .eq('club_id', clubId)
        .eq('status', 'active')
        .neq('user_id', user.id);

      if (count > 0) {
        return res.status(400).json({ error: 'Transfer ownership before leaving. Club still has members.' });
      }

      // Close club
      await supabase.from('clubs').update({ status: 'closed' }).eq('id', clubId);
    }

    await supabase
      .from('club_members')
      .update({ status: 'left' })
      .eq('id', membership.id);

    // Decrement count
    await supabase.rpc('update_club_treasury', { p_club_id: clubId, p_amount: 0 });

    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
