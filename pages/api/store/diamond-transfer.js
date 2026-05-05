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
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');
const { requireEmailVerifiedByUserId } = require('../../../src/lib/emailVerifiedGate');
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// ── Anti-abuse constants ──
const MIN_TRANSFER = 10;

// Phase 1: Account age tiers (days)
const NEW_USER_BLOCK_DAYS = 30;        // Hard block — no outbound diamonds until day 31
const GRADUATION_DAYS = 90;            // After 90 days, source caps are lifted

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
 * Calculates the sender's purchased/won diamond total from their all-time ledger.
 * This is used to determine which source tier applies to days 31–89 accounts.
 *
 * We sum all INBOUND purchased/won transactions and subtract all outbound gifts to
 * get a conservative "real-value" available balance. If this is >= amount being sent,
 * the PURCHASED_WON cap applies; otherwise FREE_EARNED cap applies.
 */
async function getSourceTierAvailable(supabase, userId) {
    let purchasedWonTotal = 0;
    let freeEarnedTotal = 0;
    const now = new Date();
    const escrowThreshold = new Date(now.getTime() - 72 * 60 * 60 * 1000); // 72-hour escrow

    let inPage = 0;
    const pageSize = 1000;
    
    // Sum all lifetime inbound transactions by type (paginated)
    while (true) {
        const { data: inboundRows } = await supabase
            .from('diamond_transactions')
            .select('amount, transaction_type, created_at')
            .eq('user_id', userId)
            .gt('amount', 0) // positive = earned/received
            .range(inPage * pageSize, (inPage + 1) * pageSize - 1);

        if (!inboundRows || inboundRows.length === 0) break;

        for (const row of inboundRows) {
            if (PURCHASED_WON_TYPES.has(row.transaction_type)) {
                // 72-Hour Fraud Escrow: Purchased diamonds do not count towards the 500 cap for 72 hours
                if (row.transaction_type.includes('purchase') && new Date(row.created_at) > escrowThreshold) {
                    freeEarnedTotal += Math.abs(row.amount);
                } else {
                    purchasedWonTotal += Math.abs(row.amount);
                }
            } else {
                freeEarnedTotal += Math.abs(row.amount);
            }
        }
        if (inboundRows.length < pageSize) break;
        inPage++;
    }

    let totalSent = 0;
    let outPage = 0;

    // Sum all lifetime outbound gifts already sent (paginated)
    while (true) {
        const { data: outboundRows } = await supabase
            .from('diamond_transactions')
            .select('amount')
            .eq('user_id', userId)
            .in('transaction_type', ['diamond_gift_sent', 'live_gift_sent'])
            .range(outPage * pageSize, (outPage + 1) * pageSize - 1);

        if (!outboundRows || outboundRows.length === 0) break;
        
        totalSent += outboundRows.reduce((sum, r) => sum + Math.abs(r.amount), 0);
        
        if (outboundRows.length < pageSize) break;
        outPage++;
    }

    // Conservative: subtract all gifts from purchased/won first, then free/earned
    const purchasedWonAvailable = Math.max(0, purchasedWonTotal - totalSent);

    return { purchasedWonTotal, freeEarnedTotal, purchasedWonAvailable };
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
        console.warn(`[VELOCITY:FARMING] User ${userId} sent ${txIn1h} gifts in 1h — threshold ${VELOCITY_TRANSACTIONS_1H}`);
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
        console.warn(`[VELOCITY:SPAM] User ${userId} sent to ${uniqueRecipients24h} unique recipients in 24h — threshold ${VELOCITY_UNIQUE_RECIPIENTS_24H}`);
    }

    return { flagged, txIn1h, uniqueRecipients24h };
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // Rate limit (financial tier — 20/min)
        if (!applyRateLimit(req, res, LIMITS.financial || LIMITS.write)) return;

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
        const { recipientId, amount: rawAmount } = req.body || {};
        const amount = parseInt(rawAmount, 10);

        if (!recipientId) {
            return res.status(400).json({ success: false, error: 'Recipient is required' });
        }
        if (isNaN(amount) || amount < MIN_TRANSFER) {
            return res.status(400).json({ success: false, error: `Minimum transfer is ${MIN_TRANSFER} diamonds` });
        }

        // ── Guard 7: Self-transfer block ──
        if (userId === recipientId) {
            return res.status(400).json({ success: false, error: 'Cannot transfer diamonds to yourself' });
        }

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
            .select('id, created_at, diamonds, display_name, username')
            .in('id', [userId, recipientId]);

        const senderProfile = profiles?.find(p => p.id === userId);
        const recipientProfile = profiles?.find(p => p.id === recipientId);

        if (!senderProfile || !recipientProfile) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const now = new Date();
        const senderAgeDays = (now - new Date(senderProfile.created_at)) / (1000 * 60 * 60 * 24);
        const recipientAgeDays = (now - new Date(recipientProfile.created_at)) / (1000 * 60 * 60 * 24);

        // ── GUARD 16: Hard block — new users (< 30 days) CANNOT send any diamonds ──
        if (senderAgeDays < NEW_USER_BLOCK_DAYS) {
            const daysRemaining = Math.ceil(NEW_USER_BLOCK_DAYS - senderAgeDays);
            return res.status(403).json({
                success: false,
                error: `New accounts cannot send diamonds until your 30-Day VIP Card expires. ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining.`,
                daysRemaining,
                gateType: 'new_user_block',
            });
        }

        // Recipient must be at least 7 days old (prevents instant alt-account siphoning)
        if (recipientAgeDays < 7) {
            return res.status(403).json({ success: false, error: 'Recipient account must be at least 7 days old to receive diamonds' });
        }

        // ── Guard 4: Per-transfer max (tier-aware) ──
        if (amount > maxTransferVip) {
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

        if (recentTransfer) {
            return res.status(429).json({ success: false, error: `Please wait ${COOLDOWN_SECONDS} seconds between transfers` });
        }

        // ════════════════════════════════════════════════════════════════════
        // PHASE 2: SOURCE-TIERED ROLLING 30-DAY LIMITS (accounts 30–89 days)
        // ════════════════════════════════════════════════════════════════════
        const rolling30Start = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        
        // Rolling 30-day window for outbound gifts
        const { data: outboundLast30 } = await getSupabase()
            .from('diamond_transactions')
            .select('amount')
            .eq('user_id', userId)
            .in('transaction_type', ['diamond_gift_sent', 'live_gift_sent'])
            .gte('created_at', rolling30Start);

        const alreadySent30Day = (outboundLast30 || []).reduce((sum, t) => sum + Math.abs(t.amount), 0);

        // Get 30-day rolling aggregate for this exact IP
        const { data: ipRows } = await getSupabase()
            .from('anti_farming_ips')
            .select('amount')
            .eq('ip_address', clientIp)
            .gte('created_at', rolling30Start);
        
        const ipAlreadySent30Day = (ipRows || []).reduce((sum, r) => sum + r.amount, 0);
        const effectiveAlreadySent = Math.max(alreadySent30Day, ipAlreadySent30Day);

        const { purchasedWonAvailable } = await getSourceTierAvailable(getSupabase(), userId);
        const isGraduated = senderAgeDays >= GRADUATION_DAYS;

        if (!isGraduated) {
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
                });
            }
        } else {
            // ── GRADUATED (90+ day) accounts: standard daily limits + velocity detection ──
            const dayStart = new Date(now);
            dayStart.setHours(0, 0, 0, 0);
            const { data: dailyTransfers } = await getSupabase()
                .from('diamond_transactions')
                .select('amount')
                .eq('user_id', userId)
                .in('transaction_type', ['diamond_gift_sent', 'live_gift_sent'])
                .gte('created_at', dayStart.toISOString());

            const dailyTotal = (dailyTransfers || []).reduce((sum, t) => sum + Math.abs(t.amount), 0);

            if (dailyTotal + amount > dailyLimitTier) {
                console.warn(`[VELOCITY] Graduated user ${userId} hit daily limit: ${dailyTotal}/${dailyLimitTier}`);
                return res.status(429).json({
                    success: false,
                    error: `Daily transfer limit reached (${dailyLimitTier} diamonds/day${isVipTier ? ' VIP tier' : ''}). You've sent ${dailyTotal} diamonds today.`
                });
            }

            // Velocity detection — non-blocking flag for 90+ day accounts
            await checkVelocity(getSupabase(), userId, clientIp);
        }

        // ── Guard 10: Per-recipient rolling 30-day limit ──
        const { data: recipientDailyTransfers } = await getSupabase()
            .from('diamond_transactions')
            .select('amount, description')
            .eq('user_id', userId)
            .eq('transaction_type', 'diamond_gift_sent')
            .gte('created_at', rolling30Start)
            .ilike('description', `%[${recipientId}]%`);

        const recipientDailyTotal = (recipientDailyTransfers || []).reduce((sum, t) => sum + Math.abs(t.amount), 0);
        if (recipientDailyTotal + amount > PER_RECIPIENT_DAILY_LIMIT) {
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

        if (recentRecipientTransfer) {
            return res.status(429).json({
                success: false,
                error: `Please wait ${PER_RECIPIENT_COOLDOWN_SECONDS / 60} minutes between transfers to the same friend`
            });
        }

        // ── Guard 12: Recipient rolling 30-day receive limit ──
        const { data: recipientInbound } = await getSupabase()
            .from('diamond_transactions')
            .select('amount')
            .eq('user_id', recipientId)
            .eq('transaction_type', 'diamond_gift_received')
            .gte('created_at', rolling30Start);

        const recipientReceiveTotal = (recipientInbound || []).reduce((sum, t) => sum + Math.abs(t.amount), 0);
        if (recipientReceiveTotal + amount > RECIPIENT_DAILY_RECEIVE_LIMIT) {
            return res.status(429).json({
                success: false,
                error: `This friend has reached their 30-day receive limit (${RECIPIENT_DAILY_RECEIVE_LIMIT} diamonds/30 days)`
            });
        }

        // Per-transfer UUID generated up front to ensure idempotency across both RPCs
        const transferId = require('crypto').randomUUID();
        const recipientName = recipientProfile.display_name || recipientProfile.username || 'friend';
        const senderName = senderProfile.display_name || senderProfile.username || 'friend';

        // ═══ EXECUTE ATOMIC TRANSFER ═══
        const { data: deductResult, error: deductErr } = await getSupabase()
            .rpc('deduct_diamonds', {
                p_user_id: userId,
                p_amount: amount,
                p_description: `Sent ${amount} diamonds to ${recipientName} [${recipientId}]`,
                p_transaction_type: 'diamond_gift_sent',
            });

        if (deductErr) {
            console.warn('Transfer deduct error:', deductErr);
            return res.status(500).json({ success: false, error: 'Transfer failed — please try again' });
        }
        if (deductResult && !deductResult.success) {
            return res.status(400).json({ success: false, error: deductResult.error || 'Insufficient diamond balance' });
        }
        
        const actualSenderBalance = deductResult?.balance ?? 0;

        // Compensating refund helper in case the credit fails
        const refundSender = async (reason) => {
            try {
                await getSupabase().rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: amount,
                    p_type: 'diamond_gift_refund',
                    p_description: `Transfer refund — ${reason}`,
                    p_reference_id: `transfer_refund_${transferId}`,
                });
            } catch (err) {
                console.warn('[Diamond Transfer] Refund threw:', err);
            }
        };

        const { data: creditResult, error: creditErr } = await getSupabase()
            .rpc('add_diamonds_to_balance', {
                p_user_id: recipientId,
                p_amount: amount,
                p_type: 'diamond_gift_received',
                p_description: `Received ${amount} diamonds from ${senderName} [${userId}]`,
                p_reference_id: `transfer_${transferId}`,
            });

        if (creditErr || (creditResult && creditResult.success === false)) {
            // ROLLBACK: Restore sender's balance using atomic refund
            await refundSender(creditErr?.message || creditResult?.error || 'credit failed');
            console.warn('Transfer credit error (rolled back):', creditErr || creditResult);
            return res.status(500).json({ success: false, error: 'Transfer failed — your diamonds have been restored' });
        }

        // Record the IP cluster action
        await getSupabase().from('anti_farming_ips').insert({
            user_id: userId,
            ip_address: clientIp,
            action_type: 'diamond_gift_sent',
            amount: amount
        });

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
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
