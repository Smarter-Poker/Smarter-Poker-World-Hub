/**
 * Public "Paste Your Own Hand For An Instant Free GTO Check" BOFU Teaser
 * ======================================================================
 * Pure client-side hand-history parser (PokerStars, GGPoker, and casual live
 * notes) + #SMARTERDESIGN interactive Street-1 structural baseline widget.
 *
 * Truthfulness law: zero fabricated solver percentages, frequencies, or EV
 * outputs. Every headline and guidance line derives strictly from parsed card
 * geometry, board texture, position advantage, and honest SPR calculation.
 *
 * House style: #SMARTERDESIGN (#0b1120 surface, 1px solid #1e3a5f, 0px corners,
 * #2563eb / #38bdf8 accents, zero banned gold hexes, >=44px touch targets,
 * 0px horizontal overflow on 390px mobile), Title Case, zero em/en dashes.
 */

import { useState } from 'react';
import { openQuickSignup } from './SmarterQuickSignupSheet';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';

export const HAND_PASTE_SAVED_SPOTS_KEY = 'sp_saved_spots_v1';
export const SAMPLE_HAND_TEXT =
  'Hero dealt Ah Kh on BTN, $1/$2 cash, 100BB ($200 stack), flop Kd 7c 2s, pot $45';

const MAX_SAVED_SPOTS = 25;

const RANK_VALUES = Object.freeze({
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
});

const SUIT_GLYPHS = Object.freeze({
  s: { glyph: '\u2660', color: '#e2e8f0', name: 'Spades' },
  h: { glyph: '\u2665', color: '#f87171', name: 'Hearts' },
  d: { glyph: '\u2666', color: '#38bdf8', name: 'Diamonds' },
  c: { glyph: '\u2663', color: '#34d399', name: 'Clubs' },
});

const IN_POSITION_SEATS = new Set(['BTN', 'CO', 'HJ']);
const OUT_OF_POSITION_SEATS = new Set(['UTG', 'MP', 'SB', 'BB']);

function normalizeSuit(rawSuit) {
  const ch = String(rawSuit || '').toLowerCase();
  if (ch === '\u2660' || ch === 's') return 's';
  if (ch === '\u2665' || ch === 'h') return 'h';
  if (ch === '\u2666' || ch === 'd') return 'd';
  if (ch === '\u2663' || ch === 'c') return 'c';
  return '';
}

function normalizeCardToken(rawToken) {
  const cleaned = String(rawToken || '').trim();
  const match = cleaned.match(/^(10|[2-9AKQJTakqjt])([shdcSHDC\u2660\u2665\u2666\u2663])$/);
  if (!match) return null;
  const rank = match[1] === '10' ? 'T' : match[1].toUpperCase();
  const suit = normalizeSuit(match[2]);
  if (!RANK_VALUES[rank] || !suit) return null;
  return `${rank}${suit}`;
}

