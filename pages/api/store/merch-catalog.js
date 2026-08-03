/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GET /api/store/merch-catalog
 *  PUBLIC. Returns the ACTIVE merchandise catalog with size/colour variants and
 *  per-variant stock.
 *
 *  This is the read side of the same `merchandise_items` table that
 *  pages/api/store/purchase-with-diamonds.js and create-checkout-session.js use
 *  as their server-side price oracle (see
 *  supabase/migrations/20260803120000_merch_catalog_and_variants.sql).
 *
 *  PRICE TRUST MODEL
 *    Prices here are FOR DISPLAY ONLY. Both checkout endpoints re-read
 *    merchandise_items server-side and price the order from the DB, never from
 *    whatever the browser posts back. Nothing in this file is authoritative and
 *    nothing in this file accepts a price.
 *
 *  ECONOMY: 1 diamond = $0.01 (src/config/diamondRewards.js). price_diamonds is
 *  stored per row; the 100-per-dollar conversion here is only a fallback for a
 *  row whose diamond price was never populated.
 *
 *  Query params (all optional):
 *    category      — filter to one category slug (e.g. 'apparel')
 *    in_stock_only — '1' to drop sold-out items. Default returns everything and
 *                    flags each item/variant with in_stock so the UI can grey
 *                    out sold-out sizes instead of silently losing them.
 *
 *  Response: { success, data: { items: [...], count, currency, catalog_available } }
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('[merch-catalog] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key; reads rely on the public RLS policy');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const DIAMONDS_PER_DOLLAR = 100;
const MAX_ITEMS = 200;

/**
 * The catalog migration may not be applied yet. A missing table must degrade to
 * an empty-but-successful catalog (HTTP 200) rather than a 500 that blanks the
 * store page — same philosophy as src/lib/rewards/awardGuard.js.
 */
function isMissingTable(err) {
    if (!err) return false;
    const code = String(err.code || '');
    const msg = String(err.message || '').toLowerCase();
    return code === '42P01'
        || code === 'PGRST205'
        || code === 'PGRST106'
        || msg.includes('does not exist')
        || msg.includes('could not find the table');
}

function toNumber(v) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

function diamondsFor(priceDiamonds, priceUsd) {
    const d = toNumber(priceDiamonds);
    if (d !== null && d > 0) return Math.round(d);
    const usd = toNumber(priceUsd);
    if (usd !== null && usd > 0) return Math.ceil(usd * DIAMONDS_PER_DOLLAR);
    return null;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!applyRateLimit(req, res, LIMITS.read)) return;

        const supabase = getSupabase();

        // ── Items ────────────────────────────────────────────────────────────
        // is_active is filtered EXPLICITLY: the service-role key bypasses RLS,
        // so the public-read policy cannot be relied on to hide draft items.
        let itemQuery = supabase
            .from('merchandise_items')
            .select('id, name, description, category, image_url, price_usd, price_diamonds, sort_order, stock, has_variants, metadata')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true })
            .limit(MAX_ITEMS);

        const category = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 64) : '';
        if (category) itemQuery = itemQuery.eq('category', category);

        const { data: itemRows, error: itemErr } = await itemQuery;

        if (itemErr) {
            if (isMissingTable(itemErr)) {
                console.warn('[merch-catalog] merchandise_items missing — migration 20260803120000 not applied yet');
                res.setHeader('Cache-Control', 'no-store');
                return res.status(200).json({
                    success: true,
                    data: { items: [], count: 0, currency: 'usd', catalog_available: false }
                });
            }
            console.warn('[merch-catalog] item fetch failed:', itemErr.message);
            return res.status(500).json({ success: false, error: 'Failed to load catalog' });
        }

        const items = Array.isArray(itemRows) ? itemRows : [];

        // ── Variants ─────────────────────────────────────────────────────────
        const variantsByItem = {};
        let variantsAvailable = true;
        if (items.length > 0) {
            const { data: variantRows, error: variantErr } = await supabase
                .from('merchandise_item_variants')
                .select('id, item_id, sku, size, color, price_usd, price_diamonds, stock, sort_order')
                .in('item_id', items.map(i => i.id))
                .eq('is_active', true)
                .order('sort_order', { ascending: true })
                .order('sku', { ascending: true });

            if (variantErr) {
                if (!isMissingTable(variantErr)) {
                    console.warn('[merch-catalog] variant fetch failed:', variantErr.message);
                }
                // A variant outage must not take the whole store down — items
                // still render, they just render without a size picker.
                variantsAvailable = false;
            } else {
                (variantRows || []).forEach(v => {
                    if (!variantsByItem[v.item_id]) variantsByItem[v.item_id] = [];
                    variantsByItem[v.item_id].push(v);
                });
            }
        }

        // ── Shape ────────────────────────────────────────────────────────────
        const payload = items.map(item => {
            const basePriceUsd = toNumber(item.price_usd);
            const basePriceDiamonds = diamondsFor(item.price_diamonds, item.price_usd);

            const variants = (variantsByItem[item.id] || []).map(v => {
                // NULL variant price = inherit the parent item price.
                const vUsd = toNumber(v.price_usd);
                const priceUsd = vUsd !== null && vUsd > 0 ? vUsd : basePriceUsd;
                const priceDiamonds = diamondsFor(v.price_diamonds, priceUsd);
                const stock = Number.isFinite(Number(v.stock)) ? Number(v.stock) : 0;
                return {
                    id: v.id,
                    sku: v.sku,
                    size: v.size || null,
                    color: v.color || null,
                    price_usd: priceUsd,
                    price_diamonds: priceDiamonds,
                    stock,
                    in_stock: stock > 0
                };
            });

            // Item-level stock: NULL means unlimited / made to order.
            const itemStock = item.stock === null || item.stock === undefined
                ? null
                : Number(item.stock);
            const variantStock = variants.reduce((sum, v) => sum + v.stock, 0);
            // If the variant table could not be read, do NOT infer "no variants,
            // zero stock" — that would render every apparel row as sold out
            // during a partial outage. Fall back to the item's own columns.
            const hasVariants = variantsAvailable ? variants.length > 0 : !!item.has_variants;
            const effectiveStock = (variantsAvailable && hasVariants) ? variantStock : itemStock;
            const effectiveInStock = (variantsAvailable && hasVariants)
                ? variantStock > 0
                : (itemStock === null || itemStock > 0);

            return {
                id: item.id,
                name: item.name,
                description: item.description || null,
                category: item.category || null,
                image_url: item.image_url || null,
                // display prices — authoritative pricing happens at checkout
                price_usd: basePriceUsd,
                price_diamonds: basePriceDiamonds,
                sort_order: item.sort_order ?? 0,
                has_variants: hasVariants,
                variants,
                stock: effectiveStock,
                in_stock: effectiveInStock,
                metadata: item.metadata || {}
            };
        });

        // Sold-out items are RETURNED BY DEFAULT and simply flagged in_stock:false
        // so the storefront can grey them out. ?in_stock_only=1 drops them.
        const inStockOnly = req.query.in_stock_only === '1' || req.query.in_stock_only === 'true';
        const visible = inStockOnly ? payload.filter(i => i.in_stock) : payload;

        // Catalog is public and slow-moving — safe to cache at the edge.
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
        res.setHeader('Vary', 'Accept-Encoding');

        return res.status(200).json({
            success: true,
            data: {
                items: visible,
                count: visible.length,
                currency: 'usd',
                diamonds_per_dollar: DIAMONDS_PER_DOLLAR,
                catalog_available: true,
                variants_available: variantsAvailable
            }
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[merch-catalog] Error:', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
