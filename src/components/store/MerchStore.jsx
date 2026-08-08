/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MerchStore — official merchandise storefront (Diamond Store → Merch tab)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Catalog source
 *   1. GET /api/store/merch-catalog  (active items + variants + stock)
 *   2. Falls back to the static MERCHANDISE array in src/data/diamondStoreData
 *      when that endpoint is missing / errors, so the tab is never empty.
 *
 * Checkout
 *   • Card     → POST /api/store/create-checkout-session  { type: 'merchandise' }
 *   • Diamonds → POST /api/store/purchase-with-diamonds
 *
 *   Both endpoints resolve the real price SERVER-SIDE from merchandise_items
 *   whenever the line item carries a catalog `id`, so this component sends the
 *   catalog id + quantity and never a price for catalogued goods. The static
 *   fallback rows have no database row (their ids are slugs, not uuids), so
 *   they are sent as name + price and are priced by the server's sanity band.
 *
 * Visual language matches src/components/diamond-store/diamondStoreStyles.js —
 * inline style objects, same dark/cyan palette. No CSS modules.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Gem, Shirt, Package, CreditCard, ShoppingBag,
    AlertTriangle, Minus, Plus, RefreshCw,
} from 'lucide-react';

import styles from '../diamond-store/diamondStoreStyles';
import { MERCHANDISE } from '../../data/diamondStoreData';
import { getAccessToken } from '../../lib/authUtils';
import { showStoreToast } from './StoreToast';
import useDiamondBalance from '../../hooks/useDiamondBalance';
import { broadcastSync } from '../../lib/broadcastSync';
import { busEmit } from '../../engine/EventBus';

// ── Economy constants (mirror of the server) ──────────────────────────────
// 1 diamond = $0.01 → 100 diamonds per USD. purchase-with-diamonds.js uses the
// same rate and Math.ceil() when an item has no explicit price_diamonds.
const DIAMONDS_PER_DOLLAR = 100;
// Both money endpoints clamp quantity to 1..10 per line item.
const MAX_QTY = 10;

const CATALOG_URL = '/api/store/merch-catalog';

// ── Palette (same values the styles module uses) ──────────────────────────
const CYAN = '#00D4FF';
const TEXT = '#E4E6EB';
const MUTED = 'rgba(255, 255, 255, 0.55)';
const GREEN = '#00ff88';
const RED = '#ff5f6d';
const CARD_BG = 'rgba(255, 255, 255, 0.05)';
const CARD_BORDER = '1px solid rgba(255, 255, 255, 0.15)';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;

function firstFiniteNumber(candidates) {
    for (const c of candidates) {
        if (c === null || c === undefined || c === '') continue;
        const n = Number(c);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function firstString(candidates) {
    for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return null;
}

function firstBoolean(candidates) {
    for (const c of candidates) {
        if (typeof c === 'boolean') return c;
    }
    return null;
}

// A catalog id is any non-empty string, because merchandise_items.id is TEXT
// and production rows are slugs — 'hoodie-neural', 'card-protector-gold',
// 'chip-set-500'.
//
// SECURITY (2026-08-06): this used to require a UUID, on the assumption that
// slugs were only ever static fallback rows. The assumption was inverted — the
// real catalog is slugs, so isCatalogId() returned false for EVERY product,
// `catalogId` was null on every line item, and buildLineItem() sent
// { name, price, quantity } with no id. Both checkout endpoints then priced
// from that client-supplied `price`, so a $199.99 chip set could be bought for
// $0.50, or 19,999 ◆ for 50 ◆. The server-side price oracle was live and
// correct the whole time; nothing ever reached it from this component.
// pages/hub/diamond-store/cart.js passed the slug through unmodified and was
// therefore repriced correctly, which is why the two storefronts disagreed.
const isCatalogId = (v) => typeof v === 'string' && v.trim().length > 0;

// ── Normalisation ─────────────────────────────────────────────────────────
// The catalog endpoint is owned by another agent and is not deployed yet, so
// every field is read defensively across the plausible column names rather
// than assuming one exact shape.

function stockOf(raw) {
    const explicit = firstFiniteNumber([
        raw?.stock, raw?.stock_quantity, raw?.stock_count,
        raw?.inventory, raw?.inventory_count, raw?.quantity_available,
    ]);
    const flag = firstBoolean([raw?.in_stock, raw?.is_in_stock, raw?.available, raw?.is_available]);
    if (explicit !== null) return { stock: explicit, inStock: explicit > 0 };
    if (flag !== null) return { stock: null, inStock: flag };
    return { stock: null, inStock: true }; // unknown stock → assume sellable
}

function normalizeVariant(raw, index) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string' || typeof raw === 'number') {
        return { key: `v${index}-${raw}`, id: null, label: String(raw), stock: null, inStock: true };
    }
    const label = firstString([
        raw.label, raw.name, raw.size, raw.value, raw.variant, raw.option, raw.title,
    ]) || `Option ${index + 1}`;
    const id = firstString([raw.id, raw.variant_id, raw.sku]);
    const { stock, inStock } = stockOf(raw);
    return { key: id || `v${index}-${label}`, id, label, stock, inStock };
}

