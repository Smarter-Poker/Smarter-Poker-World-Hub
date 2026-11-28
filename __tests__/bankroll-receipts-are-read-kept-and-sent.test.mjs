/**
 * SCAN RECEIPT AND SAVED RECEIPTS: READ RIGHT, KEPT, AND SENT (2026-11-27)
 *
 * Dan's receipt rules (2026-09-08): a W-2G suggests the Vault, a buy-in goes
 * to a Trip (one is started if none is active), an expense goes to Expenses,
 * and every scanned receipt is saved and assignable later, never abandoned.
 *
 * This file pins the defects found auditing that flow end to end:
 *
 *  1. The reader took a casino's phone number "702.693.7111" for two amounts.
 *  2. Impossible days ("02/30/2026", "13/45/2026") were accepted as dates.
 *  3. "TOTAL TAX 8.00" was read as the total of a 108.00 folio.
 *  4. A scan held offline was put back on screen and never uploaded, so no
 *     held scan could ever be filed - and the automatic sender never let go.
 *  5. A held scan that failed again was held a second time under a new id.
 *  6. The "Saved On This Device" state was set and never drawn.
 *  7. An uploaded scan could be discarded, or the sheet closed, with no row
 *     written and no warning: the receipt existed nowhere a player could see.
 *  8. "File All Suggested" filed buy-ins onto no trip, and re-filed a receipt
 *     whose first assignment mark had failed.
 *  9. Saved Receipts labelled every session with raw column text, showed the
 *     previous day west of UTC, removed images by position, said "No Saved
 *     Receipts" when the load failed, and orphaned the receipt behind a
 *     removed image.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { moneyOn, dateOn, parseReceiptText } from '../src/lib/bankroll/receiptParser.mjs';
import { normaliseScan, routeScan } from '../src/lib/bankroll/receiptRouting.mjs';
import { entryHoldingImage, receiptNeedingTrip, receiptActions, RECEIPT_ACTIONS } from '../src/lib/bankroll/receiptInbox.mjs';
import { receiptCards, mediaWithout, categoryLabel, RECEIPT_UNASSIGN } from '../src/lib/bankroll/receiptGallery.mjs';
import { BANKROLL_MANAGER_PAGE, bankrollManagerSource } from './helpers/bankroll-manager-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The page reads as itself plus its section modules (the 2026-11-28 split;
// __tests__/helpers/bankroll-manager-source.mjs).
const read = (rel) => (rel === BANKROLL_MANAGER_PAGE ? bankrollManagerSource() : fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---------------------------------------------------------------------------
// READING
// ---------------------------------------------------------------------------

test('a phone number or a long decimal is not money', () => {
    assert.deepEqual(moneyOn('TEL 702.693.7111'), []);
    assert.deepEqual(moneyOn('REF 12.345'), []);
    assert.deepEqual(moneyOn('VISA ****1234 AUTH 123456'), []);
    // ...and real money still reads, including at the end of a sentence.
    assert.deepEqual(moneyOn('BUY-IN 300.00 FEE 40.00'), [300, 40]);
    assert.deepEqual(moneyOn('TOTAL $1,234.56.'), [1234.56]);
    assert.deepEqual(moneyOn('1,500.00, PAID'), [1500]);
    assert.deepEqual(moneyOn('$ 45'), [45]);
    assert.deepEqual(moneyOn('A 1,234,567.89'), [1234567.89]);
});

test('a header phone number never becomes the amount of a receipt', () => {
    const text = ['GOLDEN NUGGET', 'TEL 702.385.7111', '11/27/2026', 'THANK YOU'].join('\n');
    const read = parseReceiptText(text);
    assert.notEqual(read.amount, 702.38);
    assert.equal(read.amount, null);
});

test('only days that exist on the calendar are dates', () => {
    assert.equal(dateOn('02/30/2026'), null);
    assert.equal(dateOn('2026-02-31'), null);
    assert.equal(dateOn('02/29/2028'), '2028-02-29', 'a leap day is a day');
    assert.equal(dateOn('02/29/2027'), null);
    assert.equal(dateOn('11/27/26 10:42PM'), '2026-11-27');
    // A first number that cannot be a month is a European day-first date.
    assert.equal(dateOn('27/11/2026'), '2026-11-27');
});

test('the router never passes an impossible date downstream', () => {
    assert.equal(normaliseScan({ date: '13/45/2026' }).date, null);
    assert.equal(normaliseScan({ date: '2026-02-30' }).date, null);
    assert.equal(normaliseScan({ date: '27/11/2026' }).date, '2026-11-27');
    // A timestamp keeps the printed day instead of shifting by time zone.
    assert.equal(normaliseScan({ date: '2026-11-27T23:30:00Z' }).date, '2026-11-27');
    assert.equal(normaliseScan({ date: '2026-11-27' }).date, '2026-11-27');
});

test('a tax line is never read as the total of an expense', () => {
    const folio = [
        'CAESARS PALACE', 'GUEST CHECK', 'SERVER: MIKE', '11/26/2026',
        'SUBTOTAL 100.00', 'TOTAL TAX 8.00', 'TOTAL DUE 108.00',
    ].join('\n');
    const read = parseReceiptText(folio);
    assert.equal(read.document_type, 'expense');
    assert.equal(read.amount, 108);

    const plain = ['DINER', 'GUEST CHECK', 'SUBTOTAL 40.00', 'TAX 3.20', 'TOTAL 43.20', 'TIP 8.00'].join('\n');
    assert.equal(parseReceiptText(plain).amount, 43.2);
});

test('Dan\'s rules still hold for what the reader produces', () => {
    const w2g = routeScan(normaliseScan(parseReceiptText([
        'FORM W-2G CERTAIN GAMBLING WINNINGS 2026', 'PAYER BELLAGIO',
        'GROSS WINNINGS 12,500.00', 'FEDERAL INCOME TAX WITHHELD 3,000.00', 'DATE WON 11/20/2026',
    ].join('\n'))));
    assert.equal(receiptActions(w2g)[0].id, RECEIPT_ACTIONS.FILE_W2G, 'a W-2G suggests the Vault');

    const buyIn = routeScan(normaliseScan(parseReceiptText([
        'ARIA POKER ROOM', 'TOURNAMENT ENTRY RECEIPT', 'EVENT #4 DEEPSTACK NLH', '11/27/2026',
        'BUY-IN 300.00', 'FEE 40.00', 'TOTAL 340.00',
    ].join('\n'))));
    const buyInActions = receiptActions(buyIn, { activeTrip: null });
    assert.equal(buyInActions[0].id, RECEIPT_ACTIONS.LOG_SESSION, 'a buy-in goes to a trip');
    assert.match(buyInActions[0].title, /^Start A Trip/, 'starting one when none is active');
    assert.ok(!buyInActions.some((a) => a.id === RECEIPT_ACTIONS.NEW_EXPENSE), 'and is never an expense');

    const expense = routeScan(normaliseScan(parseReceiptText(['UBER', 'TRIP RECEIPT', '11/27/2026', 'TOTAL $23.40'].join('\n'))));
    assert.equal(receiptActions(expense)[0].id, RECEIPT_ACTIONS.NEW_EXPENSE, 'an expense goes to Expenses');

    for (const route of [w2g, buyIn, expense, routeScan(normaliseScan({}))]) {
        const actions = receiptActions(route);
        assert.equal(actions[actions.length - 1].id, RECEIPT_ACTIONS.SAVE_LATER, 'and every scan can be kept');
    }
});

// ---------------------------------------------------------------------------
// BULK FILING
// ---------------------------------------------------------------------------

const session = (extra = {}) => ({ id: 'r1', image_url: 'https://x/a.jpg', route: { destination: 'session', prefill: { entryKind: 'tournament', vendor: 'ARIA', ...extra } } });

test('bulk filing starts a trip for a buy-in when none is active, and only then', () => {
    const expense = { id: 'e', route: { destination: 'expense', prefill: {} } };
    const cashout = session({ entryKind: 'cashout' });
    assert.equal(receiptNeedingTrip([expense, session()], null).id, 'r1');
    assert.equal(receiptNeedingTrip([expense, session()], { id: 't' }), null, 'an active trip is used');
    assert.equal(receiptNeedingTrip([expense], null), null, 'expenses need no trip');
    assert.equal(receiptNeedingTrip([cashout], null), null, 'a cash out closes a session, it opens nothing');
    assert.equal(receiptNeedingTrip(null, null), null);
});

test('a receipt already on an entry is found, so it is never filed twice', () => {
    const entries = [{ id: 'l1', media_urls: ['https://x/b.jpg'] }, { id: 'l2', media_urls: ['https://x/a.jpg'] }, { id: 'l3', media_urls: null }];
    assert.equal(entryHoldingImage(entries, 'https://x/a.jpg').id, 'l2');
    assert.equal(entryHoldingImage(entries, 'https://x/c.jpg'), null);
    assert.equal(entryHoldingImage(entries, null), null);
    assert.equal(entryHoldingImage(null, 'https://x/a.jpg'), null);
});

test('the page wires both bulk guards in, before it creates anything', () => {
    const src = stripComments(read('pages/hub/bankroll-manager.js'));
    const block = src.slice(src.indexOf('const fileAllSuggested'), src.indexOf('const handleReceiptAction'));
    const seed = block.indexOf('receiptNeedingTrip(willFile, activeTrip)');
    const trip = block.indexOf('await createTrip(userId, { ...tripFromReceipt(tripSeed.route)');
    const holder = block.indexOf('entryHoldingImage(entries, receipt.image_url)');
    const create = block.indexOf('await createLedgerEntry(userId, entry)');
    assert.ok(seed > 0 && trip > seed, 'a trip is started from the first buy-in');
    assert.ok(holder > 0 && holder < create, 'an already-filed receipt is marked, not filed again');
    assert.match(block, /tripId: activeTrip \? activeTrip\.id : null/);
});

// ---------------------------------------------------------------------------
// THE SCANNER NEVER LOSES A SCAN
// ---------------------------------------------------------------------------

const scanner = () => stripComments(read('src/components/bankroll/ReceiptScanner.jsx'));

test('a held scan handed back is actually uploaded, once', () => {
    const src = scanner();
    const effect = src.slice(src.indexOf('const resumedRef = useRef(null)'), src.indexOf('const autoConfirmedRef'));
    assert.match(effect, /if \(resumedRef\.current === resumeScan\) return;/, 'sent once per mount');
    assert.match(effect, /setApprovedScan\(approved\);\s*uploadApprovedScan\(approved\);/, 'and sent, not just shown');
    assert.match(effect, /holdId: resumeScan\.id/);
});

test('a held scan that fails again is held under its own id', () => {
    const src = scanner();
    const hold = src.slice(src.indexOf('const holdForLater'), src.indexOf('const uploadApprovedScan'));
    assert.match(hold, /id: scan\.holdId \|\| undefined/);
    assert.match(hold, /capturedAt: scan\.capturedAt \|\| Date\.now\(\)/);
});

test('a terminal save failure lets the off-screen sender go', () => {
    const src = scanner();
    assert.match(src, /onUploadFailed\(\{ reason: 'signed-out' \}\)/);
    assert.match(src, /onUploadFailed\(\{ reason: 'upload-failed' \}\)/);
    const page = stripComments(read('pages/hub/bankroll-manager.js'));
    assert.match(page, /onUploadFailed=\{\(\) => \{ finishAutoFlush\(autoFlushing, false\); \}\}/);
    const close = page.slice(page.indexOf('const closeScanner = useCallback'), page.indexOf('const loadPendingReceipts'));
    assert.match(close, /setResumingHeld\(null\)/, 'closing the sheet releases the held scan it had open');
});

test('the held-on-device state is drawn, and is not called unsaved', () => {
    const src = scanner();
    assert.match(src, /const heldPanel = heldOnDevice && !isUploading && !uploadedUrl;/);
    assert.match(src, /\{heldPanel && \(/);
    assert.match(src, /SAVED ON THIS DEVICE/);
    assert.match(src, /const hasUnsavedScan = Boolean\(approvedScan \|\| uploadedUrl\) && !handedOver && !heldOnDevice;/);
});

test('an uploaded scan is unsaved until it is handed to the page', () => {
    const src = scanner();
    const confirm = src.slice(src.indexOf('const handleConfirm = useCallback'), src.indexOf('handleConfirmRef.current = handleConfirm'));
    assert.ok(confirm.indexOf('setHandedOver(true)') < confirm.indexOf('onScanComplete({'));
    // Every way out of the result view asks first.
    const result = src.slice(src.indexOf('<div style={styles.actions}>'));
    assert.match(result, /<button onClick=\{requestReset\} style=\{styles\.cancelBtn\}/);
    assert.doesNotMatch(result.slice(0, 400), /onClick=\{resetScanner\}/);
    const reset = src.slice(src.indexOf('const requestReset'), src.indexOf('const handleConfirmRef'));
    assert.match(reset, /if \(uploadedUrl && !handedOver\) removeBankrollObject\(supabase, uploadedUrl\);/, 'and a discarded upload leaves no orphan');
});

test('the scanner no longer offers a lock that locks nothing', () => {
    const src = scanner();
    assert.doesNotMatch(src, /VERIFY & LOCK|handleVerifyLock|eventBus/);
});

// ---------------------------------------------------------------------------
// SAVED RECEIPTS
// ---------------------------------------------------------------------------

test('saved receipt cards carry real labels, numbers and no duplicates', () => {
    const cards = receiptCards([
        { id: 'a', category: 'poker_mtt', entry_date: '2026-11-27', net_result: '-340.00', media_urls: ['u1', 'u1', '', 'u2.pdf'], location: { name: 'Aria' } },
        { id: 'b', category: 'expense', entry_date: '2026-11-26', net_result: null, media_urls: null },
        { id: 'c', category: 'poker_cash', entry_date: '2026-11-25', net_result: 120, media_urls: ['u3'] },
    ]);
    assert.deepEqual(cards.map((c) => c.imageUrl), ['u1', 'u2.pdf', 'u3']);
    assert.equal(cards[0].label, 'Tournament');
    assert.equal(cards[2].label, 'Cash Game');
    assert.equal(cards[0].netResult, -340, 'a numeric string is a number');
    assert.equal(cards[0].location, 'Aria');
    assert.equal(cards[1].isPdf, true);
    assert.equal(categoryLabel('casino_table'), 'Table Game');
    assert.equal(categoryLabel('something_new'), 'Something New');
    assert.equal(receiptCards(null).length, 0);
});

test('removing an image removes THAT image, by its address', () => {
    assert.deepEqual(mediaWithout(['a', 'b', 'c'], 'b'), ['a', 'c']);
    assert.equal(mediaWithout(['a'], 'a'), null);
    assert.deepEqual(mediaWithout(['a', 'c'], 'b'), ['a', 'c'], 'an image already gone changes nothing');
    assert.deepEqual(RECEIPT_UNASSIGN, { status: 'unassigned', assigned_kind: null, assigned_id: null, assigned_at: null });
});

test('Saved Receipts uses local days, says when it failed, and returns receipts to waiting', () => {
    const src = stripComments(read('src/components/bankroll/SavedReceipts.jsx'));
    assert.doesNotMatch(src, /new Date\(r\.date\)/, 'a YYYY-MM-DD parsed as UTC is the previous day in Chicago');
    assert.match(src, /parseLedgerDay\(r\.date\)/);
    assert.match(src, /Saved Receipts Could Not Load/);
    assert.match(src, /mediaWithout\(entry\.media_urls, receipt\.imageUrl\)/);
    assert.doesNotMatch(src, /imageIndex/);
    assert.match(src, /\.from\('bankroll_receipts'\)\s*\.update\(RECEIPT_UNASSIGN\)/);
    assert.match(src, /repeat\(2, minmax\(0, 1fr\)\)/, 'a long venue name cannot widen the grid past 375px');
});
