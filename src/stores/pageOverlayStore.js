/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAGE OVERLAY STORE — one full-screen popup, openable from anywhere
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-09-02, verbatim: "WHEN YOU CLICK ON NOTIFICATIONS, IT SHOULDN'T
 * OPEN TO ITS OWN PAGE, IT SHOULD CREATE A 'FULL SCREEN POP UP' SO YOU STAY ON
 * THE PAGE YOU WERE ON, AND NOT REDIRECT TO A WHOLE PAGE FOR NOTIFICATIONS.
 * YOU SHOULD BE ABLE TO 'X' OFF THE NOTIFICATIONS POP UP AND STAY ON THE SAME
 * PAGE YOU WERE ON STILL. THIS SHOULD WORK LIKE THIS INSIDE THE WORLD HUB,
 * CLUB ARENA AND CLUB COMMANDER PAGES."
 *
 * WHAT WAS ACTUALLY BROKEN — it was half-built, which is worse than unbuilt
 * ───────────────────────────────────────────────────────────────────────────
 * The popup already existed. `UniversalHeader`'s bell has called
 * `openOverlay('notifications')` for a while, and `pages/hub/notifications.js`
 * already detects `window.self !== window.top` and hides its own header and
 * hamburger when framed. But the open flag was a `useState` INSIDE
 * UniversalHeader, so it was reachable from exactly one control. Every other
 * door in the estate kept navigating:
 *
 *   * BottomNavBar's "Alerts" tab — a plain <Link href="/hub/notifications">
 *   * the hamburger's Notifications entries (four of them, in two menus)
 *   * Club Commander's profile menu, and CommanderLayout's own bell
 *
 * So "notifications" meant two different things in one app depending on which
 * control you happened to touch — and the bottom nav, which is the one most
 * players actually use on a phone, was on the wrong side of the split.
 *
 * Hoisting the flag here is what makes the behaviour global, because the
 * overlay is now mounted once in `_app.js` (`GlobalPageOverlay`) rather than
 * inside a header that not every route renders. Commander pages, which use
 * CommanderPageShell and never mount UniversalHeader, could not have shown a
 * header-owned overlay at all.
 *
 * WHY THE URL LIVES HERE
 * ───────────────────────────────────────────────────────────────────────────
 * Callers say WHAT they want open, not where it is. `openOverlay('profile')`
 * is the one page whose address depends on who is signed in, so that caller
 * passes an explicit url; everything else resolves from the table below. One
 * table means the bottom nav and the bell cannot drift onto two different
 * notification pages, which is the estate-level version of the same bug.
 */

import { create } from 'zustand';

/** Static destinations. `profile` is deliberately absent — see the note above. */
export const OVERLAY_PAGES = {
  messenger: { url: '/hub/messenger', title: 'Messenger' },
  notifications: { url: '/hub/notifications', title: 'Notifications' },
  settings: { url: '/hub/settings', title: 'Settings' },
  'diamond-store': { url: '/hub/diamond-store', title: 'Diamond Store' },
};

export const usePageOverlayStore = create((set) => ({
  /** null when nothing is open. Otherwise the page key, e.g. 'notifications'. */
  overlayPage: null,
  overlayUrl: null,
  overlayTitle: '',

  /**
   * The fresh unread count the framed notifications page pushes up its
   * postMessage bridge when it marks everything seen. UniversalHeader watches
   * this so its badge still clears the instant the popup reads them — the
   * behaviour that used to be a direct `handleNotifCleared` prop, kept working
   * now that the overlay no longer lives inside the header.
   */
  notifClearedCount: null,

  openOverlay: (page, options = {}) => {
    const preset = OVERLAY_PAGES[page] || {};
    const url = options.url || preset.url || null;
    if (!url) {
      console.warn('[pageOverlayStore] No url for overlay page:', page);
      return;
    }
    /**
     * NEVER OPEN A POPUP INSIDE A POPUP. The overlay frames a real page, and
     * _app — including this store's overlay — runs inside that frame too. A
     * trigger reached from within the frame would otherwise stack a second
     * full-screen popup on top of the first, inside 100% of the first, with
     * two Escape handlers and two close buttons.
     *
     * In a frame the honest behaviour is the one the link promised: go there.
     * The caller has already called preventDefault by the time it reaches us,
     * so this is what completes the click rather than swallowing it.
     */
    if (typeof window !== 'undefined' && window.self !== window.top) {
      window.location.href = url;
      return;
    }
    set({
      overlayPage: page,
      overlayUrl: url,
      overlayTitle: options.title || preset.title || '',
    });
  },

  closeOverlay: () => set({ overlayPage: null, overlayUrl: null, overlayTitle: '' }),

  setNotifClearedCount: (count) =>
    set({ notifClearedCount: typeof count === 'number' ? count : 0 }),
}));

/**
 * Imperative open, for the call sites that are not React components — menu
 * configs and event handlers built outside a hook. Same store, same single
 * overlay, so a menu entry cannot end up with its own copy.
 */
export function openPageOverlay(page, options) {
  usePageOverlayStore.getState().openOverlay(page, options);
}

export function closePageOverlay() {
  usePageOverlayStore.getState().closeOverlay();
}
