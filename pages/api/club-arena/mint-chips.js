import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/mint-chips
 * 
 * Mints new chips into club treasury via atomic RPC.
 * Body: { clubId, amount, notes? }
 * Auth: Bearer token (club owner or union admin)
 * 
 * MANDATE 3 (ORB-4): Economy Caps — enforces absolute hard limits to prevent
 * hyper-inflationary exploits:
 *   - Per-request caps tiered by caller role
 *   - Per-club daily ceiling (UTC day boundary)
 *   - Payload size and field allowlist validation
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
import { notifyClubAdmins } from '../../../src/lib/club-arena/notify';
import { validateMintChips } from '../../../src/contracts/orb4_syndicate';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
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

// ═══════════════════════════════════════════════════════════════
// MANDATE 3: Economy Caps — absolute hard limits on chip minting
// ═══════════════════════════════════════════════════════════════
const MINT_CAPS = {
  club_owner: 10_000_000,   // 10M per request for club owners
  union_admin: 50_000_000,   // 50M per request for union admins (manage multiple clubs)
};
const DAILY_CLUB_CEILING = 50_000_000; // 50M maximum minted per club per UTC day
const ALLOWED_BODY_FIELDS = new Set(['clubId', 'amount', 'notes']);
const MAX_BODY_SIZE = 1024; // 1KB payload limit

