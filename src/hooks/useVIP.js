/**
 * useVIP — Centralized VIP Status Hook
 * ═══════════════════════════════════════════════════════════════════════
 * Single source of truth for VIP status across the entire app.
 * Wraps AvatarContext.isVip with additional optimistic caching via
 * localStorage for instant rendering on page load.
 *
 * EVERY component that needs VIP status MUST use this hook instead of:
 *   - DiamondEngine.isVIP()
 *   - Direct profiles.is_vip queries
 *   - getAuthUser().user_metadata.is_vip
 *
 * The underlying truth chain:
 *   AvatarContext → /api/vip/check-status (service role key) → profiles.is_vip
 * ═══════════════════════════════════════════════════════════════════════
 */

import { useEffect } from 'react';
import { useAvatar } from '../contexts/AvatarContext';

const VIP_CACHE_KEY = 'sp-vip-status';

/**
 * @returns {{ isVip: boolean, user: object|null, userId: string|null, initializing: boolean, vipResolved: boolean }}
 */
export default function useVIP() {
  const { user, isVip: contextIsVip, vipResolved, initializing } = useAvatar();

  // ═══════════════════════════════════════════════════════════════════
  // Optimistic cache: while AvatarContext is initializing, use the
  // last-known VIP status from localStorage to prevent false lockouts.
  // Once AvatarContext finishes, its answer is authoritative and we
  // update the cache for next time.
  // ═══════════════════════════════════════════════════════════════════
  let isVip = contextIsVip;

  if (initializing && typeof window !== 'undefined') {
    // Use cached value while waiting for server verification
    const cached = localStorage.getItem(VIP_CACHE_KEY);
    if (cached === 'true') {
      isVip = true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // BUGFIX (2026-08-12): a signed-in user whose VIP answer has not landed
  // yet is UNKNOWN, not not-VIP.
  //
  // AvatarContext keeps two separate flags on purpose. `initializing` means
  // auth has settled; `vipResolved` means /api/vip/check-status has answered.
  // Its own comment is explicit: consumers that must not paywall a real VIP
  // should wait on vipResolved, because "an unresolved VIP state means
  // unknown, not no". isVip is hard-coded false until that answer lands (it
  // must not be seeded from the devtools-writable localStorage cache).
  //
  // This hook never exposed vipResolved, so the two consumers that gate on
  // readiness -- StrategyTrivia and useVIPGate -- could only wait on
  // `initializing`, which goes false ~1s early. Measured on production
  // against a VIP account, the trivia start button was enabled at t=1054ms
  // while isVip was still false and only flipped true at t=2060ms. Clicking
  // inside that window took StrategyTrivia's `if (!isVip && entryCost > 0)`
  // branch and charged a paying member 10 diamonds -- four such game_cost
  // rows are in diamond_transactions -- while the Diamond Cost modal
  // promises VIP members unlimited free games.
  //
  // Folding the unknown state into the initializing flag we report fixes
  // every current consumer without touching a single call site. Both are VIP
  // gates, where "unknown" must behave as "keep waiting", never as "charge
  // them". isVip itself is deliberately left alone so the security property
  // above (no localStorage seeding of the authoritative value) still holds.
  // ═══════════════════════════════════════════════════════════════════
  const vipUnknown = Boolean(user?.id) && vipResolved === false;
  const effectiveInitializing = initializing || vipUnknown;

  // Persist authoritative answer for optimistic rendering next load.
  // Runs in an effect (not during render) so the hook stays a pure function of its inputs.
  useEffect(() => {
    if (!initializing && typeof window !== 'undefined') {
      try {
        localStorage.setItem(VIP_CACHE_KEY, String(contextIsVip));
      } catch (_) {
        console.warn('[App] Handled exception:', _?.message || _);
      }
    }
  }, [initializing, contextIsVip]);

  return {
    isVip,
    user,
    userId: user?.id || null,
    initializing: effectiveInitializing,
    // Exposed so callers can distinguish "auth still settling" from
    // "auth done, VIP answer still in flight" when they need to.
    vipResolved,
  };
}
