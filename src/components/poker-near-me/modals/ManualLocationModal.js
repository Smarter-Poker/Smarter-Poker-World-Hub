import React, { useEffect, useRef } from 'react';
import { acquireScrollLock } from '../../../lib/scrollLock';

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ManualLocationModal({
  showManualLocation,
  setShowManualLocation,
  manualCity,
  setManualCity,
  manualState,
  setManualState,
  handleManualLocationSet,
  gpsLoading,
  gpsError,
  handleGpsClick,
  dismissLocationPrompt,
  manualGeocoding = false,
}) {
  const dialogRef = useRef(null);
  const cityRef = useRef(null);
  const returnFocusRef = useRef(null);
  const manualGeocodingRef = useRef(manualGeocoding);
  const canSubmit = !!manualCity.trim() && !manualGeocoding;

  const closeModal = () => {
    if (manualGeocodingRef.current) return;
    setShowManualLocation(false);
    dismissLocationPrompt();
  };

  useEffect(() => {
    manualGeocodingRef.current = manualGeocoding;
  }, [manualGeocoding]);

  useEffect(() => {
    if (!showManualLocation) return undefined;
    const releaseScrollLock = acquireScrollLock('ManualLocationModal');
    returnFocusRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => cityRef.current?.focus());

    const handleKeyDown = (event) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === 'Escape' && !manualGeocodingRef.current) {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      releaseScrollLock();
      returnFocusRef.current?.focus?.();
    };
  }, [showManualLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!showManualLocation) return null;

  return (
    <div
      className="pnm-location-sheet"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        ref={dialogRef}
        className="pnm-location-sheet__frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pnm-manual-location-title"
        aria-describedby="pnm-manual-location-description"
        aria-busy={manualGeocoding}
        tabIndex={-1}
      >
        <div className="pnm-location-sheet__energy" aria-hidden="true" />
        <header className="pnm-location-sheet__header">
          <div>
            <span className="pnm-location-sheet__eyebrow">Manual Search Origin</span>
            <h2 id="pnm-manual-location-title">Set Your Location</h2>
            <p id="pnm-manual-location-description">Choose A City To Anchor Nearby Rooms, Events, And Route Distances.</p>
          </div>
          <button type="button" className="pnm-location-sheet__close" onClick={closeModal} disabled={manualGeocoding} aria-label="Close manual location dialog">&times;</button>
        </header>

        <div className="pnm-location-sheet__body">
          <button type="button" className="pnm-location-sheet__gps" onClick={() => handleGpsClick({ fromModal: true })} disabled={gpsLoading || manualGeocoding}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {gpsLoading ? 'Locating…' : 'Try GPS Again'}
          </button>

          {gpsError && <p className="pnm-location-sheet__error" role="alert">{gpsError}</p>}

          <div className="pnm-location-sheet__divider"><span>Or Enter Manually</span></div>

          <div className="pnm-location-sheet__fields">
            <label>
              <span>City</span>
              <input
                ref={cityRef}
                type="text"
                placeholder="e.g. Chicago"
                value={manualCity}
                maxLength={100}
                onChange={(event) => setManualCity(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canSubmit) handleManualLocationSet();
                }}
                autoComplete="address-level2"
              />
            </label>
            <label>
              <span>State</span>
              <select value={manualState} onChange={(event) => setManualState(event.target.value)} autoComplete="address-level1">
                <option value="">Optional</option>
                {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
            </label>
          </div>

          <button type="button" className="pnm-location-sheet__primary" onClick={handleManualLocationSet} disabled={!canSubmit}>
            {manualGeocoding ? 'Locating…' : 'Set Location'}
          </button>
        </div>
      </section>
    </div>
  );
}
