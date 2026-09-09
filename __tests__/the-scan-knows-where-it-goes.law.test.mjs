/**
 * THE SCAN KNOWS WHERE IT GOES
 *
 * Four pieces of judgement that used to be missing from the receipt flow:
 *
 *   1. The fields the model filled in outrank the label it chose. A W-2G
 *      has gross winnings and a withholding box whatever it was called.
 *   2. A trip started from a buy-in carries the venue's saved location, so
 *      venue analytics can key on it.
 *   3. A cash-out ticket ends the session that is still open at that venue,
 *      instead of becoming a second, unexplained entry.
 *   4. "Attach To Existing Entry" leads with the same day at the same venue.
 *
 * And one piece of thrift: the OCR call gets a 1600px copy, storage keeps
 * the full-resolution one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normaliseScan, routeScan, evidencedDocumentType } from '../src/lib/bankroll/receiptRouting.mjs';
import {
    matchLocationByName, findOpenSessionFor, rankEntriesForReceipt, receiptActions, RECEIPT_ACTIONS,
} from '../src/lib/bankroll/receiptInbox.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ---------------------------------------------------------------------------
// 1. EVIDENCE BEATS THE LABEL
// ---------------------------------------------------------------------------

test('a W-2G mislabelled as an expense is still a W-2G', () => {
    const scan = normaliseScan({ document_type: 'expense', confidence: 80, vendor: 'Four Winds', amount: 2140, gross_winnings: 2140, federal_withheld: 0 });
    assert.equal(scan.documentType, 'w2g');
    assert.equal(routeScan(scan).destination, 'tax');
    assert.equal(evidencedDocumentType('unknown', { form_type: 'W-2G' }), 'w2g', 'the form type alone names it');
});

test('a tournament receipt mislabelled as an expense is a tournament buy-in', () => {
    const scan = normaliseScan({ document_type: 'expense', confidence: 80, vendor: 'Bellagio', amount: 340, buy_in: 300, fee: 40, tournament_name: 'Event #12' });
    assert.equal(scan.documentType, 'tournament_buyin');
    assert.equal(routeScan(scan).prefill.buy_in_amount, 300);
});

test('a payout with no buy-in that the model could not place is a cash out; a lone amount proves nothing', () => {
    assert.equal(normaliseScan({ document_type: 'unknown', confidence: 40, payout: 900 }).documentType, 'payout');
    assert.equal(normaliseScan({ document_type: 'expense', confidence: 90, amount: 32.5, category: 'meals' }).documentType, 'expense', 'an ordinary expense is untouched');
    assert.equal(normaliseScan({ document_type: 'cash_game_buyin', confidence: 90, amount: 200 }).documentType, 'cash_game_buyin', 'a consistent label is kept');
});

// ---------------------------------------------------------------------------
// 2. THE TRIP CARRIES THE VENUE
// ---------------------------------------------------------------------------

test('the venue a receipt printed matches a saved location, loosely but not wildly', () => {
    const locations = [{ id: 'a', name: 'Bellagio' }, { id: 'b', name: 'Wynn Las Vegas' }, { id: 'c', name: 'Aria' }];
    assert.equal(matchLocationByName(locations, 'BELLAGIO POKER ROOM').id, 'a', 'the longer contains the shorter');
    assert.equal(matchLocationByName(locations, 'wynn las vegas').id, 'b');
    assert.equal(matchLocationByName(locations, 'Aria Resort & Casino').id, 'c');
    assert.equal(matchLocationByName(locations, 'Rio'), null, 'no three-letter accidents');
    assert.equal(matchLocationByName(locations, ''), null);
    assert.equal(matchLocationByName(null, 'Bellagio'), null);
});

test('the page starts the trip with the matched location id', () => {
    const src = code('pages/hub/bankroll-manager.js');
    assert.match(src, /const match = matchLocationByName\(locations, venue\);/);
    assert.match(src, /createTrip\(userId, \{ \.\.\.draft, location_id: match \? match\.id : null \}\)/);
});

// ---------------------------------------------------------------------------
// 3. A CASH OUT CLOSES THE OPEN SESSION
// ---------------------------------------------------------------------------

const cashOut = routeScan(normaliseScan({ document_type: 'payout', confidence: 90, vendor: 'Bellagio', payout: 900, date: '2026-03-15' }));
const entries = [
    { id: 'old', category: 'poker_cash', entry_date: '2026-03-01', gross_in: 200, gross_out: 0, location_name: 'Bellagio' },
    { id: 'closed', category: 'poker_mtt', entry_date: '2026-03-15', gross_in: 300, gross_out: 500, location_name: 'Bellagio' },
    { id: 'open', category: 'poker_mtt', entry_date: '2026-03-15', gross_in: 300, gross_out: 0, location_name: 'Bellagio' },
    { id: 'elsewhere', category: 'poker_cash', entry_date: '2026-03-15', gross_in: 300, gross_out: 0, location_name: 'Wynn' },
    { id: 'expense', category: 'expense', entry_date: '2026-03-15', gross_in: 40, gross_out: 0, location_name: 'Bellagio' },
];

test('the open session is the same venue, within two days, with no cash out yet', () => {
    assert.equal(findOpenSessionFor(cashOut, entries).id, 'open');
    assert.equal(findOpenSessionFor(routeScan(normaliseScan({ document_type: 'tournament_buyin', confidence: 90, buy_in: 300 })), entries), null, 'a buy-in closes nothing');
    assert.equal(findOpenSessionFor(cashOut, []), null);
    const noVenue = routeScan(normaliseScan({ document_type: 'payout', confidence: 90, payout: 900, date: '2026-03-15' }));
    assert.equal(findOpenSessionFor(noVenue, entries).id, 'open', 'without a venue, the nearest open session');
});

test('the sheet offers closing it first, and only for a cash out with an open session', () => {
    const actions = receiptActions(cashOut, { openSession: entries[2] });
    assert.equal(actions[0].id, RECEIPT_ACTIONS.CLOSE_SESSION);
    assert.match(actions[0].title, /Close Session: Bellagio 2026-03-15/);
    assert.equal(actions[0].primary, true);
    assert.equal(receiptActions(cashOut, { openSession: null })[0].id, RECEIPT_ACTIONS.LOG_SESSION);
    const buyIn = routeScan(normaliseScan({ document_type: 'tournament_buyin', confidence: 90, buy_in: 300 }));
    assert.ok(!receiptActions(buyIn, { openSession: entries[2] }).some((a) => a.id === RECEIPT_ACTIONS.CLOSE_SESSION));
});

test('closing writes gross_out (net_result is generated from it) and attaches the image', () => {
    const src = code('pages/hub/bankroll-manager.js');
    const block = src.slice(src.indexOf('actionId === RECEIPT_ACTIONS.CLOSE_SESSION'), src.indexOf('actionId === RECEIPT_ACTIONS.FILE_W2G'));
    assert.match(block, /gross_out: cashOut,/);
    assert.match(block, /media_urls: \[\.\.\.\(open\.media_urls \|\| \[\]\), scannerImageUrl\]/);
    assert.match(block, /updateLedgerEntry\(userId, open\.id, updates\)/);
    assert.match(block, /markReceiptAssigned\(scannerReceiptId, RECEIPT_TARGETS\.LEDGER_ENTRY, saved\.id\)/);
    assert.doesNotMatch(block, /net_result/, 'never written by hand; the database derives it');
});

// ---------------------------------------------------------------------------
// 4. ATTACH LEADS WITH THE RIGHT ENTRY
// ---------------------------------------------------------------------------

test('attach candidates are ranked by same day, same venue, then original order', () => {
    const ranked = rankEntriesForReceipt(entries, cashOut).map((e) => e.id);
    assert.deepEqual(ranked.slice(0, 2), ['closed', 'open'], 'same day, same venue, poker sessions first');
    assert.equal(ranked[ranked.length - 1], 'old', 'two weeks ago at the same venue trails');
    assert.deepEqual(rankEntriesForReceipt(entries, null).map((e) => e.id), entries.map((e) => e.id), 'no route, no reordering');
    assert.match(code('pages/hub/bankroll-manager.js'), /rankEntriesForReceipt\(entries, scannerRoute\)\.slice\(0, 20\)/);
});

// ---------------------------------------------------------------------------
// THRIFT
// ---------------------------------------------------------------------------

test('the OCR call gets a smaller copy and storage keeps the original', () => {
    const scanner = code('src/components/bankroll/ReceiptScanner.jsx');
    assert.match(scanner, /const forOcr = await downscaleForOcr\(blob, 1600, 0\.85\);/);
    assert.match(scanner, /await readText\(forOcr, \{/, 'the smaller copy is what the engine reads');
    assert.match(scanner, /uploadBankrollImage\(supabase, uid, scan\.blob/, 'storage still gets the full scan');
    const src = code('src/lib/docscan/imageSource.js');
    assert.match(src, /export async function downscaleForOcr/);
    assert.match(src, /if \(typeof createImageBitmap !== 'function' \|\| typeof document === 'undefined'\) return blob;/, 'a browser without it still scans');
});

test('the photograph never leaves the device', () => {
    // The receipt a poker player scans is often a W-2G. It is read where it
    // was taken, and only the text crosses the network.
    const scanner = code('src/components/bankroll/ReceiptScanner.jsx');
    assert.match(scanner, /body: JSON\.stringify\(\{ text: read\.text, ocrConfidence: read\.confidence \}\)/);
    assert.doesNotMatch(scanner, /JSON\.stringify\(\{ image:/, 'no image is posted anywhere');
    assert.doesNotMatch(scanner, /readAsDataURL\(forOcr\)/, 'and none is encoded for posting');

    const vault = code('src/components/bankroll/DealerVault.jsx');
    // The vault shrinks its copy first now, like the scanner always has, so
    // the call names the downscaled blob rather than the raw data URL.
    assert.match(vault, /await readText\(forOcr/, 'the vault reads on the device too');
    assert.match(vault, /downscaleForOcr\(full, 1600, 0\.85\)/, 'and reads a sensible size');
    assert.match(vault, /body: JSON\.stringify\(\{ text: read\.text, ocrConfidence: read\.confidence \}\)/);
    assert.doesNotMatch(vault, /JSON\.stringify\(\{ image: imageBase64 \}\)/);
});

test('the engine is let go when the scanner closes', () => {
    // A WebAssembly heap of tens of megabytes, left running, is how a phone
    // dies three receipts into a session.
    for (const rel of ['src/components/bankroll/ReceiptScanner.jsx', 'src/components/bankroll/DealerVault.jsx']) {
        const src = code(rel);
        assert.match(src, /releaseOcr\(\)/, `${rel} must release the OCR worker`);
    }
});
