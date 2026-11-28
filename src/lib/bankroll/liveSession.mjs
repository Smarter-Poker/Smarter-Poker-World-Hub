// A live session clock: the player taps Start Session at the table, adds
// rebuys and add-ons as they happen, and taps End Session with the cash-out.
// Ending opens the normal Log form prefilled from this record, so the save goes
// through exactly the same path, gates and rule checks as any other log.
//
// The running record lives only on this device, in localStorage under a key
// namespaced by the signed-in user's id, and the record itself names that user
// too. A record read under the wrong key, or naming anyone else, is never
// shown. Nothing about a running session is written to the server until the
// player saves the log.
//
// Bankroll Rules are checked while it runs by building the row the session
// WOULD save (worst case: no cash-out yet) and handing it to the same
// evaluateRuleViolations the page runs after every save. No rule math is
// repeated here.

import { evaluateRuleViolations } from './ruleViolations.mjs';
import { centsToDollars, entryCents, formatCents, toCents } from './ledgerMath.mjs';
import { localDay } from './localDates.mjs';

const VERSION = 1;
export const TIME_WARNING_LEAD_MS = 15 * 60 * 1000;

/** The categories a live session can be. An expense is not played. */
export const LIVE_SESSION_CATEGORIES = Object.freeze([
  { id: 'poker_cash', label: 'Cash Game', detailLabel: 'Stakes', placeholder: '1/3 NLH' },
  { id: 'poker_mtt', label: 'Tournament', detailLabel: 'Tournament', placeholder: 'Daily Deepstack' },
  { id: 'casino_table', label: 'Table Games', detailLabel: 'Game', placeholder: 'Blackjack' },
  { id: 'slots', label: 'Slots', detailLabel: 'Machine', placeholder: 'Machine Name' },
  { id: 'sports', label: 'Sports Betting', detailLabel: 'Sport Or Event', placeholder: 'NFL Sunday' },
]);

const CATEGORY_IDS = LIVE_SESSION_CATEGORIES.map((c) => c.id);
const KINDS = ['buy_in', 'rebuy', 'add_on'];
const KIND_LABEL = { buy_in: 'Buy-In', rebuy: 'Rebuy', add_on: 'Add On' };

export function liveSessionKey(userId) {
  return userId ? `bankroll:live-session:v${VERSION}:${userId}` : null;
}

const isCents = (n) => Number.isInteger(n) && n >= 0;

function validBuyIn(item) {
  return item && KINDS.includes(item.kind) && isCents(item.cents) && Number.isFinite(item.at);
}

/** A stored record, if and only if it is a well-formed session of this user. */
export function parseLiveSession(raw, userId) {
  if (!raw || !userId) return null;
  let s;
  try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return null; }
  if (!s || typeof s !== 'object' || s.v !== VERSION) return null;
  if (s.userId !== userId) return null;
  if (!CATEGORY_IDS.includes(s.category) || !Number.isFinite(s.startedAt)) return null;
  if (!Array.isArray(s.buyIns) || s.buyIns.length === 0 || !s.buyIns.every(validBuyIn)) return null;
  if (s.ended && !(Number.isFinite(s.ended.at) && isCents(s.ended.cashOutCents))) return null;
  return {
    ...s,
    detail: typeof s.detail === 'string' ? s.detail : '',
    venue: s.venue && typeof s.venue === 'object' ? s.venue : {},
    alerts: s.alerts && typeof s.alerts === 'object' ? s.alerts : {},
    ended: s.ended || null,
  };
}

export function readLiveSession(storage, userId) {
  const key = liveSessionKey(userId);
  if (!storage || !key) return null;
  try { return parseLiveSession(storage.getItem(key), userId); } catch (_) { return null; }
}

/** Write (or with null, remove) this user's running session. False if storage refused. */
export function writeLiveSession(storage, userId, session) {
  const key = liveSessionKey(userId);
  if (!storage || !key) return false;
  try {
    if (!session) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(session));
    return true;
  } catch (_) {
    return false;
  }
}

/** Window event fired whenever this device's running session changes. */
export const LIVE_SESSION_EVENT = 'bankroll-live-session';

/**
 * The log for this session was saved: the clock is done. Only the session
 * that was logged is cleared, never one started since in another tab.
 */
export function finishLiveSession(storage, userId, sessionId) {
  const current = readLiveSession(storage, userId);
  const cleared = Boolean(current && current.id === sessionId);
  if (cleared) writeLiveSession(storage, userId, null);
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent(LIVE_SESSION_EVENT));
  return cleared;
}

