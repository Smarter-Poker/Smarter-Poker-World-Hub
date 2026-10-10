const RANKS = new Set(['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']);
const SUITS = Object.freeze({
  s: 's', spade: 's', spades: 's', '\u2660': 's',
  h: 'h', heart: 'h', hearts: 'h', '\u2665': 'h',
  d: 'd', diamond: 'd', diamonds: 'd', '\u2666': 'd',
  c: 'c', club: 'c', clubs: 'c', '\u2663': 'c',
});
const SUIT_NAMES = Object.keys(SUITS).sort((a, b) => b.length - a.length);

export const RECENT_CLUB_ARENA_HAND_LIMIT = 8;

function rankOf(value) {
  const rank = String(value ?? '').trim().toUpperCase().replace('10', 'T');
  return RANKS.has(rank) ? rank : '';
}

function suitOf(value) {
  return SUITS[String(value ?? '').trim().toLowerCase()] || '';
}

export function normalizeClubArenaCard(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rank = rankOf(value.rank);
    const suit = suitOf(value.suit);
    return rank && suit ? { rank, suit } : null;
  }
  if (typeof value !== 'string') return null;
  const card = value.trim();
  const lower = card.toLowerCase();
  if (!card || lower === 'undefined' || lower === 'null') return null;
  for (const suitName of SUIT_NAMES) {
    if (!lower.endsWith(suitName)) continue;
    const rank = rankOf(card.slice(0, card.length - suitName.length));
    if (rank) return { rank, suit: SUITS[suitName] };
  }
  return null;
}

function exactCards(value) {
  if (!Array.isArray(value)) return null;
  const normalized = value.map(normalizeClubArenaCard);
  return normalized.every(Boolean) ? normalized : null;
}

function safeHandLabel(row) {
  const handNumber = Number.isFinite(Number(row?.hand_number)) ? Number(row.hand_number) : null;
  const timestamp = new Date(row?.created_at || '');
  const date = Number.isNaN(timestamp.getTime())
    ? ''
    : timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (handNumber !== null && date) return `Hand ${handNumber} · ${date}`;
  if (handNumber !== null) return `Hand ${handNumber}`;
  return date ? `Club Arena Hand · ${date}` : 'Club Arena Hand';
}

/** Return only the caller's own hole cards and the public board. */
export function clubArenaHandForComposer(row, userId, privateHoleCards = null) {
  if (!row || typeof row !== 'object') return null;
  const owner = typeof userId === 'string' ? userId.trim() : '';
  if (!owner) return null;
  // Production showdown rows use hole_cards[userId]; the own-row facts store
  // supplies the same object-card array for hands that did not reveal.
  const rowHoleCards = row.hole_cards && typeof row.hole_cards === 'object' && !Array.isArray(row.hole_cards)
    ? row.hole_cards[owner]
    : null;
  const hand = exactCards(privateHoleCards || rowHoleCards);
  if (!hand || hand.length < 2 || hand.length > 6) return null;
  const boardSource = Array.isArray(row.community_cards) && row.community_cards.length
    ? row.community_cards
    : (Array.isArray(row.board) ? row.board : []);
  const board = exactCards(boardSource);
  if (!board || ![0, 3, 4, 5].includes(board.length)) return null;

  const seen = new Set();
  for (const card of [...hand, ...board]) {
    const code = `${card.rank}${card.suit}`;
    if (seen.has(code)) return null;
    seen.add(code);
  }
  return {
    id: String(row.id || `${row.hand_number || ''}:${row.created_at || ''}`).slice(0, 120),
    label: safeHandLabel(row),
    hand,
    board,
  };
}

/**
 * Authenticated reads only. ca_hand_facts own-row RLS and its
 * (user_id, played_at DESC) index select the bounded recent set first;
 * hand_history RLS then supplies participant-owned public data for only those
 * ids. The identity check below fails closed even if the facts policy regresses.
 */
export async function fetchRecentClubArenaHands(db, userId, limit = RECENT_CLUB_ARENA_HAND_LIMIT) {
  const owner = typeof userId === 'string' ? userId.trim() : '';
  if (!db?.from || !owner) throw new Error('Sign In To Import Club Arena Hands');
  const boundedLimit = Math.max(1, Math.min(RECENT_CLUB_ARENA_HAND_LIMIT, Number(limit) || RECENT_CLUB_ARENA_HAND_LIMIT));
  // Do not put a user id in this query. ca_hand_facts_own_read owns narrowing,
  // while the indexed played_at order prevents the unbounded JSON containment
  // scan that times out for high-volume Club Arena accounts.
  const factsResult = await db
    .from('ca_hand_facts')
    .select('hand_id, user_id, hole_cards, played_at')
    .order('played_at', { ascending: false })
    .limit(boundedLimit);
  if (factsResult?.error) throw new Error('Your Club Arena Cards Are Temporarily Unavailable');
  const ownFacts = (factsResult?.data || []).filter((fact) => (
    String(fact?.user_id || '') === owner && fact?.hand_id
  ));
  const handIds = [...new Set(ownFacts.map((fact) => String(fact.hand_id)))];
  if (!handIds.length) return { hands: [], rejected: 0 };

  const handResult = await db
    .from('hand_history')
    // No roster and no hole-card map enters the browser result.
    .select('id, hand_number, board, community_cards, created_at')
    .in('id', handIds)
    .limit(handIds.length);
  if (handResult?.error) throw new Error('Recent Club Arena Hands Are Temporarily Unavailable');
  const rowById = new Map((handResult?.data || []).map((row) => [String(row?.id), row]));

  const hands = ownFacts
    .map((fact) => clubArenaHandForComposer(rowById.get(String(fact.hand_id)), owner, fact.hole_cards))
    .filter(Boolean);
  return { hands, rejected: ownFacts.length - hands.length };
}

export default {
  RECENT_CLUB_ARENA_HAND_LIMIT,
  normalizeClubArenaCard,
  clubArenaHandForComposer,
  fetchRecentClubArenaHands,
};
