/**
 * OUR OWN READER. NO MODEL, NO NETWORK, NO GUESSING.
 *
 * Until 2026-09-09 a photographed receipt was sent to a vision model, which
 * answered with a JSON object we trusted. Three things were wrong with that
 * beyond the cost: the same receipt could come back different twice, the whole
 * feature died the day a model id was retired, and a player's tax form left
 * the building to be read by somebody else's computer.
 *
 * This module is the replacement. It takes TEXT - produced on the device by
 * the bundled Tesseract engine in src/lib/docscan/ocr.mjs - and decides what
 * the document is and what it says, using rules written here and testable
 * without a camera, a network or a model.
 *
 * THE SHAPE IT RETURNS IS UNCHANGED. Everything downstream (normaliseScan,
 * routeScan, receiptInbox, the sheet) already consumes exactly these fields,
 * so the reader was swapped without touching the decisions built on it.
 *
 * HOW IT DECIDES
 * Evidence, scored, never a single keyword. A line saying BUY-IN is worth
 * something; BUY-IN plus EVENT plus a fee line is worth a lot more. Where the
 * evidence is thin the type is `unknown` and confidence is low, which routes
 * to the manual choice rather than filing money in the wrong column. That is
 * the same floor the router already enforces (AUTOFILE_MIN_CONFIDENCE).
 *
 * WHAT IT KNOWS THAT A MODEL DID NOT
 * The caller passes the player's own saved venues. Matching "BELLAG10 P0KER
 * ROOM" (OCR confuses O and 0) against a venue they have played before is
 * something a general model cannot do and a rule can.
 *
 * EVERY PHRASE IS MATCHED ON WHOLE WORDS. That is not a detail: "TOTAL"
 * inside "SUBTOTAL" once filed a 177.73 dinner as 138.00, and the venue
 * "ARIA" inside the server's name "MARIA" once put a steakhouse receipt in
 * the Aria poker room.
 */

/** Document types, identical to the set receiptRouting.mjs routes. */
export const DOC_TYPES = [
    'tournament_buyin', 'cash_game_buyin', 'payout', 'w2g', 'expense', 'paystub', 'unknown',
];

// ---------------------------------------------------------------------------
// TEXT NORMALISATION
// ---------------------------------------------------------------------------

/**
 * Fold a line for keyword matching, remembering where every folded character
 * came from.
 *
 * OCR confuses a small, fixed set of glyphs (0/O, 1/I, 5/S, 8/B). Folding them
 * makes keyword matching robust. The values we extract are read from the
 * ORIGINAL text, so a digit is never invented; the index map is what lets
 * amountFor find a label in the folded text and then read the money printed to
 * the right of it in the real one.
 */
function foldMapped(line) {
    const src = String(line || '');
    let text = '';
    const index = [];
    let pendingSpace = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i].toUpperCase();
        let out = ch;
        if (ch === '0') out = 'O';
        else if (ch === '1' || ch === '|' || ch === '!') out = 'I';
        else if (ch === '5') out = 'S';
        else if (ch === '8') out = 'B';
        if (out >= 'A' && out <= 'Z') {
            if (pendingSpace && text) {
                text += ' ';
                index.push(i);
            }
            pendingSpace = false;
            text += out;
            index.push(i);
        } else {
            pendingSpace = true;
        }
    }
    return { text, index };
}

function fold(line) {
    return foldMapped(line).text;
}

/**
 * Where a phrase starts in folded text, on WHOLE WORDS only, or -1.
 *
 * The word boundary is the whole point. Substring matching reads TOTAL out of
 * SUBTOTAL and ARIA out of MARIA, and both of those put money in the wrong
 * place on a real receipt.
 */
function phraseAt(foldedText, foldedPhrase) {
    if (!foldedPhrase) return -1;
    let from = 0;
    for (;;) {
        const at = foldedText.indexOf(foldedPhrase, from);
        if (at < 0) return -1;
        const before = at === 0 ? ' ' : foldedText[at - 1];
        const afterIndex = at + foldedPhrase.length;
        const after = afterIndex >= foldedText.length ? ' ' : foldedText[afterIndex];
        if (before === ' ' && after === ' ') return at;
        from = at + 1;
    }
}

