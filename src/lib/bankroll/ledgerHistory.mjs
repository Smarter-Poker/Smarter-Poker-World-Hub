// Edit history and Recently Deleted for the bankroll ledger (2026-11-28).
//
// Every UPDATE and DELETE on bankroll_ledger writes a before/after image to
// bankroll_ledger_changes (trigger installed 2026-11-28, migration
// 20261128100400_bankroll_ledger_changes). A player can read and delete only
// their own rows; nobody but the trigger can write one. An INSERT writes no
// row, so a restored entry's history shows its delete and then whatever was
// changed after it came back.
//
// This module is pure: it turns history rows into what the screens show and
// decides what may be restored. The reads and writes live in
// LedgerEntryHistory.jsx and RecentlyDeleted.jsx.

import { formatCurrency } from './currencyUtils.js';
import { parseLedgerDay } from './localDates.mjs';
import { CATEGORY_NAMES } from './ledgerReport.mjs';
import { moneyIn, normaliseCurrency, rateText } from './entryCurrency.mjs';

export const HISTORY_PAGE_SIZE = 20;
export const DELETED_PAGE_SIZE = 50;
export const RECENTLY_DELETED_DAYS = 30;

/** Columns a person never typed: never shown as a change, never inserted on restore. */
export const GENERATED_COLUMNS = Object.freeze(['net_result']);
const HIDDEN_COLUMNS = new Set(['id', 'user_id', 'created_at', ...GENERATED_COLUMNS]);

/**
 * How each column is labelled and formatted. A column missing here is still
 * shown, under its own name, so a change is never silently hidden.
 * kind: usd (stored US dollars), original (typed, in entry_currency), rate,
 * day (calendar day), clock (typed wall clock), category, list, flag, int, text.
 */
export const HISTORY_FIELDS = Object.freeze({
    category: { label: 'Category', kind: 'category' },
    entry_date: { label: 'Date', kind: 'day' },
    start_time: { label: 'Start Time', kind: 'clock' },
    end_time: { label: 'End Time', kind: 'clock' },
    gross_in: { label: 'Buy-In', kind: 'usd' },
    gross_out: { label: 'Cash-Out', kind: 'usd' },
    entry_currency: { label: 'Currency', kind: 'currency' },
    fx_rate_to_usd: { label: 'Exchange Rate', kind: 'rate' },
    original_gross_in: { label: 'Buy-In As Typed', kind: 'original' },
    original_gross_out: { label: 'Cash-Out As Typed', kind: 'original' },
    location_id: { label: 'Venue', kind: 'ref' },
    trip_id: { label: 'Trip', kind: 'ref' },
    notes: { label: 'Notes', kind: 'text' },
    emotional_tag: { label: 'Mood', kind: 'text' },
    stakes: { label: 'Stakes', kind: 'text' },
    game_type: { label: 'Game', kind: 'text' },
    tournament_name: { label: 'Tournament', kind: 'text' },
    tournament_type: { label: 'Tournament Type', kind: 'text' },
    buy_in_amount: { label: 'Tournament Buy-In', kind: 'usd' },
    add_on_amount: { label: 'Add-On', kind: 'usd' },
    bounties_collected: { label: 'Bounties', kind: 'usd' },
    rake_amount: { label: 'Rake', kind: 'usd' },
    payout_amount: { label: 'Payout', kind: 'usd' },
    reentry_count: { label: 'Rebuys', kind: 'int' },
    addon_count: { label: 'Add-Ons', kind: 'int' },
    finish_position: { label: 'Finish', kind: 'int' },
    field_size: { label: 'Field Size', kind: 'int' },
    table_count: { label: 'Tables', kind: 'int' },
    buy_in_count: { label: 'Buy-Ins', kind: 'int' },
    parlay_legs: { label: 'Parlay Legs', kind: 'int' },
    casino_game: { label: 'Casino Game', kind: 'text' },
    slot_machine: { label: 'Slot Machine', kind: 'text' },
    sport: { label: 'Sport', kind: 'text' },
    bet_type: { label: 'Bet Type', kind: 'text' },
    odds: { label: 'Odds', kind: 'text' },
    bet_result: { label: 'Bet Result', kind: 'text' },
    expense_type: { label: 'Expense Type', kind: 'text' },
    expense_vendor: { label: 'Vendor', kind: 'text' },
    media_urls: { label: 'Photos', kind: 'list' },
    format_tags: { label: 'Format Tags', kind: 'list' },
    assistant_flagged: { label: 'Flagged', kind: 'flag' },
    external_ref: { label: 'Import Source', kind: 'text' },
});

