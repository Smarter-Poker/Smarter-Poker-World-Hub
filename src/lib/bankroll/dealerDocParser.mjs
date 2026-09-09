/**
 * THE DEALER VAULT READER. RULES, NOT A MODEL.
 *
 * A dealer photographs a gaming card, a W-2, an I-9 and a paystub and expects
 * the vault to file each one and remind them before the card expires. Until
 * 2026-09-09 that reading was done by a vision model, which is the wrong tool
 * for a document whose whole purpose is to say the same words every year.
 *
 * These are exactly the fields DealerVault stores, in the shape it already
 * reads, so nothing downstream changed when the reader did.
 *
 * THE FIELD THAT MATTERS MOST IS expiry_date. A gaming card that lapses stops
 * a dealer working that night. It is read from its own printed label ("EXPIRES
 * 04/30/2027"), never from whichever date happens to be largest, and when no
 * expiry label is printed the field stays null rather than guessing.
 */

import { toLines, moneyOn, dateOn, amountFor, hasAny } from './receiptParser.mjs';

export const CATEGORIES = ['gaming_license', 'tax', 'employment', 'paystub'];

const EVIDENCE = {
    gaming_license: {
        strong: [
            'GAMING CONTROL BOARD', 'GAMING LICENSE', 'GAMING REGISTRATION', 'GAMING COMMISSION',
            'CASINO KEY EMPLOYEE', 'NON GAMING', 'SHERIFF CARD', 'WORK CARD', 'WORK PERMIT',
            'DIVISION OF GAMING', 'GAMING EMPLOYEE',
        ],
        weak: ['LICENSE', 'LICENCE', 'REGISTRATION', 'PERMIT', 'EXPIRES', 'EXPIRATION', 'ISSUED', 'CARD NO', 'BADGE'],
    },
    tax: {
        strong: [
            'W-2', 'WAGE AND TAX STATEMENT', 'FORM W-2', 'FORM 1099', 'NONEMPLOYEE COMPENSATION',
            'MISCELLANEOUS INFORMATION', 'TIP LOG', 'TOKE LOG', 'W-2G',
        ],
        weak: ['WAGES TIPS OTHER COMPENSATION', 'FEDERAL INCOME TAX WITHHELD', 'SOCIAL SECURITY WAGES', 'EMPLOYER', 'IRS', 'TAX YEAR'],
    },
    employment: {
        strong: [
            'FORM I-9', 'EMPLOYMENT ELIGIBILITY VERIFICATION', 'EMPLOYMENT AGREEMENT',
            'OFFER LETTER', 'EMPLOYER IDENTIFICATION NUMBER', 'CP 575',
        ],
        weak: ['EMPLOYEE', 'EMPLOYER', 'HIRE DATE', 'POSITION', 'DEPARTMENT', 'SIGNATURE', 'AGREEMENT'],
    },
    paystub: {
        strong: ['EARNINGS STATEMENT', 'PAY PERIOD', 'GROSS PAY', 'NET PAY', 'PAYROLL', 'PAY STATEMENT'],
        weak: ['TOKES', 'TOKE', 'TIPS DECLARED', 'HOURS', 'YTD', 'DEDUCTIONS', 'CHECK DATE'],
    },
};

/** Sub-types, checked only once the category is known. */
const SUB_TYPES = {
    tax: [
        ['w2', ['W-2', 'FORM W-2', 'WAGE AND TAX STATEMENT']],
        ['1099', ['1099', 'FORM 1099', 'NONEMPLOYEE COMPENSATION', 'MISCELLANEOUS INFORMATION']],
        ['tip_log', ['TIP LOG', 'TOKE LOG', 'DAILY TIPS', 'TIP RECORD']],
    ],
    employment: [
        ['i9', ['FORM I-9', 'EMPLOYMENT ELIGIBILITY VERIFICATION']],
        ['ein_letter', ['EMPLOYER IDENTIFICATION NUMBER', 'CP 575', 'EIN']],
        ['contract', ['EMPLOYMENT AGREEMENT', 'OFFER LETTER', 'AGREEMENT', 'CONTRACT']],
    ],
};

