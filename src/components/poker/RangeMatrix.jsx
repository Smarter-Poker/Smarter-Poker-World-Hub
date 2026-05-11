/**
 * RangeMatrix
 * ═══════════════════════════════════════════════════════════════════════════
 * Unified 13x13 preflop range / board-coverage matrix renderer. Replaces
 * the per-page ad-hoc implementations with one consistent visual language:
 *
 *   - Pocket pairs on the diagonal (AA, KK, ... 22)
 *   - Suited above the diagonal (top-right triangle): AKs, AQs, ...
 *   - Offsuit below the diagonal (bottom-left triangle): AKo, AQo, ...
 *
 * Each cell gets a probability-heat fill 0..1 driven by `data` map.
 * Optional split-fill (raise/call/fold) when `data[hand]` is an object.
 *
 * Props
 *   data          map of hand-string -> number 0..1 OR
 *                 map of hand-string -> { raise, call, fold } each 0..1
 *   size          number cell size in px  default 28
 *   accent        hex color for the heat   default '#00d4ff'
 *   raiseColor    hex color for split-fill raise slice
 *   callColor     hex color for split-fill call slice
 *   foldColor     hex color for split-fill fold slice (usually transparent)
 *   highlight     string hand to outline (e.g. 'AKs')
 *   showLabels    boolean (default true)
 *   onCellClick   (hand) handler
 *   compact       boolean shrinks padding
 *   className     string
 *   style         object
 *
 * Build-safety: no emoji chars, no JSX comments inside conditionals.
 */
// TRAIN-RANGE-MATRIX-1 — audit-marker registry token

import React from 'react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function handForCell(row, col) {
  const r1 = RANKS[row];
  const r2 = RANKS[col];
  if (row === col) return `${r1}${r2}`;
  if (row < col) return `${r1}${r2}s`;
  return `${r2}${r1}o`;
}

function getCellValue(data, hand) {
  if (!data) return null;
  const v = data[hand];
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const sum = (v.raise || 0) + (v.call || 0) + (v.fold || 0);
    return sum > 0 ? Math.min(1, sum) : null;
  }
  return null;
}

function withAlpha(hex, alpha) {
  if (typeof hex !== 'string' || hex[0] !== '#') return hex;
  const s = hex.length === 4
    ? `${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex.slice(1, 7);
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const RangeMatrix = React.memo(function RangeMatrix({
  data,
  size = 28,
  accent = '#00d4ff',
  raiseColor = '#ef4444',
  callColor = '#4ade80',
  foldColor = 'rgba(255,255,255,0.04)',
  highlight,
  showLabels = true,
  onCellClick,
  compact = false,
  className,
  style,
}) {
  const cellSize = Math.max(14, size);
  const fontSize = Math.max(8, Math.round(cellSize * 0.35));

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(13, ${cellSize}px)`,
    gridTemplateRows: `repeat(13, ${cellSize}px)`,
    gap: 1,
    background: 'rgba(255,255,255,0.04)',
    padding: compact ? 4 : 6,
    borderRadius: 8,
    width: 'fit-content',
    ...(style || {}),
  };

  const cells = [];
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const hand = handForCell(row, col);
      const isPair = row === col;
      const isSuited = row < col;
      const isOffsuit = row > col;
      const raw = data ? data[hand] : null;
      const isSplit = raw && typeof raw === 'object';

      let fill = 'rgba(0,0,0,0.25)';
      let layered = null;

      if (raw != null) {
        if (isSplit) {
          const raise = Math.max(0, Math.min(1, raw.raise || 0));
          const call = Math.max(0, Math.min(1, raw.call || 0));
          const fold = Math.max(0, Math.min(1, raw.fold || 0));
          const tot = raise + call + fold || 1;
          const raisePct = (raise / tot) * 100;
          const callPct = (call / tot) * 100;
          layered = `linear-gradient(to top, ${raiseColor} 0%, ${raiseColor} ${raisePct}%, ${callColor} ${raisePct}%, ${callColor} ${raisePct + callPct}%, ${foldColor} ${raisePct + callPct}%, ${foldColor} 100%)`;
        } else {
          const v = Math.max(0, Math.min(1, raw));
          fill = withAlpha(accent, 0.15 + v * 0.7);
        }
      } else {
        fill = isPair
          ? 'rgba(251,191,36,0.08)'
          : isSuited
            ? 'rgba(74,222,128,0.05)'
            : 'rgba(255,255,255,0.025)';
      }

      const cellStyle = {
        width: cellSize,
        height: cellSize,
        background: layered || fill,
        color: '#fff',
        fontSize,
        fontWeight: isPair ? 800 : 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: typeof onCellClick === 'function' ? 'pointer' : 'default',
        border: hand === highlight ? `1.5px solid #fff` : '1px solid rgba(255,255,255,0.05)',
        boxShadow: hand === highlight ? '0 0 0 2px rgba(0,212,255,0.4)' : undefined,
        fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
        letterSpacing: 0,
        transition: 'transform 100ms ease',
        userSelect: 'none',
      };

      const titleText = isSplit
        ? `${hand}: raise ${Math.round((raw.raise || 0) * 100)}%, call ${Math.round((raw.call || 0) * 100)}%, fold ${Math.round((raw.fold || 0) * 100)}%`
        : raw != null
          ? `${hand}: ${Math.round(raw * 100)}%`
          : hand;

      cells.push(
        <div
          key={hand}
          style={cellStyle}
          title={titleText}
          role={typeof onCellClick === 'function' ? 'button' : 'gridcell'}
          tabIndex={typeof onCellClick === 'function' ? 0 : undefined}
          onClick={typeof onCellClick === 'function' ? () => onCellClick(hand) : undefined}
          onKeyDown={(e) => {
            if (typeof onCellClick === 'function' && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onCellClick(hand);
            }
          }}
          aria-label={titleText}
        >
          {showLabels ? hand : ''}
        </div>
      );
    }
  }

  return (
    <div className={className} style={gridStyle} role="grid" aria-label="13 by 13 starting-hand range matrix">
      {cells}
    </div>
  );
});

export default RangeMatrix;
export const RANGE_MATRIX_VERSION = '1.0.0';
