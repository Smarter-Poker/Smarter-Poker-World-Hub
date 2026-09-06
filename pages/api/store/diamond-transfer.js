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
    try {
        setPrivateCommerceResponse(res);
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        // Bound authentication and replay-receipt work as well as new money
        // movement. The second, stricter bucket below has a separate scope so
        // safe receipt retries do not consume the financial-attempt budget.
        if (!applyRateLimit(req, res, {
            ...(LIMITS.read || LIMITS.write),
            scope: ':transfer-receipt',
        })) return;

        // ── Auth ──
        const { user: localUser } = await getServerUserWithFallback(req, getSupabase());
        if (!localUser) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }
        const userId = localUser.id;

        // [Phase 6.1.12] Email must be verified before diamond transfers
        const emailGate = await requireEmailVerifiedByUserId(getSupabase(), userId);
        if (!emailGate.ok) return res.status(emailGate.status).json(emailGate.body);

        // IP Fingerprinting & Clustering
        const forwarded = req.headers['x-forwarded-for'];
        let clientIp = req.socket?.remoteAddress || 'unknown';
        if (typeof forwarded === 'string') {
            clientIp = forwarded.split(',')[0].trim();
        } else if (Array.isArray(forwarded) && forwarded.length > 0) {
            clientIp = forwarded[0].split(',')[0].trim();
        }

        // ── Parse body ──
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return res.status(400).json({ success: false, error: 'A Valid Transfer Request Is Required' });
        }
        if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_TRANSFER_BODY_BYTES) {
            return res.status(413).json({ success: false, error: 'Transfer Request Is Too Large' });
        }
        const unknownFields = Object.keys(req.body).filter(key => !['recipientId', 'amount'].includes(key));
        if (unknownFields.length > 0) {
            return res.status(400).json({ success: false, error: 'Transfer Request Contains Unsupported Fields' });
        }
        const { recipientId, amount: rawAmount } = req.body || {};
        const amount = Number(rawAmount);

        if (!recipientId || typeof recipientId !== 'string' || !UUID_RE.test(recipientId)) {
            return res.status(400).json({ success: false, error: 'Valid recipient is required' });
        }
        if (!Number.isInteger(amount) || amount < MIN_TRANSFER) {
            return res.status(400).json({ success: false, error: `Minimum transfer is ${MIN_TRANSFER} diamonds` });
        }

        const rawIdempotencyKey = req.headers['x-idempotency-key'];
        const idempotencyKey = Array.isArray(rawIdempotencyKey)
            ? rawIdempotencyKey[0]
            : rawIdempotencyKey;
        if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
            return res.status(400).json({
                success: false,
                error: 'A Valid Transfer Request Key Is Required',
                code: 'INVALID_IDEMPOTENCY_KEY',
            });
        }

        // ── Guard 7: Self-transfer block ──
        if (userId === recipientId) {
            return res.status(400).json({ success: false, error: 'Cannot transfer diamonds to yourself' });
        }

        // A browser keeps this key for the complete transfer intent until the
        // result is authoritative. Unlike the old minute bucket, a retry after
        // a lost response therefore resolves to the exact same ledger refs.
        const transferId = transferIdFor(userId, recipientId, amount, idempotencyKey);
        const debitReference = `transfer_deduct_${transferId}`;
        const creditReference = `transfer_${transferId}`;
        const refundReference = `transfer_refund_${transferId}`;
        const { data: replayRows, error: replayError } = await getSupabase()
            .from('diamond_transactions')
            .select('reference_id, created_at')
            .in('reference_id', [debitReference, creditReference, refundReference]);

        // Replay state is financial state. Never continue to a debit when it
        // cannot be established reliably.
        if (replayError) {
            console.warn('[DiamondTransfer] Replay lookup failed:', replayError.message);
            return res.status(503).json({
                success: false,
                error: 'Transfer Status Is Temporarily Unavailable. Please Retry.',
                code: 'TRANSFER_STATUS_UNAVAILABLE',
            });
        }

        const completedReplay = replayRows?.find(row => row.reference_id === creditReference);
        const refundedReplay = replayRows?.find(row => row.reference_id === refundReference);
        const debitReplay = replayRows?.find(row => row.reference_id === debitReference);

        // Completed and compensated replays are returned before friendship,
        // cooldown, velocity, or balance guards. A retry is a receipt lookup,
        // not a new transfer attempt.
        if (refundedReplay) {
            return res.status(409).json({
                success: false,
                error: 'The Previous Transfer Attempt Was Refunded. Start A New Transfer.',
                code: 'TRANSFER_REFUNDED',
                refunded: true,
                idempotencyTerminal: true,
            });
        }

        if (completedReplay) {
            const { data: replaySender, error: replaySenderError } = await getSupabase()
                .from('profiles')
                .select('diamonds, display_name, username')
                .eq('id', userId)
                .maybeSingle();
            if (replaySenderError || !replaySender) {
                return res.status(503).json({
                    success: false,
                    error: 'Transfer Completed, But The Current Balance Is Temporarily Unavailable',
                    code: 'TRANSFER_RECEIPT_UNAVAILABLE',
                });
            }
            const replaySideEffects = await reconcileCompletedTransferSideEffects({
                userId,
                recipientId,
                amount,
                clientIp,
                senderName: replaySender.display_name || replaySender.username || 'friend',
                transferId,
                creditCreatedAt: completedReplay.created_at,
            });
            if (!transferSideEffectsReady(replaySideEffects)) {
                return respondTransferSideEffectsPending(res);
            }
            return res.status(200).json({
                success: true,
                idempotent: true,
                transferred: amount,
                newBalance: replaySender.diamonds ?? 0,
            });
        }

        if (debitReplay) {
            const debitAt = Date.parse(debitReplay.created_at || '');
            if (!Number.isFinite(debitAt) || Date.now() - debitAt < ORPHAN_RECOVERY_DELAY_MS) {
                return res.status(409).json({
                    success: false,
                    error: 'Transfer Recovery Is Still In Progress. Please Retry Shortly.',
                    code: 'TRANSFER_RECOVERY_PENDING',
                    idempotencyTerminal: false,
                });
            }

            // The debit ledger entry proves that this exact intent already
            // passed the guards. Recover its missing credit directly; running
            // it through cooldown and rolling-limit guards again would strand
            // the debit forever.
            const { data: recoveryProfiles, error: recoveryProfilesError } = await getSupabase()
                .from('profiles')
                .select('id, diamonds, display_name, username')
                .in('id', [userId, recipientId]);
            const recoverySender = recoveryProfiles?.find(profile => profile.id === userId);
            const recoveryRecipient = recoveryProfiles?.find(profile => profile.id === recipientId);
            if (recoveryProfilesError || !recoverySender || !recoveryRecipient) {
                return res.status(503).json({
                    success: false,
                    error: 'Transfer Recovery Is Temporarily Unavailable. Please Retry.',
                    code: 'TRANSFER_RECOVERY_UNAVAILABLE',
                });
            }

            const recoverySenderName = recoverySender.display_name || recoverySender.username || 'friend';
            const { data: recoveryCredit, error: recoveryCreditError } = await getSupabase()
                .rpc('add_diamonds_to_balance', {
                    p_user_id: recipientId,
                    p_amount: amount,
                    p_type: 'diamond_gift_received',
                    p_description: `Received ${amount} diamonds from ${recoverySenderName} [${userId}]`,
                    p_reference_id: creditReference,
                });

            let recoveryCreditCommitted = recoveryCredit?.success === true
                || recoveryCredit?.duplicate === true;
            if (recoveryCreditError && !recoveryCreditCommitted) {
                /* The credit may still be committing in another invocation.
                   Refunding here could leave both wallets credited. Keep the
                   debit pending under the same durable key and let replay
                   resolve the authoritative ledger state. */
                return res.status(503).json({
                    success: false,
                    error: 'Transfer Settlement Is Being Verified. Please Retry Shortly.',
                    code: 'TRANSFER_SETTLEMENT_PENDING',
                    idempotencyTerminal: false,
                });
            }
            if (!recoveryCredit) {
                return res.status(503).json({
                    success: false,
                    error: 'Transfer Settlement Is Being Verified. Please Retry Shortly.',
                    code: 'TRANSFER_SETTLEMENT_PENDING',
                    idempotencyTerminal: false,
                });
            }
            if (!recoveryCreditCommitted) {
                const { data: committedRecoveryCredit, error: committedRecoveryCreditError } = await getSupabase()
                    .from('diamond_transactions')
                    .select('id')
                    .eq('reference_id', creditReference)
                    .limit(1)
                    .maybeSingle();
                if (committedRecoveryCreditError) {
                    return res.status(503).json({
                        success: false,
                        error: 'Transfer Settlement Is Being Verified. Please Retry Shortly.',
                        code: 'TRANSFER_SETTLEMENT_PENDING',
                        idempotencyTerminal: false,
                    });
                }
                recoveryCreditCommitted = Boolean(committedRecoveryCredit);
            }

            if (!recoveryCreditCommitted) {
                const { data: recoveryRefund, error: recoveryRefundError } = await getSupabase()
                    .rpc('add_diamonds_to_balance', {
                        p_user_id: userId,
                        p_amount: amount,
                        p_type: 'diamond_gift_refund',
                        p_description: 'Transfer refund - orphan debit recovery failed',
                        p_reference_id: refundReference,
                    });
                const refunded = !recoveryRefundError && (
                    recoveryRefund?.success === true || recoveryRefund?.duplicate === true
                );
                return res.status(500).json({
                    success: false,
                    error: refunded
                        ? 'Transfer Failed - Your Diamonds Have Been Restored'
                        : 'Transfer Failed And The Refund Did Not Go Through. Please Contact Support.',
                    code: refunded ? 'TRANSFER_REFUNDED' : 'TRANSFER_RECOVERY_FAILED',
                    refunded,
                    idempotencyTerminal: refunded,
                });
            }

            /* The original process ended between debit and credit, so its
               non-financial side effects never ran. Rebuild them only after
               the durable credit is confirmed. Failures remain observable but
               never roll back an already completed wallet transfer. */
            const recoverySideEffects = await reconcileCompletedTransferSideEffects({
                userId,
                recipientId,
                amount,
                clientIp,
                senderName: recoverySenderName,
                transferId,
            });
            if (!transferSideEffectsReady(recoverySideEffects)) {
                return respondTransferSideEffectsPending(res);
            }
            console.info(`[DiamondTransfer] Recovered orphan transfer ${transferId}`);

            return res.status(200).json({
                success: true,
                idempotent: true,
                recovered: true,
                transferred: amount,
                newBalance: recoverySender.diamonds ?? 0,
                recipientName: recoveryRecipient.display_name || recoveryRecipient.username || 'friend',
            });
        }

        // Rate-limit only genuinely new transfer attempts. Receipt replays and
        // orphan recovery above must remain available after a lost response.
        if (!applyRateLimit(req, res, {
            ...(LIMITS.financial || LIMITS.write),
            scope: ':transfer-financial',
        })) return;

        // ── Guard 1: Friendship verification ──
        const { data: friendshipRows } = await getSupabase()
            .from('friendships')
            .select('id, status, created_at')
            .or(`and(user_id.eq.${userId},friend_id.eq.${recipientId}),and(user_id.eq.${recipientId},friend_id.eq.${userId})`)
            .eq('status', 'accepted')
            .limit(1);
        const friendship = friendshipRows?.[0] || null;

        if (!friendship) {
            return res.status(403).json({ success: false, error: 'You can only send diamonds to accepted friends' });
        }

        // ── Guard 9: Friendship tier ──
        const friendshipAgeDays = friendship.created_at
            ? (new Date() - new Date(friendship.created_at)) / (1000 * 60 * 60 * 24)
            : 0;
        const isVipTier = friendshipAgeDays >= VIP_FRIENDSHIP_DAYS;
        const maxTransferVip = isVipTier ? MAX_TRANSFER_VIP : MAX_TRANSFER_STANDARD;
        const dailyLimitTier = isVipTier ? DAILY_LIMIT_VIP : DAILY_LIMIT_STANDARD;

        // ── Guard 5: Account age check (both users) ──
        const { data: profiles } = await getSupabase()
            .from('profiles')
            .select('id, created_at, diamonds, display_name, username, is_farming_flagged')
            .in('id', [userId, recipientId]);

        const senderProfile = profiles?.find(p => p.id === userId);
        const recipientProfile = profiles?.find(p => p.id === recipientId);

        if (!senderProfile || !recipientProfile) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const now = new Date();
        const senderAgeDays = (now - new Date(senderProfile.created_at)) / (1000 * 60 * 60 * 24);
        const recipientAgeDays = (now - new Date(recipientProfile.created_at)) / (1000 * 60 * 60 * 24);

        // Exemption is keyed on the immutable auth user ID (see EXEMPT_USER_IDS).
        // The old check matched user-settable username/full_name strings, which let
        // ANY user rename themselves to bypass every anti-farming guard.
        const isKingfish = EXEMPT_USER_IDS.has(userId);

        // ── Trust signal: completed non-refunded diamond purchase ──
        // Mirrors the DB-side cap function (fn_check_anti_farming_gift_cap) which
        // grants trusted_purchaser_bypass for any user with a completed non-refunded
        // diamond_purchases row. Service-role bypasses RLS;
        // idx_diamond_purchases_user_id makes this O(1).
        const { data: paidPurchases } = await getSupabase()
            .from('diamond_purchases')
            .select('completed_at')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .is('refunded_at', null)
            .order('completed_at', { ascending: true })
            .limit(1);
        const firstPurchaseAt = paidPurchases?.[0]?.completed_at
            ? new Date(paidPurchases[0].completed_at)
            : null;
        const hasPaid = firstPurchaseAt !== null;
        const daysSinceFirstPurchase = firstPurchaseAt
            ? (Date.now() - firstPurchaseAt.getTime()) / (1000 * 60 * 60 * 24)
            : null;
        const isPostPurchaseCooldown = hasPaid && daysSinceFirstPurchase >= 7;
        const isFreshPaid = hasPaid && !isPostPurchaseCooldown && senderAgeDays < NEW_USER_BLOCK_DAYS;

        // ── Trust signal: graduated OR paid, AND not flagged ──
        // Logical NOT (was strict `=== false`) correctly treats NULL and false
        // identically — only true is restricted. Mirrors fn_check_anti_farming_gift_cap
        // exactly so the DB trigger never blocks what the JS layer admits.
        const isGraduated = senderAgeDays >= GRADUATION_DAYS;
        const isFullyUnrestricted = !senderProfile?.is_farming_flagged && (
            isGraduated || isPostPurchaseCooldown
        );

        // ── GUARD 16: Hard block — new users (< 30 days) CANNOT send any diamonds ──
        // Trusted senders (paid OR graduated unflagged) bypass the new-user block.
        // Per platform rule: "unlimited gifting for paid users and 120d+ unflagged".
        if (!isKingfish && !hasPaid && senderAgeDays < NEW_USER_BLOCK_DAYS) {
            const daysRemaining = Math.ceil(NEW_USER_BLOCK_DAYS - senderAgeDays);
            return res.status(403).json({
                success: false,
                error: `New accounts cannot send diamonds until your 30-Day VIP Card expires. ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining.`,
                daysRemaining,
                gateType: 'new_user_block',
                title: 'Account Cool Down',
                popup_message: 'Your Account Is In A 30-Day Cool Down Period',
                popup_explanation: 'To maintain a secure network economy, new accounts cannot send diamond transfers until the 30-Day VIP Card window expires. Purchase diamonds or wait for the cool down to complete.',
                next_send_message: 'Unlimited Transferring Unlocks After Purchase',
                limits_lift_message: `Your VIP Card Window Expires In ${daysRemaining} Day${daysRemaining !== 1 ? 's' : ''}`,
            });
        }

        if (!isKingfish && isFreshPaid) {
            const last24hStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: sent24h } = await getSupabase().rpc('sum_diamond_transactions', {
                p_user_id: userId,
                p_types: ['diamond_gift_sent', 'live_gift_sent'],
                p_start: last24hStart,
            });
            if ((sent24h || 0) + amount > 500) {
                const liftAt = new Date(firstPurchaseAt.getTime() + 7 * 24 * 60 * 60 * 1000);
                const liftDate = liftAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                return res.status(429).json({
                    success: false,
                    error: `Daily limit of 500 diamonds reached`,
                    gateType: 'fresh_paid_24h_cap',
                    title: 'Daily Limit Reached',
                    popup_message: 'You Have Reached Your Daily 500 Diamond Sending Limit',
                    popup_explanation: 'New Paid Accounts Are Limited To 500 Diamonds Per Day During The First 7 Days After Your First Purchase To Protect Against Fraud',
                    next_send_message: 'You Can Send More Diamonds Tomorrow',
                    limits_lift_at: liftAt.toISOString(),
                    limits_lift_message: `Your Limits Are Fully Lifted On ${liftDate}`,
                    amount_sent_24h: sent24h || 0,
                    amount_cap_24h: 500,
                });
            }
        }

        // Recipient must be at least 7 days old (prevents instant alt-account siphoning)
        if (!isKingfish && recipientAgeDays < 7) {
            return res.status(403).json({ success: false, error: 'Recipient account must be at least 7 days old to receive diamonds' });
        }

        // ── Guard 4: Per-transfer max (tier-aware) ──
        if (!isKingfish && !isFullyUnrestricted && amount > maxTransferVip) {
            return res.status(400).json({
                success: false,
                error: isVipTier
                    ? `Maximum ${MAX_TRANSFER_VIP} diamonds per transfer (VIP friend tier)`
                    : `Maximum ${MAX_TRANSFER_STANDARD} diamonds per transfer (become friends for ${VIP_FRIENDSHIP_DAYS}+ days to unlock ${MAX_TRANSFER_VIP})`
            });
        }

        // ── Guard 2: Balance check ──
        if ((senderProfile.diamonds ?? 0) < amount) {
            return res.status(400).json({ success: false, error: 'Insufficient diamond balance' });
        }

        // ── Guard 6: Cooldown check (60s between transfers) ──
        const cooldownCutoff = new Date(now - COOLDOWN_SECONDS * 1000).toISOString();
        const { data: recentTransfer } = await getSupabase()
            .from('diamond_transactions')
            .select('id')
            .eq('user_id', userId)
            .in('transaction_type', ['diamond_gift_sent', 'live_gift_sent'])
            .gte('created_at', cooldownCutoff)
            .limit(1)
            .maybeSingle();

        if (!isKingfish && !isFullyUnrestricted && recentTransfer) {
            return res.status(429).json({ success: false, error: `Please wait ${COOLDOWN_SECONDS} seconds between transfers` });
        }

        // ════════════════════════════════════════════════════════════════════
        // PHASE 2: SOURCE-TIERED ROLLING 30-DAY LIMITS (accounts 30–89 days)
        // ════════════════════════════════════════════════════════════════════
        const rolling30Start = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        
        // Rolling 30-day window for outbound gifts
        const alreadySent30Day = await sumPaginatedTransactions(getSupabase(), () => getSupabase()
            .from('diamond_transactions')
            .select('amount')
            .eq('user_id', userId)
            .in('transaction_type', ['diamond_gift_sent', 'live_gift_sent'])
            .gte('created_at', rolling30Start));

        // Get 30-day rolling aggregate for this exact IP
        const ipAlreadySent30Day = await sumPaginatedTransactions(getSupabase(), () => getSupabase()
            .from('anti_farming_ips')
            .select('amount')
            .eq('ip_address', clientIp)
            .gte('created_at', rolling30Start));
        
        const effectiveAlreadySent = Math.max(alreadySent30Day, ipAlreadySent30Day);

        const { purchasedWonAvailable } = await getSourceTierAvailable(getSupabase(), userId);

        if (!isKingfish && !isFullyUnrestricted && !isGraduated) {
            // ── GRADUATION PHASE (30–119 day) accounts: source-tiered 30-day caps ──
            // Determine which pool the sender qualifies for
            const activeCap = purchasedWonAvailable >= amount
                ? PURCHASED_WON_30DAY_LIMIT
                : FREE_EARNED_30DAY_LIMIT;
            const capLabel = purchasedWonAvailable >= amount ? 'purchased/won' : 'free/earned';

            if (effectiveAlreadySent + amount > activeCap) {
                console.warn(`[VELOCITY] User ${userId} (IP: ${clientIp}) hit 30-day ${capLabel} cap: ${effectiveAlreadySent}/${activeCap}`);
                return res.status(429).json({
                    success: false,
                    error: `30-day send limit reached for ${capLabel} diamonds (${activeCap} diamonds/30 days). You've sent ${effectiveAlreadySent} diamonds from this account/device recently.`,
                    alreadySent: effectiveAlreadySent,
                    cap: activeCap,
                    capType: capLabel,
                    gateType: 'source_tier_cap',
                    title: 'Outbound Limit Reached',
                    popup_message: 'You Have Reached Your 30-Day Sending Limit',
                    popup_explanation: `Your account is currently in the graduation phase. Unpaid or fresh accounts have a rolling 30-day cap of ${FREE_EARNED_30DAY_LIMIT} diamonds for free/earned and ${PURCHASED_WON_30DAY_LIMIT} diamonds for purchased/won. Limits are fully lifted once your account reaches 120 days old.`,
                    next_send_message: 'Limits Graduate Automatically At 120 Days',
                    limits_lift_message: 'Limits Graduate To Unlimited At 120 Days',
                });
            }
        } else if (!isKingfish && !isFullyUnrestricted) {
            // ── GRADUATED (but flagged/restricted) accounts: standard daily limits + velocity detection ──
            const dayStart = new Date(now);
            dayStart.setHours(0, 0, 0, 0);
            const dailyTotal = await sumPaginatedTransactions(getSupabase(), () => getSupabase()
                .from('diamond_transactions')
                .select('amount')
                .eq('user_id', userId)
                .in('transaction_type', ['diamond_gift_sent', 'live_gift_sent'])
                .gte('created_at', dayStart.toISOString()));

            if (dailyTotal + amount > dailyLimitTier) {
                console.warn(`[VELOCITY] Graduated user ${userId} hit daily limit: ${dailyTotal}/${dailyLimitTier}`);
                return res.status(429).json({
                    success: false,
                    error: `Daily transfer limit reached (${dailyLimitTier} diamonds/day${isVipTier ? ' VIP tier' : ''}). You've sent ${dailyTotal} diamonds today.`
                });
            }

            // Velocity detection — non-blocking flag
            await checkVelocity(getSupabase(), userId, clientIp);
        } else if (isFullyUnrestricted && !isKingfish) {
            // Unrestricted users still trigger velocity logs so we can monitor them
            await checkVelocity(getSupabase(), userId, clientIp);
        }

        // ── Guard 10: Per-recipient rolling 30-day limit ──
        const recipientDailyTotal = await sumPaginatedTransactions(getSupabase(), () => getSupabase()
            .from('diamond_transactions')
            .select('amount')
            .eq('user_id', userId)
            .eq('transaction_type', 'diamond_gift_sent')
            .gte('created_at', rolling30Start)
            .ilike('description', `%[${recipientId}]%`));
        if (!isKingfish && !isFullyUnrestricted && recipientDailyTotal + amount > PER_RECIPIENT_DAILY_LIMIT) {
            console.warn(`[VELOCITY] User ${userId} hit per-recipient limit for ${recipientId}: ${recipientDailyTotal}/${PER_RECIPIENT_DAILY_LIMIT}`);
            return res.status(429).json({
                success: false,
                error: `You can only send ${PER_RECIPIENT_DAILY_LIMIT} diamonds per 30 days to the same friend. Sent ${recipientDailyTotal} diamonds to them recently.`
            });
        }

        // ── Guard 11: Per-recipient cooldown (5min between transfers to same friend) ──
        const recipientCooldownCutoff = new Date(now - PER_RECIPIENT_COOLDOWN_SECONDS * 1000).toISOString();
        const { data: recentRecipientTransfer } = await getSupabase()
            .from('diamond_transactions')
            .select('id, description')
            .eq('user_id', userId)
            .eq('transaction_type', 'diamond_gift_sent')
            .gte('created_at', recipientCooldownCutoff)
            .ilike('description', `%[${recipientId}]%`)
            .limit(1)
            .maybeSingle();

        if (!isKingfish && !isFullyUnrestricted && recentRecipientTransfer) {
            return res.status(429).json({
                success: false,
                error: `Please wait ${PER_RECIPIENT_COOLDOWN_SECONDS / 60} minutes between transfers to the same friend`
            });
        }

        // ── Guard 12: Recipient rolling 30-day receive limit ──
        const recipientReceiveTotal = await sumPaginatedTransactions(getSupabase(), () => getSupabase()
            .from('diamond_transactions')
            .select('amount')
            .eq('user_id', recipientId)
            .eq('transaction_type', 'diamond_gift_received')
            .gte('created_at', rolling30Start));
        if (!isKingfish && recipientReceiveTotal + amount > RECIPIENT_DAILY_RECEIVE_LIMIT) {
            return res.status(429).json({
                success: false,
                error: `This friend has reached their 30-day receive limit (${RECIPIENT_DAILY_RECEIVE_LIMIT} diamonds/30 days)`,
                gateType: 'broadcaster_receive_cap',
                title: 'Recipient Cap Reached',
                popup_message: 'Recipient Receive Limit Reached',
                popup_explanation: `This friend has reached their 30-day diamond receive limit of ${RECIPIENT_DAILY_RECEIVE_LIMIT.toLocaleString()} diamonds. Please try again later.`,
                next_send_message: 'Please Try Again In A Few Days',
            });
        }

        const recipientName = recipientProfile.display_name || recipientProfile.username || 'friend';
        const senderName = senderProfile.display_name || senderProfile.username || 'friend';

        // ═══ EXECUTE ATOMIC TRANSFER ═══
        const { data: deductResult, error: deductErr } = await getSupabase()
            .rpc('deduct_diamonds', {
                p_user_id:          userId,
                p_amount:           amount,
                p_description:      `Sent ${amount} diamonds to ${recipientName} [${recipientId}]`,
                p_transaction_type: 'diamond_gift_sent',
                p_metadata:         { recipient_id: recipientId },
                p_reference_id:     debitReference,
                p_cooldown_seconds: COOLDOWN_SECONDS,
            });

        if (deductErr) {
            console.warn('Transfer deduct error caught:', deductErr);
            const errCode = deductErr.code;
            const errDetails = deductErr.details;
            const errMessage = deductErr.message || 'Transfer failed - please try again';
            
            if ((errCode === 'P0001' || errCode === '23514') && errDetails) {
                try {
                    const popup = JSON.parse(errDetails);
                    if (popup && popup.code) {
                        // No refund needed here — the deduct itself failed, nothing was taken.

                        // Map database-level codes to beautiful user-friendly alerts
                        let displayTitle = popup.title || 'Transfer Restricted';
                        let displayExplanation = popup.popup_explanation || popup.reason || errMessage;
                        let displayMessage = popup.popup_message || popup.reason || 'You cannot complete this transfer right now';
                        
                        if (popup.code === 'pair_24h_cap') {
                            displayTitle = 'Recipient Limit Reached';
                            displayExplanation = 'To protect against farming and abuse, we limit the amount of diamonds you can send to a single friend to 5,000 diamonds every 24 hours.';
                            displayMessage = 'You Have Reached Your 24-Hour Sending Limit For This Recipient';
                        } else if (popup.code === 'user_24h_cap') {
                            displayTitle = 'Daily Sending Limit Reached';
                            displayExplanation = 'To protect the platform economy, accounts have a daily total outbound transfer cap of 50,000 diamonds every 24 hours.';
                            displayMessage = 'You Have Reached Your 24-Hour Overall Sending Limit';
                        } else if (popup.code === 'burst_cap') {
                            displayTitle = 'Sending Too Fast';
                            displayExplanation = 'Please slow down. You can send a maximum of 2,000 diamonds every 60 seconds.';
                            displayMessage = 'Velocity Check Triggered';
                        }
                        
                        return res.status(429).json({
                            success: false,
                            error: popup.reason || errMessage,
                            gateType: popup.code,
                            title: displayTitle,
                            popup_message: displayMessage,
                            popup_explanation: displayExplanation,
                            next_send_message: popup.next_send_message || 'Please try again later',
                            limits_lift_at: popup.limits_lift_at,
                            limits_lift_message: popup.limits_lift_message,
                            amount_sent_24h: popup.amount_sent_24h,
                            amount_cap_24h: popup.amount_cap_24h,
                        });
                    }
                } catch (_) { /* fall through to legacy check */ }
            }
            
            // SECURITY: never echo raw DB/trigger internals to the client — only
            // surface the known, user-facing anti-farming message pattern.
            let cleanMessage = 'Transfer failed - please try again';
            if (errMessage.includes('Anti-farming:')) {
                cleanMessage = errMessage.replace('Anti-farming:', '').trim();
            }

            return res.status(500).json({ success: false, error: cleanMessage });
        }
        const debitState = classifyTransferDebit(deductResult, null);
        if (debitState === 'pending') {
            return res.status(503).json({
                success: false,
                error: 'Transfer Debit Is Being Verified. Please Retry Shortly.',
                code: 'TRANSFER_DEBIT_PENDING',
                idempotencyTerminal: false,
            });
        }
        if (debitState === 'rejected') {
            return res.status(400).json({ success: false, error: deductResult.error || 'Insufficient diamond balance' });
        }
        
        const actualSenderBalance = deductResult?.balance ?? senderProfile.diamonds ?? 0;

        // Compensating refund helper for an explicit, authoritative credit
        // rejection. Ambiguous throws never call this helper; they retain the
        // debit for durable replay so a late credit cannot mint currency.
        // Returns true only when the sender's diamonds genuinely came back.
        //
        // This used to `await` the RPC and throw the result away. The RPC
        // reports business failures in its RETURN VALUE, not by throwing, so a
        // refund that was rejected — insufficient service balance, a duplicate
        // reference, a cap — was indistinguishable from one that worked. The
        // caller then told the user "your diamonds have been restored" when
        // they had not been. A refund that silently fails is worse than one
        // that fails loudly, because nobody goes looking for it.
        const refundSender = async (reason) => {
            try {
                const { data, error } = await getSupabase().rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: amount,
                    p_type: 'diamond_gift_refund',
                    p_description: `Transfer refund - ${reason}`,
                    p_reference_id: refundReference,
                });
                if (error || !data || (data.success !== true && data.duplicate !== true)) {
                    console.error(
                        `[Diamond Transfer] REFUND FAILED for ${userId} (${amount} diamonds) after ${reason}:`,
                        error?.message || data?.error,
                    );
                    return false;
                }
                return true;
            } catch (err) {
                console.error(`[Diamond Transfer] Refund threw for ${userId} (${amount} diamonds):`, err?.message || err);
                return false;
            }
        };

        const { data: creditResult, error: creditErr } = await getSupabase()
            .rpc('add_diamonds_to_balance', {
                p_user_id: recipientId,
                p_amount: amount,
                p_type: 'diamond_gift_received',
                p_description: `Received ${amount} diamonds from ${senderName} [${userId}]`,
                p_reference_id: creditReference,
            });

        let creditState = classifyTransferCredit(creditResult, creditErr);
        if (creditState === 'pending') {
            return res.status(503).json({
                success: false,
                error: 'Transfer Settlement Is Being Verified. Please Retry Shortly.',
                code: 'TRANSFER_SETTLEMENT_PENDING',
                idempotencyTerminal: false,
            });
        }
        if (creditState === 'rejected') {
            const { data: committedCredit, error: committedCreditError } = await getSupabase()
                .from('diamond_transactions')
                .select('id')
                .eq('reference_id', creditReference)
                .limit(1)
                .maybeSingle();
            if (committedCreditError) {
                // An ambiguous credit must remain recoverable with the same
                // request key. Refunding without knowing whether it committed
                // could credit both parties.
                return res.status(503).json({
                    success: false,
                    error: 'Transfer Settlement Is Being Verified. Please Retry Shortly.',
                    code: 'TRANSFER_SETTLEMENT_PENDING',
                    idempotencyTerminal: false,
                });
            }
            creditState = classifyTransferCredit(creditResult, null, Boolean(committedCredit));
        }

        if (creditState === 'rejected') {
            // ROLLBACK: Restore sender's balance using atomic refund
            const refunded = await refundSender(creditErr?.message || creditResult?.error || 'credit failed');
            console.warn('Transfer credit error (rolled back):', creditErr || creditResult);
            // Only claim the money came back if it actually did. Promising a
            // refund that did not happen sends the user away satisfied while
            // they are still short the diamonds.
            return res.status(500).json({
                success: false,
                error: refunded
                    ? 'Transfer failed - your diamonds have been restored'
                    : 'Transfer failed and the refund did not go through. Please contact support.',
                refunded,
                idempotencyTerminal: refunded,
            });
        }

        if (creditResult && creditResult.duplicate) {
            console.info(`[DiamondTransfer] Idempotent retry detected for transfer ${transferId} - skipping refund`);
        }
        if (creditErr && creditState === 'committed') {
            console.info(`[DiamondTransfer] Verified committed credit after an ambiguous RPC error for transfer ${transferId}`);
        }

        const completionSideEffects = await reconcileCompletedTransferSideEffects({
            userId,
            recipientId,
            amount,
            clientIp,
            senderName,
            transferId,
        });
        if (!transferSideEffectsReady(completionSideEffects)) {
            return respondTransferSideEffectsPending(res);
        }

        // ── #13: Admin audit trail ──
        console.info(`[DiamondTransfer] ✓ ${amount}💎 | sender_age=${Math.floor(senderAgeDays)}d | graduated=${isGraduated} | tier=${isVipTier ? 'vip' : 'standard'}`);

        return res.status(200).json({
            success: true,
            transferred: amount,
            newBalance: actualSenderBalance,
            tier: isVipTier ? 'vip' : 'standard',
            graduated: isGraduated,
            recipientName,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Diamond Transfer Error]', err);
        if (!res.headersSent) return res.status(503).json({
            success: false,
            error: 'Transfer State Is Being Verified. Please Retry The Same Transfer.',
            code: 'TRANSFER_RECOVERY_PENDING',
            refunded: false,
            idempotencyTerminal: false,
        });
    }
}