/**
 * The states with casino floors a dealer actually works, plus the rest, so a
 * two-letter token is only read as a state when it IS one. "IN" and "OR" are
 * words as well as states, which is why a bare token is never enough on its
 * own: the name or an explicit label has to carry it.
 */
const STATE_NAMES = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
    COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
    HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
    KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
    MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO',
    MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH',
    OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
    VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY',
};

const STATE_CODES = new Set(Object.values(STATE_NAMES));

function countAny(lines, phrases) {
    return phrases.reduce((n, p) => n + (hasAny(lines, [p]) ? 1 : 0), 0);
}

/** Which of the four kinds of document is this, scored the same way receipts are. */
export function classifyDealerDocument(lines) {
    const scores = {};
    for (const [category, ev] of Object.entries(EVIDENCE)) {
        const strong = countAny(lines, ev.strong);
        const weak = countAny(lines, ev.weak);
        scores[category] = { score: strong * 3 + weak, strong, weak };
    }

    // A paystub names an employer and an employee too. The words that make it
    // a paystub are decisive, so it does not become "employment".
    if (scores.paystub.strong > 0) scores.employment.score -= 3;
    // A W-2 is a tax form before it is proof of employment.
    if (scores.tax.strong > 0) scores.employment.score -= 3;

    const ranked = Object.entries(scores)
        .map(([category, s]) => ({ category, ...s }))
        .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));

    const best = ranked[0];
    if (!best || !(best.strong > 0 || best.weak >= 3)) return { category: null, score: 0, runnerUp: 0 };
    return { category: best.category, score: best.score, runnerUp: ranked[1] ? Math.max(0, ranked[1].score) : 0 };
}

function findSubType(category, lines) {
    const table = SUB_TYPES[category];
    if (!table) return null;
    for (const [value, phrases] of table) {
        if (hasAny(lines, phrases)) return value;
    }
    return 'other';
}

