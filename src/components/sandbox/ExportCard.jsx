/**
 * ExportCard — branded analysis card for image export.
 * ═══════════════════════════════════════════════════════════════
 * Rendered onto a <canvas> at export time (html2canvas is not a dependency),
 * scaled by devicePixelRatio, previewed in a bottom sheet BEFORE saving, and
 * exported through the shared `exportCanvas` helper — `<a download>` + a data:
 * URL is a silent no-op on iOS Safari, which is most of this audience.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Image as ImageIcon, Download, Share2 } from 'lucide-react';
import { T, F, S, R, btn } from './paTokens';
import { PAStyles, BottomSheet, Skeleton } from './paKit';
import { exportCanvas, createHiDPICanvas, roundRect, wrapText, drawPlayingCard, canvasPreviewUrl } from '../../lib/sandbox/exportCanvas';

const C = {
    bgTop: '#18191A', bgBottom: '#242526',
    text: '#E4E6EB', sub: '#B0B3B8', dim: '#65676B',
    accent: '#4599FF', success: '#22C55E', danger: '#EF4444', warn: '#FBBF24',
};

const CARD_RE = /^[2-9TJQKA][cdhs]$/i;

function splitCards(str) {
    if (!str) return [];
    const raw = String(str).trim();
    if (/^preflop$/i.test(raw)) return [];
    const tokens = raw.includes(' ') || raw.includes(',')
        ? raw.split(/[\s,]+/)
        : (raw.match(/.{1,2}/g) || []);
    return tokens
        .map(t => (t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : ''))
        .filter(t => CARD_RE.test(t));
}

function font(size, weight = '400') {
    return `${weight} ${size}px Inter, -apple-system, Helvetica, Arial, sans-serif`;
}

/**
 * Draws the shareable analysis card. Returns a canvas (already DPR-scaled).
 * Exported as `drawAnalysisCard` so ShareHandModal renders the identical card
 * natively instead of reaching for html2canvas, which is not a dependency.
 */
export function drawAnalysisCard(results, scenario, equity = null, villainRange = null) {
    return drawCard(results, scenario, equity, villainRange);
}

