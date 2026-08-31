import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../src/components/store/MarketplaceDetailExperience.module.css';
import MerchStore from '../../../src/components/store/MerchStore';
import { MERCHANDISE } from '../../../src/data/diamondStoreData';
import { useAuthUser } from '../../../src/lib/authUtils';
import { createClient as createServerClient } from '../../../src/lib/supabaseServerClient';

const LEGACY_IMAGE = '/images/merch/neural-steel/legacy-tabletop-atlas.webp';
const FALLBACK_IMAGE = '/images/store-v3/merch-hero.webp';
const STATIC_DETAIL_IMAGES = {
  'hoodie-neural': ['/images/merch/neural-steel/print/diamond-altitude.png'],
  'tshirt-gto': ['/images/merch/neural-steel/print/royal-circuit.png'],
  'hat-diamond': ['/images/merch/neural-steel/print/brain-spade-embroidery.png'],
};

function publicImage(value) {
  if (typeof value !== 'string' || !value.trim()) return FALLBACK_IMAGE;
  const candidate = value.trim();
  if (candidate.startsWith('/merch/')) return LEGACY_IMAGE;
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.toString() : FALLBACK_IMAGE;
  } catch (_) {
    return FALLBACK_IMAGE;
  }
}

function absoluteImage(value) {
  return /^https:\/\//i.test(value) ? value : `https://smarter.poker${value}`;
}

function publicGallery(primary, values = []) {
  const candidates = [primary, ...(Array.isArray(values) ? values : [])]
    .map(publicImage)
    .filter(Boolean);
  return [...new Set(candidates)].slice(0, 8);
}

function staticProduct(product) {
  if (!product) return null;
  return {
    ...product,
    image: publicImage(product.image),
    galleryImages: publicGallery(product.image, STATIC_DETAIL_IMAGES[product.id]),
    priceDiamonds: Math.round(Number(product.price || 0) * 100),
    inStock: true,
    fulfillmentReady: true,
    automaticFulfillmentReady: false,
    fulfillmentProvider: null,
  };
}

async function catalogProduct(productId, signal) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createServerClient(url, key);
  const { data: item, error } = await supabase
    .from('merchandise_items')
    .select('id, name, description, category, image_url, price_usd, price_diamonds, stock, has_variants, metadata')
    .eq('id', productId)
    .eq('is_active', true)
    .abortSignal(signal)
    .maybeSingle();
  if (error || !item) return null;

  const { data: variants, error: variantError } = item.has_variants
    ? await supabase
        .from('merchandise_item_variants')
        .select('id, sku, size, color, price_usd, price_diamonds, stock, sort_order, metadata')
        .eq('item_id', productId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .abortSignal(signal)
    : { data: [], error: null };
  if (variantError) return null;

  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const fulfillmentProvider = metadata.fulfillment_provider || null;
  const fulfillmentReady = true;
  let automaticFulfillmentReady = false;
  let printfulReady = false;
  let resolvePrintfulMapping = null;
  if (fulfillmentProvider === 'printful') {
    const printful = require('../../../src/lib/store/printfulFulfillment');
    printfulReady = printful.isPrintfulReady();
    resolvePrintfulMapping = printful.resolvePrintfulMapping;
    if (printfulReady) {
      automaticFulfillmentReady = item.has_variants
        ? (variants || []).some((variant) => Boolean(resolvePrintfulMapping(null, variant.metadata)))
        : Boolean(resolvePrintfulMapping(metadata, null));
    }
  }

  const variantStock = (variants || []).reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0);
  const inStock = item.has_variants
    ? variantStock > 0
    : item.stock == null || Number(item.stock) > 0;
  const price = Number(item.price_usd);
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    id: item.id,
    name: item.name,
    description: item.description || 'Official Smarter.Poker marketplace equipment.',
    category: item.category || 'equipment',
    image: publicImage(item.image_url),
    galleryImages: publicGallery(item.image_url, metadata.gallery_images),
    price,
    priceDiamonds: Math.max(1, Number(item.price_diamonds) || Math.ceil(price * 100)),
    inStock,
    hasVariants: item.has_variants === true,
    variants: (variants || []).map((variant) => {
      const variantPrice = Number(variant.price_usd);
      const resolvedPrice = Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : price;
      return {
        id: variant.id,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        priceUsd: resolvedPrice,
        priceDiamonds: Math.max(
          1,
          Number(variant.price_diamonds) || Math.ceil(resolvedPrice * 100)
        ),
        stock: Math.max(0, Number(variant.stock) || 0),
        fulfillmentReady: true,
        automaticFulfillmentReady:
          fulfillmentProvider === 'printful'
          && printfulReady
          && Boolean(resolvePrintfulMapping?.(null, variant.metadata)),
      };
    }),
    fulfillmentReady,
    automaticFulfillmentReady,
    fulfillmentProvider,
  };
}