function normalizeProduct(raw, index, source) {
    if (!raw || typeof raw !== 'object') return null;

    const name = firstString([raw.name, raw.title, raw.product_name]);
    if (!name) return null;

    const rawId = firstString([raw.id, raw.item_id, raw.product_id]);
    const priceUsd = firstFiniteNumber([raw.price_usd, raw.priceUsd, raw.price, raw.usd_price]);
    if (priceUsd === null || priceUsd <= 0) return null;

    const explicitDiamonds = firstFiniteNumber([raw.price_diamonds, raw.priceDiamonds, raw.diamond_price]);
    const priceDiamonds = explicitDiamonds !== null && explicitDiamonds > 0
        ? Math.round(explicitDiamonds)
        : Math.ceil(priceUsd * DIAMONDS_PER_DOLLAR);

    const rawVariants = Array.isArray(raw.variants) ? raw.variants
        : Array.isArray(raw.options) ? raw.options
        : Array.isArray(raw.sizes) ? raw.sizes
        : [];
    const variants = rawVariants.map(normalizeVariant).filter(Boolean);

    const own = stockOf(raw);
    // With variants, the product is sellable while ANY variant has stock.
    const inStock = variants.length > 0
        ? (own.inStock && variants.some(v => v.inStock))
        : own.inStock;

    return {
        key: rawId || `${source}-${index}-${name}`,
        // Only a uuid is safe to send as a merchandise_items id.
        catalogId: isCatalogId(rawId) ? rawId.trim() : null,
        source,
        name,
        description: firstString([raw.description, raw.subtitle, raw.blurb]) || '',
        image: firstString([raw.image_url, raw.imageUrl, raw.image, raw.thumbnail]),
        category: (firstString([raw.category, raw.product_type, raw.collection]) || 'merch').toLowerCase(),
        priceUsd,
        priceDiamonds,
        stock: own.stock,
        inStock,
        variants,
    };
}

// Accepts { data: { items } } / { data: [...] } / { items } / { merchandise } / [...]
function rowsFromCatalogBody(body) {
    if (Array.isArray(body)) return body;
    if (!body || typeof body !== 'object') return [];
    const candidates = [
        body.items, body.merchandise, body.products, body.data,
        body.data?.items, body.data?.merchandise, body.data?.products,
    ];
    for (const c of candidates) if (Array.isArray(c)) return c;
    return [];
}

const CATEGORY_LABELS = { apparel: 'Apparel', accessories: 'Accessories', merch: 'More Gear' };
const categoryLabel = (key) => CATEGORY_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1));

// ── Error extraction ──────────────────────────────────────────────────────
// create-checkout-session answers with { error: { code, message } };
// purchase-with-diamonds answers with { error: 'string' } (+ details);
// the shared rate limiter answers with { error, message, retryAfter }.
function errorCodeOf(data) {
    return (typeof data?.error === 'object' ? data.error?.code : data?.code) || null;
}

