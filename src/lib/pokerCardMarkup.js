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

export const POKER_CARD_PRESET_LIMIT = 12;
export const POKER_CARD_PRESET_NAME_LIMIT = 40;
const POKER_CARD_PRESET_STORAGE_PREFIX = 'sp-poker-card-presets:v1';

export function pokerCardPresetStorageKey(accountId) {
  const owner = typeof accountId === 'string' ? accountId.trim() : '';
  return owner ? `${POKER_CARD_PRESET_STORAGE_PREFIX}:${encodeURIComponent(owner)}` : null;
}

export function normalizePokerCardPresetName(name) {
  return typeof name === 'string'
    ? name.trim().replace(/\s+/g, ' ').slice(0, POKER_CARD_PRESET_NAME_LIMIT)
    : '';
}

function normalizePokerCardPreset(value) {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id.trim().slice(0, 80) : '';
  const name = normalizePokerCardPresetName(value.name);
  const markup = normalizePokerCardMarkup(value.markup);
  const boardCount = parsePokerCards(markup).board.length;
  if (!id || !name || !markup || (boardCount > 0 && boardCount < 3)) return null;
  return { id, name, markup };
}

export function normalizePokerCardPresets(value) {
  if (!Array.isArray(value)) return [];
  const normalized = [];
  const ids = new Set();
  const names = new Set();
  for (const candidate of value) {
    const preset = normalizePokerCardPreset(candidate);
    if (!preset) continue;
    const foldedName = preset.name.toLowerCase();
    if (ids.has(preset.id) || names.has(foldedName)) continue;
    ids.add(preset.id);
    names.add(foldedName);
    normalized.push(preset);
    if (normalized.length === POKER_CARD_PRESET_LIMIT) break;
  }
  return normalized;
}

export function loadPokerCardPresets(storage, accountId) {
  const key = pokerCardPresetStorageKey(accountId);
  if (!key || !storage?.getItem) return [];
  try {
    return normalizePokerCardPresets(JSON.parse(storage.getItem(key) || '[]'));
  } catch {
    return [];
  }
}

