/**
 * WHAT KIND OF DOCUMENT IS THIS, AND WHERE DOES IT GO
 *
 * A poker player photographs a tournament entry receipt, a cash game buy-in
 * slip, a cash-out ticket, a W-2G, a dinner receipt and a paystub, and expects
 * one place to put them. Each belongs in a different record.
 *
 * The stake here is not tidiness. A tournament buy-in filed as an expense is
 * money in the wrong column: it leaves the session showing no investment and
 * the bankroll showing a cost, so profit is wrong twice. These tests pin the
 * classification and the routing, both of which are pure.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    normaliseScan,
    routeScan,
    DOC_TYPES,
    DOC_TYPE_LABELS,
    DESTINATIONS,
    AUTOFILE_MIN_CONFIDENCE,
} from '../src/lib/bankroll/receiptRouting.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Comments stripped: the file names the broken model in order to explain it. */
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ---------------------------------------------------------------------------
// READING WHAT THE MODEL SENT
// ---------------------------------------------------------------------------

test('a malformed response becomes unknown rather than throwing', () => {
    for (const junk of [null, undefined, 'nonsense', 42, [], {}]) {
        const s = normaliseScan(junk);
        assert.equal(s.documentType, 'unknown', `${JSON.stringify(junk)} must not classify`);
        assert.equal(s.confidence, 0);
    }
});

test('an unrecognised document_type is refused, not passed through', () => {
    assert.equal(normaliseScan({ document_type: 'drivers_licence' }).documentType, 'unknown');
    assert.equal(normaliseScan({ document_type: 'W2G' }).documentType, 'w2g', 'case is not a reason to fail');
});

test('confidence is accepted as 0-100 or 0-1 and clamped', () => {
    assert.equal(normaliseScan({ confidence: 80 }).confidence, 0.8);
    assert.equal(normaliseScan({ confidence: 0.8 }).confidence, 0.8);
    assert.equal(normaliseScan({ confidence: 250 }).confidence, 1);
    assert.equal(normaliseScan({ confidence: -5 }).confidence, 0);
});

test('amounts survive currency symbols and commas, and junk becomes null', () => {
    assert.equal(normaliseScan({ amount: '$1,250.75' }).amount, 1250.75);
    assert.equal(normaliseScan({ amount: 300 }).amount, 300);
    assert.equal(normaliseScan({ amount: 'n/a' }).amount, null);
    assert.equal(normaliseScan({ amount: null }).amount, null);
});

test('dates normalise to ISO from the formats receipts actually print', () => {
    assert.equal(normaliseScan({ date: '2026-03-15' }).date, '2026-03-15');
    assert.equal(normaliseScan({ date: '3/15/2026' }).date, '2026-03-15');
    assert.equal(normaliseScan({ date: '03-15-26' }).date, '2026-03-15');
    assert.equal(normaliseScan({ date: 'sometime' }).date, null);
});

// ---------------------------------------------------------------------------
// ROUTING: the part that decides where money lands
// ---------------------------------------------------------------------------

test('a tournament buy-in is a session, not an expense', () => {
    const r = routeScan(normaliseScan({
        document_type: 'tournament_buyin',
        confidence: 92,
        vendor: 'Bellagio',
        tournament_name: 'Sunday Deep Stack',
        buy_in: 300,
        fee: 40,
        date: '3/15/2026',
        amount: 340,
    }));
    assert.equal(r.destination, DESTINATIONS.SESSION, 'a buy-in is an investment, not a cost');
    assert.equal(r.prefill.entryKind, 'tournament');
    assert.equal(r.prefill.buy_in_amount, 300, 'the prize-pool portion, not the total');
    assert.equal(r.prefill.fee, 40);
    assert.equal(r.prefill.tournament_name, 'Sunday Deep Stack');
    assert.equal(r.prefill.location_name, 'Bellagio');
    assert.equal(r.prefill.date, '2026-03-15');
    assert.equal(r.autoFile, true);
});