export function startLiveSession({ userId, id, category, detail = '', venue = {}, tripId = null, buyInCents, now }) {
  if (!userId) throw new Error('Sign In To Start A Session');
  if (!CATEGORY_IDS.includes(category)) throw new Error('Choose A Category');
  if (!isCents(buyInCents)) throw new Error('Enter A Buy-In Of $0 Or More');
  if (category !== 'poker_mtt' && buyInCents === 0) throw new Error('Enter The Buy-In');
  return {
    v: VERSION,
    id: String(id || now),
    userId,
    category,
    detail: String(detail || '').trim().slice(0, 120),
    venue: venue || {},
    tripId: tripId || null,
    startedAt: now,
    buyIns: [{ kind: 'buy_in', cents: buyInCents, at: now }],
    ended: null,
    alerts: {},
  };
}

/**
 * The amount a top-up adds. A tournament rebuy is one more buy-in at the
 * starting price, because that is how the Log form stores it (entries x
 * buy-in); any other top-up is the amount the player typed.
 */
export function topUpCents(session, kind, cents) {
  if (session.category === 'poker_mtt' && kind === 'rebuy') return session.buyIns[0].cents;
  return cents;
}

export function addTopUp(session, { kind, cents, now }) {
  if (!session || session.ended) throw new Error('This Session Has Ended');
  if (kind !== 'rebuy' && kind !== 'add_on') throw new Error('Unknown Top-Up');
  const amount = topUpCents(session, kind, cents);
  if (!isCents(amount) || amount === 0) throw new Error('Enter The Amount');
  return { ...session, buyIns: [...session.buyIns, { kind, cents: amount, at: now }] };
}

export function investedCents(session) {
  return (session?.buyIns || []).reduce((sum, b) => sum + b.cents, 0);
}

export function elapsedMs(session, now) {
  if (!session) return 0;
  const end = session.ended ? session.ended.at : now;
  return Math.max(0, end - session.startedAt);
}

