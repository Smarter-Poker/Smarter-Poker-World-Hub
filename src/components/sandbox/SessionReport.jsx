/**
 * SESSION REPORT — Export Current Session Summary
 * Generates a branded summary: hands analyzed, coach verdicts, accuracy.
 * Exportable as a PNG rendered on a <canvas> (no external capture library)
 * and postable to the social feed via /api/sandbox/social-export.
 */
import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getAccessToken } from '../../lib/authUtils';

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

/**
 * Draws the branded report onto a canvas. Replaces the html2canvas dependency
 * (not available in this project) with a deterministic hand-rolled render.
 */
function drawReportCanvas({ totalHands, accuracy, scoredHands, coachStreak, avgEvDelta, posCounts, streetCounts, recent }) {
    const W = 720, H = 900;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#1a1d21';
    ctx.fillRect(0, 0, W, H);

    const font = (size, weight = '400') => `${weight} ${size}px Inter, -apple-system, Helvetica, Arial, sans-serif`;

    // Brand
    ctx.textAlign = 'center';
    ctx.fillStyle = M.cyan;
    ctx.font = font(30, '800');
    ctx.fillText('SMARTER.POKER', W / 2, 62);
    ctx.fillStyle = M.sub;
    ctx.font = font(16);
    ctx.fillText('Virtual Sandbox — Session Report', W / 2, 90);

    // Stat boxes
    const boxes = [
        { val: String(totalHands), label: 'HANDS', color: M.cyan },
        { val: scoredHands > 0 ? `${accuracy}%` : '—', label: 'GTO ACCURACY', color: scoredHands > 0 ? pctColor(accuracy) : M.sub },
        { val: coachStreak > 0 ? `${coachStreak}` : '—', label: 'STREAK', color: coachStreak > 0 ? M.gold : M.sub },
    ];
    const boxW = (W - 80 - 2 * 16) / 3;
    boxes.forEach((b, i) => {
        const x = 40 + i * (boxW + 16);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x, 120, boxW, 96);
        ctx.strokeStyle = M.border;
        ctx.strokeRect(x, 120, boxW, 96);
        ctx.fillStyle = b.color;
        ctx.font = font(38, '800');
        ctx.fillText(b.val, x + boxW / 2, 172);
        ctx.fillStyle = M.sub;
        ctx.font = font(13, '700');
        ctx.fillText(b.label, x + boxW / 2, 198);
    });

    ctx.textAlign = 'left';
    let y = 258;

    ctx.fillStyle = M.sub;
    ctx.font = font(14, '700');
    ctx.fillText(`AVG EV DELTA: ${avgEvDelta} BB`, 40, y);
    y += 34;

    const line = (title, entries) => {
        if (!entries.length) return;
        ctx.fillStyle = M.dim;
        ctx.font = font(13, '700');
        ctx.fillText(title, 40, y);
        y += 24;
        ctx.fillStyle = M.text;
        ctx.font = font(16);
        ctx.fillText(entries.map(([k, v]) => `${k} (${v})`).join('   '), 40, y);
        y += 34;
    };
    line('POSITIONS PLAYED', Object.entries(posCounts).sort(([, a], [, b]) => b - a));
    line('STREETS ANALYZED', Object.entries(streetCounts).sort(([, a], [, b]) => b - a));

    // Recent hands
    ctx.fillStyle = M.dim;
    ctx.font = font(13, '700');
    ctx.fillText('RECENT HANDS', 40, y);
    y += 28;
    recent.forEach(entry => {
        const scored = entry.isCorrect != null;
        ctx.fillStyle = !scored ? M.sub : entry.isCorrect ? M.green : M.red;
        ctx.font = font(18, '800');
        ctx.fillText(!scored ? '·' : entry.isCorrect ? '✓' : '✗', 40, y);
        ctx.fillStyle = M.text;
        ctx.font = font(16, '700');
        ctx.fillText(String(entry.hand || '—'), 70, y);
        ctx.fillStyle = M.sub;
        ctx.font = font(15);
        ctx.fillText(String(entry.position || '—'), 190, y);
        ctx.fillText(String(entry.optimalAction || '—'), 290, y);
        y += 28;
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = M.dim;
    ctx.font = font(13);
    ctx.fillText(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), W / 2, H - 34);

    return canvas;
}

