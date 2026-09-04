/**
 * useModalHistory: make the phone back gesture close a modal instead of
 * leaving the page.
 *
 * WHY: on Android the back button, and on iOS the edge swipe, both fire a
 * history `popstate`. With nothing on the stack for the modal, "back" from
 * an open composer or lightbox navigates away from the whole page and the
 * player loses what they were doing. Native apps close the sheet first;
 * players expect the same here.
 *
 * How it works (the bookkeeping lives in ./modalHistoryCore.js, which has a
 * real test with a fake history stack):
 * - When `isOpen` becomes true, push one entry `{ spModal: true, ... }`.
 * - A `popstate` closes exactly the modals whose entries were popped: with
 *   two sheets stacked, back closes the top one only.
 * - A programmatic close (X, Done) or an unmount while open pops our own
 *   entry once, and the resulting popstate does NOT call `onClose` again.
 * - The Next router is told, through `beforePopState`, to ignore pops that
 *   are modal closes. Without that, landing back on the page's own entry
 *   re-runs the route and `pages/_app.js` scrolls the page to the top on
 *   `routeChangeComplete`, so every modal close would jump the scroll.
 * - SSR-safe: everything lives inside effects and checks for `window`.
 *
 * Usage:
 *   useModalHistory(isOpen, () => setOpen(false));
 *   // or, for a modal that is only mounted while open:
 *   useModalHistory(true, onClose);
 */
import { useEffect, useRef } from 'react';
import Router from 'next/router';
import {
  openModalEntry,
  closeModalEntry,
  handlePopState,
  shouldRouterHandlePop,
  isModalEntryOpen,
} from './modalHistoryCore';

let listenerInstalled = false;

function currentLocation() {
  const l = window.location;
  return `${l.pathname}${l.search}${l.hash}`;
}

/**
 * A modal entry nobody owns any more: the page navigated away (for example
 * the sign-in prompt pushed /login) with the modal's entry still under the
 * new page, and the player has now come back onto it. Next ignores entries
 * without its own `__N` flag, so the URL would say one page while the
 * router still shows the other. Ask the router to render where we are.
 */
function recoverOrphanEntry() {
  const state = window.history.state;
  if (!state || !state.spModal || isModalEntryOpen(state.spModalId)) return;
  const here = currentLocation();
  try {
    if (Router.asPath !== here) void Router.replace(here);
  } catch (_) {
    // No router instance: nothing to recover.
  }
}

function installGlobalListener() {
  if (listenerInstalled || typeof window === 'undefined') return;
  listenerInstalled = true;
  window.addEventListener('popstate', (e) => {
    handlePopState(window, e ? e.state : window.history && window.history.state);
    recoverOrphanEntry();
  });
  try {
    // Ask Next to leave modal pops alone; everything else runs as before.
    Router.beforePopState((state) => shouldRouterHandlePop(state));
  } catch (_) {
    // No router instance yet (or not a Next runtime): Next handles all pops.
  }
}

export function useModalHistory(isOpen, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const entryIdRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return undefined;
    if (!isOpen) return undefined;
    installGlobalListener();
    const id = openModalEntry(window, () => onCloseRef.current);
    entryIdRef.current = id;
    return () => {
      // Closed programmatically, or unmounted while open: pop our entry
      // without re-firing onClose. A back gesture has already removed the
      // entry from the registry, in which case this is a no-op.
      closeModalEntry(window, id);
      if (entryIdRef.current === id) entryIdRef.current = null;
    };
  }, [isOpen]);
}

export default useModalHistory;
