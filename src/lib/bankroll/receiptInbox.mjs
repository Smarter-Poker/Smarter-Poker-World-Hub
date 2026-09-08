/**
 * A SCANNED RECEIPT IS NEVER ABANDONED
 *
 * Dan, 2026-09-08, with two screenshots of a W-2G sitting under "Create New
 * Expense" and "Attach To Existing Entry":
 *
 *   1. Once it recognises a W-2G it should suggest adding it to the Vault, for
 *      end of year accounting.
 *   2. A buy-in should be added to a Trip. If no trip is active, start one. It
 *      can never not be assigned to anything.
 *   3. An expense goes to the Expenses list.
 *   4. It must always at least be SAVED and assigned somewhere later. It can
 *      never just be left or abandoned.
 *
 * Before this module the "Receipt Saved" sheet offered the same two buttons
 * for every document, and closing it kept nothing but an orphaned object in
 * storage. This is the whole decision, pure, so every rule above is a test.
 *
 * Wiring: pages/hub/bankroll-manager.js writes a `bankroll_receipts` row the
 * moment a scan completes (rule 4), offers `receiptActions()` (rules 1-3),
 * starts a trip from `tripFromReceipt()` when a buy-in has none (rule 2), and
 * files a W-2G with `w2gRowFromReceipt()` (rule 1). Anything left unassigned
 * is listed on the dashboard until it is.
 */

import { DESTINATIONS } from './receiptRouting.mjs';

/** What a receipt row can be attached to. */
export const RECEIPT_TARGETS = {
    LEDGER_ENTRY: 'ledger_entry',  // a bankroll_ledger row: session or expense
    W2G_FORM: 'w2g_form',          // a w2g_forms row: the W-2G Document Vault
};

/** Every action the sheet can offer. The page maps each id to a handler. */
export const RECEIPT_ACTIONS = {
    LOG_SESSION: 'log_session',    // buy-in or cash out: a SESSION on a trip
    NEW_EXPENSE: 'new_expense',    // the Expenses list
    FILE_W2G: 'file_w2g',          // the W-2G Document Vault in Tax Reports
    ATTACH: 'attach',              // an existing session or expense
    SAVE_LATER: 'save_later',      // keep it in Receipts Waiting, assign later
    CLOSE_SESSION: 'close_session', // a cash out lands on the open session it ends
};

/**
 * The ordered choices for one receipt. The first is the suggestion; the last
 * is always "keep it", because a scan may never be dropped (rule 4).
 *
 * @param {object} route      what routeScan() returned
 * @param {object} [context]
 * @param {object|null} [context.activeTrip]  the user's active trip, if any
 * @returns {{id:string, tone:string, title:string, detail:string, primary:boolean}[]}
 */
export function receiptActions(route, context = {}) {
    const destination = route && route.destination;
    const prefill = (route && route.prefill) || {};
    const activeTrip = context.activeTrip || null;
    const venue = prefill.location_name || prefill.vendor || '';

    const attach = {
        id: RECEIPT_ACTIONS.ATTACH,
        tone: 'ATTACH',
        title: 'Attach To Existing Entry',
        detail: 'Add This Receipt To A Recent Session Or Expense',
        primary: false,
    };
    const later = {
        id: RECEIPT_ACTIONS.SAVE_LATER,
        tone: 'LATER',
        title: 'Keep It, Assign Later',
        detail: 'It Stays In Receipts Waiting Until You File It',
        primary: false,
    };
    const expense = (primary) => ({
        id: RECEIPT_ACTIONS.NEW_EXPENSE,
        tone: 'EXPENSE',
        title: 'Add To Expenses',
        detail: 'Log This On Your Expenses List',
        primary,
    });
    const session = (primary, kind) => ({
        id: RECEIPT_ACTIONS.LOG_SESSION,
        tone: 'TRIP',
        title: activeTrip
            ? `Add To Trip: ${activeTrip.name}`
            : `Start A Trip${venue ? ` At ${venue}` : ''}`,
        detail: activeTrip
            ? `Log This ${kind} As A Session On Your Active Trip`
            : `No Trip Is Active. One Will Be Started And This ${kind} Logged On It`,
        primary,
    });
    const w2g = (primary) => ({
        id: RECEIPT_ACTIONS.FILE_W2G,
        tone: 'VAULT',
        title: 'Add To W-2G Vault',
        detail: 'Keep It In Tax Reports For End Of Year Accounting',
        primary,
    });

    if (destination === DESTINATIONS.TAX) {
        // Rule 1. A W-2G is a tax record, not a cost and not a session.
        return [w2g(true), attach, later];
    }

    if (destination === DESTINATIONS.SESSION) {
        // Rule 2. A buy-in is a session on a trip. It is never an expense.
        const kind = prefill.entryKind === 'cashout' ? 'Cash Out' : 'Buy-In';
        const open = context.openSession || null;
        if (prefill.entryKind === 'cashout' && open) {
            // The session this ticket ends is already logged: finish it.
            const closeIt = {
                id: RECEIPT_ACTIONS.CLOSE_SESSION,
                tone: 'CLOSE',
                title: `Close Session: ${open.location_name || 'Poker'} ${String(open.entry_date || '').slice(0, 10)}`,
                detail: 'Record This Cash Out On The Session That Is Still Open',
                primary: true,
            };
            return [closeIt, session(false, kind), attach, later];
        }
        return [session(true, kind), attach, later];
    }

    if (destination === DESTINATIONS.EXPENSE) {
        // Rule 3.
        return [expense(true), attach, later];
    }

    // Not confident, a paystub, or nothing readable: offer everything, and
    // still never a way to lose it.
    return [session(false, 'Buy-In'), expense(false), w2g(false), attach, later];
}

