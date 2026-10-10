import { isValidIsoDate } from './dailyTournamentData.mjs';

// Discovery compares printed calendar dates, not observed game activity.
// Keep the existing Eastern discovery day; never infer a source date/year.
export function discoveryDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}

export function scheduleDateBucket(row, today = discoveryDate()) {
  const start = row?.start_date ?? row?.event_date;
  const end = row?.end_date || start;
  if (!isValidIsoDate(start) || start === '1970-01-01' || !isValidIsoDate(end) || end < start) return { group: 1, date: '' };
  return { group: end >= today ? 0 : 2, date: start };
}

/** Upcoming dates, undated schedules, then recent history; all rows retained. */
export function orderDiscoverySchedules(rows, today = discoveryDate(), select = row => row) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({ row, index, ...scheduleDateBucket(select(row), today) }))
    .sort((a, b) => a.group - b.group || (a.group === 2 ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || a.index - b.index)
    .map(item => item.row);
}

export function nextTourSchedule(tour, today = discoveryDate()) {
  const rows = ['upcoming_series', 'stops_2026', 'series_2026'].flatMap(field => Array.isArray(tour?.[field]) ? tour[field] : []);
  const schedules = orderDiscoverySchedules(rows, today);
  return schedules.find(row => scheduleDateBucket(row, today).group === 0) || null;
}
