const normalizedOwnerId = ownerId => {
    if (typeof ownerId !== 'string') return null;
    const trimmed = ownerId.trim();
    return trimmed || null;
};

/**
 * Generation token for personal Video Library state.
 *
 * A user can sign out or switch accounts while any persistence request is in
 * flight. Owner id alone is not enough when a session signs out and then back
 * into the same account before the old request settles, so every transition
 * advances an opaque generation as well.
 */
export function createVideoLibraryOwnerScope(initialOwnerId = null) {
    let ownerId = normalizedOwnerId(initialOwnerId);
    let generation = 0;

    return {
        activate(nextOwnerId) {
            const normalizedNextOwnerId = normalizedOwnerId(nextOwnerId);
            if (normalizedNextOwnerId === ownerId) return false;
            ownerId = normalizedNextOwnerId;
            generation += 1;
            return true;
        },

        capture(expectedOwnerId = ownerId) {
            return Object.freeze({
                ownerId: normalizedOwnerId(expectedOwnerId),
                generation,
            });
        },

        isCurrent(token) {
            return Boolean(token)
                && token.ownerId === ownerId
                && token.generation === generation;
        },

        commit(token, callback) {
            if (!this.isCurrent(token)) return false;
            callback();
            return true;
        },
    };
}

