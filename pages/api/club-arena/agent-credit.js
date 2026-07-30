import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
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

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
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

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/agent-credit')) return;

    // Settlement lock check — block during Monday 4:00-4:10 AM CST
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    try {
      // 1. Verify caller is club owner or union admin
      const { data: club } = await getSupabase()
        .from('clubs')
        .select('id, owner_id, union_id, chip_treasury')
        .eq('id', clubId)
        .maybeSingle();

      if (!club) return res.status(404).json({ error: 'Club not found' });

      let authorized = club.owner_id === user.id;
      if (!authorized && club.union_id) {
        const { data: ua } = await getSupabase()
          .from('union_admins')
          .select('role')
          .eq('union_id', club.union_id)
          .eq('user_id', user.id)
          .maybeSingle();
        authorized = !!ua;
      }
      if (!authorized) return res.status(403).json({ error: 'Not authorized' });

      // 2. Get agent's club_members and agents records
      const { data: agentMember } = await getSupabase()
        .from('club_members')
        .select('user_id, role, chip_balance, credit_limit, credit_used, nickname')
        .eq('club_id', clubId)
        .eq('user_id', agentUserId)
        .maybeSingle();

      if (!agentMember || !['agent', 'sub_agent', 'super_agent'].includes(agentMember.role)) {
        return res.status(404).json({ error: 'Agent not found in this club' });
      }

      const { data: agentRecord } = await getSupabase()
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
        const { data: atomicResult, error: atomicErr } = await getSupabase().rpc('fn_atomic_increment_field', {
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
          const { data: updated } = await getSupabase()
            .from('club_members')
            .update({ credit_limit: newLimit })
            .eq('club_id', clubId)
            .eq('user_id', agentUserId)
            .eq('credit_limit', oldLimit)  // optimistic lock
            .select('credit_limit')
            .maybeSingle();

          if (!updated) {
            // Concurrent modification — re-read and retry once
            const { data: fresh } = await getSupabase()
              .from('club_members').select('credit_limit')
              .eq('club_id', clubId).eq('user_id', agentUserId).maybeSingle();
            newLimit = (fresh?.credit_limit || 0) + amount;
            const { error: err_club_members_v35ny } = await getSupabase().from('club_members').update({ credit_limit: newLimit })
              .eq('club_id', clubId).eq('user_id', agentUserId);
            if (err_club_members_v35ny) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_v35ny.message);
          }
        } else {
          newLimit = atomicResult?.new_value ?? ((agentMember.credit_limit || 0) + amount);
        }

        // Mirror to agents table
        const { error: err_agents_2pfhe } = await getSupabase()
          .from('agents')
          .update({ credit_limit: newLimit })
          .eq('id', agentRecord.id);
        if (err_agents_2pfhe) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_2pfhe.message);

        const { error: issueTxErr } = await getSupabase().from('chip_transactions').insert({
          club_id: clubId,
          from_user_id: user.id,
          to_user_id: agentUserId,
          amount,
          transaction_type: 'credit_line_issued',
          notes: notes || `Credit line issued: +${amount.toLocaleString()} (limit now ${newLimit.toLocaleString()})`,
        });
        if (issueTxErr) console.warn('[agent-credit] Failed to log issue credit tx:', issueTxErr.message);

        await notifyUser(supabaseAdmin, {
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

        // ATOMIC PREPAID CREDIT (Debit Treasury, Credit Member Balance, Credit Business Balance)
        const { data: rpcResult, error: rpcErr } = await getSupabase().rpc('fn_add_prepaid_credit_atomic', {
          p_club_id: clubId,
          p_agent_id: agentUserId,
          p_amount: amount
        });

        if (rpcErr || !rpcResult?.success) {
          throw rpcErr || new Error(rpcResult?.error || 'Atomic prepaid credit failed');
        }

        const { error: prepaidTxErr } = await getSupabase().from('chip_transactions').insert({
          club_id: clubId,
          from_user_id: user.id,
          to_user_id: agentUserId,
          amount,
          transaction_type: 'prepaid_chips_issued',
          notes: notes || `Prepaid chips issued: ${amount.toLocaleString()}`,
        });
        if (prepaidTxErr) console.warn('[agent-credit] Failed to log prepaid chips tx:', prepaidTxErr.message);

        await notifyUser(supabaseAdmin, {
          userId: agentUserId,
          type: 'agent_prepaid_added',
          title: 'Prepaid Chips Added',
          message: `${amount.toLocaleString()} prepaid chips have been added to your agent balance.`,
          data: { clubId, amount }
        });

        // Balances returned by RPC
        const resultData = {
          action: 'prepaid_added',
          amount,
          agentBalance: rpcResult.agent_balance || 0,
          treasuryRemaining: rpcResult.treasury_remaining || 0,
        };
        cacheResponse(req, 200, { success: true, ...resultData });
        result = resultData;

      } else if (action === 'revoke_credit') {
        // ATOMIC: Decrement credit_limit — use optimistic lock to prevent TOCTOU
        const currentLimit = agentMember.credit_limit || 0;
        const newLimit = Math.max(0, currentLimit - amount);

        // Optimistic lock: only update if credit_limit hasn't changed
        const { data: updated } = await getSupabase()
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
          const { data: fresh } = await getSupabase()
            .from('club_members').select('credit_limit')
            .eq('club_id', clubId).eq('user_id', agentUserId).maybeSingle();
          finalLimit = Math.max(0, (fresh?.credit_limit || 0) - amount);
          const { error: err_club_members_65bwq } = await getSupabase().from('club_members').update({ credit_limit: finalLimit })
            .eq('club_id', clubId).eq('user_id', agentUserId);
          if (err_club_members_65bwq) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_65bwq.message);
        }

        // Mirror to agents table
        const { error: err_agents_q3fjw } = await getSupabase()
          .from('agents')
          .update({ credit_limit: finalLimit })
          .eq('id', agentRecord.id);
        if (err_agents_q3fjw) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_q3fjw.message);

        await notifyUser(supabaseAdmin, {
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
      console.warn('[agent-credit]', err);
      return res.status(500).json(safeErrorResponse(err, 'Agent credit action failed'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
