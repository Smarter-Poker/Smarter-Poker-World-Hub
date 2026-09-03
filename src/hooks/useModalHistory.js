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
 * How it works:
 * - When `isOpen` becomes true, push `{ spModal: true }` onto history.
 * - While open, a `popstate` (the back gesture) calls `onClose`.
 * - When the modal is closed programmatically (an X button, a Done action)
 *   while our entry is still on top, call `history.back()` once to pop it,
 *   and set a ref so the resulting `popstate` does NOT call `onClose` again.
 * - SSR-safe: everything lives inside effects and checks for `window`.
 * - Rapid open/close: the `pushedRef` is the single source of truth for
 *   whether our entry is on the stack, so the hook never pops twice or
 *   leaves an orphan entry.
 *
 * Usage:
 *   useModalHistory(isOpen, () => setOpen(false));
 */
import { useEffect, useRef } from 'react';

export function useModalHistory(isOpen, onClose) {
  const pushedRef = useRef(false);
  const suppressCloseRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return undefined;

    if (isOpen) {
      if (!pushedRef.current) {
        try {
          window.history.pushState({ spModal: true }, '');
          pushedRef.current = true;
        } catch (_) {
          pushedRef.current = false;
        }
      }

      const onPop = () => {
        pushedRef.current = false;
        if (suppressCloseRef.current) {
          suppressCloseRef.current = false;
          return;
        }
        if (typeof onCloseRef.current === 'function') onCloseRef.current();
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }

    // Closed programmatically while our entry is still on top: pop it
    // without re-triggering onClose.
    if (pushedRef.current) {
      const state = window.history.state;
      if (state && state.spModal) {
        suppressCloseRef.current = true;
        pushedRef.current = false;
        try {
          window.history.back();
        } catch (_) {
          suppressCloseRef.current = false;
        }
      } else {
        pushedRef.current = false;
      }
    }
    return undefined;
  }, [isOpen]);
}

export default useModalHistory;
