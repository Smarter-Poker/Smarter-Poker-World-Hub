/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POST /api/live/gift
 *  Send a diamond gift to a live broadcaster.
 *
 * Flow: atomic deduct from sender → atomic credit to receiver → record gift → broadcast to viewers → notify
 *
 * Uses deduct_diamonds (now with FOR UPDATE row lock) and add_diamonds_to_balance RPCs
 * for fully atomic balance operations.
 *
 * ANTI-FARMING SAFEGUARDS (live gifts):
 *  - Hard block: accounts < 30 days cannot send ANY live gifts
 *  - Source-tier rolling 30-day cap (days 31–89):
 *      free/earned diamonds: 100 diamonds/30 days
 *      purchased/won diamonds: 500 diamonds/30 days
 *  - Accounts 90+ days: standard max-per-gift cap (10,000) + velocity detection
 *  - Per-broadcaster rolling 30-day receive cap: 1,000 diamonds
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { randomUUID } from 'crypto';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Anti-farming constants (live gifts) ──
const NEW_USER_BLOCK_DAYS = 30;
const GRADUATION_DAYS = 90;
const FREE_EARNED_30DAY_LIMIT = 100;
const PURCHASED_WON_30DAY_LIMIT = 500;
const RECEIVER_30DAY_RECEIVE_LIMIT = 1000; // per broadcaster per 30-day rolling window

/**
 * Helper to safely sum all matching transactions in 1000-row chunks
 * to avoid Supabase/PostgREST row-drop-off limits.
 */
async function sumPaginatedTransactions(supabase, queryBuilderFn) {
    let total = 0;
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await queryBuilderFn().range(page * pageSize, (page + 1) * pageSize - 1);
        if (error || !data || data.length === 0) break;
        total += data.reduce((sum, r) => sum + Math.abs(r.amount), 0);
        if (data.length < pageSize) break;
        page++;
    }
    return total;
}

const PURCHASED_WON_TYPES = new Set([
    'purchase', 'stripe_purchase', 'diamond_purchase',
    'tournament_prize', 'tournament_win', 'prize_pool', 'promo_purchased',
]);

async function checkVelocity(userId, clientIp) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentHour } = await supabase
        .from('diamond_transactions')
        .select('id')
        .eq('user_id', userId)
        .in('transaction_type', ['diamond_gift_sent', 'live_gift_sent'])
        .gte('created_at', oneHourAgo);
    
    const { data: ipRecentHour } = await supabase
        .from('anti_farming_ips')
        .select('id')
        .eq('ip_address', clientIp)
        .in('action_type', ['diamond_gift_sent', 'live_gift_sent'])
        .gte('created_at', oneHourAgo);

    const txIn1h = (recentHour || []).length;
    const ipTxIn1h = (ipRecentHour || []).length;

    if (txIn1h >= 20) {
        console.warn(`[VELOCITY:FARMING] User ${userId} sent ${txIn1h} live gifts in 1h`);
    }
    if (ipTxIn1h >= 20) {
        console.warn(`[VELOCITY:FARMING] IP ${clientIp} sent ${ipTxIn1h} live gifts in 1h`);
    }
}