test('a cash game buy-in fills money in, with the stakes', () => {
    const r = routeScan(normaliseScan({
        document_type: 'cash_game_buyin', confidence: 88,
        vendor: 'Aria', amount: 500, stakes: '2/5', date: '2026-03-15',
    }));
    assert.equal(r.destination, DESTINATIONS.SESSION);
    assert.equal(r.prefill.gross_in, 500);
    assert.equal(r.prefill.stakes, '2/5');
    assert.ok(!('gross_out' in r.prefill), 'a buy-in is not a cash out');
});

test('a cash out fills money OUT, which is the opposite column', () => {
    const r = routeScan(normaliseScan({
        document_type: 'payout', confidence: 90,
        vendor: 'Wynn', payout: 2400, finish_position: 3, date: '2026-03-15',
    }));
    assert.equal(r.destination, DESTINATIONS.SESSION);
    assert.equal(r.prefill.gross_out, 2400);
    assert.equal(r.prefill.finish_position, 3);
    assert.ok(!('gross_in' in r.prefill), 'a payout must never be recorded as a buy-in');
});

test('a W-2G goes to tax, and is never filed automatically', () => {
    const r = routeScan(normaliseScan({
        document_type: 'w2g', confidence: 99,
        vendor: 'MGM Grand', gross_winnings: 12000, federal_withheld: 2880,
        tax_year: 2026, date: '2026-02-02', form_type: 'W-2G',
    }));
    assert.equal(r.destination, DESTINATIONS.TAX);
    assert.equal(r.prefill.gross_amount, 12000);
    assert.equal(r.prefill.federal_withheld, 2880);
    assert.equal(r.prefill.tax_year, 2026);
    // A tax form is a legal record and the year it lands in changes what
    // somebody owes. Confidence is irrelevant; a human confirms.
    assert.equal(r.autoFile, false, 'a tax form must never be filed without a person looking');
});

test('a W-2G with no stated year takes it from the date rather than guessing', () => {
    const r = routeScan(normaliseScan({
        document_type: 'w2g', confidence: 95, vendor: 'Venetian',
        gross_winnings: 5000, date: '2025-11-30',
    }));
    assert.equal(r.prefill.tax_year, 2025);
});

test('an ordinary expense keeps the expense mapping the form already uses', () => {
    const r = routeScan(normaliseScan({
        document_type: 'expense', confidence: 85,
        vendor: 'Hilton', amount: 210.4, category: 'hotel', date: '2026-03-15',
    }));
    assert.equal(r.destination, DESTINATIONS.EXPENSE);
    assert.equal(r.prefill.expense_type, 'hotel');
    assert.equal(r.prefill.amount, 210.4);
});

test('every expense category maps to a value the entry form stores', () => {
    const formTypes = new Set(['hotel', 'flight', 'rental_car', 'gas', 'meals', 'rideshare', 'tips', 'tournament_fee', 'other']);
    for (const category of ['hotel', 'flights', 'rental_car', 'gas', 'meals', 'transport', 'tips', 'tournament', 'buy_in', 'other']) {
        const r = routeScan(normaliseScan({ document_type: 'expense', confidence: 90, amount: 10, category }));
        assert.ok(formTypes.has(r.prefill.expense_type), `${category} produced ${r.prefill.expense_type}`);
    }
});

test('a paystub goes to the toke tracker, for a person to confirm', () => {
    const r = routeScan(normaliseScan({ document_type: 'paystub', confidence: 95, amount: 640, vendor: 'Bellagio' }));
    assert.equal(r.destination, DESTINATIONS.TOKE);
    assert.equal(r.autoFile, false);
});

// ---------------------------------------------------------------------------
// REFUSING TO GUESS
// ---------------------------------------------------------------------------

test('a low-confidence read is never filed automatically', () => {
    const low = routeScan(normaliseScan({
        document_type: 'tournament_buyin', confidence: 30, buy_in: 300, vendor: 'Bellagio',
    }));
    assert.equal(low.autoFile, false, 'below the threshold a person decides');
    assert.ok(AUTOFILE_MIN_CONFIDENCE > 0.5, 'the bar must be meaningful, not decorative');

    const high = routeScan(normaliseScan({
        document_type: 'tournament_buyin', confidence: 90, buy_in: 300, vendor: 'Bellagio',
    }));
    assert.equal(high.autoFile, true);
});

