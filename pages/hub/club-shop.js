/* /hub/club-shop: the Club Shop tab as a real page.
   Thin wrapper over the single store implementation. See vip-membership.js for
   why this is a wrapper and not a fork. The store's own effect lazily loads
   club-shop data whenever activeTab === 'club-shop', so landing here directly
   fetches it without any extra wiring. */

import DiamondStorePage from './diamond-store';

export default function ClubShopPage(props) {
  return <DiamondStorePage {...props} initialTab="club-shop" />;
}

/* The wrapper must re-export the store's own getServerSideProps. Without it
   this route is statically optimized: it first-paints the hardcoded fallback
   price table instead of the live database catalog, and it loses the store's
   deliberate `private, no-store` header. */
export { getServerSideProps } from './diamond-store';
