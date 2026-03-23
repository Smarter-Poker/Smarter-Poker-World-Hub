/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POST /api/store/diamond-transfer
 *  Transfer diamonds from authenticated user to a friend
 *
 *  ANTI-ABUSE SAFEGUARDS:
 *  1. Friendship verification (must be accepted friends)
 *  2. Balance check (sender must have enough diamonds)
 *  3. Daily transfer limit (500💎/day outbound)
 *  4. Per-transfer limit (10-100💎)
 *  5. Account age gate (both users must be >7 days old)
 *  6. Cooldown (60s between transfers)
 *  7. Self-transfer block
 *  8. Rate limiting (20 req/min)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { getServerUser } = require('../../../src/lib/serverAuth');

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
const MAX_TRANSFER = 100;
const DAILY_LIMIT = 500;
const COOLDOWN_SECONDS = 60;
const MIN_ACCOUNT_AGE_DAYS = 7;

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

        // ── Parse body ──
        const { recipientId, amount: rawAmount } = req.body || {};
        const amount = parseInt(rawAmount);

        if (!recipientId) {
            return res.status(400).json({ success: false, error: 'Recipient is required' });
        }
        if (isNaN(amount) || amount < MIN_TRANSFER) {
            return res.status(400).json({ success: false, error: `Minimum transfer is ${MIN_TRANSFER} diamonds` });
        }
        if (amount > MAX_TRANSFER) {
            return res.status(400).json({ success: false, error: `Maximum ${MAX_TRANSFER} diamonds per transfer` });
        }

        // ── Guard 7: Self-transfer block ──
        if (userId === recipientId) {
            return res.status(400).json({ success: false, error: 'Cannot transfer diamonds to yourself' });
        }

        // ── Guard 1: Friendship verification ──
        const { data: friendship } = await getSupabase()
            .from('friendships')
            .select('id, status')
            .or(`and(user_id.eq.${userId},friend_id.eq.${recipientId}),and(user_id.eq.${recipientId},friend_id.eq.${userId})`)
            .eq('status', 'accepted')
            .maybeSingle();

        if (!friendship) {
            return res.status(403).json({ success: false, error: 'You can only send diamonds to accepted friends' });
        }

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
            .in('type', ['diamond_gift_sent'])
            .gte('created_at', cooldownCutoff)
            .limit(1)
            .maybeSingle();

        if (recentTransfer) {
            return res.status(429).json({ success: false, error: 'Please wait 60 seconds between transfers' });
        }

        // ── Guard 3: Daily limit check (500💎/day) ──
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const { data: dailyTransfers } = await getSupabase()
            .from('diamond_transactions')
            .select('amount')
            .eq('user_id', userId)
            .in('type', ['diamond_gift_sent'])
            .gte('created_at', dayStart.toISOString());

        const dailyTotal = (dailyTransfers || []).reduce((sum, t) => sum + Math.abs(t.amount), 0);
        if (dailyTotal + amount > DAILY_LIMIT) {
            return res.status(429).json({
                success: false,
                error: `Daily transfer limit reached (${DAILY_LIMIT}💎/day). You've sent ${dailyTotal}💎 today.`
            });
        }

        // ═══ EXECUTE ATOMIC TRANSFER ═══
        // Step 1: Deduct from sender
        const newSenderBalance = (senderProfile.diamonds ?? 0) - amount;
        const { error: deductErr } = await getSupabase()
            .from('profiles')
            .update({ diamonds: newSenderBalance, updated_at: now.toISOString() })
            .eq('id', userId)
            .gte('diamonds', amount); // Double-check: only deduct if still has enough

        if (deductErr) {
            console.error('Transfer deduct error:', deductErr);
            return res.status(500).json({ success: false, error: 'Transfer failed — please try again' });
        }

        // Step 2: Credit recipient
        const newRecipientBalance = (recipientProfile.diamonds ?? 0) + amount;
        const { error: creditErr } = await getSupabase()
            .from('profiles')
            .update({ diamonds: newRecipientBalance, updated_at: now.toISOString() })
            .eq('id', recipientId);

        if (creditErr) {
            // ROLLBACK: Re-credit sender
            await getSupabase()
                .from('profiles')
                .update({ diamonds: (senderProfile.diamonds ?? 0), updated_at: now.toISOString() })
                .eq('id', userId);
            console.error('Transfer credit error (rolled back):', creditErr);
            return res.status(500).json({ success: false, error: 'Transfer failed — your diamonds have been restored' });
        }

        // Step 3: Log sender transaction
        const recipientName = recipientProfile.display_name || recipientProfile.username || 'friend';
        await getSupabase()
            .from('diamond_transactions')
            .insert({
                user_id: userId,
                amount: -amount,
                type: 'diamond_gift_sent',
                transaction_type: 'diamond_gift_sent',
                description: `Sent ${amount} diamonds to ${recipientName}`,
                balance_after: newSenderBalance,
                created_at: now.toISOString(),
            });

        // Step 4: Log recipient transaction
        const senderName = senderProfile.display_name || senderProfile.username || 'friend';
        await getSupabase()
            .from('diamond_transactions')
            .insert({
                user_id: recipientId,
                amount: amount,
                type: 'diamond_gift_received',
                transaction_type: 'diamond_gift_received',
                description: `Received ${amount} diamonds from ${senderName}`,
                balance_after: newRecipientBalance,
                created_at: now.toISOString(),
            });

        return res.status(200).json({
            success: true,
            transferred: amount,
            newBalance: newSenderBalance,
        });

    } catch (err) {
        console.error('[Diamond Transfer Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
}
