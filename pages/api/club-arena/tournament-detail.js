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

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'GET only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  const { tournamentId, clubId } = req.query;
  if (!tournamentId || !clubId) {
    return res.status(400).json({ success: false, error: 'tournamentId and clubId required' });
  }

  if (!applyRateLimit(req, res, 'club-arena/tournament-detail')) return;

  try {
    // Verify caller is a member of this club
    const { data: membership } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      // Also allow union admins
      const { data: clubRow } = await supabaseAdmin
        .from('clubs').select('union_id').eq('id', clubId).maybeSingle();
      if (clubRow?.union_id) {
        const { data: ua } = await supabaseAdmin
          .from('union_admins').select('role')
          .eq('union_id', clubRow.union_id).eq('user_id', user.id).maybeSingle();
        if (!ua) return res.status(403).json({ success: false, error: 'Club membership required' });
      } else {
        return res.status(403).json({ success: false, error: 'Club membership required' });
      }
    }

    // Load registrations (all statuses except unregistered/refunded)
    const { data: registrations, error: regErr } = await supabaseAdmin
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
    const { data: profileRows } = await supabaseAdmin
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
      const { data: tourn } = await supabaseAdmin
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
      console.error('[tournament-detail] bounty state error (non-fatal):', bountyErr.message);
      // Non-fatal — respond without bounty state
    }

    return res.status(200).json({
      success: true,
      registrations,
      profiles,
      stats: { totalRebuys, totalAddons },
      bountyState,
    });
  } catch (err) {
    console.error('[tournament-detail] error:', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}
