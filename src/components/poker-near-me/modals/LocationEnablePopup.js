import React, { useEffect, useRef } from 'react';
import { acquireScrollLock } from '../../../lib/scrollLock';
import PokerNearMeConsole from '../PokerNearMeConsole';

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
  }, [showEnablePopup]);

  if (!showEnablePopup) return null;

  return (
    <div
      className="pnm-console-dialog-overlay pnm-console-dialog-overlay--location"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePopup();
      }}
    >
      <section
        ref={dialogRef}
        className="pnm-console-dialog-shell pnm-console-dialog-shell--location"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pnm-location-permission-title"
        aria-describedby="pnm-location-permission-description"
        tabIndex={-1}
      >
        <PokerNearMeConsole
          as="div"
          className="pnm-console-dialog"
          crest="locator"
          eyebrow="Location Recovery"
          title="Enable Location"
          titleId="pnm-location-permission-title"
          plates={{
            secondary: {
              label: 'Enter Manually',
              onClick: () => {
                setShowEnablePopup(false);
                setShowManualLocation(true);
              },
              'aria-label': 'Enter location manually',
            },
            primary: {
              label: 'Try Location',
              ink: 'blue',
              buttonRef: retryRef,
              onClick: () => {
                setShowEnablePopup(false);
                handleGpsClick({ fromModal: true });
              },
              'aria-label': 'Try enabling location',
            },
          }}
        >
          <div className="pnm-console-dialog__body">
            <p id="pnm-location-permission-description" className="pnm-console-dialog__copy">
              Use Your Position For Nearby Rooms And Distance-Aware Results.
            </p>
            <div className="pnm-console-dialog__instructions">
              <span className="pnm-console-dialog__label">
                {safeDeviceType === 'ios' ? 'iPhone / iPad' : safeDeviceType === 'android' ? 'Android' : 'Desktop Browser'}
              </span>
              <ol>
                {INSTRUCTIONS[safeDeviceType].map((instruction) => <li key={instruction}>{instruction}</li>)}
              </ol>
            </div>
          </div>
        </PokerNearMeConsole>
        <button
          type="button"
          className="pnm-console-dialog__close"
          onClick={closePopup}
          aria-label="Close location instructions"
        >
          Close
        </button>
      </section>
    </div>
  );
}
