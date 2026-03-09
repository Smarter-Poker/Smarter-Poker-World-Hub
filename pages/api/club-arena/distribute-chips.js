/**
 * POST /api/club-arena/distribute-chips
 * 
 * Move chips from club treasury to a member via atomic RPC.
 * Body: { clubId, toUserId, amount, notes? }
 * Auth: Bearer token (owner, admin, or agent with credit)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  const { clubId, toUserId, amount: rawAmount, notes } = req.body;
  if (!clubId || !toUserId || !rawAmount || rawAmount <= 0) {
    return res.status(400).json({ success: false, error: 'clubId, toUserId, and positive amount required' });
  }
  const amount = Math.floor(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    return res.status(400).json({ success: false, error: 'amount must be a positive integer (max 100M)' });
  }

  // Settlement lock check — block during Monday 4:00-4:10 AM CST
  const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
  if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

  // Rate limit
  if (!applyRateLimit(req, res, 'club-arena/distribute-chips')) return;

  try {
    // Verify caller is owner/admin/agent
    const { data: member } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member || !['owner', 'admin', 'agent', 'sub_agent', 'super_agent'].includes(member.role)) {
      // Fallback: check if caller is a union admin for this club's union
      const { data: club } = await supabaseAdmin
        .from('clubs').select('union_id').eq('id', clubId).maybeSingle();
      let unionAuthorized = false;
      if (club?.union_id) {
        const { data: ua } = await supabaseAdmin
          .from('union_admins').select('role')
          .eq('union_id', club.union_id).eq('user_id', user.id).maybeSingle();
        unionAuthorized = !!ua;
      }
      if (!unionAuthorized) {
        return res.status(403).json({ success: false, error: 'Only owners, admins, agents, or union admins can distribute chips' });
      }
    }

    // If agent, use agent-to-player transfer instead of treasury
    // Union admins (member is null) go through the treasury path like owners
    const isAgentRole = ['agent', 'sub_agent', 'super_agent'].includes(member?.role);
    if (isAgentRole) {
      // ═══════════════════════════════════════════════════════════
      // PROMO DISTRIBUTION — uses promo_balance, NOT credit/chips
      // Promo chips are pre-raked (funded from 30% of BBJ allocation).
      // They do NOT count as agent credit, do NOT create settlement
      // debts, and do NOT affect weekly square-up with the union.
      // ═══════════════════════════════════════════════════════════
      if (req.body.type === 'promo') {
        const { data: result, error: rpcErr } = await supabaseAdmin.rpc('transfer_promo_agent_to_player', {
          p_club_id: clubId,
          p_agent_user_id: user.id,
          p_player_user_id: toUserId,
          p_amount: amount,
          p_note: notes || 'Agent promo distribution',
        });

        if (rpcErr) {
          return res.status(500).json({ success: false, error: 'Promo transfer failed', details: rpcErr.message });
        }
        if (!result?.success) {
          return res.status(400).json({ success: false, error: result?.error || 'Promo transfer failed', details: result });
        }

        return res.status(200).json({ success: true, type: 'promo', ...result });
      }

      // Regular chip transfer — uses credit or prepaid balance
      const { data: result, error: rpcErr } = await supabaseAdmin.rpc('transfer_chips_agent_to_player', {
        p_agent_user_id: user.id,
        p_player_user_id: toUserId,
        p_club_id: clubId,
        p_amount: amount,
      });

      if (rpcErr) {
        return res.status(500).json({ success: false, error: 'Transfer failed', details: rpcErr.message });
      }
      if (!result?.success) {
        return res.status(400).json({ success: false, error: result?.error || 'Transfer failed', details: result });
      }

      return res.status(200).json({ success: true, ...result });
    }

    // Owner/admin: distribute from treasury via atomic RPC
    const { data: result, error: rpcErr } = await supabaseAdmin.rpc('distribute_chips', {
      p_club_id: clubId,
      p_to_user_id: toUserId,
      p_amount: amount,
      p_distributed_by: user.id,
    });

    if (rpcErr) {
      console.error('[distribute-chips] RPC error:', rpcErr);
      return res.status(500).json({ success: false, error: 'Distribution failed', details: rpcErr.message });
    }

    if (!result?.success) {
      return res.status(400).json({ success: false, error: result?.error || 'Distribution failed', details: result });
    }

    return res.status(200).json({
      success: true,
      clubId,
      toUserId,
      amount,
      treasuryBefore: result.treasury_before,
      treasuryAfter: result.treasury_after,
      memberBefore: result.member_before,
      memberAfter: result.member_after,
    });
  } catch (err) {
    console.error('[distribute-chips]', err);
    return res.status(500).json({ success: false, error: 'Distribution failed', details: err.message });
  }
}
