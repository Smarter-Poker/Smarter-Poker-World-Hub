/**
 * A SCANNED RECEIPT IS NEVER ABANDONED (Dan, 2026-09-08)
 *
 * With two screenshots of a W-2G (Four Winds, $2,140.00) offered nothing but
 * "Create New Expense" and "Attach To Existing Entry":
 *
 *   1. A recognised W-2G suggests the Vault, for end of year accounting.
 *   2. A buy-in goes on a Trip; if none is active, start one. It can never
 *      not be assigned to anything.
 *   3. An expense goes to the Expenses list.
 *   4. Every scan is at least SAVED and assignable later. Never left behind.
 *
 * The decision is pure (receiptInbox.mjs) and tested directly. The wiring
 * that makes it real is pinned by reading the source with comments stripped,
 * because a test that greps a comment passes for the wrong reason.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    receiptActions, tripFromReceipt, w2gRowFromReceipt, receiptRowFromScan, ledgerCategoryFor,
    RECEIPT_ACTIONS, RECEIPT_TARGETS,
} from '../src/lib/bankroll/receiptInbox.mjs';
import { routeScan, normaliseScan } from '../src/lib/bankroll/receiptRouting.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const PAGE = 'pages/hub/bankroll-manager.js';
const LOG_MODAL = 'src/components/bankroll/LogEntryModal.jsx';
const DEALER_VAULT = 'src/components/bankroll/DealerVault.jsx';
const TAX_PANEL = 'src/components/bankroll/TaxReportPanel.jsx';
const STORAGE = 'src/lib/bankroll/receiptStorage.js';
const MIGRATION = 'supabase/migrations/20260908210816_bankroll_receipts_are_never_abandoned.sql';

/** The W-2G in Dan's screenshot, as the model reads it. */
const W2G = routeScan(normaliseScan({
    document_type: 'w2g', confidence: 96,
    vendor: 'Pokagon Gaming Authority Dba Four Winds Casino Resort',
    date: '2026-08-01', gross_winnings: 2140, federal_withheld: 0, state_withheld: null, tax_year: 2026,
}));
const BUY_IN = routeScan(normaliseScan({
    document_type: 'tournament_buyin', confidence: 95, vendor: 'BELLAGIO POKER ROOM',
    date: '2026-03-15', buy_in: 300, fee: 40, tournament_name: 'Event #12',
}));
const EXPENSE = routeScan(normaliseScan({
    document_type: 'expense', confidence: 90, vendor: 'Uber', date: '2026-03-15', amount: 32.5, category: 'transport',
}));
const UNSURE = routeScan(normaliseScan({ document_type: 'unknown', confidence: 20 }));

const ids = (actions) => actions.map((a) => a.id);

// ---------------------------------------------------------------------------
// RULES 1 TO 3: WHAT IS SUGGESTED
// ---------------------------------------------------------------------------

test('rule 1: a W-2G is offered the vault first, never an expense', () => {
    const actions = receiptActions(W2G);
    assert.equal(actions[0].id, RECEIPT_ACTIONS.FILE_W2G);
    assert.equal(actions[0].primary, true);
    assert.match(actions[0].title, /W-2G Vault/);
    assert.match(actions[0].detail, /End Of Year/);
    assert.ok(!ids(actions).includes(RECEIPT_ACTIONS.NEW_EXPENSE), 'a tax form is not a cost');
});

test('rule 2: a buy-in with an active trip is added to that trip', () => {
    const actions = receiptActions(BUY_IN, { activeTrip: { id: 't1', name: 'Vegas Spring' } });
    assert.equal(actions[0].id, RECEIPT_ACTIONS.LOG_SESSION);
    assert.equal(actions[0].title, 'Add To Trip: Vegas Spring');
    assert.ok(!ids(actions).includes(RECEIPT_ACTIONS.NEW_EXPENSE), 'a buy-in is a session, never an expense');
});

test('rule 2: a buy-in with no active trip starts one at the venue', () => {
    const actions = receiptActions(BUY_IN, { activeTrip: null });
    assert.equal(actions[0].id, RECEIPT_ACTIONS.LOG_SESSION);
    assert.equal(actions[0].title, 'Start A Trip At BELLAGIO POKER ROOM');
    assert.match(actions[0].detail, /No Trip Is Active/);

    const trip = tripFromReceipt(BUY_IN, '2026-09-08');
    assert.equal(trip.name, 'BELLAGIO POKER ROOM Trip');
    assert.equal(trip.start_date, '2026-03-15', 'the trip starts when the play happened');
    assert.match(trip.notes, /Tournament Buy-In/);
});

