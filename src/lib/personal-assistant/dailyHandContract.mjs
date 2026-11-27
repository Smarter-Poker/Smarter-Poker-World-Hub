const EXACT_HAND = /^([2-9TJQKA])([shdc])([2-9TJQKA])([shdc])$/i;
const RANGE_HAND = /^([2-9TJQKA])([2-9TJQKA])([so])?$/i;

const SUITS = ['s', 'h', 'd', 'c'];

function parseBoardSet(boardCards) {
  const blocked = new Set();
  if (!Array.isArray(boardCards)) return blocked;
  for (const card of boardCards) {
    const raw = String(card || '').trim();
    const m = /^([2-9TJQKA])([shdc])$/i.exec(raw);
    if (m) blocked.add(`${m[1].toUpperCase()}${m[2].toLowerCase()}`);
  }
  return blocked;
}

/** Materialize canonical range notation into a stable, legal two-card combo. */
export function materializeCanonicalHeroHand(value, boardCards = []) {
  const source = Array.isArray(value) ? value.slice(0, 2).join('') : String(value || '');
  const hand = source.replace(/[\s,]/g, '');
  const exact = hand.match(EXACT_HAND);
  if (exact) {
    const normalized = `${exact[1].toUpperCase()}${exact[2].toLowerCase()}${exact[3].toUpperCase()}${exact[4].toLowerCase()}`;
    return normalized.slice(0, 2) === normalized.slice(2, 4) ? null : normalized;
  }

  const range = hand.match(RANGE_HAND);
  if (!range) return null;
  const first = range[1].toUpperCase();
  const second = range[2].toUpperCase();
  const suffix = range[3]?.toLowerCase() || '';
  if (first === second && suffix) return null;
  const blocked = parseBoardSet(boardCards);

  if (first === second) {
    const available = SUITS.filter(s => !blocked.has(`${first}${s}`));
    if (available.length < 2) return null;
    return `${first}${available[0]}${second}${available[1]}`;
  }
  if (suffix === 's') {
    const suit = SUITS.find(s => !blocked.has(`${first}${s}`) && !blocked.has(`${second}${s}`));
    return suit ? `${first}${suit}${second}${suit}` : null;
  }
  for (const s1 of SUITS) {
    if (blocked.has(`${first}${s1}`)) continue;
    for (const s2 of SUITS) {
      if (s1 === s2 || blocked.has(`${second}${s2}`)) continue;
      return `${first}${s1}${second}${s2}`;
    }
  }
  return null;
}

/**
 * The API's scenario and hero_hand fields are canonical. heroCards is a
 * compatibility field and may belong to an older cached question revision.
 */
export function resolveDailyHeroHand(raw, scenario = raw?.scenario || {}) {
  const boardCards = Array.isArray(scenario?.boardCards)
    ? scenario.boardCards
    : (Array.isArray(raw?.board) ? raw.board : []);
  const canonicalCandidates = [
    scenario?.heroCards,
    scenario?.heroHand,
    raw?.hero_hand,
    raw?.heroHand,
  ];
  for (const candidate of canonicalCandidates) {
    const hand = materializeCanonicalHeroHand(candidate, boardCards);
    if (hand) return hand;
  }
  return materializeCanonicalHeroHand(raw?.heroCards, boardCards);
}

/**
 * Normalize a /api/training/hand-of-the-day payload for Personal Assistant Home.
 * Supports both card-based daily hands and cardless conceptual/psychology daily
 * challenges (e.g. PSYCHOLOGY_BANK / scenario.isPsychology) while failing closed
 * on malformed payloads that lack both a legal hero hand and a valid question.
 */
export function normalizeDailyHandPayload(payload) {
  const raw = payload?.hand || payload?.question;
  if (!raw || typeof raw !== 'object') return null;
  const scenario = raw.scenario && typeof raw.scenario === 'object' ? raw.scenario : {};
  const board = raw.board || raw.board_cards || raw.boardCards || scenario.board || null;
  const heroHand = resolveDailyHeroHand(raw, scenario);

  const rawTitle = String(raw.title || raw.scenario_text || raw.question || scenario.context || '').trim();
  const rawDescription = typeof scenario.description === 'string' ? scenario.description.trim() : '';
  const hasChoices = Array.isArray(raw.options) && raw.options.length >= 2;
  const isPsychologySource =
    scenario.isPsychology === true ||
    String(raw.source || '').toUpperCase() === 'PSYCHOLOGY_BANK';
  const isConceptual = !heroHand && isPsychologySource && rawTitle.length > 0 && hasChoices;

  if (!heroHand && !isConceptual) return null;

  return {
    ...raw,
    id: raw.id || payload?.dailyId || null,
    heroHand: heroHand || null,
    isConceptual,
    categoryLabel: isConceptual ? 'Mental Game' : (raw.position || raw.hero_position || scenario.heroPosition || 'Daily Spot'),
    position: isConceptual ? null : (raw.position || raw.hero_position || scenario.heroPosition || null),
    board: isConceptual ? null : board,
    pot: isConceptual ? null : (raw.pot ?? raw.pot_size ?? scenario.potSize ?? scenario.pot ?? null),
    title: rawTitle || 'What Is The Best Line?',
    description: rawDescription || null,
  };
}
