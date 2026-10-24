// Owner rule, 2026-10-24: "NEW PLAYERS SHOULD NEVER BE UNKNOWN THEY SHOULD
// ALWAYS HAVE A NAME ATTACHED". Every profile carries a player number, so a
// person who never chose a name still shows as "Player #<number>".
// Returns null only when there is no profile at all (a deleted account); the
// caller must then drop the row rather than render a placeholder.

export const MESSENGER_PROFILE_COLUMNS = 'id, username, display_name, alias, player_number, avatar_url';

const clean = value => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function messengerDisplayName(profile) {
    if (!profile) return null;
    // full_name is a protected real name and is never used here.
    const named = clean(profile.display_name) || clean(profile.username)
        || clean(profile.alias) || clean(profile.name);
    if (named) return named;
    const number = clean(profile.player_number == null ? null : String(profile.player_number));
    return number ? `Player #${number}` : null;
}

// Returns the profile with display_name filled from the fallback, so existing
// renderers that read display_name || username keep working. username is left
// alone because profile links are built from it.
export function withMessengerDisplayName(profile) {
    const name = messengerDisplayName(profile);
    if (!name) return null;
    return { ...profile, display_name: clean(profile.display_name) || name };
}
