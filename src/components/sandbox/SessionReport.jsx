/**
 * SESSION REPORT — export the current sitting
 * ═══════════════════════════════════════════════════════════════════════════
 * Fixes that matter here:
 *   • SCOPE — sandbox.js hydrates sessionLog with up to 50 archived hands, so
 *     the old report described the user's history, not this sitting. EVERY
 *     entry carries a `createdAt`, so this run is isolated by the explicit
 *     `sessionStartedAt` stamp the page writes on the hands it creates (with
 *     `source === 'live'` as a secondary marker), plus a toggle so the full
 *     history view is still reachable.
 *   • EXPORT — `<a download>` on a data: URL does nothing on iOS Safari. All
 *     image output now goes through the shared exportCanvas helper
 *     (share sheet -> blob URL -> download) and is previewed before export.
 *   • The hub post now publishes the true summed EV, not avg x totalHands.
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { ClipboardList, Download, Share2, Send } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import { BottomSheet, PAStyles, EmptyState, Segmented } from './paKit';
import { createHiDPICanvas, exportCanvas, canvasPreviewUrl, wrapText, roundRect } from '../../lib/sandbox/exportCanvas';

function pctTone(pct) {
    if (pct >= 70) return T.success;
    if (pct >= 50) return T.warn;
    return T.danger;
}

/**
 * Draws the branded report onto a canvas at device pixel ratio.
 * Height is derived from the content so nothing is clipped, and chip rows wrap
 * instead of running off the right edge.
 */
