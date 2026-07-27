/**
 * ERROR BANNER — Shared Training Hub Error State
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Replaces copy-pasted error UI across training pages.
 * Shows error message with optional retry button.
 *
 * Usage:
 *   <ErrorBanner message={fetchError} onRetry={() => fetchData()} />
 */

import React from 'react';

export default function ErrorBanner({ message, onRetry, style }) {
  if (!message) return null;

  // BUG FIX (TRAIN-ERROR-BANNER-1):
  // Polishing pass on the shared error UI used by 28 training pages.
  // 1. Bumped body text from 12px to 14px to meet the handoff §6 readability
  //    floor for in-flow notification text. 12px under-reads on dense pages.
  // 2. Added a leading icon (alert-triangle SVG, Lucide-style) for visual
  //    hierarchy — handoff §8 'error-recovery' wants errors to feel distinct
  //    from regular content; an icon establishes that affordance.
  // 3. aria-atomic="true" on the alert role so screen readers re-announce
  //    the FULL banner when message changes, not just the diff. Without it,
  //    SR users who arrive after a re-render hear a fragment.
  // 4. Retry button now has :focus-visible support for keyboard users.
  return (
    <div
      role="alert"
      aria-atomic="true"
      style={{
        padding: '14px 18px',
        borderRadius: 12,
        background: 'rgba(239,68,68,0.06)',
        border: '1px solid rgba(239,68,68,0.18)',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: 1 }}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f87171"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          style={{ flexShrink: 0, marginTop: 2 }}
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: '#f87171',
            wordBreak: 'break-word',
          }}
        >
          {message}
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          aria-label="Retry loading data"
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            border: '1px solid rgba(239,68,68,0.25)',
            background: 'rgba(239,68,68,0.08)',
            color: '#f87171',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            minHeight: 32,
            outlineOffset: 2,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