export default async function handler(req, res) {
  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    // Idempotency guard — prevent double-tap on laggy mobile networks
    if (checkIdempotency(req, res)) return;

    // MANDATE 3: Payload size validation
    const bodyStr = JSON.stringify(req.body || {});
    if (bodyStr.length > MAX_BODY_SIZE) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }

    // RED TEAM: Zod Contract Validation (MANDATE: Reject 100% with 400 Bad Request before hitting Postgres)
    const validation = validateMintChips(req.body);
    if (!validation.success) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const payload = validation.data;
    const { clubId, amount, notes } = payload;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    // BUG #153 FIX: Verify caller is club owner or union admin
    // Without this, ANY authenticated user could mint chips into ANY club's treasury.
    let callerRole = null; // 'club_owner' or 'union_admin'
    try {
      const { data: club } = await getSupabase()
        .from('clubs')
        .select('id, owner_id, union_id')
        .eq('id', clubId)
        .maybeSingle();

      if (!club) return res.status(404).json({ success: false, error: 'Club not found' });

      if (club.owner_id === user.id) {
        callerRole = 'club_owner';
      } else if (club.union_id) {
        const { data: ua } = await getSupabase()
          .from('union_admins')
          .select('role')
          .eq('union_id', club.union_id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (ua) {
            callerRole = 'union_admin';
        } else {
            // Owner fallback
            const { data: union } = await getSupabase().from('unions').select('id').eq('id', club.union_id).eq('owner_id', user.id).maybeSingle();
            if (union) callerRole = 'union_admin';
        }
      }

      if (!callerRole) {
        return res.status(403).json({ success: false, error: 'Only club owner or union admin can mint chips' });
      }
    } catch (authCheckErr) {
      return res.status(500).json({ success: false, error: 'Authorization check failed' });
    }

    // MANDATE 3: Per-request cap (role-tiered)
    const requestCap = MINT_CAPS[callerRole] || MINT_CAPS.club_owner;
    if (amount > requestCap) {
      // Audit log: cap enforcement event
      const { error: capTxErr } = await getSupabase().from('chip_transactions').insert({
        club_id: clubId,
        amount: 0,
        transaction_type: 'mint_cap_blocked',
        notes: `Mint blocked: requested ${amount.toLocaleString()}, cap ${requestCap.toLocaleString()} (${callerRole})`,
        metadata: { requested_amount: amount, cap_applied: requestCap, caller_role: callerRole, user_id: user.id },
      });
      if (capTxErr) console.warn('[mint-chips] Failed to log cap block:', capTxErr.message);

      return res.status(400).json({
        success: false,
        error: `Amount exceeds ${callerRole === 'union_admin' ? 'union admin' : 'club owner'} per-request cap of ${requestCap.toLocaleString()}`,
        cap: requestCap,
      });
    }

    // MANDATE 3: Per-club daily ceiling (UTC day boundary)
    const utcToday = new Date();
    const utcDayStart = new Date(Date.UTC(utcToday.getUTCFullYear(), utcToday.getUTCMonth(), utcToday.getUTCDate())).toISOString();
    try {
      const { data: todayMints } = await getSupabase()
        .from('chip_transactions')
        .select('amount')
        .eq('club_id', clubId)
        .eq('transaction_type', 'mint')
        .gte('created_at', utcDayStart)
        .limit(500);

      const dailyTotal = (todayMints || []).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const remaining = DAILY_CLUB_CEILING - dailyTotal;

      if (amount > remaining) {
        // Audit log: daily ceiling enforcement
        const { error: ceilTxErr } = await getSupabase().from('chip_transactions').insert({
          club_id: clubId,
          amount: 0,
          transaction_type: 'mint_cap_blocked',
          notes: `Daily ceiling blocked: requested ${amount.toLocaleString()}, today total ${dailyTotal.toLocaleString()}, ceiling ${DAILY_CLUB_CEILING.toLocaleString()}`,
          metadata: { requested_amount: amount, daily_total: dailyTotal, daily_ceiling: DAILY_CLUB_CEILING, remaining, caller_role: callerRole, user_id: user.id },
        });
        if (ceilTxErr) console.warn('[mint-chips] Failed to log ceiling block:', ceilTxErr.message);

        return res.status(429).json({
          success: false,
          error: `Daily minting ceiling exceeded. Today: ${dailyTotal.toLocaleString()}, Remaining: ${Math.max(0, remaining).toLocaleString()}, Ceiling: ${DAILY_CLUB_CEILING.toLocaleString()}`,
          dailyTotal,
          remaining: Math.max(0, remaining),
          ceiling: DAILY_CLUB_CEILING,
        });
      }
    } catch (ceilErr) {
      console.warn('[mint-chips] Daily ceiling check failed:', ceilErr.message);
      // Non-fatal — allow mint if ceiling check fails (fail-open for operational continuity)
    }

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/mint-chips')) return;

    // Settlement lock check
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    try {
      // Call atomic RPC — handles FOR UPDATE locking, auth check, and transaction logging
      const { data: result, error: rpcErr } = await getSupabase().rpc('mint_club_chips', {
        p_club_id: clubId,
        p_amount: amount,
        p_minted_by: user.id,
      });

      if (rpcErr) {
        console.warn('[mint-chips] RPC error:', rpcErr);
        return res.status(500).json(safeErrorResponse(rpcErr, 'Mint failed'));
      }

      if (!result?.success) {
        return res.status(400).json({ success: false, error: result?.error || 'Mint failed' });
      }

      // Notify club admins
      notifyClubAdmins(supabaseAdmin, {
        clubId, type: 'chips_minted',
        title: `🪙 ${amount.toLocaleString()} Chips Minted`,
        message: `${amount.toLocaleString()} chips minted to treasury${notes ? ` — ${notes}` : ''}.`,
        data: { amount },
        excludeUserId: user.id,
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

      logAudit(supabaseAdmin, { actionType: 'chips_minted', userId: user.id, clubId, amount, ip: extractIP(req), details: { treasuryBefore: result.old_treasury, treasuryAfter: result.new_treasury, notes } });
      return res.status(200).json({
        success: true,
        clubId,
        amount,
        treasuryBefore: result.old_treasury,
        treasuryAfter: result.new_treasury,
      });
    } catch (err) {
      console.warn('[mint-chips]', err);
      return res.status(500).json(safeErrorResponse(err, 'Mint failed'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
