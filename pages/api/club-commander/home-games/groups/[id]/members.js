/**
 * Home Game Group Members API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * GET /api/club-commander/home-games/groups/[id]/members - List members
 * POST /api/club-commander/home-games/groups/[id]/members - Join/invite
 * PUT /api/club-commander/home-games/groups/[id]/members - Update membership
 * DELETE /api/club-commander/home-games/groups/[id]/members - Leave/remove
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id: groupId } = req.query;

  if (!groupId) {
    return res.status(400).json({ error: 'Group ID required' });
  }

  if (req.method === 'GET') {
    return listMembers(req, res, groupId);
  }

  if (req.method === 'POST') {
    return joinOrInvite(req, res, groupId);
  }

  if (req.method === 'PUT') {
    return updateMembership(req, res, groupId);
  }

  if (req.method === 'DELETE') {
    return leaveOrRemove(req, res, groupId);
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listMembers(req, res, groupId) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { status } = req.query;

    // Check if user is a member
    const { data: myMembership } = await supabase
      .from('captain_home_members')
      .select('role, status')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (!myMembership || myMembership.status !== 'approved') {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    let query = supabase
      .from('captain_home_members')
      .select(`
        *,
        profiles:user_id (id, display_name, avatar_url),
        invited_by_profile:invited_by (id, display_name)
      `)
      .eq('group_id', groupId)
      .order('joined_at', { ascending: false });

    // Only admins can see pending/declined members
    if (status && (myMembership.role === 'owner' || myMembership.role === 'admin')) {
      query = query.eq('status', status);
    } else if (myMembership.role !== 'owner' && myMembership.role !== 'admin') {
      query = query.eq('status', 'approved');
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      members: data,
      my_role: myMembership.role
    });
  } catch (error) {
    console.error('List members error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function joinOrInvite(req, res, groupId) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { user_id, invite_code } = req.body;

    // Get group info
    const { data: group, error: groupError } = await supabase
      .from('captain_home_groups')
      .select('id, owner_id, is_private, requires_approval, invite_code')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // If inviting another user, check if requester is admin
    if (user_id && user_id !== user.id) {
      const { data: myMembership } = await supabase
        .from('captain_home_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .single();

      if (!myMembership || (myMembership.role !== 'owner' && myMembership.role !== 'admin')) {
        return res.status(403).json({ error: 'Only admins can invite members' });
      }

      // Check if target user exists
      const { data: targetUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user_id)
        .single();

      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Add invited user
      const { data: member, error } = await supabase
        .from('captain_home_members')
        .insert({
          group_id: groupId,
          user_id: user_id,
          role: 'member',
          status: 'approved', // Direct invite = auto-approved
          invited_by: user.id,
          joined_at: new Date().toISOString()
        })
        .select(`
          *,
          profiles:user_id (id, display_name, avatar_url)
        `)
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(400).json({ error: 'User is already a member' });
        }
        throw error;
      }

      return res.status(201).json({ member, message: 'User invited successfully' });
    }

    // User joining themselves
    // Check for existing membership
    const { data: existing } = await supabase
      .from('captain_home_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      if (existing.status === 'approved') {
        return res.status(400).json({ error: 'You are already a member' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ error: 'Your membership request is pending' });
      }
      if (existing.status === 'banned') {
        return res.status(403).json({ error: 'You have been banned from this group' });
      }
    }

    // Validate invite code for private groups
    let autoApprove = false;
    if (group.is_private) {
      if (invite_code && invite_code.toUpperCase() === group.invite_code) {
        autoApprove = true;
      } else if (!invite_code) {
        return res.status(403).json({ error: 'This is a private group. An invite code is required.' });
      } else {
        return res.status(403).json({ error: 'Invalid invite code' });
      }
    }

    // Determine initial status
    const initialStatus = autoApprove || !group.requires_approval ? 'approved' : 'pending';

    const { data: member, error } = await supabase
      .from('captain_home_members')
      .insert({
        group_id: groupId,
        user_id: user.id,
        role: 'member',
        status: initialStatus,
        joined_at: initialStatus === 'approved' ? new Date().toISOString() : null
      })
      .select(`
        *,
        profiles:user_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    return res.status(201).json({
      member,
      message: initialStatus === 'approved'
        ? 'You have joined the group'
        : 'Your membership request is pending approval'
    });
  } catch (error) {
    console.error('Join/invite error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updateMembership(req, res, groupId) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { member_id, action, role } = req.body;

    if (!member_id || !action) {
      return res.status(400).json({ error: 'member_id and action required' });
    }

    // Check requester's role
    const { data: myMembership } = await supabase
      .from('captain_home_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .single();

    if (!myMembership || (myMembership.role !== 'owner' && myMembership.role !== 'admin')) {
      return res.status(403).json({ error: 'Only owners and admins can manage members' });
    }

    // Get target membership
    const { data: targetMember } = await supabase
      .from('captain_home_members')
      .select('*')
      .eq('id', member_id)
      .eq('group_id', groupId)
      .single();

    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Owners can't be modified by admins
    if (targetMember.role === 'owner' && myMembership.role !== 'owner') {
      return res.status(403).json({ error: 'Cannot modify the owner' });
    }

    let updates = {};

    switch (action) {
      case 'approve':
        updates = { status: 'approved', joined_at: new Date().toISOString() };
        break;

      case 'decline':
        updates = { status: 'declined' };
        break;

      case 'ban':
        updates = { status: 'banned' };
        break;

      case 'unban':
        updates = { status: 'approved' };
        break;

      case 'set_role':
        if (!role || !['admin', 'member'].includes(role)) {
          return res.status(400).json({ error: 'Valid role required (admin, member)' });
        }
        if (role === 'owner') {
          return res.status(400).json({ error: 'Cannot assign owner role this way' });
        }
        updates = { role };
        break;

      case 'set_can_host':
        updates = { can_host: req.body.can_host === true };
        break;

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    const { data: updated, error } = await supabase
      .from('captain_home_members')
      .update(updates)
      .eq('id', member_id)
      .select(`
        *,
        profiles:user_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    return res.status(200).json({ member: updated });
  } catch (error) {
    console.error('Update membership error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function leaveOrRemove(req, res, groupId) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { member_id } = req.body;

    // If no member_id, user is leaving themselves
    if (!member_id) {
      const { data: myMembership } = await supabase
        .from('captain_home_members')
        .select('id, role')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

      if (!myMembership) {
        return res.status(404).json({ error: 'You are not a member of this group' });
      }

      if (myMembership.role === 'owner') {
        return res.status(400).json({ error: 'Owner cannot leave. Transfer ownership or delete the group.' });
      }

      const { error } = await supabase
        .from('captain_home_members')
        .delete()
        .eq('id', myMembership.id);

      if (error) throw error;

      return res.status(200).json({ success: true, message: 'You have left the group' });
    }

    // Removing another member - check permissions
    const { data: myMembership } = await supabase
      .from('captain_home_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .single();

    if (!myMembership || (myMembership.role !== 'owner' && myMembership.role !== 'admin')) {
      return res.status(403).json({ error: 'Only owners and admins can remove members' });
    }

    const { data: targetMember } = await supabase
      .from('captain_home_members')
      .select('role')
      .eq('id', member_id)
      .eq('group_id', groupId)
      .single();

    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (targetMember.role === 'owner') {
      return res.status(403).json({ error: 'Cannot remove the owner' });
    }

    const { error } = await supabase
      .from('captain_home_members')
      .delete()
      .eq('id', member_id);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('Leave/remove error:', error);
    return res.status(500).json({ error: error.message });
  }
}
