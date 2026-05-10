/**
 * 📡 CONNECTION STATUS TOAST — Offline/Reconnect Indicator
 * ═══════════════════════════════════════════════════════════════════════════
 * Additive component that shows a toast when the user goes offline,
 * and a reassuring "Back online" toast when they reconnect.
 *
 * Drop into any page:
 *   <ConnectionToast />
 *
 * Zero visual impact when online. No state pollution.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useRef } from 'react';

export default function ConnectionToast() {
  const [status, setStatus] = useState('online'); // 'online' | 'offline' | 'reconnected'
  const timerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOffline = () => setStatus('offline');
    const handleOnline = () => {
      setStatus('reconnected');
      // Auto-dismiss "Back online" after 3 seconds
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStatus('online'), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Set initial state
    if (!navigator.onLine) setStatus('offline');

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (status === 'online') return null;

  const isOffline = status === 'offline';

  // BUG FIX (TRAIN-TOAST-SVG-1):
  // 1. Replaced emoji icons (lightning bolt and check mark) with inline SVGs. Handoff §4 anti-pattern:
  //    'no-emoji-icons — Use SVG icons (Heroicons, Lucide), not emojis'.
  //    Emojis are font-dependent, render inconsistently across platforms,
  //    cannot be controlled via design tokens, and don't tint with currentColor.
  // 2. Tightened aria-live to 'assertive' when offline (a real interruption
  //    the screen-reader user needs to hear immediately) and 'polite' when
  //    reconnected (reassurance, can wait). Was 'polite' for both.
  // 46 training pages import this component, so this propagates broadly.
  return (
    <div
      role="status"
      aria-live={isOffline ? 'assertive' : 'polite'}
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        padding: '10px 20px',
        borderRadius: 12,
        background: isOffline ? 'rgba(239,68,68,0.95)' : 'rgba(34,197,94,0.95)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "'Inter', -apple-system, sans-serif",
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      {isOffline ? (
        // Cloud-off / disconnect icon (Lucide-style stroke)
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M2 2l20 20" />
          <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
          <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 12 5" />
        </svg>
      ) : (
        // Check-circle icon (Lucide-style stroke)
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="9 12 12 15 16 10" />
        </svg>
      )}
      {isOffline ? 'You are offline — changes may not save' : 'Back online'}
      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="status"][aria-live] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
