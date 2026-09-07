export const CARD_TOKEN_PATTERN = /\[\[sp-card:([2-9TJQKA])([hdcs])\]\]/g;

const RANK_FILE = { T: '10', J: 'j', Q: 'q', K: 'k', A: 'a' };
const SUIT_FILE = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
export const SUIT_SYMBOL = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };

export function isPokerCard(rank, suit) {
  return /^[2-9TJQKA]$/.test(rank || '') && /^[hdcs]$/.test(suit || '');
}

export function pokerCardToken(card) {
  if (!card || !isPokerCard(card.rank, card.suit)) return '';
  return `[[sp-card:${card.rank}${card.suit}]]`;
}

export function normalizePokerCardSelection(hand = [], board = []) {
  const seen = new Set();
  const normalize = (cards, limit) => {
    const safeCards = [];
    for (const card of Array.isArray(cards) ? cards : []) {
      if (!card || !isPokerCard(card.rank, card.suit)) continue;
      const key = `${card.rank}${card.suit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      safeCards.push({ rank: card.rank, suit: card.suit });
      if (safeCards.length === limit) break;
    }
    return safeCards;
  };

  return {
    hand: normalize(hand, 6),
    board: normalize(board, 5),
  };
}

export function formatPokerCards(hand = [], board = []) {
  const normalized = normalizePokerCardSelection(hand, board);
  const handTokens = normalized.hand.map(pokerCardToken).join('');
  const boardTokens = normalized.board.map(pokerCardToken).join('');
  if (handTokens && boardTokens) return `Hand ${handTokens} | Board ${boardTokens}`;
  if (handTokens) return `Hand ${handTokens}`;
  if (boardTokens) return `Board ${boardTokens}`;
  return '';
}

export function parsePokerCards(text = '') {
  const handText = text.match(/(?:^|\s)Hand\s+(.+?)(?:\s+\|\s+Board\s+|$)/)?.[1] || '';
  const boardText = text.match(/(?:^|\s)Board\s+(.+)$/)?.[1] || '';
  const cardsFrom = (value) => tokenizePokerText(value)
    .filter((token) => token.type === 'card')
    .map(({ rank, suit }) => ({ rank, suit }));
  return normalizePokerCardSelection(cardsFrom(handText), cardsFrom(boardText));
}

export function normalizePokerCardMarkup(text = '') {
  const { hand, board } = parsePokerCards(text);
  return formatPokerCards(hand, board);
}

export function containsPokerCards(text) {
  if (!text) return false;
  CARD_TOKEN_PATTERN.lastIndex = 0;
  return CARD_TOKEN_PATTERN.test(text);
}

export function tokenizePokerText(text) {
  if (!text) return [];
  const tokens = [];
  let cursor = 0;
  CARD_TOKEN_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CARD_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ type: 'text', value: text.slice(cursor, index) });
    tokens.push({ type: 'card', rank: match[1], suit: match[2], value: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) tokens.push({ type: 'text', value: text.slice(cursor) });
  return tokens;
}

export function readablePokerText(text) {
  return tokenizePokerText(text)
    .map((token) => token.type === 'card' ? `${token.rank}${SUIT_SYMBOL[token.suit]}` : token.value)
    .join('');
}

export function truncatePokerText(text = '', maxLength = 300) {
  if (typeof text !== 'string' || text.length === 0) return { text: '', truncated: false };
  if (!Number.isFinite(maxLength) || maxLength < 1) return { text: '', truncated: true };

  let remaining = Math.floor(maxLength);
  let result = '';
  for (const token of tokenizePokerText(text)) {
    const visualLength = token.type === 'card' ? 1 : token.value.length;
    if (visualLength <= remaining) {
      result += token.value;
      remaining -= visualLength;
      continue;
    }
    if (token.type === 'text' && remaining > 0) result += token.value.slice(0, remaining);
    return { text: result, truncated: true };
  }
  return { text: result, truncated: false };
}

export function clubArenaCardUrl(rank, suit, extension = 'webp') {
  if (!isPokerCard(rank, suit)) return null;
  const rankFile = RANK_FILE[rank] || rank;
  return `/hub/club-arena/cards/2color/${SUIT_FILE[suit]}_${rankFile}.${extension}`;
}
