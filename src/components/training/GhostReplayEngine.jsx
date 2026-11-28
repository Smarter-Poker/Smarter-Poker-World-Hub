/**
 * Ghost Replay Engine — Asynchronous PvP Study
 * ===================================================
 * Re-renders historical hands stroke-for-stroke, showing the
 * player's decision alongside the GTO optimal baseline.
 */

import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { handDataOf } from '../../lib/training/handHistoryEntry';

// Re-use core elements from GodModeArena structure
function MiniCard({ rank, suit, isRed }) {
    return (
        <div style={{
            width: 24, height: 34, borderRadius: 3,
            background: 'linear-gradient(180deg, #fff 0%, #f0f0f0 100%)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
            marginRight: 2
        }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: isRed ? '#dc2626' : '#1a1d24', lineHeight: 1 }}>{rank}</span>
            <span style={{ fontSize: 12, color: isRed ? '#dc2626' : '#1a1d24', lineHeight: 1 }}>{suit}</span>
        </div>
    );
}

function parseCards(cardStr) {
    if (!cardStr) return [];
    const SUITS = { s: '♠', h: '♥', d: '♦', c: '♣' };
    const cards = [];
    const regex = /([AKQJT98765432])([shdc])/gi;
    let match;
    while ((match = regex.exec(cardStr)) !== null) {
        cards.push({
            rank: match[1].toUpperCase(),
            suit: SUITS[match[2].toLowerCase()] || match[2],
            isRed: ['h', 'd'].includes(match[2].toLowerCase())
        });
    }
    return cards;
}

