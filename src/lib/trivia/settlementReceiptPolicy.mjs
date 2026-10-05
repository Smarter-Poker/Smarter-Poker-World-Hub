const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nonNegativeInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : 0;
}

export function expectedSoloTransactionReceipts({
    sessionId,
    userId,
    mode,
    entryCost,
    entryState,
    diamondsAwarded,
    dailyBonusAwarded,
    chicagoDate,
} = {}) {
    if (!UUID_RE.test(String(sessionId || '')) || !UUID_RE.test(String(userId || ''))) return null;
    const expected = [];
    const cost = nonNegativeInteger(entryCost);
    const reward = nonNegativeInteger(diamondsAwarded);
    const bonus = nonNegativeInteger(dailyBonusAwarded);
    if (entryState === 'charged' && cost > 0) {
        expected.push({ role: 'entry', referenceId: `trivia_entry_${sessionId}`, amount: -cost, kind: 'trivia_entry' });
    }
    if (reward > 0) {
        expected.push({ role: 'reward', referenceId: `trivia_session_${sessionId}`, amount: reward, kind: 'trivia_run' });
    }
    if (mode === 'daily' && bonus > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(chicagoDate || ''))) {
        expected.push({
            role: 'daily_bonus',
            referenceId: `trivia_daily_bonus_${userId}_${chicagoDate}`,
            amount: bonus,
            kind: 'trivia_daily_bonus',
        });
    }
    return expected;
}

export function verifySoloTransactionReceipts(expected, rows) {
    if (!Array.isArray(expected) || !Array.isArray(rows)) {
        return { ok: false, error: 'invalid_receipt_evidence', receipts: [] };
    }
    const byReference = new Map(rows
        .filter(row => row && typeof row.reference_id === 'string')
        .map(row => [row.reference_id, row]));
    const receipts = [];
    for (const item of expected) {
        const row = byReference.get(item.referenceId);
        const kind = typeof row?.transaction_type === 'string' && row.transaction_type
            ? row.transaction_type
            : (typeof row?.type === 'string' ? row.type : null);
        const createdAt = typeof row?.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
            ? row.created_at
            : null;
        const balanceAfter = row?.balance_after !== null && row?.balance_after !== undefined
            && Number.isFinite(Number(row.balance_after))
            ? Number(row.balance_after)
            : null;
        if (!row
            || !UUID_RE.test(String(row.id || ''))
            || Number(row.amount) !== item.amount
            || kind !== item.kind
            || createdAt == null
            || balanceAfter == null) {
            return { ok: false, error: 'transaction_receipt_missing', receipts: [] };
        }
        receipts.push(Object.freeze({
            id: String(row.id),
            role: item.role,
            referenceId: item.referenceId,
            amount: item.amount,
            kind,
            balanceAfter,
            createdAt,
        }));
    }
    return { ok: true, error: null, receipts };
}
