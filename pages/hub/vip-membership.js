/* ═══════════════════════════════════════════════════════════════════════════
   /hub/vip-membership — the VIP tab as a real page
   ═══════════════════════════════════════════════════════════════════════════
   Dan 2026-08-25: "Each tab should open to a new page, and tab, not just stay
   within the diamond-store slug."

   This is a thin wrapper, deliberately. The store is one 3,000-line component
   with five views; forking it into five copies would guarantee they drift, and
   the VIP benefits table would be the first thing to go stale. So the store
   keeps a single implementation and gains five addresses into it.

   `initialTab` wins over both the persisted `diamond-store` filter and any
   stale `?tab=` in the URL — a user who opened the VIP URL gets the VIP tab,
   not whatever they were looking at last time.
   ═══════════════════════════════════════════════════════════════════════════ */

import DiamondStorePage from './diamond-store';

export default function VipMembershipPage() {
  return <DiamondStorePage initialTab="vip" />;
}
