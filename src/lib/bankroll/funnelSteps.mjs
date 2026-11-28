/**
 * THE STEPS AROUND THE FIRST BANKROLL ENTRY
 *
 * FunnelEvents.BANKROLL_FIRST_ENTRY says an account wrote its first ledger
 * row. On its own it cannot say whether anybody opened the Bankroll Manager
 * and left, set a starting bankroll and stopped, or came back for a second
 * session. These are the steps on either side of it:
 *
 *   bankroll_opened                 the page opened (once per browser session)
 *   bankroll_starting_bankroll_set  the starting bankroll was saved
 *   bankroll_second_session         the account's second gaming session exists
 *   bankroll_first_trip             the account's first trip exists
 *   bankroll_first_receipt_filed    the account's first receipt was filed
 *
 * "First" and "second" are read from the database (a head count of the
 * account's own rows, no row contents), not from the page's filtered lists,
 * so a time or venue filter cannot make an old account look new. A count is
 * only asked for while the answer could still be yes: once an account is
 * past a step, this session stops asking.
 *
 * No personal data goes into an event: no amounts, names, venues or ids. The
 * user is attached by identify() elsewhere, as for every other event.
 *
 * Analytics never breaks the action it measures. Every function here is
 * fire-and-forget and swallows its own failure; a count that cannot be read
 * records nothing rather than a guess.
 */

import { capture as defaultCapture, FunnelEvents } from '../analytics.js';
import { SESSION_CATEGORIES } from './ledgerMath.mjs';

export const OPENED_SESSION_KEY = 'sp_bankroll_opened';

// Accounts already past a step in this page session, so a long-time player
// does not pay a count query on every save.
const past = new Map();
const isPast = (step, userId) => past.get(step)?.has(userId) === true;
function markPast(step, userId) {
    if (!past.has(step)) past.set(step, new Set());
    past.get(step).add(userId);
}

/** For tests: forget which accounts are past which step. */
export function resetFunnelMemory() {
    past.clear();
}

function warn(error) {
    console.warn('[bankroll funnel] not recorded:', error?.message || error);
}

async function headCount(query) {
    const { count, error } = await query;
    if (error) throw error;
    if (!Number.isSafeInteger(count)) throw new Error('count unavailable');
    return count;
}

/**
 * The page opened. Once per browser session: a reload, a section change or a
 * return from another hub page in the same tab is the same visit.
 */
export function noteBankrollOpened({ storage, capture = defaultCapture, signedIn = false } = {}) {
    try {
        const store = storage === undefined ? (typeof sessionStorage === 'undefined' ? null : sessionStorage) : storage;
        if (store) {
            if (store.getItem(OPENED_SESSION_KEY)) return false;
            store.setItem(OPENED_SESSION_KEY, '1');
        }
        capture(FunnelEvents.BANKROLL_OPENED, { signed_in: Boolean(signedIn) });
        return true;
    } catch (error) {
        warn(error);
        return false;
    }
}

/** The starting bankroll was saved. The amount is not sent. */
export function noteStartingBankrollSet({ capture = defaultCapture } = {}) {
    try {
        capture(FunnelEvents.BANKROLL_STARTING_SET, {});
    } catch (error) {
        warn(error);
    }
}

/**
 * A ledger row was just created. When it is a gaming session and the account
 * now has exactly two, this is the second session.
 */
export async function noteSessionLogged(db, userId, entry, { capture = defaultCapture } = {}) {
    const step = FunnelEvents.BANKROLL_SECOND_SESSION;
    if (!db || !userId || !entry || !SESSION_CATEGORIES.includes(entry.category) || isPast(step, userId)) return false;
    try {
        const count = await headCount(db.from('bankroll_ledger')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_revision', false)
            // in-list: bounded by the five built-in session categories
            .in('category', SESSION_CATEGORIES));
        if (count >= 2) markPast(step, userId);
        if (count !== 2) return false;
        capture(step, { category: entry.category });
        return true;
    } catch (error) {
        warn(error);
        return false;
    }
}

/** A trip was just created. When it is the account's only trip, it is the first. */
export async function noteTripStarted(db, userId, { capture = defaultCapture, source = 'trip_tracker' } = {}) {
    const step = FunnelEvents.BANKROLL_FIRST_TRIP;
    if (!db || !userId || isPast(step, userId)) return false;
    try {
        const count = await headCount(db.from('bankroll_trips')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('trip_type', 'trip'));
        if (count >= 1) markPast(step, userId);
        if (count !== 1) return false;
        capture(step, { source: String(source) });
        return true;
    } catch (error) {
        warn(error);
        return false;
    }
}

/** A receipt was just filed. When it is the account's only filed receipt, it is the first. */
export async function noteReceiptFiled(db, userId, { capture = defaultCapture, kind = null } = {}) {
    const step = FunnelEvents.BANKROLL_FIRST_RECEIPT_FILED;
    if (!db || !userId || isPast(step, userId)) return false;
    try {
        const count = await headCount(db.from('bankroll_receipts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'assigned'));
        if (count >= 1) markPast(step, userId);
        if (count !== 1) return false;
        capture(step, kind ? { assigned_kind: String(kind) } : {});
        return true;
    } catch (error) {
        warn(error);
        return false;
    }
}
