/**
 * Durable client custody for a server-owned solo Trivia session.
 *
 * The value is only a recovery pointer. It carries no answer key, balance, or
 * authority: every adoption is authenticated and re-read through
 * /api/trivia/session-start. Keeping the request/session UUID is nevertheless
 * essential because it is also the server's idempotency key. Losing it after
 * an uncertain response can charge and deal a second run.
 */

export const SOLO_RUN_RECOVERY_VERSION = 1;
export const SOLO_RUN_RECOVERY_PREFIX = 'sp.trivia.solo-recovery.v1';
export const SOLO_RUN_RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHASES = new Set(['starting', 'active', 'settling']);

function cleanIdentity(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function soloRunRecoveryKey(mode, accountId) {
    const cleanMode = cleanIdentity(mode);
    const cleanAccount = cleanIdentity(accountId);
    if (!cleanMode || !cleanAccount) return null;
    return `${SOLO_RUN_RECOVERY_PREFIX}:${encodeURIComponent(cleanAccount)}:${encodeURIComponent(cleanMode)}`;
}

export function normalizeSoloRunRecovery(value, { mode, accountId, now = Date.now() } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const cleanMode = cleanIdentity(mode);
    const cleanAccount = cleanIdentity(accountId);
    if (!cleanMode || !cleanAccount) return null;
    if (value.version !== SOLO_RUN_RECOVERY_VERSION
        || value.mode !== cleanMode
        || value.accountId !== cleanAccount
        || !UUID_RE.test(String(value.sessionId || ''))
        || !PHASES.has(value.phase)
        || !Number.isFinite(value.createdAt)) return null;

    const age = now - value.createdAt;
    if (age < -60_000 || age > SOLO_RUN_RECOVERY_MAX_AGE_MS) return null;

    const expiresAt = typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt))
        ? value.expiresAt
        : null;
    // The server remains authoritative, but an already-expired pointer is not
    // offered as a recoverable run. A one-minute allowance prevents client
    // clock skew from discarding a session that the server still accepts.
    if (expiresAt && Date.parse(expiresAt) < now - 60_000) return null;

    const settlementRequestId = value.settlementRequestId == null
        ? null
        : (UUID_RE.test(String(value.settlementRequestId)) ? String(value.settlementRequestId) : null);
    if (value.phase === 'settling' && !settlementRequestId) return null;

    return Object.freeze({
        version: SOLO_RUN_RECOVERY_VERSION,
        mode: cleanMode,
        accountId: cleanAccount,
        sessionId: String(value.sessionId),
        phase: value.phase,
        createdAt: value.createdAt,
        expiresAt,
        settlementRequestId,
    });
}

export function createSoloRunRecovery({
    mode,
    accountId,
    sessionId,
    phase = 'starting',
    createdAt = Date.now(),
    expiresAt = null,
    settlementRequestId = null,
} = {}) {
    return normalizeSoloRunRecovery({
        version: SOLO_RUN_RECOVERY_VERSION,
        mode,
        accountId,
        sessionId,
        phase,
        createdAt,
        expiresAt,
        settlementRequestId,
    }, { mode, accountId, now: createdAt });
}

export function readSoloRunRecovery(storage, mode, accountId, now = Date.now()) {
    const key = soloRunRecoveryKey(mode, accountId);
    if (!key || !storage?.getItem) return null;
    let parsed = null;
    try {
        const raw = storage.getItem(key);
        parsed = raw ? JSON.parse(raw) : null;
    } catch (_error) {
        parsed = null;
    }
    const record = normalizeSoloRunRecovery(parsed, { mode, accountId, now });
    if (!record) {
        try { storage.removeItem?.(key); } catch (_error) { /* storage may be unavailable */ }
    }
    return record;
}

export function writeSoloRunRecovery(storage, record) {
    const normalized = normalizeSoloRunRecovery(record, {
        mode: record?.mode,
        accountId: record?.accountId,
        // Validate structure without expiring an otherwise legitimate record
        // merely because a caller is replaying a stored timestamp in a test.
        now: Number(record?.createdAt),
    });
    const key = soloRunRecoveryKey(record?.mode, record?.accountId);
    if (!normalized || !key || !storage?.setItem) return null;
    try {
        storage.setItem(key, JSON.stringify(normalized));
        return normalized;
    } catch (_error) {
        return null;
    }
}

export function clearSoloRunRecovery(storage, mode, accountId) {
    const key = soloRunRecoveryKey(mode, accountId);
    if (!key || !storage?.removeItem) return false;
    try {
        storage.removeItem(key);
        return true;
    } catch (_error) {
        return false;
    }
}
