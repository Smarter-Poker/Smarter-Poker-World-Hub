/**
 * reviewHandoff.mjs - Sanitized Review My Play -> Virtual Sandbox handoff parser.
 *
 * Enforces:
 *  - Matching sourceRowId verification when consuming sessionStorage handoff.
 *  - Strict removal of opponent hidden hole cards (privacy boundary).
 *  - Strict `authored-sandbox-ungraded` authority preservation.
 */

export const SANDBOX_HANDOFF_STORAGE_KEY = 'pa-sandbox-handoff-v1';

const VALID_POSITIONS = new Set(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']);
const POSITION_ALIASES = {
  UTG: 'UTG', 'UTG+1': 'UTG', 'UTG+2': 'MP',
  MP: 'MP', MP1: 'MP', MP2: 'MP', LJ: 'MP', HJ: 'MP', HIJACK: 'MP', LOJACK: 'MP',
  CO: 'CO', CUTOFF: 'CO',
  BTN: 'BTN', BU: 'BTN', BUTTON: 'BTN', DEALER: 'BTN',
  SB: 'SB', 'SMALL BLIND': 'SB',
  BB: 'BB', 'BIG BLIND': 'BB',
};

function normalizeCard(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim().replace(/^10/, 'T');
  if (clean.length !== 2) return null;
  const r = clean[0].toUpperCase();
  const s = clean[1].toLowerCase();
  if (!'AKQJT98765432'.includes(r) || !'shdc'.includes(s)) return null;
  return `${r}${s}`;
}

function extractCards(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map(normalizeCard).filter(Boolean);
  }
  if (typeof input === 'object') {
    if (input.card1 || input.card2) {
      return [normalizeCard(input.card1), normalizeCard(input.card2)].filter(Boolean);
    }
    if (Array.isArray(input.flop) || input.turn || input.river) {
      return [...(input.flop || []), input.turn, input.river].map(normalizeCard).filter(Boolean);
    }
    return [];
  }
  const matches = String(input).match(/(?:10|[AKQJT2-9])[shdc]/gi) || [];
  return matches.map(normalizeCard).filter(Boolean);
}

function normalizePos(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toUpperCase();
  if (VALID_POSITIONS.has(key)) return key;
  return POSITION_ALIASES[key] || null;
}

function normalizeGameType(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('tourn') || s === 'mtt' || s === 'sng') return 'tournament';
  return 'cash';
}

/**
 * Parse and sanitize a Review My Play handoff payload (from sessionStorage or
 * GET /api/poker/saved-hands?id=<id>) into a clean Virtual Sandbox scenario.
 *
 * Strips all opponent hidden cards and preserves ungraded authority.
 */
