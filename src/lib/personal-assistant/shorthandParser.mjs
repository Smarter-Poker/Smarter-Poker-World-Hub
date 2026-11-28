/**
 * Live Poker Room Shorthand Parser.
 *
 * Pure deterministic parser with zero external dependencies that converts casual
 * live poker room notes like:
 *   "UTG opens 3x, I 3b AhKh BTN 9x, flop Ks7c2d, cbet 1/3"
 *   "CO 85bb Qs Js board Ts 9h 2c call tournament"
 * into structured LiveSpotQuickEntry form fields.
 *
 * Never invents cards, never lets hero and board cards collide, and handles
 * empty, partial, or ambiguous strings safely without throwing.
 */

const VALID_POSITIONS = new Set(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']);

const POSITION_PATTERNS = [
  { pos: 'BTN', re: /\b(?:btn|bu|button|dealer)\b/i },
  { pos: 'CO', re: /\b(?:co|cutoff|cut-off)\b/i },
  { pos: 'MP', re: /\b(?:mp\d?|hj|hijack|lj|lojack|utg\+2)\b/i },
  { pos: 'UTG', re: /\b(?:utg(?:\+1)?|ep|under\s+the\s+gun)\b/i },
  { pos: 'SB', re: /\b(?:sb|small\s+blind)\b/i },
  { pos: 'BB', re: /\b(?:bb|big\s+blind)\b/i },
];

const SUIT_SYMBOLS = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };

function normalizeCard(rawRank, rawSuit) {
  const rankUpper = String(rawRank || '').toUpperCase();
  const rank = rankUpper === '10' ? 'T' : rankUpper;
  const suit = SUIT_SYMBOLS[rawSuit] || String(rawSuit || '').toLowerCase();
  if (!'AKQJT98765432'.includes(rank) || !'shdc'.includes(suit)) return null;
  return `${rank}${suit}`;
}

function extractCardTokens(segment) {
  if (!segment || typeof segment !== 'string') return [];
  const cards = [];
  const seen = new Set();
  // Match card tokens like Ah, Kh, 10s, Ts, 7c, A♠, avoiding words like "as", "ad", "ac", "ah"
  // when part of longer English words by requiring non-letter boundaries around card groups.
  const groupRe = /(?:^|[^A-Za-z0-9])((?:(?:10|[AKQJT98765432])[shdc♠♥♦♣](?:\s*[,/-]?\s*)?)+)(?=$|[^A-Za-z0-9])/gi;
  let groupMatch;
  while ((groupMatch = groupRe.exec(segment)) !== null) {
    const chunk = groupMatch[1];
    // Skip standalone common two-letter English words like "as", "ad", "at", "ac" when lowercase-only and not paired.
    const trimmed = chunk.trim();
    if (/^(?:as|ad|ac|ah)$/i.test(trimmed) && trimmed === trimmed.toLowerCase()) {
      continue;
    }
    const tokenRe = /(10|[AKQJT98765432])([shdc♠♥♦♣])/gi;
    let m;
    while ((m = tokenRe.exec(chunk)) !== null) {
      const card = normalizeCard(m[1], m[2]);
      if (card && !seen.has(card)) {
        seen.add(card);
        cards.push(card);
      }
    }
  }
  return cards;
}

