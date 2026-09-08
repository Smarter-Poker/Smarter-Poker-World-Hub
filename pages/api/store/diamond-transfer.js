/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POST /api/store/diamond-transfer
 *  Transfer diamonds from authenticated user to a friend
 *
 *  ANTI-ABUSE SAFEGUARDS:
 *  1.  Friendship verification (must be accepted friends)
 *  2.  Balance check (sender must have enough diamonds)
 *  3.  Rolling 30-day transfer limit (source-tiered — see SOURCE TIER logic)
 *  4.  Per-transfer limit (source-tiered)
 *  5.  Account age gate — HARD BLOCK for accounts < 30 days (VIP card window)
 *  6.  Cooldown (60s global between transfers)
 *  7.  Self-transfer block
 *  8.  Rate limiting (20 req/min)
 *  9.  Friendship age tier (60+ day friends unlock higher per-transfer cap)
 *  10. Per-recipient rolling 30-day limit
 *  11. Per-recipient cooldown (5min between transfers to same friend)
 *  12. Recipient rolling 30-day receive cap
 *  13. Admin audit trail (structured console logging)
 *  14. Velocity detection (flags accounts hitting limits repeatedly)
 *  15. SOURCE TIER:
 *       - Accounts 30–89 days: "free/earned" diamonds cap = 100/30 days;
 *                              "purchased/won" diamonds cap = 500/30 days
 *       - Accounts 90+ days: caps lifted; velocity detector active instead
 *  16. New-user hard block: accounts < 30 days CANNOT send ANY diamonds
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createHash } from 'crypto';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');
const { requireEmailVerifiedByUserId } = require('../../../src/lib/emailVerifiedGate');
import { reportApiError } from '../../../src/lib/sentryWrap';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('[diamond-transfer] SUPABASE_SERVICE_ROLE_KEY missing - falling back to anon key; writes may be silently blocked by RLS');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// ── Anti-abuse constants ──
const MIN_TRANSFER = 10;

