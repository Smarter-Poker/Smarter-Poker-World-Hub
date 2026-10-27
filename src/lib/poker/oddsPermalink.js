/**
 * oddsPermalink.js
 * Pure JS helpers for Poker Odds Calculator shareable permalinks and
 * Wordle-style Discord/X spot summaries.
 */
import { makeCard, GAME_CONFIGS } from './pokerOddsEngine.js';

const SUIT_SHORT_TO_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const SUIT_NAME_TO_SHORT = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' };
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

export function parseCardListFromParam(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const tokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const out = [];
  for (const tok of tokens) {
    const m = tok.match(/^(10|[2-9TJQKA])([shdc])$/i);
    if (!m) continue;
    const rawRank = m[1].toUpperCase();
    const rank = rawRank === 'T' ? '10' : rawRank;
    const suit = SUIT_SHORT_TO_NAME[m[2].toLowerCase()];
    const card = makeCard(rank, suit);
    if (card) out.push(card);
  }
  return out;
}

export function buildCardListParam(cards = []) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  return cards
    .map((c) => {
      if (!c || !c.rank || !c.suit) return '';
      const r = c.rank === '10' ? '10' : String(c.rank).toUpperCase();
      const s = SUIT_NAME_TO_SHORT[c.suit] || '';
      return r && s ? `${r}${s}` : '';
    })
    .filter(Boolean)
    .join(',');
}

export function buildOddsSpotSummary({
  game = 'nlhe',
  hands = [],
  board = [],
  results = null,
  url = 'https://smarter.poker/hub/poker-tools',
} = {}) {
  const cfgName = GAME_CONFIGS[game]?.name || "No-Limit Hold'em";
  const seatLines = hands
    .map((h, i) => {
      if (!Array.isArray(h) || h.length === 0) return null;
      const cardsStr = h.map((c) => `${c.rank}${SUIT_SYMBOLS[c.suit] || ''}`).join(' ');
      const eq = results?.[i] ? `${results[i].equity.toFixed(1)}%` : '--';
      return `${i === 0 ? 'Hero' : `Villain ${i}`} [${cardsStr}]: ${eq}`;
    })
    .filter(Boolean);
  const boardStr =
    Array.isArray(board) && board.length > 0
      ? `Board: ${board.map((c) => `${c.rank}${SUIT_SYMBOLS[c.suit] || ''}`).join(' ')}`
      : 'Board: Preflop';
  return [
    `Smarter.Poker ${cfgName} Equity Spot`,
    boardStr,
    ...seatLines,
    `Run This Spot Free: ${url}`,
  ].join('\n');
}
