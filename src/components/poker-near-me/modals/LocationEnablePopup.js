import React, { useEffect, useRef } from 'react';
import { acquireScrollLock } from '../../../lib/scrollLock';

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const INSTRUCTIONS = {
  ios: [
    'Open Settings on your iPhone or iPad',
    'Open Privacy & Security, then Location Services',
    'Allow location for Safari or your current browser',
    'Return here and try location again',
  ],
  android: [
    'Open Settings and confirm Location is on',
    'Open App Permissions for your browser',
    'Allow location while using the browser',
    'Return here and try location again',
  ],
  desktop: [
    'Open site controls beside the address bar',
    'Change Location permission to Allow',
    'Reload this page and try location again',
  ],
};

export default function LocationEnablePopup({
  showEnablePopup,
  setShowEnablePopup,
  handleGpsClick,
  deviceType,
  setShowManualLocation,
  dismissLocationPrompt,
}) {
  const dialogRef = useRef(null);
  const retryRef = useRef(null);
  const returnFocusRef = useRef(null);
  const safeDeviceType = INSTRUCTIONS[deviceType] ? deviceType : 'desktop';

  const closePopup = () => {
    setShowEnablePopup(false);
    dismissLocationPrompt();
  };

  useEffect(() => {
    if (!showEnablePopup) return undefined;
    const releaseScrollLock = acquireScrollLock('LocationEnablePopup');
    returnFocusRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => retryRef.current?.focus());

    const handleKeyDown = (event) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closePopup();
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
  }, [showEnablePopup]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!showEnablePopup) return null;

  return (
    <div
      className="pnm-location-sheet pnm-location-sheet--permission"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePopup();
      }}
    >
      <section
        ref={dialogRef}
        className="pnm-location-sheet__frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pnm-location-permission-title"
        aria-describedby="pnm-location-permission-description"
        tabIndex={-1}
      >
        <div className="pnm-location-sheet__energy" aria-hidden="true" />
        <header className="pnm-location-sheet__header">
          <div>
            <span className="pnm-location-sheet__eyebrow">Location Recovery</span>
            <h2 id="pnm-location-permission-title">Enable Location</h2>
            <p id="pnm-location-permission-description">Use Your Position For Nearby Rooms And Distance-Aware Results.</p>
          </div>
          <button type="button" className="pnm-location-sheet__close" onClick={closePopup} aria-label="Close location instructions">&times;</button>
        </header>

        <div className="pnm-location-sheet__body">
          <button
            ref={retryRef}
            type="button"
            className="pnm-location-sheet__gps"
            onClick={() => {
              setShowEnablePopup(false);
              handleGpsClick({ fromModal: true });
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/>
            </svg>
            Try Enabling Location
          </button>

          <div className="pnm-location-sheet__instructions">
            <span>{safeDeviceType === 'ios' ? 'iPhone / iPad' : safeDeviceType === 'android' ? 'Android' : 'Desktop Browser'}</span>
            <ol>
              {INSTRUCTIONS[safeDeviceType].map((instruction) => <li key={instruction}>{instruction}</li>)}
            </ol>
          </div>

          <div className="pnm-location-sheet__divider"><span>Or</span></div>

          <button
            type="button"
            className="pnm-location-sheet__manual"
            onClick={() => {
              setShowEnablePopup(false);
              setShowManualLocation(true);
            }}
          >
            Enter Location Manually
          </button>
        </div>
      </section>
    </div>
  );
}
