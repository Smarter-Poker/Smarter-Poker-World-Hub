/**
 * POST /api/club-arena/union-games
 * 
 * Union-level tournament and cash table management.
 * Actions: list_tournaments, list_tables, create_tournament, create_table,
 *          start_tournament, cancel_tournament, open_registration, close_table
 * 
 * Auth: Bearer token (must be union admin)
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyUnionAdmin(token, unionId) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: 'Not authenticated', status: 401 };

  const { data: admin } = await supabaseAdmin
    .from('union_admins')
    .select('role, permissions')
    .eq('union_id', unionId)
    .eq('user_id', user.id)
    .single();

  if (!admin) return { error: 'Not a union admin', status: 403 };

  return { user, admin };
}

async function getUnionClubIds(unionId) {
  const { data: unionClubs } = await supabaseAdmin
    .from('union_clubs')
    .select('club_id')
    .eq('union_id', unionId);

  return (unionClubs || []).map(uc => uc.club_id);
}

async function getClubsInfo(clubIds) {
  if (clubIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('clubs')
    .select('id, name, club_id')
    .in('id', clubIds);
  return data || [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { action, unionId, ...params } = req.body;
  if (!unionId) return res.status(400).json({ error: 'unionId required' });
  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    // Verify union admin
    const auth = await verifyUnionAdmin(token, unionId);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const clubIds = await getUnionClubIds(unionId);

    // ════════════════════════════════════════════════════════════
    // LIST TOURNAMENTS
    // ════════════════════════════════════════════════════════════
    if (action === 'list_tournaments') {
      const statusFilter = params.status || ['scheduled', 'registering', 'late_reg'];
      const clubs = await getClubsInfo(clubIds);

      if (clubIds.length === 0) {
        return res.json({ success: true, tournaments: [], clubs: [] });
      }

      const { data: tournaments, error } = await supabaseAdmin
        .from('club_tournaments')
        .select('*')
        .in('club_id', clubIds)
        .in('status', statusFilter)
        .order('start_time', { ascending: true })
        .limit(50);

      if (error) throw error;

      return res.json({ success: true, tournaments: tournaments || [], clubs });
    }

    // ════════════════════════════════════════════════════════════
    // LIST TABLES
    // ════════════════════════════════════════════════════════════
    if (action === 'list_tables') {
      const clubs = await getClubsInfo(clubIds);

      if (clubIds.length === 0) {
        return res.json({ success: true, tables: [], clubs: [] });
      }

      const { data: tables, error } = await supabaseAdmin
        .from('tables')
        .select('*')
        .in('club_id', clubIds)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      return res.json({ success: true, tables: tables || [], clubs });
    }

    // ════════════════════════════════════════════════════════════
    // CREATE TOURNAMENT
    // ════════════════════════════════════════════════════════════
    if (action === 'create_tournament') {
      const { hostClubId, clubId, name, type, variant, game_type, 
              buyIn, buy_in, startingChips, starting_chips, 
              maxPlayers, max_players, lateRegLevels, late_reg_levels,
              rebuyEnabled, rebuy_allowed, addonEnabled, addon_allowed,
              guaranteedPrize, guaranteed_prize, scheduledStart, start_time,
              blind_levels, blind_duration, participatingClubIds } = params;

      const resolvedClubId = hostClubId || clubId;
      if (!resolvedClubId || !clubIds.includes(resolvedClubId)) {
        return res.status(400).json({ error: 'Invalid club for this union' });
      }
      if (!name?.trim()) return res.status(400).json({ error: 'Tournament name required' });

      const { data: tournament, error } = await supabaseAdmin
        .from('club_tournaments')
        .insert({
          club_id: resolvedClubId,
          name: name.trim(),
          game_type: variant || game_type || type || 'nlhe',
          buy_in: parseInt(buyIn || buy_in) || 1000,
          starting_chips: parseInt(startingChips || starting_chips) || 5000,
          max_players: parseInt(maxPlayers || max_players) || 100,
          blind_levels: parseInt(blind_levels) || 15,
          blind_duration: parseInt(blind_duration) || 10,
          late_reg_levels: parseInt(lateRegLevels || late_reg_levels) || 6,
          start_time: scheduledStart || start_time || new Date(Date.now() + 3600000).toISOString(),
          guaranteed_prize: parseInt(guaranteedPrize || guaranteed_prize) || 0,
          rebuy_allowed: rebuyEnabled ?? rebuy_allowed ?? true,
          addon_allowed: addonEnabled ?? addon_allowed ?? false,
          status: 'scheduled',
          prize_pool: 0,
          registered_count: 0,
          created_by: auth.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      return res.json({ success: true, tournament });
    }

    // ════════════════════════════════════════════════════════════
    // CREATE TABLE
    // ════════════════════════════════════════════════════════════
    if (action === 'create_table') {
      const { clubId, name, tableName, game_type, gameVariant, stakes,
              smallBlind, bigBlind, ante,
              max_seats, maxPlayers, min_buyin, minBuyIn, max_buyin, maxBuyIn,
              actionTime, rakePercent, rakeCap } = params;

      if (!clubId || !clubIds.includes(clubId)) {
        return res.status(400).json({ error: 'Invalid club for this union' });
      }

      const sb = parseInt(smallBlind) || 1;
      const bb = parseInt(bigBlind) || 2;
      const resolvedStakes = stakes || `${sb}/${bb}`;
      const resolvedName = (name || tableName || '').trim() || `${(gameVariant || game_type || 'NLH').toUpperCase()} ${resolvedStakes}`;

      const { data: table, error } = await supabaseAdmin
        .from('tables')
        .insert({
          club_id: clubId,
          name: resolvedName,
          game_type: gameVariant || game_type || 'nlhe',
          stakes: resolvedStakes,
          small_blind: sb,
          big_blind: bb,
          ante: parseInt(ante) || 0,
          max_seats: parseInt(maxPlayers || max_seats) || 9,
          min_buyin: parseInt(minBuyIn || min_buyin) || sb * 40,
          max_buyin: parseInt(maxBuyIn || max_buyin) || bb * 200,
          action_time: parseInt(actionTime) || 30,
          rake_percent: parseFloat(rakePercent) || 5,
          rake_cap: parseFloat(rakeCap) || 3,
          status: 'waiting',
          player_count: 0,
          created_by: auth.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      return res.json({ success: true, table });
    }

    // ════════════════════════════════════════════════════════════
    // START TOURNAMENT
    // ════════════════════════════════════════════════════════════
    if (action === 'start_tournament') {
      const { tournamentId } = params;
      if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });

      // Verify tournament belongs to a union club
      const { data: tourn } = await supabaseAdmin
        .from('club_tournaments')
        .select('id, club_id, status')
        .eq('id', tournamentId)
        .single();

      if (!tourn || !clubIds.includes(tourn.club_id)) {
        return res.status(404).json({ error: 'Tournament not found in union' });
      }
      if (!['scheduled', 'registering', 'late_reg'].includes(tourn.status)) {
        return res.status(400).json({ error: `Cannot start tournament in ${tourn.status} status` });
      }

      const { error } = await supabaseAdmin
        .from('club_tournaments')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', tournamentId);

      if (error) throw error;
      return res.json({ success: true });
    }

    // ════════════════════════════════════════════════════════════
    // CANCEL TOURNAMENT
    // ════════════════════════════════════════════════════════════
    if (action === 'cancel_tournament') {
      const { tournamentId } = params;
      if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });

      const { data: tourn } = await supabaseAdmin
        .from('club_tournaments')
        .select('id, club_id, status')
        .eq('id', tournamentId)
        .single();

      if (!tourn || !clubIds.includes(tourn.club_id)) {
        return res.status(404).json({ error: 'Tournament not found in union' });
      }
      if (['complete', 'cancelled'].includes(tourn.status)) {
        return res.status(400).json({ error: 'Tournament already finished' });
      }

      const { error } = await supabaseAdmin
        .from('club_tournaments')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', tournamentId);

      if (error) throw error;
      return res.json({ success: true });
    }

    // ════════════════════════════════════════════════════════════
    // OPEN REGISTRATION
    // ════════════════════════════════════════════════════════════
    if (action === 'open_registration') {
      const { tournamentId } = params;
      if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });

      const { data: tourn } = await supabaseAdmin
        .from('club_tournaments')
        .select('id, club_id, status')
        .eq('id', tournamentId)
        .single();

      if (!tourn || !clubIds.includes(tourn.club_id)) {
        return res.status(404).json({ error: 'Tournament not found in union' });
      }
      if (tourn.status !== 'scheduled') {
        return res.status(400).json({ error: 'Can only open registration for scheduled tournaments' });
      }

      const { error } = await supabaseAdmin
        .from('club_tournaments')
        .update({ status: 'registering' })
        .eq('id', tournamentId);

      if (error) throw error;
      return res.json({ success: true });
    }

    // ════════════════════════════════════════════════════════════
    // CLOSE TABLE
    // ════════════════════════════════════════════════════════════
    if (action === 'close_table') {
      const { tableId } = params;
      if (!tableId) return res.status(400).json({ error: 'tableId required' });

      const { data: table } = await supabaseAdmin
        .from('tables')
        .select('id, club_id, status')
        .eq('id', tableId)
        .single();

      if (!table || !clubIds.includes(table.club_id)) {
        return res.status(404).json({ error: 'Table not found in union' });
      }

      const { error } = await supabaseAdmin
        .from('tables')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', tableId);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[union-games]', err);
    return res.status(500).json({ error: 'Union games request failed', details: err.message });
  }
}
