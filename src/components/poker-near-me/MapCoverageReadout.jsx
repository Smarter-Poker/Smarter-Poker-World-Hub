import React from 'react';

export default function MapCoverageReadout({
  total = 0,
  visible = 0,
  zoom = 0,
  ready = false,
  clustering = false,
  gps = false,
  busy = false,
  error = '',
  areaSearchAvailable = false,
  areaScoped = false,
  onSearchArea,
  onReset,
  overlay = true,
}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeVisible = Math.min(safeTotal, Math.max(0, Number(visible) || 0));
  const zoomLabel = Number.isFinite(Number(zoom)) ? Math.round(Number(zoom)) : 0;

  return (
    <aside
      className={`pnm-map-coverage${overlay ? ' pnm-map-coverage--overlay' : ''}`}
      aria-label="Map coverage status"
      data-map-coverage="true"
      data-map-visible-count={safeVisible}
      data-map-total-count={safeTotal}
      data-map-zoom={zoomLabel}
      data-map-area-scoped={areaScoped ? 'true' : 'false'}
    >
      <div className="pnm-map-coverage__signal" aria-hidden="true"><span /></div>
      <div className="pnm-map-coverage__copy">
        <span>{ready ? (areaScoped ? 'Area coverage' : 'Live coverage') : 'Calibrating map'}</span>
        <div><strong>{safeVisible}</strong> in frame <small>of {safeTotal} mapped · Z{zoomLabel}</small></div>
        <p role="status" aria-live="polite">
          {error || (busy ? 'Scanning this map area' : clustering ? 'Nearby rooms grouped at this zoom' : gps ? 'Your location is active' : 'Venue signals ready')}
        </p>
      </div>
      {(areaSearchAvailable || areaScoped) && (
        <div className="pnm-map-coverage__actions">
          {areaSearchAvailable && (
            <button type="button" onClick={onSearchArea} disabled={busy}>
              {busy ? 'Scanning…' : 'Search this area'}
            </button>
          )}
          {areaScoped && <button type="button" onClick={onReset} disabled={busy}>Show all</button>}
        </div>
      )}
    </aside>
  );
}
