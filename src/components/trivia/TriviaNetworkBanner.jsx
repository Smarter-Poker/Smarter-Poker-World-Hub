/**
 * TRIVIA NETWORK BANNER
 *
 * Compact #SMARTERDESIGN mobile cellular resilience status banner.
 * Renders ONLY when offline, briefly after reconnecting (~2.5s), or while a
 * failed answer submission is waiting to retry. Zero DOM clutter during normal
 * online play.
 */

import React, { useEffect, useRef, useState } from 'react';

const RESTORED_TOAST_MS = 2500;

export default function TriviaNetworkBanner({
    hasPendingRetry = false,
    isRetrying = false,
    onRetryNow = null,
    onReconnect = null,
}) {
    const [isOffline, setIsOffline] = useState(() => (
        typeof navigator !== 'undefined' && navigator.onLine === false
    ));
    const [showRestored, setShowRestored] = useState(false);

    const onReconnectRef = useRef(onReconnect);
    onReconnectRef.current = onReconnect;

    const restoredTimerRef = useRef(null);
    const wasOfflineRef = useRef(isOffline);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const clearRestoredTimer = () => {
            if (restoredTimerRef.current) {
                clearTimeout(restoredTimerRef.current);
                restoredTimerRef.current = null;
            }
        };

        const handleOffline = () => {
            clearRestoredTimer();
            wasOfflineRef.current = true;
            setShowRestored(false);
            setIsOffline(true);
        };

        const handleOnline = () => {
            const cameFromOffline = wasOfflineRef.current;
            wasOfflineRef.current = false;
            setIsOffline(false);

            if (cameFromOffline) {
                clearRestoredTimer();
                setShowRestored(true);
                restoredTimerRef.current = setTimeout(() => {
                    restoredTimerRef.current = null;
                    setShowRestored(false);
                }, RESTORED_TOAST_MS);
            }

            if (typeof onReconnectRef.current === 'function') {
                onReconnectRef.current();
            }
        };

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            wasOfflineRef.current = true;
            setIsOffline(true);
        }

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        return () => {
            clearRestoredTimer();
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, []);

    const showPending = !isOffline && Boolean(hasPendingRetry);
    const shouldRender = isOffline || showPending || showRestored;
    if (!shouldRender) return null;

    const tone = isOffline
        ? 'offline'
        : showPending
            ? 'pending'
            : 'restored';

    const message = isOffline
        ? 'Connection Lost - Waiting To Reconnect. Your Answer Will Retry Automatically.'
        : showPending
            ? 'Your Answer Needs Confirmation. Tap Below To Retry Now.'
            : 'Connection Restored';

    const borderColor = tone === 'restored'
        ? 'rgba(53, 217, 90, 0.45)'
        : 'rgba(69, 173, 255, 0.45)';
    const dotColor = tone === 'restored'
        ? '#35D95A'
        : tone === 'offline'
            ? '#F02849'
            : '#45ADFF';

    return (
        <div
            role="status"
            aria-live="polite"
            data-trivia-network-banner="true"
            data-network-state={tone}
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '10px 14px',
                marginBottom: '12px',
                borderRadius: '10px',
                background: 'rgba(17, 22, 30, 0.94)',
                border: `1px solid ${borderColor}`,
                color: '#E4E7EC',
                fontSize: '14px',
                lineHeight: 1.4,
            }}
        >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flex: '1 1 220px' }}>
                <span
                    aria-hidden="true"
                    style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: dotColor,
                        flexShrink: 0,
                    }}
                />
                <span>{message}</span>
            </span>

            {showPending && typeof onRetryNow === 'function' && (
                <button
                    type="button"
                    className="sd-button"
                    onClick={() => onRetryNow()}
                    disabled={isRetrying}
                    style={{
                        minHeight: '44px',
                        minWidth: '44px',
                        padding: '0 16px',
                        borderRadius: '8px',
                        background: '#1877F2',
                        border: '1px solid rgba(134, 218, 255, 0.45)',
                        color: '#FFFFFF',
                        fontWeight: 600,
                        fontSize: '14px',
                        cursor: isRetrying ? 'wait' : 'pointer',
                        flexShrink: 0,
                    }}
                >
                    {isRetrying ? 'Retrying Answer...' : 'Retry Answer Now'}
                </button>
            )}
        </div>
    );
}