test('rule 2: a receipt dated in the future does not start a trip in the future', () => {
    const route = { ...BUY_IN, prefill: { ...BUY_IN.prefill, date: '2031-01-01' } };
    assert.equal(tripFromReceipt(route, '2026-09-08').start_date, '2026-09-08');
    const nameless = { destination: 'session', prefill: {} };
    assert.equal(tripFromReceipt(nameless, '2026-09-08').name, 'Poker Trip 2026-09-08');
});

test('rule 3: an expense goes to the Expenses list first', () => {
    const actions = receiptActions(EXPENSE);
    assert.equal(actions[0].id, RECEIPT_ACTIONS.NEW_EXPENSE);
    assert.equal(actions[0].title, 'Add To Expenses');
});

test('an unreadable receipt is offered every destination, and still a way to keep it', () => {
    const actions = receiptActions(UNSURE);
    assert.deepEqual(ids(actions), [
        RECEIPT_ACTIONS.LOG_SESSION, RECEIPT_ACTIONS.NEW_EXPENSE, RECEIPT_ACTIONS.FILE_W2G,
        RECEIPT_ACTIONS.ATTACH, RECEIPT_ACTIONS.SAVE_LATER,
    ]);
    assert.ok(actions.every((a) => !a.primary), 'no guess is pushed when we are not confident');
});

test('rule 4: every list ends with keeping the receipt, and never with nothing', () => {
    for (const route of [W2G, BUY_IN, EXPENSE, UNSURE, null, undefined]) {
        const actions = receiptActions(route);
        assert.ok(actions.length >= 3, 'there is always a choice');
        assert.equal(actions[actions.length - 1].id, RECEIPT_ACTIONS.SAVE_LATER);
        assert.ok(ids(actions).includes(RECEIPT_ACTIONS.ATTACH));
        assert.equal(actions.filter((a) => a.primary).length <= 1, true, 'at most one suggestion');
        for (const a of actions) {
            assert.ok(a.title && a.detail && a.tone, `${a.id} has copy`);
            assert.doesNotMatch(a.title + a.detail, /—/, 'no em dashes in UI copy');
        }
    }
});

// ---------------------------------------------------------------------------
// WHAT GETS WRITTEN
// ---------------------------------------------------------------------------

test('the W-2G vault row matches the w2g_forms columns and sums the withholding', () => {
    const row = w2gRowFromReceipt('user-1', W2G, 'https://x.supabase.co/storage/v1/object/public/user-media/user-1/bankroll/1.jpg', '2026-09-08');
    // The split columns arrived with migration 20260908232953; the total
    // stays, because every existing reader adds federal and state up.
    assert.deepEqual(Object.keys(row).sort(), [
        'federal_withheld', 'file_name', 'file_url', 'form_type', 'gross_amount',
        'source_description', 'state_withheld', 'tax_year', 'upload_date', 'user_id',
        'withholding_amount',
    ]);
    assert.equal(row.tax_year, 2026);
    assert.equal(row.gross_amount, 2140);
    assert.equal(row.withholding_amount, 0, 'federal 0 plus unknown state is 0, not null');
    assert.equal(row.file_name, '1.jpg');
    assert.equal(row.form_type, 'poker');
    assert.match(row.source_description, /Four Winds/);

    const split = w2gRowFromReceipt('u', { destination: 'tax', prefill: { federal_withheld: 500, state_withheld: 100, date: '2025-12-31' } }, 'https://a/b.pdf');
    assert.equal(split.withholding_amount, 600);
    assert.equal(split.tax_year, 2025, 'tax year falls back to the form date');
    const blank = w2gRowFromReceipt('u', { destination: 'tax', prefill: {} }, 'https://a/b.pdf', '2026-09-08');
    assert.equal(blank.withholding_amount, null);
    assert.equal(blank.tax_year, 2026, 'and then to this year');
});

test('the receipt row is written unassigned with everything needed to reopen it', () => {
    const row = receiptRowFromScan('user-1', { imageUrl: 'https://a/b.jpg', extracted: { vendor: 'x' }, route: W2G, documentType: 'w2g' });
    assert.equal(row.status, 'unassigned');
    assert.equal(row.user_id, 'user-1');
    assert.equal(row.document_type, 'w2g');
    assert.equal(row.destination, 'tax');
    assert.equal(row.route.label, W2G.label);
    assert.deepEqual(row.route.prefill, W2G.prefill);
    assert.equal(receiptRowFromScan('u', { imageUrl: 'https://a/b.jpg' }).destination, 'manual');
});

