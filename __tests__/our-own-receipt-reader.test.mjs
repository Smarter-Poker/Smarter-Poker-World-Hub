/**
 * OUR OWN READER, HELD TO WHAT A RECEIPT ACTUALLY SAYS
 *
 * These fixtures are OCR text: the same words, in the same order, with the
 * same glyph confusions a phone camera produces. No camera, no network and no
 * model is involved in running them, which is the entire point of owning the
 * reader.
 *
 * The stake is money in the wrong column. A tournament buy-in read as an
 * expense leaves the session showing no investment and the bankroll showing a
 * cost, so profit is wrong twice. A dinner read at its SUBTOTAL underpays the
 * deduction. A W-2G read with the wrong year lands in the wrong tax return.
 * Every one of those is a case below.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    parseReceiptText,
    classify,
    toLines,
    moneyOn,
    dateOn,
    amountFor,
    hasAny,
    findVendor,
    DOC_TYPES,
} from '../src/lib/bankroll/receiptParser.mjs';

import {
    normaliseScan,
    routeScan,
    DESTINATIONS,
    AUTOFILE_MIN_CONFIDENCE,
    DOC_TYPES as ROUTING_DOC_TYPES,
} from '../src/lib/bankroll/receiptRouting.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Comments stripped, so a pin cannot be satisfied by prose that explains it. */
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The player's saved venues, which is what the reader knows and a model does not. */
const VENUES = [
    { id: 'v1', name: 'Bellagio' },
    { id: 'v2', name: 'Aria' },
    { id: 'v3', name: 'Four Winds Casino' },
];

const scan = (text) => parseReceiptText(text, { knownVenues: VENUES });

// ---------------------------------------------------------------------------
// THE FIXTURES
// ---------------------------------------------------------------------------

const W2G = `Four Winds Casino Resort
11111 Wilson Rd, New Buffalo MI 49117
Form W-2G  2026
Certain Gambling Winnings
PAYER'S name FOUR WINDS CASINO
1 Gross winnings        2,140.00
2 Date won              08/15/2026
3 Type of wager  POKER TOURNAMENT
4 Federal income tax withheld   535.00
15 State income tax withheld    89.88
WINNER'S name  DANIEL B`;

const TOURNAMENT = `BELLAG10 P0KER ROOM
LAS VEGAS NV
TOURNAMENT ENTRY RECEIPT
EVENT #12 SUNDAY DEEP STACK NLH
DATE 09/06/2026  TIME 11:02 AM
BUY-IN            300.00
ENTRY FEE          40.00
TOTAL             340.00
TABLE 14   SEAT 3
STARTING STACK 30,000`;

const TOURNAMENT_ONE_LINE = `VENETIAN POKER ROOM
TOURNAMENT REGISTRATION
EVENT 4 TURBO BOUNTY
09/02/2026
BUY-IN 200.00 FEE 25.00
TOTAL 225.00`;

const CASH_GAME = `ARIA POKER ROOM
CASH GAME BUY-IN
TABLE 7  SEAT 2
NLH  2/5
CHIPS              1,000.00
09/07/2026`;

const CASH_OUT = `WYNN LAS VEGAS
TICKET OUT
CASH OUT           1,875.00
DATE 09/07/2026`;

const TOURNAMENT_PAYOUT = `Bellagio Tournament Cashier
PRIZE PAYOUT
3RD PLACE
PAYOUT            4,250.00
09/06/2026`;

const PAYSTUB = `MGM GRAND
EARNINGS STATEMENT
PAY PERIOD 08/16/2026 - 08/31/2026
HOURS 78.50
TOKES DECLARED      1,412.00
GROSS PAY           2,340.55
DEDUCTIONS            512.10
NET PAY             1,828.45`;

const DINNER = `MASTRO'S OCEAN CLUB
GUEST CHECK
SERVER: MARIA   TABLE 12
09/06/2026
RIBEYE            68.00
SUBTOTAL         138.00
TAX               11.73
TIP               28.00
TOTAL            177.73`;

