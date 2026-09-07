import React, { useCallback, useEffect, useState } from 'react';
import useAccessibleDialog from '../../hooks/useAccessibleDialog';

function ExpandIcon({ close = false }) {
  return close ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
    </svg>
  );
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
  const close = useCallback(() => setExpanded(false), []);
  const { dialogRef, initialFocusRef } = useAccessibleDialog({
    open: expanded,
    onClose: close,
  });

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

  return (
    <section
      ref={dialogRef}
      className={`pnm-map-surface${expanded ? ' pnm-map-surface--fullscreen' : ''}${className ? ` ${className}` : ''}`}
      role={expanded ? 'dialog' : 'region'}
      aria-modal={expanded ? 'true' : undefined}
      aria-label={expanded ? `${title} fullscreen map` : title}
      tabIndex={expanded ? -1 : undefined}
      data-pnm-map-surface="true"
      data-map-fullscreen={expanded ? 'true' : 'false'}
    >
      <header className="pnm-map-surface__header">
        <div className="pnm-map-surface__identity">
          <span className="pnm-map-surface__eyebrow">{eyebrow}</span>
          <strong>{title}</strong>
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
            onClick={() => setExpanded((value) => !value)}
            data-map-fullscreen-control="true"
          >
            <ExpandIcon close={expanded} />
            <span>{expanded ? 'Exit full screen' : 'Full screen'}</span>
          </button>
        )}
        </div>
      </header>
      <div className="pnm-map-surface__viewport">
        {children}
      </div>
      {expanded && (
        <p className="pnm-map-surface__escape-hint" aria-hidden="true">
          Esc To Close
        </p>
      )}
    </section>
  );
}
