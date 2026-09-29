import React, { useCallback, useEffect, useRef, useState } from 'react';
import useAccessibleDialog from '../../hooks/useAccessibleDialog';
import { PokerNearMeConsoleIcon, usePnmConsoleFitText } from './PokerNearMeConsole';

// The page may scroll the window or an inner panel (lobby pods scroll their
// own panel). Restoration must move whichever one actually holds the map.
function findScrollParent(node) {
  if (typeof window === 'undefined') return null;
  let element = node?.parentElement || null;
  while (element && element !== document.body && element !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(element);
    if (/(auto|scroll|overlay)/.test(overflowY) && element.scrollHeight > element.clientHeight + 1) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

/**
 * Shared physical frame for every Poker Near Me map.
 *
 * The Leaflet node remains mounted while the frame changes geometry. That
 * preserves the current viewport, markers and open popup instead of replacing
 * the map with a second fullscreen instance. `onLayoutChange` lets each map
 * invalidate its size after the fixed frame has reached the viewport.
 */
export default function MapSurfaceFrame({
  children,
  className = '',
  eyebrow = 'Discovery map',
  title = 'Poker room coverage',
  detail = 'Select a marker for venue intelligence',
  controls,
  onLayoutChange,
  allowFullscreen = true,
}) {
  const [expanded, setExpanded] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  // The live title is fitted to the painted face (the kit's measured fit),
  // so a long map name shrinks before it is ever cut to an ellipsis.
  const titleFitRef = usePnmConsoleFitText(title, 1.02, 0.7);
  const scrollRestoreRef = useRef(null);
  const close = useCallback(() => setExpanded(false), []);
  const { dialogRef, initialFocusRef } = useAccessibleDialog({
    open: expanded,
    onClose: close,
  });

  // Entering fullscreen lifts the one mounted map out of the page flow. Hold
  // its measured height in a placeholder so the page behind the dialog never
  // reflows (no scroll clamping, no scroll anchoring), and remember the
  // reader's exact scroll position before anything moves.
  const toggleFullscreen = useCallback(() => {
    if (!expanded && typeof window !== 'undefined') {
      const rect = dialogRef.current?.getBoundingClientRect?.();
      scrollRestoreRef.current = {
        left: window.scrollX,
        top: window.scrollY,
        surfaceTop: rect ? rect.top : null,
        scroller: findScrollParent(dialogRef.current),
      };
      setPlaceholderHeight(rect ? Math.round(rect.height) : 0);
    }
    setExpanded((value) => !value);
  }, [expanded, dialogRef]);

  // However fullscreen ends (control, Escape, a details hand-off), put the
  // page back exactly where it was. This runs after the shared dialog hook has
  // returned focus to the fullscreen control, so the focus call cannot leave
  // the page scrolled somewhere else, and a marker that scrolled a results
  // list behind the dialog does not strand the reader there.
  useEffect(() => {
    if (expanded || typeof window === 'undefined') return undefined;
    const saved = scrollRestoreRef.current;
    if (!saved) return undefined;
    scrollRestoreRef.current = null;
    // Restore the map to the same place in the viewport it was opened from.
    // If content above it changed while fullscreen (a marker selection can
    // expand a results list), the page offset alone would strand the reader
    // away from the map and its focused control, so measure the surface.
    const scroller = saved.scroller?.isConnected ? saved.scroller : null;
    const restore = () => {
      const rect = dialogRef.current?.getBoundingClientRect?.();
      const delta = rect && Number.isFinite(saved.surfaceTop) ? rect.top - saved.surfaceTop : null;
      if (scroller) {
        if (delta) scroller.scrollTop += delta;
        return;
      }
      const left = saved.left;
      const top = delta == null ? saved.top : Math.max(0, window.scrollY + delta);
      try {
        window.scrollTo({ left, top, behavior: 'instant' });
      } catch {
        window.scrollTo(left, top);
      }
    };
    restore();
    const frame = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(frame);
  }, [expanded, dialogRef]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        onLayoutChange?.(expanded);
        // Leaflet also listens for this event. Dispatching it keeps one-off
        // maps and future shared map consumers correct without private APIs.
        window.dispatchEvent(new Event('resize'));
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [expanded, onLayoutChange]);

  useEffect(() => {
    if (!expanded || typeof window === 'undefined') return undefined;
    window.addEventListener('pnm:close-map-fullscreen', close);
    return () => window.removeEventListener('pnm:close-map-fullscreen', close);
  }, [expanded, close]);

  // Leaflet owns the provider attribution node and can replace or reflow it
  // after the React surface has mounted. Measure the actual distance from the
  // map stage's bottom edge to the attribution's top edge so every sibling HUD
  // can clear mandatory provider credit at any width, safe-area inset, font
  // scale, or fullscreen geometry. Mutation observation finds async Leaflet
  // controls; ResizeObserver keeps the value current without React rerenders.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const surface = dialogRef.current;
    if (!surface) return undefined;

    let animationFrame = 0;
    let observedAttribution = null;
    let observedStage = null;
    let lastClearance = null;
    const ResizeObserverClass = window.ResizeObserver;
    let resizeObserver = null;

    const measureAttributionClearance = () => {
      animationFrame = 0;
      const attribution = surface.querySelector('.leaflet-control-attribution');
      const stage = attribution?.closest('.pnm-map-stage')
        || surface.querySelector('.pnm-map-stage')
        || surface.querySelector('.pnm-map-surface__viewport');

      if (resizeObserver && attribution !== observedAttribution) {
        if (observedAttribution) resizeObserver.unobserve(observedAttribution);
        observedAttribution = attribution;
        if (observedAttribution) resizeObserver.observe(observedAttribution);
      } else {
        observedAttribution = attribution;
      }

      if (resizeObserver && stage !== observedStage) {
        if (observedStage && observedStage !== surface) resizeObserver.unobserve(observedStage);
        observedStage = stage;
        if (observedStage && observedStage !== surface) resizeObserver.observe(observedStage);
      } else {
        observedStage = stage;
      }

      let clearance = null;
      if (attribution && stage) {
        const attributionRect = attribution.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        if (attributionRect.width > 0 && attributionRect.height > 0) {
          clearance = Math.max(0, Math.ceil(stageRect.bottom - attributionRect.top));
        }
      }

      if (clearance === lastClearance) return;
      lastClearance = clearance;
      if (clearance == null) {
        surface.style.removeProperty('--pnm-map-attribution-clearance');
        delete surface.dataset.mapAttributionClearance;
        return;
      }
      surface.style.setProperty('--pnm-map-attribution-clearance', `${clearance}px`);
      surface.dataset.mapAttributionClearance = String(clearance);
    };

    const scheduleMeasurement = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(measureAttributionClearance);
    };

    if (typeof ResizeObserverClass === 'function') {
      resizeObserver = new ResizeObserverClass(scheduleMeasurement);
      resizeObserver.observe(surface);
    }
    const mutationObserver = typeof window.MutationObserver === 'function'
      ? new window.MutationObserver(scheduleMeasurement)
      : null;
    mutationObserver?.observe(surface, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', scheduleMeasurement);
    scheduleMeasurement();

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasurement);
      surface.style.removeProperty('--pnm-map-attribution-clearance');
      delete surface.dataset.mapAttributionClearance;
    };
  }, [dialogRef]);

  return (
    <>
    {expanded && placeholderHeight > 0 ? (
      <div
        className="pnm-map-surface__placeholder"
        aria-hidden="true"
        style={{ height: placeholderHeight }}
      />
    ) : null}
    <section
      ref={dialogRef}
      className={`pnm-map-surface${expanded ? ' pnm-map-surface--fullscreen' : ''}${className ? ` ${className}` : ''}`}
      role={expanded ? 'dialog' : 'region'}
      aria-modal={expanded ? 'true' : undefined}
      aria-label={expanded ? `${title} fullscreen map` : title}
      tabIndex={expanded ? -1 : undefined}
      data-pnm-map-surface="true"
      data-pnm-map-console="painted-chassis-v1"
      data-map-fullscreen={expanded ? 'true' : 'false'}
    >
      <header className="pnm-map-surface__header">
        <div className="pnm-map-surface__identity">
          <span className="pnm-map-surface__eyebrow">{eyebrow}</span>
          <strong><span ref={titleFitRef} className="pnm-map-surface__title-text">{title}</span></strong>
          {detail ? <small>{detail}</small> : null}
        </div>
        <div className="pnm-map-surface__controls">
        {controls}
        {allowFullscreen && (
          <button
            ref={expanded ? initialFocusRef : undefined}
            type="button"
            className="pnm-map-surface__fullscreen-control"
            aria-label={expanded ? `Exit fullscreen ${title}` : `Expand ${title} to fullscreen`}
            aria-expanded={expanded}
            onClick={toggleFullscreen}
            data-map-fullscreen-control="true"
          >
            <PokerNearMeConsoleIcon name={expanded ? 'close' : 'fullscreen'} />
            <span>{expanded ? 'Exit Full Screen' : 'Full Screen'}</span>
          </button>
        )}
        </div>
      </header>
      <div className="pnm-map-surface__viewport">
        {children}
      </div>
      <span className="pnm-map-surface__foot" aria-hidden="true" />
      {expanded && (
        <p className="pnm-map-surface__escape-hint" aria-hidden="true">
          Esc To Close
        </p>
      )}
    </section>
    </>
  );
}