function findHeroPosition(text) {
  // First check clauses explicitly naming Hero ("I ...", "hero ...", "me ...")
  const heroClauseRe = /(?:^|[,.;\n])\s*(?:i\b|hero\b|me\b)[^,.;\n]*/gi;
  let clauseMatch;
  while ((clauseMatch = heroClauseRe.exec(text)) !== null) {
    const clause = clauseMatch[0];
    for (const { pos, re } of POSITION_PATTERNS) {
      if (re.test(clause)) return pos;
    }
  }

  // Next check patterns like "BTN with AhKh", "CO 85bb", "Hero in BB", "AhKh BTN"
  const explicitHeroPosRe = /\b(?:i|hero)\s+(?:in\s+|on\s+|from\s+)?(utg(?:\+1|\+2)?|mp\d?|hj|lj|co|btn|bu|button|sb|bb)\b/i;
  const expMatch = text.match(explicitHeroPosRe);
  if (expMatch) {
    for (const { pos, re } of POSITION_PATTERNS) {
      if (re.test(expMatch[1])) return pos;
    }
  }

  // If a position appears right next to Hero's cards (before board/flop marker), prefer it over an earlier villain opener.
  const preBoard = text.split(/\b(?:board|flop|turn|river)\b/i)[0] || text;
  const allPosHits = [];
  for (const { pos, re } of POSITION_PATTERNS) {
    const globalRe = new RegExp(re.source, 'gi');
    let m;
    while ((m = globalRe.exec(preBoard)) !== null) {
      // Ignore "85bb" / "100 bb" stack annotations as BB position
      if (pos === 'BB') {
        const before = preBoard.slice(Math.max(0, m.index - 8), m.index);
        if (/\d\s*$/.test(before)) continue;
      }
      allPosHits.push({ pos, index: m.index });
    }
  }
  allPosHits.sort((a, b) => a.index - b.index);

  if (allPosHits.length === 1) {
    return allPosHits[0].pos;
  }
  if (allPosHits.length >= 2) {
    // If first position is an opener ("UTG opens... BTN..."), Hero is typically the second position
    if (/\b(?:opens?|raises?|rfi|limps?|3b(?:et)?s?)\b/i.test(preBoard.slice(allPosHits[0].index, allPosHits[1].index))) {
      return allPosHits[1].pos;
    }
    return allPosHits[0].pos;
  }

  return null;
}

function parseStackBb(text) {
  const stackMatch = text.match(/\b(\d{1,3}(?:\.\d{1,2})?)\s*bb(?:\s*eff(?:ective)?)?\b/i)
    || text.match(/\beff(?:ective)?\s*(\d{1,3}(?:\.\d{1,2})?)\s*bb?\b/i);
  if (!stackMatch) return null;
  const val = Number(stackMatch[1]);
  if (!Number.isFinite(val) || val < 2 || val > 500) return null;
  return Math.round(val * 10) / 10;
}

function parseGameFormat(text) {
  if (/\b(?:tournament|tourney|mtt|sng|sit\s*&?\s*go|icm|bubble|final\s+table|ft|bounty|pko)\b/i.test(text)) {
    return 'tournament';
  }
  if (/\b(?:cash|ring|live\s+\d+\/\d+|\$\d+\/\$\d+)\b/i.test(text)) {
    return 'cash';
  }
  return 'cash';
}

function parsePotType(text) {
  if (/\b(?:4\s*-?\s*bet|4b|four\s*-?\s*bet)\b/i.test(text)) return '4-Bet';
  if (/\b(?:3\s*-?\s*bet|3b|three\s*-?\s*bet)\b/i.test(text)) return '3-Bet';
  if (/\b(?:limp(?:ed)?|multiway\s+limp)\b/i.test(text)) return 'Limped';
  return 'SRP';
}

function parseFacingAndHeroAction(text, { hasBoard, position, potType }) {
  const lower = text.toLowerCase();

  let facingAction = 'open_raise';
  if (hasBoard) {
    facingAction = 'facing_bet';
  } else if (/\b(?:faces?\s+(?:a\s+)?3\s*-?\s*bet|facing\s+3b|vs\s+3b|got\s+3b(?:et)?|3\s*-?\s*bet\s+by)\b/i.test(lower)) {
    facingAction = 'three_bet';
  } else if (/\b(?:folds?\s+to\s+(?:me|hero)|folded\s+to\s+(?:me|hero)|unopened|rfi)\b/i.test(lower)) {
    facingAction = 'unopened';
  } else if (/\b(?:opens?|raises?|limps?)\b/i.test(lower)) {
    facingAction = 'open_raise';
  } else if (position === 'UTG') {
    facingAction = 'unopened';
  }

  // Ensure legal LiveSpot combinations
  if (!hasBoard) {
    if (position === 'UTG' && facingAction === 'open_raise') {
      facingAction = 'unopened';
    }
    if (position === 'BB' && (facingAction === 'unopened' || facingAction === 'three_bet')) {
      facingAction = 'open_raise';
    }
  }

  // Hero action: inspect postflop action if a board exists, otherwise preflop hero action.
  const postBoardText = hasBoard
    ? (text.split(/\b(?:board|flop|turn|river)\b/i).slice(1).join(' ') || text)
    : text;

  let heroAction = 'call';
  if (/\b(?:i\s+fold|hero\s+folds?|folded|fold)\b/i.test(postBoardText)) {
    heroAction = 'fold';
  } else if (/\b(?:c\s*-?\s*bet|cbet|bet|bets|raise|raises|3b(?:et)?|4b(?:et)?|x\/r|xr|check\s*-?\s*raise|jam|shove|all\s*-?\s*in|barrel)\b/i.test(postBoardText)) {
    heroAction = 'raise';
  } else if (/\b(?:call|calls|called|flat|flats|check\s*-?\s*call|x\/c|defend|defends)\b/i.test(postBoardText)) {
    heroAction = 'call';
  } else if (!hasBoard && (potType === '3-Bet' || potType === '4-Bet' || /\b(?:i\s+(?:open|raise|3b|4b|shove|jam))\b/i.test(lower))) {
    heroAction = 'raise';
  }

  return { facingAction, heroAction };
}

