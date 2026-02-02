/**
 * CURRENCY UTILITIES
 * Display-only currency conversion (all data stored in USD)
 */

// Current exchange rate (USD to EUR)
const USD_TO_EUR = 0.92;

/**
 * Format currency for display
 * @param {number} amountUSD - Amount in USD
 * @param {boolean} displayEUR - Whether to display in EUR
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amountUSD, displayEUR = false) {
    if (amountUSD === null || amountUSD === undefined) return displayEUR ? '€0' : '$0';

    const amount = displayEUR ? amountUSD * USD_TO_EUR : amountUSD;
    const symbol = displayEUR ? '€' : '$';
    const absAmount = Math.abs(amount);

    // Format with thousands separator
    const formatted = absAmount.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });

    if (amount < 0) {
        return `-${symbol}${formatted}`;
    }
    return `${symbol}${formatted}`;
}

/**
 * Format currency with sign for P/L display
 * @param {number} amountUSD - Amount in USD
 * @param {boolean} displayEUR - Whether to display in EUR
 * @returns {string} Formatted currency string with +/- sign
 */
export function formatCurrencyWithSign(amountUSD, displayEUR = false) {
    if (amountUSD === null || amountUSD === undefined) return displayEUR ? '€0' : '$0';

    const amount = displayEUR ? amountUSD * USD_TO_EUR : amountUSD;
    const symbol = displayEUR ? '€' : '$';
    const absAmount = Math.abs(amount);

    const formatted = absAmount.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });

    if (amount < 0) {
        return `-${symbol}${formatted}`;
    } else if (amount > 0) {
        return `+${symbol}${formatted}`;
    }
    return `${symbol}0`;
}

/**
 * Get currency symbol based on preference
 * @param {boolean} displayEUR - Whether to use EUR
 * @returns {string} Currency symbol
 */
export function getCurrencySymbol(displayEUR = false) {
    return displayEUR ? '€' : '$';
}

/**
 * Convert USD to target currency (for calculations)
 * @param {number} amountUSD - Amount in USD
 * @param {boolean} toEUR - Whether to convert to EUR
 * @returns {number} Converted amount
 */
export function convertCurrency(amountUSD, toEUR = false) {
    if (toEUR) {
        return amountUSD * USD_TO_EUR;
    }
    return amountUSD;
}

export default {
    formatCurrency,
    formatCurrencyWithSign,
    getCurrencySymbol,
    convertCurrency,
    USD_TO_EUR
};
