// Per-session entry currency (2026-11-28).
//
// A player who plays in Europe, the UK, Canada or Australia can type a session
// in the money they actually bought in with. The ledger still keeps ONE unit:
// gross_in and gross_out are always US dollars, so every total, tax figure,
// export and the generated net_result keep reading what they always read.
// What the player typed is kept beside them (installed 2026-11-28, migration
// 20261128100500_bankroll_ledger_entry_currency):
//
//   entry_currency      ISO code typed in; NULL or 'USD' means US dollars
//   fx_rate_to_usd      US dollars per 1 unit of entry_currency
//   original_gross_in   buy-in as typed, in entry_currency
//   original_gross_out  cash-out as typed, in entry_currency
//
// A non-USD row must carry all three (check bankroll_ledger_foreign_entry_complete).
//
// This is NOT Display EUR. Display EUR (currencyUtils.js) only changes how a
// stored US dollar figure is shown. Entry currency changes what was typed, and
// converts it once, at the rate the player saw, into the US dollars that are
// stored.
//
// Conversion is exact to the cent: the typed amount is taken in whole cents of
// its own currency, the rate as an exact decimal of up to 6 places, and the
// product rounded half away from zero to whole US cents, in integer arithmetic.

import { USD_TO_EUR, USD_TO_EUR_AS_OF } from './currencyUtils.js';

/**
 * The currencies a session can be typed in. USD first and the default. EUR,
 * GBP, CAD and AUD cover the live poker circuits outside the US that players on
 * this platform travel to (EPT and the European festivals, the UK circuit,
 * Canadian card rooms, the Australian championships). Only EUR has a rate this
 * code base has verified (the ECB reference rate behind Display EUR); every
 * other currency asks the player for the rate they were actually given.
 */
export const ENTRY_CURRENCIES = Object.freeze([
    Object.freeze({ code: 'USD', name: 'US Dollar' }),
    Object.freeze({ code: 'EUR', name: 'Euro' }),
    Object.freeze({ code: 'GBP', name: 'British Pound' }),
    Object.freeze({ code: 'CAD', name: 'Canadian Dollar' }),
    Object.freeze({ code: 'AUD', name: 'Australian Dollar' }),
]);

export const ENTRY_CURRENCY_CODES = Object.freeze(ENTRY_CURRENCIES.map((c) => c.code));

/** Money fields typed in the entry currency besides gross_in / gross_out. */
export const DERIVED_MONEY_FIELDS = Object.freeze(['buy_in_amount', 'add_on_amount', 'bounties_collected']);

const RATE_DECIMALS = 6;
const RATE_SCALE = 1000000n;
export const MIN_RATE = 0.0001;
export const MAX_RATE = 10000;

/** 'EUR' for 'eur' / 'EUR'; 'USD' for anything empty; null for an unknown code. */
export function normaliseCurrency(code) {
    if (code === null || code === undefined || code === '') return 'USD';
    const upper = String(code).trim().toUpperCase();
    return /^[A-Z]{3}$/.test(upper) ? upper : null;
}

export const isForeignCurrency = (code) => {
    const c = normaliseCurrency(code);
    return Boolean(c) && c !== 'USD';
};

/** True when the row was typed in a currency other than US dollars. */
export function isForeignEntry(entry) {
    return Boolean(entry) && isForeignCurrency(entry.entry_currency)
        && entry.fx_rate_to_usd !== null && entry.fx_rate_to_usd !== undefined;
}

/** The EUR rate behind Display EUR, as US dollars per euro, 4 places (1 / 0.9127 = 1.0957). */
export const EUR_RATE_TO_USD = Math.round((1 / USD_TO_EUR) * 10000) / 10000;

/**
 * The rate offered before the player types one.
 * Returns { rate, asOf, source } or null when the player must supply it.
 */
export function defaultRateFor(code) {
    const c = normaliseCurrency(code);
    if (c === 'USD') return { rate: 1, asOf: null, source: 'usd' };
    if (c === 'EUR') return { rate: EUR_RATE_TO_USD, asOf: USD_TO_EUR_AS_OF, source: 'ecb' };
    return null;
}

/** "Nov 27, 2026" for a YYYY-MM-DD day, read as that calendar day. */
export function rateDayLabel(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return '';
    return new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
}

/** The line under the rate field: where the rate came from and its date. */
export function rateSourceNote({ code, source, day }) {
    const c = normaliseCurrency(code) || '';
    if (source === 'ecb') {
        return `European Central Bank Reference Rate For ${c}, ${rateDayLabel(USD_TO_EUR_AS_OF)}. Change It If You Were Given A Different Rate.`;
    }
    if (source === 'saved') return 'The Rate Saved With This Entry.';
    const when = rateDayLabel(day);
    return `Your Rate${when ? ` For ${when}` : ''}. Use The Rate Your Bank Or The Venue Gave You.`;
}

