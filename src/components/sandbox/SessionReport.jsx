/**
 * SESSION REPORT — Export Current Session Summary
 * Generates a branded summary: hands analyzed, coach verdicts, accuracy.
 * Exportable as image via html2canvas.
 */
import { useState, useRef, useCallback } from 'react';

const M = {
    bg: '#1a1d21', card: '#242526', border: '#3a3b3c',
    cyan: '#4599FF', green: '#00E676', red: '#EF5350',
    gold: '#F5A623', text: '#E4E6EB', sub: '#B0B3B8',
    dim: 'rgba(255,255,255,0.4)',
};

function pctColor(pct) {
    if (pct >= 70) return M.green;
    if (pct >= 50) return M.gold;
    return M.red;
}

export default function SessionReport({ sessionLog = [], coachStreak = 0, onClose }) {
    const [exporting, setExporting] = useState(false);
    const reportRef = useRef(null);

    const totalHands = sessionLog.length;
    const correctHands = sessionLog.filter(s => s.isCorrect).length;
    const accuracy = totalHands > 0 ? Math.round(100 * correctHands / totalHands) : 0;
    const avgEvDelta = totalHands > 0
        ? (sessionLog.reduce((sum, s) => sum + (s.evDelta || 0), 0) / totalHands).toFixed(2)
        : '0.00';

    // Group by position
    const posCounts = {};
    sessionLog.forEach(s => {
        const p = (s.position || 'Unknown').toUpperCase();
        if (!posCounts[p]) posCounts[p] = 0;
        posCounts[p]++;
    });

    // Group by street
    const streetCounts = {};
    sessionLog.forEach(s => {
        const st = (s.street || 'preflop').toLowerCase();
        if (!streetCounts[st]) streetCounts[st] = 0;
        streetCounts[st]++;
    });

    const handleExport = useCallback(async () => {
        if (!reportRef.current) return;
        setExporting(true);
        try {
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(reportRef.current, {
                backgroundColor: '#1a1d21',
                scale: 2,
            });
            const link = document.createElement('a');
            link.download = `session-report-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            try { navigator.vibrate?.(15); } catch (e) { }

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('sandbox-session-report-exported'));
            }
        } catch (e) {
            console.warn('[SessionReport] Export error:', e);
        } finally {
            setExporting(false);
        }
    }, []);

    const handleShare = useCallback(async () => {
        if (!reportRef.current) return;
        try {
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(reportRef.current, {
                backgroundColor: '#1a1d21',
                scale: 2,
            });
            canvas.toBlob(async (blob) => {
                if (navigator.share && blob) {
                    try {
                        await navigator.share({
                            files: [new File([blob], 'session-report.png', { type: 'image/png' })],
                            title: 'GTO Session Report',
                            text: `Session: ${accuracy}% GTO Accuracy — ${totalHands} hands analyzed`,
                        });
                    } catch (e) { /* user cancelled */ }
                }
            }, 'image/png');
        } catch (e) {
            console.warn('[SessionReport] Share error:', e);
        }
    }, [accuracy, totalHands]);

    return (
        <div style={s.overlay} onClick={onClose}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={s.header}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: M.text }}>📋 Session Report</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: M.sub, fontSize: 16, cursor: 'pointer' }}>✕</button>
                </div>

                {totalHands === 0 ? (
                    <div style={{ padding: '30px 12px', textAlign: 'center' }}>
                        <p style={{ color: M.dim, fontSize: 11 }}>No hands analyzed in this session yet.</p>
                    </div>
                ) : (
                    <>
                        {/* Exportable Report Card */}
                        <div ref={reportRef} style={{ padding: 16, background: '#1a1d21' }}>
                            {/* Brand */}
                            <div style={{ textAlign: 'center', marginBottom: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: M.cyan, letterSpacing: 1.5, textTransform: 'uppercase' }}>Smarter.Poker</div>
                                <div style={{ fontSize: 8, color: M.dim, marginTop: 2 }}>Virtual Sandbox — Session Report</div>
                            </div>

                            {/* Big Stats */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <div style={s.statBox}>
                                    <span style={{ ...s.statVal, color: M.cyan }}>{totalHands}</span>
                                    <span style={s.statLabel}>Hands</span>
                                </div>
                                <div style={s.statBox}>
                                    <span style={{ ...s.statVal, color: pctColor(accuracy) }}>{accuracy}%</span>
                                    <span style={s.statLabel}>GTO Accuracy</span>
                                </div>
                                <div style={s.statBox}>
                                    <span style={{ ...s.statVal, color: coachStreak > 0 ? M.gold : M.dim }}>{coachStreak > 0 ? `🔥${coachStreak}` : '—'}</span>
                                    <span style={s.statLabel}>Streak</span>
                                </div>
                            </div>

                            {/* Position Distribution */}
                            {Object.keys(posCounts).length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                    <span style={{ fontSize: 8, color: M.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>Positions Played</span>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                        {Object.entries(posCounts).sort(([, a], [, b]) => b - a).map(([pos, count]) => (
                                            <span key={pos} style={{
                                                fontSize: 9, fontWeight: 700, color: M.sub,
                                                background: 'rgba(255,255,255,0.05)',
                                                border: `1px solid ${M.border}`,
                                                borderRadius: 4, padding: '3px 6px',
                                            }}>{pos} ({count})</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Street Distribution */}
                            {Object.keys(streetCounts).length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                    <span style={{ fontSize: 8, color: M.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>Streets Analyzed</span>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                        {Object.entries(streetCounts).sort(([, a], [, b]) => b - a).map(([street, count]) => (
                                            <span key={street} style={{
                                                fontSize: 9, fontWeight: 700, color: M.sub,
                                                background: 'rgba(255,255,255,0.05)',
                                                border: `1px solid ${M.border}`,
                                                borderRadius: 4, padding: '3px 6px',
                                                textTransform: 'capitalize',
                                            }}>{street} ({count})</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recent Hands Preview */}
                            {sessionLog.slice(-5).reverse().map((entry, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '5px 0', borderBottom: `1px solid ${M.border}`,
                                    fontSize: 9, color: M.sub,
                                }}>
                                    <span style={{ color: entry.isCorrect ? M.green : M.red, fontWeight: 800 }}>
                                        {entry.isCorrect ? '✓' : '✗'}
                                    </span>
                                    <span style={{ fontWeight: 700, color: M.text }}>{entry.hand || '—'}</span>
                                    <span>{entry.position || '—'}</span>
                                    <span style={{ marginLeft: 'auto', color: M.dim }}>{entry.optimalAction || '—'}</span>
                                </div>
                            ))}

                            {/* Timestamp */}
                            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 7, color: M.dim }}>
                                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px' }}>
                            <button onClick={handleExport} disabled={exporting} style={s.exportBtn}>
                                {exporting ? 'Exporting...' : '📥 Save Image'}
                            </button>
                            {typeof navigator?.share === 'function' && (
                                <button onClick={handleShare} style={s.shareBtn}>
                                    📤 Share
                                </button>
                            )}
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
    statBox: {
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '8px 4px', borderRadius: 8,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${M.border}`,
    },
    statVal: {
        fontSize: 18, fontWeight: 800, fontFamily: '"Orbitron", monospace',
        lineHeight: 1.1,
    },
    statLabel: {
        fontSize: 7, color: M.dim, textTransform: 'uppercase',
        letterSpacing: 0.4, marginTop: 3,
    },
    exportBtn: {
        flex: 1, padding: '10px 0', borderRadius: 8,
        background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.4)',
        color: M.cyan, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
    shareBtn: {
        padding: '10px 20px', borderRadius: 8,
        background: 'rgba(0,230,118,0.1)', border: '1px solid rgba(0,230,118,0.3)',
        color: M.green, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
};