async function boundedCatalogProduct(productId, timeoutMs = 5000) {
  const controller = new AbortController();
  let timer = null;
  try {
    return await Promise.race([
      catalogProduct(productId, controller.signal),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function MerchProductDetail({ product }) {
  const { user, loading: authLoading } = useAuthUser();
  const diamondPrice = Number(product.priceDiamonds) || Math.round(Number(product.price) * 100);
  const canonical = `/hub/merch-store/${product.id}`;
  const image = publicImage(product.image);
  const galleryImages = publicGallery(image, product.galleryImages);
  const available = product.inStock !== false && product.fulfillmentReady === true;
  const inventoryStatus = available
    ? 'Available For Card Or Diamonds'
    : product.inStock === false
      ? 'Sold Out'
      : 'Preview: Fulfillment Pending';

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: galleryImages.map(absoluteImage),
    description: product.description,
    sku: product.id,
    brand: { '@type': 'Brand', name: 'Smarter.Poker' },
    offers: {
      '@type': 'Offer',
      url: `https://smarter.poker${canonical}`,
      priceCurrency: 'USD',
      price: Number(product.price).toFixed(2),
      availability: available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Marketplace', item: 'https://smarter.poker/hub/diamond-store' },
      { '@type': 'ListItem', position: 2, name: 'Merch Store', item: 'https://smarter.poker/hub/merch-store' },
      { '@type': 'ListItem', position: 3, name: product.name, item: `https://smarter.poker${canonical}` },
    ],
  };

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title={product.name}
      description={product.description}
      eyebrow={`${product.category} / neural steel collection`}
      image={image}
      galleryImages={galleryImages}
      imageAlt={`${product.name} in the Smarter.Poker neural steel collection`}
      breadcrumbs={[
        { label: 'Marketplace', href: '/hub/diamond-store' },
        { label: 'Merch Store', href: '/hub/merch-store' },
        { label: product.name, href: canonical },
      ]}
      price={product.price}
      diamondPrice={diamondPrice}
      status={inventoryStatus}
      actions={
        <>
          <Link href="#purchase-console">
            <ShoppingCart size={16} aria-hidden="true" /> Open Purchase Console
          </Link>
          <Link href="/hub/diamond-store/cart">Open Shared Cart</Link>
        </>
      }
      structuredData={[productSchema, breadcrumbSchema]}
      openGraphType="product"
    >
      <div className={detailStyles.detailGrid}>
        <section className={detailStyles.detailCard}>
          <h2>Casino-Grade Detail</h2>
          <p>
            Built Around The Blackened-Steel, Cold-Blue-Light Visual System Used Across Smarter.Poker. This Item Is Presented With The Same Hard-Edged Frames And Verified Marketplace Controls As The Rest Of The Collection.
          </p>
          <ul>
            <li>Official Smarter.Poker Neural Steel Design</li>
            <li>Live Fulfillment Readiness And Stock Are Revalidated Before Checkout</li>
            <li>Card And Diamond Pricing Stay Visible Before Checkout</li>
          </ul>
        </section>
        <section className={detailStyles.detailCard}>
          <h2>Purchase Protocol</h2>
          <p>
            Add This Item To The Shared Marketplace Cart, Then Settle The Order With Stripe Or Your Smarter.Poker Diamond Wallet. Variant And Shipping Selections Are Confirmed Before The Order Is Finalized.
          </p>
          <p>Diamond Equivalent: <strong>{diamondPrice.toLocaleString()} Diamonds</strong>.</p>
        </section>
      </div>
      <div className={detailStyles.assuranceGrid}>
        <div><strong>Secure Checkout</strong><span>Stripe-Hosted Card Settlement And Verified Wallet Authorization.</span></div>
        <div><strong>Order Telemetry</strong><span>Track Order State From The Marketplace Orders Page.</span></div>
        <div><strong>Same-Surface Flow</strong><span>Details, Cart, Checkout Return, And Account Records Remain Inside Smarter.Poker.</span></div>
      </div>
      <section aria-labelledby="purchase-console-title">
        <div className={detailStyles.detailCard}>
          <h2 id="purchase-console-title">Live Purchase Console</h2>
          <p>
            Choose The Current Option, Save The Item, Add It To The Shared Cart, Or Use Either
            Settlement Path From This Page. Orders Enter Automatic Fulfillment When Connected;
            Otherwise They Enter The Audited Manual Fulfillment Queue.
          </p>
        </div>
        <MerchStore
          user={user}
          authResolved={!authLoading}
          focusProductId={product.id}
          detailMode
          initialProduct={product}
          catalogCategory={product.category}
        />
      </section>
    </MarketplaceDetailExperience>
  );
}

export function getStaticPaths() {
  return {
    paths: MERCHANDISE.map((product) => ({ params: { productId: product.id } })),
    // Stable Admin can publish a catalog row without a code deployment. The
    // first request builds that item's full detail page and ISR keeps it fresh.
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const productId = typeof params?.productId === 'string' ? params.productId.trim() : '';
  if (!/^[a-z0-9][a-z0-9_-]{0,159}$/i.test(productId)) {
    return { notFound: true, revalidate: 60 };
  }

  let product = null;
  try {
    product = await boundedCatalogProduct(productId);
  } catch (error) {
    console.warn('[merch-product-detail] Live catalog lookup failed:', error?.message || error);
  }
  product ||= staticProduct(MERCHANDISE.find((item) => item.id === productId));
  return product
    ? { props: { product }, revalidate: 300 }
    : { notFound: true, revalidate: 60 };
}
