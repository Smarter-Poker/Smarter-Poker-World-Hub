/**
 * Bankroll dashboard filters: the allowed values and how a stored or linked
 * value is read back.
 *
 * The dashboard keeps its time range, chart type and game types in
 * usePersistedFilters, which reads localStorage and the URL query. Both can
 * hold anything: an old label from a renamed option, `?chartType=pie`, a
 * hand-edited link. A value that is not one of the options used to reach the
 * page as-is, so the dropdown showed a label that matched nothing and the
 * date range silently fell back to All Time. Every read goes through these.
 */

export const TIME_FILTERS = ['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'This Year', 'All Time'];
export const DEFAULT_TIME_FILTER = 'All Time';

export const CHART_TYPES = ['line', 'bar', 'donut', 'stacked', 'histogram', 'heatmap'];
export const CHART_TYPE_LABELS = {
  line: 'Line Chart',
  bar: 'Bar Chart',
  donut: 'Donut Chart',
  stacked: 'Stacked Bar',
  histogram: 'Histogram',
  heatmap: 'Heatmap',
};
export const DEFAULT_CHART_TYPE = 'line';

// The gaming categories the dashboard can filter by, in display order.
export const GAME_TYPES = ['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports'];

export function sanitizeTimeFilter(value) {
  return TIME_FILTERS.includes(value) ? value : DEFAULT_TIME_FILTER;
}

export function sanitizeChartType(value) {
  return CHART_TYPES.includes(value) ? value : DEFAULT_CHART_TYPE;
}

/**
 * Known game types, in display order, without duplicates. A missing or
 * unreadable value means "every type" (the first-visit default). An empty
 * array is a real choice (the player cleared every box) and is kept.
 * A URL query arrives as a comma-separated string.
 */
export function sanitizeGameTypes(value) {
  let list = value;
  if (typeof list === 'string') list = list.split(',').map((s) => s.trim()).filter(Boolean);
  if (!Array.isArray(list)) return GAME_TYPES.slice();
  const wanted = new Set(list);
  return GAME_TYPES.filter((type) => wanted.has(type));
}

export function toggleGameType(current, type) {
  const list = sanitizeGameTypes(current);
  if (!GAME_TYPES.includes(type)) return list;
  return list.includes(type)
    ? list.filter((t) => t !== type)
    : sanitizeGameTypes(list.concat([type]));
}

/**
 * Where focus goes inside an open filter menu for a key press, or null when
 * the key does not move it. Wraps at both ends; Home and End jump.
 */
export function nextMenuIndex(current, key, count) {
  if (!count) return null;
  const at = Number.isInteger(current) && current >= 0 && current < count ? current : -1;
  switch (key) {
    case 'ArrowDown': return at < 0 ? 0 : (at + 1) % count;
    case 'ArrowUp': return at < 0 ? count - 1 : (at - 1 + count) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}
