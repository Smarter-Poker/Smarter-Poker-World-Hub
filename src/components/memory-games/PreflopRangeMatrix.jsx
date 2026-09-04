/**
 * PreflopRangeMatrix: the 13x13 starting-hand grid, as ONE paint control.
 *
 * Mobile phase 2 (docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md):
 * the old grid was 169 <button>s at min-width 44px inside an overflow-x
 * scroller, so at 375px it was 628px wide and the player slid sideways to
 * reach the low cards. Now:
 *
 * - The grid is `width: 100%` with `aspect-ratio: 1` cells and no min-width,
 *   so it always fits the column (about 22px cells at 375px, 44px on desktop).
 * - Cells are `role="gridcell"` elements, not buttons. A range grid is one
 *   control with 169 states, the way a colour picker is one control, so the
 *   44px per-button rule does not apply to a cell; the grid carries
 *   `data-allow-small-target="true"` and e2e/mobile-budget.spec.ts excludes
 *   it from the tiny-target count for that reason (documented there too).
 * - Painting is driven from the grid container with pointer events:
 *   pointerdown starts a stroke on the cell under the finger, pointermove
 *   paints every new cell it crosses (document.elementFromPoint, because the
 *   pointer is captured by the grid), pointerup ends the stroke. One
 *   `onStrokeStart` per stroke lets the page push ONE undo entry and fire ONE
 *   haptic, whatever the number of cells crossed. `touch-action: none` on the
 *   grid keeps the browser from turning the drag into a page scroll; the
 *   panels around the grid still scroll the page.
 * - Keyboard: the grid itself is focusable (`aria-activedescendant` names
 *   the focused cell). Arrow keys, Home and End move; Enter and Space toggle
 *   the focused hand through the same stroke callbacks.
 * - The hand label inside a cell is redundant with the row and column rank
 *   headers, so at or below 768px only the diagonal (pairs) keeps its 12px
 *   label; every other cell shows colour and the two headers say which hand
 *   it is. The `aria-label` always carries the full hand name.
 *
 * `PreflopStaticGrid` is the read-only twin (the menu primer and the review
 * panel's solution view) so every 13x13 on the page shares one layout.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { normalizeRangeAction } from '../../lib/preflopRangeLab';

const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

function cellId(prefix, hand) {
  return `${prefix}-${hand}`;
}

function nearestCell(node) {
  return node && typeof node.closest === 'function' ? node.closest('[data-hand]') : null;
}

function PreflopRangeMatrix({
  ranks,
  getHandName,
  actionColors,
  userGrid,
  gradeResult,
  scenario,
  timerActive,
  onStrokeStart,
  onPaintHand,
  onStrokeEnd,
  onHandFocus,
  idPrefix = 'preflop-cell',
}) {
  const disabled = !!gradeResult || !timerActive;
  const [focusedHand, setFocusedHand] = useState(() => getHandName(0, 0));
  const gridRef = useRef(null);
  const strokeRef = useRef(null);

  const focusHand = useCallback((hand) => {
    setFocusedHand(hand);
    if (typeof onHandFocus === 'function') onHandFocus(hand);
  }, [onHandFocus]);

  const endStroke = useCallback(() => {
    if (!strokeRef.current) return;
    strokeRef.current = null;
    if (typeof onStrokeEnd === 'function') onStrokeEnd();
  }, [onStrokeEnd]);

  // A stroke never outlives the grid or a grading: release it on unmount and
  // whenever the grid becomes disabled mid-drag (timer ran out).
  useEffect(() => {
    if (disabled) endStroke();
  }, [disabled, endStroke]);
  useEffect(() => () => { strokeRef.current = null; }, []);

  const handAtPoint = useCallback((x, y) => {
    if (typeof document === 'undefined') return null;
    const cell = nearestCell(document.elementFromPoint(x, y));
    if (!cell || !gridRef.current || !gridRef.current.contains(cell)) return null;
    return cell.getAttribute('data-hand');
  }, []);

  const handlePointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const cell = nearestCell(event.target);
    if (!cell || !gridRef.current || !gridRef.current.contains(cell)) return;
    const hand = cell.getAttribute('data-hand');
    event.preventDefault();
    if (gridRef.current && typeof gridRef.current.focus === 'function') {
      try { gridRef.current.focus({ preventScroll: true }); } catch (_) { /* older engines */ }
    }
    // A graded grid still reports which hand was touched (the readout bar
    // above it shows the solver's action); it just paints nothing.
    focusHand(hand);
    if (disabled) return;
    if (typeof onStrokeStart === 'function' && onStrokeStart(hand) === false) return;
    strokeRef.current = { pointerId: event.pointerId, painted: new Set([hand]) };
    if (typeof onPaintHand === 'function') onPaintHand(hand);
    try {
      gridRef.current.setPointerCapture(event.pointerId);
    } catch (_) {
      // Capture is a nicety: without it the stroke still paints while the
      // pointer stays over the grid.
    }
  }, [disabled, focusHand, onPaintHand, onStrokeStart]);

  const handlePointerMove = useCallback((event) => {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    const hand = handAtPoint(event.clientX, event.clientY);
    if (!hand || stroke.painted.has(hand)) return;
    stroke.painted.add(hand);
    focusHand(hand);
    if (typeof onPaintHand === 'function') onPaintHand(hand);
  }, [focusHand, handAtPoint, onPaintHand]);

  const handlePointerEnd = useCallback((event) => {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    try {
      if (gridRef.current && gridRef.current.hasPointerCapture(event.pointerId)) {
        gridRef.current.releasePointerCapture(event.pointerId);
      }
    } catch (_) { /* nothing to release */ }
    endStroke();
  }, [endStroke]);

  const moveFocus = useCallback((row, col) => {
    const nextRow = Math.max(0, Math.min(ranks.length - 1, row));
    const nextCol = Math.max(0, Math.min(ranks.length - 1, col));
    const hand = getHandName(nextRow, nextCol);
    focusHand(hand);
    if (typeof document !== 'undefined') {
      const el = document.getElementById(cellId(idPrefix, hand));
      if (el && typeof el.scrollIntoView === 'function') {
        try { el.scrollIntoView({ block: 'nearest' }); } catch (_) { /* older engines */ }
      }
    }
  }, [focusHand, getHandName, idPrefix, ranks.length]);

  const handleKeyDown = useCallback((event) => {
    const isToggle = event.key === 'Enter' || event.key === ' ';
    if (!NAV_KEYS.includes(event.key) && !isToggle) return;
    event.preventDefault();
    // The page's own Enter / Space shortcut submits the range; a key handled
    // by the grid must not reach it.
    event.stopPropagation();
    if (isToggle) {
      if (disabled) return;
      if (typeof onStrokeStart === 'function' && onStrokeStart(focusedHand) === false) return;
      if (typeof onPaintHand === 'function') onPaintHand(focusedHand);
      if (typeof onStrokeEnd === 'function') onStrokeEnd();
      return;
    }
    let row = 0;
    let col = 0;
    ranks.forEach((_, r) => ranks.forEach((__, c) => {
      if (getHandName(r, c) === focusedHand) { row = r; col = c; }
    }));
    if (event.key === 'ArrowUp') moveFocus(row - 1, col);
    if (event.key === 'ArrowDown') moveFocus(row + 1, col);
    if (event.key === 'ArrowLeft') moveFocus(row, col - 1);
    if (event.key === 'ArrowRight') moveFocus(row, col + 1);
    if (event.key === 'Home') moveFocus(row, 0);
    if (event.key === 'End') moveFocus(row, ranks.length - 1);
  }, [disabled, focusedHand, getHandName, moveFocus, onPaintHand, onStrokeEnd, onStrokeStart, ranks]);

  return (
    <div className="preflop-lab-grid-frame">
      <div
        ref={gridRef}
        className="preflop-lab-grid"
        role="grid"
        tabIndex={0}
        aria-label="Starting-hand range. Tap or drag to paint hands with the active action. Use arrow keys to move and Enter to toggle."
        aria-rowcount={ranks.length + 1}
        aria-colcount={ranks.length + 1}
        aria-activedescendant={cellId(idPrefix, focusedHand)}
        aria-disabled={disabled || undefined}
        data-allow-small-target="true"
        data-tutorial="matrix"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        <div className="preflop-lab-grid-row is-header" role="row" aria-rowindex={1}>
          <span className="preflop-lab-axis-corner" role="columnheader" aria-colindex={1} aria-label="Rank">
            <span aria-hidden="true">R</span>
          </span>
          {ranks.map((rank, col) => (
            <span key={`column-${rank}`} className="preflop-lab-axis is-column" role="columnheader" aria-colindex={col + 2}>
              {rank}
            </span>
          ))}
        </div>

        {ranks.map((rank, row) => (
          <div className="preflop-lab-grid-row" role="row" aria-rowindex={row + 2} key={`row-${rank}`}>
            <span className="preflop-lab-axis is-row" role="rowheader" aria-colindex={1}>{rank}</span>
            {ranks.map((_, col) => {
              const hand = getHandName(row, col);
              const userAction = userGrid[hand];
              const actionStyle = userAction && actionColors[userAction];
              let feedbackState = 'idle';

              if (gradeResult) {
                if (gradeResult.missedHands.includes(hand)) feedbackState = 'missed';
                else if (gradeResult.extraHands.includes(hand)) feedbackState = 'extra';
                else if (gradeResult.wrongActionHands.includes(hand)) feedbackState = 'wrong';
                else if (userAction && normalizeRangeAction(scenario?.solution?.[hand]) === userAction) feedbackState = 'correct';
              }

              return (
                <div
                  key={hand}
                  id={cellId(idPrefix, hand)}
                  role="gridcell"
                  data-hand={hand}
                  data-pair={row === col ? 'true' : undefined}
                  data-action={userAction || 'none'}
                  data-feedback={feedbackState}
                  data-focused={focusedHand === hand ? 'true' : undefined}
                  aria-selected={!!userAction}
                  aria-rowindex={row + 2}
                  aria-colindex={col + 2}
                  aria-label={`${hand}: ${userAction ? actionColors[userAction]?.label : 'not selected'}${feedbackState !== 'idle' ? `, ${feedbackState}` : ''}`}
                  style={{
                    '--cell-fill': actionStyle?.bg || 'rgba(20, 29, 43, 0.82)',
                    '--cell-stroke': actionStyle?.border || 'rgba(129, 167, 194, 0.18)',
                  }}
                >
                  <span className="preflop-lab-cell-label" aria-hidden="true">{hand}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Read-only 13x13 with the same layout and classes. `cellState(hand, row, col)`
 * returns `{ fill, stroke, region, mark }`; `region` is 'pair' | 'suited' |
 * 'offsuit' and is written to `data-region` so CSS can colour the primer.
 */
export function PreflopStaticGrid({ ranks, getHandName, cellState, className = '', ariaLabel = 'Starting-hand matrix', labelMode = 'phone-diagonal' }) {
  return (
    <div className={`preflop-lab-grid is-static${labelMode === 'all' ? ' has-all-labels' : ''}${className ? ` ${className}` : ''}`} role="img" aria-label={ariaLabel}>
      <div className="preflop-lab-grid-row is-header" aria-hidden="true">
        <span className="preflop-lab-axis-corner"><span>R</span></span>
        {ranks.map((rank) => (
          <span key={`column-${rank}`} className="preflop-lab-axis is-column">{rank}</span>
        ))}
      </div>
      {ranks.map((rank, row) => (
        <div className="preflop-lab-grid-row" key={`row-${rank}`} aria-hidden="true">
          <span className="preflop-lab-axis is-row">{rank}</span>
          {ranks.map((_, col) => {
            const hand = getHandName(row, col);
            const region = row === col ? 'pair' : row < col ? 'suited' : 'offsuit';
            const state = typeof cellState === 'function' ? (cellState(hand, row, col) || {}) : {};
            return (
              <div
                key={hand}
                className="preflop-lab-static-cell"
                data-hand={hand}
                data-pair={row === col ? 'true' : undefined}
                data-region={state.region || region}
                data-mark={state.mark || undefined}
                style={{
                  '--cell-fill': state.fill || undefined,
                  '--cell-stroke': state.stroke || undefined,
                }}
              >
                <span className="preflop-lab-cell-label">{hand}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default memo(PreflopRangeMatrix);
