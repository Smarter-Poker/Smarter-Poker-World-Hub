/**
 * 🗂️ FEED FILTER TABS
 * src/components/social/FeedFilterTabs.jsx
 * 
 * Horizontal pill tabs for filtering the social feed:
 * - All (recent)
 * - Following
 * - Trending
 * 
 * Wires into SocialService.getFeed() which already supports these filters.
 * 
 * SAFETY: This is a NEW file — no existing code is modified.
 */

import React from 'react';

const FILTERS = [
    { key: 'recent', label: 'All Posts', icon: '🌐' },
    { key: 'following', label: 'Following', icon: '👥' },
    { key: 'trending', label: 'Trending', icon: '🔥' },
];

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    blue: '#1877F2', blueLight: '#EBF5FF',
};

export default function FeedFilterTabs({ activeFilter = 'recent', onFilterChange }) {
    return (
        <div style={{
            display: 'flex', gap: 8, padding: '12px 0', marginBottom: 12,
            overflowX: 'auto', scrollbarWidth: 'none',
        }}>
            {FILTERS.map(({ key, label, icon }) => {
                const active = activeFilter === key;
                return (
                    <button
                        key={key}
                        onClick={() => onFilterChange?.(key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', border: 'none', borderRadius: 20,
                            fontSize: 15, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                            cursor: 'pointer', transition: 'all 0.2s',
                            background: active ? C.blueLight : C.bg,
                            color: active ? C.blue : C.text,
                        }}
                    >
                        <span style={{ fontSize: 16 }}>{icon}</span>
                        {label}
                    </button>
                );
            })}

            <style>{`
                div::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
}