function errorMessageOf(data, status) {
    const raw = data?.error;
    if (typeof raw === 'object' && raw) {
        if (raw.message) return String(raw.message);
        if (raw.code) return String(raw.code);
    }
    if (typeof raw === 'string' && raw) {
        // The diamond endpoint puts the short reason in `error` and the long
        // human explanation in `message` (email-verification gate, rate limit).
        return data?.message && data.message !== raw ? `${raw} — ${data.message}` : raw;
    }
    if (typeof data?.message === 'string' && data.message) return data.message;
    if (status === 401) return 'Your session expired. Please sign in again.';
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (status === 503) return 'Payments are temporarily unavailable. Please try again later.';
    return `Request failed (${status})`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Product card
// ═══════════════════════════════════════════════════════════════════════════
function MerchProductCard({ product, balance, hasUser, busyKey, onBuyCard, onBuyDiamonds }) {
    const [variantKey, setVariantKey] = useState(() => {
        const first = product.variants.find(v => v.inStock) || product.variants[0];
        return first ? first.key : null;
    });
    const [qty, setQty] = useState(1);
    const [imageFailed, setImageFailed] = useState(false);

    const variant = product.variants.find(v => v.key === variantKey) || null;
    const needsVariant = product.variants.length > 0;
    const variantOutOfStock = needsVariant && (!variant || !variant.inStock);
    const soldOut = !product.inStock || variantOutOfStock;

    // Respect a known per-variant / per-product stock level as well as the
    // server's hard 1..10 clamp.
    const stockCeiling = firstFiniteNumber([variant?.stock, product.stock]);
    const maxQty = Math.max(1, Math.min(MAX_QTY, stockCeiling === null ? MAX_QTY : stockCeiling));
    const clampedQty = Math.min(qty, maxQty);

    const diamondCost = product.priceDiamonds * clampedQty;
    const usdCost = product.priceUsd * clampedQty;

    const busy = busyKey !== null;
    const thisBusy = busyKey === product.key;
    const shortBy = Math.max(0, diamondCost - Number(balance || 0));
    const cannotAfford = hasUser && shortBy > 0;

    const diamondDisabled = soldOut || busy || cannotAfford;
    const diamondReason = soldOut
        ? 'Sold out'
        : cannotAfford
            ? `You need ${fmt(shortBy)} more diamonds`
            : null;

    const Icon = product.category === 'apparel' ? Shirt : Package;

    return (
        <div style={{
            background: CARD_BG,
            border: soldOut ? '1px solid rgba(255, 95, 109, 0.35)' : CARD_BORDER,
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            opacity: soldOut ? 0.72 : 1,
        }}>
            {/* Image / placeholder */}
            <div style={{
                position: 'relative',
                height: 140,
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(138, 43, 226, 0.1))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {product.image && !imageFailed ? (
                    <img
                        src={product.image}
                        alt={product.name}
                        onError={() => setImageFailed(true)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                ) : (
                    <Icon size={44} color="#a8b2d1" />
                )}
                {soldOut && (
                    <div style={{
                        position: 'absolute', top: 10, left: 10,
                        background: 'rgba(255, 95, 109, 0.9)', color: '#12151c',
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.6px',
                        padding: '4px 9px', borderRadius: 8, textTransform: 'uppercase',
                    }}>Sold Out</div>
                )}
                {!soldOut && product.stock !== null && product.stock <= 5 && (
                    <div style={{
                        position: 'absolute', top: 10, left: 10,
                        background: 'rgba(255, 215, 0, 0.9)', color: '#0a1628',
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.6px',
                        padding: '4px 9px', borderRadius: 8, textTransform: 'uppercase',
                    }}>Only {fmt(product.stock)} left</div>
                )}
            </div>

            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{product.name}</div>
                    {product.description && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                            {product.description}
                        </div>
                    )}
                </div>

                {/* Dual price — USD and diamonds */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: CYAN }}>{usd(product.priceUsd)}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>or</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 700, color: TEXT }}>
                        <Gem size={14} color={CYAN} /> {fmt(product.priceDiamonds)}
                    </span>
                </div>

                {/* Variant picker */}
                {needsVariant && (
                    <div>
                        <div style={{ fontSize: 11, color: MUTED, marginBottom: 6, fontWeight: 600, letterSpacing: '0.4px' }}>
                            SIZE / OPTION
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {product.variants.map(v => {
                                const active = v.key === variantKey;
                                return (
                                    <button
                                        key={v.key}
                                        type="button"
                                        onClick={() => { setVariantKey(v.key); setQty(1); }}
                                        disabled={!v.inStock}
                                        title={v.inStock ? v.label : `${v.label} — sold out`}
                                        aria-pressed={active}
                                        style={{
                                            padding: '6px 11px',
                                            borderRadius: 8,
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: v.inStock ? 'pointer' : 'not-allowed',
                                            color: !v.inStock ? 'rgba(255,255,255,0.28)' : active ? '#0a1628' : TEXT,
                                            background: active ? CYAN : 'rgba(255,255,255,0.06)',
                                            border: active ? `1px solid ${CYAN}` : '1px solid rgba(255,255,255,0.15)',
                                            textDecoration: v.inStock ? 'none' : 'line-through',
                                        }}
                                    >
                                        {v.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Quantity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: '0.4px' }}>QTY</span>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center',
                        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, overflow: 'hidden',
                    }}>
                        <button
                            type="button"
                            aria-label={`Decrease quantity of ${product.name}`}
                            onClick={() => setQty(q => Math.max(1, Math.min(q, maxQty) - 1))}
                            disabled={soldOut || clampedQty <= 1}
                            style={{
                                background: 'rgba(255,255,255,0.05)', border: 'none', color: TEXT,
                                padding: '6px 9px', cursor: clampedQty <= 1 ? 'not-allowed' : 'pointer',
                            }}
                        ><Minus size={12} /></button>
                        <span style={{ minWidth: 28, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                            {clampedQty}
                        </span>
                        <button
                            type="button"
                            aria-label={`Increase quantity of ${product.name}`}
                            onClick={() => setQty(q => Math.min(maxQty, Math.min(q, maxQty) + 1))}
                            disabled={soldOut || clampedQty >= maxQty}
                            style={{
                                background: 'rgba(255,255,255,0.05)', border: 'none', color: TEXT,
                                padding: '6px 9px', cursor: clampedQty >= maxQty ? 'not-allowed' : 'pointer',
                            }}
                        ><Plus size={12} /></button>
                    </div>
                    {clampedQty > 1 && (
                        <span style={{ fontSize: 11, color: MUTED }}>
                            {usd(usdCost)} / {fmt(diamondCost)} <Gem size={10} color={CYAN} style={{ verticalAlign: 'middle' }} />
                        </span>
                    )}
                </div>

                {/* Purchase buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                    <button
                        type="button"
                        onClick={() => onBuyCard(product, variant, clampedQty)}
                        disabled={soldOut || busy}
                        title={soldOut ? 'Sold out' : 'Pay by card via Stripe Checkout'}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none',
                            fontSize: 13, fontWeight: 800, letterSpacing: '0.3px',
                            color: soldOut || busy ? 'rgba(255,255,255,0.4)' : '#0a1628',
                            background: soldOut || busy
                                ? 'rgba(255,255,255,0.08)'
                                : 'linear-gradient(135deg, #00D4FF, #8A2BE2)',
                            cursor: soldOut || busy ? 'not-allowed' : 'pointer',
                        }}
                    >
                        <CreditCard size={15} />
                        {thisBusy ? 'Opening checkout…' : 'Buy With Card'}
                    </button>

                    <button
                        type="button"
                        onClick={() => onBuyDiamonds(product, variant, clampedQty)}
                        disabled={diamondDisabled}
                        title={diamondReason || `Pay ${fmt(diamondCost)} diamonds`}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            width: '100%', padding: '10px 12px', borderRadius: 10,
                            fontSize: 13, fontWeight: 800, letterSpacing: '0.3px',
                            color: diamondDisabled ? 'rgba(255,255,255,0.4)' : CYAN,
                            background: 'rgba(0, 212, 255, 0.1)',
                            border: `1px solid ${diamondDisabled ? 'rgba(255,255,255,0.12)' : 'rgba(0, 212, 255, 0.45)'}`,
                            cursor: diamondDisabled ? 'not-allowed' : 'pointer',
                        }}
                    >
                        <Gem size={15} />
                        {thisBusy ? 'Processing…' : `Pay With Diamonds — ${fmt(diamondCost)}`}
                    </button>

                    {/* Honest, specific reason instead of a silently dead button */}
                    {diamondReason && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 11, color: cannotAfford ? '#FFD700' : RED, fontWeight: 600,
                        }}>
                            <AlertTriangle size={12} /> {diamondReason}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Storefront
// ═══════════════════════════════════════════════════════════════════════════
export default function MerchStore({ user = null }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [usingFallback, setUsingFallback] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [busyKey, setBusyKey] = useState(null);
    const [reloadToken, setReloadToken] = useState(0);
    const mountedRef = useRef(true);

    const { balance, refreshBalance } = useDiamondBalance(user?.id || null);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // ── Load catalog, fall back to the static lineup ──────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            let rows = [];
            let failure = null;
            try {
                const res = await fetch(CATALOG_URL, { headers: { Accept: 'application/json' } });
                // A not-yet-deployed API route answers 404 with an HTML page —
                // guard the content type before parsing.
                const contentType = res.headers.get('content-type') || '';
                if (!res.ok || !contentType.includes('application/json')) {
                    failure = res.status === 404
                        ? 'Live catalog not available yet'
                        : `Live catalog unavailable (${res.status})`;
                } else {
                    const body = await res.json();
                    rows = rowsFromCatalogBody(body)
                        .map((r, i) => normalizeProduct(r, i, 'catalog'))
                        .filter(Boolean);
                    if (rows.length === 0) failure = 'Live catalog returned no items';
                }
            } catch (err) {
                failure = 'Could not reach the live catalog';
                console.warn('[MerchStore] Catalog fetch failed:', err?.message || err);
            }

            if (cancelled || !mountedRef.current) return;

            if (rows.length > 0) {
                setProducts(rows);
                setUsingFallback(false);
                setLoadError(null);
            } else {
                setProducts(MERCHANDISE.map((r, i) => normalizeProduct(r, i, 'static')).filter(Boolean));
                setUsingFallback(true);
                setLoadError(failure);
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [reloadToken]);

    // ── Group into the page's existing category sections ──────────────────
    const sections = useMemo(() => {
        const order = [];
        const map = new Map();
        for (const p of products) {
            if (!map.has(p.category)) { map.set(p.category, []); order.push(p.category); }
            map.get(p.category).push(p);
        }
        // Keep Apparel / Accessories first, matching the previous layout.
        order.sort((a, b) => {
            const rank = (k) => (k === 'apparel' ? 0 : k === 'accessories' ? 1 : 2);
            return rank(a) - rank(b);
        });
        return order.map(key => ({ key, label: categoryLabel(key), items: map.get(key) }));
    }, [products]);

    // ── Line-item builder shared by both checkout paths ───────────────────
    // `includePrice` exists only for the card endpoint's current validator,
    // which rejects every item without a numeric price even when the item id
    // resolves in merchandise_items (see findings). For catalogued items the
    // server overwrites whatever price is sent with the database price.
    const buildLineItem = useCallback((product, variant, quantity, { includePrice }) => {
        const item = { name: product.name, quantity };
        if (product.catalogId) {
            item.id = product.catalogId;
            if (includePrice) item.price = product.priceUsd;
        } else {
            // No database row → the server prices this from the request within
            // its $0.50–$500 sanity band.
            item.price = product.priceUsd;
        }
        if (variant) {
            item.description = `${product.description ? `${product.description} — ` : ''}Option: ${variant.label}`;
        } else if (product.description) {
            item.description = product.description;
        }
        return item;
    }, []);

    const requireSignedIn = useCallback(() => {
        const token = getAccessToken();
        if (!token || !user?.id) {
            showStoreToast('error', 'Please sign in to buy merch.');
            return null;
        }
        return token;
    }, [user?.id]);

    // ── Card checkout → Stripe ────────────────────────────────────────────
    const handleBuyCard = useCallback(async (product, variant, quantity) => {
        if (busyKey) return;
        const token = requireSignedIn();
        if (!token) return;
        if (product.variants.length > 0 && !variant) {
            showStoreToast('error', 'Please choose a size or option first.');
            return;
        }

        setBusyKey(product.key);
        const post = (includePrice) => fetch('/api/store/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                type: 'merchandise',
                items: [buildLineItem(product, variant, quantity, { includePrice })],
            }),
        });

        try {
            let res = await post(false);
            let data = await res.json().catch(() => null);

            // Compatibility retry: the deployed endpoint still demands a price
            // on every line item. Retry once with the displayed price — for a
            // catalogued item the server ignores it and charges the DB price.
            const code = errorCodeOf(data);
            if (!res.ok && res.status === 400 && product.catalogId
                && (code === 'INVALID_PRICE' || code === 'INVALID_ITEM')) {
                res = await post(true);
                data = await res.json().catch(() => null);
            }

            if (!res.ok || !data?.success) {
                throw new Error(errorMessageOf(data, res.status));
            }
            if (!data.data?.url) {
                throw new Error('Checkout session missing redirect URL');
            }
            // Leave the busy state on through the navigation.
            window.location.href = data.data.url;
        } catch (err) {
            console.warn('[MerchStore] Card checkout failed:', err?.message || err);
            showStoreToast('error', err?.message || 'Could not start checkout. Please try again.');
            if (mountedRef.current) setBusyKey(null);
        }
    }, [busyKey, requireSignedIn, buildLineItem]);

    // ── Diamond checkout ──────────────────────────────────────────────────
    const handleBuyDiamonds = useCallback(async (product, variant, quantity) => {
        if (busyKey) return;
        const token = requireSignedIn();
        if (!token) return;
        if (product.variants.length > 0 && !variant) {
            showStoreToast('error', 'Please choose a size or option first.');
            return;
        }

        const cost = product.priceDiamonds * quantity;
        if (Number(balance || 0) < cost) {
            showStoreToast('error', `Not enough diamonds — ${fmt(cost)} needed, you have ${fmt(balance)}.`);
            return;
        }
        const label = variant ? `${product.name} (${variant.label})` : product.name;
        if (typeof window !== 'undefined'
            && !window.confirm(`Buy ${quantity} × ${label} for ${fmt(cost)} diamonds?`)) {
            return;
        }

        setBusyKey(product.key);
        try {
            const res = await fetch('/api/store/purchase-with-diamonds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                // The diamond endpoint prices catalogued items entirely from
                // merchandise_items, so no price is sent for them.
                body: JSON.stringify({ items: [buildLineItem(product, variant, quantity, { includePrice: false })] }),
            });
            const data = await res.json().catch(() => null);

            if (!res.ok || !data?.success) {
                const details = data?.details;
                if (details && details.required != null && details.current != null) {
                    throw new Error(
                        `Not enough diamonds — ${fmt(details.required)} needed, you have ${fmt(details.current)}`
                        + (details.shortfall != null ? ` (${fmt(details.shortfall)} short).` : '.')
                    );
                }
                throw new Error(errorMessageOf(data, res.status));
            }

            const spent = Number(data.data?.diamonds_spent) || cost;
            showStoreToast('success', `Order placed! ${fmt(spent)} diamonds deducted.`);
            try {
                new Audio('/sounds/purchase-success.mp3').play()
                    .catch(e => console.warn('[MerchStore] Sound blocked:', e?.message || e));
            } catch (e) {
                console.warn('[MerchStore] Sound unavailable:', e?.message || e);
            }

            busEmit.diamondsSpent(spent, 'Merch Store Purchase');
            broadcastSync('smarter_poker_diamond_sync', 'refresh');
            broadcastSync('smarter_poker_chips_sync', 'refresh');
            refreshBalance();
            // Stock may have moved — pull the catalog again.
            if (mountedRef.current) setReloadToken(t => t + 1);
        } catch (err) {
            console.warn('[MerchStore] Diamond purchase failed:', err?.message || err);
            showStoreToast('error', err?.message || 'Diamond purchase failed. Please try again.');
        } finally {
            if (mountedRef.current) setBusyKey(null);
        }
    }, [busyKey, balance, requireSignedIn, buildLineItem, refreshBalance]);

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <>
            <div style={styles.intro}>
                <h2 style={styles.merchTitle}>Official Merch</h2>
                <p style={styles.introText}>
                    Rep The Smarter.Poker Brand At The Tables. Premium Quality Gear For Serious Players.
                    Pay With A Card Or Spend Your Diamonds — 100 Diamonds = $1.00.
                </p>

                {user?.id && (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14,
                        background: 'rgba(0, 212, 255, 0.1)',
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        borderRadius: 20, padding: '8px 16px',
                        fontSize: 13, fontWeight: 700, color: TEXT,
                    }}>
                        <Gem size={15} color={CYAN} />
                        Your Balance: <span style={{ color: CYAN }}>{fmt(balance)}</span>
                    </div>
                )}
            </div>

            {usingFallback && loadError && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    margin: '0 0 24px',
                    padding: '12px 16px', borderRadius: 12,
                    background: 'rgba(255, 215, 0, 0.08)',
                    border: '1px solid rgba(255, 215, 0, 0.35)',
                    color: '#FFD700', fontSize: 12, fontWeight: 600,
                }}>
                    <AlertTriangle size={14} />
                    <span style={{ flex: 1 }}>
                        {loadError} — showing the standard lineup. Stock levels and sizes may be out of date.
                    </span>
                    <button
                        type="button"
                        onClick={() => setReloadToken(t => t + 1)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                            color: TEXT, borderRadius: 8, padding: '5px 10px',
                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                    >
                        <RefreshCw size={12} /> Retry
                    </button>
                </div>
            )}

            {loading && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: MUTED, fontSize: 14 }}>
                    <ShoppingBag size={28} color="#a8b2d1" />
                    <div style={{ marginTop: 10 }}>Loading the merch lineup…</div>
                </div>
            )}

            {!loading && products.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: '48px 20px',
                    background: CARD_BG, border: CARD_BORDER, borderRadius: 12,
                    color: MUTED, fontSize: 14,
                }}>
                    <Package size={28} color="#a8b2d1" />
                    <div style={{ marginTop: 10, fontWeight: 700, color: TEXT }}>No merch available right now</div>
                    <div style={{ marginTop: 6 }}>New gear drops regularly — check back soon.</div>
                </div>
            )}

            {!loading && sections.map(section => (
                <div key={section.key} style={styles.merchSection}>
                    <h3 style={styles.merchCategoryTitle}>{section.label}</h3>
                    <div style={styles.merchGrid}>
                        {section.items.map(product => (
                            <MerchProductCard
                                key={product.key}
                                product={product}
                                balance={balance}
                                hasUser={!!user?.id}
                                busyKey={busyKey}
                                onBuyCard={handleBuyCard}
                                onBuyDiamonds={handleBuyDiamonds}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {!loading && products.length > 0 && (
                <p style={{ ...styles.introText, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                    Card orders ship to the US and Canada and collect your address at checkout.
                    Diamond orders are fulfilled from the address on your profile — contact support if it needs updating.
                </p>
            )}
        </>
    );
}
