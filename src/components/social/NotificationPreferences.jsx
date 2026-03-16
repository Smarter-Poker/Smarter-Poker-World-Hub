/**
 * 🔔 NOTIFICATION PREFERENCES
 * src/components/social/NotificationPreferences.jsx
 * 
 * Self-contained settings panel with toggles for notification types.
 * Stores preferences in localStorage (can be migrated to DB later).
 * 
 * SAFETY: This is a NEW file — no existing code is modified.
 */

import React, { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sp-notification-prefs';

const DEFAULT_PREFS = {
    likes: true,
    comments: true,
    followers: true,
    friendRequests: true,
    liveStreams: true,
    mentions: true,
    clubActivity: true,
};

const PREF_CONFIG = [
    { key: 'likes', label: 'Likes on My Posts', icon: '👍', desc: 'When someone reacts to your posts' },
    { key: 'comments', label: 'Comments on My Posts', icon: '💬', desc: 'When someone comments on your posts' },
    { key: 'mentions', label: 'Mentions', icon: '🏷️', desc: 'When someone @mentions you in a post or comment' },
    { key: 'followers', label: 'New Followers', icon: '👤', desc: 'When someone starts following you' },
    { key: 'friendRequests', label: 'Friend Requests', icon: '🤝', desc: 'When someone sends you a friend request' },
    { key: 'liveStreams', label: 'Live Stream Alerts', icon: '🔴', desc: 'When friends or clubs go live' },
    { key: 'clubActivity', label: 'Club Activity', icon: '🃏', desc: 'Posts and events in your clubs' },
];

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2',
};

function loadPrefs() {
    if (typeof window === 'undefined') return DEFAULT_PREFS;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? { ...DEFAULT_PREFS, ...JSON.parse(stored) } : DEFAULT_PREFS;
    } catch {
        return DEFAULT_PREFS;
    }
}

function savePrefs(prefs) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch { /* ignore storage errors */ }
}

export default function NotificationPreferences({ onClose }) {
    const [prefs, setPrefs] = useState(DEFAULT_PREFS);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setPrefs(loadPrefs());
    }, []);

    const togglePref = useCallback((key) => {
        setPrefs(prev => {
            const updated = { ...prev, [key]: !prev[key] };
            savePrefs(updated);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            return updated;
        });
    }, []);

    const resetAll = useCallback(() => {
        setPrefs(DEFAULT_PREFS);
        savePrefs(DEFAULT_PREFS);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, []);

    return (
        <div style={{
            background: C.card, borderRadius: 12, maxWidth: 520, width: '100%',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)', overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderBottom: `1px solid ${C.border}`
            }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>
                    Notification Preferences
                </h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {saved && (
                        <span style={{ fontSize: 13, color: '#22C55E', fontWeight: 600, animation: 'npSavedFade 2s ease' }}>
                            Saved
                        </span>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            style={{
                                width: 36, height: 36, borderRadius: '50%', border: 'none',
                                background: C.bg, cursor: 'pointer', fontSize: 18, color: C.textSec,
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                            aria-label="Close"
                        >✕</button>
                    )}
                </div>
            </div>

            {/* Toggle List */}
            <div style={{ padding: '8px 0' }}>
                {PREF_CONFIG.map(({ key, label, icon, desc }) => (
                    <div
                        key={key}
                        onClick={() => togglePref(key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            padding: '14px 20px', cursor: 'pointer',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        <span style={{ fontSize: 24, flexShrink: 0 }}>{icon}</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{label}</div>
                            <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>{desc}</div>
                        </div>
                        {/* Toggle Switch */}
                        <div
                            style={{
                                width: 48, height: 28, borderRadius: 14, padding: 3,
                                background: prefs[key] ? C.blue : '#DADDE1',
                                transition: 'background 0.2s', flexShrink: 0,
                                cursor: 'pointer', position: 'relative'
                            }}
                            role="switch"
                            aria-checked={prefs[key]}
                        >
                            <div style={{
                                width: 22, height: 22, borderRadius: '50%',
                                background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                transition: 'transform 0.2s',
                                transform: prefs[key] ? 'translateX(20px)' : 'translateX(0)'
                            }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div style={{
                padding: '12px 20px', borderTop: `1px solid ${C.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <span style={{ fontSize: 12, color: C.textSec }}>
                    Preferences are saved automatically
                </span>
                <button
                    onClick={resetAll}
                    style={{
                        padding: '8px 16px', background: C.bg, border: 'none', borderRadius: 8,
                        fontWeight: 600, fontSize: 13, color: C.textSec, cursor: 'pointer'
                    }}
                >Reset to Default</button>
            </div>

            <style>{`
                @keyframes npSavedFade {
                    0% { opacity: 0; transform: translateY(-4px); }
                    20% { opacity: 1; transform: translateY(0); }
                    80% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}

/**
 * Utility: Check if a notification type is enabled
 * @param {string} type - One of: likes, comments, followers, friendRequests, liveStreams, mentions, clubActivity
 * @returns {boolean}
 */
export function isNotificationEnabled(type) {
    const prefs = loadPrefs();
    return prefs[type] !== false; // Default to enabled
}