function extractCardsFromSpan(spanText, { caseSensitiveRank = false, limit = 5 } = {}) {
  if (!spanText) return [];
  const pattern = caseSensitiveRank
    ? /(?:10|[2-9AKQJT])[shdc\u2660\u2665\u2666\u2663]/g
    : /(?:10|[2-9AKQJTakqjt])[shdcSHDC\u2660\u2665\u2666\u2663]/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = pattern.exec(spanText)) !== null) {
    const card = normalizeCardToken(m[0]);
    if (card && !seen.has(card)) {
      seen.add(card);
      out.push(card);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function parseNumericAmount(rawStr) {
  const cleaned = String(rawStr || '').replace(/,/g, '').trim();
  const val = Number(cleaned);
  return Number.isFinite(val) && val > 0 ? val : null;
}

function formatAmountDisplay(value, unit) {
  if (value === null || value === undefined) return null;
  const formatted = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  if (unit === 'usd') return `$${formatted}`;
  if (unit === 'bb') return `${formatted} BB`;
  return `${formatted} Chips`;
}

function extractBigBlind(text) {
  const parenStakes = text.match(/\(\s*\$?(\d+(?:\.\d+)?)\s*\/\s*\$?(\d+(?:\.\d+)?)/);
  if (parenStakes) return parseNumericAmount(parenStakes[2]);
  const dollarStakes = text.match(/\$(\d+(?:\.\d+)?)\s*\/\s*\$?(\d+(?:\.\d+)?)/);
  if (dollarStakes) return parseNumericAmount(dollarStakes[2]);
  const blindsPhrase = text.match(/\bblinds?\s*[:=]?\s*\$?(\d+(?:\.\d+)?)\s*\/\s*\$?(\d+(?:\.\d+)?)/i);
  if (blindsPhrase) return parseNumericAmount(blindsPhrase[2]);
  return null;
}

function extractBoardCards(text) {
  const board = [];
  const seen = new Set();
  const pushCards = (cards) => {
    for (const c of cards) {
      if (!seen.has(c) && board.length < 5) {
        seen.add(c);
        board.push(c);
      }
    }
  };

  // PokerStars / GGPoker street markers
  const riverBlock = text.match(/\*\*\*\s*RIVER\s*\*\*\*\s*\[([^\]]+)\](?:\s*\[([^\]]+)\])?/i);
  const turnBlock = text.match(/\*\*\*\s*TURN\s*\*\*\*\s*\[([^\]]+)\](?:\s*\[([^\]]+)\])?/i);
  const flopBlock = text.match(/\*\*\*\s*FLOP\s*\*\*\*\s*\[([^\]]+)\]/i);

  if (riverBlock) {
    pushCards(extractCardsFromSpan(riverBlock[1], { limit: 5 }));
    if (riverBlock[2]) pushCards(extractCardsFromSpan(riverBlock[2], { limit: 5 }));
  } else if (turnBlock) {
    pushCards(extractCardsFromSpan(turnBlock[1], { limit: 4 }));
    if (turnBlock[2]) pushCards(extractCardsFromSpan(turnBlock[2], { limit: 4 }));
  } else if (flopBlock) {
    pushCards(extractCardsFromSpan(flopBlock[1], { limit: 3 }));
  }

  // Casual live notes: "flop Kd 7c 2s", "board: Kd 7c 2s 9h", "turn 4c", "river Jh"
  if (board.length === 0) {
    const flopNote = text.match(
      /\b(?:flop|board)\b\s*[:=-]?\s*\[?((?:(?:10|[2-9AKQJTakqjt])[shdcSHDC\u2660\u2665\u2666\u2663][\s,/-]*){3,5})\]?/i,
    );
    if (flopNote) {
      pushCards(extractCardsFromSpan(flopNote[1], { limit: 5 }));
    }
  }

  if (board.length === 3) {
    const turnNote = text.match(
      /\bturn\b\s*[:=-]?\s*\[?((?:10|[2-9AKQJTakqjt])[shdcSHDC\u2660\u2665\u2666\u2663])\]?/i,
    );
    if (turnNote) pushCards(extractCardsFromSpan(turnNote[1], { limit: 1 }));
  }

  if (board.length === 4) {
    const riverNote = text.match(
      /\briver\b\s*[:=-]?\s*\[?((?:10|[2-9AKQJTakqjt])[shdcSHDC\u2660\u2665\u2666\u2663])\]?/i,
    );
    if (riverNote) pushCards(extractCardsFromSpan(riverNote[1], { limit: 1 }));
  }

  return board;
}

function extractHeroCards(text, boardCards) {
  const boardSet = new Set(boardCards);
  const filterNew = (cards) => cards.filter((c) => !boardSet.has(c)).slice(0, 4);

  // 1. Standard PokerStars / GGPoker: "Dealt to Hero [As Qd]"
  const dealtBracket = text.match(/\bdealt\s+to\s+[^\n\r\[]{1,40}\[([^\]]+)\]/i);
  if (dealtBracket) {
    const cards = filterNew(extractCardsFromSpan(dealtBracket[1], { limit: 4 }));
    if (cards.length >= 2) return cards;
  }

  // 2. Live note phrase: "Hero dealt Ah Kh", "Hero has Js Jd", "Hero [Qh Qd]"
  const heroPhrase = text.match(
    /\b(?:hero(?:\s+(?:is\s+)?(?:dealt|has|holds|holding|with|gets))?|dealt|holding|hand)\b\s*[:=-]?\s*\[?((?:(?:10|[2-9AKQJTakqjt])[shdcSHDC\u2660\u2665\u2666\u2663][\s,/-]*){2,4})\]?/i,
  );
  if (heroPhrase) {
    const cards = filterNew(extractCardsFromSpan(heroPhrase[1], { limit: 4 }));
    if (cards.length >= 2) return cards;
  }

  // 3. First non-board bracketed card group (e.g. "[As Qd]")
  const scrubbedForBrackets = text.replace(/\*\*\*\s*(?:FLOP|TURN|RIVER|BOARD|SUMMARY)\s*\*\*\*[^\n\r]*/gi, ' ');
  const bracketMatches = scrubbedForBrackets.matchAll(/\[([^\]]{4,24})\]/g);
  for (const m of bracketMatches) {
    const cards = filterNew(extractCardsFromSpan(m[1], { limit: 4 }));
    if (cards.length >= 2) return cards;
  }

  // 4. Strict rank-uppercase + suit-lowercase tokens outside board spans
  const scrubbedBoardNotes = text
    .replace(/\*\*\*\s*(?:FLOP|TURN|RIVER|BOARD|SUMMARY)\s*\*\*\*[^\n\r]*/gi, ' ')
    .replace(/\b(?:flop|board|turn|river)\b\s*[:=-]?\s*\[?(?:(?:10|[2-9AKQJTakqjt])[shdcSHDC\u2660\u2665\u2666\u2663][\s,/-]*){1,5}\]?/gi, ' ');
  const strictTokens = scrubbedBoardNotes.match(/(?<![A-Za-z0-9])(?:(?:10|[2-9AKQJT])[shdc\u2660\u2665\u2666\u2663])+(?![A-Za-z0-9])/g);
  if (strictTokens) {
    const collected = [];
    const seen = new Set();
    for (const token of strictTokens) {
      for (const c of extractCardsFromSpan(token, { caseSensitiveRank: true, limit: 4 })) {
        if (!boardSet.has(c) && !seen.has(c)) {
          seen.add(c);
          collected.push(c);
          if (collected.length >= 4) break;
        }
      }
      if (collected.length >= 4) break;
    }
    if (collected.length >= 2) return collected;
  }

  return [];
}

