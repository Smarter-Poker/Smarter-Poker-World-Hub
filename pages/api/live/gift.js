/**
 * POST /api/live/gift
 * Send a diamond gift to a live broadcaster.
 * Deducts from sender, credits to receiver, records transaction.
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
    if (receiver_id === user.id) {
        return res.status(400).json({ error: 'Cannot gift yourself' });
    }

    try {
        // Check sender balance
        const { data: senderBalance } = await supabase
            .from('diamond_balances')
            .select('balance')
            .eq('user_id', user.id)
            .maybeSingle();

        const currentBalance = senderBalance?.balance || 0;
        if (currentBalance < amount) {
            return res.status(400).json({ error: 'Insufficient diamonds', balance: currentBalance });
        }

        // Deduct from sender
        await supabase.from('diamond_balances').upsert({
            user_id: user.id,
            balance: currentBalance - amount,
        });

        // Credit to receiver
        const { data: receiverBalance } = await supabase
            .from('diamond_balances')
            .select('balance')
            .eq('user_id', receiver_id)
            .maybeSingle();

        await supabase.from('diamond_balances').upsert({
            user_id: receiver_id,
            balance: (receiverBalance?.balance || 0) + amount,
        });

        // Record the gift
        const { data: gift } = await supabase.from('live_gifts').insert({
            stream_id,
            sender_id: user.id,
            receiver_id,
            amount,
            message,
        }).select().maybeSingle();

        // Record transactions for both parties
        const { data: senderProfile } = await supabase
            .from('profiles')
            .select('username, full_name')
            .eq('id', user.id)
            .maybeSingle();

        const senderName = senderProfile?.username || senderProfile?.full_name || 'A fan';

        await supabase.from('diamond_transactions').insert([
            {
                user_id: user.id,
                type: 'spend',
                transaction_type: 'live_gift_sent',
                amount: -amount,
                balance_after: currentBalance - amount,
                description: `Live gift to broadcaster`,
                reference_id: stream_id,
            },
            {
                user_id: receiver_id,
                type: 'earn',
                transaction_type: 'live_gift_received',
                amount,
                balance_after: (receiverBalance?.balance || 0) + amount,
                description: `${senderName} sent ${amount} 💎 during your live`,
                reference_id: stream_id,
            },
        ]);

        // Send notification to broadcaster
        await supabase.from('notifications').insert({
            user_id: receiver_id,
            type: 'live_gift',
            title: 'Diamond Gift Received',
            message: `${senderName} sent you ${amount} 💎 during your live stream!`,
            actor_id: user.id,
            link: `/hub/social-media?stream=${stream_id}`,
            read: false,
        });

        return res.json({ success: true, gift, newBalance: currentBalance - amount });
    } catch (err) {
        console.warn('[live/gift] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
