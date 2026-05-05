/**
 * POST /api/live/gift
 * Send a diamond gift to a live broadcaster.
 *
 * Flow: atomic deduct from sender → atomic credit to receiver → record gift → broadcast to viewers → notify
 *
 * Uses deduct_diamonds (now with FOR UPDATE row lock) and add_diamonds_to_balance RPCs
 * for fully atomic balance operations.
 */
import { randomUUID } from 'crypto';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { stream_id, receiver_id, amount, message } = req.body;
    if (!stream_id || !receiver_id || !amount || amount < 1) {
        return res.status(400).json({ error: 'stream_id, receiver_id, and amount required' });
    }
    if (amount > 10000) {
        return res.status(400).json({ error: 'Maximum gift is 10,000 diamonds' });
    }
    if (receiver_id === user.id) {
        return res.status(400).json({ error: 'Cannot gift yourself' });
    }

    // Per-gift UUID generated up front. Used as the reference_id for both the
    // credit and (if needed) the compensating refund. Previously this used
    // stream_id as reference_id, which collided across multiple gifts to the
    // same stream — the second add_diamonds_to_balance call hit the unique
    // index, returned {success:false, duplicate:true}, and the receiver got
    // NO diamonds while the sender stayed deducted.
    const giftId = randomUUID();

    try {
        // Get sender info
        const { data: senderProfile } = await supabase
            .from('profiles')
            .select('username, full_name, avatar_url')
            .eq('id', user.id)
            .maybeSingle();

        const senderName = senderProfile?.username || senderProfile?.full_name || 'A fan';

        // ATOMIC deduct from sender (uses FOR UPDATE row lock to prevent overdraft)
        const { data: deductResult, error: deductErr } = await supabase.rpc('deduct_diamonds', {
            p_user_id: user.id,
            p_amount: amount,
            p_description: `Live gift to broadcaster`,
            p_transaction_type: 'live_gift_sent',
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
                    p_amount: amount,
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
            p_amount: amount,
            p_type: 'live_gift_received',
            p_description: `${senderName} sent ${amount} diamonds during your live`,
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
            amount,
            message: message || null,
        }).select().maybeSingle();

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
                amount,
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
            message: `${senderName} sent you ${amount} diamonds during your live stream!`,
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
