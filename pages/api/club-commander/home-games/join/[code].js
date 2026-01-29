/**
 * Join Club by Code API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * GET /api/club-commander/home-games/join/[code] - Get club info by code
 * POST /api/club-commander/home-games/join/[code] - Join club by code
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Club code required' });
  }

  if (req.method === 'GET') {
    return getClubByCode(req, res, code);
  }

  if (req.method === 'POST') {
    return joinClubByCode(req, res, code);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getClubByCode(req, res, code) {
  try {
    const upperCode = code.toUpperCase();

    // Try club_code first (6 chars), then invite_code (8 chars)
    let { data: group, error } = await supabase
      .from('captain_home_groups')
      .select(`
        id,
        name,
        description,
        club_code,
        is_private,
        city,
        state,
        default_game_type,
        default_stakes,
        member_count,
        frequency,
        profiles:owner_id (id, display_name, avatar_url)
      `)
      .or(`club_code.eq.${upperCode},invite_code.eq.${upperCode}`)
      .eq('is_active', true)
      .single();

    if (error || !group) {
      return res.status(404).json({ error: 'Club not found. Check the code and try again.' });
    }

    // Check if user is already a member (if logged in)
    const authHeader = req.headers.authorization;
    let myMembership = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);

      if (user) {
        const { data: membership } = await supabase
          .from('captain_home_members')
          .select('status, role')
          .eq('group_id', group.id)
          .eq('user_id', user.id)
          .single();

        myMembership = membership;
      }
    }

    return res.status(200).json({
      group,
      my_membership: myMembership,
      can_join: !myMembership || myMembership.status === 'declined'
    });
  } catch (error) {
    console.error('Get club by code error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function joinClubByCode(req, res, code) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Please log in to join a club' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const upperCode = code.toUpperCase();

    // Find group
    const { data: group, error: groupError } = await supabase
      .from('captain_home_groups')
      .select('id, name, requires_approval, invite_code, club_code')
      .or(`club_code.eq.${upperCode},invite_code.eq.${upperCode}`)
      .eq('is_active', true)
      .single();

    if (groupError || !group) {
      return res.status(404).json({ error: 'Club not found. Check the code and try again.' });
    }

    // Check for existing membership
    const { data: existing } = await supabase
      .from('captain_home_members')
      .select('id, status')
      .eq('group_id', group.id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      if (existing.status === 'approved') {
        return res.status(400).json({ error: 'You are already a member of this club' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ error: 'Your membership request is pending approval' });
      }
      if (existing.status === 'banned') {
        return res.status(403).json({ error: 'You have been banned from this club' });
      }
    }

    // Determine if auto-approved
    // Using invite_code (8 chars) = auto approve
    // Using club_code (6 chars) = follows group rules
    const usedInviteCode = upperCode === group.invite_code;
    const autoApprove = usedInviteCode || !group.requires_approval;

    const status = autoApprove ? 'approved' : 'pending';

    // Create membership
    const { data: membership, error } = await supabase
      .from('captain_home_members')
      .upsert({
        group_id: group.id,
        user_id: user.id,
        role: 'member',
        status,
        joined_at: status === 'approved' ? new Date().toISOString() : null,
        notifications_enabled: true,
        notify_announcements: true,
        notify_new_games: true,
        notify_game_reminders: true,
        notify_rsvp_updates: true
      }, {
        onConflict: 'group_id,user_id'
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      membership,
      group: { id: group.id, name: group.name },
      message: status === 'approved'
        ? `Welcome to ${group.name}!`
        : `Your request to join ${group.name} is pending approval`
    });
  } catch (error) {
    console.error('Join club by code error:', error);
    return res.status(500).json({ error: error.message });
  }
}
