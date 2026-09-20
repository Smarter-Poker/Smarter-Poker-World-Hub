/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MerchStore: official merchandise storefront (Diamond Store → Merch tab)
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
 *   catalog id + quantity and never a price for catalogued goods. Seed ids are
 *   slugs too; the checkout API resolves each id against the live catalog and
 *   rejects an unknown row instead of trusting browser-supplied pricing.
 *
 * Layout stays compatible with src/components/diamond-store/diamondStoreStyles.js.
 * MerchStore.module.css upgrades the existing controls and cards with shared
 * Marketplace console artwork while all product and commerce behavior remains here.
 */

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useId,
  useMemo,
  useRef,
} from 'react';
import Link from 'next/link';

import styles from '../diamond-store/diamondStoreStyles';
import merchStyles from './MerchStore.module.css';
import { MERCHANDISE } from '../../data/diamondStoreData';
import { getAccessToken, getAuthUser } from '../../lib/authUtils';
import { showStoreToast } from './StoreToast';
import useDiamondBalance from '../../hooks/useDiamondBalance';
import { broadcastSync } from '../../lib/broadcastSync';
import { busEmit } from '../../engine/EventBus';
import { captureStoreEvent } from '../../lib/store/storeAnalytics';
import {
  clearCommerceRequestId,
  getOrCreateCommerceRequestId,
  inspectCommerceRequestRecovery,
  replaceCommerceRequestId,
} from '../../lib/store/checkoutIntentStore';
import MerchPurchaseDialog from './MerchPurchaseDialog';
import { wishlistService } from '../../services/preferences-service';
import useCartStore from '../../stores/cartStore';
import { supabase } from '../../lib/supabase';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import { resolveReviewedMerchArt } from '../../lib/store/merchProductArt';
import { boundedCommerceFetch } from '../../lib/store/boundedCommerceFetch';
import {
  checkoutRequestReplacementRequired,
  merchandiseCheckoutOfferConfirmation,
  merchandiseDiamondOfferConfirmation,
  normalizeVerifiedCheckoutSession,
} from '../../lib/store/verifiedCheckoutUrl.mjs';
import { getVerifiedCheckoutAuthorization } from '../../lib/store/checkoutAuthorization';
import {
  classifyMerchDiamondPurchaseRefusal,
  normalizeVerifiedMerchDiamondPurchase,
} from '../../lib/store/verifiedCommerceResponse.mjs';

// ── Economy constants (mirror of the server) ──────────────────────────────
// 1 diamond = $0.01 → 100 diamonds per USD. purchase-with-diamonds.js uses the
// same rate and Math.ceil() when an item has no explicit price_diamonds.
const DIAMONDS_PER_DOLLAR = 100;
// Both money endpoints clamp quantity to 1..10 per line item.
const MAX_QTY = 10;

const CATALOG_URL = '/api/store/merch-catalog';
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
// and production rows are slugs: 'hoodie-neural', 'card-protector-gold',
// 'chip-set-500'.
//
// SECURITY (2026-08-06): this used to require a UUID, on the assumption that
// slugs were only ever static fallback rows. The assumption was inverted: the
// real catalog is slugs, so isCatalogId() returned false for EVERY product,
// `catalogId` was null on every line item, and buildLineItem() sent
// { name, price, quantity } with no id. Both checkout endpoints then priced
// from that client-supplied `price`, so a $199.99 chip set could be bought for
// $0.50, or 19,999 Diamonds for 50 Diamonds. The server-side price oracle was live and
// correct the whole time; nothing ever reached it from this component.
// pages/hub/diamond-store/cart.js passed the slug through unmodified and was
// therefore repriced correctly, which is why the two storefronts disagreed.
const isCatalogId = (v) => typeof v === 'string' && v.trim().length > 0;

