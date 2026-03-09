/* ═══════════════════════════════════════════════════════════════════════════
   CARD CUSTOMIZER PANEL
   Slide-in panel for toggling World Hub card visibility
   Lives in WorldHub — triggered from hamburger menu OR profile dropdown
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef } from 'react';
import { POKER_IQ_ORBS, COMMANDER_ORB, TOKE_TRACKER_ORB, PINNED_ORB_IDS } from '../../orbs/manifest/registry';
import { getHiddenCardIds, setHiddenCardIds } from '../../state/userPreferences';
import { getAuthUser } from '../../lib/authUtils';

// ── Card emoji map for display ───────────────────────────────────────────────
const CARD_EMOJI: Record<string, string> = {
    'toke-tracker': '♠️',

    'club-commander': '🏢',
    'social-media': '💬',
    'diamond-arena': '💎',
    'trivia': '🧠',
    'training': '🎓',
    'news': '📰',
    'diamond-arcade': '🕹️',
    'personal-assistant': '🤖',
    'memory-games': '♟️',
    'bankroll-manager': '💰',
    'poker-near-me': '📍',
    'marketplace': '🛒',
    'club-arena': '🏟️',
    'my-clubs': '🎯',
    'video-library': '📹',
    'poker-tools': '🧮',
};

// All cards that can appear in the hub (for the customizer list)
// Toke Tracker and Commander/Employee Portal are listed first as special cards
const ALL_CUSTOMIZABLE = [
    TOKE_TRACKER_ORB,
    COMMANDER_ORB,
    ...POKER_IQ_ORBS,
];

interface CardCustomizerPanelProps {
    isOpen: boolean;
    onClose: () => void;
    /** IDs of special cards that are currently unlocked for this user */
    unlockedSpecialIds?: string[];
}

