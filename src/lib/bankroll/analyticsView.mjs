import { sessionHours } from './ledgerMath.mjs';

export const GAME_LABELS = {
  poker_cash: 'Cash Games',
  poker_mtt: 'Tournaments',
  casino_table: 'Table Games',
  slots: 'Slots',
  sports: 'Sports',
  expense: 'Expenses',
};
export const SERIES_COLORS = ['#409eff', '#74e1ed', '#b8cee4', '#547caa', '#82b9d0', '#788fa6'];
// A superseded revision is history, never a result (see isCurrentRow in ledgerMath.mjs).
export const isSession = (entry) =>
  !entry.is_revision && Object.hasOwn(GAME_LABELS, entry.category) && entry.category !== 'expense';
const isPlotted = (entry) => !entry.is_revision && (isSession(entry) || entry.category === 'expense');
const DAY = 86400000;

// net_result is the generated gross_out - gross_in. An expense is always a
// cost, whatever sign its row carries: the same rule as expenseCostCents in
// ledgerMath.mjs, so the chart and the Net Results tile never part ways.
export function netCents(entry) {
  const stored = entry.net_result;
  const raw =
    stored !== null && stored !== undefined && stored !== '' && Number.isFinite(Number(stored))
      ? Math.round(Number(stored) * 100)
      : Math.round(Number(entry.gross_out || 0) * 100) - Math.round(Number(entry.gross_in || 0) * 100);
  return entry.category === 'expense' ? -Math.abs(raw) : raw;
}

export function sortedSessions(entries) {
  return entries
    .filter(isSession)
    .sort(
      (a, b) =>
        a.entry_date.localeCompare(b.entry_date) ||
        (a.start_time || a.created_at || '').localeCompare(b.start_time || b.created_at || '') ||
        String(a.id || '').localeCompare(String(b.id || ''))
    );
}

