/**
 * One way to print a player's handle on every Trivia surface.
 *
 * Title Case at the print site (#ClubArenaConsole data law) without rewriting
 * the handle: each segment between spaces, underscores, dots or hyphens gets
 * a capital first letter and every separator is kept, so "river_rat" prints
 * "River_Rat" and a player can still recognise and search their own name.
 */
export function printPlayerName(name, fallback = 'Anonymous') {
    const raw = String(name ?? '').trim() || fallback;
    return raw.split(/([\s_.-]+)/).map(part => (part && !/^[\s_.-]+$/.test(part)
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part)).join('');
}

export default printPlayerName;
