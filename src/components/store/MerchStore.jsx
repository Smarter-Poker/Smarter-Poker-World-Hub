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
  Gem,
  Shirt,
  Package,
  CreditCard,
  AlertTriangle,
  Minus,
  Plus,
  RefreshCw,
  Heart,
} from 'lucide-react';

import styles from '../diamond-store/diamondStoreStyles';
import { MERCHANDISE } from '../../data/diamondStoreData';
import { getAccessToken } from '../../lib/authUtils';
import { showStoreToast } from './StoreToast';
import useDiamondBalance from '../../hooks/useDiamondBalance';
import { broadcastSync } from '../../lib/broadcastSync';
import { busEmit } from '../../engine/EventBus';
import { captureStoreEvent, createCheckoutRequestId } from '../../lib/store/storeAnalytics';
import MerchPurchaseDialog from './MerchPurchaseDialog';
import { wishlistService } from '../../services/preferences-service';

// ── Economy constants (mirror of the server) ──────────────────────────────
// 1 diamond = $0.01 → 100 diamonds per USD. purchase-with-diamonds.js uses the
// same rate and Math.ceil() when an item has no explicit price_diamonds.
const DIAMONDS_PER_DOLLAR = 100;
// Both money endpoints clamp quantity to 1..10 per line item.
const MAX_QTY = 10;

const CATALOG_URL = '/api/store/merch-catalog';

const NEURAL_STEEL_MERCH = {
  'hoodie-neural': {
    name: 'Diamond Altitude Hoodie',
    description: 'Heavyweight Black Hoodie With The Diamond Altitude Circuit Graphic',
    image: '/images/merch/neural-steel/mockups/diamond-altitude-hoodie.webp',
    madeToOrder: true,
  },
  'tshirt-gto': {
    name: 'Royal Circuit Tee',
    description: 'Premium Black Tee With The Royal Circuit Poker Graphic',
    image: '/images/merch/neural-steel/mockups/royal-circuit-tee.webp',
    madeToOrder: true,
  },
  'hat-diamond': {
    name: 'Neural Steel Diamond Hat',
    description: 'Structured Black Hat With The Brain-Spade Crest Embroidered On The Crown',
    image: '/images/merch/neural-steel/mockups/diamond-dad-hat.webp',
    madeToOrder: true,
  },
};

// The original tabletop rows were seeded before their product photography
// existed. A single production atlas gives each one a real, deterministic
// physical-product bay without issuing legacy /merch/*.jpg requests.
const LEGACY_TABLETOP_ATLAS = {
  'card-protector-gold': '0% center',
  'card-protector-black': '33.333% center',
  'deck-premium': '66.667% center',
  'chip-set-100': '100% center',
  'chip-set-500': '100% center',
};

// These paths were seeded before their product photography was shipped. Let
// the card render its deliberate category placeholder immediately instead of
// issuing a guaranteed 404 and swapping to the same placeholder afterward.
// Keep this list exact so future catalog images at other /merch paths render
// normally.
const UNSHIPPED_MERCH_IMAGES = new Set([
  '/merch/card-protector-gold.jpg',
  '/merch/card-protector-black.jpg',
  '/merch/hoodie-neural.jpg',
  '/merch/tshirt-gto.jpg',
  '/merch/hat-diamond.jpg',
  '/merch/deck-premium.jpg',
  '/merch/chip-set-100.jpg',
  '/merch/chip-set-500.jpg',
]);

