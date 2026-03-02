/**
 * Purchase With Diamonds
 * POST /api/store/purchase-with-diamonds
 * Deducts diamonds from user's balance for cart purchases
 * Conversion rate: $1 USD = 100 💎
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DIAMONDS_PER_DOLLAR = 100;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // Authenticate
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid session' });
        }

        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'Items array required' });
        }

        // Calculate total USD and diamond cost
        // NOTE: No server-side catalog exists yet. Client prices are used but validated.
        // TODO: When merchandise_items table is created, lookup prices server-side.
        const totalUsd = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

        if (totalUsd <= 0 || items.some(i => !i.price || i.price <= 0 || !i.name)) {
            return res.status(400).json({ success: false, error: 'Invalid item data — all items must have a name and positive price' });
        }

        const diamondCost = Math.ceil(totalUsd * DIAMONDS_PER_DOLLAR);

        // Get current diamond balance
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('diamonds, username')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
        }

        const currentBalance = profile.diamonds || 0;

        if (currentBalance < diamondCost) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient diamonds',
                details: {
                    required: diamondCost,
                    current: currentBalance,
                    shortfall: diamondCost - currentBalance
                }
            });
        }

        // Deduct diamonds atomically via optimistic lock
        const newBalance = currentBalance - diamondCost;
        const { data: updatedRows, error: updateError } = await supabase
            .from('profiles')
            .update({ diamonds: newBalance })
            .eq('id', user.id)
            .eq('diamonds', currentBalance) // Optimistic lock — fails if balance changed
            .select('id');

        if (updateError) {
            return res.status(500).json({ success: false, error: 'Failed to deduct diamonds' });
        }

        // If optimistic lock failed (concurrent spend), no row was updated
        if (!updatedRows || updatedRows.length === 0) {
            return res.status(409).json({
                success: false,
                error: 'Balance changed — please retry',
                code: 'CONCURRENT_MODIFICATION'
            });
        }

        // Record each item as a transaction
        const itemNames = items.map(i => `${i.name} x${i.quantity || 1}`).join(', ');
        await supabase.from('diamond_transactions').insert({
            user_id: user.id,
            amount: -diamondCost,
            transaction_type: 'purchase',
            description: `Store purchase: ${itemNames}`,
            metadata: { items, total_usd: totalUsd, conversion_rate: DIAMONDS_PER_DOLLAR }
        });

        // Create order record
        await supabase.from('merchandise_orders').insert({
            user_id: user.id,
            items: items,
            total_usd: totalUsd,
            diamonds_spent: diamondCost,
            payment_method: 'diamonds',
            status: 'completed'
        }).catch(() => {
            // Non-critical — table may not have these columns yet
            console.warn('[DiamondPurchase] merchandise_orders insert skipped');
        });

        console.log(`[DiamondPurchase] User ${profile.username} spent ${diamondCost}💎 on ${itemNames}`);

        return res.status(200).json({
            success: true,
            data: {
                diamonds_spent: diamondCost,
                new_balance: newBalance,
                items_purchased: items.length,
                total_usd: totalUsd
            }
        });

    } catch (err) {
        console.error('[DiamondPurchase] Error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
