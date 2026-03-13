/**
 * ═══════════════════════════════════════════════════════════════════
 * Z-INDEX AUTHORITY — ORB-8 (The Artist)
 * ═══════════════════════════════════════════════════════════════════
 *
 * THE single source of truth for z-index values across the entire
 * Smarter.Poker platform. No component may use a raw zIndex number
 * without importing from this file.
 *
 * TIER SYSTEM (lowest → highest):
 *   BASE          (0)      — Table felt, background elements
 *   CARD_CONTENT  (2)      — Text overlays on card images
 *   CARD_BADGE    (5)      — Variant badges, LIVE indicators
 *   CARD_ELEVATED (10)     — Seat maps, sticker tooltips
 *   DROPDOWN      (50)     — Dropdowns, popovers, inline panels
 *   WIDGET        (100)    — Floating widgets, projections
 *   STICKY        (500)    — Sticky headers, floating action buttons
 *   NAV           (1000)   — Bottom nav, notification bells, carts
 *   MODAL_BACKDROP(9998)   — Modal / fullscreen backdrops
 *   MODAL         (9999)   — Modal content, wallet modals, BBJ
 *   TRANSITION    (99999)  — Page transitions, mystery bounty reveal
 *   GOD_MODE      (100005) — God mode overlays (sandbox only)
 *
 * USAGE:
 *   import { Z_INDEX } from '../../lib/zIndexAuthority';
 *   style={{ zIndex: Z_INDEX.NAV }}
 */

export const Z_INDEX = Object.freeze({
    // ── Render layers (within a card / component) ──
    BASE: 0,
    CARD_CONTENT: 2,
    CARD_BADGE: 5,
    CARD_ELEVATED: 10,

    // ── Page-level layers ──
    DROPDOWN: 50,
    WIDGET: 100,
    STICKY: 500,
    NAV: 1000,

    // ── Overlay layers ──
    MODAL_BACKDROP: 9998,
    MODAL: 9999,
    TRANSITION: 99999,
    GOD_MODE: 100005,
});

export default Z_INDEX;
