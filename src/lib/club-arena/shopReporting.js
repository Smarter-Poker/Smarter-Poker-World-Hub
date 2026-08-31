const PRIMARY_SHOP_CURRENCY = 'diamonds';
const LEGACY_SHOP_CURRENCY = 'chips';

function normalizeShopCurrency(rawCurrency) {
    if (rawCurrency === null || rawCurrency === undefined || String(rawCurrency).trim() === '') {
        return LEGACY_SHOP_CURRENCY;
    }

    const currency = String(rawCurrency).trim().toLowerCase();
    if (currency === PRIMARY_SHOP_CURRENCY || currency === LEGACY_SHOP_CURRENCY) {
        return currency;
    }

    return currency.replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'unknown';
}

function emptyCurrencyTotals() {
    return {
        sales: 0,
        refundedSales: 0,
        netSales: 0,
        gross: 0,
        refunded: 0,
        net: 0,
    };
}

function normalizePaidAmount(rawAmount) {
    if (rawAmount === null || rawAmount === undefined || String(rawAmount).trim() === '') {
        throw new TypeError('Club Shop ledger price_paid must be a non-negative safe integer');
    }
    const amount = Number(rawAmount);
    if (!Number.isSafeInteger(amount) || amount < 0) {
        throw new TypeError('Club Shop ledger price_paid must be a non-negative safe integer');
    }
    return amount;
}

function buildLedgerCompleteness({ processedRows, exactCount, exhausted }) {
    const normalizedProcessed = Number(processedRows);
    if (!Number.isSafeInteger(normalizedProcessed) || normalizedProcessed < 0) {
        throw new TypeError('processedRows must be a non-negative safe integer');
    }

    const countIsExact = Number.isSafeInteger(exactCount) && exactCount >= 0;
    const totalRows = countIsExact ? exactCount : normalizedProcessed;
    const totalRowsExact = countIsExact || Boolean(exhausted);

    return {
        totalRows,
        totalRowsExact,
        complete: Boolean(exhausted) || (countIsExact && normalizedProcessed >= exactCount),
    };
}

function summarizeShopPurchases(rows = []) {
    const byCurrency = {};
    const byItem = {};

    for (const row of rows) {
        const currency = normalizeShopCurrency(row.currency);
        const paid = normalizePaidAmount(row.price_paid);
        const refunded = Boolean(row.refunded_at);

        if (!byCurrency[currency]) byCurrency[currency] = emptyCurrencyTotals();
        const currencyTotals = byCurrency[currency];
        currencyTotals.sales += 1;
        currencyTotals.gross += paid;
        if (refunded) {
            currencyTotals.refundedSales += 1;
            currencyTotals.refunded += paid;
        }

        const itemId = row.item_id || 'deleted';
        if (!byItem[itemId]) byItem[itemId] = { byCurrency: {} };
        if (!byItem[itemId].byCurrency[currency]) {
            byItem[itemId].byCurrency[currency] = emptyCurrencyTotals();
        }
        const itemTotals = byItem[itemId].byCurrency[currency];
        itemTotals.sales += 1;
        itemTotals.gross += paid;
        if (refunded) {
            itemTotals.refundedSales += 1;
            itemTotals.refunded += paid;
        }
    }

    for (const totals of Object.values(byCurrency)) {
        totals.netSales = totals.sales - totals.refundedSales;
        totals.net = totals.gross - totals.refunded;
    }
    for (const item of Object.values(byItem)) {
        for (const totals of Object.values(item.byCurrency)) {
            totals.netSales = totals.sales - totals.refundedSales;
            totals.net = totals.gross - totals.refunded;
        }
    }

    return { byCurrency, byItem };
}

function totalsForCurrency(summary, currency) {
    return summary?.byCurrency?.[currency] || emptyCurrencyTotals();
}

module.exports = {
    PRIMARY_SHOP_CURRENCY,
    LEGACY_SHOP_CURRENCY,
    normalizeShopCurrency,
    normalizePaidAmount,
    buildLedgerCompleteness,
    emptyCurrencyTotals,
    summarizeShopPurchases,
    totalsForCurrency,
};