export function formatElapsed(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function endLiveSession(session, { cashOutCents, now }) {
  if (!session) throw new Error('No Session Is Running');
  if (!isCents(cashOutCents)) throw new Error('Enter A Cash-Out Of $0 Or More');
  return { ...session, ended: { at: Math.max(now, session.startedAt), cashOutCents } };
}

/** Back to running after "End Session" was cancelled before the log was saved. */
export function resumeLiveSession(session) {
  return session ? { ...session, ended: null } : session;
}

export function markAlerts(session, keys) {
  if (!keys.length) return session;
  const alerts = { ...session.alerts };
  for (const k of keys) alerts[k] = true;
  return { ...session, alerts };
}

/** A wall-clock time as the Log form types it: { time: '9:05', period: 'PM' }. */
export function clock12(ms) {
  const d = new Date(ms);
  let h = d.getHours();
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { time: `${h}:${String(d.getMinutes()).padStart(2, '0')}`, period };
}

function clockLabel(ms) {
  const c = clock12(ms);
  return `${c.time} ${c.period}`;
}

/** One line per buy-in, with its time, for the saved entry's notes. */
export function buyInLog(session) {
  return session.buyIns.map((b) => `${KIND_LABEL[b.kind]} ${formatCents(b.cents)} at ${clockLabel(b.at)}`).join('; ');
}

/**
 * The Log form's fields for an ended session. Amounts are USD dollars as
 * strings, the way the form holds them. The entry is dated the local day the
 * session started; an end time earlier than the start is the next morning,
 * which the form already stores as such (sessionEndStamp).
 */
export function toLogPrefill(session) {
  if (!session || !session.ended) throw new Error('End The Session First');
  const start = clock12(session.startedAt);
  const end = clock12(session.ended.at);
  const totalCents = investedCents(session);
  const hours = elapsedMs(session, session.ended.at) / 3600000;
  const notes = [`Live Session: ${buyInLog(session)}`];
  if (hours >= 24) notes.push(`Played ${Math.floor(hours)} hrs ${Math.round((hours % 1) * 60)} min`);
  const detail = session.detail || '';
  const venue = session.venue || {};
  const fields = {
    entry_date: localDay(new Date(session.startedAt)),
    start_time_text: start.time,
    start_period: start.period,
    end_time_text: end.time,
    end_period: end.period,
    gross_in: String(centsToDollars(totalCents)),
    gross_out: String(centsToDollars(session.ended.cashOutCents)),
    location_id: venue.location_id || '',
    location_name: venue.location_name || '',
    venue_type: venue.venue_type || 'casino',
    poker_venue_id: venue.poker_venue_id ?? null,
    venue_lat: venue.venue_lat ?? null,
    venue_lng: venue.venue_lng ?? null,
    trip_id: session.tripId || '',
  };
  if (session.category === 'poker_cash') {
    fields.stakes = detail;
  } else if (session.category === 'poker_mtt') {
    const first = session.buyIns[0].cents;
    const rebuys = session.buyIns.filter((b) => b.kind === 'rebuy').length;
    const addOnCents = session.buyIns.filter((b) => b.kind === 'add_on').reduce((s, b) => s + b.cents, 0);
    fields.tournament_name = detail;
    fields.buy_in_amount = String(centsToDollars(first));
    fields.reentry_count = String(rebuys);
    fields.add_on_amount = addOnCents > 0 ? String(centsToDollars(addOnCents)) : '';
  } else if (session.category === 'slots') {
    fields.slot_machine = detail;
  } else if (detail) {
    notes.push(`Game: ${detail}`);
  }
  fields.notes = notes.join('\n');
  return { category: session.category, sessionId: session.id, fields };
}

const ms = (t) => new Date(t).toISOString();

/**
 * The ledger row this session would save if it ended at `now` with nothing
 * cashed out, plus `extraCents` more invested. This is what the rules judge.
 */
export function projectedEntry(session, { now, extraCents = 0 }) {
  return {
    id: 'live-session-' + session.id,
    category: session.category,
    entry_date: localDay(new Date(session.startedAt)),
    gross_in: centsToDollars(investedCents(session) + extraCents),
    gross_out: 0,
    start_time: ms(session.startedAt),
    end_time: ms(Math.max(now, session.startedAt + 1)),
  };
}

/**
 * Warnings for putting `addCents` more into the session: Daily Stop-Loss
 * (today's saved sessions plus this one, if it all went) and Max Buy-In %
 * (the total in, against the roll the player sat down with). `balanceCents`
 * is the saved bankroll before this session; when it is unknown the Max
 * Buy-In check is skipped rather than judged against zero.
 */
export function topUpWarnings({ rules, session, addCents, now, todayEntries, balanceCents }) {
  const entry = projectedEntry(session, { now, extraCents: addCents });
  const known = Number.isFinite(balanceCents);
  const violations = evaluateRuleViolations({
    rules,
    entry,
    monthEntries: todayEntries || [],
    bankrollCents: known ? balanceCents + entryCents(entry) : 0,
  });
  return violations.filter((v) => v.rule === 'Daily Stop-Loss' || (known && v.rule === 'Max Buy-In %'));
}

/** The same checks for the first buy-in, before the session exists. */
export function startWarnings({ rules, userId, category, buyInCents, now, todayEntries, balanceCents }) {
  const probe = { v: VERSION, id: 'probe', userId, category, startedAt: now, buyIns: [{ kind: 'buy_in', cents: 0, at: now }], ended: null, alerts: {} };
  return topUpWarnings({ rules, session: probe, addCents: buyInCents, now, todayEntries, balanceCents });
}

function overTimeLimit(rules, session, at) {
  const v = evaluateRuleViolations({ rules, entry: projectedEntry(session, { now: at }), monthEntries: [], bankrollCents: 0 });
  return v.find((x) => x.rule === 'Session Time Limit') || null;
}

/**
 * Session Time Limit alerts due at `now` that have not been shown yet:
 * 'time-soon' once, 15 minutes before the limit, and 'time-limit' at it.
 * A limit of 15 minutes or less gets no early warning. Returns the alerts to
 * show and the keys to mark as shown (both, when the limit has already passed).
 */
export function dueTimeAlerts({ rules, session, now }) {
  if (!session || session.ended) return { alerts: [], keys: [] };
  const sent = session.alerts || {};
  const over = overTimeLimit(rules, session, now);
  if (over) {
    if (sent['time-limit']) return { alerts: [], keys: [] };
    return {
      alerts: [{ key: 'time-limit', title: 'Session Time Limit Reached', message: `You Have Played ${over.actual}. Your Limit Is ${over.limit}.` }],
      keys: ['time-limit', 'time-soon'],
    };
  }
  if (sent['time-soon']) return { alerts: [], keys: [] };
  const soon = overTimeLimit(rules, session, now + TIME_WARNING_LEAD_MS);
  if (!soon) return { alerts: [], keys: [] };
  // A limit shorter than the lead would warn the moment the session starts.
  if (overTimeLimit(rules, session, session.startedAt + TIME_WARNING_LEAD_MS)) return { alerts: [], keys: ['time-soon'] };
  return {
    alerts: [{ key: 'time-soon', title: '15 Minutes Left', message: `Your Session Time Limit Is ${soon.limit}.` }],
    keys: ['time-soon'],
  };
}

/** Plain-text warning lines for a list of rule violations (USD figures). */
export function warningText(violation) {
  if (violation.rule === 'Daily Stop-Loss') return `Daily Stop-Loss ${violation.limit}: Today Would Be ${violation.actual} If This Is Lost (USD).`;
  if (violation.rule === 'Max Buy-In %') return `Max Buy-In ${violation.limit} Of Bankroll: This Would Be ${violation.actual}.`;
  return `${violation.rule}: ${violation.actual} (Limit ${violation.limit}).`;
}

export { toCents };
