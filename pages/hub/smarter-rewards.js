/* /hub/smarter-rewards: the Smarter Rewards tab as a real page.
   Thin wrapper over the single store implementation. See vip-membership.js for
   why this is a wrapper and not a fork. */

import DiamondStorePage from './diamond-store';

export default function SmarterRewardsPage(props) {
  return <DiamondStorePage {...props} initialTab="rewards" />;
}

/* The wrapper must re-export the store's own getServerSideProps. Without it
   this route is statically optimized: it first-paints the hardcoded fallback
   price table instead of the live database catalog, and it loses the store's
   deliberate `private, no-store` header. */
export { getServerSideProps } from './diamond-store';
