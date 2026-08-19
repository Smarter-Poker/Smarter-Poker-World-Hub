import React from 'react';

/**
 * PushPromptModal — the "Enable Call Notifications" banner.
 *
 * PRESENTATIONAL ONLY. It was extracted out of pages/hub/messenger.js with its
 * markup intact but its closure left behind: the two button handlers still
 * referenced subscribePush, setPushPromptHandled, setToast, user and supabase,
 * none of which exist in this file. It also declared an `enablePushNotifications`
 * prop that it never used, while messenger.js dutifully passed
 * `enablePushNotifications={enablePushNotifications}` — an identifier that has
 * never been defined anywhere.
 *
 * That last line is what killed the page. Reading an undefined identifier
 * throws ReferenceError during render, HubErrorBoundary caught it, and the
 * whole messenger rendered "Messenger Temporarily Unavailable" — including
 * inside the Club Arena iframe, which is where it was reported.
 *
 * The handlers now live in messenger.js where their variables actually are,
 * and arrive here as onEnable / onDismiss. This component owns no logic.
 */
export default function PushPromptModal({ setShowPushPrompt, onEnable, onDismiss, C, isMobile }) {
    return (
        <div
            role="dialog"
            aria-label="Enable call notifications"
            style={{
                position: 'fixed',
                bottom: isMobile ? 70 : 20,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'linear-gradient(135deg, #1877F2, #0A5DC7)',
                color: 'white',
                padding: '12px 20px',
                borderRadius: 12,
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                maxWidth: 400,
            }}
        >
            <span aria-hidden="true" style={{ fontSize: 22, opacity: 0.9 }}>◉</span>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Enable Call Notifications</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>Get Notified When Someone Calls You</div>
            </div>
            <button
                type="button"
                onClick={() => (onEnable ? onEnable() : setShowPushPrompt?.(false))}
                style={{
                    padding: '8px 16px',
                    background: 'white',
                    color: '#1877F2',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
            >
                Enable
            </button>
            <button
                type="button"
                aria-label="Dismiss"
                onClick={() => (onDismiss ? onDismiss() : setShowPushPrompt?.(false))}
                style={{
                    background: 'none',
                    border: 'none',
                    color: C?.textSec || 'white',
                    cursor: 'pointer',
                    fontSize: 18,
                    opacity: 0.7,
                }}
            >
                ×
            </button>
        </div>
    );
}
