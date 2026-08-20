import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/promo-wallet
 * 
 * Admin/owner promo wallet management:
 *   action: 'get_balances' — club promo balance + all agent promo balances
 *   action: 'mint_promo'   — owner adds promo chips to club balance
 *   action: 'grant_to_agent' — transfer promo from club → agent
 * 
 * ═══════════════════════════════════════════════════════════
 * PROMO CHIPS ARE NOT SETTLEMENT DEBTS
 * ═══════════════════════════════════════════════════════════
 * Promo chips are funded from 30% of the BBJ allocation.
 * They are ALREADY raked and accounted for. They do NOT:
 *   - Count as agent credit (no credit_used bump)
 *   - Create union settlement debts
 *   - Affect weekly_rake_generated or commission calculations
 *   - Touch chip_balance or chip_treasury
 * 
 * They flow through separate promo_balance columns on:
 *   clubs.promo_balance → agents.promo_balance → club_members.promo_balance
 * ═══════════════════════════════════════════════════════════
 * 
 * Auth: Bearer token (owner/admin only)
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

export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/promo-wallet')) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { action, clubId, ...params } = req.body;
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

    // Verify caller is owner/admin
    const { data: member } = await getSupabase()
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ success: false, error: 'Only owners and admins can manage promo wallet' });
    }

    try {
      switch (action) {
        // ═══════════════════════════════════════════════════
        // GET BALANCES — club promo + all agent promo balances
        // ═══════════════════════════════════════════════════
        case 'get_balances': {
          const { data: club } = await getSupabase()
            .from('clubs')
            .select('promo_balance')
            .eq('id', clubId)
            .maybeSingle();

          const { data: agents } = await getSupabase()
            .from('agents')
            .select('user_id, promo_balance, commission_rate, status')
            .eq('club_id', clubId)

          // Get display names for agents
          const agentIds = (agents || []).map(a => a.user_id);
          let profiles = [];
          if (agentIds.length > 0) {
            const { data } = await getSupabase()
              .from('profiles')
              .select('id, display_name, username, avatar_url')
              .in('id', agentIds)
                  .limit(100);
            profiles = data || [];
          }

          const agentList = (agents || []).map(a => {
            const p = profiles.find(pr => pr.id === a.user_id);
            return {
              userId: a.user_id,
              displayName: p?.display_name || p?.username || a.user_id.slice(0, 8),
              avatarUrl: p?.avatar_url,
              promoBalance: Number(a.promo_balance) || 0,
              commissionRate: a.commission_rate,
              status: a.status,
            };
          });

          return res.status(200).json({
            success: true,
            clubPromoBalance: Number(club?.promo_balance) || 0,
            agents: agentList,
            totalAgentPromo: agentList.reduce((sum, a) => sum + a.promoBalance, 0),
          });
        }

        // ═══════════════════════════════════════════════════
        // MINT PROMO — add promo chips to club balance (owner only)
        // ═══════════════════════════════════════════════════
        case 'mint_promo': {
          if (member.role !== 'owner') {
            return res.status(403).json({ success: false, error: 'Only the club owner can mint promo chips' });
          }

          const amount = parseFloat(params.amount);
          if (!amount || amount <= 0 || amount > 10000000) {
            return res.status(400).json({ success: false, error: 'Amount must be between 1 and 10,000,000' });
          }

          // Atomically increment promo balance via RPC
          const { data: result, error: rpcErr } = await getSupabase().rpc('mint_club_promo', {
            p_club_id: clubId,
            p_amount: amount,
          });

          if (rpcErr) {
            return res.status(500).json({ success: false, error: 'Mint failed', details: rpcErr.message });
          }

          // mint_club_promo is a deliberate tombstone: promo chips can only be
          // derived from the BBJ sweep, so it ALWAYS returns {success:false}.
          // The old code returned HTTP 200 with amount echoed back, so the UI
          // reported a mint that never happened.
          if (!result?.success) {
            return res.status(400).json({
              success: false,
              error: result?.error || 'Mint refused',
            });
          }

          return res.status(200).json({
            success: true,
            amount,
            ...(result || {}),
          });
        }

        // ═══════════════════════════════════════════════════
        // GRANT TO AGENT — transfer promo from club → agent
        // ═══════════════════════════════════════════════════
        case 'grant_to_agent': {
          const { agentUserId, amount: grantAmount, note } = params;
          const amt = parseFloat(grantAmount);

          if (!agentUserId) return res.status(400).json({ success: false, error: 'agentUserId required' });
          if (!amt || amt <= 0) return res.status(400).json({ success: false, error: 'Positive amount required' });

          const { data: result, error: rpcErr } = await getSupabase().rpc('transfer_promo_club_to_agent', {
            p_club_id: clubId,
            p_agent_user_id: agentUserId,
            p_amount: amt,
            p_note: note || `Admin promo grant by ${user.id.slice(0, 8)}`,
          });

          if (rpcErr) {
            return res.status(500).json({ success: false, error: 'Grant failed', details: rpcErr.message });
          }

          if (!result?.success) {
            return res.status(400).json({ success: false, error: result?.error || 'Grant failed' });
          }

          return res.status(200).json({
            success: true,
            amount: amt,
            agentUserId,
            clubPromoAfter: result.club_promo_after,
            agentPromoAfter: result.agent_promo_after,
          });
        }

        default:
          return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (err) {
      console.warn('[promo-wallet]', err);
      return res.status(500).json({ success: false, error: 'Internal error', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