// Exempt (owner/admin) accounts, keyed by immutable user UUID via env config.
// SECURITY: never key exemptions on user-settable fields like username or
// full_name — anyone could rename themselves into the bypass.
const EXEMPT_USER_IDS = new Set(
    (process.env.DIAMOND_TRANSFER_EXEMPT_USER_IDS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
);

// Strict UUID shape for recipient IDs — recipientId is interpolated into
// PostgREST .or()/.ilike() filters below, so it must never carry raw user input.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_RE = /^[a-z0-9][a-z0-9._:-]{11,127}$/i;
const ORPHAN_RECOVERY_DELAY_MS = 15_000;
const LEGACY_SIDE_EFFECT_WINDOW_MS = 60_000;
const MAX_TRANSFER_BODY_BYTES = 1_024;

function transferIdFor(userId, recipientId, amount, idempotencyKey) {
    return createHash('sha256')
        .update([userId, recipientId, String(amount), idempotencyKey].join('|'))
        .digest('hex')
        .slice(0, 32);
}

function transferDisplayName(value) {
    return String(value || 'friend')
        .toLowerCase()
        .split(' ')
        .map(word => {
            if (!word) return '';
            const upper = word.toUpperCase();
            if (['VIP', 'GPS', 'WSOP', 'WPT', 'ID', 'UID', 'UTC'].includes(upper)) return upper;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

function transferSideEffectId(transferId, kind) {
    const hex = createHash('sha256')
        .update(`${kind}|${transferId}`)
        .digest('hex')
        .slice(0, 32);
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)]
        .join('-');
}

function classifyTransferDebit(result, error) {
    if (error) return 'error';
    if (!result) return 'pending';
    return result.success === true || result.idempotent === true ? 'committed' : 'rejected';
}

function classifyTransferCredit(result, error, ledgerConfirmed = false) {
    if (ledgerConfirmed || result?.success === true || result?.duplicate === true) return 'committed';
    // A transport error or missing RPC payload is ambiguous: the database may
    // still have committed. It is never an authoritative reason to refund.
    if (error || !result) return 'pending';
    return 'rejected';
}

async function reconcileCompletedTransferSideEffects({
    userId,
    recipientId,
    amount,
    clientIp,
    senderName,
    transferId,
    creditCreatedAt,
}, supabase = getSupabase()) {
    // The release immediately before deterministic side-effect IDs relied on
    // database-generated UUIDs. A receipt replay must recognize those rows by
    // their transfer semantics or its new deterministic ID would not conflict
    // and the user would receive a duplicate notification. Only a replay with
    // a durable credit timestamp takes this compatibility path. New completion
    // and orphan-recovery races continue to converge on deterministic IDs.
    const creditTime = Date.parse(creditCreatedAt || '');
    const legacyWindow = Number.isFinite(creditTime)
        ? {
            from: new Date(creditTime).toISOString(),
            through: new Date(creditTime + LEGACY_SIDE_EFFECT_WINDOW_MS).toISOString(),
        }
        : null;

    let ipAuditReady = true;
    try {
        let legacyIpAuditExists = false;
        if (legacyWindow) {
            const { data: legacyIpRows, error: legacyIpReadError } = await supabase
                .from('anti_farming_ips')
                .select('id')
                .eq('user_id', userId)
                .eq('action_type', 'diamond_gift_sent')
                .eq('amount', amount)
                .gte('created_at', legacyWindow.from)
                .lte('created_at', legacyWindow.through)
                .limit(1);
            if (legacyIpReadError) {
                ipAuditReady = false;
                console.warn(
                    '[DiamondTransfer] Could Not Check Legacy Transfer IP Audit:',
                    legacyIpReadError.message
                );
            } else {
                legacyIpAuditExists = Boolean(legacyIpRows?.length);
            }
        }

        if (ipAuditReady && !legacyIpAuditExists) {
            const { error: ipInsertError } = await supabase.from('anti_farming_ips').upsert({
                id: transferSideEffectId(transferId, 'ip-audit'),
                user_id: userId,
                ip_address: clientIp,
                action_type: 'diamond_gift_sent',
                amount,
            }, {
                onConflict: 'id',
                ignoreDuplicates: true,
            });
            if (ipInsertError) {
                ipAuditReady = false;
                console.warn('[DiamondTransfer] Could Not Reconcile Transfer IP Audit:', ipInsertError.message);
            }
        }
    } catch (ipInsertError) {
        ipAuditReady = false;
        console.warn(
            '[DiamondTransfer] Could Not Reconcile Transfer IP Audit:',
            ipInsertError?.message || ipInsertError
        );
    }

    let notificationReady = true;
    try {
        let legacyNotificationExists = false;
        if (legacyWindow) {
            const { data: legacyNotificationRows, error: legacyNotificationReadError } = await supabase
                .from('notifications')
                .select('id')
                .eq('user_id', recipientId)
                .eq('actor_id', userId)
                .eq('type', 'diamond_received')
                .contains('data', { transfer_id: transferId })
                .limit(1);
            if (legacyNotificationReadError) {
                notificationReady = false;
                console.warn(
                    '[DiamondTransfer] Could Not Check Legacy Transfer Notification:',
                    legacyNotificationReadError.message
                );
            } else {
                legacyNotificationExists = Boolean(legacyNotificationRows?.length);
            }
        }

        if (notificationReady && !legacyNotificationExists) {
            const { error: notificationInsertError } = await supabase.from('notifications').upsert({
                id: transferSideEffectId(transferId, 'notification'),
                user_id: recipientId,
                actor_id: userId,
                type: 'diamond_received',
                title: 'Diamond Gift Received',
                message: `${transferDisplayName(senderName)} Sent You ${amount} Diamonds`,
                link: '/hub/store',
                read: false,
                is_read: false,
                data: {
                    transfer_id: transferId,
                    sender_id: userId,
                    sender_name: senderName,
                    amount,
                },
            }, {
                onConflict: 'id',
                ignoreDuplicates: true,
            });
            if (notificationInsertError) {
                notificationReady = false;
                console.warn(
                    '[DiamondTransfer] Could Not Reconcile Transfer Notification:',
                    notificationInsertError.message
                );
            }
        }
    } catch (notificationInsertError) {
        notificationReady = false;
        console.warn(
            '[DiamondTransfer] Could Not Reconcile Transfer Notification:',
            notificationInsertError?.message || notificationInsertError
        );
    }
    return { ipAuditReady, notificationReady };
}

function transferSideEffectsReady(result) {
    return result?.ipAuditReady === true && result?.notificationReady === true;
}

function respondTransferSideEffectsPending(res) {
    return res.status(503).json({
        success: false,
        completed: true,
        error: 'Transfer Completed, But Its Receipt Is Still Being Finalized. Please Retry The Same Transfer.',
        code: 'TRANSFER_SIDE_EFFECTS_PENDING',
        idempotencyTerminal: false,
    });
}

// Phase 1: Account age tiers (days)
const NEW_USER_BLOCK_DAYS = 30;        // Hard block — no outbound diamonds until day 31
const GRADUATION_DAYS = 120;           // After 120 days, if not flagged, source caps and send limits are lifted

// Phase 2: Source-tiered rolling 30-day outbound caps (days 31–89)
const FREE_EARNED_30DAY_LIMIT = 100;   // Max sendable from free/earned diamonds in rolling 30 days
const PURCHASED_WON_30DAY_LIMIT = 500; // Max sendable from purchased/won diamonds in rolling 30 days

// Transaction types that qualify as "purchased or won" (real-value origin)
const PURCHASED_WON_TYPES = new Set([
    'purchase',
    'stripe_purchase',
    'diamond_purchase',
    'tournament_prize',
    'tournament_win',
    'prize_pool',
    'promo_purchased',   // manually granted by admin for a paid promotion
]);

// Legacy/standard limits (retained for 90-day+ accounts falling through velocity check)
const MAX_TRANSFER_STANDARD = 100;
const MAX_TRANSFER_VIP = 500;
const DAILY_LIMIT_STANDARD = 500;
const DAILY_LIMIT_VIP = 2000;
const COOLDOWN_SECONDS = 60;
const MIN_ACCOUNT_AGE_DAYS = 30; // updated from 7 → 30
const VIP_FRIENDSHIP_DAYS = 60;
const PER_RECIPIENT_DAILY_LIMIT = 200;   // Max 200 diamonds/30 days to same friend
const PER_RECIPIENT_COOLDOWN_SECONDS = 300; // 5min between transfers to same friend
const RECIPIENT_DAILY_RECEIVE_LIMIT = 1000; // Max 1000 diamonds/30 days inbound

// Velocity thresholds — flag for admin review
const VELOCITY_UNIQUE_RECIPIENTS_24H = 5;   // Flagged if sending to 5+ unique users in 24h
const VELOCITY_TRANSACTIONS_1H = 10;         // Flagged if 10+ transfer attempts in 1 hour

/**
 * Helper to safely sum all matching transactions in 1000-row chunks
 * to avoid Supabase/PostgREST row-drop-off limits.
 */
async function sumPaginatedTransactions(supabase, queryBuilderFn) {
    let total = 0;
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await queryBuilderFn()
            .order('created_at', { ascending: false })
            .order('id')
            .range(page * pageSize, (page + 1) * pageSize - 1);
        // SECURITY: fail CLOSED — a DB error must not silently undercount the
        // anti-abuse caps built on this helper. The handler's catch returns 500.
        if (error) throw error;
        if (!data || data.length === 0) break;
        total += data.reduce((sum, r) => sum + Math.abs(r.amount), 0);
        if (data.length < pageSize) break;
        page++;
    }
    return total;
}

/**
 * Calculates the sender's purchased/won diamond total using the high-performance RPC.
 */
async function getSourceTierAvailable(supabase, userId) {
    const { data, error } = await supabase.rpc('get_source_tier_available', { p_user_id: userId });
    if (error || !data) {
        console.warn('[getSourceTierAvailable] RPC failed:', error);
        return { purchasedWonTotal: 0, freeEarnedTotal: 0, purchasedWonAvailable: 0 };
    }
    return data;
}

/**
 * Check velocity flags and log if thresholds are breached.
 * Non-blocking — we log but do not currently hard-block 90+ day accounts.
 * The return value `flagged` can be used for future auto-suspension logic.
 */
async function checkVelocity(supabase, userId, clientIp) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Transaction frequency (account)
    const { data: recentHour } = await supabase
        .from('diamond_transactions')
        .select('id')
        .eq('user_id', userId)
        .in('transaction_type', ['diamond_gift_sent', 'live_gift_sent'])
        .gte('created_at', oneHourAgo);
    
    // 2. IP frequency (device)
    const { data: ipRecentHour } = await supabase
        .from('anti_farming_ips')
        .select('id')
        .eq('ip_address', clientIp)
        .eq('action_type', 'diamond_gift_sent')
        .gte('created_at', oneHourAgo);

    const txIn1h = (recentHour || []).length;
    const ipTxIn1h = (ipRecentHour || []).length;

    let flagged = false;
    if (txIn1h >= VELOCITY_TRANSACTIONS_1H) {
        flagged = true;
        console.warn(`[VELOCITY:FARMING] User ${userId} sent ${txIn1h} gifts in 1h - threshold ${VELOCITY_TRANSACTIONS_1H}`);
    }
    if (ipTxIn1h >= VELOCITY_TRANSACTIONS_1H) {
        flagged = true;
        console.warn(`[VELOCITY:FARMING] IP ${clientIp} sent ${ipTxIn1h} gifts in 1h`);
    }

    // Unique recipient count in last 24h (via description pattern [<uuid>])
    const { data: recentDay } = await supabase
        .from('diamond_transactions')
        .select('description')
        .eq('user_id', userId)
        .eq('transaction_type', 'diamond_gift_sent')
        .gte('created_at', oneDayAgo);

    const recipientIds = new Set();
    for (const row of recentDay || []) {
        const match = row.description?.match(/\[([a-f0-9-]{36})\]/);
        if (match) recipientIds.add(match[1]);
    }

    const uniqueRecipients24h = recipientIds.size;

    if (uniqueRecipients24h >= VELOCITY_UNIQUE_RECIPIENTS_24H) {
        flagged = true;
        console.warn(`[VELOCITY:SPAM] User ${userId} sent to ${uniqueRecipients24h} unique recipients in 24h - threshold ${VELOCITY_UNIQUE_RECIPIENTS_24H}`);
    }

    return { flagged, txIn1h, uniqueRecipients24h };
}

export default async function handler(req, res) {
  /**
   * GONE, DELIBERATELY (2026-09-08, docs/DIAMOND-RULINGS.md ruling 4).
   *
   * Player-to-player diamond transfers are off: the diamond economy is a closed
   * loop, and the stream gift is the one social transfer that remains
   * (POST /api/live/gift, through send_stream_gift). This route had zero
   * successful transfers in production when the ruling was written, and the
   * database door it used, send_wallet_diamond_transfer, now refuses and is
   * revoked from authenticated - so leaving the route in place would only
   * produce a confusing 500 instead of an answer a client can read.
   *
   * The whole apparatus this file carried - friendship checks, source tiers,
   * 30-day rolling windows, IP clustering - existed to make an unlimited P2P
   * faucet survivable. None of it is needed once the faucet is closed, and
   * every line of it was a second policy that had to agree with the database's.
   */
  res.setHeader('Allow', '');
  return res.status(410).json({
    error: 'Diamond Transfers Between Players Are Not Available',
    code: 'p2p_transfers_disabled',
    title: 'Transfers Are Off',
    popup_message: 'Diamonds Cannot Be Sent Directly To Another Player',
    popup_explanation: 'You Can Still Send Gifts During A Live Stream',
  });
}