const MONEY_KINDS = new Set(['usd', 'original', 'rate']);

function sameValue(kind, a, b) {
    const empty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty(a) && empty(b)) return true;
    if (empty(a) !== empty(b)) {
        // A currency of NULL and of 'USD' mean the same thing.
        if (kind === 'currency') return normaliseCurrency(a) === normaliseCurrency(b);
        return false;
    }
    if (MONEY_KINDS.has(kind) || kind === 'int') {
        const scale = kind === 'rate' ? 1e6 : 100;
        return Math.round(Number(a) * scale) === Math.round(Number(b) * scale);
    }
    if (kind === 'currency') return normaliseCurrency(a) === normaliseCurrency(b);
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return String(a) === String(b);
}

const prettyWords = (text) => String(text).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** "Nov 27, 2026" for a ledger day, read as the day the player recorded. */
export function dayLabel(day) {
    const d = parseLedgerDay(day);
    if (Number.isNaN(d.getTime())) return String(day || '');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * start_time / end_time are the typed wall clock stored as UTC, so they are
 * shown from the stored text, never shifted into the viewer's time zone.
 */
export function clockLabel(stamp) {
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(String(stamp || ''));
    if (!m) return String(stamp || '');
    let h = Number(m[2]);
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${dayLabel(m[1])}, ${h}:${m[3]} ${period}`;
}

/** When a change happened, in the viewer's own time zone. */
export function changedAtLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** One side of a change, as text. `row` is the row the value came from. */
export function formatHistoryValue(field, value, row = {}, { displayEUR = false } = {}) {
    const kind = (HISTORY_FIELDS[field] || {}).kind || 'text';
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        return kind === 'currency' ? 'USD' : 'None';
    }
    switch (kind) {
        case 'usd': return formatCurrency(Number(value), displayEUR, { cents: 'auto' });
        case 'original': return moneyIn(row.entry_currency, value);
        case 'rate': return `${rateText(value)} USD Per ${normaliseCurrency(row.entry_currency) || 'Unit'}`;
        case 'currency': return normaliseCurrency(value) || String(value);
        case 'day': return dayLabel(value);
        case 'clock': return clockLabel(value);
        case 'category': return CATEGORY_NAMES[value] || prettyWords(value);
        case 'list': return `${value.length} ${value.length === 1 ? 'Item' : 'Items'}`;
        case 'flag': return value ? 'Yes' : 'No';
        case 'ref': return 'Changed';
        case 'int': return String(value);
        default: return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
}

/**
 * Field-by-field differences between two ledger row images.
 * Returns [{ field, label, before, after }] with raw values, in HISTORY_FIELDS
 * order then any unknown column alphabetically.
 */
export function diffLedgerRows(oldRow, newRow) {
    const before = oldRow || {};
    const after = newRow || {};
    const known = Object.keys(HISTORY_FIELDS);
    const extra = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((k) => !HIDDEN_COLUMNS.has(k) && !HISTORY_FIELDS[k] && !['is_revision', 'original_entry_id', 'revision_reason', 'flag_reason'].includes(k))
        .sort();
    const changes = [];
    for (const field of [...known, ...extra]) {
        if (!(field in before) && !(field in after)) continue;
        const kind = (HISTORY_FIELDS[field] || {}).kind || 'text';
        if (sameValue(kind, before[field], after[field])) continue;
        changes.push({ field, label: (HISTORY_FIELDS[field] || {}).label || prettyWords(field), before: before[field], after: after[field] });
    }
    return changes;
}

/**
 * History rows (newest first) as the disclosure shows them. A DELETE row means
 * the entry was deleted and later restored (it is being viewed, so it exists).
 */
export function historyItems(rows, { displayEUR = false } = {}) {
    const items = [];
    for (const row of rows || []) {
        if (!row) continue;
        if (row.op === 'DELETE') {
            items.push({ id: row.id, op: 'DELETE', when: changedAtLabel(row.changed_at), changedAt: row.changed_at, changes: [] });
            continue;
        }
        const changes = diffLedgerRows(row.old_row, row.new_row).map((c) => ({
            field: c.field,
            label: c.label,
            before: formatHistoryValue(c.field, c.before, row.old_row || {}, { displayEUR }),
            after: formatHistoryValue(c.field, c.after, row.new_row || {}, { displayEUR }),
        }));
        // A change only in columns nobody sees (a recalculated revision flag)
        // is not shown as an empty "edited" line.
        if (changes.length === 0) continue;
        items.push({ id: row.id, op: 'UPDATE', when: changedAtLabel(row.changed_at), changedAt: row.changed_at, changes });
    }
    return items.sort((a, b) => (a.changedAt < b.changedAt ? 1 : a.changedAt > b.changedAt ? -1 : (b.id || 0) - (a.id || 0)));
}

/** ISO instant RECENTLY_DELETED_DAYS before now. */
export function deletedSince(now = new Date(), days = RECENTLY_DELETED_DAYS) {
    return new Date(now.getTime() - days * 86400000).toISOString();
}

/**
 * What Recently Deleted lists: the newest DELETE per entry, from the last
 * RECENTLY_DELETED_DAYS, whose entry is not in the ledger now (an entry that
 * was restored, by this screen or by the session lane's undo, is back in the
 * ledger and so is not offered again).
 * @param rows DELETE history rows, any order
 * @param existingIds ids of those entries that are in the ledger now
 */
export function recentlyDeleted(rows, existingIds = new Set(), { now = new Date(), days = RECENTLY_DELETED_DAYS } = {}) {
    const since = deletedSince(now, days);
    const newest = new Map();
    for (const row of rows || []) {
        if (!row || row.op !== 'DELETE' || !row.old_row || !row.entry_id) continue;
        if (!(row.changed_at >= since)) continue;
        const prev = newest.get(row.entry_id);
        if (!prev || row.changed_at > prev.changed_at || (row.changed_at === prev.changed_at && row.id > prev.id)) newest.set(row.entry_id, row);
    }
    const present = existingIds instanceof Set ? existingIds : new Set(existingIds || []);
    return [...newest.values()]
        .filter((row) => !present.has(row.entry_id))
        .sort((a, b) => (a.changed_at < b.changed_at ? 1 : a.changed_at > b.changed_at ? -1 : b.id - a.id));
}

/** Days left before a deleted entry drops off the list (0 on its last day). */
export function daysLeft(changedAt, now = new Date(), days = RECENTLY_DELETED_DAYS) {
    const end = new Date(changedAt).getTime() + days * 86400000;
    return Math.max(0, Math.floor((end - now.getTime()) / 86400000));
}

/**
 * The ledger row to insert for a restore: the deleted row exactly, with its
 * original id and created_at, less the generated net_result (the database
 * computes it and refuses a value for it).
 */
export function restorableRow(oldRow) {
    if (!oldRow || typeof oldRow !== 'object' || !oldRow.id || !oldRow.user_id || !oldRow.category) {
        throw new Error('This Deleted Entry Is Incomplete And Cannot Be Restored');
    }
    const row = { ...oldRow };
    for (const column of GENERATED_COLUMNS) delete row[column];
    return row;
}

/**
 * Why a restore cannot go ahead, or null. A second restore of the same row is
 * refused here (the entry is back in the ledger) and again by the database
 * (the original id is the primary key, so a concurrent second insert fails
 * with 23505).
 */
export function restoreProblem(row, { entryExists = false, userId = null } = {}) {
    if (!row || row.op !== 'DELETE' || !row.old_row) return 'This Is Not A Deleted Entry';
    if (userId && row.user_id && row.user_id !== userId) return 'This Entry Belongs To Another Account';
    if (entryExists) return 'This Entry Is Already Back In Your Ledger';
    return null;
}

/** How a failed restore insert is explained. */
export function restoreFailureText(error) {
    if (error && error.code === '23505') {
        const text = `${error.message || ''} ${error.details || ''}`;
        if (/external_ref/.test(text)) return 'This Session Was Imported Again After It Was Deleted. Restoring It Would Log It Twice.';
        return 'This Entry Is Already Back In Your Ledger';
    }
    if (error && error.code === '23503') return 'The Trip Or Venue This Entry Belonged To Was Deleted, So It Cannot Be Restored As It Was.';
    return 'Could Not Restore That Entry. Try Again.';
}

/** The one-line summary a deleted entry is listed with. */
export function deletedSummary(oldRow) {
    const row = oldRow || {};
    const name = CATEGORY_NAMES[row.category] || prettyWords(row.category || 'Entry');
    const detail = row.category === 'expense'
        ? (row.expense_type ? prettyWords(row.expense_type) : '')
        : row.tournament_name || row.stakes || row.casino_game || row.slot_machine || row.sport || '';
    return { name, detail, day: row.entry_date ? dayLabel(row.entry_date) : '' };
}