async function getLiveGiftSourceCapAvailable(userId) {
    let purchasedWonTotal = 0;
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
            .gt('amount', 0)
            .range(inPage * pageSize, (inPage + 1) * pageSize - 1);

        if (!inboundRows || inboundRows.length === 0) break;

        for (const row of inboundRows) {
            if (PURCHASED_WON_TYPES.has(row.transaction_type)) {
                if (row.transaction_type.includes('purchase') && new Date(row.created_at) > escrowThreshold) {
                    // In escrow - do not unlock the high-tier 500-diamond cap yet
                    continue;
                }
                purchasedWonTotal += Math.abs(row.amount);
            }
        }
        if (inboundRows.length < pageSize) break;
        inPage++;
    }

    let totalSent = 0;
    let outPage = 0;

    // Sum all lifetime outbound gifts (paginated)
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

    return Math.max(0, purchasedWonTotal - totalSent);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { stream_id, receiver_id, amount, message } = req.body;
    
    // SECURITY: Strictly parse amount to an integer. If amount is NaN, a string 
    // like "invalid", or an array, it bypasses JS coercion checks (< 1) and could
    // either cause a DB error or be swallowed as a 0 balance transfer.
    const parsedAmount = parseInt(amount, 10);

    if (!stream_id || !receiver_id || !parsedAmount || isNaN(parsedAmount) || parsedAmount < 1) {
        return res.status(400).json({ error: 'stream_id, receiver_id, and a valid amount required' });
    }
    if (parsedAmount > 10000) {
        return res.status(400).json({ error: 'Maximum gift is 10,000 diamonds' });
    }
    if (receiver_id === user.id) {
        return res.status(400).json({ error: 'Cannot gift yourself' });
    }

    // ── GUARD: Fetch sender profile for age gate ──
    const { data: senderProfile } = await supabase
        .from('profiles')
        .select('id, created_at, username, full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

    const senderAgeDays = senderProfile?.created_at
        ? (new Date() - new Date(senderProfile.created_at)) / (1000 * 60 * 60 * 24)
        : 0;

    // ── GUARD: Hard block — new users (< 30 days) cannot send live gifts ──
    if (senderAgeDays < NEW_USER_BLOCK_DAYS) {
        const daysRemaining = Math.ceil(NEW_USER_BLOCK_DAYS - senderAgeDays);
        return res.status(403).json({
            error: `New accounts cannot send live gifts until your 30-Day VIP Card expires. ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining.`,
            daysRemaining,
            gateType: 'new_user_block',
        });
    }

    // ── GUARD: Source-tier rolling 30-day cap (accounts 31–89 days) ──
    const isGraduated = senderAgeDays >= GRADUATION_DAYS;
    if (!isGraduated) {
        // IP Fingerprinting & Clustering
        const forwarded = req.headers['x-forwarded-for'];
        let clientIp = req.socket?.remoteAddress || 'unknown';
        if (typeof forwarded === 'string') {
            clientIp = forwarded.split(',')[0].trim();
        } else if (Array.isArray(forwarded) && forwarded.length > 0) {
            clientIp = forwarded[0].split(',')[0].trim();
        }

        const rolling30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        
        const { data: outboundLast30 } = await supabase
            .from('diamond_transactions')
            .select('amount')
            .eq('user_id', user.id)
            .in('transaction_type', ['diamond_gift_sent', 'live_gift_sent'])
            .gte('created_at', rolling30Start);

        const alreadySent = (outboundLast30 || []).reduce((sum, t) => sum + Math.abs(t.amount), 0);

        const { data: ipRows } = await supabase
            .from('anti_farming_ips')
            .select('amount')
            .eq('ip_address', clientIp)
            .gte('created_at', rolling30Start);

        const ipAlreadySent = (ipRows || []).reduce((sum, r) => sum + r.amount, 0);
        const effectiveAlreadySent = Math.max(alreadySent, ipAlreadySent);

        const purchasedWonAvailable = await getLiveGiftSourceCapAvailable(user.id);
        const activeCap = purchasedWonAvailable >= parsedAmount ? PURCHASED_WON_30DAY_LIMIT : FREE_EARNED_30DAY_LIMIT;
        const capLabel = purchasedWonAvailable >= parsedAmount ? 'purchased/won' : 'free/earned';

        if (effectiveAlreadySent + parsedAmount > activeCap) {
            console.warn(`[VELOCITY:LIVE_GIFT] User ${user.id} (IP: ${clientIp}) hit 30-day ${capLabel} cap: ${effectiveAlreadySent}/${activeCap}`);
            return res.status(429).json({
                error: `30-day live gift limit reached for ${capLabel} diamonds (${activeCap}/30 days). You've sent ${effectiveAlreadySent} diamonds recently.`,
                alreadySent: effectiveAlreadySent,
                cap: activeCap,
                capType: capLabel,
                gateType: 'source_tier_cap',
            });
        }
    } else {
        // ── Graduated accounts: rely on velocity detectors ──
        const forwarded = req.headers['x-forwarded-for'];
        let clientIp = req.socket?.remoteAddress || 'unknown';
        if (typeof forwarded === 'string') {
            clientIp = forwarded.split(',')[0].trim();
        } else if (Array.isArray(forwarded) && forwarded.length > 0) {
            clientIp = forwarded[0].split(',')[0].trim();
        }
        await checkVelocity(user.id, clientIp);
    }

    // ── GUARD: Per-broadcaster rolling 30-day receive cap ──
    const rolling30StartReceive = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const broadcasterReceiveTotal = await sumPaginatedTransactions(supabase, () => supabase
        .from('diamond_transactions')
        .select('amount')
        .eq('user_id', receiver_id)
        .eq('transaction_type', 'live_gift_received')
        .gte('created_at', rolling30StartReceive));

    if (broadcasterReceiveTotal + parsedAmount > RECEIVER_30DAY_RECEIVE_LIMIT) {
        return res.status(429).json({
            error: `This broadcaster has reached their 30-day gift receive limit (${RECEIVER_30DAY_RECEIVE_LIMIT} diamonds/30 days)`,
            gateType: 'broadcaster_receive_cap',
        });
    }

    // Per-gift UUID generated up front. Used as the reference_id for both the
    // credit and (if needed) the compensating refund.
    const giftId = randomUUID();

    try {
        // senderProfile already fetched above for age gate — reuse it
        const senderName = senderProfile?.username || senderProfile?.full_name || 'A fan';

        // ATOMIC deduct from sender (uses FOR UPDATE row lock to prevent overdraft)
        const { data: deductResult, error: deductErr } = await supabase.rpc('deduct_diamonds', {
            p_user_id: user.id,
            p_amount: parsedAmount,
            p_description: `Live gift to broadcaster`,
            p_transaction_type: 'live_gift_sent',
            p_metadata: { recipient_id: receiver_id },
        });

        // deduct_diamonds returns jsonb with success field
        if (deductErr) throw new Error(`Deduction failed: ${deductErr.message}`);
        if (deductResult && !deductResult.success) {
            return res.status(400).json({
                error: deductResult.error || 'Insufficient diamonds',
                balance: deductResult.balance,
            });
        }

        const senderNewBalance = deductResult?.balance ?? 0;

        // Compensating refund helper — runs when the deduct already committed
        // but a downstream step fails. Without this, the sender's diamonds
        // simply disappear. Uses a stable refund-reference_id so a retry
        // doesn't double-refund.
        const refundSender = async (reason) => {
            try {
                const { error: refundErr } = await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: user.id,
                    p_amount: parsedAmount,
                    p_type: 'live_gift_refund',
                    p_description: `Live gift refund — ${reason}`,
                    p_reference_id: `live_gift_refund_${giftId}`,
                });
                if (refundErr) {
                    console.warn('[live/gift] Refund RPC failed:', refundErr?.message || refundErr);
                }
            } catch (rfErr) {
                console.warn('[live/gift] Refund threw:', rfErr?.message || rfErr);
            }
        };

        // ATOMIC credit to receiver. Use the per-gift UUID as reference_id so
        // multiple gifts to the same stream don't collide on dedup.
        const { data: creditResult, error: creditErr } = await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: receiver_id,
            p_amount: parsedAmount,
            p_type: 'live_gift_received',
            p_description: `${senderName} sent ${parsedAmount} diamonds during your live`,
            p_reference_id: `live_gift_${giftId}`,
        });
        if (creditErr) {
            // Compensate the sender — we already deducted. Without this the
            // sender's money simply disappears.
            await refundSender('credit RPC failed');
            console.warn('[live/gift] Credit RPC failed (refunded sender):', creditErr?.message || creditErr);
            return res.status(500).json({ error: 'Gift failed — your diamonds have been refunded. Please try again.' });
        }
        // The RPC may also return data.success=false (e.g. duplicate
        // reference_id) without setting `error`. With a per-gift UUID this
        // shouldn't happen on the first attempt, but be defensive.
        if (creditResult && creditResult.success === false) {
            await refundSender(`credit returned ${creditResult.error || 'success:false'}`);
            console.warn('[live/gift] Credit returned success:false (refunded sender):', creditResult);
            return res.status(500).json({ error: 'Gift failed — your diamonds have been refunded. Please try again.' });
        }

        // Record the gift
        const { data: gift } = await supabase.from('live_gifts').insert({
            id: giftId,
            stream_id,
            sender_id: user.id,
            receiver_id,
            amount: parsedAmount,
            message: message || null,
        }).select().maybeSingle();

        // Record the IP cluster action
        const forwarded = req.headers['x-forwarded-for'];
        let clientIp = req.socket?.remoteAddress || 'unknown';
        if (typeof forwarded === 'string') {
            clientIp = forwarded.split(',')[0].trim();
        } else if (Array.isArray(forwarded) && forwarded.length > 0) {
            clientIp = forwarded[0].split(',')[0].trim();
        }
        await supabase.from('anti_farming_ips').insert({
            user_id: user.id,
            ip_address: clientIp,
            action_type: 'live_gift_sent',
            amount: parsedAmount
        });

        // Broadcast gift event to all viewers via Supabase Realtime
        // FIX: wait for SUBSCRIBED status before sending — otherwise send() silently drops
        const channel = supabase.channel(`live-gifts-${stream_id}`);
        await new Promise((resolve) => {
            channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') resolve();
            });
            // Safety timeout: don't block the response if subscription takes too long
            setTimeout(resolve, 3000);
        });
        await channel.send({
            type: 'broadcast',
            event: 'gift',
            payload: {
                sender_id: user.id,
                sender_name: senderName,
                sender_avatar: senderProfile?.avatar_url || null,
                receiver_id,
                amount: parsedAmount,
                message: message || null,
                gift_id: gift?.id,
            },
        }).catch(() => {}); // Non-fatal if broadcast fails
        supabase.removeChannel(channel);

        // Notify broadcaster (non-fatal)
        const { error: notifErr } = await supabase.from('notifications').insert({
            user_id: receiver_id,
            type: 'live_gift',
            title: 'Diamond Gift Received',
            message: `${senderName} sent you ${parsedAmount} diamonds during your live stream!`,
            actor_id: user.id,
            link: `/hub/social-media?stream=${stream_id}`,
            read: false,
        });
        if (notifErr) console.warn('Notification insert failed:', notifErr.message);

        return res.json({
            success: true,
            gift,
            newBalance: senderNewBalance,
        });
    } catch (err) {
        console.warn('[live/gift] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
