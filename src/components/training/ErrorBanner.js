/**
 * 🚨 ERROR BANNER — Shared Training Hub Error State
 * ═══════════════════════════════════════════════════════════════════════════
 * Replaces copy-pasted error UI across training pages.
 * Shows error message with optional retry button.
 *
 * Usage:
 *   <ErrorBanner message={fetchError} onRetry={() => fetchData()} />
 */

import React from 'react';

export default function ErrorBanner({ message, onRetry, style }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      style={{
        padding: '16px 20px',
        borderRadius: 12,
        background: 'rgba(239,68,68,0.06)',
        border: '1px solid rgba(239,68,68,0.15)',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        ...style,
      }}
    >
      <div style={{ fontSize: 12, color: '#f87171' }}>{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          aria-label="Retry loading data"
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid rgba(239,68,68,0.2)',
            background: 'rgba(239,68,68,0.08)',
            color: '#f87171',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
