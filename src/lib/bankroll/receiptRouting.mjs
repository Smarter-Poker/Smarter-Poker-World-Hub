/**
 * WHAT KIND OF DOCUMENT IS THIS, AND WHERE DOES IT GO
 *
 * A poker player photographs several different pieces of paper and expects one
 * place to put them: a tournament entry receipt, a cash game buy-in slip, a
 * cash-out ticket, a W-2G, a dinner receipt, a dealer paystub. Each belongs in
 * a different record with different fields, and asking the user to classify it
 * themselves is the work we are trying to remove.
 *
 * This module is the whole decision, kept pure so every rule is testable
 * without a camera, a network call or a model. The vision model classifies and
 * extracts; everything after that (what to trust, where it goes, what the
 * button says) happens here.
 */

/** Documents we can file. `unknown` is honest, not a failure. */
export const DOC_TYPES = [
    'tournament_buyin',
    'cash_game_buyin',
    'payout',
    'w2g',
    'expense',
    'paystub',
    'unknown',
];

/** Where a filed document ends up. */
export const DESTINATIONS = {
    SESSION: 'session',   // a bankroll entry with money in or out
    EXPENSE: 'expense',   // a bankroll expense entry
    TAX: 'tax',           // the W-2G record in Tax Reports
    TOKE: 'toke',         // dealer earnings, Toke Tracker
    MANUAL: 'manual',     // we are not confident enough to choose
};

/** OCR category -> the expense_type LogEntryModal actually stores. */
const EXPENSE_TYPE_MAP = {
    hotel: 'hotel',
    flights: 'flight',
    rental_car: 'rental_car',
    gas: 'gas',
    meals: 'meals',
    transport: 'rideshare',
    tips: 'tips',
    tournament: 'tournament_fee',
    buy_in: 'other',
    other: 'other',
};

function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
}

