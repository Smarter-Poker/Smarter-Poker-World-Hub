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
import { broadcastSync } from '../lib/broadcastSync';

/**
 * ACKNOWLEDGE THE BADGE, WHICHEVER DOOR WAS USED.
 *
 * This used to live inline on the header bell's onClick: zero the count, write
 * localStorage, POST mark-read. So the badge cleared when you opened
 * notifications from the bell, and did NOT clear when you opened exactly the
 * same popup from the bottom nav, the hamburger, /hub/pages or Commander.
 *
 * That was survivable while those doors NAVIGATED — you left the page, and the
 * header went with it. It is not survivable now that they open a popup: you
 * read everything, dismiss the popup, and the bell is still sitting there
 * behind it claiming five unread. The count clearing has to belong to the ACT
 * of opening notifications, not to one control that happens to open them.
 *
 * An empty body means mark-all (pages/api/notifications/mark-read.js), and that
 * endpoint writes BOTH `read` and `is_read`, which is what stops the count
 * resurrecting on the next poll.
 */
async function acknowledgeNotifications(set) {
  // Optimistic and synchronous: the badge goes on the tap, not on the round
  // trip. UniversalHeader watches notifCleared and mirrors it.
  //
  // The timestamp is not decoration. A bare `count` would be 0 after the first
  // open, so a SECOND open — after realtime had pushed the badge back up to 3
  // in between — would set 0 over 0, change nothing, re-render nothing, and
  // leave the header showing 3 notifications the player had just read.
  set({ notifCleared: { count: 0, at: Date.now() } });
  try {
    localStorage.setItem('sp-notif-count', '0');
  } catch (_) {
    /* private browsing — ignore */
  }

  try {
    let accessToken = null;
    try {
      const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
      accessToken = authData?.access_token || null;
    } catch (_) {
      /* private browsing — ignore */
    }
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({}),
    });
    try {
      broadcastSync('smarter_poker_notif_sync', { action: 'refresh_notifications' });
    } catch (_) {
      /* no BroadcastChannel — other tabs reconcile on their own poll */
    }
  } catch (e) {
    console.warn('[pageOverlayStore] mark-all-read failed:', e?.message || e);
  }
}

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
   * The fresh unread count, with the moment it was published. Written both by
   * `acknowledgeNotifications` (on open, from any door) and by the framed
   * notifications page's postMessage bridge when it marks everything seen.
   * UniversalHeader watches it so its badge clears the instant the popup reads
   * them — the behaviour that used to be a direct `handleNotifCleared` prop,
   * kept working now that the overlay no longer lives inside the header.
   *
   * `null` until something clears. See the note in acknowledgeNotifications
   * for why the timestamp has to be here.
   */
  notifCleared: null,

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

    // Opening notifications IS reading them, from every door.
    if (page === 'notifications') void acknowledgeNotifications(set);
  },

  closeOverlay: () => set({ overlayPage: null, overlayUrl: null, overlayTitle: '' }),

  setNotifClearedCount: (count) =>
    set({ notifCleared: { count: typeof count === 'number' ? count : 0, at: Date.now() } }),
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
