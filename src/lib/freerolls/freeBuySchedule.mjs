/**
 * The one canonical description of Smarter.Poker's daily freerolls.
 *
 * Every page, feed, calendar, schema node and agent API that describes the
 * freeroll schedule imports from here, so the copy can never again drift away
 * from what the Club Arena lobby actually runs.
 *
 * Source of truth (read 2026-11-11 from public.tournaments, last ten days):
 * five No-Limit Hold'em multi-table "Free Buy" tournaments every day, zero
 * buy-in, 3,000 starting chips, at 00:30, 08:30, 12:30, 16:30 and 20:30
 * America/Chicago. Morning carries a 250-chip guarantee and Afternoon a
 * 500-chip guarantee; the other three have none.
 *
 * What this file deliberately does NOT say, because the database does not
 * support it: a combined daily or monthly chip total, Pot-Limit Omaha events,
 * deeper stacks, a Sunday championship, or Diamond freerolls on any cadence.
 * Prizes are chips. Never write a currency symbol in front of them.
 *
 * __tests__/freeroll-schedule-is-canonical.test.mjs holds this in place.
 */

export const FREE_BUY_TIMEZONE = 'America/Chicago';
export const FREE_BUY_STARTING_CHIPS = 3000;
export const FREE_BUY_GAME = "No-Limit Hold'em";

export const FREE_BUY_SCHEDULE = Object.freeze([
  { id: 'midnight', name: 'Midnight Free Buy', hour: 0, minute: 30, time: '12:30 AM CT', guaranteeChips: 0 },
  { id: 'morning', name: 'Morning Free Buy', hour: 8, minute: 30, time: '8:30 AM CT', guaranteeChips: 250 },
  { id: 'midday', name: 'Midday Free Buy', hour: 12, minute: 30, time: '12:30 PM CT', guaranteeChips: 0 },
  { id: 'afternoon', name: 'Afternoon Free Buy', hour: 16, minute: 30, time: '4:30 PM CT', guaranteeChips: 500 },
  { id: 'prime-time', name: 'Prime Time Free Buy', hour: 20, minute: 30, time: '8:30 PM CT', guaranteeChips: 0 },
].map((e) => Object.freeze(e)));

export const FREE_BUY_COUNT = FREE_BUY_SCHEDULE.length;

const fmt = (n) => n.toLocaleString('en-US');

/** Prize wording for one event: chips only, never a currency. */
export function freeBuyPrizeLabel(event) {
  return event.guaranteeChips > 0
    ? `${fmt(event.guaranteeChips)} Chips Guaranteed`
    : 'Prize Pool Built From The Field (No Guarantee)';
}

/** One-line description reused by headings, meta tags and feeds. */
export const FREE_BUY_HEADLINE = 'Five Free Poker Tournaments Every Day';

export const FREE_BUY_SUMMARY =
  "Five free No-Limit Hold'em tournaments every day at 12:30 AM, 8:30 AM, 12:30 PM, 4:30 PM and 8:30 PM Central, " +
  'with zero buy-in and 3,000 starting chips. The Morning event guarantees 250 chips and the Afternoon event guarantees 500 chips.';

/** Shape used by /api/ai/freerolls and the MCP get_freeroll_schedule tool. */
export function freeBuyAgentSchedule() {
  return FREE_BUY_SCHEDULE.map((e) => ({
    time: e.time,
    title: e.name,
    game: FREE_BUY_GAME,
    format: 'Multi-Table Tournament',
    prize: freeBuyPrizeLabel(e),
    starting_stack: `${fmt(FREE_BUY_STARTING_CHIPS)} Chips`,
    buy_in: 'Free (Zero Buy-In)',
    tier: 'open',
    tier_label: 'Open To All Players',
    eligibility: '100% Free Entry (No Deposit Required)',
  }));
}

const pad = (n) => String(n).padStart(2, '0');

/** RFC 5545 fields for a daily recurring event (local America/Chicago time). */
export function freeBuyIcsEvents() {
  return FREE_BUY_SCHEDULE.map((e) => {
    const endHour = (e.hour + 2) % 24;
    return {
      uid: `free-buy-${e.id}@smarter.poker`,
      summary: `${e.name} (NLH) | Smarter.Poker`,
      description: `Free No-Limit Hold'em Tournament, Zero Buy-In, ${fmt(FREE_BUY_STARTING_CHIPS)} Starting Chips. ${freeBuyPrizeLabel(e)}. Play At https://smarter.poker/freerolls`,
      rrule: 'FREQ=DAILY',
      dtstart: `20260101T${pad(e.hour)}${pad(e.minute)}00`,
      dtend: `${endHour < e.hour ? '20260102' : '20260101'}T${pad(endHour)}${pad(e.minute)}00`,
    };
  });
}

const RETIRED_NOTE =
  'Retired. Smarter.Poker runs five daily Free Buy tournaments instead: https://smarter.poker/freerolls';
const DIAMOND_NOTE =
  'Funded Diamond games are not open for play yet. Membership or VIP eligibility does not establish game availability.';

/**
 * Events the two .ics feeds published before 2026-11-11. They are re-sent
 * as CANCELLED with a higher SEQUENCE, under their original UID and start,
 * so a calendar that subscribed to the old feed removes them instead of
 * keeping an event that never runs.
 */
const RETIRED = {
  'calendar-export': [
    ['freeroll-morning-opener', '20260101T100000', '20260101T120000', 'FREQ=DAILY'],
    ['freeroll-afternoon-prime', '20260101T140000', '20260101T160000', 'FREQ=DAILY'],
    ['freeroll-evening-championship', '20260101T180000', '20260101T210000', 'FREQ=DAILY'],
    ['freeroll-nightcap-turbo', '20260101T210000', '20260101T223000', 'FREQ=DAILY'],
    ['freeroll-sunday-diamond-championship', '20260104T160000', '20260104T200000', 'FREQ=WEEKLY;BYDAY=SU'],
  ],
  'series-calendar': [
    ['freeroll-morning-1000', '20261110T100000', '20261110T120000', 'FREQ=DAILY'],
    ['freeroll-afternoon-1400', '20261110T140000', '20261110T163000', 'FREQ=DAILY'],
    ['freeroll-evening-1800', '20261110T180000', '20261110T203000', 'FREQ=DAILY'],
    ['freeroll-nightcap-2100', '20261110T210000', '20261110T223000', 'FREQ=DAILY'],
    ['freeroll-sunday-diamond-1700', '20261115T170000', '20261115T200000', 'FREQ=WEEKLY;BYDAY=SU'],
  ],
};

export function retiredFreerollIcsEvents(feed) {
  return (RETIRED[feed] || []).map(([id, dtstart, dtend, rrule]) => ({
    uid: `${id}@smarter.poker`,
    summary: id.includes('diamond')
      ? 'Diamond Arena Funded Games Not Open (Cancelled) | Smarter.Poker'
      : 'Retired Freeroll Slot (Cancelled) | Smarter.Poker',
    description: id.includes('diamond') ? DIAMOND_NOTE : RETIRED_NOTE,
    rrule,
    dtstart,
    dtend,
    status: 'CANCELLED',
    sequence: 2,
  }));
}
