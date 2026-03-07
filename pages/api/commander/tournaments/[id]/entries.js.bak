/**
 * Tournament Entries API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * GET /api/commander/tournaments/[id]/entries - List entries
 * POST /api/commander/tournaments/[id]/entries - Register player
 * DELETE /api/commander/tournaments/[id]/entries - Unregister player
 */
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../../../src/lib/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  const _g = await guardWriteStaff(req, res); if (!_g) return;

  const { id: tournamentId } = req.query;

  if (!tournamentId) {
    return res.status(400).json({ success: false, error: 'Tournament ID required' });
  }

  if (req.method === 'GET') {
    return listEntries(req, res, tournamentId);
  }

  if (req.method === 'POST') {
    return registerPlayer(req, res, tournamentId);
  }

  if (req.method === 'DELETE') {
    return unregisterPlayer(req, res, tournamentId);
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ success: false, error: 'Method not allowed' });
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
      .order('registered_at', { ascending: true })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({ success: true, data: { entries: data } });
  } catch (error) {
    console.error('List entries error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
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
      .maybeSingle();

    if (tournamentError || !tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found' });
    }

    // Check if registration is allowed
    if (!['scheduled', 'registering', 'running'].includes(tournament.status)) {
      return res.status(400).json({ success: false, error: 'Registration is closed for this tournament' });
    }

    // Check late registration
    if (tournament.status === 'running') {
      if (tournament.current_level > tournament.late_registration_levels) {
        return res.status(400).json({ success: false, error: 'Late registration period has ended' });
      }
    }

    // Check physical capacity (only count people taking up a chair)
    if (tournament.max_entries) {
      const { count } = await supabase
        .from('commander_tournament_entries')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .in('status', ['registered', 'seated', 'active'])

      if (count >= tournament.max_entries) {
        return res.status(400).json({ success: false, error: 'Tournament is full' });
      }
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
        .maybeSingle();

      if (staffError || !staff) {
        return res.status(403).json({ success: false, error: 'Only staff can register other players' });
      }
    }

    // Check for existing registration
    if (effectivePlayerId) {
      const { data: existing } = await supabase
        .from('commander_tournament_entries')
        .select('id, status')
        .eq('tournament_id', tournamentId)
        .eq('player_id', effectivePlayerId)
        .not('status', 'in', '("eliminated","cancelled")')
        .maybeSingle();

      if (existing) {
        return res.status(400).json({ success: false, error: 'Player is already registered' });
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
      // XP system removed
    }

    return res.status(201).json({ success: true, data: { entry } });
  } catch (error) {
    console.error('Register player error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function unregisterPlayer(req, res, tournamentId) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const { entry_id } = req.body;

    if (!entry_id) {
      return res.status(400).json({ success: false, error: 'Entry ID required' });
    }

    // Get entry
    const { data: entry, error: entryError } = await supabase
      .from('commander_tournament_entries')
      .select('*, commander_tournaments(venue_id, status)')
      .eq('id', entry_id)
      .eq('tournament_id', tournamentId)
      .maybeSingle();

    if (entryError || !entry) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }

    const tournament = entry.commander_tournaments;

    // Only allow unregister before tournament starts
    if (!['scheduled', 'registering'].includes(tournament.status)) {
      // Check if staff
      const { data: staff } = await supabase
        .from('commander_staff')
        .select('id')
        .eq('venue_id', tournament.venue_id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!staff) {
        return res.status(400).json({ success: false, error: 'Cannot unregister after tournament has started' });
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
        .maybeSingle();

      if (!staff) {
        return res.status(403).json({ success: false, error: 'Access denied' });
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
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
