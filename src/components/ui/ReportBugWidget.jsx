import React, { useState, useMemo } from 'react';
import { busEmit } from '../../engine/EventBus';

/**
 * MESSENGER OPTIONS — direct social media messenger links
 * Opens directly into the user's personal messaging app.
 * Pre-fills message with page context, device info, and timestamp.
 */
const ADMIN_PHONE = '17086775221';
const MESSENGER_OPTIONS = [
    {
        key: 'sms',
        label: 'iMessage / SMS',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
        ),
        color: '#34C759',
        bg: 'rgba(52,199,89,0.12)',
        border: 'rgba(52,199,89,0.35)',
        getUrl: (msg) => `sms:+${ADMIN_PHONE}&body=${encodeURIComponent(msg)}`,
    },
    {
        key: 'whatsapp',
        label: 'WhatsApp',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
        ),
        color: '#25D366',
        bg: 'rgba(37,211,102,0.12)',
        border: 'rgba(37,211,102,0.35)',
        getUrl: (msg) => `https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(msg)}`,
    },
    {
        key: 'telegram',
        label: 'Telegram',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
        ),
        color: '#0088CC',
        bg: 'rgba(0,136,204,0.12)',
        border: 'rgba(0,136,204,0.35)',
        getUrl: (msg) => `https://t.me/share/url?url=${encodeURIComponent('smarter.poker')}&text=${encodeURIComponent(msg)}`,
    },
    {
        key: 'email',
        label: 'Email',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
            </svg>
        ),
        color: '#d4a853',
        bg: 'rgba(212,168,83,0.12)',
        border: 'rgba(212,168,83,0.35)',
        getUrl: (msg) => `mailto:support@smarter.poker?subject=${encodeURIComponent('Bug Report — Smarter.Poker')}&body=${encodeURIComponent(msg)}`,
    },
];

/**
 * Builds a pre-filled bug report message with device/page context.
 */
function buildBugMessage(contextPath) {
    const lines = [
        'Bug Report — Smarter.Poker',
        '---',
        `Page: ${contextPath || window?.location?.pathname || 'Unknown'}`,
        `Device: ${navigator?.userAgent?.slice(0, 120) || 'Unknown'}`,
        `Time: ${new Date().toLocaleString()}`,
        '---',
        '',
        'Describe the issue below:',
        '',
    ];
    return lines.join('\n');
}

export default function ReportBugWidget({ contextPath = '/hub/messenger' }) {
    const [showPicker, setShowPicker] = useState(false);

    const message = useMemo(() => buildBugMessage(contextPath), [contextPath]);

    const handleMessengerClick = (option) => {
        const url = option.getUrl(message);
        window.open(url, '_blank', 'noopener,noreferrer');
        busEmit.bugReportSubmitted?.('messenger-' + option.key, 'user-directed', contextPath);
        setShowPicker(false);
    };

    return (
        <>
            <button
                onClick={() => setShowPicker(true)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '10px',
                    borderRadius: 8,
                    background: 'rgba(255, 107, 107, 0.1)',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    color: '#ff6b6b',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255, 107, 107, 0.2)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)';
                }}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Report a Bug to Customer Service
            </button>

            {/* Messenger Picker Overlay */}
            {showPicker && (
                <div
                    onClick={() => setShowPicker(false)}
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        zIndex: 99999,
                        background: 'rgba(0,0,0,0.65)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 20,
                        animation: 'rbw-fadeIn 0.15s ease-out',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'linear-gradient(145deg, #1a1f2e 0%, #0d1117 100%)',
                            border: '1px solid rgba(255,107,107,0.25)',
                            borderRadius: 16,
                            padding: '24px 20px',
                            maxWidth: 340,
                            width: '100%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                            animation: 'rbw-slideUp 0.2s ease-out',
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Report a Bug</span>
                            </div>
                            <button
                                onClick={() => setShowPicker(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 20, lineHeight: 1 }}
                            >
                                &times;
                            </button>
                        </div>

                        {/* Description */}
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                            Choose your preferred messenger. Your page and device info will be included automatically.
                        </p>

                        {/* Messenger Buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {MESSENGER_OPTIONS.map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => handleMessengerClick(opt)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        width: '100%',
                                        padding: '12px 16px',
                                        borderRadius: 12,
                                        background: opt.bg,
                                        border: `1px solid ${opt.border}`,
                                        color: opt.color,
                                        fontSize: 15,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        textAlign: 'left',
                                        fontFamily: 'inherit',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = `0 4px 16px ${opt.border}`;
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.transform = 'none';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                >
                                    {opt.icon}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Animations */}
            <style>{`
                @keyframes rbw-fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes rbw-slideUp {
                    from { opacity: 0; transform: translateY(16px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </>
    );
}

/**
 * Exported helper for other components (e.g. GeevesFloatingOrb)
 * to open a messenger link with pre-filled bug context.
 */
export function openBugMessenger(messengerKey, contextPath) {
    const message = buildBugMessage(contextPath);
    const option = MESSENGER_OPTIONS.find(o => o.key === messengerKey);
    if (!option) {
        // Default to SMS if unknown key
        const fallback = MESSENGER_OPTIONS[0];
        window.open(fallback.getUrl(message), '_blank', 'noopener,noreferrer');
        return;
    }
    window.open(option.getUrl(message), '_blank', 'noopener,noreferrer');
}

export { MESSENGER_OPTIONS, buildBugMessage };
