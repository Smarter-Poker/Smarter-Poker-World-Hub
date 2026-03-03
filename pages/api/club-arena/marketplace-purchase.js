/**
 * POST /api/club-arena/marketplace-purchase
 * Atomic marketplace item purchase. Deducts chips, records purchase + transaction.
 * Auth: Bearer token (any club member)
 */
import { createClient } from '@supabase/supabase-js';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No auth token' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { clubId, itemId } = req.body;
    if (!clubId || !itemId) return res.status(400).json({ error: 'clubId and itemId required' });

    // Settlement lock check
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    try {
        // Get member
        const { data: member, error: memErr } = await supabaseAdmin
            .from('club_members')
            .select('chip_balance, user_id')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .single();

        if (memErr || !member) return res.status(404).json({ error: 'Not a member' });

        // Get item (scoped to this club)
        const { data: item, error: itemErr } = await supabaseAdmin
            .from('club_shop_items')
            .select('*')
            .eq('id', itemId)
            .eq('club_id', clubId)
            .single();

        if (itemErr || !item) return res.status(404).json({ error: 'Item not found' });
        if (!item.is_active) return res.status(400).json({ error: 'Item not available' });

        const price = item.price || 0;
        const balance = member.chip_balance || 0;

        if (balance < price) {
            return res.status(400).json({
                error: `Insufficient chips. Have ${balance}, need ${price}`,
                available: balance,
                price,
            });
        }

        // Deduct chips atomically
        const { error: deductErr } = await supabaseAdmin.rpc('fn_debit_chips', {
            p_club_id: clubId,
            p_user_id: user.id,
            p_amount: price,
        });

        if (deductErr) {
            if (deductErr.message?.includes('Insufficient')) {
                return res.status(400).json({ error: 'Insufficient chips', available: balance, price });
            }
            throw deductErr;
        }

        // Record purchase
        const { error: purchaseErr } = await supabaseAdmin
            .from('club_shop_purchases')
            .insert({
                club_id: clubId,
                buyer_id: user.id,
                item_id: itemId,
                price_paid: price,
            });

        if (purchaseErr) {
            // Rollback chip deduction atomically
            await supabaseAdmin.rpc('fn_credit_chips', {
                p_club_id: clubId,
                p_user_id: user.id,
                p_amount: price,
            });
            throw purchaseErr;
        }

        // Record transaction
        await supabaseAdmin.from('chip_transactions').insert({
            from_user_id: user.id,
            to_user_id: user.id,
            club_id: clubId,
            transaction_type: 'purchase',
            amount: -price,
            notes: `Shop purchase: ${item.name || item.id}`,
        });

        return res.status(200).json({
            success: true,
            newBalance: balance - price,
            item: { name: item.name, type: item.type },
        });
    } catch (err) {
        console.error('[marketplace-purchase]', err);
        return res.status(500).json({ error: err.message || 'Purchase failed' });
    }
}
