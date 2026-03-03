/**
 * POST /api/club-arena/agent-credit
 * 
 * Club owner issues, adjusts, or revokes an agent's credit line.
 * For CREDIT agents: sets/updates credit_limit on club_members and agents table.
 * For PREPAID agents: adds chips from club treasury to agent's balance.
 * 
 * Body: { clubId, agentUserId, action: 'issue_credit' | 'add_prepaid' | 'revoke_credit', amount, notes? }
 * Auth: Bearer token (club owner or union admin)
 */
import { createClient } from '@supabase/supabase-js';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId, agentUserId, action, amount: rawAmount, notes } = req.body;
  if (!clubId || !agentUserId || !action || !rawAmount || rawAmount <= 0) {
    return res.status(400).json({ error: 'clubId, agentUserId, action, and positive amount required' });
  }
  const amount = Math.floor(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    return res.status(400).json({ error: 'amount must be a positive integer (max 100M)' });
  }

  const validActions = ['issue_credit', 'add_prepaid', 'revoke_credit'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
  }

  // Settlement lock check — block during Monday 4:00-4:10 AM CST
  const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
  if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

  try {
    // 1. Verify caller is club owner or union admin
    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id, owner_id, union_id, chip_treasury')
      .eq('id', clubId)
      .single();

    if (!club) return res.status(404).json({ error: 'Club not found' });

    let authorized = club.owner_id === user.id;
    if (!authorized && club.union_id) {
      const { data: ua } = await supabaseAdmin
        .from('union_admins')
        .select('role')
        .eq('union_id', club.union_id)
        .eq('user_id', user.id)
        .single();
      authorized = !!ua;
    }
    if (!authorized) return res.status(403).json({ error: 'Not authorized' });

    // 2. Get agent's club_members and agents records
    const { data: agentMember } = await supabaseAdmin
      .from('club_members')
      .select('user_id, role, chip_balance, credit_limit, credit_used, nickname')
      .eq('club_id', clubId)
      .eq('user_id', agentUserId)
      .single();

    if (!agentMember || agentMember.role !== 'agent') {
      return res.status(404).json({ error: 'Agent not found in this club' });
    }

    const { data: agentRecord } = await supabaseAdmin
      .from('agents')
      .select('id, is_prepaid, credit_limit, business_balance')
      .eq('user_id', agentUserId)
      .eq('club_id', clubId)
      .single();

    if (!agentRecord) return res.status(404).json({ error: 'Agent record not found' });

    let result = {};

    if (action === 'issue_credit') {
      // Set/increase credit line for CREDIT agents
      const newLimit = (agentMember.credit_limit || 0) + amount;

      await supabaseAdmin
        .from('club_members')
        .update({ credit_limit: newLimit })
        .eq('club_id', clubId)
        .eq('user_id', agentUserId);

      await supabaseAdmin
        .from('agents')
        .update({ credit_limit: newLimit })
        .eq('id', agentRecord.id);

      await supabaseAdmin.from('club_transactions').insert({
        club_id: clubId,
        user_id: user.id,
        transaction_type: 'withdrawal',
        amount: -amount,
        description: notes || `Credit line issued to ${agentMember.nickname || agentUserId}: ${amount.toLocaleString()}`,
        metadata: { agent_id: agentRecord.id, credit_type: 'credit_line', previous_limit: agentMember.credit_limit || 0, new_limit: newLimit },
      });

      result = { action: 'credit_issued', previousLimit: agentMember.credit_limit || 0, newLimit };

    } else if (action === 'add_prepaid') {
      // Transfer chips from club treasury to agent's balance
      const treasury = club.chip_treasury || 0;
      if (amount > treasury) {
        return res.status(400).json({ error: 'Insufficient club treasury', available: treasury, requested: amount });
      }

      // Deduct from treasury atomically
      const { error: treasuryErr } = await supabaseAdmin.rpc('fn_debit_treasury', {
        p_club_id: clubId,
        p_amount: amount,
      });
      if (treasuryErr) throw treasuryErr;

      // Add to agent's chip_balance atomically
      const { error: creditErr } = await supabaseAdmin.rpc('fn_credit_chips', {
        p_club_id: clubId,
        p_user_id: agentUserId,
        p_amount: amount,
      });
      if (creditErr) {
        // ROLLBACK: re-credit treasury since agent didn't receive chips
        await supabaseAdmin.rpc('fn_credit_treasury', {
          p_club_id: clubId,
          p_amount: amount,
        }).catch(rbErr => console.error('[agent-credit] Treasury rollback failed:', rbErr.message));
        throw creditErr;
      }

      // Update agents table with optimistic lock
      const oldBal = agentRecord.business_balance || 0;
      const { data: balUpd } = await supabaseAdmin
        .from('agents')
        .update({ business_balance: oldBal + amount })
        .eq('id', agentRecord.id)
        .eq('business_balance', oldBal) // optimistic lock
        .select('id');

      // Retry once on conflict
      if (!balUpd?.length) {
        const { data: freshAgent } = await supabaseAdmin.from('agents').select('business_balance').eq('id', agentRecord.id).single();
        if (freshAgent) {
          await supabaseAdmin.from('agents').update({ business_balance: (freshAgent.business_balance || 0) + amount }).eq('id', agentRecord.id);
        }
      }

      await supabaseAdmin.from('club_transactions').insert({
        club_id: clubId,
        user_id: user.id,
        transaction_type: 'withdrawal',
        amount: -amount,
        description: notes || `Prepaid chips to ${agentMember.nickname || agentUserId}: ${amount.toLocaleString()}`,
        metadata: { agent_id: agentRecord.id, payment_type: 'prepaid' },
      });

      result = {
        action: 'prepaid_added',
        amount,
        agentBalance: (agentMember.chip_balance || 0) + amount,
        treasuryRemaining: treasury - amount,
      };

    } else if (action === 'revoke_credit') {
      // Reduce credit line
      const currentLimit = agentMember.credit_limit || 0;
      const newLimit = Math.max(0, currentLimit - amount);

      await supabaseAdmin
        .from('club_members')
        .update({ credit_limit: newLimit })
        .eq('club_id', clubId)
        .eq('user_id', agentUserId);

      await supabaseAdmin
        .from('agents')
        .update({ credit_limit: newLimit })
        .eq('id', agentRecord.id);

      result = { action: 'credit_revoked', previousLimit: currentLimit, newLimit, reduced: currentLimit - newLimit };
    }

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[agent-credit]', err);
    return res.status(500).json({ error: 'Agent credit action failed', details: err.message });
  }
}
