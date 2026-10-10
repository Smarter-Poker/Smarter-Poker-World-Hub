import { isValidIsoDate, parseDailyTournamentStartMinutes } from './dailyTournamentData.mjs';

// A state spanning multiple zones cannot establish a venue's wall clock.
const SPLIT_STATES = new Set(['AK', 'AZ', 'FL', 'ID', 'IN', 'KS', 'KY', 'MI', 'NE', 'NV', 'ND', 'OR', 'SD', 'TN', 'TX']);

export function qualifiedScheduleZone(row, resolveZone) {
  const explicit = row?.timezone || row?.venue_timezone || row?.venue?.timezone;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const state = String(row?.state || row?.venue_state || '').trim().toUpperCase();
  return SPLIT_STATES.has(state) ? null : resolveZone(row);
}

export function scheduleClock(now, timezone) {
  if (!timezone || !Number.isFinite(now?.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const part = (key) => parts.find(p => p.type === key)?.value;
    return { iso: `${part('year')}-${part('month')}-${part('day')}`, day: part('weekday'),
      minutes: Number(part('hour')) * 60 + Number(part('minute')) };
  } catch { return null; }
}

export function scheduleCountdown(row, selectedDay, timezone, now) {
  if (/^(cancelled|canceled|completed)$/i.test(row?.status || '')) return null;
  const clock = scheduleClock(now, timezone);
  const minutes = parseDailyTournamentStartMinutes(row?.start_time);
  if (!clock || minutes < 0) return null;
  const date = row?.event_date || row?.start_date;
  if (date ? !isValidIsoDate(date) || date !== clock.iso : selectedDay !== clock.day) return null;
  // Resolve the wall-clock start using both adjacent offsets. Nonexistent and
  // repeated DST times have zero/two matches: suppress an ambiguous countdown.
  const anchor = Date.parse(`${clock.iso}T00:00:00Z`) + minutes * 60000;
  const candidates = new Set();
  for (const delta of [-86400000, 0, 86400000]) {
    const probe = new Date(anchor + delta);
    const local = scheduleClock(probe, timezone);
    if (!local) continue;
    const localMs = Date.parse(`${local.iso}T00:00:00Z`) + local.minutes * 60000;
    const candidate = anchor - (localMs - probe.getTime());
    const actual = scheduleClock(new Date(candidate), timezone);
    if (actual?.iso === clock.iso && actual.minutes === minutes) candidates.add(candidate);
  }
  if (candidates.size !== 1) return null;
  return Math.ceil(([...candidates][0] - now.getTime()) / 60000);
}

export function scheduleDateStatus(start, end, timezone, now = new Date()) {
  if (!isValidIsoDate(start) || (end && (!isValidIsoDate(end) || end < start))) return { label: 'Date TBD', color: '#94a3b8' };
  const clock = scheduleClock(now, timezone);
  if (!clock) return { label: 'Schedule Published', color: '#94a3b8' };
  if (clock.iso < start) return { label: 'Upcoming', color: '#60a5fa' };
  if (clock.iso <= (end || start)) return { label: 'Scheduled Today', color: '#4ade80' };
  return { label: 'Past Schedule', color: '#94a3b8' };
}

export function sourceVerificationTime(value, now = new Date()) {
  if (typeof value !== 'string') return null;
  const parts = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  // Date.parse normalizes impossible days and 24:00 into another calendar day.
  // Such a timestamp cannot establish when a source was actually verified.
  if (!parts || !isValidIsoDate(parts[1]) || Number(parts[2]) > 23
    || Number(parts[3]) > 59 || Number(parts[4]) > 59) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms <= now.getTime() ? new Date(ms).toISOString() : null;
}