export function buildTrend(entries, startDate, endDate) {
  const rows = entries.filter(
    (e) => isPlotted(e) && e.entry_date >= startDate && e.entry_date <= endDate
  );
  const byDate = new Map();
  const categories = new Map();
  for (const entry of rows) {
    const cents = netCents(entry);
    const day = byDate.get(entry.entry_date) || {
      date: entry.entry_date,
      cents: 0,
      sessions: 0,
      entries: 0,
      categories: {},
    };
    day.cents += cents;
    day.sessions += Number(isSession(entry));
    day.entries++;
    day.categories[entry.category] = (day.categories[entry.category] || 0) + cents;
    categories.set(entry.category, (categories.get(entry.category) || 0) + cents);
    byDate.set(day.date, day);
  }
  const recorded = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  // At most 93 daily columns, then calendar months. No per-day expansion for a lifetime ledger.
  const first = startDate === '2000-01-01' ? recorded[0]?.date || endDate : startDate;
  const monthly = (Date.parse(endDate) - Date.parse(first)) / DAY > 93;
  const period = monthly ? 'Month' : 'Day';
  const buckets = new Map();
  let total = 0,
    high = 0,
    low = 0;
  for (const day of recorded) {
    const date = monthly ? day.date.slice(0, 7) + '-01' : day.date;
    const bucket = buckets.get(date) || { date, cents: 0, sessions: 0, cumulative: 0, categories: {} };
    total += day.cents;
    high = Math.max(high, total);
    low = Math.min(low, total);
    bucket.cents += day.cents;
    bucket.sessions += day.sessions;
    bucket.cumulative = total;
    for (const [key, value] of Object.entries(day.categories))
      bucket.categories[key] = (bucket.categories[key] || 0) + value;
    buckets.set(date, bucket);
  }
  const series = [];
  if (recorded.length) {
    const cursor = new Date((monthly ? first.slice(0, 7) + '-01' : first) + 'T00:00:00Z');
    const end = Date.parse(endDate + 'T00:00:00Z');
    let running = 0;
    while (cursor.getTime() <= end) {
      const date = cursor.toISOString().slice(0, 10);
      const bucket = buckets.get(date);
      if (bucket) running = bucket.cumulative;
      series.push({
        date,
        cumulative: running,
        cents: bucket?.cents || 0,
        sessions: bucket?.sessions || 0,
        ...bucket?.categories,
      });
      if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  // The running-net line is never bucketed: monthly buckets keep only each month's closing
  // value, which erased intra-month peaks and drew a flat line at the final total.
  // One point per recorded day on a time axis, anchored at zero before the first result
  // and carried to the end of the range.
  const line = [];
  if (recorded.length) {
    const stamp = (date) => Date.parse(date + 'T00:00:00Z');
    const firstDay = stamp(recorded[0].date);
    const anchor = Math.min(stamp(first), firstDay - DAY);
    line.push({ date: new Date(anchor).toISOString().slice(0, 10), t: anchor, cumulative: 0, cents: 0, sessions: 0, synthetic: true });
    let running = 0;
    for (const day of recorded) {
      running += day.cents;
      line.push({ date: day.date, t: stamp(day.date), cumulative: running, cents: day.cents, sessions: day.sessions });
    }
    const close = stamp(endDate);
    if (close > line[line.length - 1].t)
      line.push({ date: endDate, t: close, cumulative: running, cents: 0, sessions: 0, synthetic: true });
  }
  const sessions = rows.filter(isSession);
  return {
    rows,
    sessions,
    line,
    total,
    high,
    low,
    byDate,
    series,
    period,
    first,
    endDate,
    categories: Object.keys(GAME_LABELS)
      .filter((k) => categories.has(k))
      .map((key) => ({
        key,
        label: GAME_LABELS[key],
        cents: categories.get(key),
        magnitude: Math.abs(categories.get(key)),
        color: SERIES_COLORS[Object.keys(GAME_LABELS).indexOf(key)],
      })),
  };
}

export function histogram(sessions) {
  if (!sessions.length) return [];
  const values = sessions.map(netCents);
  const low = values.reduce((a, b) => Math.min(a, b), Infinity);
  const high = values.reduce((a, b) => Math.max(a, b), -Infinity);
  const count = Math.min(9, Math.ceil(Math.sqrt(values.length)), high - low + 1);
  const width = Math.max(1, Math.ceil((high - low + 1) / count));
  const bins = Array.from({ length: Math.ceil((high - low + 1) / width) }, (_, index) => ({
    low: low + index * width,
    high: Math.min(high, low + (index + 1) * width - 1),
    count: 0,
  }));
  for (const value of values) bins[Math.floor((value - low) / width)].count++;
  return bins;
}

export function sessionSummary(entries) {
  const sessions = sortedSessions(entries);
  const result = {
    count: sessions.length,
    buyIn: 0,
    net: 0,
    wins: 0,
    streak: 0,
    best: null,
    worst: null,
    drawdown: 0,
    hours: 0,
    timedNet: 0,
    timed: 0,
  };
  let peak = 0;
  for (const entry of sessions) {
    const value = netCents(entry);
    result.net += value;
    result.buyIn += Math.round(Number(entry.gross_in || 0) * 100);
    result.wins += Number(value > 0);
    result.streak = value > 0 ? result.streak + 1 : 0;
    result.best = result.best === null ? value : Math.max(result.best, value);
    result.worst = result.worst === null ? value : Math.min(result.worst, value);
    peak = Math.max(peak, result.net);
    result.drawdown = Math.max(result.drawdown, peak - result.net);
    // Overnight rule shared with the dashboard (ledgerMath sessionHours).
    const measured = sessionHours(entry.start_time, entry.end_time);
    const hours = measured > 0 ? measured : Number(entry.duration_hours);
    if (Number.isFinite(hours) && hours > 0) {
      result.hours += hours;
      result.timedNet += value;
      result.timed++;
    }
  }
  const mean = result.count ? result.net / result.count : null;
  const sd =
    result.count > 1
      ? Math.sqrt(sessions.reduce((s, e) => s + (netCents(e) - mean) ** 2, 0) / (result.count - 1))
      : null;
  return {
    ...result,
    mean,
    sd,
    winRate: result.count ? (100 * result.wins) / result.count : null,
    roi: result.buyIn ? (100 * result.net) / result.buyIn : null,
    hourlyRate: result.hours ? result.timedNet / result.hours : null,
  };
}

export function comparePeriods(entries, grouping, today = new Date().toISOString().slice(0, 10)) {
  const start = grouping === 'month' ? today.slice(0, 7) + '-01' : today.slice(0, 4) + '-01-01';
  const previous = new Date(start + 'T00:00:00Z');
  if (grouping === 'month') previous.setUTCMonth(previous.getUTCMonth() - 1);
  else previous.setUTCFullYear(previous.getUTCFullYear() - 1);
  const previousStart = previous.toISOString().slice(0, 10);
  return {
    start,
    previousStart,
    current: sessionSummary(entries.filter((e) => e.entry_date >= start && e.entry_date <= today)),
    previous: sessionSummary(
      entries.filter((e) => e.entry_date >= previousStart && e.entry_date < start)
    ),
  };
}

export function venueBreakdown(entries, sort) {
  const venues = new Map();
  for (const entry of entries.filter(isSession)) {
    const name = entry.location_name || entry.location?.name || 'Unspecified Venue';
    const id = entry.location_id || name;
    const venue = venues.get(id) || { id, name, count: 0, net: 0, wins: 0 };
    const net = netCents(entry);
    venue.count++;
    venue.net += net;
    venue.wins += Number(net > 0);
    venues.set(id, venue);
  }
  return [...venues.values()].sort(
    (a, b) => (sort === 'sessions' ? b.count - a.count : b.net - a.net) || a.name.localeCompare(b.name)
  );
}

// Round the ruler outwards without clipping extremes. Both counts and cents are integers.
export function chartTicks(minimum, maximum) {
  const low = Math.min(0, minimum);
  const high = Math.max(0, maximum);
  const ideal = Math.max(1, (high - low) / 4);
  const magnitude = 10 ** Math.floor(Math.log10(ideal));
  const step = ([1, 2, 5, 10].find((multiplier) => multiplier * magnitude >= ideal) || 10) * magnitude;
  const first = Math.floor(low / step) * step;
  const last = Math.max(first + step, Math.ceil(high / step) * step);
  return Array.from({ length: (last - first) / step + 1 }, (_, index) => first + index * step);
}