const HOTEL = `THE COSMOPOLITAN OF LAS VEGAS
GUEST FOLIO
CHECK IN  09/04/2026
CHECK OUT 09/07/2026
ROOM CHARGE       3 NIGHTS
RESORT FEE            135.00
TOTAL               1,284.60`;

const GAS = `CHEVRON #2241
PUMP 6
UNLEADED
GALLONS       14.221
09/05/2026
TOTAL          52.87`;

const RIDESHARE = `UBER
TRIP RECEIPT
09/06/2026
LAS VEGAS NV
TOTAL           23.40`;

const FLIGHT = `DELTA AIR LINES
BOARDING PASS
FLIGHT DL 1422
DEPARTURE 09/04/2026 DTW-LAS
BAGGAGE FEE          35.00
TOTAL               412.80`;

const RENTAL = `HERTZ RENTAL AGREEMENT
LAS VEGAS MCCARRAN
09/04/2026 - 09/07/2026
RENTAL CAR  MIDSIZE
TOTAL              218.44`;

const JUNK = `asdf
qwerty 3
zz`;

// ---------------------------------------------------------------------------
// THE PIECES
// ---------------------------------------------------------------------------

test('money is a number with a currency mark or cents, and nothing else', () => {
    assert.deepEqual(moneyOn('BUY-IN            300.00'), [300]);
    assert.deepEqual(moneyOn('TOTAL $1,284.60'), [1284.60]);
    assert.deepEqual(moneyOn('BUY-IN 200.00 FEE 25.00'), [200, 25]);

    // A seat is not a payment and a stack is not a bankroll.
    assert.deepEqual(moneyOn('TABLE 14   SEAT 3'), []);
    assert.deepEqual(moneyOn('STARTING STACK 30,000'), []);
    assert.deepEqual(moneyOn('PUMP 6'), []);
    assert.deepEqual(moneyOn(''), []);
    assert.deepEqual(moneyOn(null), []);
});

test('a date is read in the formats these rooms print, and a short year is this century', () => {
    assert.equal(dateOn('DATE 09/06/2026'), '2026-09-06');
    assert.equal(dateOn('2026-09-06'), '2026-09-06');
    assert.equal(dateOn('SEP 6, 2026'), '2026-09-06');
    assert.equal(dateOn('6 SEPT 2026'), '2026-09-06');
    // 08/15/98 on a scanned receipt is 2098 being impossible and 1998 being
    // absurd; it is a mis-typed 2098 only in the sense that it is not 1998.
    assert.equal(dateOn('08/15/26'), '2026-08-15');
    assert.equal(dateOn('TABLE 14 SEAT 3'), null);
    assert.equal(dateOn('99/99/2026'), null);
});

test('labels are tried in the order the caller asked for them', () => {
    const lines = toLines(PAYSTUB);
    // GROSS PAY is printed ABOVE net pay. Asking for net pay first must still
    // return net pay, or every dealer stub logs the wrong take-home.
    assert.equal(amountFor(lines, ['NET PAY', 'GROSS PAY']), 1828.45);
    assert.equal(amountFor(lines, ['GROSS PAY', 'NET PAY']), 2340.55);
    assert.equal(amountFor(lines, ['NOTHING PRINTED HERE']), null);
});

test('a label takes the amount printed to its right when a line carries two', () => {
    const lines = toLines(TOURNAMENT_ONE_LINE);
    assert.equal(amountFor(lines, ['BUY-IN'], { notWith: ['TOTAL'] }), 200);
    // "BUY-IN 200.00 FEE 25.00" is one line with two labels and two amounts.
    // Neither label owns the other's number.
    assert.equal(amountFor(lines, ['FEE'], { mustBeRight: ['BUY-IN'] }), 25);
});

test('a label sharing a line reaches no further than that line', () => {
    // FEE has no amount of its own here, and the line belongs to the buy-in
    // as well. Walking on to the next line would hand the fee somebody
    // else's number.
    const lines = toLines('BUY-IN AND FEE\n225.00');
    assert.equal(amountFor(lines, ['FEE'], { mustBeRight: ['BUY-IN'] }), null);
    assert.equal(amountFor(lines, ['FEE']), 225);
});