/**
 * Rule 2: the trip to start when a buy-in arrives and none is active.
 *
 * @param {object} route  what routeScan() returned for a SESSION document
 * @param {string} [today] ISO date, injectable for tests
 * @returns {{name:string, start_date:string, purpose:string, notes:string}}
 */
export function tripFromReceipt(route, today = isoToday()) {
    const prefill = (route && route.prefill) || {};
    const venue = String(prefill.location_name || prefill.vendor || '').trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(prefill.date || '')) && prefill.date <= today
        ? prefill.date
        : today;
    const name = venue ? `${venue} Trip` : `Poker Trip ${date}`;
    return {
        name: name.slice(0, 80),
        start_date: date,
        purpose: 'poker',
        notes: `Started Automatically From A Scanned ${prefill.entryKind === 'tournament' ? 'Tournament Buy-In' : 'Buy-In'}`,
    };
}

/**
 * Rule 1: the W-2G Document Vault row for a scanned W-2G.
 *
 * The vault is `w2g_forms`, which holds ONE withholding column. Federal and
 * state are summed into it; the split survives in the receipt row's prefill.
 *
 * @returns {object} an insert payload for w2g_forms
 */
export function w2gRowFromReceipt(userId, route, imageUrl, today = isoToday()) {
    const prefill = (route && route.prefill) || {};
    const federal = toNumber(prefill.federal_withheld);
    const state = toNumber(prefill.state_withheld);
    const withheld = federal === null && state === null ? null : (federal || 0) + (state || 0);
    const yearFromDate = /^\d{4}/.test(String(prefill.date || '')) ? Number(String(prefill.date).slice(0, 4)) : null;
    const taxYear = toNumber(prefill.tax_year) || yearFromDate || Number(today.slice(0, 4));

    return {
        user_id: userId,
        tax_year: taxYear,
        form_type: 'poker',
        source_description: String(prefill.source_description || prefill.vendor || '').slice(0, 200) || null,
        gross_amount: toNumber(prefill.gross_amount ?? prefill.amount),
        withholding_amount: withheld,
        file_url: imageUrl,
        file_name: fileNameFromUrl(imageUrl),
        upload_date: today,
    };
}

/**
 * The bankroll_ledger category a routed session opens LogEntryModal with.
 *
 * `bankroll_ledger_category_check` allows poker_cash, poker_mtt, casino_table,
 * slots, sports, expense, deposit and withdrawal. The sheet used to open the
 * modal with 'session', which is not one of them: the generic form rendered,
 * the tournament fields were never saved, and the insert was refused with
 * 23514 "Failed To Log Entry". Every scanned buy-in failed to save.
 *
 * @returns {'poker_mtt'|'poker_cash'|null} null means "let the user pick"
 */
export function ledgerCategoryFor(route) {
    const prefill = (route && route.prefill) || {};
    switch (prefill.entryKind) {
        case 'tournament': return 'poker_mtt';
        case 'cash': return 'poker_cash';
        case 'cashout': return prefill.finish_position !== null && prefill.finish_position !== undefined ? 'poker_mtt' : 'poker_cash';
        default: return null;
    }
}

