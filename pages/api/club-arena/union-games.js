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
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

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
    .eq('union_id', unionId)
    .limit(200);

  return (unionClubs || []).map(uc => uc.club_id);
}

async function getClubsInfo(clubIds) {
  if (clubIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('clubs')
    .select('id, name, club_id')
    .in('id', clubIds)
        .limit(100);
  return data || [];
}

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

  const { action, unionId, ...params } = req.body;
  if (!unionId) return res.status(400).json({ success: false, error: 'unionId required' });
  if (!action) return res.status(400).json({ success: false, error: 'action required' });

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

      // Only return active/waiting tables by default; pass statusFilter=['closed','all'] to include closed
      const tableStatusFilter = params.statusFilter;
      let tablesQuery = supabaseAdmin
        .from('tables')
        .select('*')
        .in('club_id', clubIds)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!tableStatusFilter || tableStatusFilter === 'active') {
        tablesQuery = tablesQuery.in('status', ['waiting', 'running']);
      } else if (tableStatusFilter === 'closed') {
        tablesQuery = tablesQuery.eq('status', 'closed');
      }
      // else 'all' — no filter

      const { data: tables, error } = await tablesQuery;

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
        return res.status(400).json({ success: false, error: 'Invalid club for this union' });
      }
      if (!name?.trim()) return res.status(400).json({ success: false, error: 'Tournament name required' });

      // Validate financial params — prevent negative/absurd values
      const resolvedBuyIn = parseInt(buyIn || buy_in) || 1000;
      const resolvedStartChips = parseInt(startingChips || starting_chips) || 5000;
      const resolvedMaxPlayers = Math.min(parseInt(maxPlayers || max_players) || 100, 5000);
      const resolvedGuarantee = parseInt(guaranteedPrize || guaranteed_prize) || 0;
      if (resolvedBuyIn < 0) return res.status(400).json({ success: false, error: 'buy_in cannot be negative' });
      if (resolvedStartChips < 100) return res.status(400).json({ success: false, error: 'starting_chips must be at least 100' });
      if (resolvedMaxPlayers < 2) return res.status(400).json({ success: false, error: 'max_players must be at least 2' });
      if (resolvedGuarantee < 0) return res.status(400).json({ success: false, error: 'guaranteed_prize cannot be negative' });

      // Validate scheduled start time — must be in the future, within 1 year
      const resolvedStartTime = scheduledStart || start_time;
      if (resolvedStartTime) {
        const startMs = new Date(resolvedStartTime).getTime();
        const nowMs = Date.now();
        if (isNaN(startMs)) return res.status(400).json({ success: false, error: 'Invalid start_time format' });
        if (startMs < nowMs - 60_000) return res.status(400).json({ success: false, error: 'start_time cannot be in the past' });
        if (startMs > nowMs + 365 * 24 * 3600_000) return res.status(400).json({ success: false, error: 'start_time cannot be more than 1 year in the future' });
      }

      const tournamentType = type || 'mtt'; // xmtt | mtt | sng
      const clubParticipants = (participatingClubIds?.length > 0)
        ? participatingClubIds.filter(id => clubIds.includes(id))
        : [resolvedClubId];

      const { data: tournament, error } = await supabaseAdmin
        .from('club_tournaments')
        .insert({
          club_id: resolvedClubId,
          name: name.trim(),
          game_type: variant || game_type || 'nlhe',
          buy_in: resolvedBuyIn,
          starting_chips: resolvedStartChips,
          max_players: resolvedMaxPlayers,
          blind_levels: Math.max(1, parseInt(blind_levels) || 15),
          blind_duration: Math.max(1, parseInt(blind_duration) || 10),
          late_reg_levels: Math.max(0, parseInt(lateRegLevels || late_reg_levels) || 6),
          start_time: scheduledStart || start_time || new Date(Date.now() + 3600000).toISOString(),
          guaranteed_prize: resolvedGuarantee,
          rebuy_allowed: rebuyEnabled ?? rebuy_allowed ?? true,
          addon_allowed: addonEnabled ?? addon_allowed ?? false,
          status: 'scheduled',
          prize_pool: 0,
          registered_count: 0,
          created_by: auth.user.id,
          settings: {
            tournamentType,
            isUnionTournament: true,
            unionId,
            clubIds: clubParticipants,
            isXMTT: tournamentType === 'xmtt',
          },
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
        return res.status(400).json({ success: false, error: 'Invalid club for this union' });
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
          current_players: 0,
          created_by: auth.user.id,
          settings: {
            createdByUnion: true,
            unionId,
          },
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
      if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

      // Verify tournament belongs to a union club
      const { data: tourn } = await supabaseAdmin
        .from('club_tournaments')
        .select('id, club_id, status')
        .eq('id', tournamentId)
        .single();

      if (!tourn || !clubIds.includes(tourn.club_id)) {
        return res.status(404).json({ success: false, error: 'Tournament not found in union' });
      }
      if (!['scheduled', 'registering', 'late_reg'].includes(tourn.status)) {
        return res.status(400).json({ success: false, error: `Cannot start tournament in ${tourn.status} status` });
      }

      // Fetch registered player count before starting
      const { count: playerCount } = await supabaseAdmin
        .from('tournament_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .in('status', ['registered', 'playing']);

      const { error } = await supabaseAdmin
        .from('club_tournaments')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', tournamentId);

      if (error) throw error;

      // Attempt to notify the poker engine to seat players and begin dealing
      // Non-fatal: tournament DB status is already set — engine sync can retry
      try {
        const engineRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://smarter.poker'}/api/poker/engine/tournament`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: req.headers.authorization,
          },
          body: JSON.stringify({ action: 'start', tournamentId }),
        });
        if (!engineRes.ok) {
          const engineData = await engineRes.json().catch(() => ({}));
          console.warn('[union-games] engine start non-fatal:', engineData.error || engineRes.status);
        }
      } catch (engineErr) {
        console.warn('[union-games] engine start non-fatal:', engineErr.message);
      }

      return res.json({ success: true, players: playerCount || 0 });
    }

    // ════════════════════════════════════════════════════════════
    // CANCEL TOURNAMENT
    // ════════════════════════════════════════════════════════════
    if (action === 'cancel_tournament') {
      const { tournamentId } = params;
      if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

      const { data: tourn } = await supabaseAdmin
        .from('club_tournaments')
        .select('id, club_id, status')
        .eq('id', tournamentId)
        .single();

      if (!tourn || !clubIds.includes(tourn.club_id)) {
        return res.status(404).json({ success: false, error: 'Tournament not found in union' });
      }
      if (['complete', 'cancelled'].includes(tourn.status)) {
        return res.status(400).json({ success: false, error: 'Tournament already finished' });
      }

      // Fetch all registered players and refund their buy-ins
      const { data: registrations } = await supabaseAdmin
        .from('tournament_registrations')
        .select('id, user_id, buy_in_amount, status')
        .eq('tournament_id', tournamentId)
        .in('status', ['registered', 'playing']);

      const toRefund = registrations || [];

      // Refund each player by releasing their chip lock
      const refundResults = await Promise.allSettled(
        toRefund.map(async (reg) => {
          await supabaseAdmin.rpc('unlock_chips_from_table', {
            p_user_id: reg.user_id,
            p_club_id: tourn.club_id,
            p_table_id: tournamentId,
            p_amount: reg.buy_in_amount || 0,
          });
          await supabaseAdmin
            .from('tournament_registrations')
            .update({ status: 'refunded' })
            .eq('id', reg.id);
        })
      );

      const refundErrors = refundResults.filter(r => r.status === 'rejected');
      if (refundErrors.length > 0) {
        console.error(`[union-games] cancel_tournament: ${refundErrors.length}/${toRefund.length} refunds failed`);
      }

      const { error } = await supabaseAdmin
        .from('club_tournaments')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', tournamentId);

      if (error) throw error;
      return res.json({ success: true, refunded: toRefund.length - refundErrors.length });
    }

    // ════════════════════════════════════════════════════════════
    // OPEN REGISTRATION
    // ════════════════════════════════════════════════════════════
    if (action === 'open_registration') {
      const { tournamentId } = params;
      if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

      const { data: tourn } = await supabaseAdmin
        .from('club_tournaments')
        .select('id, club_id, status')
        .eq('id', tournamentId)
        .single();

      if (!tourn || !clubIds.includes(tourn.club_id)) {
        return res.status(404).json({ success: false, error: 'Tournament not found in union' });
      }
      if (tourn.status !== 'scheduled') {
        return res.status(400).json({ success: false, error: 'Can only open registration for scheduled tournaments' });
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
      if (!tableId) return res.status(400).json({ success: false, error: 'tableId required' });

      const { data: table } = await supabaseAdmin
        .from('tables')
        .select('id, club_id, status')
        .eq('id', tableId)
        .single();

      if (!table || !clubIds.includes(table.club_id)) {
        return res.status(404).json({ success: false, error: 'Table not found in union' });
      }

      const { error } = await supabaseAdmin
        .from('tables')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', tableId);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[union-games]', err);
    return res.status(500).json({ success: false, error: 'Union games request failed', details: err.message });
  }
}