test('one amount printed for two labels is not counted twice', () => {
    // "BUY-IN + FEE 225.00" is one number for both. Reading it as the fee as
    // well as the buy-in makes the entry look like it cost 450.
    const out = scan('CAESARS PALACE\nTOURNAMENT ENTRY\nEVENT 3 NLH\n09/06/2026\nBUY-IN + FEE 225.00');
    assert.equal(out.document_type, 'tournament_buyin');
    assert.equal(out.buy_in, 225);
    assert.equal(out.fee, null);
    assert.equal(out.amount, 225);
});

test('a label reads the next line when its own line has no amount', () => {
    const lines = toLines(`GROSS WINNINGS\n2,140.00`);
    assert.equal(amountFor(lines, ['GROSS WINNINGS']), 2140);
});

test('phrases match whole words, so SUBTOTAL is not TOTAL', () => {
    assert.equal(hasAny(['SUBTOTAL 138.00'], ['TOTAL']), false);
    assert.equal(hasAny(['TOTAL 177.73'], ['TOTAL']), true);
    assert.equal(amountFor(toLines(DINNER), ['TOTAL']), 177.73);
});

// ---------------------------------------------------------------------------
// WHAT KIND OF DOCUMENT IS THIS
// ---------------------------------------------------------------------------

const CLASSIFICATIONS = [
    ['a W-2G', W2G, 'w2g'],
    ['a tournament entry receipt', TOURNAMENT, 'tournament_buyin'],
    ['a tournament receipt printed on one line', TOURNAMENT_ONE_LINE, 'tournament_buyin'],
    ['a cash game buy-in', CASH_GAME, 'cash_game_buyin'],
    ['a cash-out ticket', CASH_OUT, 'payout'],
    ['a tournament prize payout', TOURNAMENT_PAYOUT, 'payout'],
    ['a dealer paystub', PAYSTUB, 'paystub'],
    ['a dinner check', DINNER, 'expense'],
    ['a hotel folio', HOTEL, 'expense'],
    ['a fuel receipt', GAS, 'expense'],
    ['a rideshare receipt', RIDESHARE, 'expense'],
    ['a boarding pass', FLIGHT, 'expense'],
    ['a car rental agreement', RENTAL, 'expense'],
    ['unreadable text', JUNK, 'unknown'],
];

for (const [what, text, expected] of CLASSIFICATIONS) {
    test(`${what} is read as ${expected}`, () => {
        assert.equal(classify(toLines(text)).documentType, expected);
        assert.equal(scan(text).document_type, expected);
    });
}

test('every type this reader can return is a type the router knows how to route', () => {
    for (const type of DOC_TYPES) assert.ok(ROUTING_DOC_TYPES.includes(type), `router does not know ${type}`);
    for (const [, text] of CLASSIFICATIONS) {
        assert.ok(ROUTING_DOC_TYPES.includes(scan(text).document_type));
    }
});

// ---------------------------------------------------------------------------
// WHAT DOES IT SAY
// ---------------------------------------------------------------------------

test('a W-2G gives up its three boxes, its date won and its tax year', () => {
    const out = scan(W2G);
    assert.equal(out.gross_winnings, 2140);
    assert.equal(out.federal_withheld, 535);
    assert.equal(out.state_withheld, 89.88);
    assert.equal(out.amount, 2140);
    assert.equal(out.form_type, 'W-2G');
    // The date that matters is the date won, not the day it was printed.
    assert.equal(out.date, '2026-08-15');
    assert.equal(out.tax_year, 2026);
    assert.equal(out.vendor, 'Four Winds Casino');
});

test('a W-2G keeps federal and state withholding apart', () => {
    const out = scan(W2G);
    assert.notEqual(out.federal_withheld, out.state_withheld);
    // One number in both columns is the failure this splits: it would double
    // the credit claimed on a return.
    assert.equal(out.federal_withheld + out.state_withheld, 624.88);
});

