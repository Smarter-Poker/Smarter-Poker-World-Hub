export const STALE_ACCOUNT_OPERATION = 'stale_account_operation';

function normalizeIdentity(identity) {
    return typeof identity === 'string' && identity ? identity : null;
}

/**
 * Account-owned content must not survive an authentication transition for even
 * one committed render. Async generation fences protect writes; this predicate
 * protects the visible read model until the new identity has been loaded.
 */
export function shouldGateAccountOwnedRender({ loading = false, resolvedIdentity, loadedIdentity } = {}) {
    return loading === true
        || normalizeIdentity(resolvedIdentity) !== normalizeIdentity(loadedIdentity);
}

/**
 * A latest-request fence for same-account reads. Account generation protects
 * A -> B transitions; this protects a newer storage/network refresh from being
 * overwritten when an older request resolves out of order.
 */
export function createLatestRequestScope() {
    let generation = 0;
    let mutationGeneration = 0;
    let activeMutation = null;
    return {
        begin() {
            if (activeMutation !== null) return null;
            generation += 1;
            return generation;
        },
        beginMutation() {
            if (activeMutation !== null) return null;
            generation += 1;
            mutationGeneration += 1;
            activeMutation = mutationGeneration;
            return activeMutation;
        },
        endMutation(snapshot) {
            if (snapshot !== activeMutation) return false;
            activeMutation = null;
            return true;
        },
        isMutationCurrent(snapshot) {
            return Number.isInteger(snapshot) && snapshot === activeMutation;
        },
        invalidate() {
            generation += 1;
            activeMutation = null;
        },
        isCurrent(snapshot) {
            return activeMutation === null
                && Number.isInteger(snapshot)
                && snapshot === generation;
        },
    };
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