/**
 * Exact decimal parse of a rate. Returns the rate in millionths as a BigInt, or
 * null when it is not a positive decimal of at most 6 places within range.
 */
export function rateMicros(rate) {
    const text = typeof rate === 'number' ? (Number.isFinite(rate) ? String(rate) : '') : String(rate ?? '').trim();
    if (/e/i.test(text)) {
        const n = Number(text);
        if (!Number.isFinite(n)) return null;
        return rateMicros(n.toFixed(RATE_DECIMALS));
    }
    const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match) return null;
    const frac = (match[2] || '').replace(/0+$/, '');
    if (frac.length > RATE_DECIMALS) return null;
    const micros = BigInt(match[1]) * RATE_SCALE + BigInt((frac + '000000').slice(0, RATE_DECIMALS));
    const value = Number(micros) / 1e6;
    if (!(value >= MIN_RATE && value <= MAX_RATE)) return null;
    return micros;
}

/** A usable rate as a number, or null. */
export function parseRate(rate) {
    const micros = rateMicros(rate);
    return micros === null ? null : Number(micros) / 1e6;
}

/** What is wrong with a typed rate, or null. */
export function rateProblem(rate, code) {
    if (!isForeignCurrency(code)) return null;
    const text = String(rate ?? '').trim();
    if (!text) return `Enter The Rate: US Dollars Per 1 ${normaliseCurrency(code)}`;
    if (parseRate(text) === null) return 'The Rate Must Be A Positive Number With Up To 6 Decimals';
    return null;
}