function drawCard(results, scenario, equity, villainRange) {
    const W = 800, H = 560;
    const { canvas, ctx } = createHiDPICanvas(W, H);
    if (!ctx) return null;

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, C.bgTop);
    grad.addColorStop(1, C.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // ── Header ────────────────────────────────────────────────
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.text;
    ctx.font = font(32, '800');
    ctx.fillText('Smarter.Poker', 40, 62);
    ctx.fillStyle = C.dim;
    ctx.font = font(15);
    ctx.fillText('GTO Analysis · Virtual Sandbox', 40, 86);

    ctx.textAlign = 'right';
    ctx.fillStyle = C.accent;
    ctx.font = font(15, '700');
    ctx.fillText(String(scenario?.position || 'BTN').toUpperCase(), W - 40, 62);
    ctx.fillStyle = C.dim;
    ctx.font = font(13);
    ctx.fillText(new Date().toLocaleDateString(), W - 40, 86);
    ctx.textAlign = 'left';

    // ── Hero + board cards ────────────────────────────────────
    const heroCards = splitCards(scenario?.hand);
    const boardCards = splitCards(scenario?.board);

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, 40, 112, W - 80, 132, 12);
    ctx.fill();

    ctx.fillStyle = C.sub;
    ctx.font = font(13, '700');
    ctx.fillText('HERO', 60, 140);
    let x = 60;
    if (heroCards.length) {
        heroCards.forEach(c => { x = drawPlayingCard(ctx, c, x, 152, 52, 72); });
    } else {
        ctx.fillStyle = C.dim;
        ctx.font = font(18, '700');
        ctx.fillText('No hole cards', 60, 196);
        x = 220;
    }

    ctx.fillStyle = C.sub;
    ctx.font = font(13, '700');
    ctx.fillText('BOARD', Math.max(x + 24, 300), 140);
    let bx = Math.max(x + 24, 300);
    if (boardCards.length) {
        boardCards.forEach(c => { bx = drawPlayingCard(ctx, c, bx, 152, 52, 72); });
    } else {
        ctx.fillStyle = C.dim;
        ctx.font = font(18, '700');
        ctx.fillText('Preflop', bx, 196);
    }

    // ── Optimal action ────────────────────────────────────────
    ctx.fillStyle = 'rgba(34,197,94,0.10)';
    roundRect(ctx, 40, 260, W - 80, 108, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(34,197,94,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = C.sub;
    ctx.font = font(13, '700');
    ctx.fillText('OPTIMAL ACTION', 60, 288);
    ctx.fillStyle = C.success;
    ctx.font = font(30, '800');
    ctx.fillText(String(results?.optimalAction?.label || 'N/A'), 60, 326);
    ctx.fillStyle = C.sub;
    ctx.font = font(14);
    const freq = results?.optimalAction?.frequency;
    ctx.fillText(
        `${freq != null ? `${Math.round(Number(freq))}% frequency` : 'Frequency n/a'}   ·   EV ${results?.ev?.heroDisplay || 'N/A'}`,
        60, 352
    );

    // ── Equity bar ────────────────────────────────────────────
    let y = 400;
    const heroEq = Number(equity?.heroEquity ?? equity?.hero ?? equity);
    if (Number.isFinite(heroEq)) {
        const barW = W - 80;
        ctx.fillStyle = C.sub;
        ctx.font = font(13, '700');
        ctx.fillText('HERO EQUITY', 40, y);
        y += 14;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        roundRect(ctx, 40, y, barW, 18, 9);
        ctx.fill();
        const pct = Math.max(0, Math.min(100, heroEq));
        ctx.fillStyle = pct >= 55 ? C.success : pct >= 45 ? C.warn : C.danger;
        roundRect(ctx, 40, y, Math.max(18, barW * (pct / 100)), 18, 9);
        ctx.fill();
        ctx.fillStyle = C.text;
        ctx.font = font(13, '800');
        ctx.textAlign = 'right';
        ctx.fillText(`${pct.toFixed(1)}%`, W - 48, y + 14);
        ctx.textAlign = 'left';
        y += 44;
    }

    // ── Villain range ─────────────────────────────────────────
    if (villainRange) {
        ctx.fillStyle = C.sub;
        ctx.font = font(13, '700');
        ctx.fillText('VILLAIN RANGE', 40, y);
        y += 20;
        ctx.fillStyle = C.dim;
        ctx.font = font(14);
        y = wrapText(ctx, String(villainRange).replace(/,/g, ', '), 40, y, W - 80, 20, 2);
        y += 8;
    }

    // ── Explanation ───────────────────────────────────────────
    if (results?.explanation && y < H - 70) {
        ctx.fillStyle = C.sub;
        ctx.font = font(14);
        wrapText(ctx, results.explanation, 40, y, W - 80, 20, 2);
    }

    // ── Footer ────────────────────────────────────────────────
    ctx.fillStyle = C.dim;
    ctx.font = font(13);
    ctx.fillText('smarter.poker/sandbox', 40, H - 26);

    return canvas;
}

export function ExportCard({ results, scenario, equity = null, villainRange = null, onExport }) {
    const [sheetOpen, setSheetOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [building, setBuilding] = useState(false);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    // Revoke the preview object URL whenever it is replaced or unmounted.
    useEffect(() => () => { if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) { /* noop */ } } }, [previewUrl]);

    const build = useCallback(() => drawCard(results, scenario, equity, villainRange), [results, scenario, equity, villainRange]);

    const openPreview = useCallback(async () => {
        setSheetOpen(true);
        setBuilding(true);
        setError(null);
        try {
            const canvas = build();
            if (!canvas) throw new Error('Canvas unavailable');
            const url = await canvasPreviewUrl(canvas);
            setPreviewUrl(prev => {
                if (prev) { try { URL.revokeObjectURL(prev); } catch (e) { /* noop */ } }
                return url;
            });
        } catch (e) {
            console.warn('[ExportCard] Preview failed:', e);
            setError('Could not render the card. Try again.');
        } finally {
            setBuilding(false);
        }
    }, [build]);

    const doExport = useCallback(async () => {
        setBusy(true);
        try {
            const canvas = build();
            if (!canvas) throw new Error('Canvas unavailable');
            const res = await exportCanvas(canvas, `smarter-poker-analysis-${Date.now()}.png`, {
                title: 'Smarter.Poker — GTO analysis',
                text: `${scenario?.position || ''} ${scenario?.hand || ''}`.trim(),
            });
            try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            if (res.hint) toast.success(res.hint);
            onExport?.(res);
        } catch (e) {
            console.warn('[ExportCard] Export failed:', e);
            toast.error('Export failed — try a screenshot instead');
        } finally {
            setBusy(false);
        }
    }, [build, scenario, onExport]);

    if (!results) return null;

    return (
        <>
            <PAStyles />
            <button
                type="button"
                className="pa-btn"
                onClick={openPreview}
                aria-label="Preview and export this analysis as an image"
                style={{ ...btn('secondary', { block: true }), marginBottom: S.sm }}
            >
                <ImageIcon size={18} strokeWidth={2} />
                Export as Image
            </button>

            <BottomSheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title="Share card"
                subtitle="Preview before you save"
                ariaLabel="Analysis share card preview"
                footer={(
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={doExport}
                        disabled={busy || building}
                        style={btn('primary', { block: true, disabled: busy || building })}
                    >
                        {typeof navigator !== 'undefined' && typeof navigator.share === 'function'
                            ? <Share2 size={18} strokeWidth={2} />
                            : <Download size={18} strokeWidth={2} />}
                        {busy ? 'Preparing…' : 'Save or share'}
                    </button>
                )}
            >
                {building && <Skeleton h={210} />}
                {!building && error && (
                    <div style={{
                        padding: S.md, borderRadius: R.sm, background: T.dangerSoft,
                        border: '1px solid rgba(239,68,68,0.4)', color: T.danger,
                        fontSize: F.bodySm, lineHeight: 1.45,
                    }}>
                        {error}
                    </div>
                )}
                {!building && !error && previewUrl && (
                    <img
                        src={previewUrl}
                        alt="Analysis card preview"
                        style={{
                            width: '100%', maxWidth: '100%', height: 'auto', display: 'block',
                            borderRadius: R.sm, border: `1px solid ${T.border}`, background: T.bg,
                        }}
                    />
                )}
                <p style={{ fontSize: F.caption, color: T.textMuted, margin: `${S.md}px 0 0`, lineHeight: 1.45 }}>
                    On iPhone this opens the share sheet (or the image in a new tab) — long-press it to add
                    the card to Photos.
                </p>
            </BottomSheet>
        </>
    );
}

export default ExportCard;
