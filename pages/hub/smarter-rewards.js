/* /hub/smarter-rewards — the Smarter Rewards tab as a real page.
   Thin wrapper over the single store implementation. See vip-membership.js for
   why this is a wrapper and not a fork. */

import DiamondStorePage from './diamond-store';

export default function SmarterRewardsPage() {
  return <DiamondStorePage initialTab="rewards" />;
}
