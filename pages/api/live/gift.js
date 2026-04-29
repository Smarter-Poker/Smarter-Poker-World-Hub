/**
 * POST /api/live/gift
 * Send a diamond gift to a live broadcaster.
 *
 * Flow: atomic deduct from sender → atomic credit to receiver → record gift → broadcast to viewers → notify
 *
 * Uses deduct_diamonds (now with FOR UPDATE row lock) and add_diamonds_to_balance RPCs
 * for fully atomic balance operations.
 */
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

        // ATOMIC credit to receiver
        const { data: creditResult, error: creditErr } = await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: receiver_id,
            p_amount: amount,
            p_type: 'live_gift_received',
            p_description: `${senderName} sent ${amount} diamonds during your live`,
            p_reference_id: stream_id,
        });
        if (creditErr) throw new Error(`Credit failed: ${creditErr.message}`);

        // Record the gift
        const { data: gift } = await supabase.from('live_gifts').insert({
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
        await supabase.from('notifications').insert({
            user_id: receiver_id,
            type: 'live_gift',
            title: 'Diamond Gift Received',
            message: `${senderName} sent you ${amount} diamonds during your live stream!`,
            actor_id: user.id,
            link: `/hub/lives?id=${stream_id}`,
            read: false,
        }).catch(() => {});

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
