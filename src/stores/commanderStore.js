/**
 * 2026-07-25 audit fix — deprecated dead code, kept as an inert stub.
 *
 * Nothing in World Hub imports this store (verified repo-wide). Its fetch
 * actions targeted staff-guarded commander endpoints without auth headers
 * and parsed response shapes that no longer exist, so any future import
 * would silently show stale/empty data. If you need commander state, call
 * the /api/commander/* endpoints directly with the user's Bearer token.
 *
 * This file exists only because repo tooling could not delete it in the
 * audit pass — it is safe to remove entirely.
 */
export function useCommanderStore() {
  throw new Error('commanderStore is deprecated — call /api/commander/* endpoints directly.');
}

export function usePlayerCommanderStore() {
  throw new Error('commanderStore is deprecated — call /api/commander/* endpoints directly.');
}

export default null;