function normalizePositionToken(rawPos) {
  const p = String(rawPos || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (p === 'BTN' || p === 'BUTTON' || p === 'BU') return 'BTN';
  if (p === 'CO' || p === 'CUTOFF') return 'CO';
  if (p === 'HJ' || p === 'HIJACK') return 'HJ';
  if (p === 'MP' || p === 'LJ' || p === 'LOJACK' || p === 'MIDDLEPOSITION') return 'MP';
  if (p === 'UTG' || p === 'UNDERTHEGUN') return 'UTG';
  if (p === 'SB' || p === 'SMALLBLIND') return 'SB';
  if (p === 'BB' || p === 'BIGBLIND') return 'BB';
  return null;
}

function extractPosition(text) {
  // 1. PokerStars / GGPoker Hero seat tags
  const heroSeatTag = text.match(/Seat\s+\d+:\s*Hero\b[^\n\r]*\((button|small blind|big blind)\)/i);
  if (heroSeatTag) return normalizePositionToken(heroSeatTag[1]);

  const buttonSeatNum = text.match(/Seat\s+#?(\d+)\s+is\s+the\s+button/i);
  if (buttonSeatNum) {
    const heroSeatMatch = text.match(new RegExp(`Seat\\s+${buttonSeatNum[1]}:\\s*Hero\\b`, 'i'));
    if (heroSeatMatch) return 'BTN';
  }

  const heroPostBlind = text.match(/\bHero\s*:\s*posts\s+(small|big)\s+blind/i);
  if (heroPostBlind) {
    return heroPostBlind[1].toLowerCase() === 'small' ? 'SB' : 'BB';
  }

  // 2. Strip stack/pot BB quantities (e.g. "100BB", "15 BB") and villain "vs BB" mentions
  const scrubbed = text
    .replace(/\b\d+(?:\.\d+)?\s*bbs?\b/gi, ' ')
    .replace(/\b(?:vs\.?|versus|against)\s+(?:the\s+)?(?:BTN|Button|BU|CO|Cut-?Off|HJ|Hijack|MP\d?|LJ|Lojack|UTG(?:\+\d)?|SB|Small Blind|BB|Big Blind)\b/gi, ' ');

  const posMatch = scrubbed.match(
    /\b(BTN|Button|BU|CO|Cut-?Off|HJ|Hijack|MP\d?|LJ|Lojack|Middle Position|UTG(?:\+\d)?|Under The Gun|SB|Small Blind|BB|Big Blind)\b/i,
  );
  if (posMatch) {
    return normalizePositionToken(posMatch[1].replace(/\d+|\+\d+/g, ''));
  }

  return null;
}

function extractPot(text) {
  const potMatch = text.match(
    /\b(?:total\s+pot|pot(?:\s+size|\s+is)?)\b\s*[:=]?\s*(?:(\$)\s*(\d+(?:,\d{3})*(?:\.\d+)?)|(\d+(?:,\d{3})*(?:\.\d+)?)\s*(bbs?|chips?)?\b)/i,
  );
  if (!potMatch) return { potSize: null, potUnit: null, potDisplay: null };
  if (potMatch[1] === '$' && potMatch[2]) {
    const val = parseNumericAmount(potMatch[2]);
    return val ? { potSize: val, potUnit: 'usd', potDisplay: formatAmountDisplay(val, 'usd') } : { potSize: null, potUnit: null, potDisplay: null };
  }
  const val = parseNumericAmount(potMatch[3]);
  if (!val) return { potSize: null, potUnit: null, potDisplay: null };
  const rawUnit = String(potMatch[4] || '').toLowerCase();
  const unit = rawUnit.startsWith('bb') ? 'bb' : 'chips';
  return { potSize: val, potUnit: unit, potDisplay: formatAmountDisplay(val, unit) };
}

function extractStack(text) {
  // 1. PokerStars / GGPoker Hero seat chips: "Seat 6: Hero ($200 in chips)"
  const seatChips = text.match(/Seat\s+\d+:\s*Hero\s*\(\s*(\$)?(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:in\s+chips)?\s*\)/i);
  if (seatChips) {
    const val = parseNumericAmount(seatChips[2]);
    const unit = seatChips[1] === '$' ? 'usd' : 'chips';
    if (val) return { stackSize: val, stackUnit: unit, stackDisplay: formatAmountDisplay(val, unit) };
  }

  // 2. Explicit dollar stack: "($200 stack)", "stack $300", "effective stack $250"
  const usdStackAfter = text.match(
    /\b(?:effective\s+stack|eff\.?\s*stack|stack(?:\s+size)?)\b\s*[:=]?\s*\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i,
  );
  if (usdStackAfter) {
    const val = parseNumericAmount(usdStackAfter[1]);
    if (val) return { stackSize: val, stackUnit: 'usd', stackDisplay: formatAmountDisplay(val, 'usd') };
  }

  const usdStackBefore = text.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s+(?:effective|eff\.?|deep|stack)\b/i);
  if (usdStackBefore) {
    const val = parseNumericAmount(usdStackBefore[1]);
    if (val) return { stackSize: val, stackUnit: 'usd', stackDisplay: formatAmountDisplay(val, 'usd') };
  }

  // 3. Explicit BB stack: "100BB", "50bb effective", "stack 80bb"
  const bbStackExplicit = text.match(
    /\b(?:effective\s+stack|eff\.?\s*stack|stack(?:\s+size)?)\b\s*[:=]?\s*(\d+(?:\.\d+)?)\s*bbs?\b/i,
  );
  if (bbStackExplicit) {
    const val = parseNumericAmount(bbStackExplicit[1]);
    if (val) return { stackSize: val, stackUnit: 'bb', stackDisplay: formatAmountDisplay(val, 'bb') };
  }

  const scrubbedPotAndActions = text.replace(
    /\b(?:total\s+pot|pot(?:\s+size|\s+is)?|bets?|raises?(?:\s+to)?|calls?|opens?(?:\s+to)?|3-?bets?(?:\s+to)?|4-?bets?(?:\s+to)?)\b\s*[:=]?\s*\$?\d+(?:,\d{3})*(?:\.\d+)?\s*bbs?/gi,
    ' ',
  );
  const standaloneBb = scrubbedPotAndActions.match(/\b(\d+(?:\.\d+)?)\s*bbs?\b/i);
  if (standaloneBb) {
    const val = parseNumericAmount(standaloneBb[1]);
    if (val) return { stackSize: val, stackUnit: 'bb', stackDisplay: formatAmountDisplay(val, 'bb') };
  }

  return { stackSize: null, stackUnit: null, stackDisplay: null };
}

function computeHonestSpr({ potSize, potUnit, stackSize, stackUnit, bigBlind }) {
  if (!potSize || !stackSize || potSize <= 0 || stackSize <= 0) {
    return { spr: null, sprZone: null };
  }

  let effectiveStack = null;
  let effectivePot = null;

  if (potUnit === stackUnit) {
    effectiveStack = stackSize;
    effectivePot = potSize;
  } else if (bigBlind && bigBlind > 0 && ((potUnit === 'usd' && stackUnit === 'bb') || (potUnit === 'bb' && stackUnit === 'usd'))) {
    effectiveStack = stackUnit === 'bb' ? stackSize * bigBlind : stackSize;
    effectivePot = potUnit === 'bb' ? potSize * bigBlind : potSize;
  } else {
    return { spr: null, sprZone: null };
  }

  if (!effectivePot || effectivePot <= 0) return { spr: null, sprZone: null };
  const spr = Math.round((effectiveStack / effectivePot) * 100) / 100;
  let sprZone = 'Deep SPR (Implied Odds Zone)';
  if (spr < 4) {
    sprZone = 'Low SPR (Commitment Zone)';
  } else if (spr <= 8) {
    sprZone = 'Medium SPR (Multi-Street Geometry)';
  }
  return { spr, sprZone };
}

function describeHeroBoardStructure(heroCards, boardCards) {
  const heroRanks = heroCards.map((c) => RANK_VALUES[c[0]]);
  const heroSuits = heroCards.map((c) => c[1]);
  const isPocketPair = heroCards.length === 2 && heroRanks[0] === heroRanks[1];
  const isSuited = heroCards.length === 2 && heroSuits[0] === heroSuits[1];

  if (boardCards.length < 3) {
    if (isPocketPair) {
      return heroRanks[0] >= 11 ? 'Premium Pocket Pair' : 'Pocket Pair';
    }
    if (heroCards.length === 2 && Math.min(...heroRanks) >= 10) {
      return isSuited ? 'Suited Broadway Holding' : 'Offsuit Broadway Holding';
    }
    if (heroCards.length === 4) {
      return 'Four-Card Omaha Holding';
    }
    return isSuited ? 'Suited Starting Hand' : 'Unpaired Starting Hand';
  }

  const boardRanks = boardCards.map((c) => RANK_VALUES[c[0]]);
  const boardSuits = boardCards.map((c) => c[1]);
  const maxBoardRank = Math.max(...boardRanks);

  const boardRankCounts = {};
  for (const r of boardRanks) boardRankCounts[r] = (boardRankCounts[r] || 0) + 1;

  const matchedRanks = heroRanks.filter((r) => boardRanks.includes(r));
  const uniqueMatched = [...new Set(matchedRanks)];

  // Check flush draw or made flush (strictly using hero + board cards)
  const suitCounts = {};
  for (const s of [...heroSuits, ...boardSuits]) {
    suitCounts[s] = (suitCounts[s] || 0) + 1;
  }
  const hasFlush = Object.entries(suitCounts).some(([s, cnt]) => cnt >= 5 && heroSuits.includes(s));
  const hasFlushDraw = !hasFlush && Object.entries(suitCounts).some(([s, cnt]) => cnt === 4 && heroSuits.includes(s));

  if (hasFlush) return 'Made Flush';
  if (isPocketPair && boardRanks.includes(heroRanks[0])) return 'Flopped Set';
  if (uniqueMatched.length >= 2) return 'Two Pair';
  if (uniqueMatched.length === 1 && boardRankCounts[uniqueMatched[0]] >= 2) return 'Trips On Paired Board';
  if (isPocketPair && heroRanks[0] > maxBoardRank) return 'Overpair To The Board';
  if (uniqueMatched.includes(maxBoardRank)) {
    return hasFlushDraw ? 'Top Pair Plus Flush Draw' : 'Top Pair';
  }
  if (uniqueMatched.length === 1) {
    return hasFlushDraw ? 'Pair Plus Flush Draw' : 'Middle Or Bottom Pair';
  }
  if (hasFlushDraw) return 'Flush Draw';
  if (heroRanks.every((r) => r > maxBoardRank)) return 'Two Overcards';
  return 'Unpaired Holding';
}

function describeBoardTexture(boardCards) {
  if (boardCards.length < 3) return '';
  const suits = boardCards.map((c) => c[1]);
  const ranks = boardCards.map((c) => RANK_VALUES[c[0]]).sort((a, b) => b - a);
  const suitCounts = {};
  for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
  const maxSuit = Math.max(...Object.values(suitCounts));
  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
  const isPaired = Math.max(...Object.values(rankCounts)) >= 2;

  const suitLabel = maxSuit >= 3 ? 'Monotone' : maxSuit === 2 ? 'Two-Tone' : 'Rainbow';
  const pairLabel = isPaired ? 'Paired' : ranks[0] >= 12 ? 'High-Card' : 'Low-To-Medium';
  return `${suitLabel} ${pairLabel} Board`;
}

function buildBaselineCopy({ heroCards, boardCards, position, street, stackDisplay, spr, sprZone }) {
  const handStructure = describeHeroBoardStructure(heroCards, boardCards);
  const boardTexture = describeBoardTexture(boardCards);
  const isIp = position && IN_POSITION_SEATS.has(position);
  const isOop = position && OUT_OF_POSITION_SEATS.has(position);

  const posClause = isIp
    ? `In Position (${position})`
    : isOop
      ? `Out Of Position (${position})`
      : 'Position Unspecified';

  if (street === 'Preflop') {
    const headline = `${handStructure} Preflop From ${posClause}`;
    const depthNote = stackDisplay
      ? `Effective Stack Reads ${stackDisplay}, Which Governs Open Sizing, 3-Bet Polarity, And 4-Bet Commitment Thresholds.`
      : 'Add Stack Depth (Such As 100BB) To Calibrate Preflop 3-Bet And 4-Bet Commitment Thresholds.';
    const posNote = isIp
      ? 'Late-Position Seating Grants Equity Realization Advantage When Calling Or Expanding Value And Bluff Ranges.'
      : isOop
        ? 'Early Or Blind Seating Rewards Tighter Linear Ranges And Disciplined Protection Against Late-Position 3-Bets.'
        : 'Include Your Seat (BTN, CO, HJ, UTG, SB, Or BB) To Lock Positional Range Width.';
    return {
      baselineHeadline: headline,
      baselineGuidance: `${posNote} ${depthNote} Unlock The Full Multi-Street Solver Breakdown Free To Inspect Exact Range Matrices.`,
    };
  }

  const headline = `${street} Structural Check: ${handStructure} ${posClause}${sprZone ? ` At ${sprZone}` : ''}`;
  const textureNote = boardTexture
    ? `${boardTexture} Shapes Range Advantage And Continuation Sizing.`
    : 'Postflop Texture Shapes Range Advantage And Bet Sizing.';

  let sprNote = 'Include Matching Stack And Pot Units (Or Blind Levels) To Compute Exact Stack-To-Pot Ratio Geometry.';
  if (spr !== null) {
    if (spr < 4) {
      sprNote = `SPR ${spr} Sits In The Low Commitment Zone, Favoring Simplified Value Sizing And High Stack-Off Discipline With Strong Pairs Or Equity.`;
    } else if (spr <= 8) {
      sprNote = `SPR ${spr} Sits In The Medium Multi-Street Zone, Supporting Balanced Geometric Sizing Across ${street} And Future Streets.`;
    } else {
      sprNote = `SPR ${spr} Sits In The Deep Implied-Odds Zone, Rewarding Pot Control With One-Pair Hands And Stronger Pressure With Nutted Draws.`;
    }
  }

  const positionNote = isIp
    ? 'Acting In Position Lets You Realize Equity, Control Pot Size, And Apply Turn And River Pressure Selectively.'
    : isOop
      ? 'Acting Out Of Position Requires Checking Enough Medium-Strength Hands To Protect Your Check-Call Range Against Positional Barrels.'
      : 'Specify Your Table Seat To Refine In-Position Versus Out-Of-Position Check-Range Construction.';

  return {
    baselineHeadline: headline,
    baselineGuidance: `${textureNote} ${sprNote} ${positionNote}`,
  };
}

/**
 * Pure deterministic parser for PokerStars, GGPoker, and casual live hand notes.
 * Safely returns `{ valid: false, ... }` on empty or malformed text without throwing.
 */
export function parseQuickHandTeaser(rawText) {
  const emptyResult = {
    valid: false,
    heroCards: [],
    boardCards: [],
    position: null,
    street: 'Preflop',
    potSize: null,
    potUnit: null,
    potDisplay: null,
    stackSize: null,
    stackUnit: null,
    stackDisplay: null,
    spr: null,
    sprZone: null,
    baselineHeadline: '',
    baselineGuidance: '',
  };

  if (typeof rawText !== 'string') return emptyResult;
  const text = rawText.trim();
  if (!text) return emptyResult;

  const boardCards = extractBoardCards(text);
  const heroCards = extractHeroCards(text, boardCards);

  if (heroCards.length < 2) {
    return emptyResult;
  }

  const position = extractPosition(text);

  let street = 'Preflop';
  if (boardCards.length >= 5 || /\*\*\*\s*RIVER\s*\*\*\*/i.test(text)) {
    street = 'River';
  } else if (boardCards.length === 4 || /\*\*\*\s*TURN\s*\*\*\*/i.test(text)) {
    street = 'Turn';
  } else if (boardCards.length === 3 || /\*\*\*\s*FLOP\s*\*\*\*/i.test(text)) {
    street = 'Flop';
  }

  const bigBlind = extractBigBlind(text);
  const { potSize, potUnit, potDisplay } = extractPot(text);
  const { stackSize, stackUnit, stackDisplay } = extractStack(text);
  const { spr, sprZone } = computeHonestSpr({
    potSize,
    potUnit,
    stackSize,
    stackUnit,
    bigBlind,
  });

  const { baselineHeadline, baselineGuidance } = buildBaselineCopy({
    heroCards,
    boardCards,
    position,
    street,
    stackDisplay,
    spr,
    sprZone,
  });

  return {
    valid: true,
    heroCards,
    boardCards,
    position,
    street,
    potSize,
    potUnit,
    potDisplay,
    stackSize,
    stackUnit,
    stackDisplay,
    spr,
    sprZone,
    baselineHeadline,
    baselineGuidance,
  };
}

/**
 * Persists a validated hand-paste spot into localStorage `sp_saved_spots_v1`
 * with `kind: 'hand-review'`, deduplicated and capped at 25 spots.
 */
export function persistHandPasteSpot(parsed, { redirectPath = '/tools', storage = null } = {}) {
  if (!parsed || !parsed.valid) return null;
  const store =
    storage ||
    (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);
  if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function') {
    return null;
  }

  const safePath = String(redirectPath || '/tools').trim().startsWith('/')
    ? String(redirectPath || '/tools').trim().slice(0, 200)
    : '/tools';
  const cardsSlug = [...parsed.heroCards, ...parsed.boardCards].join('-').toLowerCase();
  const id = `hand-review-${cardsSlug || 'spot'}`.slice(0, 80);
  const heroLabel = parsed.heroCards.join(' ');
  const boardLabel = parsed.boardCards.length ? ` On ${parsed.boardCards.join(' ')}` : '';
  const seatLabel = parsed.position || parsed.street;

  const entry = {
    id,
    kind: 'hand-review',
    label: `${heroLabel} (${seatLabel})`,
    toolSlug: 'hand-paste-teaser',
    toolName: 'Instant Free Street-1 GTO Check',
    summaryText: `${heroLabel}${boardLabel} - ${parsed.baselineHeadline}`.slice(0, 320),
    path: safePath,
    url: safePath,
    savedAt: new Date().toISOString(),
  };

  try {
    const raw = store.getItem(HAND_PASTE_SAVED_SPOTS_KEY);
    const parsedList = raw ? JSON.parse(raw) : [];
    const existing = Array.isArray(parsedList) ? parsedList : [];
    const filtered = existing.filter((item) => item && item.id !== entry.id);
    const next = [entry, ...filtered].slice(0, MAX_SAVED_SPOTS);
    store.setItem(HAND_PASTE_SAVED_SPOTS_KEY, JSON.stringify(next));
    return entry;
  } catch (_) {
    return null;
  }
}

