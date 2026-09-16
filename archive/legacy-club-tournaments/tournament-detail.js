/**
 * GET /api/club-arena/tournament-detail?tournamentId=...&clubId=...
 *
 * Returns full tournament detail including:
 * - Registrations with resolved display names + avatars
 * - Final results (finish_position + payout_amount) for completed tournaments
 * - Rebuy/add-on counts per player
 *
 * Auth: Bearer token (any club member)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'GET only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const tournamentId = safeQ(req.query.tournamentId);
    const clubId = safeQ(req.query.clubId);
    if (!tournamentId || !clubId) {
      return res.status(400).json({ success: false, error: 'tournamentId and clubId required' });
    }

    if (!applyRateLimit(req, res, 'club-arena/tournament-detail')) return;

    try {
      // Verify caller is a member of this club
      const { data: membership } = await getSupabase()
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership) {
        // Also allow union admins
        const { data: clubRow } = await getSupabase()
          .from('clubs').select('union_id').eq('id', clubId).maybeSingle();
        if (clubRow?.union_id) {
          const { data: ua } = await getSupabase()
            .from('union_admins').select('role')
            .eq('union_id', clubRow.union_id).eq('user_id', user.id).maybeSingle();
          if (ua) {
              // authorized
          } else {
              // Owner fallback
              const { data: union } = await getSupabase().from('unions').select('id').eq('id', clubRow.union_id).eq('owner_id', user.id).maybeSingle();
              if (!union) return res.status(403).json({ success: false, error: 'Club membership required' });
          }
        } else {
          return res.status(403).json({ success: false, error: 'Club membership required' });
        }
      }

      // FIX-B9 2026-07-19: the membership check authorizes the caller for clubId,
      // but tournamentId came from the query string untrusted. Verify the
      // tournament actually belongs to this club — otherwise a member of club A
      // could pass clubId=A with a tournamentId from club B and read B's private
      // registration list (IDOR).
      const { data: tournClub } = await getSupabase()
        .from('tournaments').select('club_id').eq('id', tournamentId).maybeSingle();
      if (!tournClub || tournClub.club_id !== clubId) {
        return res.status(404).json({ success: false, error: 'Tournament not found in this club' });
      }

      // Load registrations (all statuses except unregistered/refunded)
      const { data: registrations, error: regErr } = await getSupabase()
        .from('tournament_registrations')
        .select('user_id, status, registered_at, finish_position, payout_amount, rebuys_used, addon_used, eliminated_at')
        .eq('tournament_id', tournamentId)
        .in('status', ['registered', 'playing', 'eliminated'])
        .order('finish_position', { ascending: true, nullsFirst: false })
        .order('registered_at', { ascending: true });

      if (regErr) throw regErr;

      if (!registrations || registrations.length === 0) {
        return res.status(200).json({ success: true, registrations: [], profiles: {} });
      }

      // Resolve display names for all registered players
      const userIds = [...new Set(registrations.map(r => r.user_id))];
      const { data: profileRows } = await getSupabase()
        .from('profiles')
        .select('id, display_name, username, full_name, avatar_url')
        .in('id', userIds);

      // Build profile map
      const profiles = {};
      for (const p of (profileRows || [])) {
        profiles[p.id] = {
          display_name: p.display_name || p.full_name || p.username || null,
          username: p.username,
          avatar_url: p.avatar_url,
        };
      }

      // Aggregate rebuy totals
      const totalRebuys = registrations.reduce((s, r) => s + (r.rebuys_used || 0), 0);
      const totalAddons = registrations.filter(r => r.addon_used).length;

      // ── Bounty State: query engine for live bounty data ──
      let bountyState = null;
      try {
        const { data: tourn } = await getSupabase()
          .from('club_tournaments')
          .select('status, settings')
          .eq('id', tournamentId)
          .maybeSingle();

        if (tourn && ['running', 'late_reg', 'final_table'].includes(tourn?.status) &&
          tourn.settings?.bounty_type && tourn.settings.bounty_type !== 'none') {
          const { getController } = require('../../../src/lib/poker-engine/GameController');
          const controller = await getController();
          const state = controller.getTournamentState?.(tournamentId);
          if (state?.bountyState) {
            bountyState = {
              bountyType: state.bountyState.bountyType,
              totalBountyPool: state.bountyState.totalBountyPool,
              totalBountiesAwarded: state.bountyState.totalBountiesAwarded,
              mysteryPhaseActive: state.bountyState.mysteryPhaseActive || false,
              mysteryPool: state.bountyState.mysteryPool || 0,
              mysteryEnvelopesRemaining: state.bountyState.mysteryEnvelopesRemaining ?? null,
              leaderboard: (state.bountyState.leaderboard || []).slice(0, 10),
              recentAwards: (state.bountyState.recentAwards || []).slice(-10),
            };
          }
        }
      } catch (bountyErr) {
        console.warn('[tournament-detail] bounty state error (non-fatal):', bountyErr.message);
        // Non-fatal — respond without bounty state
      }

      // If no live bounty state, try persisted bounty results from completed tournaments
      if (!bountyState) {
        try {
          const { data: tourn2 } = await getSupabase()
            .from('club_tournaments')
            .select('status, settings')
            .eq('id', tournamentId)
            .maybeSingle();
          if (tourn2?.settings?.bounty_results) {
            bountyState = { ...tourn2.settings.bounty_results, isHistorical: true };
          }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      }

      return res.status(200).json({
        success: true,
        registrations,
        profiles,
        stats: { totalRebuys, totalAddons },
        bountyState,
      });
    } catch (err) {
      console.warn('[tournament-detail] error:', err);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