/** The state, from its printed name or from a labelled two-letter code. */
export function findState(lines) {
    const upper = lines.map((l) => String(l).toUpperCase());
    for (const [name, code] of Object.entries(STATE_NAMES)) {
        const re = new RegExp(`\\b${name}\\b`);
        if (upper.some((l) => re.test(l))) return code;
    }
    // "STATE: NV" or "LAS VEGAS, NV 89109": a code next to a label or a zip.
    for (const line of upper) {
        const labelled = line.match(/\bSTATE\b\s*[:#]?\s*([A-Z]{2})\b/);
        if (labelled && STATE_CODES.has(labelled[1])) return labelled[1];
        const withZip = line.match(/,\s*([A-Z]{2})\s+\d{5}\b/);
        if (withZip && STATE_CODES.has(withZip[1])) return withZip[1];
    }
    return null;
}

/**
 * The licence or registration number.
 *
 * Read off its own label only. A number picked up from anywhere on a card is
 * as likely to be a form revision or a phone number, and a wrong licence
 * number in the vault is worse than an empty field a dealer can fill in.
 */
export function findLicenseNumber(lines) {
    const labels = /\b(?:LICENSE|LICENCE|REGISTRATION|CARD|BADGE|PERMIT|CERTIFICATE|ID)\s*(?:NO\.?|NUMBER|#)\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{3,24})/i;
    for (const line of lines) {
        const m = line.match(labels);
        if (m) return m[1].toUpperCase();
    }
    return null;
}

/** A date printed on, or just under, one of these labels. */
function dateFor(lines, labels) {
    for (const label of labels) {
        const re = new RegExp(`\\b${label}\\b`, 'i');
        for (let i = 0; i < lines.length; i++) {
            if (!re.test(lines[i])) continue;
            for (let j = i; j <= i + 2 && j < lines.length; j++) {
                const found = dateOn(lines[j]);
                if (found) return found;
            }
        }
    }
    return null;
}

function yearFor(lines) {
    for (const line of lines) {
        const near = line.match(/\b(?:TAX YEAR|FOR (?:CALENDAR )?YEAR|YEAR)\b\D{0,8}(20\d{2})\b/i);
        if (near) return Number(near[1]);
    }
    for (const line of lines) {
        const any = line.match(/\b(20[1-4]\d)\b/);
        if (any) return Number(any[1]);
    }
    return null;
}

const CATEGORY_LABELS = {
    gaming_license: 'Gaming License',
    tax: 'Tax Document',
    employment: 'Employment Document',
    paystub: 'Paystub',
};

const SUB_TYPE_LABELS = {
    w2: 'W-2', 1099: '1099', tip_log: 'Tip Log',
    i9: 'Form I-9', ein_letter: 'EIN Letter', contract: 'Employment Contract',
};

/** "NEW JERSEY" -> "New Jersey": the label goes on a card in a dealer's list. */
function titleCase(name) {
    return String(name)
        .toLowerCase()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

const CODE_TO_STATE = Object.fromEntries(
    Object.entries(STATE_NAMES).map(([name, code]) => [code, titleCase(name)]),
);

/** A name a dealer would recognise in a list: "Nevada Gaming License 2026". */
function buildLabel({ category, subType, state, year }) {
    if (!category) return 'Unreadable Document';
    const parts = [];
    if (state && CODE_TO_STATE[state]) parts.push(CODE_TO_STATE[state]);
    parts.push(SUB_TYPE_LABELS[subType] || CATEGORY_LABELS[category] || 'Document');
    if (year) parts.push(String(year));
    return parts.join(' ').slice(0, 80);
}

function scoreConfidence({ category, score, runnerUp, hasDate, hasNumber, hasAmount }) {
    if (!category) return 10;
    let c = 35;
    c += Math.min(25, score * 3);
    if (score - runnerUp >= 3) c += 10;
    if (hasDate) c += 12;
    if (hasNumber) c += 8;
    if (hasAmount) c += 8;
    return Math.max(0, Math.min(100, c));
}

/**
 * Read a dealer document.
 *
 * @param {string} rawText what the on-device OCR engine produced
 * @returns {object} the field set DealerVault already stores.
 */
export function parseDealerDocumentText(rawText) {
    const lines = toLines(rawText);
    if (lines.length === 0) {
        return {
            category: null, sub_type: null, label: 'Unreadable Document', state: null,
            license_number: null, issued_date: null, expiry_date: null,
            tax_year: null, amount: null, confidence: 0,
        };
    }

    const { category, score, runnerUp } = classifyDealerDocument(lines);
    const subType = category ? findSubType(category, lines) : null;
    const state = findState(lines);

    const issued = dateFor(lines, ['ISSUED', 'ISSUE DATE', 'DATE ISSUED', 'EFFECTIVE', 'HIRE DATE']);
    const expiry = dateFor(lines, ['EXPIRES', 'EXPIRATION', 'EXPIRY', 'EXP DATE', 'VALID THROUGH', 'VALID UNTIL', 'GOOD THROUGH']);
    const licenseNumber = findLicenseNumber(lines);
    const year = category === 'tax' || category === 'paystub' ? yearFor(lines) : null;

    let amount = null;
    if (category === 'paystub') {
        amount = amountFor(lines, ['NET PAY', 'GROSS PAY', 'TOTAL EARNINGS', 'TOTAL']);
    } else if (category === 'tax') {
        amount = amountFor(lines, ['WAGES TIPS OTHER COMPENSATION', 'GROSS WINNINGS', 'NONEMPLOYEE COMPENSATION', 'BOX 1']);
    }

    return {
        category,
        sub_type: subType,
        label: buildLabel({ category, subType, state, year }),
        state,
        license_number: licenseNumber,
        issued_date: issued,
        // Never inferred. A card with no printed expiry keeps an empty field
        // rather than an invented deadline the dealer would plan around.
        expiry_date: expiry,
        tax_year: year,
        amount,
        confidence: scoreConfidence({
            category, score, runnerUp,
            hasDate: Boolean(issued || expiry),
            hasNumber: Boolean(licenseNumber),
            hasAmount: amount !== null,
        }),
    };
}

/** Exported for the tests; the parser reads amounts through receiptParser. */
export const __internals = { moneyOn, dateOn };