function CardPill({ card }) {
  const rank = card.slice(0, -1);
  const suitKey = card.slice(-1).toLowerCase();
  const suitMeta = SUIT_GLYPHS[suitKey] || SUIT_GLYPHS.s;
  return (
    <span
      aria-label={`${rank} Of ${suitMeta.name}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '4px 8px',
        background: '#071321',
        border: '1px solid #1e3a5f',
        borderRadius: 0,
        color: suitMeta.color,
        fontWeight: 800,
        fontSize: 14,
        lineHeight: 1.2,
      }}
    >
      <span>{rank}</span>
      <span aria-hidden="true">{suitMeta.glyph}</span>
    </span>
  );
}

export default function SmarterHandPasteTeaser({
  context = 'seo-hand-paste',
  redirectPath = '/tools',
  sampleHand = SAMPLE_HAND_TEXT,
  eyebrow = 'Instant Free Street-1 GTO Check',
  title = 'Paste Your Own Hand For An Instant Free GTO Check',
}) {
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLoadSample = () => {
    setRawText(sampleHand);
    setErrorMessage('');
  };

  const handleAnalyze = () => {
    const parsed = parseQuickHandTeaser(rawText);
    if (!parsed.valid) {
      setResult(null);
      setErrorMessage(
        'Include At Least Two Hero Cards (Example: Ah Kh Or [As Qd]) Or Tap Load Sample Hand.',
      );
      return;
    }

    setErrorMessage('');
    setResult(parsed);
    persistHandPasteSpot(parsed, { redirectPath });

    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('sp:seo-tool-engaged', {
            detail: {
              toolSlug: 'hand-paste-teaser',
              tool: 'hand-paste-teaser',
              context,
              spotKey: `hand-review:${parsed.heroCards.join('')}`,
            },
          }),
        );
      }
    } catch (_) {
      /* non-blocking */
    }
  };

  const handleUnlockClick = () => {
    trackSeoFunnelEvent('seo_calculator_save_bar_click', {
      toolSlug: 'hand-paste-teaser',
      tool_slug: 'hand-paste-teaser',
      context,
      redirect_path: redirectPath,
    });
    const heroSummary = result?.heroCards?.length ? result.heroCards.join(' ') : 'Your Hand';
    const boardSummary = result?.boardCards?.length ? ` On ${result.boardCards.join(' ')}` : '';
    openQuickSignup({
      unlockKey: 'solver-matrix',
      source: 'hand-paste-teaser',
      redirectPath,
      eyebrow: 'Free Multi-Street GTO Breakdown',
      title: 'Unlock Full Multi-Street GTO Breakdown Free',
      subtitle: `Save ${heroSummary}${boardSummary} To Your Free Smarter.Poker Account And Unlock Complete Preflop Matrices, Turn & River Lines, And 107 Free GTO Training Games.`,
      benefits: [
        '100% Free Forever - Zero Credit Card Required',
        'Save Hand Reviews & Inspect Full 13x13 GTO Solver Matrices',
        'Drill Exact Spots Across 107 Interactive GTO Training Games',
      ],
    });
  };

  return (
    <section
      data-testid="hand-paste-bofu-teaser"
      aria-label="Paste Your Own Hand For An Instant Free GTO Check"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '100%',
        margin: '24px 0',
        padding: 20,
        background: '#0b1120',
        border: '1px solid #1e3a5f',
        borderTop: '2px solid #2563eb',
        borderRadius: 0,
        color: '#f2f7ff',
        overflowWrap: 'anywhere',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            background: '#0f1d33',
            border: '1px solid #2563eb',
            borderRadius: 0,
            color: '#38bdf8',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </span>

        <button
          type="button"
          data-testid="hand-paste-sample-btn"
          onClick={handleLoadSample}
          style={{
            minHeight: 44,
            padding: '8px 14px',
            background: '#0f1d33',
            border: '1px solid #38bdf8',
            borderRadius: 0,
            color: '#38bdf8',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Load Sample Hand
        </button>
      </div>

      <h2
        style={{
          margin: '0 0 8px',
          fontSize: 20,
          fontWeight: 800,
          lineHeight: 1.3,
          color: '#f2f7ff',
        }}
      >
        {title}
      </h2>

      <p
        style={{
          margin: '0 0 14px',
          fontSize: 14,
          lineHeight: 1.55,
          color: '#bdd0e2',
        }}
      >
        Paste A PokerStars Hand, GGPoker History, Or Quick Live-Table Note For A Free Instant Street-1 Structural Check With Zero Account Required.
      </p>

      <textarea
        value={rawText}
        onChange={(event) => {
          setRawText(event.target.value);
          if (errorMessage) setErrorMessage('');
        }}
        rows={3}
        aria-label="Paste Poker Hand History Or Live Hand Notes"
        placeholder="Example: Hero Dealt Ah Kh On BTN, $1/$2 Cash, 100BB ($200 Stack), Flop Kd 7c 2s, Pot $45"
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100%',
          minHeight: 88,
          padding: 12,
          background: '#060c18',
          border: '1px solid #1e3a5f',
          borderRadius: 0,
          color: '#f2f7ff',
          fontSize: 14,
          lineHeight: 1.5,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          resize: 'vertical',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
          marginTop: 12,
        }}
      >
        <button
          type="button"
          data-testid="hand-paste-analyze-btn"
          onClick={handleAnalyze}
          style={{
            minHeight: 44,
            padding: '10px 18px',
            background: '#2563eb',
            border: '1px solid #38bdf8',
            borderRadius: 0,
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '0.02em',
            cursor: 'pointer',
          }}
        >
          Run Free Street-1 GTO Check
        </button>

        {rawText ? (
          <button
            type="button"
            onClick={() => {
              setRawText('');
              setResult(null);
              setErrorMessage('');
            }}
            style={{
              minHeight: 44,
              padding: '10px 14px',
              background: '#060c18',
              border: '1px solid #1e3a5f',
              borderRadius: 0,
              color: '#bdd0e2',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {errorMessage ? (
        <div
          role="alert"
          data-testid="hand-paste-error"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: '#171224',
            border: '1px solid #f87171',
            borderRadius: 0,
            color: '#fecaca',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {result && result.valid ? (
        <div
          data-testid="hand-paste-result"
          style={{
            marginTop: 16,
            padding: 16,
            background: '#060c18',
            border: '1px solid #1e3a5f',
            borderLeft: '3px solid #38bdf8',
            borderRadius: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#38bdf8',
              marginBottom: 8,
            }}
          >
            Free Street-1 Structural Baseline
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ padding: 10, background: '#0b1120', border: '1px solid #1e3a5f', borderRadius: 0 }}>
              <div style={{ fontSize: 11, color: '#86daff', textTransform: 'uppercase', marginBottom: 6 }}>
                Hero Hand
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.heroCards.map((card) => (
                  <CardPill key={`hero-${card}`} card={card} />
                ))}
              </div>
            </div>

            {result.boardCards.length > 0 ? (
              <div style={{ padding: 10, background: '#0b1120', border: '1px solid #1e3a5f', borderRadius: 0 }}>
                <div style={{ fontSize: 11, color: '#86daff', textTransform: 'uppercase', marginBottom: 6 }}>
                  {`${result.street} Board`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.boardCards.map((card) => (
                    <CardPill key={`board-${card}`} card={card} />
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ padding: 10, background: '#0b1120', border: '1px solid #1e3a5f', borderRadius: 0 }}>
              <div style={{ fontSize: 11, color: '#86daff', textTransform: 'uppercase', marginBottom: 4 }}>
                Seat & Street
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f2f7ff' }}>
                {`${result.position || 'Unlisted'} / ${result.street}`}
              </div>
            </div>

            <div style={{ padding: 10, background: '#0b1120', border: '1px solid #1e3a5f', borderRadius: 0 }}>
              <div style={{ fontSize: 11, color: '#86daff', textTransform: 'uppercase', marginBottom: 4 }}>
                Stack / Pot / SPR
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f2f7ff' }}>
                {`${result.stackDisplay || 'N/A'} / ${result.potDisplay || 'N/A'} / ${result.spr !== null ? `SPR ${result.spr}` : 'SPR N/A'}`}
              </div>
            </div>
          </div>

          <h3
            style={{
              margin: '0 0 6px',
              fontSize: 16,
              fontWeight: 800,
              color: '#f2f7ff',
              lineHeight: 1.35,
            }}
          >
            {result.baselineHeadline}
          </h3>

          <p
            style={{
              margin: '0 0 14px',
              fontSize: 14,
              lineHeight: 1.6,
              color: '#bdd0e2',
            }}
          >
            {result.baselineGuidance}
          </p>

          <button
            type="button"
            data-testid="hand-paste-unlock-cta"
            onClick={handleUnlockClick}
            style={{
              minHeight: 44,
              width: '100%',
              maxWidth: 420,
              padding: '12px 18px',
              background: '#2563eb',
              border: '1px solid #38bdf8',
              borderRadius: 0,
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '0.02em',
              cursor: 'pointer',
            }}
          >
            Unlock Full Multi-Street GTO Breakdown Free
          </button>
        </div>
      ) : null}
    </section>
  );
}
