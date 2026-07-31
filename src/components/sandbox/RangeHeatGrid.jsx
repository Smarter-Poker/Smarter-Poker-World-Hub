/**
 * RangeHeatGrid — 13x13 opponent-range heat map
 * ═══════════════════════════════════════════════════════════════════════════
 * Grades every starting hand against the current board and, when the villain's
 * range is supplied, dims everything outside it so the map answers the question
 * its title asks ("Opponent Range vs Board") instead of grading all 169 combos
 * regardless of what the opponent actually holds.
 *
 * Strength is normalised against the best achievable score for the current
 * board, so AA reads "Strong" instead of the old raw score that topped out at
 * ~54 and painted pocket aces yellow.
 */
import React, { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import { BottomSheet, PAStyles, Segmented } from './paKit';
import { RANKS, parseRange, cellLabel, comboWeight, countCombos } from './RangeExplorer';

const ORDER = 'AKQJT98765432';

/** Raw heuristic score for a starting hand against the board. */
function rawStrength(r1, r2, isSuited, boardRanks = []) {
    const i1 = ORDER.indexOf(r1);
    const i2 = ORDER.indexOf(r2);
    let score = 0;

    score += (13 - i1) * 2 + (13 - i2);
    if (r1 === r2) score += 15;
    if (isSuited) score += 4;

    const gap = Math.abs(i1 - i2);
    if (gap === 1) score += 3;
    else if (gap === 2) score += 1;

    if (boardRanks.length > 0) {
        if (boardRanks.includes(r1) || boardRanks.includes(r2)) score += 12;
        const topBoard = Math.min(...boardRanks.map(r => ORDER.indexOf(r)).filter(v => v >= 0));
        if (r1 === r2 && Number.isFinite(topBoard) && i1 < topBoard) score += 10;
    }
    return score;
}

const TIERS = [
    { min: 80, label: 'Strong', colour: T.success },
    { min: 60, label: 'Good', colour: T.accent },
    { min: 40, label: 'Marginal', colour: T.warn },
    { min: 20, label: 'Weak', colour: '#F97316' },
    { min: 0, label: 'Trash', colour: T.danger },
];

function tierFor(strength) {
    return TIERS.find(t => strength >= t.min) || TIERS[TIERS.length - 1];
}

export default function RangeHeatGrid({
    boardCards = [],
    isOpen,
    onClose,
    /** Optional villain range string — cells outside it are dimmed. */
    villainRange = '',
    villainLabel = 'Villain',
}) {
    const [selected, setSelected] = useState(null);
    // Escape hatch for the 13x13 grid: on a 375px viewport each cell is ~25px,
    // far under the 44px tap bar. These 44px rank strips + suit toggle can
    // address every one of the 169 cells without precision tapping.
    const [pickHigh, setPickHigh] = useState(null);
    const [pickLow, setPickLow] = useState(null);
    const [pickSuit, setPickSuit] = useState('s');

    const boardRanks = useMemo(
        () => (Array.isArray(boardCards) ? boardCards : []).map(c => c?.[0]).filter(Boolean),
        [boardCards],
    );

    const rangeCells = useMemo(() => parseRange(villainRange || ''), [villainRange]);
    const hasRange = useMemo(() => Object.keys(rangeCells).some(k => rangeCells[k]), [rangeCells]);
    const rangeCombos = useMemo(() => countCombos(rangeCells), [rangeCells]);

    const grid = useMemo(() => {
        // Normalise against the strongest hand for THIS board so the tiers map
        // onto the real distribution instead of an unreachable 0-100 scale.
        let max = 1;
        const raw = RANKS.map((r1, i) => RANKS.map((r2, j) => {
            const value = rawStrength(r1, r2, i < j, boardRanks);
            if (value > max) max = value;
            return value;
        }));
        return raw.map((row, i) => row.map((value, j) => ({
            i,
            j,
            label: cellLabel(i, j),
            strength: Math.round((100 * value) / max),
            inRange: !hasRange || !!rangeCells[`${i},${j}`],
        })));
    }, [boardRanks, rangeCells, hasRange]);

    const boardLabel = boardRanks.length > 0
        ? (Array.isArray(boardCards) ? boardCards.filter(Boolean).join(' ') : '')
        : 'Preflop (no board)';

    if (!isOpen) return null;

    const selectedCell = selected ? grid[selected.i]?.[selected.j] : null;
    const selectedTier = selectedCell ? tierFor(selectedCell.strength) : null;

    /**
     * Resolve the two picked ranks (+ suit) onto a grid cell.
     * Suited hands live above the diagonal (i < j), offsuit below.
     */
    const applyPick = (high, low, suit) => {
        if (high == null || low == null) return;
        const a = Math.min(high, low);
        const b = Math.max(high, low);
        if (a === b) { setSelected({ i: a, j: b }); return; }
        setSelected(suit === 's' ? { i: a, j: b } : { i: b, j: a });
    };

    const rankStrip = (label, value, onPick) => (
        <div>
            <div style={{ fontSize: F.label, fontWeight: 700, color: T.textMuted, marginBottom: S.xs }}>{label}</div>
            <div
                role="group"
                aria-label={label}
                data-hscroll="true"
                style={{
                    display: 'flex', gap: S.sm, overflowX: 'auto', paddingBottom: S.xs,
                    scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
                }}
            >
                {RANKS.map((r, idx) => {
                    const on = value === idx;
                    return (
                        <button
                            key={`${label}-${r}`}
                            type="button"
                            className="pa-btn"
                            onClick={() => onPick(idx)}
                            aria-pressed={on}
                            aria-label={`${label}: ${r}`}
                            style={{
                                ...btn('secondary'),
                                minWidth: 44, width: 44, padding: 0, flexShrink: 0,
                                scrollSnapAlign: 'start', fontSize: F.bodySm, ...numeric,
                                background: on ? T.accentSoft : T.surface2,
                                color: on ? T.accent : T.text,
                                borderColor: on ? 'rgba(69,153,255,0.45)' : T.border,
                            }}
                        >
                            {r}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Range heat map"
            titleIcon={<Flame size={18} strokeWidth={2} color={T.warn} />}
            subtitle={hasRange
                ? `${villainLabel} · ${rangeCombos} combos (${((rangeCombos / 1326) * 100).toFixed(1)}%) vs ${boardLabel}`
                : `All 169 hands vs ${boardLabel}`}
            ariaLabel="Opponent range heat map"
        >
            <PAStyles />

            {!hasRange && (
                <div style={{
                    fontSize: F.caption, color: T.textMuted, lineHeight: 1.45,
                    background: T.surface2, border: `1px solid ${T.border}`,
                    borderRadius: R.sm, padding: S.md, marginBottom: S.md,
                }}>
                    No villain range is set, so every starting hand is graded. Set a range in the Range
                    Explorer to grey out the hands this opponent would never hold.
                </div>
            )}

            {/* Precision-free hand picker — every cell is reachable with 44px targets */}
            <div style={{
                display: 'flex', flexDirection: 'column', gap: S.sm, marginBottom: S.md,
                background: T.surface2, border: `1px solid ${T.border}`, borderRadius: R.sm, padding: S.md,
            }}>
                {rankStrip('First rank', pickHigh, (idx) => { setPickHigh(idx); applyPick(idx, pickLow, pickSuit); })}
                {rankStrip('Second rank', pickLow, (idx) => { setPickLow(idx); applyPick(pickHigh, idx, pickSuit); })}
                <Segmented
                    idPrefix="rhg-suit"
                    label="Suit"
                    value={pickSuit}
                    onChange={(v) => { setPickSuit(v); applyPick(pickHigh, pickLow, v); }}
                    options={[
                        { value: 's', label: 'Suited' },
                        { value: 'o', label: 'Offsuit' },
                    ]}
                />
                {pickHigh != null && pickLow != null && pickHigh === pickLow && (
                    <p style={{ fontSize: F.caption, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
                        Same rank twice selects the pocket pair — the suit toggle does not apply.
                    </p>
                )}
            </div>

            {/* Persistent detail row — tap-to-select, never hover-only */}
            <div
                aria-live="polite"
                style={{
                    minHeight: 44, display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap',
                    padding: `${S.sm}px ${S.md}px`, background: T.surface2, borderRadius: R.sm,
                    border: `1px solid ${T.border}`, marginBottom: S.md,
                }}
            >
                {selectedCell && selectedTier ? (
                    <>
                        <span style={{ fontSize: F.bodySm, fontWeight: 800, color: T.text, ...numeric }}>
                            {selectedCell.label}
                        </span>
                        <span style={{
                            ...pill('neutral'),
                            color: selectedTier.colour,
                            background: `${selectedTier.colour}26`,
                            borderColor: `${selectedTier.colour}55`,
                        }}>
                            {selectedTier.label} · {selectedCell.strength}
                        </span>
                        <span style={{ fontSize: F.caption, color: T.textMuted }}>
                            {comboWeight(selectedCell.i, selectedCell.j)} combos
                        </span>
                        {!selectedCell.inRange && (
                            <span style={{ fontSize: F.caption, color: T.textDim }}>Outside {villainLabel}&apos;s range</span>
                        )}
                    </>
                ) : (
                    <span style={{ fontSize: F.caption, color: T.textMuted }}>
                        Pick two ranks above, or tap any cell, for its tier and combo count.
                    </span>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, minmax(0,1fr))', gap: 1, marginBottom: S.md }}>
                {grid.flat().map(cell => {
                    const tier = tierFor(cell.strength);
                    const on = selected && selected.i === cell.i && selected.j === cell.j;
                    return (
                        <button
                            key={`${cell.i},${cell.j}`}
                            type="button"
                            onClick={() => {
                                setSelected({ i: cell.i, j: cell.j });
                                // Keep the 44px picker in sync with a direct tap.
                                setPickHigh(Math.min(cell.i, cell.j));
                                setPickLow(Math.max(cell.i, cell.j));
                                if (cell.i !== cell.j) setPickSuit(cell.i < cell.j ? 's' : 'o');
                            }}
                            aria-label={`${cell.label}, ${tier.label}${cell.inRange ? '' : ', outside range'}`}
                            aria-pressed={!!on}
                            style={{
                                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: F.caption, fontWeight: 700, lineHeight: 1, borderRadius: 4, padding: 0,
                                background: cell.inRange ? `${tier.colour}3D` : T.surface2,
                                border: `1px solid ${on ? T.text : cell.inRange ? `${tier.colour}66` : T.border}`,
                                color: cell.inRange ? T.text : T.textDim,
                                opacity: cell.inRange ? 1 : 0.35,
                                cursor: 'pointer', touchAction: 'manipulation',
                                WebkitTapHighlightColor: 'transparent',
                            }}
                        >
                            {RANKS[Math.min(cell.i, cell.j)]}{RANKS[Math.max(cell.i, cell.j)]}
                        </button>
                    );
                })}
            </div>

            {/* Legend — text tier labels, never colour alone */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.sm }}>
                {TIERS.map(t => (
                    <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: S.xs }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: `${t.colour}66`, border: `1px solid ${t.colour}` }} />
                        <span style={{ fontSize: F.caption, color: T.textMuted }}>{t.label}</span>
                    </span>
                ))}
            </div>
        </BottomSheet>
    );
}
