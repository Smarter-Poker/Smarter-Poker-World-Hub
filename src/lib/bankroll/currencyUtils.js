/**
 * CURRENCY UTILITIES
 * The one way the Bankroll Manager formats money for display. Every ledger
 * row is stored in US dollars; the Settings "Display EUR" toggle only changes
 * how a result, balance, total or average is shown. Tax figures, exports and
 * entry forms never come through the EUR path: they stay in US dollars.
 *
 * Conversion is cents-safe: the US dollar amount is rounded to whole cents
 * first, the rate is applied once to those cents, and the euro amount is
 * rounded to whole euro cents. The sign is read from the rounded display
 * amount, so nothing that rounds to zero shows as "-€0".
 */

// One US dollar in euros. Source: European Central Bank euro foreign exchange
// reference rate, 1 EUR = 1.0957 USD on 2026-11-27 (the latest published
// rate, read on 2026-11-28 from
// https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html).
// 1 / 1.0957 = 0.91266, rounded to 4 decimals. Fixed on purpose: no live FX
// fetch. Update both constants together when the rate is re-verified.
export const USD_TO_EUR = 0.9127;
export const USD_TO_EUR_AS_OF = '2026-11-27';

/** "Nov 27, 2026" for the Settings note. */
export function rateAsOfLabel() {
    return new Date(USD_TO_EUR_AS_OF + 'T12:00:00Z').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
}

/** The Settings line under the Display EUR toggle. */
export function eurRateNote() {
    return 'Converted at ' + USD_TO_EUR + ' per dollar, rate as of ' + rateAsOfLabel()
        + '. Tax reports, exports and entry forms stay in US dollars.';
}

/** Whole display cents (USD cents, or euro cents when displayEUR). */
function displayCents(amountUSD, displayEUR) {
    const number = Number(amountUSD);
    if (amountUSD === null || amountUSD === undefined || !Number.isFinite(number)) return 0;
    const cents = Math.round(number * 100);
    return displayEUR ? Math.round(cents * USD_TO_EUR) : cents;
}

/**
 * @param {number} cents whole display cents
 * @param {boolean} displayEUR
 * @param {{ signed?: boolean, cents?: boolean|'auto' }} options
 *   cents: false = whole units (default), true = always two decimals,
 *   'auto' = two decimals only when the amount is not whole.
 */
function render(cents, displayEUR, { signed = false, cents: showCents = false } = {}) {
    const symbol = displayEUR ? '€' : '$';
    const abs = Math.abs(cents);
    const digits = showCents === true ? 2 : showCents === 'auto' ? (abs % 100 === 0 ? 0 : 2) : 0;
    const shown = digits === 0 ? Math.round(abs / 100) : abs / 100;
    const text = shown.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const rounded = digits === 0 ? shown : abs;
    if (rounded === 0) return symbol + text;
    if (cents < 0) return '-' + symbol + text;
    return (signed ? '+' : '') + symbol + text;
}

/**
 * Format a US dollar amount for display.
 * @param {number} amountUSD amount in US dollars
 * @param {boolean} displayEUR show it in euros
 * @param {{ cents?: boolean|'auto' }} options
 */
export function formatCurrency(amountUSD, displayEUR = false, options = {}) {
    return render(displayCents(amountUSD, displayEUR), displayEUR, { ...options, signed: false });
}

/** Same, with "+" on a gain: "+$1,234", "-€56", "$0". */
export function formatCurrencyWithSign(amountUSD, displayEUR = false, options = {}) {
    return render(displayCents(amountUSD, displayEUR), displayEUR, { ...options, signed: true });
}

/**
 * Format an amount held in US cents (the ledger's own unit). Defaults to two
 * decimals, as the ledger views have always shown.
 */
export function formatCentsCurrency(usdCents, displayEUR = false, { signed = false, cents = true } = {}) {
    const number = Number(usdCents);
    if (usdCents === null || usdCents === undefined || !Number.isFinite(number)) return render(0, displayEUR, { cents });
    const rounded = Math.round(number);
    const shown = displayEUR ? Math.round(rounded * USD_TO_EUR) : rounded;
    return render(shown, displayEUR, { signed, cents });
}

/**
 * A total and its two shares (a staking session: gross, player, backer).
 * Converting each share on its own can leave them a cent short of the total
 * in euros (776.71 vs 388.35 + 388.35), so when the US dollar shares add up
 * to the total the second share is shown as the converted total less the
 * converted first share. Returns [total, first, second] display strings.
 */
export function formatSplit(totalUSD, firstUSD, secondUSD, displayEUR = false, options = {}) {
    const total = displayCents(totalUSD, displayEUR);
    const first = displayCents(firstUSD, displayEUR);
    const addsUp = displayCents(totalUSD, false) === displayCents(firstUSD, false) + displayCents(secondUSD, false);
    const second = addsUp ? total - first : displayCents(secondUSD, displayEUR);
    return [total, first, second].map((cents) => render(cents, displayEUR, { ...options, signed: false }));
}

/**
 * Short form for chart axes and heat-map cells: "$950", "€1.2K", "-$34K", "$1M".
 */
export function formatCurrencyCompact(amountUSD, displayEUR = false) {
    const cents = displayCents(amountUSD, displayEUR);
    const value = Math.round(cents / 100);
    const symbol = displayEUR ? '€' : '$';
    const abs = Math.abs(value);
    const short = (n, unit) => (n < 10 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n))) + unit;
    const text = abs >= 1e6 ? short(abs / 1e6, 'M') : abs >= 1000 ? short(abs / 1000, 'K') : String(abs);
    return (value < 0 ? '-' : '') + symbol + text;
}

/** Currency symbol for the preference. */
export function getCurrencySymbol(displayEUR = false) {
    return displayEUR ? '€' : '$';
}

/**
 * Convert a US dollar amount for calculation (charts that format their own
 * axes). Rounded to whole euro cents, applied once.
 */
export function convertCurrency(amountUSD, toEUR = false) {
    if (!toEUR) return amountUSD;
    const number = Number(amountUSD);
    if (amountUSD === null || amountUSD === undefined || !Number.isFinite(number)) return amountUSD;
    return Math.round(Math.round(number * 100) * USD_TO_EUR) / 100;
}

export default {
    formatCurrency,
    formatCurrencyWithSign,
    formatCentsCurrency,
    formatCurrencyCompact,
    formatSplit,
    getCurrencySymbol,
    convertCurrency,
    eurRateNote,
    USD_TO_EUR,
    USD_TO_EUR_AS_OF,
};
