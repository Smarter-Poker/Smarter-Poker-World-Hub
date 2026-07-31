/**
 * RANGE EXPLORER — Interactive 13x13 range editor
 * ═══════════════════════════════════════════════════════════════════════════
 * Mobile-first rebuild (PA_DESIGN_SPEC v1):
 *   • drag-to-paint (add / remove captured from the first cell touched)
 *   • tappable rank row / column headers for bulk select
 *   • "top N%" strength slider driven by a combo-weighted ordering
 *   • per-seat targeting — Apply writes to the chosen villain seat
 *   • parseRange understands '+' and '-' notation and '10x' as 'Tx'
 *
 * NOTE ON TOUCH TARGETS: a 13x13 matrix cannot give every cell 44px at 375px
 * (that needs 572px of width). The spec's escape hatch is used instead — bulk
 * selection (headers, presets, strength slider, paint dragging) means precision
 * tapping is never the only path, and a persistent detail row reports what the
 * last tap did rather than relying on hover.
 *
 * Exported helpers are shared by RangeHeatGrid and VillainPresetPicker so the
 * three surfaces agree on how a range string maps to the matrix.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LayoutGrid, Copy, Check, Trash2, Brush, Hand } from 'lucide-react';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import { BottomSheet, PAStyles, Segmented } from './paKit';
import { getArchetypeRangeString } from '../../lib/sandbox/VillainArchetypeRanges';

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/** Label for the matrix cell at (row i, col j): pair / suited / offsuit. */
export function cellLabel(i, j) {
    const r1 = RANKS[i];
    const r2 = RANKS[j];
    if (i === j) return `${r1}${r2}`;
    return i < j ? `${r1}${r2}s` : `${r2}${r1}o`;
}

/**
 * Combo-weighted range share: pairs are 6 combos, suited 4, offsuit 12,
 * out of the 1326 possible starting hands. Counting cells equally (count/169)
 * badly misreports e.g. "all pairs" as 7.7% instead of 5.9%.
 */
export function comboWeight(i, j) {
    if (i === j) return 6;      // pocket pair
    if (i < j) return 4;        // suited (above diagonal)
    return 12;                  // offsuit (below diagonal)
}

/** '10' is a common hand-history spelling of 'T'; normalise before indexing. */
function normaliseToken(token) {
    return String(token || '').trim().replace(/10/g, 'T').replace(/\s+/g, '');
}

function setCell(cells, i, j, on) {
    if (i < 0 || j < 0 || i > 12 || j > 12) return;
    cells[`${i},${j}`] = !!on;
}

/** Writes one 'AKs' / 'AKo' / 'AA' / 'AK' token into the cell map. */
function applyCombo(cells, token, on = true) {
    const combo = normaliseToken(token);
    if (combo.length < 2) return;
    const i = RANKS.indexOf(combo[0].toUpperCase());
    const j = RANKS.indexOf(combo[1].toUpperCase());
    if (i < 0 || j < 0) return;
    const suffix = (combo[2] || '').toLowerCase();

    if (i === j) { setCell(cells, i, j, on); return; }
    if (suffix === 's') { setCell(cells, Math.min(i, j), Math.max(i, j), on); return; }
    if (suffix === 'o') { setCell(cells, Math.max(i, j), Math.min(i, j), on); return; }
    // No suffix — the token covers both halves of the matrix.
    setCell(cells, Math.min(i, j), Math.max(i, j), on);
    setCell(cells, Math.max(i, j), Math.min(i, j), on);
}

/**
 * Range string -> { 'i,j': true } cell map.
 * Understands: 'AA', 'AKs', 'AKo', 'AK', '22+', 'A2s+', 'JJ-88', 'KQs-K9s',
 * whitespace or comma separated, and '10' as 'T'.
 */