/** Case- and punctuation-insensitive key for a venue name. */
function venueKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * The user's saved location that matches a venue the receipt printed, so an
 * auto-started trip carries the venue (and its GPS, which venue analytics
 * keys on) instead of a bare name.
 *
 * @param {{id:string,name:string}[]} locations
 * @returns {object|null}
 */
export function matchLocationByName(locations, name) {
    const key = venueKey(name);
    if (!key || !Array.isArray(locations)) return null;
    const exact = locations.find((l) => venueKey(l && l.name) === key);
    if (exact) return exact;
    // "Bellagio Poker Room" printed, "Bellagio" saved: the longer contains the shorter.
    return locations.find((l) => {
        const k = venueKey(l && l.name);
        return k.length >= 4 && (key.includes(k) || k.includes(key));
    }) || null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
function daysBetween(a, b) {
    const ta = Date.parse(String(a || '').slice(0, 10) + 'T12:00:00');
    const tb = Date.parse(String(b || '').slice(0, 10) + 'T12:00:00');
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
    return Math.abs(ta - tb) / DAY_MS;
}

function isPokerSession(entry) {
    return entry && (entry.category === 'poker_cash' || entry.category === 'poker_mtt');
}

/**
 * A cash-out ticket ends a session that is already logged. Find it: a poker
 * session at the same venue (when the ticket names one) within two days
 * with no cash-out recorded yet. Two scans become one complete session with
 * a real result, instead of a buy-in and a separate unexplained credit.
 *
 * @returns {object|null} the ledger entry to close
 */
export function findOpenSessionFor(route, entries) {
    if (!route || route.destination !== DESTINATIONS.SESSION) return null;
    const prefill = route.prefill || {};
    if (prefill.entryKind !== 'cashout') return null;
    const venue = venueKey(prefill.location_name || prefill.vendor);
    const candidates = (Array.isArray(entries) ? entries : []).filter((e) => {
        if (!isPokerSession(e)) return false;
        if (Number(e.gross_out) > 0) return false;
        const gap = daysBetween(e.entry_date, prefill.date);
        if (prefill.date && (gap === null || gap > 2)) return false;
        if (venue && e.location_name && venueKey(e.location_name) !== venue) return false;
        return true;
    });
    candidates.sort((a, b) => (daysBetween(a.entry_date, prefill.date) ?? 99) - (daysBetween(b.entry_date, prefill.date) ?? 99));
    return candidates[0] || null;
}

/**
 * Order existing entries for "Attach To Existing Entry" so the right one is
 * first: same day and same venue outrank recency. Stable for ties.
 */
export function rankEntriesForReceipt(entries, route) {
    const prefill = (route && route.prefill) || {};
    const venue = venueKey(prefill.location_name || prefill.vendor);
    const score = (e) => {
        let s = 0;
        const gap = daysBetween(e.entry_date, prefill.date);
        if (prefill.date && gap !== null) { if (gap === 0) s += 4; else if (gap <= 1) s += 2; }
        if (venue && venueKey(e.location_name) === venue) s += 3;
        if (route && route.destination === DESTINATIONS.EXPENSE && e.category === 'expense') s += 1;
        if (route && route.destination === DESTINATIONS.SESSION && isPokerSession(e)) s += 1;
        return s;
    };
    return (Array.isArray(entries) ? entries : [])
        .map((e, i) => ({ e, i, s: score(e) }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map((x) => x.e);
}

/** The `bankroll_receipts` row written the moment a scan completes (rule 4). */
export function receiptRowFromScan(userId, { imageUrl, extracted, route, documentType }) {
    return {
        user_id: userId,
        image_url: imageUrl,
        document_type: documentType || (route && route.documentType) || 'unknown',
        destination: (route && route.destination) || DESTINATIONS.MANUAL,
        summary: (route && route.summary) || null,
        route: route ? { destination: route.destination, label: route.label, summary: route.summary, prefill: route.prefill || {} } : null,
        extracted: extracted || null,
        status: 'unassigned',
    };
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
}

function fileNameFromUrl(url) {
    try {
        const last = String(url || '').split('?')[0].split('/').pop();
        return last || null;
    } catch (_e) {
        return null;
    }
}

function isoToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
