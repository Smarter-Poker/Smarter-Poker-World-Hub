/**
 * Single Home Game Event API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * GET /api/club-commander/home-games/events/[id] - Get event details
 * PUT /api/club-commander/home-games/events/[id] - Update event
 * DELETE /api/club-commander/home-games/events/[id] - Cancel event
 */
import { createClient } from '@supabase/supabase-js';
import { awardXP } from '../../../../../src/lib/club-commander/xp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Event ID required' });
  }

  if (req.method === 'GET') {
    return getEvent(req, res, id);
  }

  if (req.method === 'PUT') {
    return updateEvent(req, res, id);
  }

  if (req.method === 'DELETE') {
    return cancelEvent(req, res, id);
  }

  res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getEvent(req, res, id) {
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

    const { data: event, error } = await supabase
      .from('captain_home_games')
      .select(`
        *,
        captain_home_groups (id, name, owner_id),
        profiles:host_id (id, display_name, avatar_url),
        captain_home_rsvps (
          id, user_id, response, bringing_guests, message, is_confirmed,
          profiles:user_id (id, display_name, avatar_url)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is a member
    const { data: membership } = await supabase
      .from('captain_home_members')
      .select('role, status')
      .eq('group_id', event.group_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.status !== 'approved') {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Find user's RSVP
    const myRsvp = event.captain_home_rsvps?.find(r => r.user_id === user.id);

    // DEFENSIVE: Ensure host profile exists
    if (!event.profiles) {
      event.profiles = { id: event.host_id, display_name: 'Unknown Host', avatar_url: null };
    }

    // DEFENSIVE: Ensure all RSVP profiles exist
    if (event.captain_home_rsvps) {
      event.captain_home_rsvps = event.captain_home_rsvps.map(rsvp => ({
        ...rsvp,
        profiles: rsvp.profiles || { id: rsvp.user_id, display_name: 'Guest', avatar_url: null }
      }));
    }

    // Check if user can see address
    let showAddress = false;
    if (event.address_visible_to === 'all') {
      showAddress = true;
    } else if (event.address_visible_to === 'rsvp' && myRsvp?.response === 'yes') {
      showAddress = true;
    } else if (event.address_visible_to === 'approved' && myRsvp?.is_confirmed) {
      showAddress = true;
    } else if (event.host_id === user.id) {
      showAddress = true;
    }

    if (!showAddress) {
      event.address = null;
    }

    const isHost = event.host_id === user.id;
    const isAdmin = membership.role === 'owner' || membership.role === 'admin';

    return res.status(200).json({
      event,
      my_rsvp: myRsvp || null,
      can_edit: isHost || isAdmin,
      is_host: isHost
    });
  } catch (error) {
    console.error('Get event error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updateEvent(req, res, id) {
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

    // Get event
    const { data: event } = await supabase
      .from('captain_home_games')
      .select('host_id, group_id, status')
      .eq('id', id)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check permissions
    const isHost = event.host_id === user.id;

    const { data: membership } = await supabase
      .from('captain_home_members')
      .select('role')
      .eq('group_id', event.group_id)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .single();

    const isAdmin = membership?.role === 'owner' || membership?.role === 'admin';

    if (!isHost && !isAdmin) {
      return res.status(403).json({ error: 'Only the host or admins can update this event' });
    }

    const { action } = req.body;

    // Handle special actions
    if (action === 'start') {
      const { data: updated, error } = await supabase
        .from('captain_home_games')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ event: updated, message: 'Game started' });
    }

    if (action === 'complete') {
      const { data: updated, error } = await supabase
        .from('captain_home_games')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Award XP to host
      await awardXP(event.host_id, 'home_game.hosted', {
        game_id: id
      });

      // Award XP to attendees
      const { data: attendees } = await supabase
        .from('captain_home_rsvps')
        .select('user_id')
        .eq('game_id', id)
        .eq('response', 'yes')
        .eq('is_confirmed', true);

      for (const attendee of attendees || []) {
        if (attendee.user_id !== event.host_id) {
          await awardXP(attendee.user_id, 'home_game.attended', {
            game_id: id
          });
        }
      }

      // Update member stats
      await supabase.rpc('increment_home_game_stats', {
        p_game_id: id
      }).catch(() => {
        // Function may not exist, that's okay
      });

      return res.status(200).json({ event: updated, message: 'Game completed' });
    }

    // Regular update
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.group_id;
    delete updates.host_id;
    delete updates.created_at;
    delete updates.action;
    delete updates.rsvp_yes;
    delete updates.rsvp_maybe;
    delete updates.rsvp_no;
    delete updates.waitlist_count;

    const { data: updated, error } = await supabase
      .from('captain_home_games')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ event: updated });
  } catch (error) {
    console.error('Update event error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function cancelEvent(req, res, id) {
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

    // Get event
    const { data: event } = await supabase
      .from('captain_home_games')
      .select('host_id, group_id')
      .eq('id', id)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check permissions
    const isHost = event.host_id === user.id;

    const { data: membership } = await supabase
      .from('captain_home_members')
      .select('role')
      .eq('group_id', event.group_id)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .single();

    const isAdmin = membership?.role === 'owner' || membership?.role === 'admin';

    if (!isHost && !isAdmin) {
      return res.status(403).json({ error: 'Only the host or admins can cancel this event' });
    }

    const { error } = await supabase
      .from('captain_home_games')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Event cancelled' });
  } catch (error) {
    console.error('Cancel event error:', error);
    return res.status(500).json({ error: error.message });
  }
}
