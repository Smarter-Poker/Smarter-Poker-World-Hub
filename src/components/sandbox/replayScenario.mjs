/** Restore an authored replay as a complete scenario, never a partial overlay. */
const CARD = /^(?:[2-9TJQKA])[cdhs]$/i;
const POSITIONS = new Set(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']);

function cardsFrom(value) {
  let cards;
  if (Array.isArray(value)) cards = value;
  else if (value && typeof value === 'object') {
    const flop = Array.isArray(value.flop) ? value.flop : [];
    if ((value.turn || value.river) && (flop.length !== 3 || flop.some(card => !card))) return null;
    if (value.river && !value.turn) return null;
    cards = value.card1 || value.card2
      ? [value.card1, value.card2]
      : [...flop, value.turn, value.river];
  } else if (typeof value === 'string') {
    if (!value.trim() || value.trim().toLowerCase() === 'preflop') return [];
    const compact = value.replace(/[\s,]+/g, '');
    if (compact.length % 2) return null;
    cards = compact.match(/.{2}/g) || [];
  } else return [];
  const present = cards.filter(Boolean);
  if (present.some(card => typeof card !== 'string' || !CARD.test(card))) return null;
  return present.map(card => `${card[0].toUpperCase()}${card[1].toLowerCase()}`);
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/**
 * New replay entries keep their exact scenario. Legacy log rows stored display
 * strings only, so restore the recorded final pot with an empty action line.
 * Mixing a legacy final pot with today's actions would charge those bets twice.
 */
export function replayScenarioFromEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const source = entry.scenario && typeof entry.scenario === 'object'
    ? entry.scenario
    : entry;
  const hero = cardsFrom(source.heroHand || source.hand);
  const board = cardsFrom(source.board);
  if (!hero || hero.length !== 2 || !board || ![0, 3, 4, 5].includes(board.length)) return null;
  if (new Set([...hero, ...board]).size !== hero.length + board.length) return null;

  const rawPosition = String(source.heroPosition || source.position || 'BTN').toUpperCase();
  const heroPosition = POSITIONS.has(rawPosition) ? rawPosition : 'BTN';
  const heroStack = positive(source.heroStack ?? source.effStack ?? source.stackDepth, 100);
  const hasBasePot = source.potBase != null && source.potBase !== ''
    && Number.isFinite(Number(source.potBase)) && Number(source.potBase) >= 0;
  const potBase = hasBasePot ? Number(source.potBase) : positive(source.potSize ?? source.pot, 6.5);
  if (Array.isArray(source.villains) && source.villains.some(villain => !villain || typeof villain !== 'object')) return null;
  const villains = Array.isArray(source.villains) && source.villains.length
    ? source.villains.slice(0, 5).map((villain, index) => ({
      ...villain,
      id: villain.id ?? index,
      archetype: villain.archetype ? { ...villain.archetype } : { id: 'gto_neutral', name: 'GTO Neutral' },
    }))
    : [{
      id: 0,
      position: heroPosition === 'BB' ? 'BTN' : 'BB',
      stack: heroStack,
      range: '',
      archetype: { id: 'gto_neutral', name: 'GTO Neutral' },
    }];

  return {
    gameType: source.gameType === 'tournament' ? 'tournament' : 'cash',
    heroPosition,
    heroStack,
    potBase,
    heroHand: { card1: hero[0], card2: hero[1] },
    board: { flop: board.slice(0, 3), turn: board[3] || null, river: board[4] || null },
    villains,
    actionHistory: hasBasePot && Array.isArray(source.actionHistory)
      ? source.actionHistory.map(action => ({ ...action }))
      : [],
    preflopPosts: hasBasePot && Array.isArray(source.preflopPosts)
      ? source.preflopPosts.map(post => ({ ...post }))
      : [],
    authority: 'authored-sandbox-ungraded',
  };
}