test('a confident read with no amount is still not filed automatically', () => {
    // Knowing it is a buy-in is useless if the number could not be read.
    const r = routeScan(normaliseScan({ document_type: 'tournament_buyin', confidence: 99, vendor: 'Bellagio' }));
    assert.equal(r.autoFile, false, 'there is nothing to file without a figure');
});

test('an unreadable document asks instead of choosing', () => {
    const r = routeScan(normaliseScan({ document_type: 'unknown', confidence: 10 }));
    assert.equal(r.destination, DESTINATIONS.MANUAL);
    assert.equal(r.autoFile, false);
    assert.match(r.label, /Choose Where This Goes/);
});

test('every declared type routes somewhere and is labelled', () => {
    for (const t of DOC_TYPES) {
        const r = routeScan(normaliseScan({ document_type: t, confidence: 90, amount: 100 }));
        assert.ok(Object.values(DESTINATIONS).includes(r.destination), `${t} routed nowhere`);
        assert.ok(r.label && r.label.length > 3, `${t} has no button text`);
        assert.ok(DOC_TYPE_LABELS[t], `${t} has no human label`);
    }
});

// ---------------------------------------------------------------------------
// WIRING
// ---------------------------------------------------------------------------

test('the scanner classifies, shows the type, and lets a person correct it', () => {
    const src = read('src/components/bankroll/ReceiptScanner.jsx');
    assert.match(src, /normaliseScan\(result\.data\)/, 'the response must be normalised');
    assert.match(src, /routeScan\(scan\)/, 'and routed through the shared decision');
    assert.match(src, /const overrideType = useCallback/, 'a wrong guess must be correctable');
    assert.match(src, /Not Right\? Change The Type/, 'and the way to correct it must be visible');
    assert.match(src, /documentType: scanKind \? scanKind\.scan\.documentType/, 'the type must reach the caller');
});

test('the page files a buy-in as a session and an expense as an expense', () => {
    const page = read('pages/hub/bankroll-manager.js');
    assert.match(
        page,
        /setDefaultReceiptCategory\(kind === 'session' \? 'session' : 'expense'\)/,
        'the destination decides the entry kind',
    );
    assert.match(page, /\.\.\.\(scannerRoute \? scannerRoute\.prefill : \{\}\)/, 'and the routed fields are applied');
});

test('the entry form applies the routed session fields last, so they win', () => {
    const modal = read('src/components/bankroll/LogEntryModal.jsx');
    assert.match(modal, /const scannedSession = \{/, 'session fields must be assembled');
    assert.match(modal, /buy_in_amount: String\(p\.buy_in_amount\)/, 'including the buy-in');
    const spreadIdx = modal.indexOf('...scannedSession,');
    const grossIdx = modal.indexOf('gross_in: initGrossIn');
    assert.ok(spreadIdx > grossIdx, 'the routed values must override the generic amount mapping');
});

test('the OCR route asks for a document type and uses a model that exists', () => {
    const route = read('pages/api/bankroll/scan-receipt.js');
    assert.match(route, /"document_type"/, 'the prompt must ask what kind of paper this is');
    assert.match(route, /tournament_buyin/, 'and name the poker-specific kinds');
    assert.match(route, /A buy-in receipt is NOT an expense/, 'and say which way that call goes');
    // Two model ids were tried and both were rejected by the API. The route
    // now goes through the shared client, which is where a model name is
    // resolved for every route at once.
    assert.match(route, /getGrokClient\(\)/, 'must use the shared client, not a raw fetch');
    assert.doesNotMatch(code('pages/api/bankroll/scan-receipt.js'), /api\.x\.ai/, 'no hand-rolled endpoint');
    for (const dead of ['grok-2-vision-latest', 'grok-2-vision-1212']) {
        assert.ok(!code('pages/api/bankroll/scan-receipt.js').includes(dead), `${dead} was rejected by the API`);
    }
});
