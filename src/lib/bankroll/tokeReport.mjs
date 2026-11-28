// Dealer (toke) event arithmetic and exports, kept pure so they can be tested.
import { localDay, parseLedgerDay } from './localDates.mjs';
import { toCsv } from './stakingMath.mjs';

export const DEALING_TYPES = new Set(['cash', 'tournament', 'brush']);
export const isDealingDown = (down) => DEALING_TYPES.has(down?.down_type);

const num = (value, fallback = 0) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};
const cents = (value) => Math.round(num(value) * 100) / 100;

/** Clock minutes a down lasted (an open down runs to `now`). */
export function downMinutes(down, now = Date.now()) {
  const start = new Date(down?.started_at).getTime();
  if (!Number.isFinite(start)) return 0;
  const endRaw = down.ended_at ? new Date(down.ended_at).getTime() : now;
  const end = Number.isFinite(endRaw) ? endRaw : now;
  return Math.max(0, (end - start) / 60000);
}

/** Paid hours: each down's clock time times its pay multiplier. */
export function computeTotalHours(downs = [], now = Date.now()) {
  return downs.reduce((sum, d) => sum + (downMinutes(d, now) / 60) * num(d.down_multiplier, 1), 0);
}

const sumTokes = (downs) => cents(downs.filter(isDealingDown).reduce((s, d) => s + num(d.toke_amount), 0));
const sumExpenses = (expenses) => cents(expenses.reduce((s, e) => s + num(e.amount), 0));

/**
 * Inclusive calendar days an event covered. Recorded days win (a three-day
 * event is three days, not the two whole days between its first and last
 * date); otherwise the start..end span, both ends counted.
 */
export function eventDayCount(gig, days = [], today = localDay()) {
  if (days.length) return days.length;
  const start = parseLedgerDay(gig?.start_date);
  const end = parseLedgerDay(gig?.end_date || today);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

/** Stats for one event's report. */
export function gigReportStats({ gig, days = [], downs = [], expenses = [], now = Date.now() }) {
  const dealing = downs.filter(isDealingDown);
  const totalTokes = sumTokes(downs);
  const totalHoursWorked = computeTotalHours(downs, now);
  const totalExpenses = sumExpenses(expenses);
  const hourlyRate = num(gig?.hourly_rate);
  const hourlyPay = cents(totalHoursWorked * hourlyRate);
  const totalEarnings = cents(hourlyPay + totalTokes - totalExpenses);
  const durationDays = eventDayCount(gig, days, localDay(new Date(now)));
  return {
    totalTokes,
    totalDowns: dealing.length,
    totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
    hourlyRate,
    hourlyPay,
    totalEarnings,
    totalExpenses,
    cashDownCount: downs.filter((d) => d.down_type === 'cash').length,
    tournamentDownCount: downs.filter((d) => d.down_type === 'tournament').length,
    brushDownCount: downs.filter((d) => d.down_type === 'brush').length,
    breakCount: downs.filter((d) => d.down_type === 'break').length,
    doubleDownCount: downs.filter((d) => d.is_double_down).length,
    avgTokePerDown: dealing.length ? cents(totalTokes / dealing.length) : 0,
    tokesPerHour: totalHoursWorked > 0 ? cents(totalTokes / totalHoursWorked) : 0,
    durationDays,
    perDay: cents(totalEarnings / durationDays),
  };
}

/** Totals for one day of an event. */
export function decorateGigDay(day, downs = [], expenses = [], now = Date.now()) {
  const dayDowns = downs.filter((d) => d.day_id === day.id);
  const dayExpenses = expenses.filter((e) => e.day_id === day.id);
  return {
    ...day,
    downs: dayDowns,
    expenses: dayExpenses,
    totalTokes: sumTokes(dayDowns),
    totalDowns: dayDowns.filter(isDealingDown).length,
    totalHoursWorked: computeTotalHours(dayDowns, now),
    totalExpenses: sumExpenses(dayExpenses),
  };
}

// IRS business standard mileage rates (dollars per mile). 2026 changed mid-year:
// 72.5 cents to June 30 (IR-2025-128), 76 cents from July 1 (IR-2026-29).
const MILEAGE_RATES = [
  ['2026-07-01', 0.76],
  ['2026-01-01', 0.725],
  ['2025-01-01', 0.7],
  ['2024-01-01', 0.67],
  ['2023-01-01', 0.655],
  ['2022-07-01', 0.625],
  ['2022-01-01', 0.585],
];
export function irsMileageRate(day) {
  const text = String(day || localDay()).slice(0, 10);
  const match = MILEAGE_RATES.find(([from]) => text >= from);
  return match ? match[1] : MILEAGE_RATES[MILEAGE_RATES.length - 1][1];
}

const pad = (n) => String(n).padStart(2, '0');
const clock = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
};
const dayOf = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? localDay(d) : '';
};
const fixed = (n) => cents(n).toFixed(2);

