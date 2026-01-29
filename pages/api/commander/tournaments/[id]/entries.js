/**
 * Tournament Entries API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * GET /api/commander/tournaments/[id]/entries - List entries
 * POST /api/commander/tournaments/[id]/entries - Register player
 * PUT /api/commander/tournaments/[id]/entries - Update entry (rebuy, addon, seat)
 * DELETE /api/commander/tournaments/[id]/entries - Unregister player
 */
import { createClient } from '@supabase/supabase-js';
import { awardXP } from '../../../../../src/lib/commander/xp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id: tournamentId } = req.query;

  if (!tournamentId) {
    return res.status(400).json({ error: 'Tournament ID required' });
  }

  if (req.method === 'GET') {
    return listEntries(req, res, tournamentId);
  }

  if (req.method === 'POST') {
    return registerPlayer(req, res, tournamentId);
  }

  if (req.method === 'PUT') {
    return updateEntry(req, res, tournamentId);
  }

  if (req.method === 'DELETE') {
    return unregisterPlayer(req, res, tournamentId);
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listEntries(req, res, tournamentId) {
  try {
    const { status } = req.query;

    let query = supabase
      .from('commander_tournament_entries')
      .select(`
        *,
        profiles (id, display_name, avatar_url)
      `)
      .eq('tournament_id', tournamentId)
      .order('registered_at', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({ entries: data });
  } catch (error) {
    console.error('List entries error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function registerPlayer(req, res, tournamentId) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    let userId = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    const {
      player_id,
      player_name,
      player_phone,
      registration_method = 'app',
      table_number,
      seat_number
    } = req.body;

    // Get tournament details
    const { data: tournament, error: tournamentError } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Check if registration is allowed
    if (!['scheduled', 'registration', 'running'].includes(tournament.status)) {
      return res.status(400).json({ error: 'Registration is closed for this tournament' });
    }

    // Check late registration
    if (tournament.status === 'running') {
      if (tournament.current_level > tournament.late_registration_levels) {
        return res.status(400).json({ error: 'Late registration period has ended' });
      }
    }

    // Check capacity
    if (tournament.max_entries && tournament.current_entries >= tournament.max_entries) {
      return res.status(400).json({ error: 'Tournament is full' });
    }

    // If registering another player, verify staff access
    const effectivePlayerId = player_id || userId;
    if (effectivePlayerId !== userId && registration_method !== 'app') {
      const { data: staff, error: staffError } = await supabase
        .from('commander_staff')
        .select('id')
        .eq('venue_id', tournament.venue_id)
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (staffError || !staff) {
        return res.status(403).json({ error: 'Only staff can register other players' });
      }
    }

    // Check for existing registration
    if (effectivePlayerId) {
      const { data: existing } = await supabase
        .from('commander_tournament_entries')
        .select('id, status')
        .eq('tournament_id', tournamentId)
        .eq('player_id', effectivePlayerId)
        .not('status', 'eq', 'eliminated')
        .single();

      if (existing) {
        return res.status(400).json({ error: 'Player is already registered' });
      }
    }

    const { data: entry, error } = await supabase
      .from('commander_tournament_entries')
      .insert({
        tournament_id: tournamentId,
        player_id: effectivePlayerId,
        player_name: player_name || null,
        player_phone: player_phone || null,
        registration_method,
        table_number,
        seat_number,
        status: tournament.status === 'running' ? 'active' : 'registered',
        current_chips: tournament.starting_chips
      })
      .select(`
        *,
        profiles (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Award XP for registration
    if (effectivePlayerId) {
      await awardXP(effectivePlayerId, 'tournament.registered', {
        tournament_id: tournamentId,
        tournament_name: tournament.name,
        buyin: tournament.buyin_amount
      });
    }

    return res.status(201).json({ entry });
  } catch (error) {
    console.error('Register player error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updateEntry(req, res, tournamentId) {
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

    const {
      entry_id,
      action,
      table_number,
      seat_number,
      current_chips
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ error: 'Entry ID required' });
    }

    // Get entry and tournament
    const { data: entry, error: entryError } = await supabase
      .from('commander_tournament_entries')
      .select('*, commander_tournaments(*)')
      .eq('id', entry_id)
      .eq('tournament_id', tournamentId)
      .single();

    if (entryError || !entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const tournament = entry.commander_tournaments;

    // Check if user is staff or the player themselves
    const isOwnEntry = entry.player_id === user.id;
    let isStaff = false;

    if (!isOwnEntry) {
      const { data: staff } = await supabase
        .from('commander_staff')
        .select('id')
        .eq('venue_id', tournament.venue_id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      isStaff = !!staff;
    }

    if (!isOwnEntry && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let updates = {};

    switch (action) {
      case 'rebuy':
        if (!tournament.allows_rebuys) {
          return res.status(400).json({ error: 'Rebuys not allowed in this tournament' });
        }
        if (tournament.rebuy_end_level && tournament.current_level > tournament.rebuy_end_level) {
          return res.status(400).json({ error: 'Rebuy period has ended' });
        }
        if (tournament.max_rebuys && entry.rebuy_count >= tournament.max_rebuys) {
          return res.status(400).json({ error: 'Maximum rebuys reached' });
        }
        updates = {
          rebuy_count: entry.rebuy_count + 1,
          current_chips: (entry.current_chips || 0) + tournament.rebuy_chips
        };
        break;

      case 'addon':
        if (!tournament.allows_addon) {
          return res.status(400).json({ error: 'Add-ons not allowed in this tournament' });
        }
        if (entry.addon_taken) {
          return res.status(400).json({ error: 'Add-on already taken' });
        }
        updates = {
          addon_taken: true,
          current_chips: (entry.current_chips || 0) + tournament.addon_chips
        };
        break;

      case 'seat':
        updates = {
          table_number,
          seat_number,
          status: 'seated'
        };
        break;

      case 'update_chips':
        if (!isStaff) {
          return res.status(403).json({ error: 'Only staff can update chip counts' });
        }
        updates = {
          current_chips,
          last_chip_count_at: new Date().toISOString()
        };
        break;

      case 'activate':
        updates = { status: 'active' };
        break;

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    const { data: updated, error } = await supabase
      .from('commander_tournament_entries')
      .update(updates)
      .eq('id', entry_id)
      .select(`
        *,
        profiles (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    return res.status(200).json({ entry: updated });
  } catch (error) {
    console.error('Update entry error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function unregisterPlayer(req, res, tournamentId) {
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

    const { entry_id } = req.body;

    if (!entry_id) {
      return res.status(400).json({ error: 'Entry ID required' });
    }

    // Get entry
    const { data: entry, error: entryError } = await supabase
      .from('commander_tournament_entries')
      .select('*, commander_tournaments(venue_id, status)')
      .eq('id', entry_id)
      .eq('tournament_id', tournamentId)
      .single();

    if (entryError || !entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const tournament = entry.commander_tournaments;

    // Only allow unregister before tournament starts
    if (!['scheduled', 'registration'].includes(tournament.status)) {
      // Check if staff
      const { data: staff } = await supabase
        .from('commander_staff')
        .select('id')
        .eq('venue_id', tournament.venue_id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (!staff) {
        return res.status(400).json({ error: 'Cannot unregister after tournament has started' });
      }
    }

    // Check if own entry or staff
    const isOwnEntry = entry.player_id === user.id;
    if (!isOwnEntry) {
      const { data: staff } = await supabase
        .from('commander_staff')
        .select('id')
        .eq('venue_id', tournament.venue_id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (!staff) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { error } = await supabase
      .from('commander_tournament_entries')
      .delete()
      .eq('id', entry_id);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Player unregistered' });
  } catch (error) {
    console.error('Unregister player error:', error);
    return res.status(500).json({ error: error.message });
  }
}
