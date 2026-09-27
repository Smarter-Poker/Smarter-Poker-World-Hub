/* ═══════════════════════════════════════════════════════════════════════════
   /hub/vip-membership : the VIP tab as a real page
   ═══════════════════════════════════════════════════════════════════════════
   Each Marketplace destination owns a real internal page. Navigation stays in
   the current browser tab and never falls back to the diamond-store slug.

   This is a thin wrapper, deliberately. The store is one 3,000-line component
   with five views; forking it into five copies would guarantee they drift, and
   the VIP benefits table would be the first thing to go stale. So the store
   keeps a single implementation and gains five addresses into it.

   `initialTab` wins over both the persisted `diamond-store` filter and any
   stale `?tab=` in the URL : a user who opened the VIP URL gets the VIP tab,
   not whatever they were looking at last time.
   ═══════════════════════════════════════════════════════════════════════════ */

import DiamondStorePage from './diamond-store';

export default function VipMembershipPage(props) {
  return <DiamondStorePage {...props} initialTab="vip" />;
}

/* The wrapper must re-export the store's own getServerSideProps. Without it
   this route is statically optimized: it first-paints the hardcoded fallback
   price table instead of the live database catalog, and it loses the store's
   deliberate `private, no-store` header. */
export { getServerSideProps } from './diamond-store';
