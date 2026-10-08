const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PAID_SKIP_LIMIT = 3;
export const PAID_SKIP_DIAMOND_COST = 5;

export function validatePaidSkipReceipt(value, { sessionId, questionId } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'receipt_not_object' };
    }
    if (value.success !== true
        || typeof value.receiptId !== 'string' || !UUID_RE.test(value.receiptId)
        || value.sessionId !== sessionId
        || value.questionId !== questionId
        || value.storedDisplayIndex !== -1
        || value.outcome !== 'skip'
        || !Number.isInteger(value.paidSkipCount)
        || value.paidSkipCount < 1 || value.paidSkipCount > PAID_SKIP_LIMIT
        || value.paidSkipLimit !== PAID_SKIP_LIMIT
        || !Number.isInteger(value.diamondsCharged)
        || !Number.isInteger(value.newBalance) || value.newBalance < 0
        || typeof value.vip !== 'boolean'
        || typeof value.entitlementWasVip !== 'boolean'
        || value.entitlementWasVip !== value.vip
        || typeof value.currentVipEligible !== 'boolean'
        || typeof value.replayed !== 'boolean'
        || typeof value.newlyCharged !== 'boolean') {
        return { ok: false, error: 'receipt_shape_invalid' };
    }
    const expectedCharge = value.vip ? 0 : PAID_SKIP_DIAMOND_COST;
    if (value.diamondsCharged !== expectedCharge
        || (value.vip && value.newlyCharged)
        || (value.replayed && value.newlyCharged)) {
        return { ok: false, error: 'receipt_charge_invalid' };
    }
    const runBoundary = {};
    if (value.nonPaidMissCount !== undefined) {
        if (!Number.isInteger(value.nonPaidMissCount) || value.nonPaidMissCount < 0) {
            return { ok: false, error: 'receipt_run_boundary_invalid' };
        }
        runBoundary.nonPaidMissCount = value.nonPaidMissCount;
    }
    if (value.terminalFailureCount !== undefined) {
        if (!Number.isInteger(value.terminalFailureCount) || value.terminalFailureCount < 0) {
            return { ok: false, error: 'receipt_run_boundary_invalid' };
        }
        runBoundary.terminalFailureCount = value.terminalFailureCount;
    }
    if (value.missLimit !== undefined) {
        if (!Number.isInteger(value.missLimit) || value.missLimit < 1) {
            return { ok: false, error: 'receipt_run_boundary_invalid' };
        }
        runBoundary.missLimit = value.missLimit;
    }
    if (value.runMissLimitReached !== undefined) {
        if (typeof value.runMissLimitReached !== 'boolean') {
            return { ok: false, error: 'receipt_run_boundary_invalid' };
        }
        runBoundary.runMissLimitReached = value.runMissLimitReached;
    }
    return {
        ok: true,
        receipt: {
            success: true,
            receiptId: value.receiptId,
            sessionId: value.sessionId,
            questionId: value.questionId,
            storedDisplayIndex: -1,
            outcome: 'skip',
            paidSkipCount: value.paidSkipCount,
            paidSkipLimit: PAID_SKIP_LIMIT,
            diamondsCharged: value.diamondsCharged,
            newBalance: value.newBalance,
            vip: value.vip,
            entitlementWasVip: value.entitlementWasVip,
            currentVipEligible: value.currentVipEligible,
            replayed: value.replayed,
            newlyCharged: value.newlyCharged,
            ...runBoundary,
        },
    };
}
