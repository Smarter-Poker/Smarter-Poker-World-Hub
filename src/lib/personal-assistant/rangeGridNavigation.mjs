export const RANGE_GRID_COLUMNS = 13;
export const RANGE_GRID_CELL_COUNT = RANGE_GRID_COLUMNS * RANGE_GRID_COLUMNS;

/** WAI-ARIA grid navigation with bounded arrow, Home, and End movement. */
export function nextRangeGridIndex(index, key, total = RANGE_GRID_CELL_COUNT, columns = RANGE_GRID_COLUMNS) {
  const last = Math.max(0, total - 1);
  const current = Math.min(Math.max(Number(index) || 0, 0), last);
  const rowStart = Math.floor(current / columns) * columns;
  const rowEnd = Math.min(last, rowStart + columns - 1);
  if (key === 'ArrowLeft') return Math.max(rowStart, current - 1);
  if (key === 'ArrowRight') return Math.min(rowEnd, current + 1);
  if (key === 'ArrowUp') return Math.max(0, current - columns);
  if (key === 'ArrowDown') return Math.min(last, current + columns);
  if (key === 'Home') return rowStart;
  if (key === 'End') return rowEnd;
  return current;
}

export function isRangeGridNavigationKey(key) {
  return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key);
}
