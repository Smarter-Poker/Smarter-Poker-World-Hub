/**
 * America/Chicago calendar helpers for the Daily Content Engine.
 * Every slot, period and expiry is decided in Chicago local time, so
 * daylight-saving changes never shift a slot (acceptance test 4).
 */
export const TZ = 'America/Chicago';

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Chicago wall-clock parts for an instant. */
export function chicagoParts(date) {
  const p = Object.fromEntries(dtf.formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

/** Offset (minutes, Chicago minus UTC) in effect at an instant. */
function offsetMinutes(date) {
  const p = chicagoParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(new Date(date).getTime() / 1000) * 1000) / 60000);
}

/** Instant for a Chicago wall-clock time on a YYYY-MM-DD date. */
export function chicagoInstant(ymd, hour = 0, minute = 0) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let t = guess - offsetMinutes(guess) * 60000;
  t = guess - offsetMinutes(t) * 60000; // second pass settles DST edges
  return new Date(t);
}

/** Chicago calendar date (YYYY-MM-DD) of an instant. */
export function chicagoDate(date) {
  const p = chicagoParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** [start, end) of a Chicago calendar day; 23 or 25 hours on DST days. */
export function chicagoDayBounds(ymd) {
  return { start: chicagoInstant(ymd, 0, 0), end: chicagoInstant(addDays(ymd, 1), 0, 0) };
}

export function weekdayName(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function dateLabel(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const wd = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const mo = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${wd}, ${mo} ${d}, ${y}`;
}

export function timeLabel(date) {
  const p = chicagoParts(date);
  const h12 = ((p.hour + 11) % 12) + 1;
  return `${h12}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'AM' : 'PM'}`;
}
