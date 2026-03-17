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

  return (
    <div
      role="status"
      aria-live="polite"
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
      <span style={{ fontSize: 16 }}>{isOffline ? '⚡' : '✓'}</span>
      {isOffline ? 'You are offline — changes may not save' : 'Back online'}
      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