export function CardCustomizerPanel({ isOpen, onClose, unlockedSpecialIds = [] }: CardCustomizerPanelProps) {
    const [hidden, setHidden] = useState<string[]>([]);
    const panelRef = useRef<HTMLDivElement>(null);

    // Load persisted hidden list when panel opens
    useEffect(() => {
        if (isOpen) {
            setHidden(getHiddenCardIds());
        }
    }, [isOpen]);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen, onClose]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    const toggle = (id: string) => {
        if (PINNED_ORB_IDS.includes(id)) return; // Cannot hide pinned cards
        const next = hidden.includes(id)
            ? hidden.filter(h => h !== id)
            : [...hidden, id];
        setHidden(next);

        // Cloud-Sync Pipeline
        const user = getAuthUser();
        setHiddenCardIds(next, user?.id);

        // 🔴 BUS: broadcast hidden card change so WorldHub carousel/footer update instantly
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('hub-cards-hidden-changed', { detail: { hiddenIds: next } }));
        }
    };

    if (!isOpen) return null;

    // Filter the customizer list to only show cards available to this user
    const visibleCards = ALL_CUSTOMIZABLE.filter(orb => {
        if (orb.id === 'club-commander') return unlockedSpecialIds.includes('club-commander');
        return true; // Standard + toke-tracker always listed
    });

    return (
        <>
            {/* Backdrop */}
            <div
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(2px)',
                    zIndex: 8000,
                    animation: 'fadeIn 0.2s ease',
                }}
            />

            {/* Panel */}
            <div
                ref={panelRef}
                style={{
                    position: 'fixed',
                    top: 0, right: 0,
                    height: '100vh',
                    width: 'min(360px, 92vw)',
                    background: 'linear-gradient(180deg, #0d1117 0%, #0a0e16 100%)',
                    borderLeft: '1px solid rgba(0,212,255,0.2)',
                    boxShadow: '-10px 0 40px rgba(0,0,0,0.7)',
                    zIndex: 8001,
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'slideInRight 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
            >
                {/* Header */}
                <div style={s.header}>
                    <div style={s.headerLeft}>
                        <span style={{ fontSize: 22 }}>🎴</span>
                        <div>
                            <div style={s.headerTitle}>Customize My Hub</div>
                            <div style={s.headerSub}>Toggle which cards appear on your World Hub</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={s.closeBtn}>✕</button>
                </div>

                {/* Note */}
                <div style={s.note}>
                    Hidden cards disappear from the carousel and quick-launch bar. Pinned cards 📌 cannot be hidden.
                </div>

                {/* Card List */}
                <div style={s.list}>
                    {visibleCards.map(orb => {
                        const isPinned = PINNED_ORB_IDS.includes(orb.id);
                        const isHidden = hidden.includes(orb.id);
                        const isSpecial = orb.id === 'club-commander';

                        return (
                            <div key={orb.id} style={s.row}>
                                {/* Card mini-preview */}
                                <div style={{
                                    ...s.cardThumb,
                                    background: orb.imageUrl
                                        ? `url('${orb.imageUrl}') center/cover`
                                        : `linear-gradient(135deg, ${orb.gradient[0]}, ${orb.gradient[1]})`,
                                    opacity: isHidden ? 0.35 : 1,
                                }} />

                                {/* Info */}
                                <div style={s.rowInfo}>
                                    <div style={s.rowName}>
                                        <span style={{ marginRight: 4 }}>{CARD_EMOJI[orb.id] || '🃏'}</span>
                                        {orb.label}
                                        {isPinned && <span style={s.pinnedBadge}>📌</span>}
                                        {isSpecial && <span style={s.specialBadge}>LINKED</span>}
                                    </div>
                                    <div style={s.rowDesc}>{isHidden ? 'Hidden from Hub' : 'Visible'}</div>
                                </div>

                                {/* Toggle */}
                                <button
                                    onClick={() => toggle(orb.id)}
                                    disabled={isPinned}
                                    title={isPinned ? 'This card is permanently pinned' : isHidden ? 'Show card' : 'Hide card'}
                                    style={{
                                        ...s.toggleBtn,
                                        background: isPinned
                                            ? 'rgba(255,255,255,0.06)'
                                            : isHidden
                                                ? 'rgba(100,116,139,0.2)'
                                                : 'rgba(0,212,255,0.15)',
                                        border: isPinned
                                            ? '1px solid rgba(255,255,255,0.1)'
                                            : isHidden
                                                ? '1px solid rgba(100,116,139,0.35)'
                                                : '1px solid rgba(0,212,255,0.4)',
                                        color: isPinned
                                            ? '#4a5568'
                                            : isHidden
                                                ? '#64748b'
                                                : '#00d4ff',
                                        cursor: isPinned ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {isPinned ? '📌' : isHidden ? 'Show' : 'Hide'}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div style={s.footer}>
                    <button
                        onClick={() => {
                            setHidden([]);
                            // Cloud-Sync: pass userId so the RPC fires on reset too
                            const user = getAuthUser();
                            setHiddenCardIds([], user?.id);
                            // 🔴 BUS: broadcast reset so WorldHub updates instantly
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('hub-cards-hidden-changed', { detail: { hiddenIds: [] } }));
                            }
                        }}
                        style={s.resetBtn}
                    >
                        Reset to Default
                    </button>
                    <button onClick={onClose} style={s.doneBtn}>Done</button>
                </div>
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to   { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
            `}</style>
        </>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
    header: {
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '20px 20px 14px',
        borderBottom: '1px solid rgba(0,212,255,0.1)',
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
    headerTitle: { fontSize: 17, fontWeight: 700, color: '#e2e8f0', letterSpacing: 0.3 },
    headerSub: { fontSize: 12, color: '#4a5568', marginTop: 3, lineHeight: 1.4 },
    closeBtn: {
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#94a3b8', borderRadius: 8, width: 32, height: 32,
        cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    note: {
        margin: '0 16px 4px',
        padding: '10px 12px',
        background: 'rgba(0,212,255,0.05)',
        border: '1px solid rgba(0,212,255,0.12)',
        borderRadius: 8,
        fontSize: 12,
        color: '#64748b',
        lineHeight: 1.5,
    },
    list: {
        flex: 1, overflowY: 'auto', padding: '8px 16px',
        display: 'flex', flexDirection: 'column', gap: 6,
    },
    row: {
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.05)',
    },
    cardThumb: {
        width: 36, height: 54, borderRadius: 6,
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        transition: 'opacity 0.2s',
    },
    rowInfo: { flex: 1, minWidth: 0 },
    rowName: {
        fontSize: 14, fontWeight: 600, color: '#e2e8f0',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 4,
    },
    pinnedBadge: { fontSize: 12, marginLeft: 4 },
    specialBadge: {
        fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
        background: 'rgba(0,212,255,0.15)', color: '#00d4ff',
        border: '1px solid rgba(0,212,255,0.3)',
        borderRadius: 4, padding: '1px 5px', marginLeft: 6,
    },
    rowDesc: { fontSize: 11, color: '#4a5568', marginTop: 2 },
    toggleBtn: {
        borderRadius: 8, padding: '6px 14px',
        fontSize: 12, fontWeight: 700,
        flexShrink: 0,
        transition: 'all 0.15s',
    },
    footer: {
        display: 'flex', gap: 10,
        padding: '14px 16px',
        borderTop: '1px solid rgba(0,212,255,0.1)',
    },
    resetBtn: {
        flex: 1, padding: '10px',
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.12)',
        color: '#64748b', borderRadius: 8,
        fontSize: 13, cursor: 'pointer',
    },
    doneBtn: {
        flex: 1, padding: '10px',
        background: 'rgba(0,212,255,0.15)',
        border: '1px solid rgba(0,212,255,0.4)',
        color: '#00d4ff', borderRadius: 8,
        fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
};

export default CardCustomizerPanel;
