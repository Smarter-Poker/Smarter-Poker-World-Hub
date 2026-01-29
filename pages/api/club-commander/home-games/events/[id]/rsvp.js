/**
 * Home Game RSVP API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * GET /api/club-commander/home-games/events/[id]/rsvp - Get RSVPs
 * POST /api/club-commander/home-games/events/[id]/rsvp - Submit RSVP
 * PUT /api/club-commander/home-games/events/[id]/rsvp - Update RSVP (confirm, waitlist management)
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id: eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({ error: 'Event ID required' });
  }

  if (req.method === 'GET') {
    return getRsvps(req, res, eventId);
  }

  if (req.method === 'POST') {
    return submitRsvp(req, res, eventId);
  }

  if (req.method === 'PUT') {
    return updateRsvp(req, res, eventId);
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getRsvps(req, res, eventId) {
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

    // Get event and check membership
    const { data: event } = await supabase
      .from('captain_home_games')
      .select('group_id, host_id')
      .eq('id', eventId)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { data: membership } = await supabase
      .from('captain_home_members')
      .select('role')
      .eq('group_id', event.group_id)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .single();

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const { data: rsvps, error } = await supabase
      .from('captain_home_rsvps')
      .select(`
        *,
        profiles:user_id (id, display_name, avatar_url)
      `)
      .eq('game_id', eventId)
      .order('responded_at', { ascending: true });

    if (error) throw error;

    // Group by response
    const grouped = {
      yes: rsvps?.filter(r => r.response === 'yes') || [],
      maybe: rsvps?.filter(r => r.response === 'maybe') || [],
      no: rsvps?.filter(r => r.response === 'no') || [],
      waitlist: rsvps?.filter(r => r.response === 'waitlist') || []
    };

    // Find user's RSVP
    const myRsvp = rsvps?.find(r => r.user_id === user.id);

    return res.status(200).json({
      rsvps: grouped,
      my_rsvp: myRsvp || null,
      is_host: event.host_id === user.id
    });
  } catch (error) {
    console.error('Get RSVPs error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function submitRsvp(req, res, eventId) {
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

    const { response, bringing_guests, guest_names, message } = req.body;

    if (!response || !['yes', 'maybe', 'no'].includes(response)) {
      return res.status(400).json({ error: 'Valid response required (yes, maybe, no)' });
    }

    // Get event
    const { data: event, error: eventError } = await supabase
      .from('captain_home_games')
      .select('group_id, host_id, max_players, rsvp_yes, allow_guests, guest_limit, status')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.status === 'cancelled' || event.status === 'completed') {
      return res.status(400).json({ error: 'This event is no longer accepting RSVPs' });
    }

    // Check membership
    const { data: membership } = await supabase
      .from('captain_home_members')
      .select('role')
      .eq('group_id', event.group_id)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .single();

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Check capacity for "yes" responses
    let finalResponse = response;
    if (response === 'yes') {
      const totalGuests = bringing_guests || 0;
      const spotsNeeded = 1 + totalGuests;

      // Validate guest count
      if (totalGuests > 0) {
        if (!event.allow_guests) {
          return res.status(400).json({ error: 'Guests are not allowed at this event' });
        }
        if (totalGuests > event.guest_limit) {
          return res.status(400).json({ error: `Maximum ${event.guest_limit} guest(s) allowed` });
        }
      }

      // Check if there's room
      if (event.rsvp_yes + spotsNeeded > event.max_players) {
        // Put on waitlist instead
        finalResponse = 'waitlist';
      }
    }

    // Check for existing RSVP
    const { data: existing } = await supabase
      .from('captain_home_rsvps')
      .select('id')
      .eq('game_id', eventId)
      .eq('user_id', user.id)
      .single();

    let rsvp;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('captain_home_rsvps')
        .update({
          response: finalResponse,
          bringing_guests: bringing_guests || 0,
          guest_names: guest_names || [],
          message,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select(`
          *,
          profiles:user_id (id, display_name, avatar_url)
        `)
        .single();

      if (error) throw error;
      rsvp = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from('captain_home_rsvps')
        .insert({
          game_id: eventId,
          user_id: user.id,
          response: finalResponse,
          bringing_guests: bringing_guests || 0,
          guest_names: guest_names || [],
          message,
          is_confirmed: event.host_id === user.id // Auto-confirm host
        })
        .select(`
          *,
          profiles:user_id (id, display_name, avatar_url)
        `)
        .single();

      if (error) throw error;
      rsvp = data;
    }

    return res.status(200).json({
      rsvp,
      message: finalResponse === 'waitlist'
        ? 'Added to waitlist - the event is currently full'
        : 'RSVP submitted'
    });
  } catch (error) {
    console.error('Submit RSVP error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updateRsvp(req, res, eventId) {
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

    const { rsvp_id, action, seat_number } = req.body;

    if (!rsvp_id || !action) {
      return res.status(400).json({ error: 'rsvp_id and action required' });
    }

    // Get event and RSVP
    const { data: rsvp } = await supabase
      .from('captain_home_rsvps')
      .select('*, captain_home_games(group_id, host_id, max_players, rsvp_yes)')
      .eq('id', rsvp_id)
      .eq('game_id', eventId)
      .single();

    if (!rsvp) {
      return res.status(404).json({ error: 'RSVP not found' });
    }

    const event = rsvp.captain_home_games;

    // Check if user is host
    if (event.host_id !== user.id) {
      // Check if admin
      const { data: membership } = await supabase
        .from('captain_home_members')
        .select('role')
        .eq('group_id', event.group_id)
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .single();

      if (membership?.role !== 'owner' && membership?.role !== 'admin') {
        return res.status(403).json({ error: 'Only the host or admins can manage RSVPs' });
      }
    }

    let updates = {};

    switch (action) {
      case 'confirm':
        updates = { is_confirmed: true, seat_number };
        break;

      case 'unconfirm':
        updates = { is_confirmed: false, seat_number: null };
        break;

      case 'move_from_waitlist':
        // Check capacity
        if (event.rsvp_yes >= event.max_players) {
          return res.status(400).json({ error: 'Event is at capacity' });
        }
        updates = { response: 'yes' };
        break;

      case 'move_to_waitlist':
        updates = { response: 'waitlist', is_confirmed: false };
        break;

      case 'set_seat':
        updates = { seat_number };
        break;

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('captain_home_rsvps')
      .update(updates)
      .eq('id', rsvp_id)
      .select(`
        *,
        profiles:user_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    return res.status(200).json({ rsvp: updated });
  } catch (error) {
    console.error('Update RSVP error:', error);
    return res.status(500).json({ error: error.message });
  }
}
