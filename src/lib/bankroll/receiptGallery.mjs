/**
 * SAVED RECEIPTS, AS DATA
 *
 * The Saved Receipts grid shows every image attached to a ledger entry. Its
 * decisions live here, pure, so they are tested without a browser:
 *
 *  - the label for a ledger category. The grid used to map `cash` and
 *    `tournament`, which are not categories this ledger has ever stored
 *    (bankroll_ledger_category_check allows poker_cash, poker_mtt, ...), so
 *    every session card read "poker_cash" in raw column text;
 *  - which image a delete removes. It was chosen by its POSITION in
 *    media_urls, read when the grid loaded; if the entry had gained or lost an
 *    image since, the wrong photograph was removed. It is chosen by its URL;
 *  - what happens to the receipt a removed image belonged to. Removing it
 *    from the entry left its bankroll_receipts row `assigned` to an entry that
 *    no longer showed it: listed nowhere, assignable from nowhere. Dan's rule
 *    is that a scanned receipt is never abandoned, so it goes back to
 *    Receipts Waiting instead.
 */

/** bankroll_ledger.category -> what the card says. */
export const LEDGER_CATEGORY_LABELS = {
    poker_cash: 'Cash Game',
    poker_mtt: 'Tournament',
    casino_table: 'Table Game',
    slots: 'Slots',
    sports: 'Sports Bet',
    expense: 'Expense',
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
};

export function categoryLabel(category) {
    if (!category) return 'Entry';
    return LEDGER_CATEGORY_LABELS[category]
        || String(category).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * One card per attached image, newest entry first (the query's order).
 * Blank and repeated URLs on one entry are shown once.
 */
export function receiptCards(entries) {
    const cards = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || !Array.isArray(entry.media_urls)) continue;
        const seen = new Set();
        for (const url of entry.media_urls) {
            if (typeof url !== 'string' || !url.trim() || seen.has(url)) continue;
            seen.add(url);
            cards.push({
                key: `${entry.id}|${url}`,
                entryId: entry.id,
                imageUrl: url,
                category: entry.category || null,
                label: categoryLabel(entry.category),
                date: entry.entry_date || null,
                netResult: toNumber(entry.net_result),
                location: (entry.location && entry.location.name) || null,
                isPdf: /\.pdf(\?|$)/i.test(url),
            });
        }
    }
    return cards;
}

/** media_urls after removing ONE image, by its URL. null when none remain. */
export function mediaWithout(mediaUrls, imageUrl) {
    const left = (Array.isArray(mediaUrls) ? mediaUrls : []).filter((u) => u !== imageUrl);
    return left.length > 0 ? left : null;
}

/**
 * The update that sends a receipt back to Receipts Waiting. Every assignment
 * column is cleared together, because bankroll_receipts_assignment_is_whole
 * refuses an `unassigned` row that still names a target.
 */
export const RECEIPT_UNASSIGN = Object.freeze({
    status: 'unassigned',
    assigned_kind: null,
    assigned_id: null,
    assigned_at: null,
});
