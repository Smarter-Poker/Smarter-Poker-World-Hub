import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * POST /api/club-arena/player-chip-flow
 *
 * Returns 7-day chip flow for each player in an agent's downline.
 * Used by AgentDashboard PlayersTab to show net chip movement per player.
 *
 * Body: { clubId }
 * Auth: Bearer token (agent / sub_agent / owner / admin)
 *
 * Response:
 *   { success: true, flow: { [userId]: { in: number, out: number, net: number } } }
 *
 * "in"  = chips distributed TO this player (distribute, agent_to_player, cashout_approved reversed, promo_agent_to_player)
 * "out" = chips leaving this player (cashout_approved)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

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

const INBOUND_TYPES = ['distribute', 'agent_to_player', 'promo_agent_to_player'];
const OUTBOUND_TYPES = ['cashout_approved'];

export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { clubId } = req.body;
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

    // RED TEAM: Payload size + field allowlist
    const ALLOWED = new Set(['clubId']);
    const bodyStr = JSON.stringify(req.body || {});
    if (bodyStr.length > 512) return res.status(413).json({ success: false, error: 'Request body too large' });
    const bad = Object.keys(req.body || {}).filter(k => !ALLOWED.has(k));
    if (bad.length > 0) return res.status(400).json({ success: false, error: `Unknown fields: ${bad.join(', ')}` });

    if (!applyRateLimit(req, res, 'club-arena/player-chip-flow')) return;

    try {
      // Verify caller is agent / owner / admin in this club
      const { data: member } = await getSupabase()
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member || !['owner', 'admin', 'super_agent', 'agent', 'sub_agent'].includes(member.role)) {
        return res.status(403).json({ success: false, error: 'Agent or admin access required' });
      }

      const isAgent = ['agent', 'sub_agent', 'super_agent'].includes(member.role);
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Get downline player IDs for scoping (agents only see their own)
      let playerIds = null;
      if (isAgent) {
        const { data: agentRow } = await getSupabase()
          .from('agents')
          .select('id')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (agentRow) {
          const { data: players } = await getSupabase()
            .from('club_members')
            .select('user_id')
            .eq('club_id', clubId)
            .eq('agent_id', agentRow.id);
          playerIds = (players || []).map(p => p.user_id);
        }
      }

      // Query chip_transactions in last 7 days, scoped to this club
      let txQuery = getSupabase()
        .from('chip_transactions')
        .select('to_user_id, from_user_id, amount, transaction_type')
        .eq('club_id', clubId)
        .gte('created_at', since7d)
        .in('transaction_type', [...INBOUND_TYPES, ...OUTBOUND_TYPES])
        .limit(2000);

      // If agent, restrict to transactions involving their players
      if (playerIds && playerIds.length > 0) {
        txQuery = txQuery.or(
          `to_user_id.in.(${playerIds.join(',')}),from_user_id.in.(${playerIds.join(',')})`
        );
      } else if (isAgent && (!playerIds || playerIds.length === 0)) {
        // Agent with no players — return empty
        return res.status(200).json({ success: true, flow: {} });
      }

      const { data: txns, error: txErr } = await txQuery;
      if (txErr) throw txErr;

      // Aggregate into { userId: { in, out, net } }
      const flow = {};

      const ensure = (uid) => {
        if (!flow[uid]) flow[uid] = { in: 0, out: 0, net: 0 };
      };

      for (const tx of (txns || [])) {
        const amt = Number(tx.amount) || 0;

        if (INBOUND_TYPES.includes(tx.transaction_type) && tx.to_user_id) {
          ensure(tx.to_user_id);
          flow[tx.to_user_id].in += amt;
          flow[tx.to_user_id].net += amt;
        }

        if (OUTBOUND_TYPES.includes(tx.transaction_type) && tx.from_user_id) {
          ensure(tx.from_user_id);
          flow[tx.from_user_id].out += amt;
          flow[tx.from_user_id].net -= amt;
        }
      }

      return res.status(200).json({ success: true, flow });
    } catch (err) {
      console.warn('[player-chip-flow] error:', err);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
