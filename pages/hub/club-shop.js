/* /hub/club-shop — the Club Shop tab as a real page.
   Thin wrapper over the single store implementation. See vip-membership.js for
   why this is a wrapper and not a fork. The store's own effect lazily loads
   club-shop data whenever activeTab === 'club-shop', so landing here directly
   fetches it without any extra wiring. */

import DiamondStorePage from './diamond-store';

export default function ClubShopPage() {
  return <DiamondStorePage initialTab="club-shop" />;
}