/** Whole cents of an amount typed in any currency (exact for up to 2 decimals). */
export function amountCents(amount) {
    if (amount === null || amount === undefined || amount === '') return 0;
    const text = String(amount).trim();
    const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(text);
    if (match && (match[2] || match[3])) {
        const frac = match[3] || '';
        let cents = BigInt(match[2] || '0') * 100n + BigInt((frac + '00').slice(0, 2));
        if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1n;
        return Number(match[1] ? -cents : cents);
    }
    const n = Number(amount);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function roundHalfAwayDiv(numerator, denominator) {
    const negative = numerator < 0n;
    const abs = negative ? -numerator : numerator;
    const q = (abs * 2n + denominator) / (denominator * 2n);
    return negative ? -q : q;
}

/** Foreign amount -> whole US cents at the rate (US dollars per unit). */
export function foreignToUsdCents(amount, rate) {
    const micros = rateMicros(rate);
    if (micros === null) throw new Error('Invalid exchange rate');
    return Number(roundHalfAwayDiv(BigInt(amountCents(amount)) * micros, RATE_SCALE));
}

/** US dollar amount -> whole cents of the entry currency at the rate. */
export function usdToForeignCents(amountUSD, rate) {
    const micros = rateMicros(rate);
    if (micros === null) throw new Error('Invalid exchange rate');
    return Number(roundHalfAwayDiv(BigInt(amountCents(amountUSD)) * RATE_SCALE, micros));
}

const dollars = (cents) => Math.round(cents) / 100;

/**
 * The row to save. `entry` holds amounts as typed (in `currency`). For US
 * dollars the foreign columns are cleared; otherwise the typed gross amounts
 * become original_gross_*, and every money field is converted to US dollars.
 */
export function applyEntryCurrency(entry, { currency = 'USD', rate = null } = {}) {
    const code = normaliseCurrency(currency);
    if (!code) throw new Error('Unknown currency');
    const out = { ...entry };
    if (code === 'USD') {
        out.entry_currency = 'USD';
        out.fx_rate_to_usd = null;
        out.original_gross_in = null;
        out.original_gross_out = null;
        return out;
    }
    const micros = rateMicros(rate);
    if (micros === null) throw new Error('Invalid exchange rate');
    const typedIn = amountCents(entry.gross_in);
    const typedOut = amountCents(entry.gross_out);
    out.entry_currency = code;
    out.fx_rate_to_usd = Number(micros) / 1e6;
    out.original_gross_in = dollars(typedIn);
    out.original_gross_out = dollars(typedOut);
    out.gross_in = dollars(foreignToUsdCents(dollars(typedIn), rate));
    out.gross_out = dollars(foreignToUsdCents(dollars(typedOut), rate));
    for (const field of DERIVED_MONEY_FIELDS) {
        if (entry[field] === null || entry[field] === undefined || entry[field] === '') continue;
        out[field] = dollars(foreignToUsdCents(entry[field], rate));
    }
    return out;
}

/**
 * A saved row seen in the currency it was typed in, for the edit form.
 * gross_in / gross_out are the stored originals (exact); the other money
 * fields are converted back at the stored rate and rounded to the cent.
 */
export function entryInOwnCurrency(entry) {
    if (!entry) return entry;
    if (!isForeignEntry(entry)) return { ...entry, entry_currency: 'USD' };
    const rate = entry.fx_rate_to_usd;
    const view = {
        ...entry,
        entry_currency: normaliseCurrency(entry.entry_currency),
        gross_in: entry.original_gross_in ?? dollars(usdToForeignCents(entry.gross_in, rate)),
        gross_out: entry.original_gross_out ?? dollars(usdToForeignCents(entry.gross_out, rate)),
    };
    for (const field of DERIVED_MONEY_FIELDS) {
        if (entry[field] === null || entry[field] === undefined) continue;
        view[field] = dollars(usdToForeignCents(entry[field], rate));
    }
    return view;
}

/** "$1,234.50" for US dollars, "EUR 1,234.50" otherwise; whole amounts drop the cents. */
export function moneyIn(code, amount, { signed = false } = {}) {
    const c = normaliseCurrency(code) || 'USD';
    const cents = amountCents(amount);
    const abs = Math.abs(cents);
    const digits = abs % 100 === 0 ? 0 : 2;
    const text = (abs / 100).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const sign = cents < 0 ? '-' : signed && cents > 0 ? '+' : '';
    return c === 'USD' ? `${sign}$${text}` : `${c} ${sign}${text}`;
}

/** "1.0957" - the rate as stored, without float noise. */
export function rateText(rate) {
    const micros = rateMicros(rate);
    if (micros === null) return '';
    return (Number(micros) / 1e6).toFixed(RATE_DECIMALS).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * The small note the ledger shows under a foreign row: "EUR +200 at 1.0957".
 * An expense shows its amount; a session its result in its own currency.
 */
export function foreignEntryNote(entry) {
    if (!isForeignEntry(entry)) return null;
    const isExpense = entry.category === 'expense';
    const amount = isExpense
        ? dollars(Math.abs(amountCents(entry.original_gross_in)))
        : dollars(amountCents(entry.original_gross_out) - amountCents(entry.original_gross_in));
    return `${moneyIn(entry.entry_currency, amount, { signed: !isExpense })} at ${rateText(entry.fx_rate_to_usd)}`;
}

// ---------------------------------------------------------------------------
// Form state for the currency picker: { currency, rate (text), source }.
// source: 'usd' (no rate), 'ecb' (the verified EUR default), 'saved' (the rate
// stored on the entry being edited) or 'player' (typed or confirmed by the
// player).

/** The picker's starting state for a new entry or the entry being edited. */
export function initialCurrencyState(editEntry) {
    if (editEntry && isForeignEntry(editEntry)) {
        return { currency: normaliseCurrency(editEntry.entry_currency), rate: rateText(editEntry.fx_rate_to_usd), source: 'saved' };
    }
    return { currency: 'USD', rate: '', source: 'usd' };
}

/** The picker's state after choosing a currency. */
export function chooseCurrency(state, code, editEntry = null) {
    const c = normaliseCurrency(code) || 'USD';
    if (c === 'USD') return { currency: 'USD', rate: '', source: 'usd' };
    if (editEntry && isForeignEntry(editEntry) && normaliseCurrency(editEntry.entry_currency) === c) {
        return { currency: c, rate: rateText(editEntry.fx_rate_to_usd), source: 'saved' };
    }
    const preset = defaultRateFor(c);
    if (preset) return { currency: c, rate: rateText(preset.rate), source: preset.source };
    return { currency: c, rate: '', source: 'player' };
}

/** The picker's state after the player types a rate. */
export function typeRate(state, text) {
    return { ...state, rate: String(text ?? ''), source: 'player' };
}

/** Label suffix for an amount field: "$" or the currency code. */
export function amountUnit(code) {
    const c = normaliseCurrency(code) || 'USD';
    return c === 'USD' ? '$' : c;
}

/**
 * An amount in note text. US dollars keep the form the notes have always
 * used ("$1,500" for totals, "$200" for raw amounts) so an earlier summary
 * line is still recognised and replaced on edit.
 */
export function noteMoney(code, amount, { grouped = false } = {}) {
    const c = normaliseCurrency(code) || 'USD';
    const text = grouped ? Number(amount).toLocaleString() : String(amount);
    return c === 'USD' ? `$${text}` : `${c} ${text}`;
}

/**
 * "Saved As +$219.14 (USD)" under a foreign entry: the US dollar amount the
 * ledger will store, converted leg by leg exactly as applyEntryCurrency does.
 * null for US dollars or a rate that cannot be used yet.
 */
export function usdSavedPreview({ currency, rate, grossIn, grossOut, isExpense = false }) {
    if (!isForeignCurrency(currency) || parseRate(rate) === null) return null;
    const inCents = foreignToUsdCents(dollars(amountCents(grossIn)), rate);
    const outCents = foreignToUsdCents(dollars(amountCents(grossOut)), rate);
    if (isExpense) return `Saved As ${moneyIn('USD', dollars(Math.abs(inCents)))} (USD)`;
    return `Saved As ${moneyIn('USD', dollars(outCents - inCents), { signed: true })} (USD)`;
}