function drawReportCanvas(data) {
    const {
        totalHands, accuracy, scoredHands, coachStreak, avgEvDelta, totalEvDelta,
        posEntries, streetEntries, recent, scopeLabel,
    } = data;

    const W = 720;
    const chipRows = (entries) => Math.max(1, Math.ceil(entries.length / 4));
    const H = 300
        + 34                                   // ev line
        + (posEntries.length ? 30 + chipRows(posEntries) * 40 : 0)
        + (streetEntries.length ? 30 + chipRows(streetEntries) * 40 : 0)
        + 40 + recent.length * 30
        + 80;

    const { canvas, ctx } = createHiDPICanvas(W, H);
    if (!ctx) return null;

    const font = (size, weight = '400') => `${weight} ${size}px Inter, -apple-system, Helvetica, Arial, sans-serif`;

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = T.accent;
    ctx.font = font(30, '800');
    ctx.fillText('SMARTER.POKER', W / 2, 62);
    ctx.fillStyle = T.textMuted;
    ctx.font = font(16);
    ctx.fillText(`Virtual Sandbox — ${scopeLabel}`, W / 2, 90);

    const boxes = [
        { val: String(totalHands), label: 'HANDS', color: T.accent },
        { val: scoredHands > 0 ? `${accuracy}%` : '—', label: 'GTO ACCURACY', color: scoredHands > 0 ? pctTone(accuracy) : T.textMuted },
        { val: coachStreak > 0 ? String(coachStreak) : '—', label: 'STREAK', color: coachStreak > 0 ? T.warn : T.textMuted },
    ];
    const boxW = (W - 80 - 2 * 16) / 3;
    boxes.forEach((b, i) => {
        const x = 40 + i * (boxW + 16);
        ctx.fillStyle = T.surface;
        roundRect(ctx, x, 120, boxW, 96, 12);
        ctx.fill();
        ctx.strokeStyle = T.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = b.color;
        ctx.font = font(38, '800');
        ctx.fillText(b.val, x + boxW / 2, 172);
        ctx.fillStyle = T.textMuted;
        ctx.font = font(13, '700');
        ctx.fillText(b.label, x + boxW / 2, 198);
    });

    ctx.textAlign = 'left';
    let y = 258;

    ctx.fillStyle = T.textMuted;
    ctx.font = font(14, '700');
    ctx.fillText(`AVG EV DELTA: ${avgEvDelta} BB   ·   TOTAL: ${totalEvDelta} BB`, 40, y);
    y += 34;

    // Wrapping chip rows — the old single fillText ran past the canvas edge.
    const chips = (title, entries) => {
        if (!entries.length) return;
        ctx.fillStyle = T.textDim;
        ctx.font = font(13, '700');
        ctx.fillText(title, 40, y);
        y += 26;

        let x = 40;
        entries.forEach(([key, count]) => {
            const label = `${key} (${count})`;
            ctx.font = font(15, '700');
            const w = ctx.measureText(label).width + 24;
            if (x + w > W - 40) { x = 40; y += 40; }
            ctx.fillStyle = T.surface;
            roundRect(ctx, x, y - 20, w, 30, 8);
            ctx.fill();
            ctx.strokeStyle = T.border;
            ctx.stroke();
            ctx.fillStyle = T.text;
            ctx.fillText(label, x + 12, y);
            x += w + 8;
        });
        y += 44;
    };
    chips('POSITIONS PLAYED', posEntries);
    chips('STREETS ANALYSED', streetEntries);

    ctx.fillStyle = T.textDim;
    ctx.font = font(13, '700');
    ctx.fillText('RECENT HANDS', 40, y);
    y += 28;
    recent.forEach(entry => {
        const scored = entry.isCorrect != null;
        ctx.fillStyle = !scored ? T.textMuted : entry.isCorrect ? T.success : T.danger;
        ctx.font = font(18, '800');
        ctx.fillText(!scored ? '·' : entry.isCorrect ? '✓' : '✗', 40, y);
        ctx.fillStyle = T.text;
        ctx.font = font(16, '700');
        ctx.fillText(String(entry.hand || '—'), 70, y);
        ctx.fillStyle = T.textMuted;
        ctx.font = font(15);
        ctx.fillText(String(entry.position || '—'), 200, y);
        wrapText(ctx, String(entry.optimalAction || '—'), 300, y, W - 340, 20, 1);
        y += 30;
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = T.textDim;
    ctx.font = font(13);
    ctx.fillText(
        new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        W / 2, H - 30,
    );

    return canvas;
}

export default function SessionReport({ sessionLog = [], coachStreak = 0, sessionStartedAt = null, onClose }) {
    const [exporting, setExporting] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [shareSuccess, setShareSuccess] = useState(false);
    const [scope, setScope] = useState('session');
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewError, setPreviewError] = useState(null);
    const successTimer = useRef(null);
    const previewUrlRef = useRef(null);

    const fullLog = useMemo(() => (Array.isArray(sessionLog) ? sessionLog : []), [sessionLog]);

    // Hands appended since the sandbox mounted. The page passes its own mount
    // stamp, so this is exact. When it is missing (older caller) we fall back to
    // the newest `sessionStartedAt` present in the log, then to `source`.
    const liveLog = useMemo(() => {
        if (sessionStartedAt != null) {
            return fullLog.filter(e => Number(e?.sessionStartedAt) === Number(sessionStartedAt));
        }
        const stamped = fullLog.filter(e => e && e.sessionStartedAt != null);
        if (stamped.length > 0) {
            const newest = stamped.reduce((max, e) => Math.max(max, Number(e.sessionStartedAt) || 0), 0);
            return fullLog.filter(e => Number(e?.sessionStartedAt) === newest);
        }
        return fullLog.filter(e => e && e.source === 'live');
    }, [fullLog, sessionStartedAt]);

    const archivedCount = fullLog.length - liveLog.length;
    const log = scope === 'session' ? liveLog : fullLog;
    const scopeLabel = scope === 'session' ? 'This session' : 'All loaded hands';

    const stats = useMemo(() => {
        const totalHands = log.length;
        const scored = log.filter(s => s && s.isCorrect != null);
        const scoredHands = scored.length;
        const correctHands = scored.filter(s => s.isCorrect).length;
        const accuracy = scoredHands > 0 ? Math.round(100 * correctHands / scoredHands) : 0;
        const evEntries = log.filter(s => typeof s?.evDelta === 'number');
        const evSum = evEntries.reduce((sum, s) => sum + s.evDelta, 0);
        const avgEvDelta = evEntries.length > 0 ? (evSum / evEntries.length).toFixed(2) : '0.00';

        const posCounts = {};
        const streetCounts = {};
        log.forEach(s => {
            const p = (s?.position || 'Unknown').toUpperCase();
            posCounts[p] = (posCounts[p] || 0) + 1;
            const st = (s?.street || 'preflop').toLowerCase();
            streetCounts[st] = (streetCounts[st] || 0) + 1;
        });

        return {
            totalHands, scoredHands, correctHands, accuracy,
            evCount: evEntries.length, evSum, avgEvDelta,
            posEntries: Object.entries(posCounts).sort(([, a], [, b]) => b - a),
            streetEntries: Object.entries(streetCounts).sort(([, a], [, b]) => b - a),
            recent: log.slice(-5).reverse(),
        };
    }, [log]);

    const buildCanvas = useCallback(() => drawReportCanvas({
        totalHands: stats.totalHands,
        accuracy: stats.accuracy,
        scoredHands: stats.scoredHands,
        coachStreak,
        avgEvDelta: stats.avgEvDelta,
        totalEvDelta: stats.evSum.toFixed(2),
        posEntries: stats.posEntries,
        streetEntries: stats.streetEntries,
        recent: stats.recent,
        scopeLabel,
    }), [stats, coachStreak, scopeLabel]);

    // Live preview of exactly what will be exported.
    useEffect(() => {
        let cancelled = false;
        if (stats.totalHands === 0) { setPreviewUrl(null); return undefined; }
        setPreviewError(null);
        (async () => {
            try {
                const canvas = buildCanvas();
                if (!canvas) throw new Error('Canvas unavailable');
                const url = await canvasPreviewUrl(canvas);
                if (cancelled) { URL.revokeObjectURL(url); return; }
                if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
                previewUrlRef.current = url;
                setPreviewUrl(url);
            } catch (e) {
                console.warn('[SessionReport] preview failed:', e?.message || e);
                if (!cancelled) setPreviewError('Preview unavailable on this device.');
            }
        })();
        return () => { cancelled = true; };
    }, [buildCanvas, stats.totalHands]);

    useEffect(() => () => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        if (successTimer.current) clearTimeout(successTimer.current);
    }, []);

    const handleExport = useCallback(async () => {
        setExporting(true);
        try {
            const canvas = buildCanvas();
            if (!canvas) throw new Error('Canvas unavailable');
            const result = await exportCanvas(canvas, `session-report-${Date.now()}.png`, {
                title: 'GTO Session Report',
                text: `${stats.totalHands} hands${stats.scoredHands > 0 ? ` at ${stats.accuracy}% GTO accuracy` : ''}`,
            });
            if (result?.hint) toast.success(result.hint);
            try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('sandbox-session-report-exported'));
            }
        } catch (e) {
            console.warn('[SessionReport] Export error:', e);
            toast.error('Could not create the image');
        } finally {
            setExporting(false);
        }
    }, [buildCanvas, stats.totalHands, stats.scoredHands, stats.accuracy]);

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
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    // The true sum over scored hands — avg x totalHands inflated
                    // this by the ratio of unscored hands (often 10x).
                    handCount: stats.totalHands,
                    evLoss: Number(stats.evSum.toFixed(2)),
                    content: `Sandbox session: ${stats.totalHands} hands${stats.scoredHands > 0 ? ` at ${stats.accuracy}% GTO accuracy` : ''}${stats.evCount > 0 ? ` across ${stats.evCount} scored spots` : ''}.`,
                }),
            });
            const json = await res.json().catch(() => null);
            if (res.ok && json?.success) {
                setShareSuccess(true);
                if (successTimer.current) clearTimeout(successTimer.current);
                successTimer.current = setTimeout(() => setShareSuccess(false), 5000);
                try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                toast.success('Posted to hub');
            } else if (res.status === 401) {
                toast.error('Sign in to post to the hub');
            } else {
                console.warn('[SessionReport] Post failed:', json?.error || res.status);
                toast.error('Could not post the report');
            }
        } catch (e) {
            console.warn('[SessionReport] Post to Hub error:', e);
            toast.error('Could not post the report');
        } finally {
            setSharing(false);
        }
    }, [stats]);

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Session report"
            titleIcon={<ClipboardList size={18} strokeWidth={2} color={T.accent} />}
            subtitle={`${scopeLabel} · ${stats.totalHands} hand${stats.totalHands === 1 ? '' : 's'}`}
            ariaLabel="Session report"
            footer={stats.totalHands > 0 ? (
                <>
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={handleExport}
                        disabled={exporting}
                        aria-label="Export this report as an image"
                        style={{ ...btn('primary', { disabled: exporting }), flex: 1 }}
                    >
                        {typeof navigator !== 'undefined' && typeof navigator.share === 'function'
                            ? <Share2 size={18} strokeWidth={2} />
                            : <Download size={18} strokeWidth={2} />}
                        {exporting ? 'Preparing…' : 'Save image'}
                    </button>
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={handlePostToHub}
                        disabled={sharing}
                        style={{ ...btn('secondary', { disabled: sharing }), color: T.purple, borderColor: 'rgba(167,139,250,0.4)' }}
                    >
                        <Send size={18} strokeWidth={2} />
                        {shareSuccess ? 'Posted' : sharing ? 'Posting…' : 'Post'}
                    </button>
                </>
            ) : null}
        >
            <PAStyles />

            {archivedCount > 0 && (
                <div style={{ marginBottom: S.lg }}>
                    <Segmented
                        label="Scope"
                        idPrefix="sr-scope"
                        value={scope}
                        onChange={setScope}
                        options={[
                            { value: 'session', label: `This session (${liveLog.length})` },
                            { value: 'all', label: `All loaded (${fullLog.length})` },
                        ]}
                    />
                </div>
            )}

            {stats.totalHands === 0 ? (
                <EmptyState
                    icon={<ClipboardList size={22} strokeWidth={2} />}
                    title={scope === 'session' ? 'No hands this session' : 'No hands to report'}
                    body={scope === 'session'
                        ? 'Analyse a spot at the table and the report fills in as you play.'
                        : 'Play a few hands in the sandbox to generate a report.'}
                    action={archivedCount > 0 && scope === 'session' ? (
                        <button type="button" className="pa-btn" onClick={() => setScope('all')} style={btn('secondary')}>
                            Show all loaded hands
                        </button>
                    ) : (
                        <button type="button" className="pa-btn" onClick={onClose} style={btn('primary')}>Back to the table</button>
                    )}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg }}>
                    {/* Headline stats */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.sm }}>
                        {[
                            { label: 'Hands', value: String(stats.totalHands), colour: T.accent },
                            {
                                label: 'GTO accuracy',
                                value: stats.scoredHands > 0 ? `${stats.accuracy}%` : '—',
                                colour: stats.scoredHands > 0 ? pctTone(stats.accuracy) : T.textMuted,
                            },
                            { label: 'Streak', value: coachStreak > 0 ? String(coachStreak) : '—', colour: coachStreak > 0 ? T.warn : T.textMuted },
                        ].map(box => (
                            <div
                                key={box.label}
                                style={{
                                    flex: '1 1 30%', minWidth: 100, background: T.surface2,
                                    border: `1px solid ${T.border}`, borderRadius: R.sm,
                                    padding: S.md, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                }}
                            >
                                <span style={{ fontSize: 20, fontWeight: 800, color: box.colour, ...numeric }}>{box.value}</span>
                                <span style={{ fontSize: F.caption, color: T.textMuted, textAlign: 'center' }}>{box.label}</span>
                            </div>
                        ))}
                    </div>

                    {stats.scoredHands > 0 && stats.scoredHands < stats.totalHands && (
                        <p style={{ fontSize: F.caption, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
                            Accuracy is based on {stats.scoredHands} coached hand{stats.scoredHands === 1 ? '' : 's'} of {stats.totalHands}.
                        </p>
                    )}

                    <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                        <span style={pill(stats.evSum >= 0 ? 'success' : 'danger')}>
                            {stats.evSum >= 0 ? '+' : ''}{stats.evSum.toFixed(2)} BB total
                        </span>
                        <span style={pill('neutral')}>Avg {stats.avgEvDelta} BB</span>
                        <span style={pill('neutral')}>{stats.evCount} scored spot{stats.evCount === 1 ? '' : 's'}</span>
                    </div>

                    {stats.posEntries.length > 0 && (
                        <div>
                            <h4 style={{ fontSize: F.label, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.6, margin: `0 0 ${S.sm}px` }}>
                                Positions played
                            </h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.sm }}>
                                {stats.posEntries.map(([pos, count]) => (
                                    <span key={pos} style={pill('neutral')}>{pos} ({count})</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {stats.streetEntries.length > 0 && (
                        <div>
                            <h4 style={{ fontSize: F.label, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.6, margin: `0 0 ${S.sm}px` }}>
                                Streets analysed
                            </h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.sm }}>
                                {stats.streetEntries.map(([street, count]) => (
                                    <span key={street} style={{ ...pill('neutral'), textTransform: 'capitalize' }}>{street} ({count})</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recent hands */}
                    <div>
                        <h4 style={{ fontSize: F.label, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.6, margin: `0 0 ${S.sm}px` }}>
                            Recent hands
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {stats.recent.map((entry, i) => {
                                const isScored = entry?.isCorrect != null;
                                return (
                                    <div
                                        key={entry?.id || `recent-${i}`}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: S.sm,
                                            padding: `${S.sm}px 0`, borderBottom: `1px solid ${T.border}`,
                                            fontSize: F.caption, color: T.textMuted, minHeight: 36,
                                        }}
                                    >
                                        <span style={{
                                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                            background: !isScored ? T.textDim : entry.isCorrect ? T.success : T.danger,
                                        }} />
                                        <span style={{ fontWeight: 700, color: T.text, ...numeric }}>{entry?.hand || '—'}</span>
                                        <span>{entry?.position || '—'}</span>
                                        <span style={{ marginLeft: 'auto', color: T.textDim, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {entry?.optimalAction || '—'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Export preview */}
                    <div>
                        <h4 style={{ fontSize: F.label, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.6, margin: `0 0 ${S.sm}px` }}>
                            Shareable card
                        </h4>
                        {previewUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={previewUrl}
                                alt="Preview of the session report image"
                                style={{ width: '100%', borderRadius: R.sm, border: `1px solid ${T.border}`, display: 'block' }}
                            />
                        ) : (
                            <p style={{ fontSize: F.caption, color: T.textMuted, margin: 0 }}>
                                {previewError || 'Building the preview…'}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </BottomSheet>
    );
}
