/**
 * Bankroll Trend line chart: the x-axis modes and the facts the chart labels.
 *
 * buildTrend(...).line is the running net on a real time axis: a $0 anchor the
 * day before the first result, one point per recorded day, and (when the range
 * runs past the last recorded day) a synthetic close at the end of the range.
 *
 * Reported 2026-11-28 from a real ledger: thirteen sessions in a few weeks of
 * Feb-Mar 2026, viewed "All Time" in late November. On the time axis the whole
 * climb to the peak and the drop to the low sat in the left 5% of a phone-width
 * chart, followed by eight months of flat line. The values were right and the
 * picture was unreadable. "By Session" spaces each recorded day evenly so the
 * ups and downs get the width; "By Date" keeps today at the right edge and
 * labels the flat tail as "no sessions since", so it never reads as a trend.
 */

import { DEFAULT_LINE_AXIS, sanitizeLineAxis } from './dashboardFilters.mjs';

export { LINE_AXES, LINE_AXIS_LABELS, DEFAULT_LINE_AXIS, sanitizeLineAxis } from './dashboardFilters.mjs';

/**
 * The share of the plotted width (anchor to range end) that the recorded days
 * occupy on the time axis: 0 when everything is on one edge, 1 when the last
 * recorded day is the range end. null when there is no line to measure.
 */
export function activeShare(line) {
  if (!Array.isArray(line) || line.length < 2) return null;
  const start = line[0].t;
  const end = line[line.length - 1].t;
  const lastReal = lastRecorded(line);
  if (!lastReal || !(end > start)) return null;
  return (lastReal.t - start) / (end - start);
}

// Recorded days fill less than a quarter of the width, i.e. more than three
// quarters of the time axis would be a flat line after the last session.
export const CLUSTER_SHARE = 0.25;

/** True when the time axis would squeeze every result into under 25% of the width. */
export function isClustered(line) {
  const share = activeShare(line);
  return share !== null && share < CLUSTER_SHARE;
}

/** The axis to draw: the player's explicit choice, otherwise By Session when clustered. */
export function resolveLineAxis(choice, line) {
  const chosen = sanitizeLineAxis(choice);
  if (chosen !== DEFAULT_LINE_AXIS) return chosen;
  return isClustered(line) ? 'session' : 'date';
}

/** The last point that is a recorded day (not the $0 anchor, not the synthetic close). */
export function lastRecorded(line) {
  for (let i = (line?.length || 0) - 1; i >= 0; i--) if (!line[i].synthetic) return line[i];
  return null;
}

/**
 * By Session rows: the $0 anchor, then each recorded day, evenly spaced at
 * x = 0, 1, 2, ... The synthetic close is dropped (it is not a session and
 * would only repeat the last value).
 */
export function sessionAxisRows(line) {
  if (!Array.isArray(line) || !line.length) return [];
  const rows = line.filter((row, index) => index === 0 || !row.synthetic);
  return rows.map((row, x) => ({ ...row, x }));
}

/**
 * Sparse tick positions for By Session: the first and last recorded day and a
 * few evenly spread between, at most `max` in all. Index 0 (the anchor) is not
 * labelled unless it is the only point.
 */
export function sessionTicks(count, max = 4) {
  if (count <= 1) return count === 1 ? [0] : [];
  const days = count - 1; // recorded days at x = 1..days
  if (days <= max) return Array.from({ length: days }, (_, i) => i + 1);
  const picks = new Set();
  for (let k = 0; k < max; k++) picks.add(1 + Math.round((k * (days - 1)) / (max - 1)));
  return [...picks].sort((a, b) => a - b);
}

/**
 * By Date rows: `solid` carries the line up to the last recorded day and
 * `tail` carries the flat run from the last recorded day to the range end, so
 * the chart can draw the tail differently. Both are null where they do not apply.
 */
export function dateAxisRows(line) {
  if (!Array.isArray(line) || !line.length) return [];
  const last = lastRecorded(line);
  const lastIndex = last ? line.indexOf(last) : line.length - 1;
  return line.map((row, index) => ({
    ...row,
    solid: index <= lastIndex ? row.cumulative : null,
    tail: index >= lastIndex && lastIndex < line.length - 1 ? row.cumulative : null,
  }));
}

/** The flat tail of a By Date line, or null when the line reaches the range end. */
export function idleTail(line) {
  const last = lastRecorded(line);
  const end = line?.[line.length - 1];
  if (!last || !end || !(end.t > last.t)) return null;
  return { since: last.date, from: last.t, to: end.t };
}

/**
 * The peak and the lowest point of the running net, earliest first on a tie.
 * The peak is null unless the line ever went above $0, the lowest unless it
 * ever went below; the $0 anchor is the start, not a peak.
 */
export function lineExtremes(line) {
  let peak = null;
  let lowest = null;
  for (const row of line || []) {
    if (row.synthetic) continue;
    if (row.cumulative > 0 && (!peak || row.cumulative > peak.cumulative)) peak = row;
    if (row.cumulative < 0 && (!lowest || row.cumulative < lowest.cumulative)) lowest = row;
  }
  return { peak, lowest };
}

/**
 * The text summary for screen readers: start, peak with date, lowest with
 * date, current. `money(cents)` and `day(date)` format for display.
 */
export function trendSummary(line, money, day) {
  if (!Array.isArray(line) || !line.length) return 'No results in this period.';
  const { peak, lowest } = lineExtremes(line);
  const last = lastRecorded(line);
  const end = line[line.length - 1];
  const parts = ['Running net started at ' + money(0) + ' on ' + day(line[0].date) + '.'];
  parts.push(peak ? 'Peak ' + money(peak.cumulative) + ' on ' + day(peak.date) + '.' : 'Never above ' + money(0) + '.');
  parts.push(
    lowest ? 'Lowest ' + money(lowest.cumulative) + ' on ' + day(lowest.date) + '.' : 'Never below ' + money(0) + '.'
  );
  parts.push('Current ' + money(end.cumulative) + ' as of ' + day(end.date) + '.');
  if (last && end.t > last.t) parts.push('No sessions since ' + day(last.date) + '.');
  return parts.join(' ');
}