/**
 * Parse casual live poker room shorthand into structured fields for LiveSpotQuickEntry.
 *
 * @param {string} input
 * @returns {{
 *   heroCards: string[],
 *   position: string | null,
 *   stackBb: number | null,
 *   gameFormat: 'cash' | 'tournament',
 *   boardCards: string[],
 *   potType: 'SRP' | '3-Bet' | '4-Bet' | 'Limped',
 *   facingAction: 'unopened' | 'open_raise' | 'three_bet' | 'facing_bet',
 *   heroAction: 'fold' | 'call' | 'raise',
 *   parsedSummary: string,
 * }}
 */
export function parseLiveShorthand(input) {
  const empty = {
    heroCards: [],
    position: null,
    stackBb: null,
    gameFormat: 'cash',
    boardCards: [],
    potType: 'SRP',
    facingAction: 'open_raise',
    heroAction: 'call',
    parsedSummary: '',
  };

  if (typeof input !== 'string') return empty;
  const text = input.trim();
  if (!text) return empty;

  // Split around explicit board / street markers so hero cards and board cards never mix.
  const boardMarkerRe = /\b(?:board|flop)\b[:\s-]*/i;
  const markerMatch = boardMarkerRe.exec(text);

  let heroCards = [];
  let boardCards = [];

  if (markerMatch) {
    const beforeBoard = text.slice(0, markerMatch.index);
    const afterBoard = text.slice(markerMatch.index + markerMatch[0].length);
    const preCards = extractCardTokens(beforeBoard);
    const postCards = extractCardTokens(afterBoard);

    heroCards = preCards.slice(0, 2);
    const heroSet = new Set(heroCards);
    for (const c of postCards) {
      if (!heroSet.has(c) && boardCards.length < 5) {
        boardCards.push(c);
      }
    }
    // If hero cards weren't placed before board marker, see if remaining preCards or explicit "I have" exist
    if (heroCards.length === 0 && postCards.length >= 5) {
      boardCards = postCards.slice(0, 5);
    }
  } else {
    const allCards = extractCardTokens(text);
    heroCards = allCards.slice(0, 2);
    const heroSet = new Set(heroCards);
    if (allCards.length >= 5) {
      for (const c of allCards.slice(2)) {
        if (!heroSet.has(c) && boardCards.length < 5) {
          boardCards.push(c);
        }
      }
    }
  }

  // Only keep valid board counts (0, 3, 4, or 5)
  if (boardCards.length > 0 && boardCards.length < 3) {
    boardCards = [];
  } else if (boardCards.length > 5) {
    boardCards = boardCards.slice(0, 5);
  }

  const position = findHeroPosition(text);
  const stackBb = parseStackBb(text);
  const gameFormat = parseGameFormat(text);
  const potType = parsePotType(text);
  const { facingAction, heroAction } = parseFacingAndHeroAction(text, {
    hasBoard: boardCards.length >= 3,
    position: position && VALID_POSITIONS.has(position) ? position : null,
    potType,
  });

  const summaryParts = [];
  if (heroCards.length === 2) summaryParts.push(heroCards.join(' '));
  if (position) summaryParts.push(position);
  if (stackBb !== null) summaryParts.push(`${stackBb} BB`);
  summaryParts.push(gameFormat === 'tournament' ? 'Tournament' : 'Cash');
  if (potType) summaryParts.push(potType);
  if (boardCards.length >= 3) summaryParts.push(`Board ${boardCards.join(' ')}`);
  summaryParts.push(
    heroAction === 'fold' ? 'Fold' : heroAction === 'raise' ? 'Raise' : 'Call',
  );

  return {
    heroCards,
    position,
    stackBb,
    gameFormat,
    boardCards,
    potType,
    facingAction,
    heroAction,
    parsedSummary: summaryParts.join(' · '),
  };
}