// ---------------------------------------------------------------------------
// THE WIRING (source pins, comments stripped)
// ---------------------------------------------------------------------------

test('the sheet offers receiptActions(), not two hard-coded buttons', () => {
    const src = code(PAGE);
    assert.match(src, /receiptActions\(scannerRoute, \{/, 'choices come from the pure module');
    assert.doesNotMatch(src, /Create New Expense/, 'the old fixed button is gone');
    assert.match(src, /handleReceiptAction\(action\.id\)/);
    for (const id of Object.values(RECEIPT_ACTIONS)) {
        const key = Object.keys(RECEIPT_ACTIONS).find((k) => RECEIPT_ACTIONS[k] === id);
        assert.match(src, new RegExp(`RECEIPT_ACTIONS\\.${key}\\b`), `${id} is handled`);
    }
});

test('a scanned session opens a category the ledger CHECK accepts', () => {
    // bankroll_ledger_category_check: poker_cash, poker_mtt, casino_table,
    // slots, sports, expense, deposit, withdrawal. 'session' was refused with
    // 23514 and every scanned buy-in failed to save.
    assert.equal(ledgerCategoryFor(BUY_IN), 'poker_mtt');
    assert.equal(ledgerCategoryFor(routeScan(normaliseScan({ document_type: 'cash_game_buyin', confidence: 90, amount: 200 }))), 'poker_cash');
    assert.equal(ledgerCategoryFor(routeScan(normaliseScan({ document_type: 'payout', confidence: 90, payout: 900, finish_position: 3 }))), 'poker_mtt');
    assert.equal(ledgerCategoryFor(routeScan(normaliseScan({ document_type: 'payout', confidence: 90, payout: 900 }))), 'poker_cash');
    assert.equal(ledgerCategoryFor(UNSURE), null, 'when the scan did not say, the user picks');
    assert.equal(ledgerCategoryFor(null), null);

    const page = code(PAGE);
    assert.doesNotMatch(page, /openEntryForReceipt\('session'\)/);
    assert.doesNotMatch(page, /setDefaultReceiptCategory\('session'\)/);
    const modal = code(LOG_MODAL);
    assert.match(modal, /CATEGORIES\.some\(\(c\) => c\.id === defaultCategory\)/, 'the modal refuses a category it does not have');
});

test('rule 4: the row is written before a choice can be taken, and closing keeps it', () => {
    const src = code(PAGE);
    // The handler, to where it ends, NOT a fixed number of characters. A
    // count-based window silently stops covering the code it was written to
    // pin the moment somebody adds a line inside the handler, which is the
    // failure mode the playbook keeps warning about.
    const from = src.indexOf('onScanComplete={async');
    assert.ok(from > 0, 'the scanner hand-off must exist');
    const end = src.indexOf('/>', from);
    assert.ok(end > from, 'the hand-off must be a closed element');
    const onComplete = src.slice(from, end);
    assert.ok(
        onComplete.indexOf('setReceiptSaving(true)') < onComplete.indexOf("setScannerStep('post-capture')"),
        'the sheet opens in the saving state',
    );
    assert.match(onComplete, /const id = await saveReceiptRow\(/);
    assert.match(src, /disabled=\{receiptBusy \|\| receiptSaving\}/, 'no choice is enabled until the row exists');
    assert.match(src, /Retry Listing/, 'a failed insert is retried, not hidden');
    assert.match(src, /if \(!scannerReceiptId\) \{\s*toast\.error\('This Receipt Is Not Listed Yet/, '"keep it" cannot claim to keep what was never listed');
    assert.match(src, /\.from\('bankroll_receipts'\)\s*\.insert\(receiptRowFromScan\(/);
    assert.match(src, /\.eq\('status', 'unassigned'\)/, 'the dashboard reads what is still waiting');
    assert.match(src, /Receipts Waiting To Be Filed/, 'and shows it');
    assert.match(src, /onClick=\{\(\) => resumeReceipt\(receipt\)\}/, 'and each one reopens');

    const close = src.slice(src.indexOf('const closeScanner = useCallback'), src.indexOf('const loadPendingReceipts'));
    assert.match(close, /scannerStep !== 'scan' && scannerReceiptId/, 'closing a saved receipt says where it went');
    assert.match(close, /!scannerReceiptId && typeof window !== 'undefined'/, 'closing an unlisted one asks first');
    assert.doesNotMatch(close, /from\('bankroll_receipts'\)\s*\.delete/, 'closing never deletes it');
});

test('every destination marks the receipt assigned to a real row', () => {
    const src = code(PAGE);
    assert.match(src, /markReceiptAssigned\(scannerReceiptId, RECEIPT_TARGETS\.W2G_FORM, data\.id\)/, 'the vault');
    assert.match(src, /markReceiptAssigned\(scannerReceiptId, RECEIPT_TARGETS\.LEDGER_ENTRY, entry\.id\)/, 'attach');
    assert.match(src, /markReceiptAssigned\(receiptId, RECEIPT_TARGETS\.LEDGER_ENTRY, saved\.id\)/, 'a new session or expense');
    assert.match(src, /status: 'assigned', assigned_kind: kind, assigned_id: targetId/);
    assert.equal(Object.values(RECEIPT_TARGETS).length, 2);

    const modal = code(LOG_MODAL);
    assert.match(modal, /saved = await createLedgerEntry\(userId, entry\)/, 'the modal keeps the saved row');
    assert.match(modal, /onSubmit\(entry, saved/, 'and hands it back');
});

test('rule 2: with no active trip the page starts one before logging the session', () => {
    const src = code(PAGE);
    const block = src.slice(src.indexOf('actionId === RECEIPT_ACTIONS.LOG_SESSION'), src.indexOf('actionId === RECEIPT_ACTIONS.FILE_W2G'));
    assert.match(block, /if \(!activeTrip\)/);
    assert.match(block, /const draft = tripFromReceipt\(scannerRoute\);/);
    assert.match(block, /await createTrip\(userId, \{ \.\.\.draft, location_id: match \? match\.id : null \}\)/, 'and the trip carries the matched venue');
    assert.match(block, /openEntryForReceipt\(ledgerCategoryFor\(scannerRoute\)\)/, 'and it is logged as a SESSION, under a real ledger category');
    assert.doesNotMatch(block, /openEntryForReceipt\('expense'\)/);
});

test('rule 1: the vault is w2g_forms, filled from the scan, and a human confirms it', () => {
    const src = code(PAGE);
    assert.match(src, /\.from\('w2g_forms'\)\s*\.insert\(w2gRowFromReceipt\(userId, scannerRoute, scannerImageUrl\)\)/);
    assert.equal(W2G.autoFile, false, 'a tax form is never filed without a tap');
    const vault = src.slice(src.indexOf('actionId === RECEIPT_ACTIONS.FILE_W2G'));
    assert.match(vault, /new CustomEvent\('bankroll-updated'\)/, 'a mounted Tax Reports panel hears about the new row');
    assert.match(code(TAX_PANEL), /addEventListener\('bankroll-updated', refresh\)/, 'and refreshes its vault list');
});

test('the migration behind the receipt row exists, is owner-only, and was applied', () => {
    const sql = read(MIGRATION);
    assert.match(sql, /CREATE TABLE public\.bankroll_receipts/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /CREATE POLICY bankroll_receipts_own/);
    assert.match(sql, /CHECK \(status IN \('unassigned', 'assigned'\)\)/);
    assert.match(sql, /APPLIED:\s+2026-09-08/, 'a migration file that has not run is a feature the database has never heard of');
});

// ---------------------------------------------------------------------------
// THE VAULT UPLOADS THAT 403'D (handoff ITEM 2)
// ---------------------------------------------------------------------------

test('W-2G and dealer-document uploads go to the allowlisted bucket, reads and deletes still reach old objects', () => {
    for (const rel of [DEALER_VAULT, TAX_PANEL]) {
        const src = code(rel);
        assert.doesNotMatch(src, /storage\s*\.from\('images'\)\s*\.upload/, `${rel} must not upload to images`);
        assert.match(src, /await uploadBankrollFile\(supabase, userId, /, `${rel} uploads through the shared module`);
        assert.match(src, /removeBankrollObject\(supabase, /, `${rel} deletes through the bucket-aware remover`);
    }
    const storage = code(STORAGE);
    assert.match(storage, /'application\/pdf': 'pdf'/, 'both forms accept PDFs');
    assert.match(storage, /export async function removeBankrollObject/);
    const remover = storage.slice(storage.indexOf('export async function removeBankrollObject'), storage.indexOf('export function isRetryableUploadError'));
    assert.doesNotMatch(remover, /throw /, 'a storage object that will not delete must not block deleting the record');
    assert.match(storage, /\\\/storage\\\/v1\\\/object\\\/public\\\/\(\[\^\/\]\+\)\\\/\(\.\+\)\$/, 'the bucket is read from the URL, so old images objects still delete');
});
