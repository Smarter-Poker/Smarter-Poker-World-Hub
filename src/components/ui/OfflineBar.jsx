/**
 * OfflineBar: one fixed pill at the top of the viewport while the browser
 * reports it is offline. Renders nothing when online.
 *
 * WHY: mounted once in pages/_app.js so every World Hub page tells the
 * player the truth when the network is gone, instead of each page inventing
 * its own error state (or none). It sits under the iPhone notch via
 * env(safe-area-inset-top) and above the header (z 1000 is the toast layer
 * in src/components/sandbox/paTokens.js, and this is a status toast).
 *
 * The Retry button is 44px tall (global touch rule) and calls `onRetry`;
 * with no handler it reloads the page, which is what a player would do by
 * hand anyway. Copy is Title Case with no em dashes (popup law).
 */
import React from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export default function OfflineBar({ onRetry }) {
  const online = useOnlineStatus();
  if (online) return null;

  const retry = () => {
    if (typeof onRetry === 'function') {
      onRetry();
      return;
    }
    try {
      window.location.reload();
    } catch (_) {
      // Nothing to do: the page is offline and cannot reload right now.
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-offline-bar="true"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: 'calc(100vw - 24px)',
        padding: '6px 8px 6px 14px',
        borderRadius: 999,
        background: '#111318',
        color: '#EEF8FF',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
      }}
    >
      <span>You Are Offline</span>
      <button
        type="button"
        onClick={retry}
        style={{
          minHeight: 44,
          minWidth: 44,
          padding: '0 14px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(255,255,255,0.08)',
          color: '#EEF8FF',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Retry
      </button>
    </div>
  );
}
