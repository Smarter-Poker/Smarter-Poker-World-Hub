/**
 * Tournament Engine API
 * POST /api/poker/engine/tournament
 * 
 * Actions: create, register, unregister, start, state, rebuy, addon, cancel, list
 * 
 * Bridges the poker engine's TournamentController with HTTP API.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Auth
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Auth required' });
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  // Lazy import to avoid circular deps
  const { getController } = require('../../../../src/lib/poker-engine/GameController');

  let controller;
  try {
    controller = await getController();
  } catch (err) {
    return res.status(500).json({ error: 'Engine unavailable', details: err.message });
  }

  const { action, ...params } = req.body;

  try {
    switch (action) {
      // ═══════════════════════════════════════
      // CREATE
      // ═══════════════════════════════════════
      case 'create': {
        const { clubId } = params;
        if (!clubId) return res.status(400).json({ error: 'clubId required' });

        // Verify user is admin/owner of this club
        const { data: member } = await supabase
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .single();

        if (!member || !['owner', 'admin', 'manager'].includes(member.role)) {
          return res.status(403).json({ error: 'Not authorized to create tournaments in this club' });
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
        if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });

        const displayName = playerName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'Player';
        const result = await controller.registerForTournament(tournamentId, user.id, displayName);
        return res.status(result.success ? 200 : 400).json(result);
      }

      // ═══════════════════════════════════════
      // UNREGISTER
      // ═══════════════════════════════════════
      case 'unregister': {
        const { tournamentId } = params;
        if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
        const result = await controller.unregisterFromTournament(tournamentId, user.id);
        return res.status(result.success ? 200 : 400).json(result);
      }

      // ═══════════════════════════════════════
      // START
      // ═══════════════════════════════════════
      case 'start': {
        const { tournamentId } = params;
        if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
        const result = await controller.startTournament(tournamentId);
        return res.status(result.success ? 200 : 400).json(result);
      }

      // ═══════════════════════════════════════
      // STATE
      // ═══════════════════════════════════════
      case 'state': {
        const { tournamentId } = params;
        if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
        const state = controller.getTournamentState(tournamentId);
        if (!state) return res.status(404).json({ error: 'Tournament not found' });
        return res.status(200).json({ success: true, ...state });
      }

      // ═══════════════════════════════════════
      // REBUY
      // ═══════════════════════════════════════
      case 'rebuy': {
        const { tournamentId } = params;
        if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
        const result = await controller.tournamentRebuy(tournamentId, user.id);
        return res.status(result.success ? 200 : 400).json(result);
      }

      // ═══════════════════════════════════════
      // ADDON
      // ═══════════════════════════════════════
      case 'addon': {
        const { tournamentId } = params;
        if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
        const result = await controller.tournamentAddon(tournamentId, user.id);
        return res.status(result.success ? 200 : 400).json(result);
      }

      // ═══════════════════════════════════════
      // CANCEL
      // ═══════════════════════════════════════
      case 'cancel': {
        const { tournamentId } = params;
        if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
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
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[Tournament API] Error:', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}
