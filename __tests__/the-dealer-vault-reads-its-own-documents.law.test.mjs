/**
 * THE DEALER VAULT READS ITS OWN DOCUMENTS
 *
 * A gaming card, a W-2, an I-9, a paystub. Government paper that prints the
 * same words in the same boxes every year, which is the easiest thing in the
 * world for a rule and a waste of a vision model.
 *
 * The field that matters most is expiry_date. A dealer whose gaming card
 * lapses cannot work that night, and the vault's whole reason for existing is
 * to warn them first. It is read off its own printed label or left empty. An
 * invented deadline would be worse than none, because the dealer would plan
 * around it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseDealerDocumentText,
    classifyDealerDocument,
    findState,
    findLicenseNumber,
    CATEGORIES,
} from '../src/lib/bankroll/dealerDocParser.mjs';
import { toLines } from '../src/lib/bankroll/receiptParser.mjs';

const GAMING_CARD = `STATE OF NEVADA
GAMING CONTROL BOARD
GAMING EMPLOYEE REGISTRATION
NAME: DANIEL B
REGISTRATION NO: R-1148822
ISSUED 05/01/2021
EXPIRES 04/30/2027`;

const NJ_CARD = `NEW JERSEY DIVISION OF GAMING ENFORCEMENT
CASINO KEY EMPLOYEE LICENSE
LICENSE NO. KE-99120
ISSUE DATE 02/14/2024
VALID THROUGH 02/13/2029`;

const W2 = `Form W-2 Wage and Tax Statement 2025
EMPLOYER MGM GRAND HOTEL LLC
LAS VEGAS, NV 89109
1 Wages tips other compensation   64,208.41
2 Federal income tax withheld      7,912.00`;

const FORM_1099 = `Form 1099-NEC 2025
Nonemployee Compensation
PAYER SOUTH POINT HOTEL
1 Nonemployee compensation   12,400.00`;

const TIP_LOG = `TOKE LOG
AUGUST 2026
DAILY TIPS
08/01/2026  212.00
08/02/2026  188.50`;

const I9 = `Form I-9
Employment Eligibility Verification
Department of Homeland Security
EMPLOYEE NAME DANIEL B
HIRE DATE 03/12/2024
SIGNATURE`;

const PAYSTUB = `MGM GRAND
EARNINGS STATEMENT
PAY PERIOD 08/16/2026 - 08/31/2026
CHECK DATE 09/04/2026
TOKES DECLARED 1,412.00
GROSS PAY 2,340.55
NET PAY 1,828.45`;

const JUNK = `blurry
zz 4`;

// ---------------------------------------------------------------------------
// WHICH OF THE FOUR IS IT
// ---------------------------------------------------------------------------

const CLASSIFICATIONS = [
    ['a Nevada gaming card', GAMING_CARD, 'gaming_license'],
    ['a New Jersey key employee licence', NJ_CARD, 'gaming_license'],
    ['a W-2', W2, 'tax'],
    ['a 1099', FORM_1099, 'tax'],
    ['a toke log', TIP_LOG, 'tax'],
    ['an I-9', I9, 'employment'],
    ['a paystub', PAYSTUB, 'paystub'],
];

for (const [what, text, category] of CLASSIFICATIONS) {
    test(`${what} is filed under ${category}`, () => {
        assert.equal(classifyDealerDocument(toLines(text)).category, category);
        assert.equal(parseDealerDocumentText(text).category, category);
    });
}

test('a W-2 is a tax form before it is proof of employment', () => {
    // Both name an employer and an employee. Filed under employment, a W-2
    // never reaches the tax year it belongs to.
    assert.equal(parseDealerDocumentText(W2).category, 'tax');
    assert.equal(parseDealerDocumentText(PAYSTUB).category, 'paystub');
});

test('every category this reader emits is one the vault has a tab for', () => {
    for (const [, text] of CLASSIFICATIONS) {
        assert.ok(CATEGORIES.includes(parseDealerDocumentText(text).category));
    }
});

test('unreadable paper is not filed anywhere', () => {
    const out = parseDealerDocumentText(JUNK);
    assert.equal(out.category, null);
    assert.equal(out.label, 'Unreadable Document');
    assert.ok(out.confidence <= 20);
});

// ---------------------------------------------------------------------------
// THE DATE A DEALER'S JOB DEPENDS ON
// ---------------------------------------------------------------------------

test('an expiry date is read off its own label', () => {
    assert.equal(parseDealerDocumentText(GAMING_CARD).expiry_date, '2027-04-30');
    assert.equal(parseDealerDocumentText(NJ_CARD).expiry_date, '2029-02-13');
});

test('an issue date is not mistaken for an expiry date', () => {
    const out = parseDealerDocumentText(GAMING_CARD);
    assert.equal(out.issued_date, '2021-05-01');
    assert.notEqual(out.issued_date, out.expiry_date);
});

test('a document with no expiry printed on it gets no expiry at all', () => {
    // Guessing here would put a reminder in a dealer's calendar for a
    // deadline that does not exist.
    for (const text of [W2, I9, PAYSTUB, TIP_LOG, JUNK]) {
        assert.equal(parseDealerDocumentText(text).expiry_date, null);
    }
});

// ---------------------------------------------------------------------------
// THE REST OF THE FIELDS
// ---------------------------------------------------------------------------

test('a licence number is read off its label and nowhere else', () => {
    assert.equal(findLicenseNumber(toLines(GAMING_CARD)), 'R-1148822');
    assert.equal(findLicenseNumber(toLines(NJ_CARD)), 'KE-99120');
    // A number floating on a card is as likely to be a form revision.
    assert.equal(findLicenseNumber(toLines('GAMING CONTROL BOARD\nFORM 12-B\n8829911')), null);
});

test('the state comes from its name or from a labelled code', () => {
    assert.equal(findState(toLines(GAMING_CARD)), 'NV');
    assert.equal(findState(toLines(NJ_CARD)), 'NJ');
    assert.equal(findState(toLines('LAS VEGAS, NV 89109')), 'NV');
    assert.equal(findState(toLines('STATE: FL')), 'FL');
    // "IN" and "OR" are words as well as states. A bare token is never enough.
    assert.equal(findState(toLines('PAID IN FULL OR RETURN')), null);
});

test('a tax form gives up its year and its box 1', () => {
    const out = parseDealerDocumentText(W2);
    assert.equal(out.sub_type, 'w2');
    assert.equal(out.tax_year, 2025);
    assert.equal(out.amount, 64208.41);
});

test('a 1099 and a toke log are told apart from a W-2', () => {
    assert.equal(parseDealerDocumentText(FORM_1099).sub_type, '1099');
    assert.equal(parseDealerDocumentText(TIP_LOG).sub_type, 'tip_log');
    assert.equal(parseDealerDocumentText(I9).sub_type, 'i9');
});

test('a paystub reads net pay, not the larger gross above it', () => {
    assert.equal(parseDealerDocumentText(PAYSTUB).amount, 1828.45);
});

test('the label is something a dealer would recognise in a list', () => {
    assert.equal(parseDealerDocumentText(GAMING_CARD).label, 'Nevada Gaming License');
    assert.equal(parseDealerDocumentText(NJ_CARD).label, 'New Jersey Gaming License');
    assert.equal(parseDealerDocumentText(W2).label, 'Nevada W-2 2025');
    assert.equal(parseDealerDocumentText(I9).label, 'Form I-9');
});

// ---------------------------------------------------------------------------
// IT NEVER THROWS
// ---------------------------------------------------------------------------

test('empty and hostile input give a null category rather than an exception', () => {
    for (const input of ['', '   ', '\n\n', null, undefined, 0, {}, []]) {
        const out = parseDealerDocumentText(input);
        assert.equal(out.category, null);
        assert.equal(out.expiry_date, null);
        assert.ok(out.confidence <= 20);
    }
});

test('the reader is pure: the same text reads the same way twice', () => {
    for (const [, text] of CLASSIFICATIONS) {
        assert.deepEqual(parseDealerDocumentText(text), parseDealerDocumentText(text));
    }
});
