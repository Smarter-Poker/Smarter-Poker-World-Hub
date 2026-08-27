import { memo, useCallback, useRef, useState } from 'react';
import { normalizeRangeAction } from '../../lib/preflopRangeLab';

function PreflopRangeMatrix({
  ranks,
  getHandName,
  actionColors,
  userGrid,
  gradeResult,
  scenario,
  timerActive,
  onCellClick,
}) {
  const firstHand = getHandName(0, 0);
  const [focusedHand, setFocusedHand] = useState(firstHand);
  const cellRefs = useRef(new Map());

  const focusCell = useCallback((row, col) => {
    const nextRow = Math.max(0, Math.min(ranks.length - 1, row));
    const nextCol = Math.max(0, Math.min(ranks.length - 1, col));
    const hand = getHandName(nextRow, nextCol);
    setFocusedHand(hand);
    cellRefs.current.get(hand)?.focus({ preventScroll: true });
    cellRefs.current.get(hand)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [getHandName, ranks.length]);

  const handleGridKeyDown = useCallback((event, row, col) => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowUp') focusCell(row - 1, col);
    if (event.key === 'ArrowDown') focusCell(row + 1, col);
    if (event.key === 'ArrowLeft') focusCell(row, col - 1);
    if (event.key === 'ArrowRight') focusCell(row, col + 1);
    if (event.key === 'Home') focusCell(row, 0);
    if (event.key === 'End') focusCell(row, ranks.length - 1);
  }, [focusCell, ranks.length]);

  return (
    <div
      className="preflop-lab-grid-scroll"
      role="region"
      aria-label="Scrollable 13 by 13 starting-hand matrix. Use arrow keys to move between hands."
    >
      <div
        className="preflop-lab-grid"
        role="grid"
        aria-label="Starting-hand range"
        aria-rowcount={ranks.length}
        aria-colcount={ranks.length}
      >
        <span className="preflop-lab-axis-corner" aria-hidden="true">RANK</span>
        {ranks.map((rank) => (
          <span key={`column-${rank}`} className="preflop-lab-axis is-column" role="columnheader">
            {rank}
          </span>
        ))}

        {ranks.map((rank, row) => (
          <div className="preflop-lab-grid-row" role="row" key={`row-${rank}`}>
            <span className="preflop-lab-axis is-row" role="rowheader">{rank}</span>
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
                <button
                  key={hand}
                  ref={(node) => {
                    if (node) cellRefs.current.set(hand, node);
                    else cellRefs.current.delete(hand);
                  }}
                  type="button"
                  role="gridcell"
                  tabIndex={focusedHand === hand ? 0 : -1}
                  onFocus={() => setFocusedHand(hand)}
                  onKeyDown={(event) => handleGridKeyDown(event, row, col)}
                  onClick={() => onCellClick(hand)}
                  disabled={!!gradeResult || !timerActive}
                  data-action={userAction || 'none'}
                  data-feedback={feedbackState}
                  style={{
                    '--cell-fill': actionStyle?.bg || 'rgba(20, 29, 43, 0.82)',
                    '--cell-stroke': actionStyle?.border || 'rgba(129, 167, 194, 0.18)',
                  }}
                  aria-rowindex={row + 1}
                  aria-colindex={col + 1}
                  aria-label={`${hand}: ${userAction ? actionColors[userAction]?.label : 'not selected'}${feedbackState !== 'idle' ? `, ${feedbackState}` : ''}`}
                >
                  {hand}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(PreflopRangeMatrix);
