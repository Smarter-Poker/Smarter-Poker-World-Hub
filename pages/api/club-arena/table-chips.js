import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * POST /api/club-arena/table-chips
 * 
 * Manages chip locks when players sit at or leave poker tables.
 * Called by the poker engine.
 * 
 * Actions:
 *   'lock'   - Player sits down: deducts from club_members.chip_balance, 
 *              records as locked for table play
 *   'unlock' - Player stands up: returns remaining chips to chip_balance
 *   'rebuy'  - Player rebuys at table: additional lock from balance
 * 
 * Body: { clubId, tableId, userId, action: 'lock'|'unlock'|'rebuy', amount }
 * Auth: x-engine-key header or Bearer token
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const { isUUID, rejectBadPayload } = require('../../../src/lib/club-arena/validate');
const { safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');

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
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    // RED TEAM: Payload size + field allowlist
    if (rejectBadPayload(req, res, ['clubId', 'tableId', 'userId', 'action', 'amount'])) return;

    // Engine-key callers bypass idempotency (engine generates its own replay protection)
    const engineKey = req.headers['x-engine-key'];
    const validEngineKey = engineKey && process.env.ENGINE_INTERNAL_SECRET && engineKey === process.env.ENGINE_INTERNAL_SECRET;

    // CONCURRENCY: Idempotency guard — only for user-facing calls (not engine-internal)
    if (!validEngineKey && checkIdempotency(req, res)) return;

    // Accept engine key or bearer token
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!validEngineKey && !token) return res.status(401).json({ success: false, error: 'Auth required' });

    let callerUserId = null;
    if (token && !validEngineKey) {
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (error || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
      callerUserId = user.id;
    }

    const { clubId, tableId, userId, action, amount: rawAmount } = req.body;

    // ── E-14: UUID format validation ────────────────────────────────────
    if (!clubId || !isUUID(clubId)) {
      return res.status(400).json({ success: false, error: 'clubId must be a valid UUID' });
    }
    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ success: false, error: 'userId must be a valid UUID' });
    }
    if (tableId && !isUUID(tableId)) {
      return res.status(400).json({ success: false, error: 'tableId must be a valid UUID' });
    }

    if (!['lock', 'unlock', 'rebuy'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be lock, unlock, or rebuy' });
    }

    const amount = Math.floor(Number(rawAmount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
      return res.status(400).json({ success: false, error: 'amount must be a positive integer (max 100,000,000)' });
    }

    // ── E-12: Verify userId membership exists (even for engine-key callers) ──
    const { data: targetMember } = await getSupabase()
      .from('club_members')
      .select('user_id, chip_balance')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!targetMember) {
      return res.status(404).json({ success: false, error: 'Target user is not a member of this club' });
    }

    // ── E-08: Per-table max buy-in validation (lock/rebuy) ──────────────
    if (['lock', 'rebuy'].includes(action) && tableId) {
      const { data: tableInfo } = await getSupabase()
        .from('tables')
        .select('max_buy_in, status')
        .eq('id', tableId)
        .eq('club_id', clubId)
        .maybeSingle();
      if (!tableInfo) {
        return res.status(404).json({ success: false, error: 'Table not found in this club' });
      }
      if (['closed', 'deleted'].includes(tableInfo.status)) {
        return res.status(400).json({ success: false, error: `Cannot lock chips — table is ${tableInfo.status}` });
      }
      if (tableInfo.max_buy_in && amount > tableInfo.max_buy_in) {
        return res.status(400).json({ success: false, error: `Amount ${amount} exceeds table max buy-in of ${tableInfo.max_buy_in}` });
      }
    }

    // JWT callers can only operate on themselves unless they're club admin
    if (callerUserId && callerUserId !== userId) {
      const { data: callerMember } = await getSupabase()
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', callerUserId)
        .maybeSingle();
      if (!callerMember || !['owner', 'admin', 'super_agent'].includes(callerMember.role)) {
        return res.status(403).json({ success: false, error: 'Cannot operate on another user\'s chips' });
      }
    }

    // Settlement lock check — block during Monday 4:00-4:10 AM CST
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    try {
      if (action === 'lock' || action === 'rebuy') {
        // Atomic debit via RPC — no read-modify-write race
        const { data: result, error: rpcErr } = await getSupabase().rpc('lock_chips_for_table', {
          p_user_id: userId,
          p_club_id: clubId,
          p_table_id: tableId || null,
          p_amount: amount,
        });

        if (rpcErr) throw rpcErr;
        if (!result?.success) {
          return res.status(400).json({
            success: false, error: result?.error || 'Insufficient chips',
            available: result?.balance,
            requested: amount,
          });
        }

        // ── C-06: Isolated transaction logging ──
        // If node crashes before this finishes, atomic RPC was still successful.
        try {
          const { error: txErr } = await getSupabase().from('chip_transactions').insert({
            club_id: clubId,
            from_user_id: userId,
            to_user_id: userId,
            amount: -amount,
            transaction_type: 'table_lock',
            notes: `${action === 'rebuy' ? 'Rebuy' : 'Table buy-in'}: ${amount} chips locked for table ${tableId || 'unknown'}`,
          });
          if (txErr) console.warn('[table-chips] Failed to log transaction:', txErr.message);
        } catch (logErr) {
          console.warn('[table-chips] Failed to log transaction:', logErr);
        }

        const responseBody = {
          success: true,
          action,
          locked: amount,
          remainingBalance: result.balance_after,
          tableId,
        };
        logAudit(supabaseAdmin, { actionType: 'table_buyin', userId: userId, clubId, amount, ip: extractIP(req), details: { tableId, action, remainingBalance: result.balance_after } });
        cacheResponse(req, 200, responseBody);
        return res.status(200).json(responseBody);

      } else if (action === 'unlock') {
        // Atomic unlock via RPC
        const { data: result, error: rpcErr } = await getSupabase().rpc('unlock_chips_from_table', {
          p_user_id: userId,
          p_club_id: clubId,
          p_table_id: tableId || null,
          p_amount: amount,
        });

        if (rpcErr) throw rpcErr;

        // ── C-06: Isolated transaction logging ──
        try {
          const { error: txErr } = await getSupabase().from('chip_transactions').insert({
            club_id: clubId,
            from_user_id: userId,
            to_user_id: userId,
            amount,
            transaction_type: 'table_unlock',
            notes: `Table cash-out: ${amount} chips unlocked from table ${tableId || 'unknown'}`,
          });
          if (txErr) console.warn('[table-chips] Failed to log transaction:', txErr.message);
        } catch (logErr) {
          console.warn('[table-chips] Failed to log unlock transaction:', logErr);
        }

        const responseBody = {
          success: true,
          action: 'unlocked',
          returned: amount,
          newBalance: result?.balance_after,
          tableId,
        };
        logAudit(supabaseAdmin, { actionType: 'table_cashout', userId: userId, clubId, amount, ip: extractIP(req), details: { tableId, newBalance: result?.balance_after } });
        cacheResponse(req, 200, responseBody);
        return res.status(200).json(responseBody);
      }
    } catch (err) {
      console.warn('[table-chips]', err);
      return res.status(500).json({ success: false, error: 'Table chip operation failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