export default function GhostReplayEngine({ sessionName, handHistory = [], onClose }) {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    if (!handHistory || handHistory.length === 0) {
        return (
            <div style={styles.overlay}>
                <div role="dialog" aria-modal="true" aria-label="Ghost Replay" className="sp-training-modal-surface" style={styles.emptyBox}>
                    No Hand History Available For This Session.
                    <button type="button" onClick={onClose} className="sd-button sd-primary" style={styles.closeBtnText}>Go Back</button>
                </div>
            </div>
        );
    }

    const currentHand = handHistory[currentIndex];
    // `handData` is spread FLAT onto the entry -- there is no `.handData` key,
    // so this used to resolve to {} and the replay opened with no cards, no
    // board, "Pot: ? BB" and "HERO (UNK)".
    const data = handDataOf(currentHand);
    const heroCards = parseCards(data.heroCards);
    const boardCards = parseCards(data.board);

    // Timeline control
    const handleNext = () => setCurrentIndex(p => Math.min(p + 1, handHistory.length - 1));
    const handlePrev = () => setCurrentIndex(p => Math.max(p - 1, 0));

    return (
        <div style={styles.overlay}>
            <div role="dialog" aria-modal="true" aria-label={`Ghost Replay ${sessionName || ''}`.trim()} className="sp-training-modal-surface" style={styles.container}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={styles.recordingDot} />
                        <div>
                            <div style={styles.title}>GHOST REPLAY <span style={{ color: '#8de6ff' }}>{'//'}</span> {sessionName}</div>
                            <div style={styles.subtitle}>Hand {currentIndex + 1} Of {handHistory.length}</div>
                        </div>
                    </div>
                    <button type="button" aria-label="Close Ghost Replay" onClick={onClose} style={styles.closeBtn}><X size={20} color="#f3f7fb" /></button>
                </div>

                {/* Felt / Mini Arena */}
                <div style={styles.felt}>
                    <div style={styles.potOverlay}>
                        <span style={{ color: '#86daff', fontSize: 12, marginRight: 4 }}>●</span>
                        Pot: {data.pot || '?'} BB
                    </div>

                    {/* Board */}
                    {boardCards.length > 0 && (
                        <div style={styles.boardWrap}>
                            {boardCards.map((c, i) => <MiniCard key={i} {...c} />)}
                        </div>
                    )}

                    {/* Hero Info */}
                    <div style={styles.heroWrap}>
                        <div style={{ display: 'flex', marginBottom: 6 }}>
                            {heroCards.map((c, i) => <MiniCard key={i} {...c} />)}
                        </div>
                        <div style={styles.heroLabel}>HERO ({data.heroPosition || 'UNK'})</div>
                        <div style={styles.heroStack}>{data.stackDepth || '?'} BB</div>
                    </div>

                    {/* Decision Overlay */}
                    <div style={styles.decisionOverlay}>
                        <div style={styles.actionRow}>
                            <span style={styles.actionLabel}>YOUR MOVE:</span>
                            <span style={{
                                ...styles.actionTag,
                                background: currentHand.evLoss > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                color: currentHand.evLoss > 0 ? '#ef4444' : '#22c55e',
                                border: `1px solid ${currentHand.evLoss > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`
                            }}>
                                {data.action || 'Unknown'}
                            </span>
                        </div>
                        {currentHand.evLoss > 0 && data.correctAction && (
                            <div style={{ ...styles.actionRow, marginTop: 8 }}>
                                <span style={styles.actionLabel}>GTO OPTIMAL:</span>
                                <span style={{ ...styles.actionTag, background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.4)' }}>
                                    {data.correctAction}
                                </span>
                            </div>
                        )}
                        <div style={{ ...styles.evLabel, color: currentHand.evLoss > 0 ? '#ef4444' : '#64748b', marginTop: 12 }}>
                            EV: {currentHand.evLoss > 0 ? `-${currentHand.evLoss.toFixed(2)} BB` : 'Perfect (0.00 BB loss)'}
                        </div>
                    </div>
                </div>

                {/* Scrubber / Controls */}
                <div style={styles.controls}>
                    <button type="button" aria-label="Previous Hand" onClick={handlePrev} disabled={currentIndex === 0} style={styles.navBtn}>
                        <ChevronLeft size={20} />
                    </button>
                    <div style={styles.scrubber}>
                        <div style={{ ...styles.progress, width: `${((currentIndex + 1) / handHistory.length) * 100}%` }} />
                    </div>
                    <button type="button" aria-label="Next Hand" onClick={handleNext} disabled={currentIndex === handHistory.length - 1} style={styles.navBtn}>
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: 'fixed', inset: 0,
        background: 'rgba(5, 8, 16, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 99999, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', sans-serif"
    },
    container: {
        width: '92%', maxWidth: 520,
        background: 'linear-gradient(165deg, #0c2031 0%, #040d18 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box',
        border: '3px solid transparent',
        borderRadius: 18, overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.78)'
    },
    header: {
        padding: '14px 18px', background: 'linear-gradient(180deg, #102b40, #061723)',
        borderBottom: '1px solid #688299',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    },
    recordingDot: {
        width: 10, height: 10, borderRadius: '50%',
        background: '#ef4444',
        boxShadow: '0 0 10px #ef4444',
        animation: 'pulse 2s infinite'
    },
    title: {
        fontSize: 13, fontWeight: 900, color: '#f3f7fb', letterSpacing: 1, fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif"
    },
    subtitle: {
        fontSize: 12, color: '#c4d2df', marginTop: 2
    },
    closeBtn: {
        minWidth: 44, minHeight: 44, width: 44, height: 44,
        background: 'linear-gradient(180deg, #34434c 0%, #0d1b25 12%, #030a0e 52%, #07151d 86%, #142e3b 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 18%, #e6f7ff 45%, #4c6470 72%, #e6f4fa 100%) border-box',
        border: '2px solid transparent', borderRadius: 10, cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
    },
    felt: {
        position: 'relative', height: 350,
        background: 'radial-gradient(ellipse at center, #0e2c4a 0%, #040d18 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    },
    potOverlay: {
        position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(2, 10, 18, 0.88)', padding: '4px 12px',
        borderRadius: 14, fontSize: 12, fontWeight: 700, color: '#f3f7fb', border: '1px solid #688299'
    },
    boardWrap: {
        display: 'flex', position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)'
    },
    heroWrap: {
        position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center'
    },
    heroLabel: {
        background: 'linear-gradient(180deg, #51c9ff 0%, #0873ff 18%, #022695 100%)', color: '#ffffff',
        border: '1px solid #b9efff',
        fontSize: 12, fontWeight: 800, padding: '2px 10px', borderRadius: 6, transform: 'translateY(-4px)'
    },
    heroStack: {
        fontSize: 12, fontWeight: 700, color: '#94a3b8'
    },
    decisionOverlay: {
        position: 'absolute', bottom: 20, right: 20,
        background: 'rgba(0,0,0,0.8)', padding: 12, borderRadius: 12,
        border: '1px solid #1e293b', minWidth: 160
    },
    actionRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    },
    actionLabel: {
        fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: 0.5
    },
    actionTag: {
        fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 4, fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif"
    },
    evLabel: {
        fontSize: 12, fontWeight: 700, textAlign: 'right', fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace"
    },
    controls: {
        display: 'flex', alignItems: 'center', padding: '16px 20px', gap: 16,
        background: 'rgba(0, 0, 0, 0.4)'
    },
    navBtn: {
        background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#fff', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center'
    },
    scrubber: {
        flex: 1, height: 6, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 3, overflow: 'hidden'
    },
    progress: {
        height: '100%', background: '#00d4ff', transition: 'width 0.3s ease'
    },
    emptyBox: {
        padding: 40, background: '#0f172a', borderRadius: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13
    },
    closeBtnText: {
        display: 'block', margin: '20px auto 0', padding: '8px 16px', borderRadius: 8,
        background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer'
    }
};