// ── Normalisation ─────────────────────────────────────────────────────────
// The deployed catalog API and database schema have evolved over time, so
// every field is read defensively across supported column names rather than
// assuming one exact response shape.

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
  // Primitive values in older payloads are display labels, not authoritative
  // merchandise_item_variants identifiers. Exclude them from the purchasable
  // set instead of guessing that a size label or SKU is a checkout id.
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
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
  // A selected variant must carry the exact server-owned checkout identifier.
  // Rendering an id-less option would let the shopper select it while both
  // checkout paths submit the parent item without the required variantId.
  if (!id) return null;
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
    label: marketplaceCopy(label),
    size: marketplaceCopy(size),
    color: marketplaceCopy(color),
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
  // Preserve the server's declaration even when every supplied entry is an
  // unsafe legacy primitive or otherwise lacks an authoritative identifier.
  // That leaves the product visibly unavailable instead of silently selling
  // its parent row as though it never had selectable variants.
  const hasVariants = firstBoolean([raw.has_variants, raw.hasVariants]) ?? rawVariants.length > 0;

  const own = stockOf(raw);
  // With variants, the product is sellable while ANY variant has stock.
  const inStock =
    variants.length > 0 ? own.inStock && variants.some((v) => v.inStock) : own.inStock;

  const branded = rawId ? NEURAL_STEEL_MERCH[rawId] : null;
  const reviewedArt = resolveReviewedMerchArt(rawId);
  const approvedImage = branded?.image || reviewedArt.image;
  const atlasPosition = reviewedArt.atlasPosition;
  const fulfillmentProvider = firstString([
    raw.fulfillment_provider,
    raw.fulfillmentProvider,
    raw.metadata?.fulfillment_provider,
  ]);
  const madeToOrder =
    firstBoolean([raw.made_to_order, raw.madeToOrder, raw.metadata?.made_to_order]) === true ||
    fulfillmentProvider === 'printful' ||
    branded?.madeToOrder === true;
  const requiresShipping =
    firstBoolean([raw.requires_shipping, raw.requiresShipping]) ??
    fulfillmentProvider !== 'digital';

  return {
    key: rawId || `${source}-${index}-${name}`,
    // Any non-empty id is a candidate; merchandise_items.id is TEXT and
    // production rows are slugs. The server rejects anything it does not
    // recognise, so this does not have to guess.
    catalogId: isCatalogId(rawId) ? rawId.trim() : null,
    source,
    name: marketplaceCopy(branded?.name || name),
    description: marketplaceCopy(
      branded?.description || firstString([raw.description, raw.subtitle, raw.blurb]) || ''
    ),
    image: approvedImage || null,
    atlasPosition,
    mediaApproved: Boolean(approvedImage || atlasPosition),
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
    requiresShipping,
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
const categoryLabel = (key) => CATEGORY_LABELS[key] || marketplaceCopy(key);
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
    return data?.message && data.message !== raw ? `${raw}: ${data.message}` : raw;
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
  cartReady,
  busyKey,
  wishlistBusyKey,
  isWishlisted,
  onToggleWishlist,
  onAddToCart,
  onBuyCard,
  onBuyDiamonds,
  mediaPriority = false,
  headingLevel = 4,
}) {
  // A product detail page drops the category heading, so the card title has to
  // step up a level or the outline skips from the console's h2 straight to h4.
  const ProductHeading = `h${headingLevel}`;
  const reactCardId = useId();
  const productDomToken =
    String(product.catalogId || product.key || reactCardId)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || reactCardId.replace(/[^a-z0-9_-]+/gi, '-');
  const cardDomId = `merch-product-${productDomToken}`;
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
  const mediaUnavailable = !product.mediaApproved || (Boolean(product.image) && imageFailed);
  const soldOut =
    !product.inStock ||
    variantOutOfStock ||
    optionsUnavailable ||
    liveAvailabilityRequired ||
    fulfillmentUnavailable ||
    mediaUnavailable;

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
  const titleId = `${cardDomId}-title`;

  const diamondDisabled = soldOut || busy || cannotAfford;
  const availabilityReason = liveAvailabilityRequired
    ? 'Live Availability Required'
    : optionsUnavailable
      ? 'Options Temporarily Unavailable'
      : mediaUnavailable
        ? 'Product Artwork Requires Review'
        : fulfillmentUnavailable
          ? 'Fulfillment Setup Required'
          : 'Sold Out';
  const diamondReason = soldOut
    ? availabilityReason
    : cannotAfford
      ? `You Need ${fmt(shortBy)} More Diamonds`
      : null;

  return (
    <article
      id={cardDomId}
      data-merch-product-card="true"
      aria-labelledby={titleId}
      className={`${merchStyles.productCard} ${soldOut ? merchStyles.productCardUnavailable : ''}`}
      style={{
        scrollMarginTop: 96,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Only reviewed product photography may represent a sellable item. */}
      <div className={merchStyles.mediaBay}>
        {product.atlasPosition && !imageFailed ? (
          <div
            role="img"
            aria-label={product.name}
            className={`${merchStyles.productImage} ${merchStyles.atlasProductImage}`}
            style={{
              backgroundImage: "url('/images/merch/neural-steel/legacy-tabletop-atlas.webp')",
              backgroundPosition: product.atlasPosition,
              backgroundRepeat: 'no-repeat',
              backgroundSize: '400% 100%',
              filter: 'contrast(1.04) saturate(1.04)',
            }}
          />
        ) : product.image && !imageFailed ? (
          <img
            src={product.image}
            alt={product.name}
            loading={mediaPriority ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setImageFailed(true)}
            className={merchStyles.productImage}
          />
        ) : (
          <div className={merchStyles.mediaUnavailable} role="status">
            Product Artwork Requires Review
          </div>
        )}
        {soldOut && (
          <div className={`${merchStyles.mediaBadge} ${merchStyles.mediaBadgeUnavailable}`}>
            {availabilityReason}
          </div>
        )}
        {product.madeToOrder && <div className={merchStyles.mediaBadge}>Made To Order</div>}
      </div>

      <div className={merchStyles.cardBody}>
        <div>
          {/* The favorite control used to sit on top of the product
              photograph. It belongs beside the name it saves. */}
          <div className={merchStyles.titleRow}>
            <ProductHeading id={titleId} className={merchStyles.productTitle}>
              {product.name}
            </ProductHeading>
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
              className={`${merchStyles.wishlistControl} ${isWishlisted ? merchStyles.wishlistControlSelected : ''}`}
            >
              {isWishlisted ? 'Saved' : 'Save'}
            </button>
          </div>
          {product.description && (
            <div className={merchStyles.productDescription}>{product.description}</div>
          )}
        </div>

        {/* Card price; physical POD orders need a checkout address. */}
        <div className={merchStyles.priceRow}>
          <span className={merchStyles.price}>{usd(unitPriceUsd)}</span>
          {product.madeToOrder && (
            <span className={merchStyles.priceNote}>Printed After Purchase</span>
          )}
        </div>

        {/* Variant picker */}
        {needsVariant && (
          <div>
            <div className={merchStyles.controlLabel}>Size / Option</div>
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
                        ? `${v.label}: Sold Out`
                        : !v.fulfillmentReady
                          ? `${v.label}: Fulfillment Setup Required`
                          : v.label
                    }
                    aria-pressed={active}
                    className={`${merchStyles.optionControl} ${active ? merchStyles.optionControlSelected : ''}`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className={merchStyles.quantityRow}>
          <span className={merchStyles.controlLabel}>Quantity</span>
          <div className={merchStyles.quantityControl}>
            <button
              type="button"
              aria-label={`Decrease Quantity Of ${product.name}`}
              onClick={() => setQty((q) => Math.max(1, Math.min(q, maxQty) - 1))}
              disabled={soldOut || clampedQty <= 1}
              className={merchStyles.quantityButton}
            >
              Less
            </button>
            <output aria-live="polite" className={merchStyles.quantityValue}>
              {clampedQty}
            </output>
            <button
              type="button"
              aria-label={`Increase Quantity Of ${product.name}`}
              onClick={() => setQty((q) => Math.min(maxQty, Math.min(q, maxQty) + 1))}
              disabled={soldOut || clampedQty >= maxQty}
              className={merchStyles.quantityButton}
            >
              More
            </button>
          </div>
          {clampedQty > 1 && (
            <span className={merchStyles.quantityTotal}>
              {usd(usdCost)} / {fmt(diamondCost)} Diamonds
            </span>
          )}
        </div>

        {/* Purchase buttons */}
        <div className={merchStyles.purchaseControls}>
          <div className={merchStyles.purchasePair}>
            <Link
              href={`/hub/merch-store/${encodeURIComponent(product.catalogId || product.key)}`}
              aria-label={`View ${product.name} Details`}
              className={`${merchStyles.actionControl} ${merchStyles.actionSecondary}`}
            >
              View Details
            </Link>
            <button
              type="button"
              onClick={() => onAddToCart(product, variant, clampedQty)}
              disabled={!cartReady || soldOut || busy}
              aria-label={`Add ${product.name} To Cart`}
              className={`${merchStyles.actionControl} ${merchStyles.actionGold}`}
            >
              Add To Cart
            </button>
          </div>

          <button
            type="button"
            onClick={() => onBuyCard(product, variant, clampedQty)}
            disabled={soldOut || busy}
            title={soldOut ? availabilityReason : 'Pay By Card Through Stripe Checkout'}
            aria-label={`Buy ${product.name} With Card For ${usd(usdCost)}`}
            className={`${merchStyles.actionControl} ${merchStyles.actionPrimary}`}
          >
            {thisBusy ? 'Opening Checkout...' : soldOut ? availabilityReason : 'Buy With Card'}
          </button>

          <button
            type="button"
            onClick={() => onBuyDiamonds(product, variant, clampedQty)}
            disabled={diamondDisabled}
            title={diamondReason || `Pay ${fmt(diamondCost)} Diamonds`}
            aria-label={`Buy ${product.name} With ${fmt(diamondCost)} Diamonds`}
            className={`${merchStyles.actionControl} ${merchStyles.actionDiamond}`}
          >
            {thisBusy ? 'Processing...' : `Pay With Diamonds: ${fmt(diamondCost)}`}
          </button>

          {/* Honest, specific reason instead of a silently dead button */}
          {diamondReason && (
            <div className={merchStyles.purchaseReason} data-shortfall={cannotAfford || undefined}>
              {diamondReason}
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
export default function MerchStore({
  user = null,
  authResolved = true,
  focusProductId = null,
  detailMode = false,
  initialProduct = null,
  catalogCategory = null,
}) {
  const initialProducts = useMemo(() => {
    const normalized = initialProduct
      ? normalizeProduct(
          initialProduct,
          0,
          initialProduct.catalogVerified === true ? 'catalog' : 'static'
        )
      : null;
    return normalized ? [normalized] : STATIC_PRODUCTS;
  }, [initialProduct]);
  // Render the verified static lineup on the server and during the live
  // catalog refresh. The database remains the checkout price oracle, but a
  // slow catalog request no longer leaves the whole page as a loading panel.
  const [products, setProducts] = useState(() => initialProducts);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(
    () => !initialProduct || initialProduct.catalogVerified !== true
  );
  const [loadError, setLoadError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [pendingDiamondPurchase, setPendingDiamondPurchase] = useState(null);
  const [wishlistIds, setWishlistIds] = useState(() => new Set());
  const [wishlistBusyKey, setWishlistBusyKey] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isOperator, setIsOperator] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortMode, setSortMode] = useState('featured');
  const mountedRef = useRef(true);
  const activeAccountIdRef = useRef(user?.id || null);
  const diamondPurchaseAttemptRef = useRef(0);
  const diamondPurchaseAbortRef = useRef(null);
  const cardCheckoutAttemptRef = useRef(0);
  const cardCheckoutAbortRef = useRef(null);
  const cardCheckoutProcessingRef = useRef(false);
  const wishlistMutationAttemptRef = useRef(0);
  const wishlistMutationProcessingRef = useRef(false);
  // Close the event-loop gap before React can render disabled controls. This
  // prevents a fast double click from starting two Stripe sessions or two
  // diamond requests with different server idempotency windows.
  const busyRef = useRef(false);
  const catalogSourceRef = useRef(null);
  const addCartItem = useCartStore((state) => state.addItem);
  const setCartOwner = useCartStore((state) => state.setOwner);

  const setStoreBusy = useCallback((key) => {
    busyRef.current = key !== null;
    setBusyKey(key);
  }, []);

  useIsomorphicLayoutEffect(() => {
    activeAccountIdRef.current = user?.id || null;
    diamondPurchaseAttemptRef.current += 1;
    cardCheckoutAttemptRef.current += 1;
    wishlistMutationAttemptRef.current += 1;
    diamondPurchaseAbortRef.current?.abort();
    diamondPurchaseAbortRef.current = null;
    cardCheckoutAbortRef.current?.abort();
    cardCheckoutAbortRef.current = null;
    cardCheckoutProcessingRef.current = false;
    wishlistMutationProcessingRef.current = false;
    busyRef.current = false;
    setBusyKey(null);
    setWishlistBusyKey(null);
    setWishlistIds(new Set());
    setPendingDiamondPurchase(null);
  }, [user?.id]);

  const { balance, setBalance } = useDiamondBalance(user?.id || null);

  useEffect(() => {
    if (!authResolved) return;
    setCartOwner(user?.id || 'guest');
  }, [authResolved, setCartOwner, user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setIsOperator(false);
      return () => {
        cancelled = true;
      };
    }
    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsOperator(data?.is_admin === true);
      })
      .catch(() => {
        if (!cancelled) setIsOperator(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    setWishlistIds(new Set());
    if (!user?.id) {
      return () => {
        cancelled = true;
      };
    }
    wishlistService
      .getWishlist(user.id)
      .then((items) => {
        if (!cancelled && activeAccountIdRef.current === user.id) {
          setWishlistIds(new Set((items || []).map((item) => item.product_id)));
        }
      })
      .catch((error) => {
        if (!cancelled && activeAccountIdRef.current === user.id) {
          console.warn('[MerchStore] Wishlist load failed:', error?.message || error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      diamondPurchaseAttemptRef.current += 1;
      diamondPurchaseAbortRef.current?.abort();
      diamondPurchaseAbortRef.current = null;
      cardCheckoutAttemptRef.current += 1;
      cardCheckoutAbortRef.current?.abort();
      cardCheckoutAbortRef.current = null;
      cardCheckoutProcessingRef.current = false;
      wishlistMutationAttemptRef.current += 1;
      wishlistMutationProcessingRef.current = false;
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
        const catalogParams = new URLSearchParams();
        if (catalogCategory) catalogParams.set('category', catalogCategory);
        if (reloadToken) catalogParams.set('refresh', String(reloadToken));
        const catalogQuery = catalogParams.toString();
        const catalogUrl = catalogQuery ? `${CATALOG_URL}?${catalogQuery}` : CATALOG_URL;
        const res = await fetch(catalogUrl, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        // A not-yet-deployed API route answers 404 with an HTML page :
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
        // Detail pages arrive with their ISR product (including variants), so
        // an unavailable refresh must not replace the selected product with a
        // generic static catalog that may not contain it.
        setProducts(initialProducts);
        setUsingFallback(!initialProduct || initialProduct.catalogVerified !== true);
        setLoadError(failure);
        captureStoreEvent('catalog_fallback', { reason: failure || 'empty' });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [catalogCategory, initialProduct, initialProducts, reloadToken]);

  useEffect(() => {
    const source = usingFallback ? 'static' : 'live';
    if (catalogSourceRef.current === source || products.length === 0) return;
    catalogSourceRef.current = source;
    captureStoreEvent('catalog_viewed', { route: 'merch', source, items: products.length });
  }, [products.length, usingFallback]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category))).sort(),
    [products]
  );

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const focusedId = String(focusProductId || '').trim();
    const filtered = products.filter((product) => {
      if (
        focusedId &&
        ![product.catalogId, product.key].some((value) => String(value || '') === focusedId)
      ) {
        return false;
      }
      if (categoryFilter !== 'all' && product.category !== categoryFilter) return false;
      if (!query) return true;
      return [product.name, product.description, product.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
    if (sortMode === 'price-low') filtered.sort((a, b) => a.priceUsd - b.priceUsd);
    if (sortMode === 'price-high') filtered.sort((a, b) => b.priceUsd - a.priceUsd);
    if (sortMode === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }, [categoryFilter, focusProductId, products, searchQuery, sortMode]);

  // ── Group into the page's existing category sections ──────────────────
  const sections = useMemo(() => {
    const order = [];
    const map = new Map();
    for (const p of visibleProducts) {
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
  }, [visibleProducts]);

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
      // its $0.50-$500 sanity band.
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
      // and REFUSES an item with variants when no variant_id arrives :
      // guessing would either mischarge the customer or ship them the
      // wrong size: so this field is required, not decorative.
      if (variant.id) item.variantId = variant.id;
      item.description = `${product.description ? `${product.description}: ` : ''}Option: ${variant.label}`;
    } else if (product.description) {
      item.description = product.description;
    }
    return item;
  }, []);

  const handleAddToCart = useCallback(
    (product, variant, quantity) => {
      // Authentication and Zustand persistence hydrate independently. Make
      // ownership assignment part of the same synchronous cart transaction so
      // a fast first click can never persist an authenticated item as a guest
      // and then lose it when the owner effect catches up.
      if (!authResolved) return;
      setCartOwner(user?.id || 'guest');
      const catalogId = product.catalogId || product.key;
      const variantToken = variant?.id || variant?.key || 'standard';
      const line = buildLineItem(product, variant, quantity, { includePrice: true });
      addCartItem({
        ...line,
        id: `${catalogId}::${variantToken}`,
        catalogId,
        name: product.name,
        type: variant?.label ? `Merchandise: ${variant.label}` : 'Merchandise',
        price: firstFiniteNumber([variant?.priceUsd, product.priceUsd]) || 0,
        diamonds:
          firstFiniteNumber([variant?.priceDiamonds, product.priceDiamonds]) ||
          Math.ceil(
            (firstFiniteNumber([variant?.priceUsd, product.priceUsd]) || 0) * DIAMONDS_PER_DOLLAR
          ),
        image: product.image || null,
        variantId: variant?.id || null,
        variantLabel: variant?.label || null,
        quantity,
      });
      captureStoreEvent('add_to_cart', {
        route: 'merch',
        product: catalogId,
        quantity,
        value_usd: firstFiniteNumber([variant?.priceUsd, product.priceUsd]) || 0,
      });
      showStoreToast('success', `${marketplaceCopy(product.name)} Added To Cart.`);
    },
    [addCartItem, authResolved, buildLineItem, setCartOwner, user?.id]
  );

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
      if (!token || !user?.id || wishlistBusyKey || wishlistMutationProcessingRef.current) return;
      const expectedAccountId = user.id;
      if (
        activeAccountIdRef.current !== expectedAccountId ||
        getAuthUser()?.id !== expectedAccountId
      ) {
        showStoreToast('error', 'Your Signed-In Account Changed. Review This Wishlist Again.');
        return;
      }
      const productId = product.catalogId || product.key;
      const wasSaved = wishlistIds.has(productId);
      const attemptId = ++wishlistMutationAttemptRef.current;
      wishlistMutationProcessingRef.current = true;
      const attemptIsCurrent = () =>
        mountedRef.current &&
        wishlistMutationAttemptRef.current === attemptId &&
        activeAccountIdRef.current === expectedAccountId &&
        getAuthUser()?.id === expectedAccountId;
      setWishlistBusyKey(product.key);
      try {
        if (wasSaved) {
          await wishlistService.removeFromWishlist(expectedAccountId, productId);
        } else {
          await wishlistService.addToWishlist(expectedAccountId, {
            id: productId,
            type: 'merchandise',
            name: product.name,
            price: product.priceUsd,
          });
        }
        if (!attemptIsCurrent()) return;
        setWishlistIds((current) => {
          const next = new Set(current);
          if (wasSaved) next.delete(productId);
          else next.add(productId);
          return next;
        });
        showStoreToast('success', wasSaved ? 'Removed From Wishlist' : 'Saved To Wishlist');
      } catch (error) {
        if (!attemptIsCurrent()) return;
        console.warn('[MerchStore] Wishlist update failed:', error?.message || error);
        showStoreToast('error', 'Wishlist Could Not Be Updated. Please Try Again.');
      } finally {
        if (attemptIsCurrent()) {
          wishlistMutationProcessingRef.current = false;
          setWishlistBusyKey(null);
        }
      }
    },
    [requireSignedIn, user?.id, wishlistBusyKey, wishlistIds]
  );

  // ── Card checkout → Stripe ────────────────────────────────────────────
  const handleBuyCard = useCallback(
    async (product, variant, quantity) => {
      if (busyRef.current || cardCheckoutProcessingRef.current) return;
      if (!requireSignedIn()) return;
      const authUser = getAuthUser();
      if (!authUser?.id || authUser.id !== user?.id) {
        showStoreToast('error', 'Your Signed-In Account Changed. Review This Purchase Again.');
        return;
      }
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

      const expectedAccountId = authUser.id;
      const unitPriceUsd = firstFiniteNumber([variant?.priceUsd, product.priceUsd]) || 0;
      const offerConfirmation = merchandiseCheckoutOfferConfirmation(expectedAccountId, [
        {
          id: product.catalogId || product.key,
          variantId: variant?.id || null,
          quantity,
          price: unitPriceUsd,
        },
      ]);
      if (!offerConfirmation) {
        showStoreToast(
          'error',
          'The Current Merchandise Offer Could Not Be Verified. Review It Again.'
        );
        return;
      }

      const attemptId = ++cardCheckoutAttemptRef.current;
      cardCheckoutAbortRef.current?.abort();
      const controller = new AbortController();
      cardCheckoutAbortRef.current = controller;
      cardCheckoutProcessingRef.current = true;
      const attemptIsCurrent = () =>
        mountedRef.current &&
        !controller.signal.aborted &&
        cardCheckoutAttemptRef.current === attemptId &&
        activeAccountIdRef.current === expectedAccountId &&
        getAuthUser()?.id === expectedAccountId;
      setStoreBusy(product.key);
      const commerceIntent = {
        scope: `merch-${product.catalogId || product.key}`,
        userId: expectedAccountId,
        paymentMethod: 'card',
        intent: {
          productId: product.catalogId || product.key,
          variantId: variant?.id || null,
          quantity,
        },
      };
      let checkoutRequestId = null;
      captureStoreEvent('checkout_started', {
        route: 'merch',
        type: 'merchandise',
        product: product.catalogId || product.key,
        quantity,
        value_usd: unitPriceUsd * quantity,
      });
      const post = (includePrice, accessToken) =>
        boundedCommerceFetch('/api/store/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'X-Checkout-Request-ID': checkoutRequestId,
          },
          signal: controller.signal,
          body: JSON.stringify({
            type: 'merchandise',
            items: [buildLineItem(product, variant, quantity, { includePrice })],
            offerConfirmation,
          }),
        });

      try {
        const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: controller.signal,
        });
        if (!authorization || !attemptIsCurrent()) {
          throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
        }
        checkoutRequestId = getOrCreateCommerceRequestId(commerceIntent);
        let res = await post(false, authorization.accessToken);
        let data = await res.json().catch(() => null);
        if (!attemptIsCurrent()) return;

        // Compatibility retry: the deployed endpoint still demands a price
        // on every line item. Retry once with the displayed price: for a
        // catalogued item the server ignores it and charges the DB price.
        const code = errorCodeOf(data);
        if (
          !res.ok &&
          res.status === 400 &&
          product.catalogId &&
          (code === 'INVALID_PRICE' || code === 'INVALID_ITEM')
        ) {
          res = await post(true, authorization.accessToken);
          data = await res.json().catch(() => null);
          if (!attemptIsCurrent()) return;
        }

        if (!res.ok || !data?.success) {
          const checkoutError = new Error(errorMessageOf(data, res.status));
          checkoutError.code = errorCodeOf(data);
          throw checkoutError;
        }
        const checkoutSession = normalizeVerifiedCheckoutSession(
          data,
          checkoutRequestId,
          offerConfirmation
        );
        if (!checkoutSession) {
          throw new Error('Checkout Session Could Not Be Bound To This Purchase Request.');
        }
        const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: controller.signal,
        });
        if (!confirmedAuthorization || !attemptIsCurrent()) {
          throw new Error('Your Signed-In Account Changed. The Checkout Link Was Not Opened.');
        }
        captureStoreEvent('checkout_session_created', {
          route: 'merch',
          type: 'merchandise',
          product: product.catalogId || product.key,
        });
        // Leave the busy state on through the navigation.
        if (!attemptIsCurrent()) return;
        window.location.assign(checkoutSession.url);
      } catch (err) {
        if (err?.name === 'AbortError' || !attemptIsCurrent()) return;
        if (checkoutRequestReplacementRequired(err) && checkoutRequestId) {
          try {
            replaceCommerceRequestId({ ...commerceIntent, expectedRequestId: checkoutRequestId });
          } catch (replacementError) {
            err = replacementError;
          }
        }
        console.warn('[MerchStore] Card checkout failed:', err?.message || err);
        captureStoreEvent('checkout_failed', { route: 'merch', type: 'merchandise' });
        showStoreToast(
          'error',
          marketplaceCopy(err?.message || 'Could Not Start Checkout. Please Try Again.')
        );
      } finally {
        if (
          cardCheckoutAbortRef.current === controller &&
          cardCheckoutAttemptRef.current === attemptId
        ) {
          cardCheckoutAbortRef.current = null;
          cardCheckoutProcessingRef.current = false;
          setStoreBusy(null);
        }
      }
    },
    [requireSignedIn, buildLineItem, setStoreBusy, user?.id]
  );

  // ── Diamond checkout ──────────────────────────────────────────────────
  const handleBuyDiamonds = useCallback(
    (product, variant, quantity) => {
      if (busyRef.current) return;
      const token = requireSignedIn();
      if (!token) return;
      const authUser = getAuthUser();
      if (!authUser?.id || authUser.id !== user?.id) {
        showStoreToast('error', 'Your Signed-In Account Changed. Review This Purchase Again.');
        return;
      }
      if (product.variants.length > 0 && !variant) {
        showStoreToast('error', 'Please Choose A Size Or Option First.');
        return;
      }
      const unitPriceUsd = firstFiniteNumber([variant?.priceUsd, product.priceUsd]) || 0;
      const unitPriceDiamonds =
        firstFiniteNumber([variant?.priceDiamonds, product.priceDiamonds]) ||
        Math.ceil(unitPriceUsd * DIAMONDS_PER_DOLLAR);
      const cost = unitPriceDiamonds * quantity;
      const offerConfirmation = merchandiseDiamondOfferConfirmation(authUser.id, [
        {
          id: product.catalogId || product.key,
          variantId: variant?.id || null,
          quantity,
          unitDiamonds: unitPriceDiamonds,
        },
      ]);
      if (!offerConfirmation || offerConfirmation.totalDiamonds !== cost) {
        showStoreToast(
          'error',
          'The Current Diamond Price Could Not Be Verified. Review This Product Again.'
        );
        return;
      }
      const commerceIntent = {
        scope: `merch-diamonds-${product.catalogId || product.key}`,
        userId: authUser.id,
        paymentMethod: 'diamonds',
        intent: {
          productId: product.catalogId || product.key,
          variantId: variant?.id || null,
          quantity,
        },
      };
      let recovery;
      let purchaseRequestId;
      try {
        recovery = inspectCommerceRequestRecovery(commerceIntent);
        if (recovery.status === 'terms-changed') {
          throw new Error(
            'An Earlier Protected Purchase Uses Different Terms. Verify It Before Starting Another.'
          );
        }
        const purchaseWasResumed = recovery.status === 'recoverable';
        if (!purchaseWasResumed && Number(balance || 0) < cost) {
          showStoreToast(
            'error',
            `Not Enough Diamonds: ${fmt(cost)} Needed, You Have ${fmt(balance)}.`
          );
          return;
        }
        purchaseRequestId = purchaseWasResumed
          ? recovery.requestId
          : getOrCreateCommerceRequestId(commerceIntent);
        if (!purchaseRequestId) {
          throw new Error('Secure Purchase Recovery Could Not Verify The Protected Request.');
        }
        setPendingDiamondPurchase({
          product,
          variant,
          quantity,
          cost,
          requiresShipping: product.requiresShipping !== false,
          commerceIntent,
          purchaseRequestId,
          purchaseWasResumed,
          offerConfirmation,
        });
      } catch (error) {
        showStoreToast(
          'error',
          marketplaceCopy(
            error?.message || 'Secure Purchase Recovery Is Unavailable. Please Try Again.'
          )
        );
        return;
      }
      captureStoreEvent('diamond_purchase_reviewed', {
        route: 'merch',
        product: product.catalogId || product.key,
        quantity,
        diamonds: cost,
      });
    },
    [balance, requireSignedIn, user?.id]
  );

  const confirmDiamondPurchase = useCallback(
    async (shipping = null) => {
      if (!pendingDiamondPurchase || busyRef.current) return;
      const expectedAccountId = pendingDiamondPurchase.commerceIntent?.userId || null;
      const authUser = getAuthUser();
      if (
        !expectedAccountId ||
        !authUser?.id ||
        authUser.id !== expectedAccountId ||
        activeAccountIdRef.current !== expectedAccountId
      ) {
        setPendingDiamondPurchase(null);
        showStoreToast('error', 'Your Signed-In Account Changed. Review This Purchase Again.');
        return;
      }

      const { product, variant, quantity, cost, offerConfirmation } = pendingDiamondPurchase;
      const purchaseWasResumed = pendingDiamondPurchase.purchaseWasResumed === true;
      const attemptId = ++diamondPurchaseAttemptRef.current;
      diamondPurchaseAbortRef.current?.abort();
      const controller = new AbortController();
      diamondPurchaseAbortRef.current = controller;
      const attemptIsCurrent = () =>
        mountedRef.current &&
        !controller.signal.aborted &&
        diamondPurchaseAttemptRef.current === attemptId &&
        activeAccountIdRef.current === expectedAccountId &&
        getAuthUser()?.id === expectedAccountId;

      setStoreBusy(product.key);
      try {
        const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: controller.signal,
        });
        if (!authorization || !attemptIsCurrent()) {
          throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
        }
        const durableRequestId = getOrCreateCommerceRequestId(
          pendingDiamondPurchase.commerceIntent
        );
        if (durableRequestId !== pendingDiamondPurchase.purchaseRequestId) {
          setPendingDiamondPurchase((current) =>
            current?.commerceIntent === pendingDiamondPurchase.commerceIntent
              ? { ...current, purchaseRequestId: durableRequestId, purchaseWasResumed: true }
              : current
          );
          throw new Error('Secure Purchase Recovery Was Refreshed. Review And Confirm Again.');
        }
        captureStoreEvent('diamond_purchase_started', {
          route: 'merch',
          product: product.catalogId || product.key,
          quantity,
          diamonds: cost,
        });
        setPendingDiamondPurchase((current) =>
          current?.commerceIntent === pendingDiamondPurchase.commerceIntent
            ? { ...current, purchaseWasResumed: true }
            : current
        );
        const purchaseLine = buildLineItem(product, variant, quantity, { includePrice: false });
        const res = await boundedCommerceFetch('/api/store/purchase-with-diamonds', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authorization.accessToken}`,
            'X-Idempotency-Key': durableRequestId,
          },
          signal: controller.signal,
          // The server still prices from the locked catalog. This immutable
          // confirmation is the exact total the player reviewed, so a reprice
          // is refused before any Diamond debit instead of silently charging
          // the new amount.
          body: JSON.stringify({
            items: [purchaseLine],
            offerConfirmation,
            ...(pendingDiamondPurchase.requiresShipping ? { shipping } : {}),
          }),
        });
        const data = await res.json().catch(() => null);
        const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: controller.signal,
        });
        if (!confirmedAuthorization || !attemptIsCurrent()) {
          throw new Error(
            'Your Signed-In Account Changed. The Original Purchase Still Needs Verification.'
          );
        }

        if (!res.ok || !data?.success) {
          const refusal = classifyMerchDiamondPurchaseRefusal(res.status, data, {
            accountId: expectedAccountId,
            requestId: durableRequestId,
          });
          if (refusal.definitive && !purchaseWasResumed) {
            try {
              const replacementRequestId = replaceCommerceRequestId({
                ...pendingDiamondPurchase.commerceIntent,
                expectedRequestId: durableRequestId,
              });
              setPendingDiamondPurchase((current) =>
                current?.commerceIntent === pendingDiamondPurchase.commerceIntent
                  ? {
                      ...current,
                      purchaseRequestId: replacementRequestId,
                      purchaseWasResumed: false,
                    }
                  : current
              );
            } catch (persistenceError) {
              setPendingDiamondPurchase(null);
              throw persistenceError;
            }
          }
          const details = data?.details;
          if (details && details.required != null && details.current != null) {
            const insufficientError = new Error(
              `Not Enough Diamonds: ${fmt(details.required)} Needed, You Have ${fmt(details.current)}` +
                (details.shortfall != null ? ` (${fmt(details.shortfall)} short).` : '.')
            );
            insufficientError.definitive = refusal.definitive;
            throw insufficientError;
          }
          const purchaseError = new Error(errorMessageOf(data, res.status));
          purchaseError.definitive = refusal.definitive;
          throw purchaseError;
        }

        const verifiedPurchase = normalizeVerifiedMerchDiamondPurchase(data, {
          accountId: expectedAccountId,
          requestId: durableRequestId,
          units: quantity,
          diamondsSpent: cost,
          items: [purchaseLine],
        });
        if (!verifiedPurchase) {
          throw new Error(
            'Purchase Status Is Uncertain. Confirm Again To Verify The Original Order.'
          );
        }
        const replayed = verifiedPurchase.idempotent;
        const spent = verifiedPurchase.diamondsSpent;
        const recoveryRetired = clearCommerceRequestId({
          ...pendingDiamondPurchase.commerceIntent,
          expectedRequestId: durableRequestId,
        });
        captureStoreEvent('diamond_purchase_complete', {
          route: 'merch',
          product: product.catalogId || product.key,
          quantity,
          diamonds_spent: spent,
          idempotent: replayed,
          recovery_retired: recoveryRetired,
        });
        showStoreToast(
          recoveryRetired ? 'success' : 'warning',
          recoveryRetired
            ? replayed
              ? 'Order Already Placed: No Additional Diamonds Were Deducted.'
              : `Order Placed! ${fmt(spent)} Diamonds Deducted.`
            : 'Order Was Placed And Your Balance Was Updated, But Secure Purchase Recovery Could Not Be Cleared. Do Not Submit This Purchase Again.'
        );
        // There used to be a `new Audio('/sounds/purchase-success.mp3')` here.
        // That file has never existed in this repository: production answers
        // 404 and git has no record of it at any revision. The only thing it
        // did was log a warning on every successful purchase. The success
        // toast above is the confirmation.

        if (!replayed) busEmit.diamondsSpent(spent, 'Merch Store Purchase');
        setBalance(verifiedPurchase.newBalance);
        broadcastSync('smarter_poker_diamond_sync', 'refresh');
        broadcastSync('smarter_poker_chips_sync', 'refresh');
        if (mountedRef.current) setPendingDiamondPurchase(null);
        // Stock may have moved: pull the catalog again.
        if (mountedRef.current) setReloadToken((t) => t + 1);
      } catch (err) {
        console.warn('[MerchStore] Diamond purchase failed:', err?.message || err);
        if (!attemptIsCurrent()) return;
        showStoreToast(
          'error',
          marketplaceCopy(err?.message || 'Diamond Purchase Failed. Please Try Again.')
        );
      } finally {
        if (diamondPurchaseAbortRef.current === controller) {
          diamondPurchaseAbortRef.current = null;
          setStoreBusy(null);
        }
      }
    },
    [pendingDiamondPurchase, buildLineItem, setBalance, setStoreBusy, user?.id]
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <style jsx global>{`
        article[data-merch-product-card='true']:target {
          outline: 2px solid #8befff;
          outline-offset: 5px;
          box-shadow:
            0 0 0 8px rgba(0, 200, 255, 0.1),
            0 24px 58px rgba(0, 168, 255, 0.42) !important;
        }
        @media (prefers-reduced-motion: reduce) {
          article[data-merch-product-card='true']:target {
            scroll-behavior: auto;
          }
        }
        .merch-discovery-controls {
          grid-template-columns: minmax(220px, 1fr) minmax(170px, 0.45fr);
        }
        @media (max-width: 620px) {
          .merch-discovery-controls {
            grid-template-columns: minmax(0, 1fr);
          }
          .merch-discovery-controls > * {
            grid-column: 1 !important;
          }
        }
      `}</style>
      {/* A div with no role is generic, and assistive technology drops a name
          on it. In detail mode this console is a named area the page links to,
          so it is announced as the region it already reads as. */}
      <div
        id={detailMode ? 'purchase-console' : undefined}
        role={detailMode ? 'region' : undefined}
        aria-label={detailMode ? 'Live Product Purchase Console' : undefined}
        className={merchStyles.storefront}
        style={detailMode ? { scrollMarginTop: 96 } : undefined}
      >
        {!detailMode && (
          <div style={styles.intro} className={merchStyles.intro}>
            <h2 className={merchStyles.storeTitle}>Official Merch</h2>
            <p className={merchStyles.storeIntro}>
              Neural Steel Apparel, Headwear, Table Gear, And Lifestyle Products Are Created After
              Purchase, Then Packed And Shipped Directly By A Fulfillment Partner. We Never Hold Or
              Ship Inventory.
            </p>

            {user?.id && (
              <div className={merchStyles.balanceReadout}>
                Diamond Balance <strong>{fmt(balance)}</strong>
              </div>
            )}
            {isOperator && (
              <div style={{ marginTop: 12 }}>
                <Link href="/hub/merch-store/fulfillment" className={merchStyles.operatorLink}>
                  Open Protected Fulfillment Command Vault
                </Link>
              </div>
            )}
          </div>
        )}

        {detailMode && (
          <div role="status" aria-live="polite" className={merchStyles.detailStatus}>
            <span>
              Live Price, Option, Stock, Wishlist, Cart, Card, And Diamond Controls Are Verified
              Below.
            </span>
            <span className={merchStyles.detailWallet}>
              {user?.id ? `Wallet: ${fmt(balance)} Diamonds` : 'Sign In To Purchase'}
            </span>
          </div>
        )}

        {!detailMode && (
          <section
            className={`merch-discovery-controls ${merchStyles.discoveryControls}`}
            aria-label="Browse Marketplace Gear"
            data-console-surface="merch-discovery"
          >
            <label className={merchStyles.searchControl}>
              <span className="sr-only">Search Marketplace Gear</span>
              <input
                data-preserve-case="true"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search Marketplace Gear"
                aria-label="Search Marketplace Gear"
                className={merchStyles.searchInput}
              />
            </label>
            <label className={merchStyles.sortControl}>
              Sort Products
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
                aria-label="Sort Products"
                className={merchStyles.sortSelect}
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: Low To High</option>
                <option value="price-high">Price: High To Low</option>
                <option value="name">Name</option>
              </select>
            </label>
            <div
              role="group"
              aria-label="All Categories"
              style={{ gridColumn: '1 / -1', display: 'flex', gap: 7, flexWrap: 'wrap' }}
            >
              {['all', ...categories].map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategoryFilter(category)}
                  aria-pressed={categoryFilter === category}
                  className={`${merchStyles.categoryControl} ${categoryFilter === category ? merchStyles.categoryControlSelected : ''}`}
                >
                  {category === 'all' ? 'All Categories' : categoryLabel(category)}
                </button>
              ))}
            </div>
            <div aria-live="polite" className={merchStyles.resultCount}>
              Showing {visibleProducts.length} Of {products.length} Products
            </div>
          </section>
        )}

        {usingFallback && loadError && (
          <div role="alert" className={merchStyles.catalogAlert}>
            <span style={{ flex: 1 }}>
              {marketplaceCopy(loadError)}: Showing The Standard Lineup. Live Fulfillment Options
              Are Required Before Checkout.
            </span>
            <button
              type="button"
              onClick={() => setReloadToken((t) => t + 1)}
              disabled={loading}
              className={`${merchStyles.actionControl} ${merchStyles.actionSecondary}`}
            >
              {loading ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        )}

        {loading && (
          <div role="status" aria-live="polite" className={merchStyles.loadingStatus}>
            Verifying Live Prices, Options, And Stock...
          </div>
        )}

        {!loading && products.length === 0 && (
          <div role="status" className={merchStyles.emptyState}>
            <div className={merchStyles.emptyStateTitle}>No Merch Available Right Now</div>
            <div style={{ marginTop: 6 }}>New Gear Drops Regularly: Check Back Soon.</div>
          </div>
        )}

        {!loading && products.length > 0 && visibleProducts.length === 0 && (
          <div role="status" className={merchStyles.emptyState}>
            No Products Match Those Filters. Clear The Search Or Choose All Categories.
          </div>
        )}

        {sections.map((section) => (
          <div key={section.key} style={styles.merchSection}>
            {!detailMode && <h3 className={merchStyles.categoryTitle}>{section.label}</h3>}
            <div style={styles.merchGrid}>
              {section.items.map((product, productIndex) => (
                <MerchProductCard
                  key={product.key}
                  product={product}
                  balance={balance}
                  hasUser={!!user?.id}
                  cartReady={authResolved}
                  busyKey={busyKey}
                  wishlistBusyKey={wishlistBusyKey}
                  isWishlisted={wishlistIds.has(product.catalogId || product.key)}
                  onToggleWishlist={toggleWishlist}
                  onAddToCart={handleAddToCart}
                  onBuyCard={handleBuyCard}
                  onBuyDiamonds={handleBuyDiamonds}
                  mediaPriority={section.key === sections[0]?.key && productIndex < 2}
                  headingLevel={detailMode ? 3 : 4}
                />
              ))}
            </div>
          </div>
        ))}

        {!detailMode && products.length > 0 && (
          <p className={merchStyles.legalCopy}>
            Card And Diamond Orders Ship To The United States And Canada. A Shipping Address Is
            Collected Securely Before A Physical Order Is Placed.
          </p>
        )}
      </div>

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