function containsPhrase(foldedText, foldedPhrase) {
    return phraseAt(foldedText, foldedPhrase) >= 0;
}

/** Split into trimmed, non-empty lines, keeping the original characters. */
export function toLines(rawText) {
    return String(rawText || '')
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

// ---------------------------------------------------------------------------
// MONEY AND DATES
// ---------------------------------------------------------------------------

/**
 * Every money amount on a line, in order, as numbers.
 *
 * Deliberately strict: a bare integer is only money when it carries a currency
 * mark or two decimal places. "TABLE 12" and "SEAT 4" are not amounts, and a
 * reader that thinks they are files a 12 dollar buy-in. "STARTING STACK
 * 30,000" is not 30000 dollars either.
 */
export function moneyOn(line) {
    const out = [];
    const text = String(line || '');
    const re = /(\$\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.(\d{2}))?/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const hasSymbol = Boolean(m[1]);
        const hasCents = Boolean(m[3]);
        if (!hasSymbol && !hasCents) continue;
        const value = Number(`${m[2].replace(/,/g, '')}${hasCents ? `.${m[4]}` : ''}`);
        if (Number.isFinite(value)) out.push(value);
    }
    return out;
}

const MONTHS = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function iso(y, m, d) {
    if (!(y >= 1990 && y <= 2100) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The first date on a line, in the formats these rooms actually print.
 *
 * A two-digit year is 20xx: a receipt from 1998 is not being scanned into a
 * bankroll, and reading 08/15/98 as 1998 puts a session in the wrong century
 * and the wrong tax year.
 */
export function dateOn(line) {
    const text = String(line || '');

    const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return iso(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

    const slash = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (slash) {
        const year = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
        return iso(year, +slash[1], +slash[2]);
    }

    const named = text.toUpperCase().match(/\b([A-Z]{3})[A-Z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
    if (named && MONTHS[named[1]]) return iso(+named[3], MONTHS[named[1]], +named[2]);

    const reversed = text.toUpperCase().match(/\b(\d{1,2})\s+([A-Z]{3})[A-Z]*\.?\s+(\d{4})\b/);
    if (reversed && MONTHS[reversed[2]]) return iso(+reversed[3], MONTHS[reversed[2]], +reversed[1]);

    return null;
}

// ---------------------------------------------------------------------------
// LABELLED FIELDS
// ---------------------------------------------------------------------------

/**
 * The amount belonging to a label, and the line it was printed on.
 *
 * LABELS ARE TRIED IN THE ORDER GIVEN, each across the whole document, so a
 * caller asking for ['NET PAY', 'GROSS PAY'] gets net pay even though gross
 * pay is printed higher up the stub. Within a line the amount to the RIGHT of
 * the label wins, because "BUY-IN 300.00 FEE 40.00" is one line on plenty of
 * printers. A label with nothing on its own line takes the next amount within
 * two lines, which is how boxed forms print.
 *
 * `notWith` refuses a line outright. `mustBeRight` is softer and is what a
 * shared line needs: when the line ALSO carries one of those phrases, only an
 * amount printed to the right of our label counts, because "BUY-IN 200.00 FEE
 * 25.00" has two labels and two amounts and neither one owns the other.
 */
function amountEntryFor(lines, labels, options = {}) {
    const folded = lines.map(foldMapped);
    const avoid = (options.notWith || []).map(fold);
    const shared = (options.mustBeRight || []).map(fold);
    for (const label of labels) {
        const wanted = fold(label);
        if (!wanted) continue;
        for (let i = 0; i < lines.length; i++) {
            const at = phraseAt(folded[i].text, wanted);
            if (at < 0) continue;
            if (avoid.some((n) => n && containsPhrase(folded[i].text, n))) continue;

            const lastFolded = at + wanted.length - 1;
            const cut = folded[i].index[lastFolded] + 1;
            const right = moneyOn(lines[i].slice(cut));
            if (right.length) return { value: right[0], line: i, count: moneyOn(lines[i]).length };

            const crowded = shared.some((n) => n && containsPhrase(folded[i].text, n));
            if (crowded) continue;

            const own = moneyOn(lines[i]);
            if (own.length) return { value: own[own.length - 1], line: i, count: own.length };

            for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
                const next = moneyOn(lines[j]);
                if (next.length) return { value: next[0], line: j, count: next.length };
            }
        }
    }
    return null;
}

/** The amount belonging to a label. See amountEntryFor for how it is chosen. */
export function amountFor(lines, labels, options = {}) {
    const found = amountEntryFor(lines, labels, options);
    return found ? found.value : null;
}

/** The date printed on, or just under, a label. Forms carry several dates. */
function dateNear(lines, labels) {
    const folded = lines.map(fold);
    for (const label of labels) {
        const wanted = fold(label);
        if (!wanted) continue;
        for (let i = 0; i < lines.length; i++) {
            if (!containsPhrase(folded[i], wanted)) continue;
            for (let j = i; j <= i + 2 && j < lines.length; j++) {
                const found = dateOn(lines[j]);
                if (found) return found;
            }
        }
    }
    return null;
}

/** Does any line carry any of these phrases, as whole words? */
export function hasAny(lines, phrases) {
    const folded = lines.map(fold);
    return phrases.some((p) => {
        const f = fold(p);
        return f && folded.some((l) => containsPhrase(l, f));
    });
}

function countAny(lines, phrases) {
    const folded = lines.map(fold);
    return phrases.reduce((n, p) => {
        const f = fold(p);
        return n + (f && folded.some((l) => containsPhrase(l, f)) ? 1 : 0);
    }, 0);
}

// ---------------------------------------------------------------------------
// WHAT KIND OF DOCUMENT IS THIS
// ---------------------------------------------------------------------------

/** Phrases that identify each document, and what each one is worth. */
const EVIDENCE = {
    w2g: {
        strong: ['W-2G', 'W2G', 'CERTAIN GAMBLING WINNINGS', 'GROSS WINNINGS'],
        weak: ['FEDERAL INCOME TAX WITHHELD', 'STATE INCOME TAX WITHHELD', 'PAYER', 'WINNER', 'TYPE OF WAGER', 'DATE WON'],
    },
    tournament_buyin: {
        strong: ['TOURNAMENT', 'EVENT #', 'EVENT NO', 'RE-ENTRY', 'REENTRY'],
        weak: ['BUY-IN', 'BUY IN', 'BUYIN', 'ENTRY FEE', 'ENTRY', 'FEE', 'SEAT', 'TABLE', 'FLIGHT', 'STARTING STACK'],
    },
    cash_game_buyin: {
        strong: ['CASH GAME', 'TABLE BUY-IN', 'CHIP PURCHASE', 'RACK'],
        weak: ['BUY-IN', 'BUY IN', 'SEAT', 'TABLE', 'CHIPS', 'NLH', 'NLHE', 'PLO', 'HOLDEM', 'HOLD EM', 'LIMIT'],
    },
    payout: {
        strong: ['CASH OUT', 'CASHOUT', 'TICKET OUT', 'TITO', 'REDEEM', 'PAYOUT', 'PRIZE'],
        weak: ['PLACE', 'FINISH', 'FINISHED', 'POSITION', 'WINNINGS', 'COLLECT'],
    },
    paystub: {
        strong: ['EARNINGS STATEMENT', 'PAY PERIOD', 'GROSS PAY', 'NET PAY', 'PAYROLL'],
        weak: ['TOKES', 'TOKE', 'TIPS DECLARED', 'HOURS', 'YTD', 'DEDUCTIONS'],
    },
    expense: {
        // A ride, a pump and a folio identify a trip cost as plainly as a
        // guest check does. Left as weak evidence, an Uber receipt (four
        // lines and a total) scored 1 and fell through to `unknown`, which is
        // the single most common expense a player photographs on a trip.
        strong: [
            'GUEST CHECK', 'SERVER', 'ROOM CHARGE', 'FOLIO', 'GALLONS', 'PUMP',
            'RENTAL AGREEMENT', 'BOARDING PASS', 'TRIP RECEIPT',
            'UBER', 'LYFT', 'TAXI', 'PARKING',
        ],
        // HOTEL and RESTAURANT stay weak on purpose: they are printed in the
        // names of the rooms a player buys into.
        weak: ['SUBTOTAL', 'TAX', 'TIP', 'GRATUITY', 'HOTEL', 'RESTAURANT', 'RESORT FEE', 'NIGHTS', 'FUEL', 'CHECK IN', 'CHECK OUT'],
    },
};

/** Expense categories, mapped to the values receiptRouting already understands. */
const EXPENSE_CATEGORIES = [
    ['hotel', ['HOTEL', 'ROOM CHARGE', 'FOLIO', 'RESORT FEE', 'CHECK IN', 'CHECK OUT', 'NIGHTS', 'INN', 'SUITES']],
    ['flights', ['BOARDING PASS', 'AIRLINE', 'FLIGHT', 'DEPARTURE', 'BAGGAGE', 'AIRWAYS']],
    ['rental_car', ['RENTAL AGREEMENT', 'RENTAL CAR', 'HERTZ', 'AVIS', 'ENTERPRISE', 'BUDGET RENT']],
    ['gas', ['GALLONS', 'PUMP', 'FUEL', 'UNLEADED', 'DIESEL', 'SHELL', 'CHEVRON']],
    ['transport', ['UBER', 'LYFT', 'TAXI', 'CAB', 'SHUTTLE', 'PARKING', 'VALET']],
    ['meals', ['GUEST CHECK', 'SERVER', 'RESTAURANT', 'CAFE', 'GRILL', 'STEAKHOUSE', 'BUFFET', 'DINER', 'BAR']],
    ['tips', ['GRATUITY', 'TIP']],
];

/**
 * Score every candidate and take the winner.
 *
 * Strong phrases are worth 3, weak ones 1, and a type needs at least one
 * strong phrase or three weak ones to be claimed at all. That threshold is
 * what keeps a dinner receipt with the word TABLE on it from becoming a cash
 * game buy-in.
 */
export function classify(lines) {
    const scores = {};
    for (const [type, ev] of Object.entries(EVIDENCE)) {
        const strong = countAny(lines, ev.strong);
        const weak = countAny(lines, ev.weak);
        scores[type] = { score: strong * 3 + weak, strong, weak };
    }

    // A tournament and a cash game share most of their weak words; the strong
    // ones separate them, and TOURNAMENT beats a bare TABLE every time.
    if (scores.tournament_buyin.strong > 0) scores.cash_game_buyin.score -= 3;
    // A W-2G names a payout too. It is a tax form first.
    if (scores.w2g.strong > 0) scores.payout.score -= 3;

    const ranked = Object.entries(scores)
        .map(([type, s]) => ({ type, ...s }))
        .sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));

    const best = ranked[0];
    const qualifies = best && (best.strong > 0 || best.weak >= 3);
    if (!qualifies) return { documentType: 'unknown', score: 0, runnerUp: 0 };
    return { documentType: best.type, score: best.score, runnerUp: ranked[1] ? Math.max(0, ranked[1].score) : 0 };
}

// ---------------------------------------------------------------------------
// WHO PRINTED IT
// ---------------------------------------------------------------------------

/**
 * The venue, preferring one the player has actually played.
 *
 * A saved venue is matched through the same glyph folding, so "BELLAG10 P0KER
 * ROOM" still matches "Bellagio". That is the whole advantage of owning the
 * reader: it knows this player's world, which no general model does. The match
 * is on whole words, so the venue "Aria" does not match the server called
 * Maria on a steakhouse check.
 */
export function findVendor(lines, knownVenues = []) {
    const folded = lines.map(fold);

    for (const venue of knownVenues) {
        const name = venue && (venue.name || venue);
        const key = fold(name);
        if (key.length < 4) continue;
        const at = folded.findIndex((l) => containsPhrase(l, key));
        if (at >= 0) return { vendor: String(name), matchedVenue: venue, line: at };
    }

    // Otherwise the first line near the top that reads like a name: letters,
    // not a date, not an amount, not a label.
    const limit = Math.min(lines.length, 6);
    for (let i = 0; i < limit; i++) {
        const line = lines[i];
        if (dateOn(line) || moneyOn(line).length) continue;
        const letters = (line.match(/[A-Za-z]/g) || []).length;
        if (letters < 4) continue;
        if (/^(RECEIPT|CUSTOMER|MERCHANT|COPY|ORDER|INVOICE|TICKET)\b/i.test(line)) continue;
        return { vendor: line.slice(0, 120), matchedVenue: null, line: i };
    }
    return { vendor: '', matchedVenue: null, line: -1 };
}

/** The first date anywhere, top down: receipts print it near the header. */
function findDate(lines) {
    for (const line of lines) {
        const d = dateOn(line);
        if (d) return d;
    }
    return null;
}

/** The largest amount on the document, used as a last-resort total. */
function largestAmount(lines) {
    let best = null;
    for (const line of lines) {
        for (const value of moneyOn(line)) {
            if (best === null || value > best) best = value;
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// THE READ
// ---------------------------------------------------------------------------

/**
 * Confidence, 0-100, from what was actually found rather than a model's mood.
 *
 * It has to mean the same thing the old score meant, because
 * AUTOFILE_MIN_CONFIDENCE (0.55) decides whether anything files itself. So:
 * a clear document type with the amount that type needs, a date and a venue
 * is high; a type claimed on thin evidence with no amount is low, and low
 * means the sheet asks instead of filing.
 */
function scoreConfidence({ documentType, score, runnerUp, amount, date, vendor, matchedVenue }) {
    if (documentType === 'unknown') return Math.min(30, 10 + score * 2);
    let c = 35;
    c += Math.min(25, score * 3);
    if (score - runnerUp >= 3) c += 10;
    if (amount !== null && amount !== undefined) c += 15;
    if (date) c += 8;
    if (vendor) c += 4;
    if (matchedVenue) c += 8;
    return Math.max(0, Math.min(100, c));
}

/**
 * Read a document.
 *
 * @param {string} rawText   what the OCR engine produced
 * @param {object} [options]
 * @param {Array}  [options.knownVenues] the player's saved locations
 * @returns {object} the same field set the vision route used to return, so
 *          normaliseScan and routeScan consume it unchanged.
 */
export function parseReceiptText(rawText, options = {}) {
    const lines = toLines(rawText);
    const knownVenues = Array.isArray(options.knownVenues) ? options.knownVenues : [];

    if (lines.length === 0) {
        return { document_type: 'unknown', confidence: 0, vendor: '', date: null, amount: null, currency: 'USD', description: '' };
    }

    const { documentType, score, runnerUp } = classify(lines);
    const { vendor, matchedVenue } = findVendor(lines, knownVenues);
    const date = findDate(lines);

    const out = {
        document_type: documentType,
        vendor,
        location: matchedVenue && matchedVenue.name ? matchedVenue.name : '',
        date,
        currency: 'USD',
        description: lines.slice(0, 3).join(' ').slice(0, 200),
        amount: null,
    };

    if (documentType === 'w2g') {
        // Box 1, box 4 and box 15 on the form. Read by their printed labels,
        // not by position: every payer lays the boxes out differently.
        out.form_type = 'W-2G';
        out.gross_winnings = amountFor(lines, ['GROSS WINNINGS', 'REPORTABLE WINNINGS', 'WINNINGS']);
        out.federal_withheld = amountFor(lines, [
            'FEDERAL INCOME TAX WITHHELD', 'FEDERAL TAX WITHHELD', 'FEDERAL WITHHELD', 'FEDERAL WITHHOLDING', 'FED TAX',
        ]);
        out.state_withheld = amountFor(lines, [
            'STATE INCOME TAX WITHHELD', 'STATE TAX WITHHELD', 'STATE WITHHELD', 'STATE WITHHOLDING',
        ]);
        out.amount = out.gross_winnings;
        // The date that matters on a W-2G is the date won, not the date the
        // form was printed or the address it was mailed to.
        out.date = dateNear(lines, ['DATE WON', 'DATE OF WIN', 'DATE PAID']) || date;
        out.tax_year = yearFrom(lines, out.date);
    } else if (documentType === 'tournament_buyin') {
        const buyInAt = amountEntryFor(lines, ['BUY-IN', 'BUY IN', 'BUYIN'], { notWith: ['TOTAL'] });
        const feeAt = amountEntryFor(lines, ['ENTRY FEE', 'FEE', 'RAKE', 'ADMIN'], {
            mustBeRight: ['BUY-IN', 'BUY IN', 'BUYIN'],
        });
        out.buy_in = buyInAt ? buyInAt.value : null;
        out.fee = feeAt ? feeAt.value : null;
        // "BUY-IN + FEE 225.00" is one label, one amount, and no way to split
        // it. Reading 225 into both columns would double the entry cost.
        if (buyInAt && feeAt && buyInAt.line === feeAt.line && buyInAt.count < 2) out.fee = null;
        out.tournament_name = findTournamentName(lines);
        out.amount = amountFor(lines, ['TOTAL', 'AMOUNT PAID', 'PAID'])
            ?? sumOrNull(out.buy_in, out.fee)
            ?? largestAmount(lines);
        if (out.buy_in === null && out.amount !== null && out.fee !== null) out.buy_in = round2(out.amount - out.fee);
        if (out.buy_in === null && out.fee === null) out.buy_in = out.amount;
        out.game_type = findGameType(lines);
    } else if (documentType === 'cash_game_buyin') {
        out.amount = amountFor(lines, ['BUY-IN', 'BUY IN', 'BUYIN', 'CHIPS', 'TOTAL', 'AMOUNT']) ?? largestAmount(lines);
        out.stakes = findStakes(lines);
        out.game_type = findGameType(lines);
    } else if (documentType === 'payout') {
        out.payout = amountFor(lines, ['CASH OUT', 'CASHOUT', 'PAYOUT', 'PRIZE', 'TOTAL', 'AMOUNT', 'REDEEM']) ?? largestAmount(lines);
        out.amount = out.payout;
        out.finish_position = findFinishPosition(lines);
    } else if (documentType === 'paystub') {
        out.amount = amountFor(lines, ['NET PAY', 'GROSS PAY', 'TOTAL']) ?? largestAmount(lines);
    } else if (documentType === 'expense') {
        out.amount = amountFor(lines, ['GRAND TOTAL', 'AMOUNT DUE', 'BALANCE DUE', 'TOTAL', 'AMOUNT']) ?? largestAmount(lines);
        out.category = findExpenseCategory(lines);
    } else {
        out.amount = largestAmount(lines);
    }

    out.confidence = scoreConfidence({ documentType, score, runnerUp, amount: out.amount, date: out.date, vendor, matchedVenue });
    return out;
}

function round2(n) {
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function sumOrNull(a, b) {
    if (a === null && b === null) return null;
    return round2((a || 0) + (b || 0));
}

/** The tax year: an explicit form year, else the year of the date on it. */
function yearFrom(lines, date) {
    const folded = lines.map(fold);
    for (let i = 0; i < lines.length; i++) {
        if (!/W\s?[-]?\s?B?G|CERTAIN GAMBLING|TAX YEAR|FOR CALENDAR YEAR/.test(folded[i])) continue;
        const year = lines[i].match(/\b(20\d{2})\b/);
        if (year) return Number(year[1]);
    }
    for (const line of lines) {
        const year = line.match(/\b(20[1-4]\d)\b/);
        if (year) return Number(year[1]);
    }
    return date ? Number(date.slice(0, 4)) : null;
}

/** Boilerplate that is printed above a tournament name but is not one. */
const NOT_A_NAME = /^(RECEIPT|ENTRY|ENTRY RECEIPT|BUY[- ]?IN|BUY[- ]?IN RECEIPT|REGISTRATION|REGISTRATION RECEIPT|TICKET|COPY|CUSTOMER COPY|MERCHANT COPY)$/i;

/** Money is dropped from a candidate name; "EVENT #5 $150 DEEPSTACK" is one. */
function cleanName(tail) {
    const name = String(tail)
        .replace(/\s{2,}.*$/, '')
        .replace(/\$\s?\d[\d,]*(\.\d{2})?/g, ' ')
        .replace(/\b\d[\d,]*\.\d{2}\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (name.length < 2) return '';
    if (NOT_A_NAME.test(name)) return '';
    return name;
}

/**
 * "EVENT #12 SUNDAY DEEP STACK NLH" and the shapes around it.
 *
 * The EVENT line is preferred over the TOURNAMENT line, because rooms print
 * "TOURNAMENT ENTRY RECEIPT" as a header and the event is the actual name.
 */
function findTournamentName(lines) {
    for (const line of lines) {
        const m = line.match(/\bEVENT\b\s*(?:#|NO\.?|NUMBER)?\s*[:.]?\s*(.+)/i);
        if (!m) continue;
        const name = cleanName(m[1]);
        if (name) return `Event ${name}`.slice(0, 120);
    }
    for (const line of lines) {
        const m = line.match(/\bTOURNAMENT\b\s*#?\s*[:.]?\s*(.+)/i);
        if (!m) continue;
        const name = cleanName(m[1]);
        if (name) return name.slice(0, 120);
    }
    for (const line of lines) {
        if (/DEEP ?STACK|TURBO|BOUNTY|FREEZEOUT|SATELLITE|MAIN EVENT|OMAHA|SURVIVOR/i.test(line) && !moneyOn(line).length) {
            return line.slice(0, 120);
        }
    }
    return '';
}

/** "1/2", "$2/$5", "5-10" printed anywhere, but never a date or a phone number. */
function findStakes(lines) {
    for (const line of lines) {
        if (dateOn(line)) continue;
        if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(line)) continue;
        const m = line.match(/(?<![\d$.])\$?\s?(\d{1,3})\s?[/-]\s?\$?\s?(\d{1,4})(?:\s?[/-]\s?\$?\s?(\d{1,4}))?(?![\d.])/);
        if (!m) continue;
        const a = Number(m[1]);
        const b = Number(m[2]);
        if (a > 0 && b >= a && b <= 2000) return m[3] ? `${a}/${b}/${Number(m[3])}` : `${a}/${b}`;
    }
    return '';
}

const GAME_TYPES = [
    ['plo', ['PLO', 'POT LIMIT OMAHA', 'OMAHA']],
    ['nlhe', ['NLH', 'NLHE', 'NO LIMIT HOLD', 'HOLDEM', 'HOLD EM', 'TEXAS HOLD']],
    ['limit', ['LIMIT HOLD', 'FIXED LIMIT']],
    ['mixed', ['MIXED', 'HORSE', 'ROYAL']],
];

function findGameType(lines) {
    for (const [value, phrases] of GAME_TYPES) {
        if (hasAny(lines, phrases)) return value;
    }
    return '';
}

/** "3RD PLACE", "FINISHED 12", "PLACE: 5". */
function findFinishPosition(lines) {
    for (const line of lines) {
        const ordinal = line.match(/\b(\d{1,3})\s?(?:ST|ND|RD|TH)\b/i);
        if (ordinal) return Number(ordinal[1]);
        const labelled = line.match(/\b(?:PLACE|FINISH|FINISHED|POSITION)\b\s*[:#]?\s*(\d{1,3})\b/i);
        if (labelled) return Number(labelled[1]);
    }
    return null;
}

function findExpenseCategory(lines) {
    for (const [category, phrases] of EXPENSE_CATEGORIES) {
        if (hasAny(lines, phrases)) return category;
    }
    return 'other';
}