test('a tournament receipt separates the buy-in from the fee and totals them', () => {
    const out = scan(TOURNAMENT);
    assert.equal(out.buy_in, 300);
    assert.equal(out.fee, 40);
    assert.equal(out.amount, 340);
    assert.equal(out.game_type, 'nlhe');
    assert.equal(out.date, '2026-09-06');
});

test('the tournament name is the event, not the words RECEIPT or ENTRY above it', () => {
    assert.equal(scan(TOURNAMENT).tournament_name, 'Event 12 SUNDAY DEEP STACK NLH');
    assert.equal(scan(TOURNAMENT_ONE_LINE).tournament_name, 'Event 4 TURBO BOUNTY');
});

test('a tournament receipt with only a total still knows what the buy-in was', () => {
    const out = scan(`GOLDEN NUGGET\nTOURNAMENT ENTRY\nEVENT 9 NLH\n09/06/2026\nTOTAL 125.00`);
    assert.equal(out.document_type, 'tournament_buyin');
    assert.equal(out.amount, 125);
    assert.equal(out.buy_in, 125);
});

test('a cash game buy-in gives up its stakes, its game and its amount', () => {
    const out = scan(CASH_GAME);
    assert.equal(out.amount, 1000);
    assert.equal(out.stakes, '2/5');
    assert.equal(out.game_type, 'nlhe');
});

test('a date is never mistaken for stakes', () => {
    const out = scan(`SOUTH POINT\nCASH GAME BUY-IN\nTABLE 3 SEAT 6\n09/07/2026\nCHIPS 400.00`);
    assert.equal(out.stakes, '');
    assert.equal(out.amount, 400);
});

test('a phone number is never mistaken for stakes', () => {
    const out = scan(`SOUTH POINT POKER 702-796-7111\nCASH GAME BUY-IN\nTABLE 3\nCHIPS 400.00`);
    assert.equal(out.stakes, '');
});

test('a cash-out ticket is money coming out', () => {
    const out = scan(CASH_OUT);
    assert.equal(out.payout, 1875);
    assert.equal(out.amount, 1875);
});

test('a prize payout keeps the finish position', () => {
    const out = scan(TOURNAMENT_PAYOUT);
    assert.equal(out.payout, 4250);
    assert.equal(out.finish_position, 3);
});

test('a paystub reads net pay, not the larger gross printed above it', () => {
    const out = scan(PAYSTUB);
    assert.equal(out.amount, 1828.45);
});

test('a dinner check is read at its total, not its subtotal', () => {
    const out = scan(DINNER);
    // 138.00 is the subtotal. Filing it loses the tax and the tip.
    assert.equal(out.amount, 177.73);
    assert.equal(out.category, 'meals');
});

// ---------------------------------------------------------------------------
// EXPENSE CATEGORIES, WHICH THE ROUTER TURNS INTO A STORED expense_type
// ---------------------------------------------------------------------------

const CATEGORIES = [
    ['a dinner check', DINNER, 'meals'],
    ['a hotel folio', HOTEL, 'hotel'],
    ['a fuel receipt', GAS, 'gas'],
    ['a rideshare receipt', RIDESHARE, 'transport'],
    ['a boarding pass', FLIGHT, 'flights'],
    ['a car rental agreement', RENTAL, 'rental_car'],
];

for (const [what, text, category] of CATEGORIES) {
    test(`${what} is categorised as ${category}, and the router stores it`, () => {
        const out = scan(text);
        assert.equal(out.category, category);
        const route = routeScan(normaliseScan(out));
        assert.equal(route.destination, DESTINATIONS.EXPENSE);
        // A category the map does not know silently becomes 'other', which is
        // how an expense loses its type. Pin that this one is known.
        assert.notEqual(route.prefill.expense_type, 'other', `${category} is not in EXPENSE_TYPE_MAP`);
    });
}