export function persistPokerCardPresets(storage, accountId, presets) {
  const key = pokerCardPresetStorageKey(accountId);
  const normalized = normalizePokerCardPresets(presets);
  if (!key || !storage?.setItem) return false;
  try {
    storage.setItem(key, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

function requirePresetName(presets, name, exceptId = null) {
  const normalized = normalizePokerCardPresetName(name);
  if (!normalized) throw new Error('Enter A Preset Name');
  if (presets.some((preset) => preset.id !== exceptId && preset.name.toLowerCase() === normalized.toLowerCase())) {
    throw new Error('A Preset With That Name Already Exists');
  }
  return normalized;
}

export function createPokerCardPreset(presets, name, markup, id) {
  const current = normalizePokerCardPresets(presets);
  if (current.length >= POKER_CARD_PRESET_LIMIT) throw new Error(`You Can Save Up To ${POKER_CARD_PRESET_LIMIT} Presets`);
  const normalizedName = requirePresetName(current, name);
  const normalizedMarkup = normalizePokerCardMarkup(markup);
  const boardCount = parsePokerCards(normalizedMarkup).board.length;
  if (!normalizedMarkup || (boardCount > 0 && boardCount < 3)) throw new Error('Save A Complete Hand Or Board');
  const presetId = typeof id === 'string' && id.trim()
    ? id.trim().slice(0, 80)
    : globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  if (current.some((preset) => preset.id === presetId)) throw new Error('Preset Could Not Be Saved');
  return [...current, { id: presetId, name: normalizedName, markup: normalizedMarkup }];
}

export function renamePokerCardPreset(presets, id, name) {
  const current = normalizePokerCardPresets(presets);
  if (!current.some((preset) => preset.id === id)) throw new Error('Preset Not Found');
  const normalizedName = requirePresetName(current, name, id);
  return current.map((preset) => preset.id === id ? { ...preset, name: normalizedName } : preset);
}

export function deletePokerCardPreset(presets, id) {
  return normalizePokerCardPresets(presets).filter((preset) => preset.id !== id);
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

const RANK_WORD = { T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };

// How a card reads where the Club Arena artwork cannot follow the text: share
// links, SMS bodies, chat previews. "Ace of spades", "10 of hearts".
export function readablePokerCard(rank, suit) {
  if (!isPokerCard(rank, suit)) return '';
  return `${RANK_WORD[rank] || rank} of ${SUIT_FILE[suit]}`;
}

// The composer's "Hand " or " | Board " label in front of a run of cards.
const CARD_LABEL = /(\s*\|\s*)?\b(Hand|Board)\s+$/;

// Post text in plain words for anything that leaves the app. Storage tokens
// become card names ("Hand: Ace of spades, 10 of diamonds | Board: King of
// hearts"), and with a maxLength the text is cut between whole cards, never
// inside one, so a share link can neither leak "[[sp-card:" nor end mid-card.
export function readablePokerText(text, maxLength = Infinity) {
  const tokens = tokenizePokerText(typeof text === 'string' ? text : '');
  const limit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : Infinity;
  let result = '';
  let lead = '';
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextIsCard = tokens[index + 1]?.type === 'card';
    const previousIsCard = tokens[index - 1]?.type === 'card';
    if (token.type === 'card') {
      const piece = `${lead || (previousIsCard ? ', ' : '')}${readablePokerCard(token.rank, token.suit)}`;
      lead = '';
      if (result.length + piece.length > limit) break;
      result += piece;
      continue;
    }
    let value = token.value;
    if (nextIsCard && previousIsCard && !value.trim()) {
      lead = ', ';
      continue;
    }
    const label = nextIsCard ? value.match(CARD_LABEL) : null;
    if (label) {
      // The label travels with its first card, so a cut never leaves "Board:" behind.
      lead = `${label[1] ? ' | ' : ''}${label[2]}: `;
      value = value.slice(0, label.index);
    }
    if (result.length + value.length > limit) {
      result += value.slice(0, limit - result.length);
      break;
    }
    result += value;
  }
  return result;
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

const CARD = String.raw`\[\[sp-card:[2-9TJQKA][hdcs]\]\]`;
// Anything carrying the storage marker, whole or not: what a textarea edit
// leaves behind when it deletes into "[[sp-card:As]]".
const CARD_FRAGMENT = String.raw`\[{0,2}sp-card:[^\s[\]|]*\]{0,2}`;
// The composer's card line ("Hand ... | Board ..."). It starts a line, or
// follows the " - " a check-in puts in front of a post that is only cards.
const cardLine = (card) => new RegExp(
  String.raw`(^|[ \t]*-[ \t]*)(?:Hand|Board)[ \t]*${card}(?:[ \t]*${card})*` +
    String.raw`(?:[ \t]*\|[ \t]*Board[ \t]*${card}(?:[ \t]*${card})*)?`,
  'gm'
);
const CARD_LINE = cardLine(CARD);
const EDITED_CARD_LINE = cardLine(CARD_FRAGMENT);
// A lifted token takes one space before it along, so no double space is left.
const LOOSE_CARDS = new RegExp(String.raw`[ \t]?${CARD}`, 'g');
const CARD_FRAGMENTS = new RegExp(String.raw`[ \t]?${CARD_FRAGMENT}`, 'g');

// Post text with the card markup lifted out, for code that reads the words of
// a post instead of showing it: the check-in badge parses "Checked in at
// <venue> - <note>", and a cards-only check-in has cards where the note goes.
export function stripPokerCardMarkup(text) {
  if (typeof text !== 'string' || !text) return '';
  return text
    .replace(CARD_LINE, '')
    .replace(LOOSE_CARDS, '')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

// What an edit may save. The card line is rebuilt the way the picker writes it
// (duplicates dropped, at most 6 hole and 5 board cards) and a token the edit
// cut into is removed, so a broken "[[sp-card:A" is never stored.
export function normalizePokerPostContent(text) {
  if (typeof text !== 'string' || !text) return '';
  const rebuilt = text.replace(EDITED_CARD_LINE, (line, joiner = '') => {
    const cards = normalizePokerCardMarkup(line
      .slice(joiner.length)
      .replace(/^(Hand|Board)[ \t]*/, '$1 ')
      .replace(/[ \t]*\|[ \t]*Board[ \t]*/, ' | Board '));
    return cards ? `${joiner}${cards}` : '';
  });
  return tokenizePokerText(rebuilt)
    .map((token) => (token.type === 'card' ? token.value : token.value.replace(CARD_FRAGMENTS, '')))
    .join('')
    .trim();
}

export function clubArenaCardUrl(rank, suit, extension = 'webp') {
  if (!isPokerCard(rank, suit)) return null;
  const rankFile = RANK_FILE[rank] || rank;
  return `/hub/club-arena/cards/2color/${SUIT_FILE[suit]}_${rankFile}.${extension}`;
}
