/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  STORE TOAST: Premium notification system for Diamond Store
 *  ═══════════════════════════════════════════════════════════════════════════════
 *  Replaces all native alert() calls with animated, auto-dismiss toasts.
 *  4 types: success (cyan), error (red), info (cyan), warning (amber)
 *
 *  Usage from anywhere:
 *    import { showStoreToast } from './StoreToast';
 *    showStoreToast('success', 'Purchase complete!');
 *    showStoreToast('error', 'Insufficient diamonds');
 *
 *  Or via event:
 *    window.dispatchEvent(new CustomEvent('store-toast', {
 *      detail: { type: 'success', message: 'Done!' }
 *    }));
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { marketplaceToastCopy } from '../../lib/store/marketplaceCopy';
import styles from './StoreToast.module.css';

// ── Helper function (usable from any module) ──
export function showStoreToast(type, message) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('store-toast', {
        detail: { type: type || 'info', message },
      })
    );
  }
}

const TOAST_LABELS = {
  success: 'Confirmed',
  error: 'Attention',
  info: 'Update',
  warning: 'Review',
};

// ── React component ──
export default function StoreToast() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Set());

  const addToast = useCallback((type, message) => {
    const id = Date.now() + Math.random();
    // Events can carry provider or API prose that was never present in JSX,
    // so enforce the Marketplace copy contract at the final render boundary.
    // The normalizer preserves URLs, UUIDs, email addresses, and machine
    // codes exactly while formatting the surrounding human-readable copy.
    const copyMessage = marketplaceToastCopy(type, message);
    setToasts((prev) => [...prev.slice(-4), { id, type, message: copyMessage }]); // Max 5 visible

    // Errors and warnings need enough time to be read and acted on. Every
    // toast also has a keyboard-operable dismiss control below.
    const timeoutMs = type === 'error' || type === 'warning' ? 8000 : 4500;
    const timerId = setTimeout(() => {
      timersRef.current.delete(timerId);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, timeoutMs);
    timersRef.current.add(timerId);
  }, []);

  // Clear any pending auto-dismiss timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const { type, message } = e.detail || {};
      if (message) addToast(type || 'info', message);
    };
    window.addEventListener('store-toast', handler);
    return () => window.removeEventListener('store-toast', handler);
  }, [addToast]);

  // The stack stays mounted even when it is empty. Unmounting the whole live
  // region and remounting it with a message inside is the one pattern screen
  // readers announce unreliably: the region has to already exist for an
  // insertion into it to be read out.
  return (
    <>
      <div
        className={styles.stack}
        role="status"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {toasts.map((toast) => {
          const typeClass = styles[toast.type] || styles.info;
          const label = TOAST_LABELS[toast.type] || TOAST_LABELS.info;
          return (
            <div
              key={toast.id}
              role={toast.type === 'error' ? 'alert' : 'status'}
              aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
              aria-atomic="true"
              className={`${styles.toast} ${typeClass}`}
            >
              <span className={styles.status} aria-hidden="true">
                {label}
              </span>
              <span className={styles.message}>{toast.message}</span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss Store Message"
                className={styles.dismiss}
              >
                Dismiss
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