export function parseReviewHandoffPayload(raw, expectedRowId = null) {
  if (!raw || typeof raw !== 'object') return null;

  const sourceRowId = raw.sourceRowId || raw.savedRowId || raw.id || null;
  if (expectedRowId && sourceRowId && String(sourceRowId) !== String(expectedRowId)) {
    return null;
  }

  // Support both direct handoff shape and saved-hands API row shape (with nested hand_data / handData)
  const nested = raw.hand_data || raw.handData || raw.scenario_json || {};
  const playersList = Array.isArray(nested.players)
    ? nested.players
    : (Array.isArray(raw.players) ? raw.players : []);
  const heroPlayer = playersList.find((p) => p?.isHero === true) || null;

  const bigBlindRaw = Number(
    raw.big_blind ?? raw.bigBlind ?? nested.big_blind ?? nested.bigBlind,
  );
  const bigBlind = Number.isFinite(bigBlindRaw) && bigBlindRaw > 0 ? bigBlindRaw : null;

  const heroCards = extractCards(
    raw.heroCards
    || raw.heroHand
    || raw.hero_cards
    || raw.hero_hand
    || nested.heroCards
    || nested.heroHand
    || nested.hero_cards
    || nested.hero_hand
    || heroPlayer?.holeCards
    || heroPlayer?.cards,
  );
  const boardCards = extractCards(
    raw.board
    || raw.boardCards
    || raw.communityCards
    || raw.community_cards
    || nested.board
    || nested.communityCards
    || nested.community_cards,
  );

  // Deduplicate board cards against hero cards
  const heroTwo = heroCards.slice(0, 2);
  const heroSet = new Set(heroTwo);
  const cleanBoard = [];
  for (const c of boardCards) {
    if (!heroSet.has(c) && !cleanBoard.includes(c) && cleanBoard.length < 5) {
      cleanBoard.push(c);
    }
  }

  const heroPosition = normalizePos(
    raw.heroPosition || raw.hero_position || raw.position
    || nested.heroPosition || nested.hero_position || heroPlayer?.position,
  ) || 'BTN';

  const explicitPotBb = Number(
    raw.potBase ?? raw.pot ?? raw.potBb ?? raw.pot_bb ?? raw.potSize
    ?? nested.potBase ?? nested.pot ?? nested.potBb ?? nested.pot_bb ?? nested.potSize,
  );
  const rawPotTotal = Number(
    raw.pot_total ?? raw.potTotal ?? nested.pot_total ?? nested.potTotal,
  );
  const potCandidate = Number.isFinite(explicitPotBb) && explicitPotBb > 0
    ? explicitPotBb
    : (Number.isFinite(rawPotTotal) && rawPotTotal > 0 && bigBlind ? rawPotTotal / bigBlind : NaN);
  const potBase = Number.isFinite(potCandidate) && potCandidate > 0
    ? Math.max(1, Math.min(500, Math.round(potCandidate * 10) / 10))
    : 6.5;

  const explicitStackBb = Number(
    raw.effectiveStack ?? raw.effective_stack_bb ?? raw.heroStack ?? raw.hero_stack ?? raw.stackDepth ?? raw.stack
    ?? nested.effectiveStack ?? nested.heroStack ?? nested.stackDepth ?? nested.stack,
  );
  const rawHeroPlayerStack = Number(
    heroPlayer?.stack ?? heroPlayer?.startingStack ?? heroPlayer?.chips,
  );
  const stackCandidate = Number.isFinite(explicitStackBb) && explicitStackBb > 0
    ? explicitStackBb
    : (Number.isFinite(rawHeroPlayerStack) && rawHeroPlayerStack > 0 && bigBlind
      ? rawHeroPlayerStack / bigBlind
      : NaN);
  const heroStack = Number.isFinite(stackCandidate) && stackCandidate > 0
    ? Math.max(5, Math.min(1000, Math.round(stackCandidate)))
    : 100;

  const gameType = normalizeGameType(
    raw.gameFormat || raw.gameType || raw.format || raw.game_type
    || nested.gameFormat || nested.gameType || nested.format
    || (nested.tournamentId || raw.tournament_id ? 'tournament' : ''),
  );

  // Sanitized villains (position & stack BB only - zero opponent cards or PII)
  const opponentPlayers = playersList.filter((p) => p && p.isHero !== true).slice(0, 5);
  const sanitizedVillains = opponentPlayers.length > 0
    ? opponentPlayers.map((p, idx) => {
      const oppRawStack = Number(p?.stack ?? p?.startingStack ?? p?.chips);
      const oppStackBb = Number.isFinite(oppRawStack) && oppRawStack > 0 && bigBlind
        ? Math.max(5, Math.min(1000, Math.round(oppRawStack / bigBlind)))
        : heroStack;
      return {
        id: idx,
        position: normalizePos(p?.position) || (heroPosition === 'BB' ? 'BTN' : 'BB'),
        stack: oppStackBb,
        archetype: { id: 'gto_neutral', name: 'GTO Neutral' },
        range: '',
      };
    })
    : null;

  // Privacy: never forward opponent hidden cards, showdown reveals, or opponent PII.
  return {
    sourceRowId: sourceRowId ? String(sourceRowId) : (expectedRowId ? String(expectedRowId) : null),
    heroHand: heroTwo.length >= 2 ? { card1: heroTwo[0], card2: heroTwo[1] } : null,
    board: {
      flop: cleanBoard.slice(0, 3),
      turn: cleanBoard[3] || null,
      river: cleanBoard[4] || null,
    },
    heroPosition,
    potBase,
    heroStack,
    gameType,
    villains: sanitizedVillains,
    actionHistory: [],
    authority: 'authored-sandbox-ungraded',
    nonNlhHeroCardCount: heroCards.length > 2 ? heroCards.length : null,
  };
}

/**
 * Consume matching handoff payload from sessionStorage and immediately clear it.
 */
export function consumeReviewHandoffFromStorage(expectedRowId, storage = (typeof sessionStorage !== 'undefined' ? sessionStorage : null)) {
  if (!storage || !expectedRowId) return null;
  try {
    const rawText = storage.getItem(SANDBOX_HANDOFF_STORAGE_KEY);
    if (!rawText) return null;
    const parsed = JSON.parse(rawText);
    const handoff = parseReviewHandoffPayload(parsed, expectedRowId);
    if (handoff) {
      storage.removeItem(SANDBOX_HANDOFF_STORAGE_KEY);
      return handoff;
    }
    return null;
  } catch (_e) {
    try { storage.removeItem(SANDBOX_HANDOFF_STORAGE_KEY); } catch (_ignore) { /* noop */ }
    return null;
  }
}