test('every category this reader emits is a key the router maps', () => {
    const map = code('src/lib/bankroll/receiptRouting.mjs')
        .match(/const EXPENSE_TYPE_MAP = \{([\s\S]*?)\}/);
    assert.ok(map, 'EXPENSE_TYPE_MAP not found');
    const keys = [...map[1].matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
    const emitted = code('src/lib/bankroll/receiptParser.mjs')
        .match(/const EXPENSE_CATEGORIES = \[([\s\S]*?)\n\];/);
    assert.ok(emitted, 'EXPENSE_CATEGORIES not found');
    const categories = [...emitted[1].matchAll(/\[\s*'([a-z_]+)'/g)].map((m) => m[1]);
    assert.ok(categories.length >= 6);
    for (const c of categories) assert.ok(keys.includes(c), `EXPENSE_TYPE_MAP has no key ${c}`);
    assert.ok(keys.includes('other'), 'the fallback category must be mapped');
});

// ---------------------------------------------------------------------------
// WHAT THE PLAYER'S OWN VENUES BUY US
// ---------------------------------------------------------------------------

test('a saved venue is matched through the glyph confusions OCR makes', () => {
    // BELLAG10 P0KER ROOM is what a camera reads off a thermal print.
    const out = scan(TOURNAMENT);
    assert.equal(out.vendor, 'Bellagio');
    assert.equal(out.location, 'Bellagio');
});

test('a saved venue is matched on whole words, not inside somebody name', () => {
    // "ARIA" lives inside "MARIA", the server on the steakhouse check. Filing
    // that dinner at the Aria poker room is the bug this pins.
    const out = scan(DINNER);
    assert.equal(out.vendor, "MASTRO'S OCEAN CLUB");
    assert.equal(out.location, '');
});

test('with no saved venues the top line is still read as the vendor', () => {
    const out = parseReceiptText(TOURNAMENT, { knownVenues: [] });
    assert.equal(out.vendor, 'BELLAG10 P0KER ROOM');
    assert.equal(out.location, '');
});

test('findVendor skips dates, amounts and the word RECEIPT', () => {
    const { vendor } = findVendor(toLines(`RECEIPT\n09/06/2026\n$340.00\nTHE ORLEANS POKER ROOM`));
    assert.equal(vendor, 'THE ORLEANS POKER ROOM');
});

// ---------------------------------------------------------------------------
// CONFIDENCE, WHICH DECIDES WHETHER ANYTHING FILES ITSELF
// ---------------------------------------------------------------------------

test('a clear document is confident enough to file itself', () => {
    for (const text of [TOURNAMENT, CASH_GAME, DINNER, CASH_OUT]) {
        const s = normaliseScan(scan(text));
        assert.ok(s.confidence >= AUTOFILE_MIN_CONFIDENCE, `${s.documentType} scored ${s.confidence}`);
        assert.equal(routeScan(s).autoFile, true);
    }
});

test('unreadable text is not confident, and asks instead of filing', () => {
    const s = normaliseScan(scan(JUNK));
    assert.equal(s.documentType, 'unknown');
    assert.ok(s.confidence < AUTOFILE_MIN_CONFIDENCE, `junk scored ${s.confidence}`);
    const route = routeScan(s);
    assert.equal(route.destination, DESTINATIONS.MANUAL);
    assert.equal(route.autoFile, false);
});

test('a document with a type but no amount does not file itself', () => {
    const s = normaliseScan(scan(`ARIA POKER ROOM\nCASH GAME BUY-IN\nTABLE 7 SEAT 2`));
    assert.equal(s.documentType, 'cash_game_buyin');
    assert.equal(s.amount, null);
    assert.equal(routeScan(s).autoFile, false);
});

test('confidence never leaves the 0 to 100 range it promises', () => {
    for (const [, text] of CLASSIFICATIONS) {
        const c = scan(text).confidence;
        assert.ok(c >= 0 && c <= 100, `confidence ${c} out of range`);
    }
});

// ---------------------------------------------------------------------------
// END TO END: THE READER'S OUTPUT IS THE ROUTER'S INPUT, UNCHANGED
// ---------------------------------------------------------------------------

const ROUTES = [
    ['a W-2G', W2G, DESTINATIONS.TAX],
    ['a tournament buy-in', TOURNAMENT, DESTINATIONS.SESSION],
    ['a cash game buy-in', CASH_GAME, DESTINATIONS.SESSION],
    ['a cash-out ticket', CASH_OUT, DESTINATIONS.SESSION],
    ['a paystub', PAYSTUB, DESTINATIONS.TOKE],
    ['a dinner check', DINNER, DESTINATIONS.EXPENSE],
    ['unreadable text', JUNK, DESTINATIONS.MANUAL],
];

for (const [what, text, destination] of ROUTES) {
    test(`${what} routes to ${destination} with no hand-editing in between`, () => {
        const route = routeScan(normaliseScan(scan(text)));
        assert.equal(route.destination, destination);
        assert.ok(route.summary && route.summary.length > 0);
    });
}

test('the W-2G carries its boxes all the way into the vault prefill', () => {
    const route = routeScan(normaliseScan(scan(W2G)));
    assert.equal(route.prefill.gross_amount, 2140);
    assert.equal(route.prefill.federal_withheld, 535);
    assert.equal(route.prefill.state_withheld, 89.88);
    assert.equal(route.prefill.tax_year, 2026);
    // A tax form is never filed without the player looking at it.
    assert.equal(route.autoFile, false);
});

test('the tournament buy-in carries buy-in, fee and name into the entry prefill', () => {
    const route = routeScan(normaliseScan(scan(TOURNAMENT)));
    assert.equal(route.prefill.buy_in_amount, 300);
    assert.equal(route.prefill.fee, 40);
    assert.equal(route.prefill.gross_in, 300);
    assert.equal(route.prefill.tournament_name, 'Event 12 SUNDAY DEEP STACK NLH');
    assert.equal(route.prefill.location_name, 'Bellagio');
});

test('the cash out becomes money out, never money in', () => {
    const route = routeScan(normaliseScan(scan(CASH_OUT)));
    assert.equal(route.prefill.gross_out, 1875);
    assert.equal(route.prefill.gross_in, undefined);
});

// ---------------------------------------------------------------------------
// IT NEVER THROWS, WHATEVER THE CAMERA PRODUCED
// ---------------------------------------------------------------------------

test('empty, null and hostile input give unknown rather than an exception', () => {
    for (const input of ['', '   ', '\n\n\n', null, undefined, 0, {}, []]) {
        const out = parseReceiptText(input, { knownVenues: VENUES });
        assert.equal(out.document_type, 'unknown');
        assert.equal(out.currency, 'USD');
        assert.ok(out.confidence <= 30);
    }
});

test('a malformed venue list is survived', () => {
    for (const venues of [null, undefined, 'Bellagio', [null], [{}], [{ name: '' }], [{ name: 'ok' }]]) {
        assert.doesNotThrow(() => parseReceiptText(TOURNAMENT, { knownVenues: venues }));
    }
});

test('a very long line does not become a very long field', () => {
    const out = scan(`${'X'.repeat(4000)}\nCASH GAME BUY-IN\nTABLE 2\nCHIPS 500.00`);
    assert.ok(out.vendor.length <= 120);
    assert.ok(out.description.length <= 200);
});

// ---------------------------------------------------------------------------
// THE READER IS OURS: NO MODEL, NO NETWORK
// ---------------------------------------------------------------------------

test('the reader calls no model and reaches no network', () => {
    const source = code('src/lib/bankroll/receiptParser.mjs');
    assert.doesNotMatch(source, /\bfetch\s*\(/, 'the reader must not reach the network');
    assert.doesNotMatch(source, /\bimport\s*\(/, 'the reader must not load anything at runtime');
    assert.doesNotMatch(source, /grok|openai|anthropic|x\.ai|api_key|apiKey/i, 'the reader must not name a model');
});

test('the reader is pure: the same text reads the same way twice', () => {
    for (const [, text] of CLASSIFICATIONS) {
        assert.deepEqual(scan(text), scan(text));
    }
});
