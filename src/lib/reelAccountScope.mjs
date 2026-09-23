/**
 * Keeps every account-owned Reel mutation tied to the identity that started it.
 *
 * React effects can be cancelled after an account changes, but an already
 * resolved promise can still reach its continuation before that cleanup runs.
 * This tiny synchronous scope closes that gap: binding a different owner bumps
 * the revision immediately, and every captured request becomes stale before
 * any replacement account state is rendered.
 */
export function createReelAccountScope(initialOwnerId = null) {
  let ownerId = normaliseOwnerId(initialOwnerId);
  let revision = 0;

  const snapshot = () => ({ ownerId, revision });

  return {
    bind(nextOwnerId) {
      const next = normaliseOwnerId(nextOwnerId);
      if (next === ownerId) return { changed: false, ...snapshot() };
      ownerId = next;
      revision += 1;
      return { changed: true, ...snapshot() };
    },

    capture(expectedOwnerId = ownerId) {
      const expected = normaliseOwnerId(expectedOwnerId);
      const capturedRevision = revision;
      return Object.freeze({
        ownerId: expected,
        revision: capturedRevision,
        isCurrent: () => ownerId === expected && revision === capturedRevision,
      });
    },

    currentOwnerId() {
      return ownerId;
    },

    isOwner(candidateOwnerId) {
      return ownerId === normaliseOwnerId(candidateOwnerId);
    },
  };
}

function normaliseOwnerId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
