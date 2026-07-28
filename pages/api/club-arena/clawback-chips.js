/**
 * POST /api/club-arena/clawback-chips
 * 
 * Agent reverses a chip distribution within the 10-minute security window.
 * This is one of only TWO ways an agent can remove chips from a player:
 *   1. Approving a player's cashout request
 *   2. Clawing back within 10 minutes of sending (this endpoint)
 * 
 * RULES:
 *   - Must be within 10 minutes of the original distribution
 *   - Agent can only clawback their own distributions
 *   - Can clawback full or partial amount (up to original)
 *   - After 10 minutes, the only way to get chips back is a cashout request
 * 
 * Body: { transactionId, clubId, amount? (defaults to full original amount) }
 * Auth: Bearer token (must be the agent who sent the chips)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
const { checkVelocity } = require('../../../src/lib/club-arena/velocityCheck');
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

const CLAWBACK_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const ALLOWED_BODY_FIELDS = new Set(['transactionId', 'clubId', 'amount']);
const MAX_BODY_SIZE = 512; // 512B payload limit

export default async function handler(req, res) {
  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    // CONCURRENCY: Idempotency guard — dedup rapid double-taps
    if (checkIdempotency(req, res)) return;

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { transactionId, clubId, amount: rawRequestedAmount } = req.body;

    // MANDATE 3: Payload size + field allowlist validation
    const bodyStr = JSON.stringify(req.body || {});
    if (bodyStr.length > MAX_BODY_SIZE) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }
    const unknownFields = Object.keys(req.body || {}).filter(k => !ALLOWED_BODY_FIELDS.has(k));
    if (unknownFields.length > 0) {
      return res.status(400).json({ success: false, error: `Unknown fields: ${unknownFields.join(', ')}` });
    }

    if (!transactionId || !clubId) {
      return res.status(400).json({ success: false, error: 'transactionId and clubId required' });
    }

    // UUID format validation — block SQL injection via transactionId
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(transactionId) || !UUID_RE.test(clubId)) {
      return res.status(400).json({ success: false, error: 'Invalid transactionId or clubId format' });
    }

    // Settlement lock check — block during Monday 4:00-4:10 AM CST
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/clawback-chips')) return;

    // ── Anti-Fraud: Velocity Check (detect rapid clawback-redistribute cycles) ──
    const vel = await checkVelocity(supabaseAdmin, { userId: user.id, clubId, actionType: 'clawback', amount: rawRequestedAmount || 0 });
    if (!vel.passed) {
      return res.status(429).json({ success: false, error: vel.reason, flagged: true });
    }

    try {
      // ═════════════════════════════════════════════════════════════
      // 1. Get the original transaction
      // ═════════════════════════════════════════════════════════════
      const { data: txn, error: txnErr } = await getSupabase()
        .from('chip_transactions')
        .select('id, from_user_id, to_user_id, amount, club_id, created_at, transaction_type, notes')
        .eq('id', transactionId)
        .maybeSingle();

      if (txnErr || !txn) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      // ═════════════════════════════════════════════════════════════
      // 2. Verify this is the agent who sent the chips
      // ═════════════════════════════════════════════════════════════
      if (txn.from_user_id !== user.id) {
        return res.status(403).json({ success: false, error: 'You can only clawback your own distributions' });
      }

      if (txn.club_id !== clubId) {
        return res.status(400).json({ success: false, error: 'Club ID mismatch' });
      }

      // Must be an agent→player distribution, not a cashout or other type
      const clawbackableTypes = ['agent_to_player', 'promo_agent_to_player', 'send'];
      if (!clawbackableTypes.includes(txn.transaction_type) || txn.from_user_id === txn.to_user_id) {
        return res.status(400).json({ success: false, error: 'Can only clawback agent→player distributions' });
      }

      // Check if already clawed back (idempotency)
      if (txn.notes?.includes('[CLAWED BACK]')) {
        return res.status(409).json({ success: false, error: 'This transaction has already been clawed back' });
      }

      // ═════════════════════════════════════════════════════════════
      // 3. Check the 10-minute window
      // ═════════════════════════════════════════════════════════════
      const txnTime = new Date(txn.created_at).getTime();
      const now = Date.now();
      const elapsed = now - txnTime;

      if (elapsed > CLAWBACK_WINDOW_MS) {
        const minutesAgo = Math.floor(elapsed / 60000);
        return res.status(403).json({
          success: false, error: 'Clawback window expired',
          message: `This distribution was ${minutesAgo} minutes ago. The 10-minute clawback window has closed.`,
          suggestion: 'The player must submit a cashout request for you to approve.',
        });
      }

      const remainingSeconds = Math.ceil((CLAWBACK_WINDOW_MS - elapsed) / 1000);

      // ═════════════════════════════════════════════════════════════
      // 4. Determine clawback amount — sanitized
      // ═════════════════════════════════════════════════════════════
      let clawbackAmount;
      if (rawRequestedAmount != null) {
        clawbackAmount = Math.floor(Number(rawRequestedAmount));
        if (!Number.isFinite(clawbackAmount) || clawbackAmount <= 0 || clawbackAmount > 100_000_000) {
          return res.status(400).json({ success: false, error: 'amount must be a positive integer (max 100M)' });
        }
        clawbackAmount = Math.min(clawbackAmount, txn.amount); // cap at original amount
      } else {
        clawbackAmount = txn.amount; // default to full original
      }

      if (clawbackAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid clawback amount' });
      }

      // ═════════════════════════════════════════════════════════════
      // 5. Atomically claim the transaction (prevents double-clawback)
      // ═════════════════════════════════════════════════════════════
      const clawbackNote = `${txn.notes || ''} [CLAWED BACK: ${clawbackAmount} at ${new Date().toISOString()}]`;
      const { data: claimed, error: claimErr } = await getSupabase()
        .from('chip_transactions')
        .update({ notes: clawbackNote })
        .eq('id', transactionId)
        .not('notes', 'like', '%[CLAWED BACK]%')  // Only if not already claimed
        .select('id')
        .maybeSingle();

      if (claimErr || !claimed) {
        return res.status(409).json({ success: false, error: 'Transaction already clawed back or claim failed' });
      }

      // ═════════════════════════════════════════════════════════════
      // 6. Execute atomic clawback via RPC
      // ═════════════════════════════════════════════════════════════
      const { data: rpcResult, error: rpcErr } = await getSupabase().rpc('fn_clawback_chips_atomic', {
        p_transaction_id: transactionId,
        p_club_id: clubId,
        p_agent_id: user.id,
        p_amount: clawbackAmount
      });

      if (rpcErr || !rpcResult?.success) {
        // Revert claim note
        const { error: err_chip_transactions_kqjxd } = await getSupabase()
          .from('chip_transactions')
          .update({ notes: txn.notes || '' })
          .eq('id', transactionId);
        if (err_chip_transactions_kqjxd) console.warn('[Supabase] Silent mutation failed in chip_transactions:', err_chip_transactions_kqjxd.message);

        return res.status(200).json({
          success: true,
          partial: rpcResult?.partial || false,
          recovered: rpcResult?.recovered || 0,
          playerNewBalance: rpcResult?.player_new_balance || 0,
          message: rpcResult?.error || 'Player balance may be in-play',
          windowRemaining: `${remainingSeconds}s`
        });
      }

      const { partial, requested, recovered, player_new_balance: freshPlayerBal, agent_new_balance: freshAgentBal } = rpcResult;

      // ═════════════════════════════════════════════════════════════
      // 8. Log and Reply
      // ═════════════════════════════════════════════════════════════

      // Balances are already returned by the RPC as freshPlayerBal and freshAgentBal

      // ═════════════════════════════════════════════════════════════
      // 9. ORB-5 MANDATE: Immutable audit log via centralized logger
      // ═════════════════════════════════════════════════════════════
      logAudit(supabaseAdmin, {
        actionType: 'clawback',
        userId: user.id,
        targetUserId: txn.to_user_id,
        clubId,
        amount: clawbackAmount,
        ip: extractIP(req),
        details: {
          original_transaction_id: transactionId,
          original_amount: txn.amount,
          clawback_amount: recovered,
          player_new_balance: freshPlayerBal,
          agent_new_balance: freshAgentBal,
          window_remaining_seconds: remainingSeconds,
        },
      });

      await notifyUser(supabaseAdmin, {
        userId: txn.to_user_id,
        type: 'clawback',
        title: 'Chips Clawed Back',
        message: `An agent clawed back ${recovered.toLocaleString()} chips from your balance.`,
        data: { clubId, amount: recovered }
      });

      return res.status(200).json({
        success: true,
        partial,
        clawbackAmount: recovered,
        originalAmount: txn.amount,
        shortfall: requested - recovered,
        playerNewBalance: freshPlayerBal,
        agentNewBalance: freshAgentBal,
        windowRemaining: `${remainingSeconds}s`,
      });
    } catch (err) {
      console.warn('[clawback-chips]', err);
      return res.status(500).json(safeErrorResponse(err, 'Clawback failed'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
