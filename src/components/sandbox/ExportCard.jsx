/**
 * ExportCard · Club Arena Branded Hand-Export Canvas.
 * ===========================================================================
 * Rendered onto a <canvas> at export time (html2canvas is not a dependency),
 * scaled by devicePixelRatio, previewed in a bottom sheet BEFORE saving, and
 * exported through the shared `exportCanvas` helper · `<a download>` + a data:
 * URL is a silent no-op on iOS Safari, which is most of this audience.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Image as ImageIcon, Download, Share2 } from 'lucide-react';
import { T, F, S, R, btn } from './paTokens';
import { PAStyles, BottomSheet, Skeleton } from './paKit';
import { exportCanvas, createHiDPICanvas, roundRect, wrapText, canvasPreviewUrl } from '../../lib/sandbox/exportCanvas';

const C = {
    bgTop: '#030811',
    bgMid: '#071422',
    bgBottom: '#02050A',
    woodOuter: '#2B160B',
    woodMid: '#6E3F21',
    woodHighlight: '#8F5832',
    woodInner: '#3E2111',
    feltCenter: '#1B6B44',
    feltMid: '#104B2E',
    feltEdge: '#072C1A',
    goldPinstripe: 'rgba(212, 175, 85, 0.58)',
    text: '#EEF8FF',
    sub: '#B7D0DD',
    dim: '#8295A2',
    accent: '#63E7FF',
    success: '#4DE0A5',
    danger: '#FF6B7A',
    suitS: '#151B26',
    suitH: '#D92B3A',
    suitD: '#1466D6',
    suitC: '#138A4E',
};

const CARD_RE = /^(?:10|[2-9TJQKA])[cdhs]$/i;

function splitCards(str) {
    if (!str) return [];
    if (Array.isArray(str)) {
        return str
            .map(t => normalizeCardCode(t))
            .filter(Boolean);
    }
    const raw = String(str).trim();
    if (/^preflop$/i.test(raw)) return [];
    const tokens = raw.includes(' ') || raw.includes(',')
        ? raw.split(/[\s,]+/)
        : (raw.match(/(?:10|[2-9TJQKA])[cdhs]/gi) || []);
    return tokens
        .map(t => normalizeCardCode(t))
        .filter(Boolean);
}

function normalizeCardCode(token) {
    const clean = String(token || '').trim();
    if (!CARD_RE.test(clean)) return null;
    const suit = clean.slice(-1).toLowerCase();
    const rankRaw = clean.slice(0, -1).toUpperCase();
    const rank = rankRaw === '10' ? 'T' : rankRaw;
    return `${rank}${suit}`;
}

function font(size, weight = '400') {
    return `${weight} ${size}px Inter, -apple-system, Helvetica, Arial, sans-serif`;
}

function drawOvalPath(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.closePath();
}

function drawFourColorCard(ctx, code, x, y, w = 52, h = 74) {
    const suit = String(code || '').slice(-1).toLowerCase();
    const rankRaw = String(code || '').slice(0, -1).toUpperCase();
    const rank = rankRaw === 'T' ? '10' : (rankRaw || '?');
    const suitGlyph = { h: '♥', d: '♦', c: '♣', s: '♠' }[suit] || '';
    const suitColor = { h: C.suitH, d: C.suitD, c: C.suitC, s: C.suitS }[suit] || C.suitS;

    ctx.save();
    // Drop shadow onto the felt
    ctx.shadowColor = 'rgba(0, 0, 0, 0.48)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    roundRect(ctx, x, y, w, h, 7);
    const faceGrad = ctx.createLinearGradient(x, y, x, y + h);
    faceGrad.addColorStop(0, '#FFFFFF');
    faceGrad.addColorStop(1, '#EAF0F7');
    ctx.fillStyle = faceGrad;
    ctx.fill();

    // Clear shadow for crisp stroke and glyphs
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = 'rgba(15, 28, 44, 0.32)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Top-left corner index
    ctx.fillStyle = suitColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(Math.round(h * 0.27), '800');
    ctx.fillText(rank, x + 5, y + Math.round(h * 0.30));
    ctx.font = font(Math.round(h * 0.21), '700');
    ctx.fillText(suitGlyph, x + 6, y + Math.round(h * 0.50));

    // Center large suit pip
    ctx.textAlign = 'center';
    ctx.font = font(Math.round(h * 0.42), '700');
    ctx.fillText(suitGlyph, x + w * 0.54, y + h * 0.84);
    ctx.restore();
}

function drawDealerButton(ctx, cx, cy, r = 15) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.52)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const btnGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    btnGrad.addColorStop(0, '#FFFFFF');
    btnGrad.addColorStop(1, '#CBD8E6');
    ctx.fillStyle = btnGrad;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#102438';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r - 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200, 162, 74, 0.72)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#091624';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(Math.round(r * 1.05), '900');
    ctx.fillText('D', cx, cy + 0.5);
    ctx.restore();
}

/**
 * Draws the shareable Club Arena hand card. Returns a canvas (already DPR-scaled).
 * Exported as `drawAnalysisCard` so ShareHandModal renders the identical card
 * natively instead of reaching for html2canvas, which is not a dependency.
 */
