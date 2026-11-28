// Finding a player's saved venue by name, ignoring case.
//
// The lookup is an ILIKE, where % and _ are wildcards and \ escapes. A venue
// typed as "Club_21" matched a saved "Club 21" or "ClubX21", and "100% Poker"
// matched "100 Big Poker", so the session was filed under the wrong venue
// instead of creating the one the player typed. The name is escaped so it
// only ever matches itself.

/** An ILIKE pattern that matches `name` exactly, case aside. */
export function exactIlikePattern(name) {
  return String(name ?? '').replace(/[\\%_]/g, (ch) => '\\' + ch);
}
