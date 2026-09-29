import React, { useEffect, useRef } from 'react';
import { acquireScrollLock } from '../../../lib/scrollLock';
import PokerNearMeConsole from '../PokerNearMeConsole';

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
  }, [showManualLocation]);

  if (!showManualLocation) return null;

  return (
    <div
      className="pnm-console-dialog-overlay pnm-console-dialog-overlay--location"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        ref={dialogRef}
        className="pnm-console-dialog-shell pnm-console-dialog-shell--location"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pnm-manual-location-title"
        aria-describedby="pnm-manual-location-description"
        aria-busy={manualGeocoding}
        tabIndex={-1}
      >
        <PokerNearMeConsole
          as="div"
          className="pnm-console-dialog"
          crest="locator"
          eyebrow="Manual Search Origin"
          title="Set Your Location"
          titleId="pnm-manual-location-title"
          plates={{
            secondary: {
              label: gpsLoading ? 'Locating...' : 'Try GPS Again',
              onClick: () => handleGpsClick({ fromModal: true }),
              disabled: gpsLoading || manualGeocoding,
              'aria-label': gpsLoading ? 'Locating' : 'Try GPS again',
            },
            primary: {
              label: manualGeocoding ? 'Locating...' : 'Set Location',
              ink: 'blue',
              onClick: handleManualLocationSet,
              disabled: !canSubmit,
              'aria-label': manualGeocoding ? 'Locating' : 'Set location',
            },
          }}
        >
          <div className="pnm-console-dialog__body">
            <p id="pnm-manual-location-description" className="pnm-console-dialog__copy">
              Choose A City To Anchor Nearby Rooms, Events, And Route Distances.
            </p>

            {gpsError && <p className="pnm-console-dialog__error" role="alert">{gpsError}</p>}

            <div className="pnm-console-dialog__fields">
              <label className="pnm-console-dialog__field">
                <span className="pnm-console-dialog__label">City</span>
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
              <label className="pnm-console-dialog__field">
                <span className="pnm-console-dialog__label">State</span>
                <select value={manualState} onChange={(event) => setManualState(event.target.value)} autoComplete="address-level1">
                  <option value="">Optional</option>
                  {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
              </label>
            </div>
          </div>
        </PokerNearMeConsole>
        <button
          type="button"
          className="pnm-console-dialog__close"
          onClick={closeModal}
          disabled={manualGeocoding}
          aria-label="Close manual location dialog"
        >
          Close
        </button>
      </section>
    </div>
  );
}
