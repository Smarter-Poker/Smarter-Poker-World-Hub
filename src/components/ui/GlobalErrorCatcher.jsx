/**
 * GlobalErrorCatcher — Catches async errors that React Error Boundaries CANNOT
 *
 * React Error Boundaries only catch errors during:
 *   - Rendering
 *   - Lifecycle methods
 *   - Constructors of child components
 *
 * They DO NOT catch errors in:
 *   ❌ Event handlers (onClick, onChange, etc.)
 *   ❌ Async code (useEffect callbacks, setTimeout, fetch)
 *   ❌ Unhandled promise rejections (failed API calls, Supabase errors)
 *
 * This component fills that gap by listening to window error events
 * and showing a non-intrusive toast notification instead of silently failing.
 *
 * Usage in _app.js:
 *   <GlobalErrorCatcher />
 */
import { useEffect, useState, useCallback, useRef } from 'react';

// Errors to silently suppress (these are noise, not real crashes)
const SUPPRESSED_PATTERNS = [
    'resizeobserver loop',           // Browser layout optimization, not a real error
    'aborterror',                    // User navigated away mid-fetch
    'signal is aborted',             // Supabase auth-js lock abort during navigation
    'failed to fetch',               // Transient network blip (retried by other systems)
    'load failed',                   // Same as above, Safari variant
    'network request failed',        // Same pattern, React Native bridge
    'cancelled',                     // User-cancelled operations
    'script error.',                 // Cross-origin errors (no useful info)
    'non-error promise rejection',   // Libraries rejecting with non-Error objects
    'loading chunk',                 // Handled by ChunkLoadRecovery separately
    'chunkloaderror',                // Handled by ChunkLoadRecovery separately
    'next_not_found',                // Next.js 404 — not a crash
    'next_redirect',                 // Next.js redirect — not a crash
];

function shouldSuppress(message) {
    if (!message) return true;
    const msg = String(message).toLowerCase();
    return SUPPRESSED_PATTERNS.some(p => msg.includes(p));
}

export default function GlobalErrorCatcher() {
    const [toast, setToast] = useState(null);
    const timeoutRef = useRef(null);

    const showToast = useCallback((message, severity = 'warning') => {
        // Clear existing toast timeout
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        setToast({ message, severity, id: Date.now() });

        // Auto-dismiss after 6 seconds
        timeoutRef.current = setTimeout(() => setToast(null), 6000);
    }, []); // No dependencies — stable reference for the lifetime of the component

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // ═══════════════════════════════════════════════════════════════════════
        // GLOBAL ERROR HANDLER — Catches uncaught exceptions (event handlers, etc.)
        // ═══════════════════════════════════════════════════════════════════════
        const handleError = (event) => {
            const message = event?.error?.message || event?.message || String(event);

            if (shouldSuppress(message)) {
                event.preventDefault(); // 🛡️ Block React dev overlay for harmless errors
                return;
            }

            console.error('[GlobalErrorCatcher] 🔥 Uncaught error:', event?.error || message);

            // Report to Sentry silently
            try {
                if (window.Sentry && event?.error) {
                    window.Sentry.captureException(event.error, {
                        tags: { caughtBy: 'GlobalErrorCatcher', type: 'uncaught-error' },
                        extra: { url: window.location.href },
                    });
                }
            } catch (_) { }

            showToast('Something went wrong. If the issue persists, try refreshing.', 'error');
        };

        // ═══════════════════════════════════════════════════════════════════════
        // UNHANDLED PROMISE REJECTION — Catches async failures
        // (failed API calls, Supabase errors, etc.)
        // ═══════════════════════════════════════════════════════════════════════
        const handleRejection = (event) => {
            const reason = event?.reason;
            const message = reason?.message || String(reason);

            if (shouldSuppress(message)) {
                event.preventDefault(); // 🛡️ Block React dev overlay for harmless errors
                return;
            }

            console.error('[GlobalErrorCatcher] 🔥 Unhandled promise rejection:', reason);

            // Report to Sentry silently
            try {
                if (window.Sentry) {
                    const err = reason instanceof Error ? reason : new Error(message);
                    window.Sentry.captureException(err, {
                        tags: { caughtBy: 'GlobalErrorCatcher', type: 'unhandled-rejection' },
                        extra: { url: window.location.href },
                    });
                }
            } catch (_) { }

            // Don't show toast for every failed API call — only critical ones
            // We check if it's a TypeError or ReferenceError (code bugs, not network issues)
            if (reason instanceof TypeError || reason instanceof ReferenceError) {
                showToast('A background error occurred. The page should still work normally.', 'warning');
            }
        };

        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleRejection);

        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleRejection);
        };
    }, [showToast]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }, []);

    if (!toast) return null;

    const isError = toast.severity === 'error';

    return (
        <div
            key={toast.id}
            style={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 999999,
                padding: '12px 24px',
                borderRadius: 12,
                background: isError
                    ? 'linear-gradient(135deg, #1a0000 0%, #2d0000 100%)'
                    : 'linear-gradient(135deg, #1a1a00 0%, #2d2d00 100%)',
                border: `1px solid ${isError ? '#ff6b6b44' : '#ffaa0044'}`,
                color: isError ? '#ff6b6b' : '#ffaa00',
                fontSize: 13,
                fontWeight: 500,
                fontFamily: '"Segoe UI", system-ui, sans-serif',
                boxShadow: `0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px ${isError ? 'rgba(255, 107, 107, 0.1)' : 'rgba(255, 170, 0, 0.1)'}`,
                backdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                maxWidth: 420,
                animation: 'globalErrorSlideUp 0.3s ease-out',
                pointerEvents: 'auto',
            }}
        >
            <span style={{ fontSize: 16 }}>{isError ? '⚠️' : '⚡'}</span>
            <span>{toast.message}</span>
            <button
                onClick={() => setToast(null)}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: 16,
                    padding: '0 0 0 8px',
                    opacity: 0.6,
                }}
            >
                ×
            </button>

            <style jsx>{`
        @keyframes globalErrorSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
        </div>
    );
}
