/**
 * useStreamingViewportLock — viewport hardening for full-screen streaming UI
 *
 * Solves:
 *   • Bug 7 — auto-fit broken on first load (vh vs dvh, no viewport-fit=cover)
 *   • Bug 8 — pinch zoom + rotation permanently breaks layout with no recovery
 *
 * Behaviour while active (only when `enabled=true` — typically stage === 'live'):
 *   1. Injects a per-route viewport meta tag with maximum-scale=1, user-scalable=no,
 *      viewport-fit=cover. Restores the prior tag on unmount so other routes
 *      (settings, accessibility-sensitive flows) keep their normal scaling.
 *   2. Attempts screen.orientation.lock('portrait') (no-op on iOS Safari).
 *   3. On orientation/resize, forces a layout reflow and resets any persistent
 *      visualViewport scale via window.scrollTo(0,0) — Safari's pinch-zoom
 *      transform clears once the viewport meta disallows it AND a scroll
 *      reset fires.
 *   4. Listens for visualViewport.scale > 1 (pinch attempted despite the meta
 *      tag) and force-resets via document.body offsetHeight reflow.
 *
 * iOS quirk this works around: when a user pinches inside a fixed-position
 * full-screen modal that DID have user-scalable=yes earlier in its lifecycle,
 * Safari retains the zoom transform until the viewport meta is updated AND
 * the visualViewport is reset. Toggling the meta alone is insufficient.
 */
import { useEffect } from 'react';

const STREAMING_VIEWPORT_CONTENT =
  'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover';

export function useStreamingViewportLock(enabled) {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    // ── 1. Swap the viewport meta tag, remembering the previous content ────
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    let previousContent = null;
    let createdMeta = false;

    if (viewportMeta) {
      previousContent = viewportMeta.getAttribute('content');
    } else {
      viewportMeta = document.createElement('meta');
      viewportMeta.name = 'viewport';
      document.head.appendChild(viewportMeta);
      createdMeta = true;
    }
    viewportMeta.setAttribute('content', STREAMING_VIEWPORT_CONTENT);

    // ── 2. Try portrait lock — silent no-op where unsupported (iOS Safari) ──
    let unlockOrientation = null;
    try {
      if (screen?.orientation?.lock) {
        screen.orientation.lock('portrait').catch(() => {});
        unlockOrientation = () => {
          try { screen.orientation.unlock?.(); } catch (_) {}
        };
      }
    } catch (_) { /* unsupported — ignore */ }

    // ── 3. Reflow + scale reset on any layout change ───────────────────────
    // RIGOR-AUDIT-3 USVL-5: track pending setTimeout ids so cleanup can
    // cancel them. Without this, a rotation that fires within ~350ms of
    // unmount would forceReflow on a page the user has already navigated
    // to, yanking their scroll position.
    const pendingReflowTimers = new Set();
    const forceReflow = () => {
      // Read offsetHeight to force a synchronous layout pass
      // eslint-disable-next-line no-unused-expressions
      document.body.offsetHeight;
      // Scroll to top — drains any persistent pinch-zoom translate on iOS
      window.scrollTo(0, 0);
    };

    const scheduleReflow = (ms) => {
      const id = setTimeout(() => {
        pendingReflowTimers.delete(id);
        forceReflow();
      }, ms);
      pendingReflowTimers.add(id);
    };

    const onOrientationChange = () => {
      // Schedule reflow AFTER the orientationchange event settles
      // (Safari fires resize ~100-300ms after orientationchange completes)
      scheduleReflow(50);
      scheduleReflow(350);
    };

    const onVisualViewportChange = () => {
      // If user managed to pinch-zoom despite the meta tag (some iOS versions
      // ignore maximum-scale for the first gesture after route entry), reset.
      if (window.visualViewport && window.visualViewport.scale > 1.01) {
        forceReflow();
      }
    };

    window.addEventListener('orientationchange', onOrientationChange);
    window.addEventListener('resize', onOrientationChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onVisualViewportChange);
      window.visualViewport.addEventListener('scroll', onVisualViewportChange);
    }

    // Initial reflow on mount in case we entered with a stale zoom
    forceReflow();

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      // RIGOR-AUDIT-3 USVL-5: cancel any pending forceReflow timers so they
      // don't fire on the next mounted route after this hook unmounts.
      for (const id of pendingReflowTimers) clearTimeout(id);
      pendingReflowTimers.clear();

      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('resize', onOrientationChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onVisualViewportChange);
        window.visualViewport.removeEventListener('scroll', onVisualViewportChange);
      }
      if (unlockOrientation) unlockOrientation();

      // Restore prior viewport meta so other routes keep accessibility scaling
      if (createdMeta) {
        viewportMeta.parentNode?.removeChild(viewportMeta);
      } else if (previousContent !== null) {
        viewportMeta.setAttribute('content', previousContent);
      }
    };
  }, [enabled]);
}

export default useStreamingViewportLock;