/** One event's CSV: summary, every down, every expense, each with its day. */
export function buildGigReportCsv(report, { expenseLabels = {}, now = Date.now() } = {}) {
  const { gig, stats, days = [], downs = [], expenses = [] } = report;
  const dayById = new Map(days.map((d) => [d.id, d]));
  const dayNumber = (id) => dayById.get(id)?.day_number ?? '';
  const rows = [
    ['Toke Report', gig.venue_name || ''],
    ['Dates', gig.start_date || '', gig.end_date || ''],
    ['Days', stats.durationDays],
    ['Hourly Rate', fixed(stats.hourlyRate)],
    ['Total Tokes', fixed(stats.totalTokes)],
    ['Hourly Pay', fixed(stats.hourlyPay)],
    ['Expenses', fixed(stats.totalExpenses)],
    ['Net Earnings', fixed(stats.totalEarnings)],
    ['Paid Hours', stats.totalHoursWorked.toFixed(2)],
    ['Tokes Per Hour', fixed(stats.tokesPerHour)],
    ['Avg Toke Per Down', fixed(stats.avgTokePerDown)],
    ['Per Day', fixed(stats.perDay)],
    ['Mileage', num(gig.mileage)],
    [],
    ['Day', 'Date', 'Type', 'Game', 'Tournament', 'Stakes', 'Table', 'Started', 'Ended', 'Minutes', 'Multiplier', 'Paid Hours', 'Toke', 'Double Down', 'Notes'],
    ...downs.map((d) => {
      const minutes = downMinutes(d, now);
      return [
        dayNumber(d.day_id),
        dayOf(d.started_at),
        d.down_type || '',
        [d.game_type, d.cash_variant].filter(Boolean).join(' '),
        d.tournament_name || '',
        d.cash_stakes || '',
        d.table_number || '',
        clock(d.started_at),
        d.ended_at ? clock(d.ended_at) : '',
        Math.round(minutes),
        num(d.down_multiplier, 1),
        ((minutes / 60) * num(d.down_multiplier, 1)).toFixed(2),
        fixed(d.toke_amount),
        d.is_double_down ? 'Yes' : 'No',
        d.notes || '',
      ];
    }),
    [],
    ['Day', 'Date', 'Expense', 'Amount', 'Description'],
    ...expenses.map((e) => [
      dayNumber(e.day_id),
      dayById.get(e.day_id)?.date || dayOf(e.created_at),
      expenseLabels[e.category] || e.category || '',
      fixed(e.amount),
      e.description || '',
    ]),
  ];
  return toCsv(rows);
}

/** The Earnings Overview CSV. */
export function buildTokeAnalyticsCsv(a, scopeTitle = 'Career Tokes') {
  const rows = [
    ['Metric', 'Value'],
    [scopeTitle, fixed(a.careerTokes)],
    ['Total Events', a.totalEvents || 0],
    ['Paid Hours', num(a.totalHours)],
    ['Tokes Per Hour', fixed(a.tokesPerHour)],
    ['Avg Toke Per Down', fixed(a.avgTokePerDown)],
    ['Expenses', fixed(a.totalExpenses)],
    ['Best Event Tokes', fixed(a.bestEvent?.tokes)],
    ['Best Event Venue', a.bestEvent?.venueName || ''],
    ['Cash Downs', a.downTypes?.cash || 0],
    ['Tournament Downs', a.downTypes?.tournament || 0],
    ['Brush Downs', a.downTypes?.brush || 0],
    ['Break Downs', a.downTypes?.break || 0],
  ];
  if (a.eventTrend?.length) {
    rows.push([], ['Event Date', 'Venue', 'Tokes', 'Paid Hours', 'Cumulative']);
    for (const e of a.eventTrend) rows.push([e.date, e.venue, fixed(e.tokes), e.hours, fixed(e.cumulative)]);
  }
  if (a.monthlyTrend?.length) {
    rows.push([], ['Month', 'Tokes', 'Events']);
    for (const m of a.monthlyTrend) rows.push([m.month, fixed(m.tokes), m.events]);
  }
  return toCsv(rows);
}

/** Tokes dealt in the current local month, by the day each down started. */
export function monthTokes(gigs = [], userId, now = new Date()) {
  const month = localDay(now).slice(0, 7);
  let total = 0;
  for (const gig of gigs) {
    if (!gig || (userId && gig.user_id && gig.user_id !== userId)) continue;
    const downs = gig.downs || (gig.days || []).flatMap((d) => d.downs || []);
    for (const d of downs) {
      if (isDealingDown(d) && dayOf(d.started_at).slice(0, 7) === month) total += num(d.toke_amount);
    }
  }
  return cents(total);
}

/** Start a browser download of CSV text. */
export function downloadCsv(csv, filename) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking in the same tick can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (text) =>
  String(text || 'event').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'event';