export default function SessionReport({ sessionLog = [], coachStreak = 0, onClose }) {
    const [exporting, setExporting] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [shareSuccess, setShareSuccess] = useState(false);
    const reportRef = useRef(null);

    const log = Array.isArray(sessionLog) ? sessionLog : [];
    const totalHands = log.length;
    // Entries that never received a coach verdict are "unscored" and must not
    // drag the accuracy denominator down.
    const scored = log.filter(s => s.isCorrect != null);
    const scoredHands = scored.length;
    const correctHands = scored.filter(s => s.isCorrect).length;
    const accuracy = scoredHands > 0 ? Math.round(100 * correctHands / scoredHands) : 0;
    const evEntries = log.filter(s => typeof s.evDelta === 'number');
    const avgEvDelta = evEntries.length > 0
        ? (evEntries.reduce((sum, s) => sum + s.evDelta, 0) / evEntries.length).toFixed(2)
        : '0.00';

    // Group by position
    const posCounts = {};
    log.forEach(s => {
        const p = (s.position || 'Unknown').toUpperCase();
        if (!posCounts[p]) posCounts[p] = 0;
        posCounts[p]++;
    });

    // Group by street
    const streetCounts = {};
    log.forEach(s => {
        const st = (s.street || 'preflop').toLowerCase();
        if (!streetCounts[st]) streetCounts[st] = 0;
        streetCounts[st]++;
    });

    const buildCanvas = useCallback(() => drawReportCanvas({
        totalHands, accuracy, scoredHands, coachStreak, avgEvDelta,
        posCounts, streetCounts,
        recent: log.slice(-5).reverse(),
    }), [totalHands, accuracy, scoredHands, coachStreak, avgEvDelta, posCounts, streetCounts, log]);

    const handleExport = useCallback(async () => {
        setExporting(true);
        try {
            const canvas = buildCanvas();
            if (!canvas) throw new Error('Canvas unavailable');
            const link = document.createElement('a');
            link.download = `session-report-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('sandbox-session-report-exported'));
            }
        } catch (e) {
            console.warn('[SessionReport] Export error:', e);
            toast.error('Export failed');
        } finally {
            setExporting(false);
        }
    }, [buildCanvas]);

    const handleShare = useCallback(async () => {
        try {
            const canvas = buildCanvas();
            if (!canvas) throw new Error('Canvas unavailable');
            canvas.toBlob(async (blob) => {
                if (!blob) { toast.error('Share failed'); return; }
                try {
                    await navigator.share({
                        files: [new File([blob], 'session-report.png', { type: 'image/png' })],
                        title: 'GTO Session Report',
                        text: `Session: ${accuracy}% GTO Accuracy — ${totalHands} hands analyzed`,
                    });
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            }, 'image/png');
        } catch (e) {
            console.warn('[SessionReport] Share error:', e);
            toast.error('Share failed');
        }
    }, [accuracy, totalHands, buildCanvas]);

    // W6-6: publish the session summary to the hub feed.
    const handlePostToHub = useCallback(async () => {
        setSharing(true);
        try {
            const token = getAccessToken();
            if (!token) {
                toast.error('Sign in to post to the hub');
                return;
            }
            const res = await fetch('/api/sandbox/social-export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    handCount: totalHands,
                    evLoss: Number(avgEvDelta) * totalHands,
                    content: `Sandbox session: ${totalHands} hands${scoredHands > 0 ? ` at ${accuracy}% GTO accuracy` : ''}.`,
                }),
            });
            const json = await res.json().catch(() => null);
            if (res.ok && json?.success) {
                setShareSuccess(true);
                try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                toast.success('Posted to hub');
            } else {
                console.warn('[SessionReport] Post failed:', json?.error || res.status);
                toast.error(json?.error || 'Failed to post report');
            }
        } catch (e) {
            console.warn('[SessionReport] Post to Hub error:', e);
            toast.error('Failed to post report');
        } finally {
            setSharing(false);
        }
    }, [totalHands, avgEvDelta, accuracy, scoredHands]);

    return (
        <div style={s.overlay} onClick={onClose}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={s.header}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: M.text }}>{'📋 Session Report'}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: M.sub, fontSize: 16, cursor: 'pointer' }}>✕</button>
                </div>

                {totalHands === 0 ? (
                    <div style={{ padding: '30px 12px', textAlign: 'center' }}>
                        <p style={{ color: M.dim, fontSize: 11 }}>No hands analyzed in this session yet.</p>
                    </div>
                ) : (
                    <>
                        {/* Report Card */}
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
                                    <span style={{ ...s.statVal, color: scoredHands > 0 ? pctColor(accuracy) : M.dim }}>
                                        {scoredHands > 0 ? `${accuracy}%` : '—'}
                                    </span>
                                    <span style={s.statLabel}>GTO Accuracy</span>
                                </div>
                                <div style={s.statBox}>
                                    <span style={{ ...s.statVal, color: coachStreak > 0 ? M.gold : M.dim }}>{coachStreak > 0 ? `🔥${coachStreak}` : '—'}</span>
                                    <span style={s.statLabel}>Streak</span>
                                </div>
                            </div>

                            {scoredHands > 0 && scoredHands < totalHands && (
                                <div style={{ fontSize: 8, color: M.dim, textAlign: 'center', marginBottom: 8 }}>
                                    Accuracy based on {scoredHands} coached hand{scoredHands === 1 ? '' : 's'} of {totalHands}.
                                </div>
                            )}

                            {/* Position Distribution */}
                            {Object.keys(posCounts || {}).length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                    <span style={{ fontSize: 8, color: M.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>Positions Played</span>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                        {Object.entries(posCounts || {}).sort(([, a], [, b]) => b - a).map(([pos, count]) => (
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
                            {Object.keys(streetCounts || {}).length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                    <span style={{ fontSize: 8, color: M.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>Streets Analyzed</span>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                        {Object.entries(streetCounts || {}).sort(([, a], [, b]) => b - a).map(([street, count]) => (
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
                            {log.slice(-5).reverse().map((entry, i) => {
                                const isScored = entry.isCorrect != null;
                                return (
                                    <div key={entry.id || i} style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '5px 0', borderBottom: `1px solid ${M.border}`,
                                        fontSize: 9, color: M.sub,
                                    }}>
                                        <span style={{ color: !isScored ? M.dim : entry.isCorrect ? M.green : M.red, fontWeight: 800 }}>
                                            {!isScored ? '•' : entry.isCorrect ? '✓' : '✗'}
                                        </span>
                                        <span style={{ fontWeight: 700, color: M.text }}>{entry.hand || '—'}</span>
                                        <span>{entry.position || '—'}</span>
                                        <span style={{ marginLeft: 'auto', color: M.dim }}>{entry.optimalAction || '—'}</span>
                                    </div>
                                );
                            })}

                            {/* Timestamp */}
                            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 7, color: M.dim }}>
                                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px', flexWrap: 'wrap' }}>
                            <button onClick={handleExport} disabled={exporting} style={s.exportBtn}>
                                {exporting ? 'Exporting...' : '📥 Save Image'}
                            </button>
                            <button onClick={handlePostToHub} disabled={sharing || shareSuccess} style={s.postBtn}>
                                {shareSuccess ? 'Posted!' : sharing ? 'Posting...' : 'Post to Hub'}
                            </button>
                            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                                <button onClick={handleShare} style={s.shareBtn}>
                                    {'📤 Share'}
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
        flex: 1, minWidth: 120, padding: '10px 0', borderRadius: 8,
        background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.4)',
        color: M.cyan, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
    postBtn: {
        padding: '10px 16px', borderRadius: 8,
        background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.35)',
        color: '#c4b5fd', fontSize: 12, fontWeight: 700,
        cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
    shareBtn: {
        padding: '10px 20px', borderRadius: 8,
        background: 'rgba(0,230,118,0.1)', border: '1px solid rgba(0,230,118,0.3)',
        color: M.green, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
};
