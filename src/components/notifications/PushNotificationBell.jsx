/* ═══════════════════════════════════════════════════════════════════════════
   PUSH NOTIFICATION BELL — Subscribe/Unsubscribe UI
   A bell icon that shows notification status and allows subscription toggle
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { useOneSignal } from '../../contexts/OneSignalContext';

export default function PushNotificationBell({ style = {} }) {
    const { isSubscribed, permission, subscribe, unsubscribe, isInitialized } = useOneSignal();
    const [loading, setLoading] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);

    const handleToggle = async () => {
        if (!isInitialized) return;

        setLoading(true);
        try {
            if (isSubscribed) {
                await unsubscribe();
            } else {
                await subscribe();
            }
        } catch (error) {
            console.error('Push toggle error:', error);
        } finally {
            setLoading(false);
        }
    };

    // Don't render until initialized
    if (!isInitialized) return null;

    return (
        <div
            style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                ...style,
            }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <button
                onClick={handleToggle}
                disabled={loading}
                style={{
                    background: isSubscribed
                        ? 'linear-gradient(135deg, #00ff66, #00cc52)'
                        : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: loading ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                }}
                title={isSubscribed ? 'Notifications enabled' : 'Enable notifications'}
            >
                {/* Bell Icon */}
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isSubscribed ? '#000' : '#fff'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    {!isSubscribed && (
                        <>
                            <line x1="1" y1="1" x2="23" y2="23" stroke="#ff4d4d" />
                        </>
                    )}
                </svg>

                {/* Notification dot when subscribed */}
                {isSubscribed && (
                    <span
                        style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            width: '10px',
                            height: '10px',
                            background: '#00ff66',
                            borderRadius: '50%',
                            border: '2px solid #000',
                            animation: 'pulse 2s infinite',
                        }}
                    />
                )}
            </button>

            {/* Tooltip */}
            {showTooltip && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginBottom: '8px',
                        padding: '8px 12px',
                        background: 'rgba(0, 0, 0, 0.9)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        zIndex: 1000,
                    }}
                >
                    {isSubscribed
                        ? 'Click to disable notifications'
                        : permission === 'denied'
                            ? 'Notifications blocked in browser settings'
                            : 'Click to enable notifications'}
                </div>
            )}
        </div>
    );
}
