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

import { useAvatar } from '../contexts/AvatarContext';

const VIP_CACHE_KEY = 'sp-vip-status';

/**
 * @returns {{ isVip: boolean, user: object|null, userId: string|null, initializing: boolean }}
 */
export default function useVIP() {
    const { user, isVip: contextIsVip, initializing } = useAvatar();

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

    // Persist authoritative answer for optimistic rendering next load
    if (!initializing && typeof window !== 'undefined') {
        try {
            localStorage.setItem(VIP_CACHE_KEY, String(contextIsVip));
        } catch (_) {
            // localStorage full or blocked — non-critical
        }
    }

    return {
        isVip,
        user,
        userId: user?.id || null,
        initializing,
    };
}