function toIsoDate(value) {
    if (!value) return null;
    const s = String(value).trim();
    // Already ISO.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // US-style, which is what almost every receipt in these rooms prints.
    const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (us) {
        const year = us[3].length === 2 ? `20${us[3]}` : us[3];
        return `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
    return null;
}

function cleanText(value, max = 120) {
    if (!value) return '';
    return String(value).trim().replace(/\s+/g, ' ').slice(0, max);
}

/**
 * Confidence below which we refuse to pick a destination for the user.
 *
 * Filing a tournament buy-in as a dinner is worse than asking. The number is
 * deliberately not tiny: a wrong bankroll entry is money in the wrong column.
 */
export const AUTOFILE_MIN_CONFIDENCE = 0.55;

/**
 * Normalise whatever the model returned into one predictable shape.
 * Never throws: a malformed response becomes `unknown`, which routes to manual.
 */
export function normaliseScan(raw) {
    const data = raw && typeof raw === 'object' ? raw : {};
    const declared = String(data.document_type || data.documentType || '').toLowerCase().trim();
    const labelled = DOC_TYPES.includes(declared) ? declared : 'unknown';
    const documentType = evidencedDocumentType(labelled, data);

    const rawConfidence = toNumber(data.confidence);
    // The model has been asked for 0-100; accept 0-1 too rather than reading a
    // 0.8 as "nearly no confidence".
    let confidence = rawConfidence === null ? 0 : rawConfidence;
    if (confidence > 1) confidence /= 100;
    confidence = Math.max(0, Math.min(1, confidence));

    return {
        documentType,
        confidence,
        vendor: cleanText(data.vendor || data.payer || data.venue),
        location: cleanText(data.location, 80),
        date: toIsoDate(data.date),
        amount: toNumber(data.amount ?? data.total),
        currency: cleanText(data.currency, 3).toUpperCase() || 'USD',
        category: cleanText(data.category, 24) || null,
        description: cleanText(data.description, 200),
        // Type-specific, all optional.
        tournamentName: cleanText(data.tournament_name, 120),
        buyIn: toNumber(data.buy_in),
        fee: toNumber(data.fee),
        stakes: cleanText(data.stakes, 24),
        gameType: cleanText(data.game_type, 24),
        payout: toNumber(data.payout),
        finishPosition: toNumber(data.finish_position),
        grossWinnings: toNumber(data.gross_winnings),
        federalWithheld: toNumber(data.federal_withheld),
        stateWithheld: toNumber(data.state_withheld),
        taxYear: toNumber(data.tax_year),
        formType: cleanText(data.form_type, 24),
    };
}

/**
 * The fields the model filled in are stronger evidence than the label it
 * chose. A W-2G has gross winnings and a withholding box; a tournament
 * receipt has a buy-in and an event name; a cash-out ticket has a payout.
 * When the label disagrees with fields only that document has, the fields
 * win, and a wrong bankroll entry is avoided rather than filed.
 *
 * Only unmistakable combinations override; a lone amount proves nothing.
 */
export function evidencedDocumentType(labelled, data) {
    const has = (k) => data[k] !== null && data[k] !== undefined && data[k] !== '';
    const form = String(data.form_type || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (form === 'W2G' || (has('gross_winnings') && (has('federal_withheld') || has('state_withheld')))) return 'w2g';
    if (labelled === 'w2g') return 'w2g';
    if (has('buy_in') && has('tournament_name')) return 'tournament_buyin';
    if (has('payout') && !has('buy_in') && (labelled === 'unknown' || labelled === 'expense')) return 'payout';
    return labelled;
}

/**
 * Decide where a scan goes and what it fills in.
 *
 * @returns {{destination:string, label:string, summary:string, autoFile:boolean, prefill:object}}
 *   `prefill` uses the field names the destination component already reads, so
 *   nothing downstream has to translate a second time.
 */
export function routeScan(scan) {
    const s = scan && scan.documentType ? scan : normaliseScan(scan);
    const confident = s.confidence >= AUTOFILE_MIN_CONFIDENCE;

    const base = {
        vendor: s.vendor,
        date: s.date,
        description: s.description,
        amount: s.amount,
    };

    switch (s.documentType) {
        case 'tournament_buyin': {
            const buyIn = s.buyIn ?? s.amount;
            return {
                destination: DESTINATIONS.SESSION,
                label: 'Log This Tournament Buy-In',
                summary: describe('Tournament Buy-In', s.tournamentName || s.vendor, buyIn, s.date),
                autoFile: confident && buyIn !== null,
                prefill: {
                    ...base,
                    entryKind: 'tournament',
                    // LogEntryModal reads these directly.
                    buy_in_amount: buyIn,
                    tournament_name: s.tournamentName || '',
                    location_name: s.vendor,
                    gross_in: buyIn,
                    fee: s.fee,
                    game_type: s.gameType || 'nlhe',
                },
            };
        }

        case 'cash_game_buyin':
            return {
                destination: DESTINATIONS.SESSION,
                label: 'Log This Cash Game Buy-In',
                summary: describe('Cash Game Buy-In', s.vendor, s.amount, s.date),
                autoFile: confident && s.amount !== null,
                prefill: {
                    ...base,
                    entryKind: 'cash',
                    gross_in: s.amount,
                    location_name: s.vendor,
                    stakes: s.stakes,
                    game_type: s.gameType || 'nlhe',
                },
            };

        case 'payout':
            return {
                destination: DESTINATIONS.SESSION,
                label: 'Log This Cash Out',
                summary: describe('Cash Out', s.vendor, s.payout ?? s.amount, s.date),
                autoFile: confident && (s.payout ?? s.amount) !== null,
                prefill: {
                    ...base,
                    entryKind: 'cashout',
                    gross_out: s.payout ?? s.amount,
                    location_name: s.vendor,
                    finish_position: s.finishPosition,
                },
            };

        case 'w2g':
            return {
                destination: DESTINATIONS.TAX,
                label: 'File This W-2G In Tax Reports',
                summary: describe('W-2G', s.vendor, s.grossWinnings ?? s.amount, s.date),
                // A tax form is never quietly filed. It is a legal record and
                // the year it lands in changes what somebody owes.
                autoFile: false,
                prefill: {
                    ...base,
                    form_type: s.formType || 'W-2G',
                    gross_amount: s.grossWinnings ?? s.amount,
                    federal_withheld: s.federalWithheld,
                    state_withheld: s.stateWithheld,
                    tax_year: s.taxYear || (s.date ? Number(s.date.slice(0, 4)) : null),
                    source_description: s.vendor || s.description,
                },
            };

        case 'paystub':
            return {
                destination: DESTINATIONS.TOKE,
                label: 'Add To Toke Tracker',
                summary: describe('Paystub', s.vendor, s.amount, s.date),
                autoFile: false,
                prefill: { ...base },
            };

        case 'expense':
            return {
                destination: DESTINATIONS.EXPENSE,
                label: 'Create This Expense',
                summary: describe('Expense', s.vendor, s.amount, s.date),
                autoFile: confident && s.amount !== null,
                prefill: {
                    ...base,
                    category: s.category || 'other',
                    expense_type: EXPENSE_TYPE_MAP[s.category] || 'other',
                },
            };

        default:
            return {
                destination: DESTINATIONS.MANUAL,
                label: 'Choose Where This Goes',
                summary: s.amount !== null ? describe('Receipt', s.vendor, s.amount, s.date) : 'Details Could Not Be Read',
                autoFile: false,
                prefill: { ...base, category: s.category || null },
            };
    }
}

function describe(kind, who, amount, date) {
    const parts = [kind];
    if (who) parts.push(who);
    if (amount !== null && amount !== undefined) parts.push(`$${Number(amount).toFixed(2)}`);
    if (date) parts.push(date);
    return parts.join(' - ');
}

/** Human label for a type, for the chips that let staff correct the guess. */
export const DOC_TYPE_LABELS = {
    tournament_buyin: 'Tournament Buy-In',
    cash_game_buyin: 'Cash Game Buy-In',
    payout: 'Cash Out',
    w2g: 'W-2G Tax Form',
    expense: 'Expense',
    paystub: 'Paystub',
    unknown: 'Not Sure',
};
