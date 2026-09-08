/**
 * THE RECEIPT INBOX FILES IN BULK AND NEVER TWICE
 *
 * Three things a player doing this for real runs into on day one:
 *
 *   1. They photograph the same receipt twice, once at the table and once
 *      emptying a pocket that night. Nothing stopped that becoming two rows
 *      and, filed, a doubled buy-in. A difference hash recognises it and the
 *      sheet SAYS SO. Nothing is ever dropped automatically.
 *   2. They scan five receipts at the end of a trip and then tap through five
 *      forms. "File All Suggested" files exactly the ones the router was
 *      confident about, and a W-2G is never one of them.
 *   3. They land on a six-month-old bookmark and get a blank page, because
 *      an unknown ?view= set a section nothing renders.
 *
 * Plus: the vault keeps federal and state withholding apart, and a file too
 * large to be a receipt is refused in words before the bucket refuses it in
 * codes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normaliseScan, routeScan } from '../src/lib/bankroll/receiptRouting.mjs';
import { ledgerEntryFromReceipt, partitionForBulkFiling, w2gRowFromReceipt } from '../src/lib/bankroll/receiptInbox.mjs';
import { hashFromLuma, hammingDistance, duplicateOf, DUPLICATE_MAX_DISTANCE } from '../src/lib/bankroll/receiptHash.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const PAGE = 'pages/hub/bankroll-manager.js';

const BUY_IN = routeScan(normaliseScan({ document_type: 'tournament_buyin', confidence: 95, vendor: 'BELLAGIO POKER ROOM', buy_in: 300, fee: 40, tournament_name: 'Event #12', date: '2026-03-15' }));
const EXPENSE = routeScan(normaliseScan({ document_type: 'expense', confidence: 90, vendor: 'Uber', amount: 32.5, category: 'transport', date: '2026-03-15' }));
const W2G = routeScan(normaliseScan({ document_type: 'w2g', confidence: 99, vendor: 'Four Winds', gross_winnings: 2140, federal_withheld: 500, state_withheld: 100, date: '2026-08-01' }));
const UNSURE = routeScan(normaliseScan({ document_type: 'unknown', confidence: 20 }));

// ---------------------------------------------------------------------------
// 1. NEVER TWICE
// ---------------------------------------------------------------------------

/** A 9x8 luma grid with a left-to-right ramp: a stand-in for one photograph. */
const grid = (seed) => new Array(72).fill(0).map((_, i) => ((i % 9) * 20 + seed * ((i * 37) % 5)) % 255);

test('the same picture hashes the same, a different one does not', () => {
    const a = hashFromLuma(grid(0));
    assert.equal(a.length, 16, '64 bits as hex');
    assert.equal(hammingDistance(a, hashFromLuma(grid(0))), 0, 'identical pixels, identical hash');
    const noisy = grid(0); noisy[3] += 1; noisy[40] -= 1;
    assert.ok(hammingDistance(a, hashFromLuma(noisy)) <= DUPLICATE_MAX_DISTANCE, 'compression noise is still the same receipt');
    const other = hashFromLuma(grid(0).slice().reverse());
    assert.ok(hammingDistance(a, other) > DUPLICATE_MAX_DISTANCE, 'a different picture is a different receipt');
});

test('an unusable hash is never mistaken for a match', () => {
    const a = hashFromLuma(grid(0));
    for (const bad of [null, undefined, '', 'zz', 'abc', 12345]) {
        assert.equal(hammingDistance(a, bad), Infinity, `${String(bad)} is not comparable`);
    }
    assert.equal(duplicateOf(null, [{ image_hash: a }]), null, 'no hash, no duplicate claim');
    assert.equal(duplicateOf(a, null), null);
    assert.equal(duplicateOf(a, [{ image_hash: null }, {}]), null, 'rows without a hash are skipped');
});

test('the nearest previous scan is named, filed or waiting', () => {
    const a = hashFromLuma(grid(0));
    const near = grid(0); near[7] += 1;
    const rows = [
        { id: 'far', image_hash: hashFromLuma(grid(0).slice().reverse()), status: 'assigned' },
        { id: 'near', image_hash: hashFromLuma(near), summary: 'Tournament Buy-In', status: 'assigned', created_at: '2026-03-15T10:00:00Z' },
    ];
    assert.equal(duplicateOf(a, rows).id, 'near');
});

