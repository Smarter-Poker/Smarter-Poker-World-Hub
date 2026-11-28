// Venue Intel arithmetic, kept pure so it can be tested.
//
// Before 2026-11-27 VenueIntelligence counted its own hours: dealing downs
// only, clock time only, no pay multiplier. Analytics (TokeDashboard via
// getTokeAnalytics) and every event report count PAID hours: each down's clock
// time times its multiplier, breaks included, through computeTotalHours. The
// same shift therefore showed two different "Tokes Per Hour" figures depending
// on which Toke Tracker page the dealer opened. These helpers use the one
// definition in tokeReport.mjs, so the two pages agree.
import { computeTotalHours, isDealingDown } from './tokeReport.mjs';

const num = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};
const cents = (value) => Math.round(num(value) * 100) / 100;

/** The downs of a gig, whether fetchGigs attached them flat or under days. */
export function gigDowns(gig) {
  if (Array.isArray(gig?.downs)) return gig.downs;
  return (gig?.days || []).flatMap((day) => day.downs || []);
}

/**
 * The venue a gig is grouped under. "Bellagio" and "bellagio " are one room:
 * grouping on the raw string split a dealer's own venue into two rows.
 */
export function venueKey(name) {
  const display = String(name ?? '').replace(/\s+/g, ' ').trim();
  return display ? { key: display.toLowerCase(), display } : { key: '', display: 'Unknown Venue' };
}

/** Tokes (dealing downs only) and paid hours of one gig. */
export function gigTokesAndHours(gig, now = Date.now()) {
  const downs = gigDowns(gig);
  const totalTokes = cents(downs.filter(isDealingDown).reduce((sum, d) => sum + num(d.toke_amount), 0));
  return { totalTokes, paidHours: computeTotalHours(downs, now) };
}

/** Venues ranked by hourly tokes, total tokes or event count. */
export function rankVenues(gigs = [], sort = 'toke_hr', now = Date.now()) {
  const map = new Map();
  for (const gig of gigs) {
    if (!gig) continue;
    const { key, display } = venueKey(gig.venue_name);
    if (!map.has(key)) map.set(key, { venue: display, totalTokes: 0, paidHours: 0, events: 0 });
    const row = map.get(key);
    const { totalTokes, paidHours } = gigTokesAndHours(gig, now);
    row.totalTokes = cents(row.totalTokes + totalTokes);
    row.paidHours += paidHours;
    row.events += 1;
  }
  const rows = [...map.values()].map((row) => ({
    ...row,
    paidHours: Math.round(row.paidHours * 100) / 100,
    tokePerHr: row.paidHours > 0 ? cents(row.totalTokes / row.paidHours) : 0,
  }));
  const measure = {
    toke_hr: (r) => r.tokePerHr,
    total: (r) => r.totalTokes,
    events: (r) => r.events,
  }[sort] || ((r) => r.tokePerHr);
  // Ties fall back to total tokes, then name, so the order never shuffles.
  return rows.sort((a, b) => measure(b) - measure(a) || b.totalTokes - a.totalTokes || a.venue.localeCompare(b.venue));
}

/**
 * Tokes by game type. Only dealing downs count: a break is not a game, and
 * listing it as a "game" with $0 per down dragged a Break row into a table of
 * what each game pays. Down counts match every other Toke Tracker figure,
 * which also count dealing downs only.
 */
export function gameTypeStats(gigs = []) {
  const map = new Map();
  for (const gig of gigs) {
    for (const down of gigDowns(gig)) {
      if (!isDealingDown(down)) continue;
      const gameType =
        down.down_type === 'cash' ? down.game_type || 'Holdem' : down.down_type;
      if (!map.has(gameType)) map.set(gameType, { gameType, totalTokes: 0, totalDowns: 0 });
      const row = map.get(gameType);
      row.totalTokes = cents(row.totalTokes + num(down.toke_amount));
      row.totalDowns += 1;
    }
  }
  return [...map.values()]
    .map((row) => ({ ...row, avgTokePerDown: row.totalDowns ? cents(row.totalTokes / row.totalDowns) : 0 }))
    .sort((a, b) => b.avgTokePerDown - a.avgTokePerDown || b.totalDowns - a.totalDowns);
}

export const BUYIN_BRACKETS = [
  { label: '$1k+', min: 1000 },
  { label: '$500-$999', min: 500 },
  { label: '$250-$499', min: 250 },
  { label: '$100-$249', min: 100 },
  { label: '<$100', min: 0 },
];

/** The bracket a buy-in falls in, or null when none was recorded. */
export function buyInBracket(buyin) {
  if (buyin == null || buyin === '') return null;
  const amount = typeof buyin === 'number' ? buyin : parseFloat(String(buyin).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(amount) || amount < 0) return null;
  // Brackets by lower bound only: a $99.995 or "250" buy-in used to match no
  // bracket (string compare, gaps between 99.99 and 100) and vanished.
  return BUYIN_BRACKETS.find((b) => amount >= b.min) || null;
}

/** Tournament tokes by buy-in bracket; null when no tournament was dealt. */
export function tournamentBrackets(gigs = []) {
  const map = new Map(BUYIN_BRACKETS.map((b) => [b.label, { label: b.label, totalTokes: 0, totalDowns: 0 }]));
  let dealt = false;
  for (const gig of gigs) {
    for (const down of gigDowns(gig)) {
      if (down.down_type !== 'tournament') continue;
      dealt = true;
      const bracket = buyInBracket(down.tournament_buyin);
      if (!bracket) continue;
      const row = map.get(bracket.label);
      row.totalTokes = cents(row.totalTokes + num(down.toke_amount));
      row.totalDowns += 1;
    }
  }
  if (!dealt) return null;
  return BUYIN_BRACKETS.map((b) => map.get(b.label))
    .filter((row) => row.totalDowns > 0)
    .map((row) => ({ ...row, avgTokePerDown: cents(row.totalTokes / row.totalDowns) }));
}

/** The summary figures at the top of Venue Intel. */
export function careerTotals(gigs = [], now = Date.now()) {
  let totalTokes = 0;
  let paidHours = 0;
  for (const gig of gigs) {
    if (!gig) continue;
    const stats = gigTokesAndHours(gig, now);
    totalTokes += stats.totalTokes;
    paidHours += stats.paidHours;
  }
  return {
    totalTokes: cents(totalTokes),
    events: gigs.filter(Boolean).length,
    paidHours: Math.round(paidHours * 100) / 100,
    tokesPerHour: paidHours > 0 ? cents(totalTokes / paidHours) : 0,
  };
}
