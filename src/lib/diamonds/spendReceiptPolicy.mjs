/**
 * Server-owned spend contracts used by /api/diamonds/spend.
 *
 * The browser may describe the operation it wants, but it never gets to set a
 * known product's price or turn a different ledger row into a valid replay.
 */

const FIXED_SPEND_AMOUNTS = Object.freeze({
    trivia_lifeline: 5,
});

export function fixedSpendAmount(source) {
    return Object.prototype.hasOwnProperty.call(FIXED_SPEND_AMOUNTS, source)
        ? FIXED_SPEND_AMOUNTS[source]
        : null;
}

/**
 * Accept only the complete receipt emitted by the hardened deduct_diamonds
 * function. Missing fields fail closed so an older or drifted RPC cannot make
 * the API tell a client that an unproven charge succeeded.
 */
export function validateDiamondSpendReceipt(receipt, expected) {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || receipt.success !== true) {
        return { ok: false, error: 'receipt_not_successful' };
    }

    const expectedReference = expected?.referenceId ?? null;
    const expectedType = expected?.transactionType;
    const charged = receipt.charged;
    const balance = receipt.balance;

    if (!Number.isSafeInteger(charged) || charged !== expected?.amount) {
        return { ok: false, error: 'receipt_amount_mismatch' };
    }
    if (receipt.transaction_type !== expectedType) {
        return { ok: false, error: 'receipt_type_mismatch' };
    }
    if ((receipt.reference_id ?? null) !== expectedReference) {
        return { ok: false, error: 'receipt_reference_mismatch' };
    }
    if (receipt.issuance_class !== 'spend' || receipt.counterparty !== `revenue:${expectedType}`) {
        return { ok: false, error: 'receipt_destination_mismatch' };
    }
    if (typeof receipt.idempotent !== 'boolean') {
        return { ok: false, error: 'receipt_replay_state_missing' };
    }
    if (!Number.isSafeInteger(balance) || balance < 0) {
        return { ok: false, error: 'receipt_balance_invalid' };
    }

    return {
        ok: true,
        charged,
        balance,
        idempotent: receipt.idempotent,
    };
}
