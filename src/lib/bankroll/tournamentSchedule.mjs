// Tournament Calendar data: real series from /api/poker/series, turned into
// calendar events, plus the saved bankroll plan.
//
// The calendar used to ship a hard-coded list of twelve 2026 events with
// guessed dates, so in late 2026 it showed one upcoming event and from 2027 it
// would show none. Series dates are civil days (YYYY-MM-DD) and are compared
// as strings, never converted through a time zone.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');

export const PLAN_STORAGE_KEY = 'bankroll.tournamentCalendar.plan.v1';

const TYPE_COLORS = {
  major: '#6bd5e7',
  'mid-major': '#4795f3',
  circuit: '#7098b3',
  regional: '#83abc5',
};

/** A civil date for a 0-based month. */
export function calendarDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${pad(month + 1)}-${pad(day)}`;
}

/** The first and last day of a month, as YYYY-MM-DD (month is 0-based). */
export function monthBounds(year, month) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { start: calendarDate(year, month, 1), end: calendarDate(year, month, last) };
}

/**
 * The API filters on a series' START date, so to see series still running at
 * the start of a year we ask from the previous October.
 */
export function scheduleQueryWindow(year) {
  return { start_date: `${year - 1}-10-01`, end_date: `${year}-12-31` };
}

export function scheduleUrl(year) {
  const w = scheduleQueryWindow(year);
  return `/api/poker/series?start_date=${w.start_date}&end_date=${w.end_date}&limit=999`;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function compactMoney(n) {
  if (n == null) return null;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

function shortLabel(row) {
  const s = String(row.short_name || row.tour || '').trim();
  if (s) return s;
  const name = String(row.name || row.series_name || 'Series').trim();
  return name.length > 14 ? name.slice(0, 13).trimEnd() + '…' : name;
}

/** One calendar event from an API series row, or null when it has no start date. */
export function normalizeSeries(row) {
  if (!row || !ISO_DAY.test(String(row.start_date || ''))) return null;
  const start = row.start_date;
  const end = ISO_DAY.test(String(row.end_date || '')) && row.end_date >= start ? row.end_date : start;
  const venue = String(row.venue || row.venue_name || '').trim();
  const place = [row.city, row.state].filter(Boolean).join(', ');
  const guaranteed = money(row.main_event_guaranteed) || money(row.total_guaranteed);
  return {
    id: String(row.id ?? `${row.name}-${start}`),
    series: shortLabel(row),
    name: String(row.name || row.series_name || 'Tournament Series').trim(),
    buyIn: money(row.main_event_buyin),
    date: start,
    endDate: end,
    location: [venue, place].filter(Boolean).join(' - ') || 'Location To Be Announced',
    color: TYPE_COLORS[row.series_type] || TYPE_COLORS.regional,
    seriesType: row.series_type || 'regional',
    guaranteed: compactMoney(guaranteed),
    eventCount: Number.isFinite(Number(row.event_count ?? row.total_events)) && Number(row.event_count ?? row.total_events) > 0
      ? Number(row.event_count ?? row.total_events) : null,
    sourceUrl: row.source_url || null,
  };
}

/** Normalise, drop rows without dates, de-duplicate by id, sort by start. */
export function normalizeSchedule(rows) {
  const seen = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const ev = normalizeSeries(row);
    if (ev && !seen.has(ev.id)) seen.set(ev.id, ev);
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export const runsOn = (ev, day) => ev.date <= day && ev.endDate >= day;

/** Events running at any point in the month. */
export function eventsInMonth(events, year, month) {
  const { start, end } = monthBounds(year, month);
  return events.filter((ev) => ev.date <= end && ev.endDate >= start);
}

/** Events still running or yet to start on `today`. */
export function upcomingEvents(events, today) {
  return events.filter((ev) => ev.endDate >= today);
}

/** Budget for the saved plan: known buy-ins only, with a count of unknowns. */
export function planBudget(planEvents, bankrollTotal) {
  const known = planEvents.filter((e) => e.buyIn != null);
  const total = known.reduce((s, e) => s + e.buyIn, 0);
  const coverage = total > 0 && bankrollTotal > 0 ? Math.min(100, (bankrollTotal / total) * 100) : bankrollTotal > 0 ? 100 : 0;
  return { total, coverage, unknownCount: planEvents.length - known.length };
}

/** Saved plan entries (event snapshots) from storage text; bad data reads as empty. */
export function readPlan(text) {
  try {
    const parsed = JSON.parse(text || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((e) => e && typeof e.id === 'string' && ISO_DAY.test(String(e.date || '')))
      : [];
  } catch {
    return [];
  }
}

/** Add or remove an event from the plan (stored as a snapshot so it survives a schedule change). */
export function togglePlan(plan, ev) {
  if (plan.some((p) => p.id === ev.id)) return plan.filter((p) => p.id !== ev.id);
  const { id, series, name, buyIn, date, endDate, location, color } = ev;
  return [...plan, { id, series, name, buyIn, date, endDate, location, color }].sort((a, b) => a.date.localeCompare(b.date));
}
