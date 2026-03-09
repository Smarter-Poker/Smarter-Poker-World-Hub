/**
 * Purchase With Diamonds
 * POST /api/store/purchase-with-diamonds
 * Deducts diamonds from user's balance for cart purchases
 * Conversion rate: $1 USD = 100 💎
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DIAMONDS_PER_DOLLAR = 100;

export default async function handler(req, res) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

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

        // SECURITY: Look up server-side prices from merchandise_items catalog.
        // Items with an 'id' field are priced from the database.
        // Items without an ID fall back to client price (sanity-checked).
        const itemIds = items.map(i => i.id).filter(Boolean);
        let catalogPrices = {};
        if (itemIds.length > 0) {
            const { data: catalogItems } = await supabase
                .from('merchandise_items')
                .select('id, name, price_diamonds, price_usd, is_active')
                .in('id', itemIds)
                .eq('is_active', true);
            if (catalogItems) {
                catalogItems.forEach(ci => { catalogPrices[ci.id] = ci; });
            }
            for (const item of items) {
                if (item.id && !catalogPrices[item.id]) {
                    return res.status(400).json({ success: false, error: `Item "${item.name}" is no longer available` });
                }
            }
        }

        const resolvedItems = items.map(item => {
            const catalog = item.id ? catalogPrices[item.id] : null;
            // Use catalog diamond price if set, else convert from USD
            const priceUsd = catalog ? parseFloat(catalog.price_usd) : parseFloat(item.price);
            const diamondPrice = catalog?.price_diamonds ?? null;
            return {
                id: item.id || null,
                name: catalog ? catalog.name : String(item.name || '').slice(0, 200),
                priceUsd,
                diamondPrice,
                quantity: Math.min(Math.max(parseInt(item.quantity) || 1, 1), 10),
            };
        });

        if (resolvedItems.some(i => !i.name || !Number.isFinite(i.priceUsd) || i.priceUsd <= 0)) {
            return res.status(400).json({ success: false, error: 'Invalid item data — all items must have a name and positive price' });
        }

        const totalUsd = resolvedItems.reduce((sum, item) => sum + (item.priceUsd * item.quantity), 0);
        // Diamond cost: use catalog diamond price if available, else convert from USD
        const diamondCost = resolvedItems.reduce((sum, item) => {
            const perUnit = item.diamondPrice !== null ? item.diamondPrice : Math.ceil(item.priceUsd * DIAMONDS_PER_DOLLAR);
            return sum + (perUnit * item.quantity);
        }, 0);

        // Get current diamond balance
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('diamonds, username')
            .eq('id', user.id)
            .maybeSingle();

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

        // Deduct diamonds atomically via audit-safe RPC
        const itemNames = items.map(i => `${i.name} x${i.quantity || 1}`).join(', ');
        const { error: deductError } = await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: user.id,
            p_amount: -diamondCost,
            p_type: 'purchase',
            p_description: `Store purchase: ${itemNames}`,
            p_reference_id: null
        });

        if (deductError) {
            return res.status(500).json({ success: false, error: 'Failed to deduct diamonds' });
        }

        const newBalance = currentBalance - diamondCost;

        // Create order record
        await supabase.from('merchandise_orders').insert({
            user_id: user.id,
            items: resolvedItems,
            total_usd: totalUsd,
            diamonds_spent: diamondCost,
            payment_method: 'diamonds',
            status: 'completed'
        }).catch(() => {
            // Non-critical — table may not have these columns yet
            console.error('[DiamondPurchase] merchandise_orders insert skipped');
        });


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
