import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../src/components/store/MarketplaceDetailExperience.module.css';
import { MERCHANDISE } from '../../../src/data/diamondStoreData';

const LEGACY_IMAGE = '/images/merch/neural-steel/legacy-tabletop-atlas.webp';

export default function MerchProductDetail({ product }) {
  const diamondPrice = Math.round(Number(product.price) * 100);
  const canonical = `/hub/merch-store/${product.id}`;
  const image = product.image.startsWith('/merch/') ? LEGACY_IMAGE : product.image;

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: [`https://smarter.poker${image}`],
    description: product.description,
    sku: product.id,
    brand: { '@type': 'Brand', name: 'Smarter.Poker' },
    offers: {
      '@type': 'Offer',
      url: `https://smarter.poker${canonical}`,
      priceCurrency: 'USD',
      price: Number(product.price).toFixed(2),
      availability: 'https://schema.org/InStock',
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
      imageAlt={`${product.name} in the Smarter.Poker neural steel collection`}
      breadcrumbs={[
        { label: 'Marketplace', href: '/hub/diamond-store' },
        { label: 'Merch Store', href: '/hub/merch-store' },
        { label: product.name, href: canonical },
      ]}
      price={product.price}
      diamondPrice={diamondPrice}
      actions={
        <>
          <Link href={`/hub/merch-store#merch-product-${product.id}`}>
            <ShoppingCart size={16} aria-hidden="true" /> Configure And Add To Cart
          </Link>
          <Link href="/hub/diamond-store/cart">Buy With Card Or Diamonds</Link>
        </>
      }
      structuredData={[productSchema, breadcrumbSchema]}
    >
      <div className={detailStyles.detailGrid}>
        <section className={detailStyles.detailCard}>
          <h2>Casino-Grade Detail</h2>
          <p>
            Built around the blackened-steel, cold-blue-light visual system used across Smarter.Poker. This item is presented with the same hard-edged frames and verified marketplace controls as the rest of the collection.
          </p>
          <ul>
            <li>Official Smarter.Poker neural steel design</li>
            <li>Made-to-order fulfillment prevents stale inventory</li>
            <li>Card and diamond pricing stay visible before checkout</li>
          </ul>
        </section>
        <section className={detailStyles.detailCard}>
          <h2>Purchase Protocol</h2>
          <p>
            Add this item to the shared marketplace cart, then settle the order with Stripe or your Smarter.Poker diamond wallet. Variant and shipping selections are confirmed before the order is finalized.
          </p>
          <p>Diamond equivalent: <strong>{diamondPrice.toLocaleString()} Diamonds</strong>.</p>
        </section>
      </div>
      <div className={detailStyles.assuranceGrid}>
        <div><strong>Secure Checkout</strong><span>Stripe-hosted card settlement and verified wallet authorization.</span></div>
        <div><strong>Order Telemetry</strong><span>Track order state from the marketplace Orders page.</span></div>
        <div><strong>Same-Surface Flow</strong><span>Details, cart, checkout return, and account records remain inside Smarter.Poker.</span></div>
      </div>
    </MarketplaceDetailExperience>
  );
}

export function getStaticPaths() {
  return {
    paths: MERCHANDISE.map((product) => ({ params: { productId: product.id } })),
    fallback: false,
  };
}

export function getStaticProps({ params }) {
  const product = MERCHANDISE.find((item) => item.id === params.productId);
  return product ? { props: { product } } : { notFound: true };
}