test('the sheet SHOWS a duplicate and changes nothing', () => {
    const src = code(PAGE);
    assert.match(src, /setScannerDuplicate\(duplicateOf\(imageHash, recentHashes\)\)/, 'checked when the scan lands');
    assert.match(src, /You May Have Scanned This Before/);
    assert.match(src, /Nothing Was Changed\. Carry On If This Is A Different Receipt\./);
    // Whatever it finds, the row is still written and the choices still offered.
    const onComplete = src.slice(src.indexOf('onScanComplete={async'), src.indexOf('onScanComplete={async') + 1600);
    assert.match(onComplete, /const id = await saveReceiptRow\(/, 'a duplicate is still saved');
    assert.doesNotMatch(onComplete, /return;/, 'and never short-circuits the scan');
    assert.match(src, /image_hash: receipt\.image_hash \|\| null|scannerImageHashRef\.current = receipt\.image_hash/, 'a resumed receipt keeps its hash');
});

test('the hash is computed off the upload path and never blocks it', () => {
    const scanner = code('src/components/bankroll/ReceiptScanner.jsx');
    assert.match(scanner, /const hashPromise = perceptualHash\(scan\.blob\)\.catch\(\(\) => null\)/, 'a hashing failure is not an upload failure');
    const start = scanner.indexOf('const hashPromise');
    const body = scanner.slice(start, scanner.indexOf('setIsUploading(false)', start));
    assert.ok(body.indexOf('await hashPromise') > body.indexOf('const publicUrl = await uploadBankrollImage'), 'the upload is never waiting on a hash');
    assert.match(scanner, /imageHash: imageHashRef\.current,/, 'and it reaches the page');
});

// ---------------------------------------------------------------------------
// 2. IN BULK, AND NEVER A TAX FORM
// ---------------------------------------------------------------------------

const row = (route, extra = {}) => ({ id: `r-${Math.random()}`, image_url: 'https://x/y.jpg', route: { ...route, autoFile: route.autoFile }, auto_file: route.autoFile, destination: route.destination, ...extra });

test('bulk filing takes the confident ones and leaves everything else', () => {
    const receipts = [row(BUY_IN), row(EXPENSE), row(W2G), row(UNSURE)];
    const { willFile, willKeep } = partitionForBulkFiling(receipts);
    assert.equal(willFile.length, 2, 'the buy-in and the expense');
    assert.deepEqual(willKeep.map((r) => r.destination).sort(), ['manual', 'tax']);
    assert.equal(partitionForBulkFiling([]).willFile.length, 0);
    assert.equal(partitionForBulkFiling(null).willFile.length, 0);
});

test('a W-2G is never bulk filed, however confident the read', () => {
    assert.equal(W2G.autoFile, false);
    // Even if something upstream set the flag, the destination alone excludes it.
    const forced = row(W2G, { auto_file: true });
    forced.route.autoFile = true;
    assert.equal(partitionForBulkFiling([forced]).willFile.length, 0, 'a human confirms a tax form, always');
    assert.equal(ledgerEntryFromReceipt(W2G, {}), null, 'and it is not a ledger entry at all');
});

test('the ledger row a receipt files directly matches what the form would have written', () => {
    const mtt = ledgerEntryFromReceipt(BUY_IN, { imageUrl: 'u', tripId: 't', locationId: 'l' });
    assert.equal(mtt.category, 'poker_mtt');
    assert.equal(mtt.gross_in, 300, 'the buy-in, not the buy-in plus fee');
    assert.equal(mtt.buy_in_amount, 300);
    assert.equal(mtt.gross_out, 0);
    assert.equal(mtt.trip_id, 't');
    assert.equal(mtt.location_id, 'l');
    assert.deepEqual(mtt.media_urls, ['u']);
    assert.equal(mtt.entry_date, '2026-03-15');

    const exp = ledgerEntryFromReceipt(EXPENSE, { imageUrl: 'u' });
    assert.equal(exp.category, 'expense');
    assert.equal(exp.expense_type, 'rideshare');
    assert.equal(exp.gross_in, 32.5, 'an expense is money out, stored positive');
    assert.equal(exp.gross_out, 0);

    // Nothing safe to write means nothing is written.
    assert.equal(ledgerEntryFromReceipt(UNSURE, {}), null);
    assert.equal(ledgerEntryFromReceipt(routeScan(normaliseScan({ document_type: 'payout', confidence: 95, payout: 900 })), {}), null, 'a cash out closes a session, it does not open one');
    assert.equal(ledgerEntryFromReceipt(routeScan(normaliseScan({ document_type: 'expense', confidence: 90, vendor: 'x' })), {}), null, 'no amount, no entry');
    assert.equal(ledgerEntryFromReceipt(null, {}), null);
});

test('a receipt dated in the future is filed today', () => {
    const future = routeScan(normaliseScan({ document_type: 'expense', confidence: 90, amount: 10, date: '2031-01-01' }));
    assert.equal(ledgerEntryFromReceipt(future, { today: '2026-09-08' }).entry_date, '2026-09-08');
});

test('the page files each one and marks it, and a failure leaves the rest waiting', () => {
    const src = code(PAGE);
    const block = src.slice(src.indexOf('const fileAllSuggested'), src.indexOf('const handleReceiptAction'));
    assert.match(block, /partitionForBulkFiling\(pendingReceipts\)/);
    assert.match(block, /await createLedgerEntry\(userId, entry\)/);
    assert.match(block, /await markReceiptAssigned\(receipt\.id, RECEIPT_TARGETS\.LEDGER_ENTRY, saved\.id\)/);
    assert.match(block, /catch \(err\)/, 'one bad receipt does not stop the others');
    assert.match(block, /failed\+\+/);
    assert.match(block, /Could Not Be Filed And Are Still Waiting/);
    assert.match(src, /File \$\{partitionForBulkFiling\(pendingReceipts\)\.willFile\.length\} Suggested/, 'the button says how many');
});

// ---------------------------------------------------------------------------
// 3. REACHABLE, AND NEVER BLANK
// ---------------------------------------------------------------------------

test('an unknown view is the dashboard, not a blank page', () => {
    const src = code(PAGE);
    assert.match(src, /SIDEBAR_SECTIONS\.some\(\(s\) => s\.id === requestedView && !s\.action\)/);
    const block = src.slice(src.indexOf("if (requestedView === 'log-session')"), src.indexOf('if (router.query.type)'));
    assert.equal((block.match(/setActiveSection\('dashboard'\)/g) || []).length, 2, 'log-session and anything unknown both land on the dashboard');
});

test('Saved Receipts is reachable from the sidebar, and waiting receipts are visible from it', () => {
    const src = code(PAGE);
    assert.match(src, /\{ id: 'receipts', label: 'Saved Receipts', icon: '' \}/);
    assert.match(src, /section\.id === 'scan-receipt' && pendingReceipts\.length > 0/, 'the count is on the sidebar');
    assert.match(src, /W-2G Forms Waiting To Be Filed/, 'and in Tax Reports, where a W-2G belongs');
    assert.match(src, /data-testid="tax-receipts-waiting"/);
});

// ---------------------------------------------------------------------------
// THE VAULT AND THE BUCKET
// ---------------------------------------------------------------------------

test('the vault keeps federal and state apart and the total together', () => {
    const r = w2gRowFromReceipt('u', W2G, 'https://x/y.jpg', '2026-09-08');
    assert.equal(r.federal_withheld, 500);
    assert.equal(r.state_withheld, 100);
    assert.equal(r.withholding_amount, 600, 'every existing reader adds them up');
    const none = w2gRowFromReceipt('u', { destination: 'tax', prefill: {} }, 'https://x/y.jpg', '2026-09-08');
    assert.equal(none.federal_withheld, null);
    assert.equal(none.state_withheld, null);
    assert.equal(none.withholding_amount, null);
    const migration = read('supabase/migrations/20260908232953_receipt_hash_and_w2g_withholding_split.sql');
    assert.match(migration, /ADD COLUMN federal_withheld numeric/);
    assert.match(migration, /ADD COLUMN image_hash text/);
    assert.match(migration, /APPLIED:\s+2026-09-08/);
});

test('a file too large to be a receipt is refused in words', () => {
    const storage = code('src/lib/bankroll/receiptStorage.js');
    assert.match(storage, /export const BANKROLL_MAX_UPLOAD_BYTES = 25 \* 1024 \* 1024;/);
    assert.match(storage, /That File Is Too Large\. The Limit Is 25 MB\./);
    const guard = storage.slice(storage.indexOf('export async function uploadBankrollFile'), storage.indexOf('BANKROLL_ACCEPTED_TYPES'));
    assert.ok(guard.indexOf('BANKROLL_MAX_UPLOAD_BYTES') < guard.indexOf('EXTENSIONS[type]'), 'size is checked before the type');
});
