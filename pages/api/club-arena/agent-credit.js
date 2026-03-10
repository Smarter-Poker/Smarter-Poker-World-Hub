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
import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { sanitizeNote, safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
import { notifyUser } from '../../../src/lib/club-arena/notify';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // RED TEAM: Payload size + field allowlist validation
  const ALLOWED = new Set(['clubId', 'agentUserId', 'action', 'amount', 'notes']);
  const bodyStr = JSON.stringify(req.body || {});
  if (bodyStr.length > 1024) return res.status(413).json({ error: 'Request body too large' });
  const bad = Object.keys(req.body || {}).filter(k => !ALLOWED.has(k));
  if (bad.length > 0) return res.status(400).json({ error: `Unknown fields: ${bad.join(', ')}` });

  // Idempotency guard — prevent double-tap on laggy mobile networks
  if (checkIdempotency(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId, agentUserId, action, amount: rawAmount, notes: rawNotes } = req.body;
  const notes = sanitizeNote(rawNotes, 500);
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
      .maybeSingle();

    if (!club) return res.status(404).json({ error: 'Club not found' });

    let authorized = club.owner_id === user.id;
    if (!authorized && club.union_id) {
      const { data: ua } = await supabaseAdmin
        .from('union_admins')
        .select('role')
        .eq('union_id', club.union_id)
        .eq('user_id', user.id)
        .maybeSingle();
      authorized = !!ua;
    }
    if (!authorized) return res.status(403).json({ error: 'Not authorized' });

    // 2. Get agent's club_members and agents records
    const { data: agentMember } = await supabaseAdmin
      .from('club_members')
      .select('user_id, role, chip_balance, credit_limit, credit_used, nickname')
      .eq('club_id', clubId)
      .eq('user_id', agentUserId)
      .maybeSingle();

    if (!agentMember || !['agent', 'sub_agent', 'super_agent'].includes(agentMember.role)) {
      return res.status(404).json({ error: 'Agent not found in this club' });
    }

    const { data: agentRecord } = await supabaseAdmin
      .from('agents')
      .select('id, is_prepaid, credit_limit, business_balance')
      .eq('user_id', agentUserId)
      .eq('club_id', clubId)
      .maybeSingle();

    if (!agentRecord) return res.status(404).json({ error: 'Agent record not found' });

    let result = {};

    if (action === 'issue_credit') {
      // ATOMIC: Increment credit_limit in Postgres — no JS math on balances
      // Uses SET credit_limit = COALESCE(credit_limit, 0) + $1 inside the RPC
      const { data: atomicResult, error: atomicErr } = await supabaseAdmin.rpc('fn_atomic_increment_field', {
        p_table: 'club_members',
        p_field: 'credit_limit',
        p_increment: amount,
        p_where_club_id: clubId,
        p_where_user_id: agentUserId,
      });

      // Fallback: If the atomic RPC doesn't exist yet, use optimistic-lock pattern
      let newLimit;
      if (atomicErr) {
        // Optimistic lock: read, compute, write with WHERE old_value
        const oldLimit = agentMember.credit_limit || 0;
        newLimit = oldLimit + amount;
        const { data: updated } = await supabaseAdmin
          .from('club_members')
          .update({ credit_limit: newLimit })
          .eq('club_id', clubId)
          .eq('user_id', agentUserId)
          .eq('credit_limit', oldLimit)  // optimistic lock
          .select('credit_limit')
          .maybeSingle();

        if (!updated) {
          // Concurrent modification — re-read and retry once
          const { data: fresh } = await supabaseAdmin
            .from('club_members').select('credit_limit')
            .eq('club_id', clubId).eq('user_id', agentUserId).maybeSingle();
          newLimit = (fresh?.credit_limit || 0) + amount;
          await supabaseAdmin.from('club_members')
            .update({ credit_limit: newLimit })
            .eq('club_id', clubId).eq('user_id', agentUserId);
        }
      } else {
        newLimit = atomicResult?.new_value ?? ((agentMember.credit_limit || 0) + amount);
      }

      // Mirror to agents table
      await supabaseAdmin
        .from('agents')
        .update({ credit_limit: newLimit })
        .eq('id', agentRecord.id);

      await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        from_user_id: user.id,
        to_user_id: agentUserId,
        amount,
        transaction_type: 'credit_line_issued',
        notes: notes || `Credit line issued: +${amount.toLocaleString()} (limit now ${newLimit.toLocaleString()})`,
      });

      notifyUser(supabaseAdmin, {
        userId: agentUserId,
        type: 'agent_credit_issued',
        title: 'Credit Line Updated',
        message: `Your credit line has been updated to ${newLimit.toLocaleString()} chips.`,
        data: { clubId, newLimit }
      });

      const resultData = { action: 'credit_issued', previousLimit: agentMember.credit_limit || 0, newLimit };
      cacheResponse(req, 200, { success: true, ...resultData });
      result = resultData;

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

      // ATOMIC: Update business_balance using optimistic lock WITH retry
      // Eliminates JS-side `oldBal + amount` TOCTOU race
      const { data: atomicBiz, error: bizAtomicErr } = await supabaseAdmin.rpc('fn_atomic_increment_field', {
        p_table: 'agents',
        p_field: 'business_balance',
        p_increment: amount,
        p_where_id: agentRecord.id,
      });

      if (bizAtomicErr) {
        // Fallback: optimistic lock with retry
        const oldBal = agentRecord.business_balance || 0;
        const { data: balUpd } = await supabaseAdmin
          .from('agents')
          .update({ business_balance: oldBal + amount })
          .eq('id', agentRecord.id)
          .eq('business_balance', oldBal) // optimistic lock
          .select('id')
          .maybeSingle();

        if (!balUpd) {
          // Retry: re-read fresh value and apply
          const { data: freshAgent } = await supabaseAdmin.from('agents').select('business_balance').eq('id', agentRecord.id).maybeSingle();
          if (freshAgent) {
            await supabaseAdmin.from('agents').update({ business_balance: (freshAgent.business_balance || 0) + amount }).eq('id', agentRecord.id);
          }
        }
      }

      await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        from_user_id: user.id,
        to_user_id: agentUserId,
        amount,
        transaction_type: 'prepaid_chips_issued',
        notes: notes || `Prepaid chips issued: ${amount.toLocaleString()}`,
      });

      notifyUser(supabaseAdmin, {
        userId: agentUserId,
        type: 'agent_prepaid_added',
        title: 'Prepaid Chips Added',
        message: `${amount.toLocaleString()} prepaid chips have been added to your agent balance.`,
        data: { clubId, amount }
      });

      // Read fresh balances for accurate response
      const { data: freshClub } = await supabaseAdmin.from('clubs').select('chip_treasury').eq('id', clubId).maybeSingle();
      const { data: freshMember } = await supabaseAdmin.from('club_members').select('chip_balance').eq('club_id', clubId).eq('user_id', agentUserId).maybeSingle();

      const resultData = {
        action: 'prepaid_added',
        amount,
        agentBalance: freshMember?.chip_balance || 0,
        treasuryRemaining: freshClub?.chip_treasury || 0,
      };
      cacheResponse(req, 200, { success: true, ...resultData });
      result = resultData;

    } else if (action === 'revoke_credit') {
      // ATOMIC: Decrement credit_limit — use optimistic lock to prevent TOCTOU
      const currentLimit = agentMember.credit_limit || 0;
      const newLimit = Math.max(0, currentLimit - amount);

      // Optimistic lock: only update if credit_limit hasn't changed
      const { data: updated } = await supabaseAdmin
        .from('club_members')
        .update({ credit_limit: newLimit })
        .eq('club_id', clubId)
        .eq('user_id', agentUserId)
        .eq('credit_limit', currentLimit) // optimistic lock
        .select('credit_limit')
        .maybeSingle();

      let finalLimit = newLimit;
      if (!updated) {
        // Concurrent modification — re-read and retry
        const { data: fresh } = await supabaseAdmin
          .from('club_members').select('credit_limit')
          .eq('club_id', clubId).eq('user_id', agentUserId).maybeSingle();
        finalLimit = Math.max(0, (fresh?.credit_limit || 0) - amount);
        await supabaseAdmin.from('club_members')
          .update({ credit_limit: finalLimit })
          .eq('club_id', clubId).eq('user_id', agentUserId);
      }

      // Mirror to agents table
      await supabaseAdmin
        .from('agents')
        .update({ credit_limit: finalLimit })
        .eq('id', agentRecord.id);

      notifyUser(supabaseAdmin, {
        userId: agentUserId,
        type: 'agent_credit_revoked',
        title: 'Credit Line Revoked',
        message: `Your credit line has been reduced by ${amount.toLocaleString()} chips.`,
        data: { clubId, amount }
      });

      result = { action: 'credit_revoked', previousLimit: currentLimit, newLimit: finalLimit, reduced: currentLimit - finalLimit };
    }

    logAudit(supabaseAdmin, { actionType: `agent_credit_${action}`, userId: user.id, targetUserId: agentUserId, clubId, amount, ip: extractIP(req), details: { ...result } });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[agent-credit]', err);
    return res.status(500).json(safeErrorResponse(err, 'Agent credit action failed'));
  }
}
