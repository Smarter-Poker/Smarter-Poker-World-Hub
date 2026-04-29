/**
 * POST /api/live/gift
 * Send a diamond gift to a live broadcaster.
 *
 * BUG FIXED: Was using non-existent `diamond_balances` table.
 * Platform uses profiles.diamonds (authoritative) with RPCs:
 *   - deduct_diamonds(p_user_id, p_amount, p_description, p_transaction_type)
 *   - add_diamonds_to_balance(p_user_id, p_amount, p_type, p_description, p_reference_id)
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
        // Check balance from profiles.diamonds (authoritative source)
        const { data: senderProfile } = await supabase
            .from('profiles')
            .select('diamonds, username, full_name')
            .eq('id', user.id)
            .maybeSingle();

        const currentBalance = senderProfile?.diamonds || 0;
        const senderName = senderProfile?.username || senderProfile?.full_name || 'A fan';

        if (currentBalance < amount) {
            return res.status(400).json({ error: 'Insufficient diamonds', balance: currentBalance });
        }

        // Atomically deduct from sender
        const { error: deductErr } = await supabase.rpc('deduct_diamonds', {
            p_user_id: user.id,
            p_amount: amount,
            p_description: `Live gift to broadcaster`,
            p_transaction_type: 'live_gift_sent',
        });
        if (deductErr) throw new Error(`Deduction failed: ${deductErr.message}`);

        // Credit to receiver
        const { error: creditErr } = await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: receiver_id,
            p_amount: amount,
            p_type: 'live_gift_received',
            p_description: `${senderName} sent ${amount} 💎 during your live`,
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

        // Get updated sender balance
        const { data: updatedProfile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', user.id)
            .maybeSingle();

        // Notify broadcaster (non-fatal)
        await supabase.from('notifications').insert({
            user_id: receiver_id,
            type: 'live_gift',
            title: 'Diamond Gift Received',
            message: `${senderName} sent you ${amount} 💎 during your live stream!`,
            actor_id: user.id,
            link: `/hub/social-media?stream=${stream_id}`,
            read: false,
        }).catch(() => {});

        return res.json({
            success: true,
            gift,
            newBalance: updatedProfile?.diamonds ?? (currentBalance - amount),
        });
    } catch (err) {
        console.warn('[live/gift] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
