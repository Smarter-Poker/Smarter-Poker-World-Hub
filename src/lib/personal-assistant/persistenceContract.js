/**
 * Canonical write-result contract for Personal Assistant persistence.
 *
 * A successful HTTP request is not necessarily a durable write.  Every caller
 * must be able to distinguish durable storage, a deliberate local/guest path,
 * and an unavailable backend without reverse-engineering endpoint-specific
 * fields.
 */

export const PERSISTENCE_REASON = Object.freeze({
    GUEST: 'guest',
    LOCAL_ONLY: 'local_only',
    STORAGE_UNAVAILABLE: 'storage_unavailable',
    OWNERSHIP_UNVERIFIED: 'ownership_unverified',
    NOT_PERSISTED: 'not_persisted',
});

export function persistedResult(data = null, extra = {}) {
    return {
        success: true,
        persisted: true,
        reason: null,
        data,
        ...extra,
    };
}

export function ephemeralResult(reason, data = null, extra = {}) {
    return {
        success: true,
        persisted: false,
        reason: reason || PERSISTENCE_REASON.LOCAL_ONLY,
        data,
        ...extra,
    };
}

export function persistenceFailure(
    error = 'This action could not be saved. Try again shortly.',
    reason = PERSISTENCE_REASON.STORAGE_UNAVAILABLE,
    extra = {},
) {
    return {
        success: false,
        persisted: false,
        reason,
        error,
        data: null,
        ...extra,
    };
}

/** Canonical shape for Personal Assistant reads whose backing store failed. */
export function availabilityFailure(
    error = 'This data is temporarily unavailable. Try again shortly.',
    reason = PERSISTENCE_REASON.STORAGE_UNAVAILABLE,
    extra = {},
) {
    return {
        success: false,
        available: false,
        reason,
        error,
        data: null,
        ...extra,
    };
}

/**
 * Client-side interpretation. Legacy endpoints without a `persisted` field are
 * treated as durable only when they explicitly report success.
 */
export function persistenceState(response, json) {
    const success = !!response?.ok && json?.success !== false;
    const persisted = success && json?.persisted !== false;
    return {
        success,
        persisted,
        reason: json?.reason || null,
        error: json?.error || (!response?.ok ? `Request failed (${response?.status || 'unknown'})` : null),
        data: json?.data ?? null,
        json,
    };
}

export async function readPersistenceResponse(response) {
    const contentType = response?.headers?.get?.('content-type') || '';
    const json = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null;
    return persistenceState(response, json);
}

export function persistenceMessage(result, fallback = 'This action could not be saved. Try again.') {
    if (result?.error) return String(result.error);
    if (result?.reason === PERSISTENCE_REASON.GUEST) return 'Sign in to sync this action across devices.';
    if (result?.reason === PERSISTENCE_REASON.LOCAL_ONLY) return 'Saved on this device only.';
    if (result?.reason === PERSISTENCE_REASON.OWNERSHIP_UNVERIFIED) return 'Saved on this device while account sync is unavailable.';
    return fallback;
}
