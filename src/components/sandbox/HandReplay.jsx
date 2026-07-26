/**
 * HAND REVIEW REPLAY (W5-6)
 * Step through past session hands one at a time.
 * Shows hand → action → GTO → EV delta for each entry.
 * "Play again" pre-loads the scenario into the sandbox.
 */
import { useState, useCallback } from 'react';

const M = {
    card: '#242526', border: '#3a3b3c',
    cyan: '#4599FF', green: '#00E676', red: '#EF5350',
    gold: '#F5A623', text: '#E4E6EB', sub: '#B0B3B8',
    dim: 'rgba(255,255,255,0.4)',
};

function pctColor(pct) {
    if (pct >= 70) return M.green;
    if (pct >= 50) return M.gold;
    return M.red;
}

export default function HandReplay({ sessionLog = [], onLoadScenario, onClose }) {
    const [currentIdx, setCurrentIdx] = useState(0);

    const total = sessionLog.length;
    const entry = sessionLog[currentIdx];

    // Entries logged before a coach verdict exists carry isCorrect == null —
    // they are "unscored" and must not count as mistakes.
    const scored = sessionLog.filter(e => e && e.isCorrect != null);
    const scoredCount = scored.length;
    const correctCount = scored.filter(e => e.isCorrect).length;
    const accuracy = scoredCount > 0 ? Math.round(100 * correctCount / scoredCount) : 0;
    const entryScored = !!entry && entry.isCorrect != null;

    const goNext = useCallback(() => {
        if (currentIdx < total - 1) {
            setCurrentIdx(prev => prev + 1);
            try { navigator.vibrate?.(5); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }
    }, [currentIdx, total]);

    const goPrev = useCallback(() => {
        if (currentIdx > 0) {
            setCurrentIdx(prev => prev - 1);
            try { navigator.vibrate?.(5); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }
    }, [currentIdx]);

    const handlePlayAgain = useCallback(() => {
        if (!entry) return;
        onLoadScenario?.(entry);
        try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        onClose?.();
    }, [entry, onLoadScenario, onClose]);

    return (
        <div style={s.overlay} onClick={onClose}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={s.header}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: M.text }}>{'🎬 Hand Replay'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: M.sub }}>{total} hands</span>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: M.sub, fontSize: 16, cursor: 'pointer' }}>✕</button>
                    </div>
                </div>

                {total === 0 ? (
                    <div style={{ padding: '30px 12px', textAlign: 'center' }}>
                        <p style={{ color: M.dim, fontSize: 11 }}>No hands in this session yet.</p>
                    </div>
                ) : (
                    <>
                        {/* Session Summary Bar */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '0 12px 8px', fontSize: 9 }}>
                            <span style={{ color: M.green }}>{'✅'} {correctCount}</span>
                            <span style={{ color: M.red }}>{'❌'} {scoredCount - correctCount}</span>
                            <span style={{ color: pctColor(accuracy) }}>{scoredCount > 0 ? `${accuracy}%` : '—'}</span>
                            {scoredCount < total && (
                                <span style={{ color: M.dim }}>{total - scoredCount} unscored</span>
                            )}
                        </div>

                        {/* Hand Card */}
                        {entry && (
                            <div style={s.handCard}>
                                {/* Hand counter */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={{
                                        fontSize: 10, fontWeight: 800,
                                        color: !entryScored ? M.dim : entry.isCorrect ? M.green : M.red,
                                    }}>
                                        {!entryScored ? '— NOT COACHED' : entry.isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}
                                    </span>
                                    <span style={{ fontSize: 9, color: M.dim }}>
                                        Hand {currentIdx + 1} / {total}
                                    </span>
                                </div>

                                {/* Hand details */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                    <div style={s.detailRow}>
                                        <span style={s.detailLabel}>Hand</span>
                                        <span style={{
                                            fontSize: 16, fontWeight: 900,
                                            color: M.gold,
                                            fontFamily: '"Orbitron", monospace',
                                        }}>
                                            {entry.hand || '—'}
                                        </span>
                                    </div>
                                    <div style={s.detailRow}>
                                        <span style={s.detailLabel}>Position</span>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: M.cyan }}>
                                            {(entry.position || '—').toUpperCase()}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                    <div style={s.detailRow}>
                                        <span style={s.detailLabel}>Your Pick</span>
                                        <span style={{
                                            fontSize: 12, fontWeight: 700,
                                            color: !entryScored ? M.dim : entry.isCorrect ? M.green : M.red,
                                        }}>
                                            {entry.userPick || '—'}
                                        </span>
                                    </div>
                                    <div style={s.detailRow}>
                                        <span style={s.detailLabel}>GTO Action</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: M.green }}>
                                            {entry.optimalAction || '—'}
                                        </span>
                                    </div>
                                </div>

                                {entry.evDelta != null && entry.evDelta !== 0 && (
                                    <div style={{ textAlign: 'center', marginBottom: 6 }}>
                                        <span style={{ fontSize: 10, color: M.dim }}>EV Delta: </span>
                                        <span style={{
                                            fontSize: 12, fontWeight: 800,
                                            color: entry.evDelta >= 0 ? M.green : M.red,
                                            fontFamily: '"Orbitron", monospace',
                                        }}>
                                            {entry.evDelta >= 0 ? '+' : ''}{Number(entry.evDelta).toFixed(2)} BB
                                        </span>
                                    </div>
                                )}

                                {entry.street && (
                                    <div style={{ fontSize: 9, color: M.dim, textAlign: 'center', textTransform: 'capitalize' }}>
                                        {entry.street}{entry.board ? ` — Board: ${entry.board}` : ''}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Navigation */}
                        <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px', alignItems: 'center' }}>
                            <button
                                onClick={goPrev}
                                disabled={currentIdx === 0}
                                style={{
                                    ...s.navBtn,
                                    opacity: currentIdx === 0 ? 0.3 : 1,
                                }}
                            >
                                ← Prev
                            </button>

                            {onLoadScenario && entry && (
                                <button onClick={handlePlayAgain} style={s.playAgainBtn}>
                                    {'🔄 Play Again'}
                                </button>
                            )}

                            <button
                                onClick={goNext}
                                disabled={currentIdx >= total - 1}
                                style={{
                                    ...s.navBtn,
                                    opacity: currentIdx >= total - 1 ? 0.3 : 1,
                                }}
                            >
                                Next →
                            </button>
                        </div>

                        {/* Progress dots */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 3, padding: '0 12px 10px', flexWrap: 'wrap' }}>
                            {sessionLog.map((e, i) => (
                                <div
                                    key={i}
                                    onClick={() => setCurrentIdx(i)}
                                    style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: i === currentIdx
                                            ? M.cyan
                                            : e?.isCorrect == null
                                                ? 'rgba(255,255,255,0.18)'
                                                : e.isCorrect ? M.green + '44' : M.red + '44',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                    }}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const s = {
    overlay: {
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 999, padding: 12,
    },
    modal: {
        background: M.card,
        border: `1px solid ${M.border}`,
        borderRadius: 14,
        width: '100%', maxWidth: 420,
        maxHeight: '90vh', overflow: 'auto',
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px',
    },
    handCard: {
        margin: '0 12px 10px',
        padding: 12, borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${M.border}`,
    },
    detailRow: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    },
    detailLabel: {
        fontSize: 7, color: M.dim, textTransform: 'uppercase', letterSpacing: 0.5,
    },
    navBtn: {
        flex: 1, padding: '8px 0', borderRadius: 8,
        background: 'rgba(255,255,255,0.05)', border: `1px solid ${M.border}`,
        color: M.sub, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
    },
    playAgainBtn: {
        padding: '8px 14px', borderRadius: 8,
        background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.4)',
        color: M.cyan, fontSize: 11, fontWeight: 700,
        cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
};