export function parseRange(str) {
    const cells = {};
    if (!str || typeof str !== 'string') return cells;

    str.split(/[,;\n]+/).forEach(rawPart => {
        const part = normaliseToken(rawPart);
        if (!part) return;

        // ── span: 'JJ-88' / 'A5s-A2s' ──────────────────────────────────────
        if (part.includes('-')) {
            const [aRaw, bRaw] = part.split('-');
            const a = normaliseToken(aRaw);
            const b = normaliseToken(bRaw);
            if (a.length < 2 || b.length < 2) return;
            const suffix = (a[2] || '').toLowerCase();
            const aHi = RANKS.indexOf(a[0].toUpperCase());
            const aLo = RANKS.indexOf(a[1].toUpperCase());
            const bHi = RANKS.indexOf(b[0].toUpperCase());
            const bLo = RANKS.indexOf(b[1].toUpperCase());
            if ([aHi, aLo, bHi, bLo].some(v => v < 0)) return;

            if (aHi === aLo && bHi === bLo) {
                // pair span 'JJ-88'
                const from = Math.min(aHi, bHi);
                const to = Math.max(aHi, bHi);
                for (let k = from; k <= to; k++) applyCombo(cells, `${RANKS[k]}${RANKS[k]}`, true);
                return;
            }
            if (aHi === bHi) {
                // kicker span 'A5s-A2s'
                const from = Math.min(aLo, bLo);
                const to = Math.max(aLo, bLo);
                for (let k = from; k <= to; k++) {
                    if (k === aHi) continue;
                    applyCombo(cells, `${RANKS[aHi]}${RANKS[k]}${suffix}`, true);
                }
            }
            return;
        }

        // ── open-ended: '22+' / 'A2s+' / 'KJo+' ────────────────────────────
        if (part.endsWith('+')) {
            const base = part.slice(0, -1);
            if (base.length < 2) return;
            const hi = RANKS.indexOf(base[0].toUpperCase());
            const lo = RANKS.indexOf(base[1].toUpperCase());
            if (hi < 0 || lo < 0) return;
            const suffix = (base[2] || '').toLowerCase();

            if (hi === lo) {
                // pairs upward: 22+ = 22 .. AA
                for (let k = 0; k <= hi; k++) applyCombo(cells, `${RANKS[k]}${RANKS[k]}`, true);
                return;
            }
            // kickers upward: A2s+ = A2s .. AKs
            const top = Math.min(hi, lo);
            const bottom = Math.max(hi, lo);
            for (let k = bottom; k > top; k--) {
                applyCombo(cells, `${RANKS[top]}${RANKS[k]}${suffix}`, true);
            }
            return;
        }

        applyCombo(cells, part, true);
    });

    return cells;
}

/** Cell map -> canonical comma-separated range string. */
export function cellsToRange(cells) {
    const parts = [];
    for (let i = 0; i < 13; i++) {
        for (let j = 0; j < 13; j++) {
            if (!cells || !cells[`${i},${j}`]) continue;
            parts.push(cellLabel(i, j));
        }
    }
    return parts.join(',');
}

/** Total combos represented by a cell map (out of 1326). */
export function countCombos(cells) {
    return Object.keys(cells || {}).reduce((sum, key) => {
        if (!cells[key]) return sum;
        const [i, j] = key.split(',').map(Number);
        if (!Number.isFinite(i) || !Number.isFinite(j)) return sum;
        return sum + comboWeight(i, j);
    }, 0);
}

/**
 * Approximate strength ordering used by the "top N%" slider. Pairs rank by
 * rank, non-pairs by high card, gap and suitedness. It is a heuristic, not a
 * solver ordering — the slider is a starting point the user then edits.
 */
function handScore(i, j) {
    if (i === j) return 1000 - i * 40;
    const hi = Math.min(i, j);
    const lo = Math.max(i, j);
    const gap = lo - hi;
    let score = 500 - (hi * 22 + lo * 8) - gap * 6;
    if (i < j) score += 55; // suited
    return score;
}

