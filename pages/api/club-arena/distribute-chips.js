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
import { notifyUser } from '../../../src/lib/club-arena/notify';
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { sanitizeNote, safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { checkVelocity } = require('../../../src/lib/club-arena/velocityCheck');
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
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    // RED TEAM: Payload size + field allowlist validation
    const ALLOWED = new Set(['clubId', 'toUserId', 'amount', 'notes', 'type']);
    const bodyStr = JSON.stringify(req.body || {});
    if (bodyStr.length > 1024) return res.status(413).json({ success: false, error: 'Request body too large' });
    const bad = Object.keys(req.body || {}).filter(k => !ALLOWED.has(k));
    if (bad.length > 0) return res.status(400).json({ success: false, error: `Unknown fields: ${bad.join(', ')}` });

    // Idempotency guard — prevent double-tap on laggy mobile networks
    if (checkIdempotency(req, res)) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { clubId, toUserId, amount: rawAmount, notes: rawNotes } = req.body;
    const notes = sanitizeNote(rawNotes, 500);
    if (!clubId || !toUserId || !rawAmount || rawAmount <= 0) {
      return res.status(400).json({ success: false, error: 'clubId, toUserId, and positive amount required' });
    }

    // ── RED TEAM: UUID format validation — blocks SQL injection ──
    const { validateUUID } = require('../../../src/lib/club-arena/redteam-validation');
    const clubIdErr = validateUUID(clubId, 'clubId');
    if (clubIdErr) return res.status(400).json({ success: false, error: clubIdErr });
    const toUserIdErr = validateUUID(toUserId, 'toUserId');
    if (toUserIdErr) return res.status(400).json({ success: false, error: toUserIdErr });

    const amount = Math.floor(Number(rawAmount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
      return res.status(400).json({ success: false, error: 'amount must be a positive integer (max 100M)' });
    }

    // Settlement lock check — block during Monday 4:00-4:10 AM CST
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/distribute-chips')) return;

    // ── Anti-Fraud: Velocity Check ──
    const vel = await checkVelocity(supabaseAdmin, { userId: user.id, clubId, actionType: 'chip_distribution', amount });
    if (!vel.passed) {
      return res.status(429).json({ success: false, error: vel.reason, flagged: true });
    }

    try {
      // Verify caller is owner/admin/agent
      const { data: member } = await getSupabase()
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member || !['owner', 'admin', 'agent', 'sub_agent', 'super_agent'].includes(member.role)) {
        // Fallback: check if caller is a union admin for this club's union
        const { data: club } = await getSupabase()
          .from('clubs').select('union_id').eq('id', clubId).maybeSingle();
        let unionAuthorized = false;
        if (club?.union_id) {
          const { data: ua } = await getSupabase()
            .from('union_admins').select('role')
            .eq('union_id', club.union_id).eq('user_id', user.id).maybeSingle();
          if (ua) {
              unionAuthorized = true;
          } else {
              // Owner fallback
              const { data: union } = await getSupabase().from('unions').select('id').eq('id', club.union_id).eq('owner_id', user.id).maybeSingle();
              if (union) unionAuthorized = true;
          }
        }
        if (!unionAuthorized) {
          return res.status(403).json({ success: false, error: 'Only owners, admins, agents, or union admins can distribute chips' });
        }
      }

      // If agent, use agent-to-player transfer instead of treasury
      // Union admins (member is null) go through the treasury path like owners
      const isAgentRole = ['agent', 'sub_agent', 'super_agent'].includes(member?.role);
      if (isAgentRole) {
        // ── RED TEAM: Downline Spoofing Validator (Bug 10) ──
        const { data: targetMember } = await getSupabase()
          .from('club_members')
          .select('agent_id')
          .eq('club_id', clubId)
          .eq('user_id', toUserId)
          .maybeSingle();

        if (!targetMember || targetMember.agent_id !== user.id) {
          logAudit(supabaseAdmin, { 
              actionType: 'fraud_attempt_distribute', 
              userId: user.id, 
              targetUserId: toUserId, 
              clubId, amount, 
              ip: extractIP(req), 
              details: { reason: 'Spoofing toUserId outside downline' } 
          });
          return res.status(403).json({ success: false, error: 'Target player is not in your downline hierarchy.' });
        }

        // ═══════════════════════════════════════════════════════════
        // PROMO DISTRIBUTION — uses promo_balance, NOT credit/chips
        // Promo chips are pre-raked (funded from 30% of BBJ allocation).
        // They do NOT count as agent credit, do NOT create settlement
        // debts, and do NOT affect weekly square-up with the union.
        // ═══════════════════════════════════════════════════════════
        if (req.body.type === 'promo') {
          const { data: result, error: rpcErr } = await getSupabase().rpc('transfer_promo_agent_to_player', {
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

          logAudit(supabaseAdmin, { actionType: 'promo_distribution', userId: user.id, targetUserId: toUserId, clubId, amount, ip: extractIP(req), details: { type: 'promo', notes, result } });
          return res.status(200).json({ success: true, type: 'promo', ...result });
        }

        // Regular chip transfer — uses credit or prepaid balance
        const { data: result, error: rpcErr } = await getSupabase().rpc('transfer_chips_agent_to_player', {
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

        logAudit(supabaseAdmin, { actionType: 'chip_distribution', userId: user.id, targetUserId: toUserId, clubId, amount, ip: extractIP(req), details: { source: 'agent_credit', notes, result } });
        return res.status(200).json({ success: true, ...result });
      }

      // Owner/admin: distribute from treasury via atomic RPC
      const { data: result, error: rpcErr } = await getSupabase().rpc('distribute_chips', {
        p_club_id: clubId,
        p_to_user_id: toUserId,
        p_amount: amount,
        p_distributed_by: user.id,
      });

      if (rpcErr) {
        console.warn('[distribute-chips] RPC error:', rpcErr);
        return res.status(500).json({ success: false, error: 'Distribution failed', details: rpcErr.message });
      }

      if (!result?.success) {
        return res.status(400).json({ success: false, error: result?.error || 'Distribution failed', details: result });
      }

      // Fire-and-forget: notify recipient
      await notifyUser(supabaseAdmin, {
        userId: toUserId,
        type: 'chip_distribution',
        title: `💰 ${amount.toLocaleString()} Chips Received`,
        message: `You received ${amount.toLocaleString()} chips${notes ? ` — ${notes}` : ''}.`,
        data: { clubId, amount },
        pushUrl: `/hub/club-arena/cashier?club=${clubId}`,
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

      logAudit(supabaseAdmin, { actionType: 'chip_distribution', userId: user.id, targetUserId: toUserId, clubId, amount, ip: extractIP(req), details: { source: 'treasury', notes, treasuryBefore: result.treasury_before, treasuryAfter: result.treasury_after, memberBefore: result.member_before, memberAfter: result.member_after } });
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
      console.warn('[distribute-chips]', err);
      return res.status(500).json(safeErrorResponse(err, 'Distribution failed'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
