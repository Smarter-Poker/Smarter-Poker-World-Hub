export const STALE_ACCOUNT_OPERATION = 'stale_account_operation';

function normalizeIdentity(identity) {
    return typeof identity === 'string' && identity ? identity : null;
}

/**
 * A tiny generation fence for account-owned async work. Calling transition()
 * at the authentication boundary invalidates every snapshot captured by the
 * previous account, including requests that resolve after the switch.
 */
export function createAccountOperationScope(initialIdentity = null) {
    let identity = normalizeIdentity(initialIdentity);
    let generation = 0;

    return {
        transition(nextIdentity) {
            const normalized = normalizeIdentity(nextIdentity);
            if (normalized !== identity) {
                identity = normalized;
                generation += 1;
            }
            return { identity, generation };
        },
        capture() {
            return { identity, generation };
        },
        isCurrent(snapshot) {
            return Boolean(snapshot)
                && snapshot.identity === identity
                && snapshot.generation === generation;
        },
    };
}

export function staleAccountOperationError() {
    const error = new Error(STALE_ACCOUNT_OPERATION);
    error.code = STALE_ACCOUNT_OPERATION;
    return error;
}

export function isStaleAccountOperation(error) {
    return error?.code === STALE_ACCOUNT_OPERATION
        || error?.message === STALE_ACCOUNT_OPERATION;
}
