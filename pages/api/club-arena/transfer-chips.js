/**
 * POST /api/club-arena/transfer-chips
 * Transfer chips between members within the same club.
 * Body: { clubId, toUserId, amount, note? }
 * Auth: Bearer token (sender = authenticated user)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { notifyUser } from '../../../src/lib/club-arena/notify';
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { sanitizeNote, safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
const { isUUID, validateAmount, rejectBadPayload } = require('../../../src/lib/club-arena/validate');
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
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }
    // RED TEAM: Payload size + field allowlist (shared utility)
    if (rejectBadPayload(req, res, ['clubId', 'toUserId', 'amount', 'note'])) return;

    // Idempotency guard — prevent double-charges on laggy mobile networks
    if (checkIdempotency(req, res)) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

    const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { clubId, toUserId, amount: rawAmount, note: rawNote } = req.body;

    // RED TEAM: Strict UUID validation (blocks SQL injection)
    if (!isUUID(clubId)) return res.status(400).json({ success: false, error: 'Invalid clubId format' });
    if (!isUUID(toUserId)) return res.status(400).json({ success: false, error: 'Invalid toUserId format' });

    // RED TEAM: Strict amount validation (min 1, max 10M, no fractionals)
    const amtResult = validateAmount(rawAmount, 1, 10_000_000);
    if (!amtResult.valid) return res.status(400).json({ success: false, error: amtResult.error });
    const amount = amtResult.value;

    // RED TEAM: Sanitize note, self-transfer check
    const note = sanitizeNote(rawNote, 200);
    if (toUserId === user.id) return res.status(400).json({ success: false, error: 'Cannot transfer to yourself' });

    // Settlement lock
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    // ── Anti-Fraud: Velocity Check ──
    const vel = await checkVelocity(supabaseAdmin, { userId: user.id, clubId, actionType: 'chip_transfer', amount });
    if (!vel.passed) {
      return res.status(429).json({ success: false, error: vel.reason, flagged: true });
    }

    try {
      // Verify both users are active members
      const { data: sender } = await getSupabase()
        .from('club_members').select('chip_balance, role')
        .eq('club_id', clubId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
      if (!sender) return res.status(403).json({ success: false, error: 'You are not a member of this club' });

      const { data: receiver } = await getSupabase()
        .from('club_members').select('chip_balance, role')
        .eq('club_id', clubId).eq('user_id', toUserId).eq('status', 'active').maybeSingle();
      if (!receiver) return res.status(404).json({ success: false, error: 'Recipient not found in this club' });

      if ((sender.chip_balance || 0) < amount) {
        return res.status(400).json({
          success: false, error: 'Insufficient chips',
          available: sender.chip_balance || 0, requested: amount,
        });
      }

      // ═════════════════════════════════════════════════════════════
      // IN-PLAY LOCK — Block transfer while seated at an active table
      // ═════════════════════════════════════════════════════════════
      const { data: activeSeat } = await getSupabase()
        .from('table_sessions')
        .select('id, table_id')
        .eq('club_id', clubId)
        .eq('player_id', user.id)
        .eq('is_active', true)
        .limit(1);

      if (activeSeat?.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Cannot transfer chips while seated at a table. Leave the table first.',
          in_play: true,
          table_id: activeSeat[0].table_id,
        });
      }

      // Atomic transfer via Supabase RPC (SELECT FOR UPDATE + atomic balance changes)
      const { data: rpcResult, error: rpcErr } = await getSupabase()
        .rpc('fn_transfer_chips', {
          p_club_id: clubId,
          p_from_user_id: user.id,
          p_to_user_id: toUserId,
          p_amount: amount,
        });

      if (rpcErr) throw rpcErr;
      if (!rpcResult?.success) {
        const status = rpcResult?.error === 'Insufficient balance' ? 400
          : rpcResult?.error?.includes('not found') ? 404 : 500;
        return res.status(status).json({
          success: false, error: rpcResult?.error || 'Transfer failed',
          available: rpcResult?.available, requested: rpcResult?.requested,
        });
      }

      // Record transaction (fire-and-forget — transfer already atomic)
      await getSupabase().from('chip_transactions').insert({
        club_id: clubId, from_user_id: user.id, to_user_id: toUserId,
        amount, transaction_type: 'transfer',
        notes: note || `Transfer to player`,
      });

      // Notify recipient
      await notifyUser(supabaseAdmin, {
        userId: toUserId, type: 'chip_transfer',
        title: `💰 ${amount.toLocaleString()} Chips Received`,
        message: `A player sent you ${amount.toLocaleString()} chips${note ? ` — ${note}` : ''}.`,
        data: { clubId, amount, fromUserId: user.id },
        pushUrl: `/hub/club-arena/cashier?club=${clubId}`,
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

      const responseBody = {
        success: true,
        transferred: amount,
        senderBalance: rpcResult.sender_balance,
      };
      logAudit(supabaseAdmin, { actionType: 'chip_transfer', userId: user.id, targetUserId: toUserId, clubId, amount, ip: extractIP(req), details: { note, senderBalance: rpcResult.sender_balance } });
      cacheResponse(req, 200, responseBody);
      return res.status(200).json(responseBody);
    } catch (err) {
      console.warn('[transfer-chips]', err);
      return res.status(500).json(safeErrorResponse(err, 'Transfer failed'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
