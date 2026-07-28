/**
 * Tournament Engine API
 * POST /api/poker/engine/tournament
 * 
 * Actions: create, register, unregister, start, state, rebuy, addon, cancel, list
 * 
 * Bridges the poker engine's TournamentController with HTTP API.
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    // Auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    // Lazy import to avoid circular deps
    const { getController } = require('../../../../src/lib/poker-engine/GameController');

    let controller;
    try {
      // Rate limit
      if (!applyRateLimit(req, res, 'poker/engine/tournament')) return;

      controller = await getController();
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Engine unavailable', details: err.message });
    }

    const { action, ...params } = req.body;

    try {
      switch (action) {
        // ═══════════════════════════════════════
        // CREATE
        // ═══════════════════════════════════════
        case 'create': {
          const { clubId } = params;
          if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

          // Verify user is admin/owner of this club
          const { data: member } = await getSupabase()
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!member || !['owner', 'admin', 'manager'].includes(member.role)) {
            return res.status(403).json({ success: false, error: 'Not authorized to create tournaments in this club' });
          }

          const result = await controller.createTournament({
            ...params,
            clubId,
            createdBy: user.id,
          });
          return res.status(result.success ? 201 : 400).json(result);
        }

        // ═══════════════════════════════════════
        // REGISTER
        // ═══════════════════════════════════════
        case 'register': {
          const { tournamentId, playerName } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

          const displayName = playerName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'Player';
          const result = await controller.registerForTournament(tournamentId, user.id, displayName);
          return res.status(result.success ? 200 : 400).json(result);
        }

        // ═══════════════════════════════════════
        // UNREGISTER
        // ═══════════════════════════════════════
        case 'unregister': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });
          const result = await controller.unregisterFromTournament(tournamentId, user.id);
          return res.status(result.success ? 200 : 400).json(result);
        }

        // ═══════════════════════════════════════
        // START
        // ═══════════════════════════════════════
        case 'start': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

          // Verify caller is staff of the tournament's club
          const startState = controller.getTournamentState(tournamentId);
          if (!startState) return res.status(404).json({ success: false, error: 'Tournament not found' });
          if (startState.clubId) {
            const { data: mem } = await getSupabase().from('club_members').select('role')
              .eq('club_id', startState.clubId).eq('user_id', user.id).maybeSingle();
            if (!mem || !['owner', 'admin', 'manager'].includes(mem.role)) {
              return res.status(403).json({ success: false, error: 'Only staff can start tournaments' });
            }
          }

          const result = await controller.startTournament(tournamentId);
          return res.status(result.success ? 200 : 400).json(result);
        }

        // ═══════════════════════════════════════
        // STATE
        // ═══════════════════════════════════════
        case 'state': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });
          let state = controller.getTournamentState(tournamentId);

          // Cold-start fallback: if tournament not in memory, read basic state from DB.
          // 2026-07-20 club-arena retirement: repointed from the legacy
          // club_tournaments table (dead since 2026-03) to the canonical
          // tournaments table (column map: buy_in -> buy_in_amount).
          // tournament_registrations.tournament_id already FKs to tournaments.
          if (!state) {
            const { data: row } = await getSupabase()
              .from('tournaments')
              .select('*, tournament_registrations(user_id, status, registered_at)')
              .eq('id', tournamentId)
              .maybeSingle();

            if (!row) return res.status(404).json({ success: false, error: 'Tournament not found' });

            // Return a minimal DB-based state so the UI can still display info
            return res.status(200).json({
              success: true,
              tournamentId,
              name: row.name,
              status: row.status,
              buyIn: row.buy_in_amount,
              startingChips: row.starting_chips,
              maxPlayers: row.max_players,
              entries: (row.tournament_registrations || []).filter(r => r.status !== 'cancelled').length,
              prizePool: row.prize_pool || 0,
              tables: [],
              _fromDb: true, // Flag so UI knows this is a DB snapshot, not live state
            });
          }

          return res.status(200).json({ success: true, ...state });
        }

        // ═══════════════════════════════════════
        // REBUY
        // ═══════════════════════════════════════
        case 'rebuy': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });
          const result = await controller.tournamentRebuy(tournamentId, user.id);
          return res.status(result.success ? 200 : 400).json(result);
        }

        // ═══════════════════════════════════════
        // ADDON
        // ═══════════════════════════════════════
        case 'addon': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });
          const result = await controller.tournamentAddon(tournamentId, user.id);
          return res.status(result.success ? 200 : 400).json(result);
        }

        // ═══════════════════════════════════════
        // CANCEL
        // ═══════════════════════════════════════
        case 'cancel': {
          const { tournamentId } = params;
          if (!tournamentId) return res.status(400).json({ success: false, error: 'tournamentId required' });

          // Verify caller is staff of the tournament's club
          const cancelState = controller.getTournamentState(tournamentId);
          if (!cancelState) return res.status(404).json({ success: false, error: 'Tournament not found' });
          if (cancelState.clubId) {
            const { data: mem } = await getSupabase().from('club_members').select('role')
              .eq('club_id', cancelState.clubId).eq('user_id', user.id).maybeSingle();
            if (!mem || !['owner', 'admin', 'manager'].includes(mem.role)) {
              return res.status(403).json({ success: false, error: 'Only staff can cancel tournaments' });
            }
          }

          const result = await controller.cancelTournament(tournamentId);
          return res.status(result.success ? 200 : 400).json(result);
        }

        // ═══════════════════════════════════════
        // LIST
        // ═══════════════════════════════════════
        case 'list': {
          const tournaments = controller.listTournaments();
          return res.status(200).json({ success: true, tournaments });
        }

        default:
          return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (err) {
      console.warn('[Tournament API] Error:', err);
      return res.status(500).json({ success: false, error: 'Internal error', details: err.message });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