const RANKED_CELLS = (() => {
    const list = [];
    for (let i = 0; i < 13; i++) {
        for (let j = 0; j < 13; j++) list.push({ i, j, score: handScore(i, j), w: comboWeight(i, j) });
    }
    return list.sort((a, b) => b.score - a.score);
})();

/** Fills the strongest cells until `pct` of all 1326 combos is covered. */
function cellsForTopPercent(pct) {
    const target = (Math.max(0, Math.min(100, pct)) / 100) * 1326;
    const cells = {};
    let acc = 0;
    for (const c of RANKED_CELLS) {
        if (acc >= target) break;
        cells[`${c.i},${c.j}`] = true;
        acc += c.w;
    }
    return cells;
}

// Positional opens stay here; every archetype range comes from the canonical
// VillainArchetypeRanges module so the three surfaces cannot disagree.
const POSITION_PRESETS = ['UTG', 'CO', 'BTN', 'BB'];

function presetRange(position) {
    try {
        return getArchetypeRangeString('gto_neutral', position, 'open') || '';
    } catch (e) {
        console.warn('[RangeExplorer] preset lookup failed:', e?.message || e);
        return '';
    }
}

export default function RangeExplorer({
    onSelectRange,
    onClose,
    initialRange = '',
    /** Optional — enables the seat selector and per-seat range loading. */
    villains = [],
    /** Optional — seat pre-selected when the sheet opens. */
    initialVillainIdx = 0,
}) {
    const seats = Array.isArray(villains) ? villains : [];
    const [villainIdx, setVillainIdx] = useState(() => (
        seats.length > 0 ? Math.min(Math.max(0, initialVillainIdx), seats.length - 1) : 0
    ));
    const [cells, setCells] = useState(() => parseRange(initialRange || seats[initialVillainIdx]?.range || ''));
    const [topPct, setTopPct] = useState(0);
    const [paintMode, setPaintMode] = useState(true);
    const [detail, setDetail] = useState(null);   // { label, on, combos }
    const [copied, setCopied] = useState(false);

    const gridRef = useRef(null);
    const paintValueRef = useRef(null);           // true = painting on, false = erasing
    const paintingRef = useRef(false);
    const copyTimer = useRef(null);

    useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

    const count = useMemo(() => Object.keys(cells || {}).filter(k => cells[k]).length, [cells]);
    const combos = useMemo(() => countCombos(cells), [cells]);
    const pct = ((combos / 1326) * 100).toFixed(1);

    const activeSeat = seats[villainIdx] || null;
    const seatLabel = activeSeat?.position || (seats.length > 1 ? `Seat ${villainIdx + 1}` : 'villain');

    const buzz = useCallback((ms) => {
        try { navigator.vibrate?.(ms); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }, []);

    const writeCell = useCallback((i, j, on) => {
        setCells(prev => {
            if (!!prev[`${i},${j}`] === !!on) return prev;
            return { ...prev, [`${i},${j}`]: !!on };
        });
    }, []);

    const describe = useCallback((i, j, on) => {
        setDetail({ label: cellLabel(i, j), on, combos: comboWeight(i, j) });
    }, []);

    // ── drag painting ─────────────────────────────────────────────────────
    const cellFromPoint = useCallback((x, y) => {
        if (typeof document === 'undefined') return null;
        const el = document.elementFromPoint(x, y);
        const key = el?.getAttribute?.('data-cell');
        if (!key) return null;
        const [i, j] = key.split(',').map(Number);
        if (!Number.isFinite(i) || !Number.isFinite(j)) return null;
        return { i, j };
    }, []);

    const onPointerDown = useCallback((e) => {
        const target = e.target?.getAttribute?.('data-cell');
        if (!target) return;
        const [i, j] = target.split(',').map(Number);
        if (!Number.isFinite(i) || !Number.isFinite(j)) return;
        const next = !cells[`${i},${j}`];
        paintValueRef.current = next;
        paintingRef.current = paintMode;
        writeCell(i, j, next);
        describe(i, j, next);
        buzz(5);
    }, [cells, paintMode, writeCell, describe, buzz]);

    const onPointerMove = useCallback((e) => {
        if (!paintingRef.current || paintValueRef.current == null) return;
        const point = cellFromPoint(e.clientX, e.clientY);
        if (!point) return;
        writeCell(point.i, point.j, paintValueRef.current);
        describe(point.i, point.j, paintValueRef.current);
    }, [cellFromPoint, writeCell, describe]);

    const endPaint = useCallback(() => {
        paintingRef.current = false;
        paintValueRef.current = null;
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        window.addEventListener('pointerup', endPaint);
        window.addEventListener('pointercancel', endPaint);
        return () => {
            window.removeEventListener('pointerup', endPaint);
            window.removeEventListener('pointercancel', endPaint);
        };
    }, [endPaint]);

    // ── bulk selection ────────────────────────────────────────────────────
    const toggleRow = useCallback((i) => {
        setCells(prev => {
            const allOn = RANKS.every((_, j) => prev[`${i},${j}`]);
            const next = { ...prev };
            RANKS.forEach((_, j) => { next[`${i},${j}`] = !allOn; });
            return next;
        });
        buzz(10);
    }, [buzz]);

    const toggleCol = useCallback((j) => {
        setCells(prev => {
            const allOn = RANKS.every((_, i) => prev[`${i},${j}`]);
            const next = { ...prev };
            RANKS.forEach((_, i) => { next[`${i},${j}`] = !allOn; });
            return next;
        });
        buzz(10);
    }, [buzz]);

    const applyTopPercent = useCallback((value) => {
        setTopPct(value);
        setCells(cellsForTopPercent(value));
    }, []);

    const loadPreset = useCallback((position) => {
        setCells(parseRange(presetRange(position)));
        setTopPct(0);
        buzz(10);
    }, [buzz]);

    const clearAll = useCallback(() => {
        setCells({});
        setTopPct(0);
        setDetail(null);
        buzz(10);
    }, [buzz]);

    // Switching seats loads that seat's stored range so Apply is never a
    // destructive overwrite of a range the user cannot see.
    const selectSeat = useCallback((idx) => {
        setVillainIdx(idx);
        const seatRange = seats[idx]?.range || '';
        setCells(parseRange(seatRange));
        setTopPct(0);
    }, [seats]);

    const handleApply = useCallback(() => {
        const rangeStr = cellsToRange(cells);
        onSelectRange?.(rangeStr, villainIdx);
        buzz(15);
        onClose?.();
    }, [cells, onSelectRange, villainIdx, onClose, buzz]);

    const handleCopy = useCallback(async () => {
        const str = cellsToRange(cells);
        try {
            if (typeof navigator?.clipboard?.writeText === 'function') {
                await navigator.clipboard.writeText(str);
                setCopied(true);
                if (copyTimer.current) clearTimeout(copyTimer.current);
                copyTimer.current = setTimeout(() => setCopied(false), 2000);
                buzz(10);
            } else {
                setDetail({ label: 'Copy unavailable here', on: false, combos: 0 });
            }
        } catch (e) {
            console.warn('[RangeExplorer] copy failed:', e?.message || e);
        }
    }, [cells, buzz]);

    const headerCellStyle = {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        aspectRatio: '1', fontSize: F.caption, fontWeight: 700, color: T.textMuted,
        background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
        padding: 0, cursor: 'pointer', touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent', lineHeight: 1,
    };

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Range Explorer"
            titleIcon={<LayoutGrid size={18} strokeWidth={2} color={T.accent} />}
            subtitle={`${count}/169 cells · ${combos} combos (${pct}%)`}
            ariaLabel="Range explorer"
            maxWidth={520}
            footer={(
                <>
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={handleApply}
                        disabled={count === 0}
                        // Applying an empty grid would silently wipe the seat's
                        // existing range, which the sheet cannot show yet.
                        aria-label={count === 0 ? 'Select at least one hand before applying' : 'Apply this range'}
                        style={{ ...btn('primary', { disabled: count === 0 }), flex: 1 }}
                    >
                        {count === 0
                            ? 'Select hands to apply'
                            : seats.length > 1 ? `Apply to ${seatLabel}` : 'Apply range'}
                    </button>
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={handleCopy}
                        aria-label="Copy range string"
                        style={{ ...btn('secondary'), padding: '0 14px' }}
                    >
                        {copied ? <Check size={18} strokeWidth={2} color={T.success} /> : <Copy size={18} strokeWidth={2} />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </>
            )}
        >
            <PAStyles />

            {seats.length > 1 && (
                <div style={{ marginBottom: S.lg }}>
                    <Segmented
                        label="Apply to seat"
                        idPrefix="re-seat"
                        value={villainIdx}
                        onChange={selectSeat}
                        options={seats.map((v, i) => ({ value: i, label: v?.position || `Seat ${i + 1}` }))}
                    />
                </div>
            )}

            {/* Presets */}
            <div style={{ marginBottom: S.lg }}>
                <div style={{ fontSize: F.label, fontWeight: 700, color: T.textMuted, marginBottom: S.sm }}>
                    Positional opens
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.sm }}>
                    {POSITION_PRESETS.map(p => (
                        <button
                            key={p}
                            type="button"
                            className="pa-btn"
                            onClick={() => loadPreset(p)}
                            style={{ ...btn('secondary'), padding: '0 14px', fontSize: F.label }}
                        >
                            {p} open
                        </button>
                    ))}
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={clearAll}
                        style={{ ...btn('danger'), padding: '0 14px', fontSize: F.label }}
                    >
                        <Trash2 size={18} strokeWidth={2} />
                        Clear
                    </button>
                </div>
            </div>

            {/* Strength slider */}
            <div style={{ marginBottom: S.lg }}>
                <label
                    htmlFor="re-topn"
                    style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontSize: F.label, fontWeight: 700, color: T.textMuted, marginBottom: S.xs,
                    }}
                >
                    <span>Fill top % by strength</span>
                    <span style={{ ...numeric, color: T.accent }}>{topPct}%</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
                    <input
                        id="re-topn"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={topPct}
                        aria-label="Fill the strongest percentage of hands"
                        onChange={(e) => applyTopPercent(Number(e.target.value))}
                        style={{ width: '100%', accentColor: T.accent, fontSize: F.input }}
                    />
                </div>
            </div>

            {/* Paint toggle */}
            <div style={{ display: 'flex', gap: S.sm, alignItems: 'center', marginBottom: S.md, flexWrap: 'wrap' }}>
                <button
                    type="button"
                    className="pa-btn"
                    aria-pressed={paintMode}
                    onClick={() => setPaintMode(v => !v)}
                    style={{
                        ...btn('secondary'), padding: '0 14px', fontSize: F.label,
                        background: paintMode ? T.accentSoft : T.surface2,
                        color: paintMode ? T.accent : T.textMuted,
                        borderColor: paintMode ? 'rgba(69,153,255,0.45)' : T.borderHi,
                    }}
                >
                    {paintMode ? <Brush size={18} strokeWidth={2} /> : <Hand size={18} strokeWidth={2} />}
                    {paintMode ? 'Drag to paint' : 'Tap only'}
                </button>
                <span style={{ fontSize: F.caption, color: T.textDim, flex: 1, minWidth: 0 }}>
                    {paintMode ? 'Drag across cells to add or remove.' : 'Painting off — the grid scrolls normally.'}
                </span>
            </div>

            {/* 14x14 matrix: rank headers + 13x13 cells */}
            <div
                ref={gridRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(14, minmax(0,1fr))',
                    gap: 1,
                    touchAction: paintMode ? 'none' : 'manipulation',
                    userSelect: 'none', WebkitUserSelect: 'none',
                    marginBottom: S.md,
                }}
            >
                <div style={{ ...headerCellStyle, background: 'transparent', border: '1px solid transparent' }} aria-hidden="true" />
                {RANKS.map((r, j) => (
                    <button
                        key={`col-${r}`}
                        type="button"
                        onClick={() => toggleCol(j)}
                        aria-label={`Toggle column ${r}`}
                        style={headerCellStyle}
                    >
                        {r}
                    </button>
                ))}

                {RANKS.map((r1, i) => (
                    <React.Fragment key={`row-${r1}`}>
                        <button
                            type="button"
                            onClick={() => toggleRow(i)}
                            aria-label={`Toggle row ${r1}`}
                            style={headerCellStyle}
                        >
                            {r1}
                        </button>
                        {RANKS.map((r2, j) => {
                            const isPair = i === j;
                            const isSuited = i < j;
                            const active = !!cells[`${i},${j}`];
                            const tone = isPair ? T.success : isSuited ? T.accent : T.warn;
                            return (
                                <button
                                    key={`${i},${j}`}
                                    type="button"
                                    data-cell={`${i},${j}`}
                                    // Pointer input is handled on the grid (drag
                                    // painting); detail === 0 means the click came
                                    // from the keyboard, which needs its own path.
                                    onClick={(e) => {
                                        if (e.detail !== 0) return;
                                        const next = !cells[`${i},${j}`];
                                        writeCell(i, j, next);
                                        describe(i, j, next);
                                    }}
                                    aria-pressed={active}
                                    aria-label={`${cellLabel(i, j)}${active ? ', in range' : ', not in range'}`}
                                    style={{
                                        aspectRatio: '1',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: F.caption, lineHeight: 1, borderRadius: 4, padding: 0,
                                        fontWeight: active ? 800 : 600,
                                        background: active ? `${tone}40` : T.surface2,
                                        border: `1px solid ${active ? `${tone}99` : T.border}`,
                                        color: active ? T.text : T.textDim,
                                        cursor: 'pointer', touchAction: 'inherit',
                                        WebkitTapHighlightColor: 'transparent',
                                        pointerEvents: 'auto',
                                    }}
                                >
                                    {RANKS[Math.min(i, j)]}{RANKS[Math.max(i, j)]}
                                </button>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>

            {/* Persistent detail row — replaces hover-only feedback */}
            <div
                aria-live="polite"
                style={{
                    minHeight: 44, display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap',
                    padding: `0 ${S.md}px`, background: T.surface2, borderRadius: R.sm,
                    border: `1px solid ${T.border}`, marginBottom: S.md,
                }}
            >
                {detail ? (
                    <>
                        <span style={{ fontSize: F.bodySm, fontWeight: 800, color: T.text, ...numeric }}>{detail.label}</span>
                        <span style={pill(detail.on ? 'success' : 'neutral')}>{detail.on ? 'In range' : 'Removed'}</span>
                        {detail.combos > 0 && (
                            <span style={{ fontSize: F.caption, color: T.textMuted }}>{detail.combos} combos</span>
                        )}
                    </>
                ) : (
                    <span style={{ fontSize: F.caption, color: T.textMuted }}>
                        Tap or drag a cell to edit the range.
                    </span>
                )}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.sm, marginBottom: S.sm }}>
                {[
                    ['Pairs', T.success],
                    ['Suited', T.accent],
                    ['Offsuit', T.warn],
                ].map(([label, colour]) => (
                    <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: S.xs }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: `${colour}66`, border: `1px solid ${colour}` }} />
                        <span style={{ fontSize: F.caption, color: T.textMuted }}>{label}</span>
                    </span>
                ))}
            </div>
        </BottomSheet>
    );
}
