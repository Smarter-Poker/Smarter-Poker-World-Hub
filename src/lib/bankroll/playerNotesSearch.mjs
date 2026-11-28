// Player Notes search and save rules.
//
// The search only looked at nickname, real name and general notes, so the
// tells and tendencies a player wrote down (the reason to keep notes) could
// not be found, and a search with no match said "No Players Yet".

const SEARCH_FIELDS = ['nickname', 'real_name', 'notes', 'tells', 'tendencies', 'venue', 'stakes'];

const fold = (text) => String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Players matching every word of the query, in any searchable field. */
export function filterPlayers(players = [], query = '', typeLabels = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return players;
  return players.filter((player) => {
    const haystack = fold([...SEARCH_FIELDS.map((f) => player?.[f]), typeLabels[player?.player_type], player?.player_type].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}

/** The row to write: trimmed text, at least one name, or an error to show. */
export function playerNoteRecord(form = {}) {
  const record = {};
  for (const [key, value] of Object.entries(form)) record[key] = typeof value === 'string' ? value.trim() : value;
  if (!record.nickname && !record.real_name) return { error: 'Enter A Nickname Or Real Name' };
  return { record };
}