export function drawAnalysisCard(results, scenario, equity = null, villainRange = null) {
    return drawCard(results, scenario, equity, villainRange);
}

function drawCard(results, scenario, equity, villainRange) {
    const W = 800;
    const H = 600;
    const { canvas, ctx } = createHiDPICanvas(W, H);
    if (!ctx) return null;

    // 1. Dark midnight casino backdrop with subtle overhead table spotlight
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, C.bgTop);
    bgGrad.addColorStop(0.5, C.bgMid);
    bgGrad.addColorStop(1, C.bgBottom);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const spot = ctx.createRadialGradient(W / 2, 235, 30, W / 2, 235, 420);
    spot.addColorStop(0, 'rgba(30, 128, 86, 0.22)');
    spot.addColorStop(0.6, 'rgba(8, 124, 250, 0.08)');
    spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);

    // Outer subtle metallic border frame
    ctx.strokeStyle = 'rgba(174, 192, 208, 0.22)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 12, 12, W - 24, H - 24, 16);
    ctx.stroke();

    // 2. Top Header Bar
    const hasVerifiedResult = !!(results?.optimalAction?.label);
    const heroCards = splitCards(scenario?.hand);
    const boardCards = splitCards(scenario?.board);
    const posLabel = String(scenario?.position || 'BTN').toUpperCase();
    const streetTxt = scenario?.street
        ? String(scenario.street).toUpperCase()
        : (boardCards.length >= 5 ? 'RIVER' : boardCards.length === 4 ? 'TURN' : boardCards.length >= 3 ? 'FLOP' : 'PREFLOP');
    const potVal = scenario?.pot != null && Number.isFinite(Number(scenario.pot))
        ? `${Number(scenario.pot).toFixed(1)} BB`
        : 'CUSTOM POT';
    const stackVal = scenario?.stack != null && Number.isFinite(Number(scenario.stack))
        ? `${Math.round(Number(scenario.stack))} BB EFF.`
        : '100 BB EFF.';

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.text;
    ctx.font = font(24, '800');
    ctx.fillText('SMARTER.POKER', 36, 52);

    ctx.fillStyle = C.accent;
    ctx.font = font(12, '700');
    ctx.fillText(
        hasVerifiedResult ? 'CLUB ARENA · VERIFIED STUDY' : 'CLUB ARENA · VIRTUAL SANDBOX',
        36,
        71
    );

    // Top-right Position + Stack capsule
    const badgeText = `${posLabel}  ·  ${streetTxt}  ·  ${stackVal}`;
    ctx.font = font(12, '700');
    const badgeW = Math.min(310, Math.max(180, ctx.measureText(badgeText).width + 28));
    const badgeX = W - 36 - badgeW;
    ctx.fillStyle = 'rgba(8, 22, 38, 0.85)';
    roundRect(ctx, badgeX, 32, badgeW, 30, 15);
    ctx.fill();
    ctx.strokeStyle = 'rgba(99, 231, 255, 0.42)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, badgeX + badgeW / 2, 51);
    ctx.textAlign = 'left';

    // 3. Club Arena Wood/Felt Oval Poker Table
    const tableCx = W / 2;
    const tableCy = 236;
    const railRx = 342;
    const railRy = 138;
    const feltRx = 310;
    const feltRy = 108;

    // Ambient drop shadow under table
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 14;
    drawOvalPath(ctx, tableCx, tableCy, railRx, railRy);
    ctx.fillStyle = C.woodOuter;
    ctx.fill();
    ctx.restore();

    // Brushed-wood rail gradient
    const woodGrad = ctx.createLinearGradient(tableCx, tableCy - railRy, tableCx, tableCy + railRy);
    woodGrad.addColorStop(0, C.woodHighlight);
    woodGrad.addColorStop(0.28, C.woodMid);
    woodGrad.addColorStop(0.75, C.woodInner);
    woodGrad.addColorStop(1, C.woodOuter);
    drawOvalPath(ctx, tableCx, tableCy, railRx, railRy);
    ctx.fillStyle = woodGrad;
    ctx.fill();

    // Subtle wood grain specular rim
    drawOvalPath(ctx, tableCx, tableCy, railRx - 1.5, railRy - 1.5);
    ctx.strokeStyle = 'rgba(218, 174, 122, 0.34)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner dark rail cushion recess
    drawOvalPath(ctx, tableCx, tableCy, feltRx + 8, feltRy + 8);
    ctx.fillStyle = '#1B0E07';
    ctx.fill();

    // Rich Classic Green Felt
    const feltGrad = ctx.createRadialGradient(tableCx, tableCy - 18, 22, tableCx, tableCy, feltRx);
    feltGrad.addColorStop(0, C.feltCenter);
    feltGrad.addColorStop(0.62, C.feltMid);
    feltGrad.addColorStop(1, C.feltEdge);
    drawOvalPath(ctx, tableCx, tableCy, feltRx, feltRy);
    ctx.fillStyle = feltGrad;
    ctx.fill();

    // Inner cushion shadow along felt edge
    ctx.save();
    drawOvalPath(ctx, tableCx, tableCy, feltRx, feltRy);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();

    // Inner Gold Pinstripe Oval
    drawOvalPath(ctx, tableCx, tableCy, feltRx - 16, feltRy - 14);
    ctx.strokeStyle = C.goldPinstripe;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Subtle Felt Watermark
    ctx.fillStyle = 'rgba(238, 248, 255, 0.12)';
    ctx.textAlign = 'center';
    ctx.font = font(12, '800');
    ctx.fillText('SMARTER.POKER  ·  CLUB ARENA', tableCx, tableCy - 66);

    // 4. Frosted POT Capsule above Board
    const potCaption = `POT  ${potVal}`;
    ctx.font = font(13, '800');
    const potPillW = Math.max(132, ctx.measureText(potCaption).width + 34);
    const potPillX = tableCx - potPillW / 2;
    const potPillY = tableCy - 54;
    ctx.fillStyle = 'rgba(4, 12, 22, 0.74)';
    roundRect(ctx, potPillX, potPillY, potPillW, 28, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(99, 231, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    ctx.fillText(potCaption, tableCx, potPillY + 18.5);

    // 5. Board Cards centered on the felt
    const boardCardW = 50;
    const boardCardH = 70;
    const boardGap = 8;
    const boardY = tableCy - 16;
    if (boardCards.length > 0) {
        const totalBoardW = boardCards.length * boardCardW + (boardCards.length - 1) * boardGap;
        let bx = tableCx - totalBoardW / 2;
        boardCards.forEach((c) => {
            drawFourColorCard(ctx, c, bx, boardY, boardCardW, boardCardH);
            bx += boardCardW + boardGap;
        });
    } else {
        ctx.fillStyle = 'rgba(4, 16, 12, 0.42)';
        roundRect(ctx, tableCx - 96, boardY + 14, 192, 36, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(212, 175, 85, 0.32)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(238, 248, 255, 0.72)';
        ctx.textAlign = 'center';
        ctx.font = font(13, '700');
        ctx.fillText('PREFLOP ACTION', tableCx, boardY + 37);
    }

    // 6. Hero Seat Pod + Hero 4-Color Cards + Dealer Button on lower rail
    const heroCardCount = heroCards.length;
    const heroCardW = heroCardCount > 4 ? 42 : 50;
    const heroCardH = heroCardCount > 4 ? 60 : 70;
    const heroGap = heroCardCount > 4 ? 4 : 7;
    const heroY = tableCy + 66;

    // Dealer button on felt near Hero right
    drawDealerButton(ctx, tableCx + 152, tableCy + 56, 15);

    // Hero label badge to left of hero cards
    if (heroCardCount > 0) {
        const cardsTotalW = heroCardCount * heroCardW + (heroCardCount - 1) * heroGap;
        const heroPodW = 92;
        const groupW = heroPodW + 12 + cardsTotalW;
        const startX = tableCx - groupW / 2;

        // Hero seat pod
        ctx.fillStyle = 'rgba(5, 16, 28, 0.92)';
        roundRect(ctx, startX, heroY + 10, heroPodW, 50, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(99, 231, 255, 0.58)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = C.accent;
        ctx.font = font(12, '800');
        ctx.fillText('HERO', startX + heroPodW / 2, heroY + 30);
        ctx.fillStyle = C.text;
        ctx.font = font(13, '800');
        ctx.fillText(posLabel, startX + heroPodW / 2, heroY + 49);

        let hx = startX + heroPodW + 12;
        heroCards.forEach((c) => {
            drawFourColorCard(ctx, c, hx, heroY, heroCardW, heroCardH);
            hx += heroCardW + heroGap;
        });
    } else {
        ctx.fillStyle = 'rgba(5, 16, 28, 0.88)';
        roundRect(ctx, tableCx - 98, heroY + 14, 196, 38, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(174, 192, 208, 0.32)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = C.sub;
        ctx.font = font(13, '700');
        ctx.fillText(`HERO (${posLabel}) · NO CARDS`, tableCx, heroY + 38);
    }

    // 7. Lower Analysis / Action Line / Equity Panel
    ctx.textAlign = 'left';
    const panelX = 36;
    const panelY = 402;
    const panelW = W - 72;
    const panelH = 148;

    ctx.fillStyle = 'rgba(7, 20, 34, 0.86)';
    roundRect(ctx, panelX, panelY, panelW, panelH, 12);
    ctx.fill();
    ctx.strokeStyle = hasVerifiedResult ? 'rgba(77, 224, 165, 0.36)' : 'rgba(99, 231, 255, 0.30)';
    ctx.lineWidth = 1;
    ctx.stroke();

    let cursorY = panelY + 26;
    if (hasVerifiedResult) {
        ctx.fillStyle = C.success;
        ctx.font = font(12, '800');
        ctx.fillText('VERIFIED ACTION', panelX + 20, cursorY);

        ctx.fillStyle = C.text;
        ctx.font = font(20, '800');
        const freq = results?.optimalAction?.frequency;
        const summary = `${String(results.optimalAction.label)}  ·  ${freq != null ? `${Math.round(Number(freq))}% Freq` : 'Frequency N/A'}  ·  EV ${results?.ev?.heroDisplay || 'N/A'}`;
        ctx.fillText(summary, panelX + 20, cursorY + 26);
        cursorY += 46;
    } else {
        ctx.fillStyle = C.accent;
        ctx.font = font(12, '800');
        ctx.fillText('ACTION LINE · UNGRADED STUDY', panelX + 20, cursorY);

        ctx.fillStyle = C.text;
        ctx.font = font(15, '700');
        const lineText = scenario?.actionLine
            ? String(scenario.actionLine)
            : `${streetTxt} Spot · ${potVal} · ${stackVal} · No Fabricated Solver Grades`;
        cursorY = wrapText(ctx, lineText, panelX + 20, cursorY + 22, panelW - 40, 20, 2) + 2;
    }

    // Monte Carlo Equity bar if present
    const heroEq = Number(equity?.heroEquity ?? equity?.hero ?? equity);
    if (Number.isFinite(heroEq)) {
        const pct = Math.max(0, Math.min(100, heroEq));
        const barX = panelX + 20;
        const barW = panelW - 40;
        const barY = Math.min(cursorY + 6, panelY + 94);

        ctx.fillStyle = C.sub;
        ctx.font = font(12, '700');
        ctx.fillText('MONTE CARLO EQUITY', barX, barY);

        ctx.textAlign = 'right';
        ctx.fillStyle = pct >= 55 ? C.success : pct >= 45 ? C.accent : C.danger;
        ctx.font = font(13, '800');
        ctx.fillText(`${pct.toFixed(1)}%`, barX + barW, barY);
        ctx.textAlign = 'left';

        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        roundRect(ctx, barX, barY + 8, barW, 14, 7);
        ctx.fill();

        ctx.fillStyle = pct >= 55 ? C.success : pct >= 45 ? C.accent : C.danger;
        roundRect(ctx, barX, barY + 8, Math.max(16, barW * (pct / 100)), 14, 7);
        ctx.fill();

        cursorY = barY + 38;
    }

    // Villain Range (compact single line at bottom of panel if space)
    if (villainRange && cursorY <= panelY + panelH - 10) {
        ctx.fillStyle = C.dim;
        ctx.font = font(12, '700');
        const rangeLabel = `VILLAIN RANGE: ${String(villainRange).replace(/,/g, ', ')}`;
        wrapText(ctx, rangeLabel, panelX + 20, Math.min(cursorY + 4, panelY + panelH - 12), panelW - 40, 16, 1);
    } else if (results?.explanation && cursorY <= panelY + panelH - 10) {
        ctx.fillStyle = C.sub;
        ctx.font = font(12, '600');
        wrapText(ctx, results.explanation, panelX + 20, Math.min(cursorY + 4, panelY + panelH - 12), panelW - 40, 16, 1);
    }

    // 8. Brand Footer
    ctx.fillStyle = C.sub;
    ctx.font = font(12, '800');
    ctx.textAlign = 'left';
    ctx.fillText('SMARTER.POKER · CLUB ARENA', 36, H - 24);

    ctx.fillStyle = C.dim;
    ctx.font = font(12, '600');
    ctx.textAlign = 'right';
    ctx.fillText(`smarter.poker/sandbox  ·  ${new Date().toLocaleDateString()}`, W - 36, H - 24);
    ctx.textAlign = 'left';

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
            setError('Could Not Render The Card. Try Again.');
        } finally {
            setBuilding(false);
        }
    }, [build]);

    const doExport = useCallback(async () => {
        setBusy(true);
        try {
            const canvas = build();
            if (!canvas) throw new Error('Canvas unavailable');
            const res = await exportCanvas(canvas, `smarter-poker-club-arena-${Date.now()}.png`, {
                title: 'Smarter.Poker · Club Arena Hand',
                text: `${scenario?.position || ''} ${scenario?.hand || ''}`.trim(),
            });
            try { navigator.vibrate?.(15); } catch (e) { console.warn('[ExportCard] Vibration skipped:', e?.message || e); }
            if (res.hint) toast.success(res.hint);
            onExport?.(res);
        } catch (e) {
            console.warn('[ExportCard] Export failed:', e);
            toast.error('Export Failed · Try A Screenshot Instead');
        } finally {
            setBusy(false);
        }
    }, [build, scenario, onExport]);

    if (!results && !scenario) return null;

    return (
        <>
            <PAStyles />
            <button
                type="button"
                className="pa-btn"
                onClick={openPreview}
                aria-label="Preview And Export This Scenario As A Club Arena Image"
                style={{ ...btn('secondary', { block: true }), marginBottom: S.sm }}
            >
                <ImageIcon size={18} strokeWidth={2} />
                Export Scenario Image
            </button>

            <BottomSheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title="Share Card"
                subtitle="Preview Before You Save"
                ariaLabel="Club Arena Hand Share Card Preview"
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
                        {busy ? 'Preparing...' : 'Save Or Share'}
                    </button>
                )}
            >
                {building && <Skeleton h={210} />}
                {!building && error && (
                    <div style={{
                        padding: S.md, borderRadius: R.sm, background: T.dangerSoft,
                        border: '1px solid rgba(255,107,122,0.4)', color: T.danger,
                        fontSize: F.bodySm, lineHeight: 1.45,
                    }}>
                        {error}
                    </div>
                )}
                {!building && !error && previewUrl && (
                    <img
                        src={previewUrl}
                        alt="Club Arena Hand Card Preview"
                        style={{
                            width: '100%', maxWidth: '100%', height: 'auto', display: 'block',
                            borderRadius: R.sm, border: `1px solid ${T.border}`, background: T.bg,
                        }}
                    />
                )}
                <p style={{ fontSize: F.caption, color: T.textMuted, margin: `${S.md}px 0 0`, lineHeight: 1.45 }}>
                    On IPhone This Opens The Share Sheet (Or The Image In A New Tab) · Long-Press It To Add
                    The Card To Photos.
                </p>
            </BottomSheet>
        </>
    );
}

export default ExportCard;
