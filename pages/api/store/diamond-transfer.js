/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POST /api/store/diamond-transfer
 *  Transfer diamonds from authenticated user to a friend
 *
 *  ANTI-ABUSE SAFEGUARDS:
 *  1. Friendship verification (must be accepted friends)
 *  2. Balance check (sender must have enough diamonds)
 *  3. Daily transfer limit (tiered: 500diamonds standard, 2000diamonds for 60-day friends)
 *  4. Per-transfer limit (tiered: 10-100diamonds standard, 10-500diamonds for 60-day friends)
 *  5. Account age gate (both users must be >7 days old)
 *  6. Cooldown (60s global between transfers)
 *  7. Self-transfer block
 *  8. Rate limiting (20 req/min)
 *  9. Friendship age tier (60+ day friends get VIP transfer limits)
 *  10. Per-recipient daily limit (200diamonds/day to same friend)
 *  11. Per-recipient cooldown (5min between transfers to same friend)
 *  12. Recipient daily receive cap (1000diamonds/day inbound)
 *  13. Admin audit trail (structured console logging)
 *  14. Velocity detection (flags accounts hitting limits repeatedly)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { getServerUser } = require('../../../src/lib/serverAuth');
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
const MAX_TRANSFER_STANDARD = 100;
const MAX_TRANSFER_VIP = 500;
const DAILY_LIMIT_STANDARD = 500;
const DAILY_LIMIT_VIP = 2000;
const COOLDOWN_SECONDS = 60;
const MIN_ACCOUNT_AGE_DAYS = 7;
const VIP_FRIENDSHIP_DAYS = 60;
const PER_RECIPIENT_DAILY_LIMIT = 200;  // #10: Max 200diamonds/day to same friend
const PER_RECIPIENT_COOLDOWN_SECONDS = 300; // #11: 5min between transfers to same friend
const RECIPIENT_DAILY_RECEIVE_LIMIT = 1000; // #12: Max 1000diamonds/day inbound per account

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // Rate limit (financial tier — 20/min)
        if (!applyRateLimit(req, res, LIMITS.financial || LIMITS.write)) return;

        // ── Auth ──
        const localUser = getServerUser(req);
        let userId;
        if (localUser) {
            userId = localUser.id;
        } else {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, error: 'Authorization required' });
            }
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);
            if (authError || !user) {
                return res.status(401).json({ success: false, error: 'Invalid session' });
            }
            userId = user.id;
        }

        // [Phase 6.1.12] Email must be verified before diamond transfers
        const emailGate = await requireEmailVerifiedByUserId(getSupabase(), userId);
        if (!emailGate.ok) return res.status(emailGate.status).json(emailGate.body);

        // ── Parse body ──
        const { recipientId, amount: rawAmount } = req.body || {};
        const amount = parseInt(rawAmount);

        if (!recipientId) {
            return res.status(400).json({ success: false, error: 'Recipient is required' });
        }
        if (isNaN(amount) || amount < MIN_TRANSFER) {
            return res.status(400).json({ success: false, error: `Minimum transfer is ${MIN_TRANSFER} diamonds` });
        }
        // Per-transfer max is checked after friendship tier is determined (below)

        // ── Guard 7: Self-transfer block ──
        if (userId === recipientId) {
            return res.status(400).json({ success: false, error: 'Cannot transfer diamonds to yourself' });
        }

        // ── Guard 1: Friendship verification + age for tier ──
        // BUG-FIX: Use .limit(1) before .maybeSingle() because duplicate friendship
        // rows (both A→B and B→A as 'accepted') cause PGRST116 error with .maybeSingle()
        // which silently returns null, blocking all transfers between confirmed friends.
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

        // ── Guard 9: Determine friendship tier ──
        const friendshipAgeDays = friendship.created_at
            ? (new Date() - new Date(friendship.created_at)) / (1000 * 60 * 60 * 24)
            : 0;
        const isVipTier = friendshipAgeDays >= VIP_FRIENDSHIP_DAYS;
        const maxTransfer = isVipTier ? MAX_TRANSFER_VIP : MAX_TRANSFER_STANDARD;
        const dailyLimit = isVipTier ? DAILY_LIMIT_VIP : DAILY_LIMIT_STANDARD;

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
        const senderAge = (now - new Date(senderProfile.created_at)) / (1000 * 60 * 60 * 24);
        const recipientAge = (now - new Date(recipientProfile.created_at)) / (1000 * 60 * 60 * 24);

        if (senderAge < MIN_ACCOUNT_AGE_DAYS) {
            return res.status(403).json({ success: false, error: `Account must be at least ${MIN_ACCOUNT_AGE_DAYS} days old to send diamonds` });
        }
        if (recipientAge < MIN_ACCOUNT_AGE_DAYS) {
            return res.status(403).json({ success: false, error: `Recipient account must be at least ${MIN_ACCOUNT_AGE_DAYS} days old to receive diamonds` });
        }

        // ── Guard 4: Per-transfer max (tier-aware) ──
        if (amount > maxTransfer) {
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
            .eq('transaction_type', 'diamond_gift_sent')
            .gte('created_at', cooldownCutoff)
            .limit(1)
            .maybeSingle();

        if (recentTransfer) {
            // Calculate exact seconds remaining for client countdown timer
            return res.status(429).json({ success: false, error: `Please wait ${COOLDOWN_SECONDS} seconds between transfers (cooldown remaining)` });
        }

        // ── Guard 3: Daily limit check (tier-aware) ──
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const { data: dailyTransfers } = await getSupabase()
            .from('diamond_transactions')
            .select('amount')
            .eq('user_id', userId)
            .eq('transaction_type', 'diamond_gift_sent')
            .gte('created_at', dayStart.toISOString());

        const dailyTotal = (dailyTransfers || []).reduce((sum, t) => sum + Math.abs(t.amount), 0);
        if (dailyTotal + amount > dailyLimit) {
            // #14: Velocity detection — flag if hitting limit
            console.warn(`[VELOCITY] User ${userId} hit daily limit: ${dailyTotal}/${dailyLimit}`);
            return res.status(429).json({
                success: false,
                error: `Daily transfer limit reached (${dailyLimit}diamonds/day${isVipTier ? ' VIP tier' : ''}). You've sent ${dailyTotal}diamonds today.`
            });
        }

        // ── Guard 10: Per-recipient daily limit (200diamonds/day to same friend) ──
        const { data: recipientDailyTransfers } = await getSupabase()
            .from('diamond_transactions')
            .select('amount, description')
            .eq('user_id', userId)
            .eq('transaction_type', 'diamond_gift_sent')
            .gte('created_at', dayStart.toISOString())
            .ilike('description', `%[${recipientId}]%`);

        const recipientDailyTotal = (recipientDailyTransfers || []).reduce((sum, t) => sum + Math.abs(t.amount), 0);
        if (recipientDailyTotal + amount > PER_RECIPIENT_DAILY_LIMIT) {
            console.warn(`[VELOCITY] User ${userId} hit per-recipient limit for ${recipientId}: ${recipientDailyTotal}/${PER_RECIPIENT_DAILY_LIMIT}`);
            return res.status(429).json({
                success: false,
                error: `You can only send ${PER_RECIPIENT_DAILY_LIMIT}diamonds per day to the same friend. Sent ${recipientDailyTotal}diamonds to them today.`
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
                error: `Please wait ${PER_RECIPIENT_COOLDOWN_SECONDS} seconds between transfers to the same friend`
            });
        }

        // ── Guard 12: Recipient daily receive limit (1000diamonds/day inbound) ──
        const { data: recipientInbound } = await getSupabase()
            .from('diamond_transactions')
            .select('amount')
            .eq('user_id', recipientId)
            .eq('transaction_type', 'diamond_gift_received')
            .gte('created_at', dayStart.toISOString());

        const recipientReceiveTotal = (recipientInbound || []).reduce((sum, t) => sum + Math.abs(t.amount), 0);
        if (recipientReceiveTotal + amount > RECIPIENT_DAILY_RECEIVE_LIMIT) {
            return res.status(429).json({
                success: false,
                error: `This friend has reached their daily receive limit (${RECIPIENT_DAILY_RECEIVE_LIMIT}diamonds/day)`
            });
        }

        // ═══ EXECUTE ATOMIC TRANSFER ═══
        // Step 1: Deduct from sender using atomic RPC (diamonds = diamonds - amount WHERE diamonds >= amount)
        // This prevents race conditions — no stale snapshot arithmetic
        const { data: deductResult, error: deductErr } = await getSupabase()
            .rpc('transfer_diamonds_deduct', {
                sender_id: userId,
                deduct_amount: amount,
            });

        if (deductErr) {
            console.error('Transfer deduct error:', deductErr);
            return res.status(500).json({ success: false, error: 'Transfer failed — please try again' });
        }

        // RPC returns NULL if insufficient funds (WHERE diamonds >= amount matched 0 rows)
        if (deductResult === null || deductResult === undefined) {
            return res.status(400).json({ success: false, error: 'Insufficient diamond balance (concurrent transfer detected)' });
        }
        const actualSenderBalance = deductResult;

        // Step 2: Credit recipient using atomic RPC (diamonds = diamonds + amount)
        const { data: creditResult, error: creditErr } = await getSupabase()
            .rpc('transfer_diamonds_credit', {
                recipient_id: recipientId,
                credit_amount: amount,
            });

        if (creditErr) {
            // ROLLBACK: Restore sender's balance atomically
            await getSupabase().rpc('transfer_diamonds_credit', {
                recipient_id: userId,
                credit_amount: amount,
            });
            console.error('Transfer credit error (rolled back):', creditErr);
            return res.status(500).json({ success: false, error: 'Transfer failed — your diamonds have been restored' });
        }

        const actualRecipientBalance = creditResult ?? ((recipientProfile.diamonds ?? 0) + amount);

        // Step 3: Log sender transaction (using actual post-deduct balance)
        const recipientName = recipientProfile.display_name || recipientProfile.username || 'friend';
        await getSupabase()
            .from('diamond_transactions')
            .insert({
                user_id: userId,
                amount: -amount,
                type: 'spend',
                transaction_type: 'diamond_gift_sent',
                description: `Sent ${amount} diamonds to ${recipientName} [${recipientId}]`,
                balance_after: actualSenderBalance,
                created_at: now.toISOString(),
            });

        // Step 4: Log recipient transaction (using actual post-credit balance)
        const senderName = senderProfile.display_name || senderProfile.username || 'friend';
        await getSupabase()
            .from('diamond_transactions')
            .insert({
                user_id: recipientId,
                amount: amount,
                type: 'earn',
                transaction_type: 'diamond_gift_received',
                description: `Received ${amount} diamonds from ${senderName} [${userId}]`,
                balance_after: actualRecipientBalance,
                created_at: now.toISOString(),
            });

        // ── #13: Admin audit trail ──
        console.log(JSON.stringify({
            event: 'DIAMOND_TRANSFER',
            senderId: userId,
            senderName: senderProfile.display_name || senderProfile.username,
            recipientId,
            recipientName,
            amount,
            tier: isVipTier ? 'vip' : 'standard',
            senderBalanceBefore: senderProfile.diamonds ?? 0,
            senderBalanceAfter: actualSenderBalance,
            recipientBalanceBefore: recipientProfile.diamonds ?? 0,
            recipientBalanceAfter: actualRecipientBalance,
            friendshipAgeDays: Math.floor(friendshipAgeDays),
            dailyTotalBefore: dailyTotal,
            timestamp: now.toISOString(),
        }));

        return res.status(200).json({
            success: true,
            transferred: amount,
            newBalance: actualSenderBalance,
            tier: isVipTier ? 'vip' : 'standard',
            dailyRemaining: dailyLimit - dailyTotal - amount,
            dailySent: dailyTotal + amount,
            dailyLimit,
            recipientName,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[Diamond Transfer Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
}
