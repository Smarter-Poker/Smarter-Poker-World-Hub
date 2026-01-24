/**
 * Single Tournament API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * GET /api/captain/tournaments/[id] - Get tournament details
 * PUT /api/captain/tournaments/[id] - Update tournament
 * DELETE /api/captain/tournaments/[id] - Cancel tournament
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Tournament ID required' });
  }

  if (req.method === 'GET') {
    return getTournament(req, res, id);
  }

  if (req.method === 'PUT') {
    return updateTournament(req, res, id);
  }

  if (req.method === 'DELETE') {
    return cancelTournament(req, res, id);
  }

  res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getTournament(req, res, id) {
  try {
    const { data: tournament, error } = await supabase
      .from('captain_tournaments')
      .select(`
        *,
        poker_venues (id, name, address, city, state),
        captain_tournament_entries (
          id,
          player_id,
          player_name,
          status,
          current_chips,
          rebuy_count,
          addon_taken,
          finish_position,
          payout_amount,
          profiles (id, display_name, avatar_url)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    return res.status(200).json({ tournament });
  } catch (error) {
    console.error('Get tournament error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updateTournament(req, res, id) {
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

    // Get tournament to check venue
    const { data: existing, error: fetchError } = await supabase
      .from('captain_tournaments')
      .select('venue_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Verify staff access
    const { data: staff, error: staffError } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', existing.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (staffError || !staff) {
      return res.status(403).json({ error: 'You are not staff at this venue' });
    }

    const updates = { ...req.body, updated_at: new Date().toISOString() };

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.venue_id;
    delete updates.created_by;
    delete updates.created_at;

    const { data: tournament, error } = await supabase
      .from('captain_tournaments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ tournament });
  } catch (error) {
    console.error('Update tournament error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function cancelTournament(req, res, id) {
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

    // Get tournament
    const { data: existing, error: fetchError } = await supabase
      .from('captain_tournaments')
      .select('venue_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Only owners/managers can cancel
    const { data: staff, error: staffError } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', existing.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['owner', 'manager'])
      .single();

    if (staffError || !staff) {
      return res.status(403).json({ error: 'Only owners and managers can cancel tournaments' });
    }

    if (existing.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel a completed tournament' });
    }

    const { data: tournament, error } = await supabase
      .from('captain_tournaments')
      .update({
        status: 'cancelled',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ tournament, message: 'Tournament cancelled' });
  } catch (error) {
    console.error('Cancel tournament error:', error);
    return res.status(500).json({ error: error.message });
  }
}
