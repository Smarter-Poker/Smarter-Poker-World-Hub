/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GLOBAL PAGE OVERLAY — the one full-screen popup, mounted once in _app
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-09-02: "IT SHOULD CREATE A 'FULL SCREEN POP UP' SO YOU STAY ON THE
 * PAGE YOU WERE ON... THIS SHOULD WORK LIKE THIS INSIDE THE WORLD HUB, CLUB
 * ARENA AND CLUB COMMANDER PAGES."
 *
 * WHY IT IS IN _app AND NOT IN UniversalHeader, WHERE IT USED TO BE
 * ───────────────────────────────────────────────────────────────────────────
 * UniversalHeader is rendered PER PAGE, not by the app shell — its own comment
 * says so, and `_app.js` only supplies it for the routes listed in
 * HUB_ROUTES_WITHOUT_SHARED_HEADER. Club Commander's pages use
 * CommanderPageShell and mount no UniversalHeader at all. An overlay owned by
 * the header therefore could not be opened from Commander, and could not be
 * opened from the bottom nav on any route whose page forgot the header. That
 * is precisely the "works from the bell, navigates from everywhere else" split
 * Dan is describing.
 *
 * Mounted here it renders on every route, so every door behaves the same.
 *
 * WHAT IT MUST NOT DO
 * ───────────────────────────────────────────────────────────────────────────
 * Not navigate. Opening changes no URL and pushes no history entry, so the
 * page underneath keeps its scroll position, its sockets and its in-flight
 * state, and closing puts the player back exactly where they were. That is the
 * whole request; a modal that routes is just a page with a border.
 *
 * The framed page cooperates: `pages/hub/notifications.js` checks
 * `window.self !== window.top` and hides its own header and hamburger, so the
 * popup shows the feed rather than a second copy of the app's chrome.
 */

import React, { useCallback } from 'react';
import FullScreenPageOverlay from './FullScreenPageOverlay';
import { usePageOverlayStore } from '../../stores/pageOverlayStore';

export default function GlobalPageOverlay() {
  const overlayPage = usePageOverlayStore((s) => s.overlayPage);
  const overlayUrl = usePageOverlayStore((s) => s.overlayUrl);
  const overlayTitle = usePageOverlayStore((s) => s.overlayTitle);
  const closeOverlay = usePageOverlayStore((s) => s.closeOverlay);
  const setNotifClearedCount = usePageOverlayStore((s) => s.setNotifClearedCount);

  /**
   * The framed notifications page posts `SP_NOTIF_CLEARED` up to us when it
   * marks everything seen. Publish it to the store (UniversalHeader reads it)
   * and to localStorage, which is where every header's first paint seeds its
   * badge from — otherwise the count would reappear on the next hard reload
   * having already been read.
   *
   * useCallback keeps the identity stable so FullScreenPageOverlay's message
   * listener is not torn down and re-added on every unrelated store tick.
   */
  const handleNotifCleared = useCallback(
    (count) => {
      setNotifClearedCount(count);
      try {
        localStorage.setItem('sp-notif-count', String(count));
      } catch (_) {
        /* private browsing — ignore */
      }
    },
    [setNotifClearedCount]
  );

  return (
    <FullScreenPageOverlay
      isOpen={!!overlayPage}
      onClose={closeOverlay}
      url={overlayUrl}
      title={overlayTitle}
      onNotifCleared={handleNotifCleared}
    />
  );
}