// ── Palette (same values the styles module uses) ──────────────────────────
const CYAN = '#00D4FF';
const TEXT = '#E4E6EB';
const MUTED = 'rgba(255, 255, 255, 0.55)';
const GREEN = '#00d4ff';
const RED = '#ff5f6d';
const CARD_BG = 'rgba(255, 255, 255, 0.05)';
const CARD_BORDER = '1px solid rgba(255, 255, 255, 0.15)';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const productAnchorId = (value) =>
  `merch-product-${String(value || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;

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
    raw?.stock,
    raw?.stock_quantity,
    raw?.stock_count,
    raw?.inventory,
    raw?.inventory_count,
    raw?.quantity_available,
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
  const size = firstString([raw.size]);
  const color = firstString([raw.color, raw.colour]);
  const composedLabel = [color, size].filter(Boolean).join(' / ');
  const label =
    firstString([
      raw.label,
      raw.name,
      raw.value,
      raw.variant,
      raw.option,
      raw.title,
      composedLabel,
    ]) || `Option ${index + 1}`;
  const id = firstString([raw.id, raw.variant_id, raw.sku]);
  const { stock, inStock } = stockOf(raw);
  const priceUsd = firstFiniteNumber([raw.price_usd, raw.priceUsd, raw.price, raw.usd_price]);
  const explicitDiamonds = firstFiniteNumber([
    raw.price_diamonds,
    raw.priceDiamonds,
    raw.diamond_price,
  ]);
  const priceDiamonds =
    explicitDiamonds !== null && explicitDiamonds > 0
      ? Math.round(explicitDiamonds)
      : priceUsd !== null && priceUsd > 0
        ? Math.ceil(priceUsd * DIAMONDS_PER_DOLLAR)
        : null;
  return {
    key: id || `v${index}-${label}`,
    id,
    label,
    size,
    color,
    priceUsd,
    priceDiamonds,
    stock,
    inStock,
    fulfillmentReady: firstBoolean([raw.fulfillment_ready, raw.fulfillmentReady]) === true,
  };
}

function normalizeProduct(raw, index, source) {
  if (!raw || typeof raw !== 'object') return null;

  const name = firstString([raw.name, raw.title, raw.product_name]);
  if (!name) return null;

  const rawId = firstString([raw.id, raw.item_id, raw.product_id]);
  const priceUsd = firstFiniteNumber([raw.price_usd, raw.priceUsd, raw.price, raw.usd_price]);
  if (priceUsd === null || priceUsd <= 0) return null;

  const explicitDiamonds = firstFiniteNumber([
    raw.price_diamonds,
    raw.priceDiamonds,
    raw.diamond_price,
  ]);
  const priceDiamonds =
    explicitDiamonds !== null && explicitDiamonds > 0
      ? Math.round(explicitDiamonds)
      : Math.ceil(priceUsd * DIAMONDS_PER_DOLLAR);

  const rawVariants = Array.isArray(raw.variants)
    ? raw.variants
    : Array.isArray(raw.options)
      ? raw.options
      : Array.isArray(raw.sizes)
        ? raw.sizes
        : [];
  const variants = rawVariants.map(normalizeVariant).filter(Boolean);
  const hasVariants = firstBoolean([raw.has_variants, raw.hasVariants]) ?? variants.length > 0;

  const own = stockOf(raw);
  // With variants, the product is sellable while ANY variant has stock.
  const inStock =
    variants.length > 0 ? own.inStock && variants.some((v) => v.inStock) : own.inStock;

  const branded = rawId ? NEURAL_STEEL_MERCH[rawId] : null;
  const image =
    branded?.image || firstString([raw.image_url, raw.imageUrl, raw.image, raw.thumbnail]);
  const fulfillmentProvider = firstString([
    raw.fulfillment_provider,
    raw.fulfillmentProvider,
    raw.metadata?.fulfillment_provider,
  ]);
  const madeToOrder =
    firstBoolean([raw.made_to_order, raw.madeToOrder, raw.metadata?.made_to_order]) === true ||
    fulfillmentProvider === 'printful' ||
    branded?.madeToOrder === true;

  return {
    key: rawId || `${source}-${index}-${name}`,
    // Any non-empty id is a candidate; merchandise_items.id is TEXT and
    // production rows are slugs. The server rejects anything it does not
    // recognise, so this does not have to guess.
    catalogId: isCatalogId(rawId) ? rawId.trim() : null,
    source,
    name: branded?.name || name,
    description:
      branded?.description || firstString([raw.description, raw.subtitle, raw.blurb]) || '',
    image: image && !UNSHIPPED_MERCH_IMAGES.has(image) ? image : null,
    atlasPosition: rawId ? LEGACY_TABLETOP_ATLAS[rawId] || null : null,
    category: (
      firstString([raw.category, raw.product_type, raw.collection]) || 'merch'
    ).toLowerCase(),
    priceUsd,
    priceDiamonds,
    stock: own.stock,
    inStock,
    hasVariants,
    variants,
    fulfillmentProvider,
    fulfillmentReady: firstBoolean([raw.fulfillment_ready, raw.fulfillmentReady]) === true,
    madeToOrder,
  };
}

// Accepts { data: { items } } / { data: [...] } / { items } / { merchandise } / [...]
function rowsFromCatalogBody(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  const candidates = [
    body.items,
    body.merchandise,
    body.products,
    body.data,
    body.data?.items,
    body.data?.merchandise,
    body.data?.products,
  ];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

const CATEGORY_LABELS = {
  apparel: 'Shirts And Hoodies',
  headwear: 'Hats And Headwear',
  eyewear: 'Sunglasses',
  tabletop: 'Poker Table Gear',
  accessories: 'Accessories',
  lifestyle: 'Lifestyle Gear',
  merch: 'More Gear',
};
const categoryLabel = (key) => CATEGORY_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
const STATIC_PRODUCTS = MERCHANDISE.map((row, index) =>
  normalizeProduct(row, index, 'static')
).filter(Boolean);

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
  if (status === 401) return 'Your Session Expired. Please Sign In Again.';
  if (status === 429) return 'Too Many Requests. Please Wait A Moment And Try Again.';
  if (status === 503) return 'Payments Are Temporarily Unavailable. Please Try Again Later.';
  return `Request Failed (${status})`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Product card
// ═══════════════════════════════════════════════════════════════════════════
function MerchProductCard({
  product,
  balance,
  hasUser,
  busyKey,
  wishlistBusyKey,
  isWishlisted,
  onToggleWishlist,
  onBuyCard,
  onBuyDiamonds,
}) {
  const [variantKey, setVariantKey] = useState(() => {
    const first =
      product.variants.find((v) => v.inStock && v.fulfillmentReady) ||
      product.variants.find((v) => v.inStock) ||
      product.variants[0];
    return first ? first.key : null;
  });
  const [qty, setQty] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);

  // Cards are keyed by product id, so their local selection survives the
  // static-to-live catalog refresh. Static rows do not have variants; when
  // live variants arrive, fall back to the first available option instead
  // of leaving `variantKey === null` and falsely marking the product sold out.
  const defaultVariant = product.variants.find((v) => v.inStock) || product.variants[0] || null;
  const variant = product.variants.find((v) => v.key === variantKey) || defaultVariant;
  const needsVariant = product.variants.length > 0;
  const liveAvailabilityRequired = product.source !== 'catalog';
  const optionsUnavailable = product.hasVariants && !needsVariant;
  const variantOutOfStock = needsVariant && (!variant || !variant.inStock);
  const fulfillmentReady = needsVariant
    ? variant?.fulfillmentReady === true
    : product.fulfillmentReady === true;
  const fulfillmentUnavailable = !fulfillmentReady;
  const soldOut =
    !product.inStock ||
    variantOutOfStock ||
    optionsUnavailable ||
    liveAvailabilityRequired ||
    fulfillmentUnavailable;

  // Respect a known per-variant / per-product stock level as well as the
  // server's hard 1..10 clamp.
  const stockCeiling = firstFiniteNumber([variant?.stock, product.stock]);
  const maxQty = Math.max(1, Math.min(MAX_QTY, stockCeiling === null ? MAX_QTY : stockCeiling));
  const clampedQty = Math.min(qty, maxQty);

  const unitPriceUsd = firstFiniteNumber([variant?.priceUsd, product.priceUsd]) || 0;
  const unitPriceDiamonds =
    firstFiniteNumber([variant?.priceDiamonds, product.priceDiamonds]) ||
    Math.ceil(unitPriceUsd * DIAMONDS_PER_DOLLAR);
  const diamondCost = unitPriceDiamonds * clampedQty;
  const usdCost = unitPriceUsd * clampedQty;

  const busy = busyKey !== null;
  const thisBusy = busyKey === product.key;
  const shortBy = Math.max(0, diamondCost - Number(balance || 0));
  const cannotAfford = hasUser && shortBy > 0;
  const titleId = `merch-${String(product.key || product.name)
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()}-title`;

  const diamondDisabled = soldOut || busy || cannotAfford;
  const availabilityReason = liveAvailabilityRequired
    ? 'Live Availability Required'
    : optionsUnavailable
      ? 'Options Temporarily Unavailable'
      : fulfillmentUnavailable
        ? 'Fulfillment Setup Required'
        : 'Sold Out';
  const diamondReason = soldOut
    ? availabilityReason
    : cannotAfford
      ? `You Need ${fmt(shortBy)} More Diamonds`
      : null;

  const Icon = product.category === 'apparel' || product.category === 'headwear' ? Shirt : Package;

  return (
    <article
      id={productAnchorId(product.catalogId || product.key)}
      aria-labelledby={titleId}
      style={{
        scrollMarginTop: 96,
        background:
          'linear-gradient(155deg, rgba(34,48,59,0.98) 0%, rgba(5,10,15,0.98) 28%, rgba(2,5,9,0.99) 100%)',
        border: soldOut ? '1px solid rgba(255, 95, 109, 0.35)' : CARD_BORDER,
        borderRadius: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: soldOut ? 0.72 : 1,
        boxShadow:
          'inset 0 1px 0 rgba(226,247,255,0.35), inset 0 0 0 4px rgba(2,7,12,0.72), 0 18px 38px rgba(0,0,0,0.42)',
      }}
    >
      {/* Image / placeholder */}
      <div
        style={{
          position: 'relative',
          height: 220,
          background:
            'radial-gradient(circle at 50% 35%, rgba(88,186,227,0.18), transparent 48%), linear-gradient(145deg, #1d2a33, #03070b 72%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {product.image && !imageFailed ? (
          <img
            src={product.image}
            alt={product.name}
            loading="eager"
            decoding="async"
            onError={() => setImageFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : product.atlasPosition ? (
          <div
            role="img"
            aria-label={product.name}
            style={{
              width: '100%',
              height: '100%',
              backgroundImage:
                "url('/images/merch/neural-steel/legacy-tabletop-atlas.webp')",
              backgroundPosition: product.atlasPosition,
              backgroundRepeat: 'no-repeat',
              backgroundSize: '400% 100%',
              filter: 'contrast(1.04) saturate(1.04)',
            }}
          />
        ) : (
          <Icon size={44} color="#a8b2d1" />
        )}
        {soldOut && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              background: 'rgba(255, 95, 109, 0.9)',
              color: '#12151c',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.6px',
              padding: '4px 9px',
              borderRadius: 0,
              textTransform: 'uppercase',
            }}
          >
            {availabilityReason}
          </div>
        )}
        {product.madeToOrder && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'linear-gradient(180deg, #d9f7ff, #7397aa)',
              color: '#071017',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.6px',
              padding: '5px 9px',
              borderRadius: 0,
              border: '1px solid rgba(240,252,255,0.8)',
              boxShadow: '0 5px 18px rgba(0,0,0,0.45)',
            }}
          >
            Made To Order
          </div>
        )}
        <button
          type="button"
          aria-label={
            isWishlisted
              ? `Remove ${product.name} From Wishlist`
              : `Save ${product.name} To Wishlist`
          }
          aria-pressed={isWishlisted}
          disabled={wishlistBusyKey === product.key}
          onClick={() => onToggleWishlist(product)}
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            display: 'inline-flex',
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${isWishlisted ? '#ff7b87' : '#7695a6'}`,
            borderRadius: 0,
            background: isWishlisted
              ? 'linear-gradient(180deg, #ff9da7, #8d2734)'
              : 'linear-gradient(180deg, #dff9ff, #426d82)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 8px 20px rgba(0,0,0,0.55)',
            color: isWishlisted ? '#24070a' : '#06131a',
            cursor: wishlistBusyKey === product.key ? 'wait' : 'pointer',
          }}
        >
          <Heart size={18} fill={isWishlisted ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div>
          <h4
            id={titleId}
            style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}
          >
            {product.name}
          </h4>
          {product.description && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
              {product.description}
            </div>
          )}
        </div>

        {/* Card price; physical POD orders need a checkout address. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: CYAN }}>{usd(unitPriceUsd)}</span>
          {product.madeToOrder && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.52)', fontWeight: 700 }}>
              Printed After Purchase
            </span>
          )}
        </div>

        {/* Variant picker */}
        {needsVariant && (
          <div>
            <div
              style={{
                fontSize: 11,
                color: MUTED,
                marginBottom: 6,
                fontWeight: 600,
                letterSpacing: '0.4px',
              }}
            >
              Size / Option
            </div>
            <div
              role="group"
              aria-label={`Choose ${product.name} Size Or Option`}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
            >
              {product.variants.map((v) => {
                const active = v.key === variant?.key;
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => {
                      setVariantKey(v.key);
                      setQty(1);
                    }}
                    disabled={!v.inStock || !v.fulfillmentReady}
                    title={
                      !v.inStock
                        ? `${v.label} — Sold Out`
                        : !v.fulfillmentReady
                          ? `${v.label} — Fulfillment Setup Required`
                          : v.label
                    }
                    aria-pressed={active}
                    style={{
                      padding: '6px 11px',
                      minWidth: 44,
                      minHeight: 44,
                      borderRadius: 0,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: v.inStock && v.fulfillmentReady ? 'pointer' : 'not-allowed',
                      color:
                        !v.inStock || !v.fulfillmentReady
                          ? 'rgba(255,255,255,0.28)'
                          : active
                            ? '#0a1628'
                            : TEXT,
                      background: active ? CYAN : 'rgba(255,255,255,0.06)',
                      border: active ? `1px solid ${CYAN}` : '1px solid rgba(255,255,255,0.15)',
                      textDecoration: v.inStock && v.fulfillmentReady ? 'none' : 'line-through',
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
          <span style={{ fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: '0.4px' }}>
            Quantity
          </span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 0,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              aria-label={`Decrease quantity of ${product.name}`}
              onClick={() => setQty((q) => Math.max(1, Math.min(q, maxQty) - 1))}
              disabled={soldOut || clampedQty <= 1}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: TEXT,
                width: 44,
                minWidth: 44,
                height: 44,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: clampedQty <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <Minus size={12} />
            </button>
            <output
              aria-live="polite"
              style={{
                minWidth: 28,
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {clampedQty}
            </output>
            <button
              type="button"
              aria-label={`Increase quantity of ${product.name}`}
              onClick={() => setQty((q) => Math.min(maxQty, Math.min(q, maxQty) + 1))}
              disabled={soldOut || clampedQty >= maxQty}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: TEXT,
                width: 44,
                minWidth: 44,
                height: 44,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: clampedQty >= maxQty ? 'not-allowed' : 'pointer',
              }}
            >
              <Plus size={12} />
            </button>
          </div>
          {clampedQty > 1 && (
            <span style={{ fontSize: 11, color: MUTED }}>
              {usd(usdCost)} / {fmt(diamondCost)}{' '}
              <Gem size={10} color={CYAN} style={{ verticalAlign: 'middle' }} />
            </span>
          )}
        </div>

        {/* Purchase buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 'auto',
            paddingTop: 4,
          }}
        >
          <button
            type="button"
            onClick={() => onBuyCard(product, variant, clampedQty)}
            disabled={soldOut || busy}
            title={soldOut ? availabilityReason : 'Pay By Card Through Stripe Checkout'}
            aria-label={`Buy ${product.name} With Card For ${usd(usdCost)}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              minHeight: 46,
              padding: '10px 12px',
              borderRadius: 0,
              border: soldOut || busy ? '1px solid rgba(255,255,255,0.08)' : '1px solid #c8f5ff',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.3px',
              color: soldOut || busy ? 'rgba(255,255,255,0.4)' : '#0a1628',
              background:
                soldOut || busy
                  ? 'rgba(255,255,255,0.08)'
                  : 'linear-gradient(180deg, #e7fbff 0%, #75bad2 42%, #2c667f 100%)',
              boxShadow:
                soldOut || busy
                  ? 'none'
                  : 'inset 0 1px 0 #fff, inset 0 -2px 0 rgba(0,0,0,0.35), 0 8px 18px rgba(0,0,0,0.35)',
              cursor: soldOut || busy ? 'not-allowed' : 'pointer',
            }}
          >
            <CreditCard size={15} />
            {thisBusy ? 'Opening Checkout…' : soldOut ? availabilityReason : 'Buy With Card'}
          </button>

          <button
            type="button"
            onClick={() => onBuyDiamonds(product, variant, clampedQty)}
            disabled={diamondDisabled}
            title={diamondReason || `Pay ${fmt(diamondCost)} diamonds`}
            aria-label={`Buy ${product.name} With ${fmt(diamondCost)} Diamonds`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              minHeight: 46,
              padding: '10px 12px',
              borderRadius: 0,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.3px',
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: cannotAfford ? '#FFD700' : RED,
                fontWeight: 600,
              }}
            >
              <AlertTriangle size={12} /> {diamondReason}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Storefront
// ═══════════════════════════════════════════════════════════════════════════
export default function MerchStore({ user = null }) {
  // Render the verified static lineup on the server and during the live
  // catalog refresh. The database remains the checkout price oracle, but a
  // slow catalog request no longer leaves the whole page as a loading panel.
  const [products, setProducts] = useState(() => STATIC_PRODUCTS);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [pendingDiamondPurchase, setPendingDiamondPurchase] = useState(null);
  const [wishlistIds, setWishlistIds] = useState(() => new Set());
  const [wishlistBusyKey, setWishlistBusyKey] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const mountedRef = useRef(true);
  // Close the event-loop gap before React can render disabled controls. This
  // prevents a fast double click from starting two Stripe sessions or two
  // diamond requests with different server idempotency windows.
  const busyRef = useRef(false);
  const catalogSourceRef = useRef(null);

  const setStoreBusy = useCallback((key) => {
    busyRef.current = key !== null;
    setBusyKey(key);
  }, []);

  const { balance, refreshBalance } = useDiamondBalance(user?.id || null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setWishlistIds(new Set());
      return () => {
        cancelled = true;
      };
    }
    wishlistService
      .getWishlist(user.id)
      .then((items) => {
        if (!cancelled) setWishlistIds(new Set((items || []).map((item) => item.product_id)));
      })
      .catch((error) => {
        console.warn('[MerchStore] Wishlist load failed:', error?.message || error);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Load catalog, fall back to the static lineup ──────────────────────
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      let rows = [];
      let failure = null;
      try {
        // A retry or post-purchase refresh gets its own cache key so a
        // five-minute edge response cannot immediately restore stale
        // stock. The endpoint ignores this read-only query parameter.
        const catalogUrl = reloadToken
          ? `${CATALOG_URL}?refresh=${encodeURIComponent(reloadToken)}`
          : CATALOG_URL;
        const res = await fetch(catalogUrl, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        // A not-yet-deployed API route answers 404 with an HTML page —
        // guard the content type before parsing.
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          failure =
            res.status === 404
              ? 'Live Catalog Not Available Yet'
              : `Live Catalog Unavailable (${res.status})`;
        } else {
          const body = await res.json();
          rows = rowsFromCatalogBody(body)
            .map((r, i) => normalizeProduct(r, i, 'catalog'))
            .filter(Boolean);
          if (rows.length === 0) failure = 'Live Catalog Returned No Items';
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        failure = 'Could Not Reach The Live Catalog';
        console.warn('[MerchStore] Catalog fetch failed:', err?.message || err);
      }

      if (cancelled || !mountedRef.current) return;

      if (rows.length > 0) {
        setProducts(rows);
        setUsingFallback(false);
        setLoadError(null);
      } else {
        setProducts(STATIC_PRODUCTS);
        setUsingFallback(true);
        setLoadError(failure);
        captureStoreEvent('catalog_fallback', { reason: failure || 'empty' });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadToken]);

  useEffect(() => {
    const source = usingFallback ? 'static' : 'live';
    if (catalogSourceRef.current === source || products.length === 0) return;
    catalogSourceRef.current = source;
    captureStoreEvent('catalog_viewed', { route: 'merch', source, items: products.length });
  }, [products.length, usingFallback]);

  // ── Group into the page's existing category sections ──────────────────
  const sections = useMemo(() => {
    const order = [];
    const map = new Map();
    for (const p of products) {
      if (!map.has(p.category)) {
        map.set(p.category, []);
        order.push(p.category);
      }
      map.get(p.category).push(p);
    }
    // Keep the wearable collection first, then dedicated poker and
    // lifestyle categories. Unknown future categories follow safely.
    order.sort((a, b) => {
      const ranks = {
        apparel: 0,
        headwear: 1,
        eyewear: 2,
        tabletop: 3,
        accessories: 4,
        lifestyle: 5,
      };
      const rank = (k) => ranks[k] ?? 99;
      return rank(a) - rank(b);
    });
    return order.map((key) => ({ key, label: categoryLabel(key), items: map.get(key) }));
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
      if (includePrice) {
        item.price = firstFiniteNumber([variant?.priceUsd, product.priceUsd]);
      }
    } else {
      // No database row → the server prices this from the request within
      // its $0.50–$500 sanity band.
      item.price = product.priceUsd;
    }
    if (variant) {
      // Send the variant's real id, not just its label.
      //
      // The chosen size/colour used to travel ONLY inside this free-text
      // description, so the server had no way to price or stock-check it:
      // merchandise_item_variants carries its own price_usd,
      // price_diamonds and stock, and checkout never consulted the table
      // at all. An XXL was charged the base price and its stock never
      // moved. reserve_merch_order() now prices and reserves per variant,
      // and REFUSES an item with variants when no variant_id arrives —
      // guessing would either mischarge the customer or ship them the
      // wrong size — so this field is required, not decorative.
      if (variant.id) item.variantId = variant.id;
      item.description = `${product.description ? `${product.description} — ` : ''}Option: ${variant.label}`;
    } else if (product.description) {
      item.description = product.description;
    }
    return item;
  }, []);

  const requireSignedIn = useCallback(() => {
    const token = getAccessToken();
    if (!token || !user?.id) {
      showStoreToast('error', 'Please Sign In To Buy Merch.');
      return null;
    }
    return token;
  }, [user?.id]);

  const toggleWishlist = useCallback(
    async (product) => {
      const token = requireSignedIn();
      if (!token || !user?.id || wishlistBusyKey) return;
      const productId = product.catalogId || product.key;
      const wasSaved = wishlistIds.has(productId);
      setWishlistBusyKey(product.key);
      try {
        if (wasSaved) {
          await wishlistService.removeFromWishlist(user.id, productId);
        } else {
          await wishlistService.addToWishlist(user.id, {
            id: productId,
            type: 'merchandise',
            name: product.name,
            price: product.priceUsd,
          });
        }
        setWishlistIds((current) => {
          const next = new Set(current);
          if (wasSaved) next.delete(productId);
          else next.add(productId);
          return next;
        });
        showStoreToast('success', wasSaved ? 'Removed From Wishlist' : 'Saved To Wishlist');
      } catch (error) {
        console.warn('[MerchStore] Wishlist update failed:', error?.message || error);
        showStoreToast('error', 'Wishlist Could Not Be Updated. Please Try Again.');
      } finally {
        if (mountedRef.current) setWishlistBusyKey(null);
      }
    },
    [requireSignedIn, user?.id, wishlistBusyKey, wishlistIds]
  );

  // ── Card checkout → Stripe ────────────────────────────────────────────
  const handleBuyCard = useCallback(
    async (product, variant, quantity) => {
      if (busyRef.current) return;
      const token = requireSignedIn();
      if (!token) return;
      if (product.variants.length > 0 && !variant) {
        showStoreToast('error', 'Please Choose A Size Or Option First.');
        return;
      }
      const fulfillmentReady =
        product.variants.length > 0
          ? variant?.fulfillmentReady === true
          : product.fulfillmentReady === true;
      if (!fulfillmentReady) {
        showStoreToast('error', 'Fulfillment Setup Is Still Required. No Payment Was Taken.');
        return;
      }

      setStoreBusy(product.key);
      const checkoutRequestId = createCheckoutRequestId(
        `merch-${product.catalogId || product.key}`
      );
      const unitPriceUsd = firstFiniteNumber([variant?.priceUsd, product.priceUsd]) || 0;
      captureStoreEvent('checkout_started', {
        route: 'merch',
        type: 'merchandise',
        product: product.catalogId || product.key,
        quantity,
        value_usd: unitPriceUsd * quantity,
      });
      const post = (includePrice) =>
        fetch('/api/store/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Checkout-Request-ID': checkoutRequestId,
          },
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
        if (
          !res.ok &&
          res.status === 400 &&
          product.catalogId &&
          (code === 'INVALID_PRICE' || code === 'INVALID_ITEM')
        ) {
          res = await post(true);
          data = await res.json().catch(() => null);
        }

        if (!res.ok || !data?.success) {
          throw new Error(errorMessageOf(data, res.status));
        }
        if (!data.data?.url) {
          throw new Error('Checkout Session Missing Redirect URL');
        }
        captureStoreEvent('checkout_session_created', {
          route: 'merch',
          type: 'merchandise',
          product: product.catalogId || product.key,
        });
        // Leave the busy state on through the navigation.
        window.location.href = data.data.url;
      } catch (err) {
        console.warn('[MerchStore] Card checkout failed:', err?.message || err);
        captureStoreEvent('checkout_failed', { route: 'merch', type: 'merchandise' });
        showStoreToast('error', err?.message || 'Could Not Start Checkout. Please Try Again.');
        if (mountedRef.current) setStoreBusy(null);
      }
    },
    [requireSignedIn, buildLineItem, setStoreBusy]
  );

  // ── Diamond checkout ──────────────────────────────────────────────────
  const handleBuyDiamonds = useCallback(
    (product, variant, quantity) => {
      if (busyRef.current) return;
      const token = requireSignedIn();
      if (!token) return;
      if (product.variants.length > 0 && !variant) {
        showStoreToast('error', 'Please Choose A Size Or Option First.');
        return;
      }
      const unitPriceUsd = firstFiniteNumber([variant?.priceUsd, product.priceUsd]) || 0;
      const unitPriceDiamonds =
        firstFiniteNumber([variant?.priceDiamonds, product.priceDiamonds]) ||
        Math.ceil(unitPriceUsd * DIAMONDS_PER_DOLLAR);
      const cost = unitPriceDiamonds * quantity;
      if (Number(balance || 0) < cost) {
        showStoreToast(
          'error',
          `Not Enough Diamonds — ${fmt(cost)} Needed, You Have ${fmt(balance)}.`
        );
        return;
      }
      setPendingDiamondPurchase({
        product,
        variant,
        quantity,
        cost,
        requiresShipping: product.madeToOrder || product.fulfillmentProvider === 'printful',
        purchaseRequestId: createCheckoutRequestId(
          `merch-diamonds-${product.catalogId || product.key}`
        ),
      });
      captureStoreEvent('diamond_purchase_reviewed', {
        route: 'merch',
        product: product.catalogId || product.key,
        quantity,
        diamonds: cost,
      });
    },
    [balance, requireSignedIn]
  );

  const confirmDiamondPurchase = useCallback(
    async (shipping = null) => {
      if (!pendingDiamondPurchase || busyRef.current) return;
      const token = requireSignedIn();
      if (!token) {
        setPendingDiamondPurchase(null);
        return;
      }

      const { product, variant, quantity, cost } = pendingDiamondPurchase;

      setStoreBusy(product.key);
      captureStoreEvent('diamond_purchase_started', {
        route: 'merch',
        product: product.catalogId || product.key,
        quantity,
        diamonds: cost,
      });
      try {
        const res = await fetch('/api/store/purchase-with-diamonds', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Idempotency-Key': pendingDiamondPurchase.purchaseRequestId,
          },
          // The diamond endpoint prices catalogued items entirely from
          // merchandise_items, so no price is sent for them.
          body: JSON.stringify({
            items: [buildLineItem(product, variant, quantity, { includePrice: false })],
            ...(pendingDiamondPurchase.requiresShipping ? { shipping } : {}),
          }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.success) {
          const details = data?.details;
          if (details && details.required != null && details.current != null) {
            throw new Error(
              `Not enough diamonds — ${fmt(details.required)} needed, you have ${fmt(details.current)}` +
                (details.shortfall != null ? ` (${fmt(details.shortfall)} short).` : '.')
            );
          }
          throw new Error(errorMessageOf(data, res.status));
        }

        const replayed = data.idempotent === true;
        const spent = Number(data.data?.diamonds_spent) || cost;
        captureStoreEvent('diamond_purchase_complete', {
          route: 'merch',
          product: product.catalogId || product.key,
          quantity,
          diamonds_spent: spent,
          idempotent: replayed,
        });
        showStoreToast(
          'success',
          replayed
            ? 'Order Already Placed — No Additional Diamonds Were Deducted.'
            : `Order Placed! ${fmt(spent)} Diamonds Deducted.`
        );
        try {
          new Audio('/sounds/purchase-success.mp3')
            .play()
            .catch((e) => console.warn('[MerchStore] Sound blocked:', e?.message || e));
        } catch (e) {
          console.warn('[MerchStore] Sound unavailable:', e?.message || e);
        }

        if (!replayed) busEmit.diamondsSpent(spent, 'Merch Store Purchase');
        broadcastSync('smarter_poker_diamond_sync', 'refresh');
        broadcastSync('smarter_poker_chips_sync', 'refresh');
        refreshBalance();
        if (mountedRef.current) setPendingDiamondPurchase(null);
        // Stock may have moved — pull the catalog again.
        if (mountedRef.current) setReloadToken((t) => t + 1);
      } catch (err) {
        console.warn('[MerchStore] Diamond purchase failed:', err?.message || err);
        showStoreToast('error', err?.message || 'Diamond Purchase Failed. Please Try Again.');
      } finally {
        if (mountedRef.current) setStoreBusy(null);
      }
    },
    [pendingDiamondPurchase, requireSignedIn, buildLineItem, refreshBalance, setStoreBusy]
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <style jsx global>{`
        article[id^='merch-product-']:target {
          outline: 2px solid #8befff;
          outline-offset: 5px;
          box-shadow:
            0 0 0 8px rgba(0, 200, 255, 0.1),
            0 24px 58px rgba(0, 168, 255, 0.42) !important;
        }
        @media (prefers-reduced-motion: reduce) {
          article[id^='merch-product-']:target {
            scroll-behavior: auto;
          }
        }
      `}</style>
      <div style={styles.intro}>
        <h2 style={styles.merchTitle}>Official Merch</h2>
        <p style={styles.introText}>
          Neural Steel Apparel, Headwear, Table Gear, And Lifestyle Products Are Created After
          Purchase, Then Packed And Shipped Directly By A Fulfillment Partner. We Never Hold Or Ship
          Inventory.
        </p>

        {user?.id && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 14,
              background: 'rgba(0, 212, 255, 0.1)',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              borderRadius: 0,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 700,
              color: TEXT,
            }}
          >
            <Gem size={15} color={CYAN} />
            Your Balance: <span style={{ color: CYAN }}>{fmt(balance)}</span>
          </div>
        )}
      </div>

      {usingFallback && loadError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            margin: '0 0 24px',
            padding: '12px 16px',
            borderRadius: 0,
            background: 'rgba(255, 215, 0, 0.08)',
            border: '1px solid rgba(255, 215, 0, 0.35)',
            color: '#FFD700',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <AlertTriangle size={14} />
          <span style={{ flex: 1 }}>
            {loadError} — Showing The Standard Lineup. Live Fulfillment Options Are Required Before
            Checkout.
          </span>
          <button
            type="button"
            onClick={() => setReloadToken((t) => t + 1)}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 46,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: TEXT,
              borderRadius: 0,
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} /> {loading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      {loading && (
        <div
          role="status"
          aria-live="polite"
          style={{ textAlign: 'center', padding: '10px 0 18px', color: MUTED, fontSize: 13 }}
        >
          <RefreshCw
            size={15}
            color="#a8b2d1"
            style={{ verticalAlign: 'middle', marginRight: 7 }}
          />
          Verifying Live Prices, Options, And Stock...
        </div>
      )}

      {!loading && products.length === 0 && (
        <div
          role="status"
          style={{
            textAlign: 'center',
            padding: '48px 20px',
            background: CARD_BG,
            border: CARD_BORDER,
            borderRadius: 0,
            color: MUTED,
            fontSize: 14,
          }}
        >
          <Package size={28} color="#a8b2d1" />
          <div style={{ marginTop: 10, fontWeight: 700, color: TEXT }}>
            No Merch Available Right Now
          </div>
          <div style={{ marginTop: 6 }}>New Gear Drops Regularly — Check Back Soon.</div>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.key} style={styles.merchSection}>
          <h3 style={styles.merchCategoryTitle}>{section.label}</h3>
          <div style={styles.merchGrid}>
            {section.items.map((product) => (
              <MerchProductCard
                key={product.key}
                product={product}
                balance={balance}
                hasUser={!!user?.id}
                busyKey={busyKey}
                wishlistBusyKey={wishlistBusyKey}
                isWishlisted={wishlistIds.has(product.catalogId || product.key)}
                onToggleWishlist={toggleWishlist}
                onBuyCard={handleBuyCard}
                onBuyDiamonds={handleBuyDiamonds}
              />
            ))}
          </div>
        </div>
      ))}

      {products.length > 0 && (
        <p style={{ ...styles.introText, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
          Card And Diamond Orders Ship To The United States And Canada. A Shipping Address Is
          Collected Securely Before A Physical Order Is Placed.
        </p>
      )}

      <MerchPurchaseDialog
        purchase={pendingDiamondPurchase}
        balance={balance}
        busy={Boolean(busyKey)}
        onCancel={() => {
          if (!busyKey) setPendingDiamondPurchase(null);
        }}
        onConfirm={confirmDiamondPurchase}
      />
    </>
  );
}
