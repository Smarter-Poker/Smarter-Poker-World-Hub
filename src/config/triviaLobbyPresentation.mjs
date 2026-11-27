import { TRIVIA_MODE_BY_ID } from './triviaModeRegistry.mjs';

/** The approved gallery is a presentation of the registry, not a route registry. */
export const TRIVIA_LOBBY_MODE_IDS = Object.freeze([
  'pvp',
  'tournaments',
  'gto',
  'mtt',
  'cash',
  'icm',
  'history',
  'pro',
  'rules',
  'survival',
  'endless',
  'time-attack',
]);

const CAPTIONS = Object.freeze({
  pvp: 'Head-To-Head Trivia',
  tournaments: 'Nightly Trivia Competition',
  gto: 'Solver-Based Decisions',
  mtt: 'Tournament Decisions',
  cash: 'Deep Stack Decisions',
  icm: 'Chips Vs. Payout Equity',
  history: 'Legends & Iconic Hands',
  pro: 'Advanced Poker IQ',
  rules: 'Know Every Rule',
  survival: 'Climb 10 Levels',
  endless: 'Keep Your Run Alive',
  'time-attack': 'Beat The Clock',
});

export const TRIVIA_LOBBY_CARDS = Object.freeze(TRIVIA_LOBBY_MODE_IDS.map((id) => {
  const mode = TRIVIA_MODE_BY_ID[id];
  return Object.freeze({
    ...mode,
    displayName: id === 'tournaments' ? 'Daily Tournament' : mode.name,
    caption: CAPTIONS[id],
    image: `/images/trivia/approved-chrome/${id}.webp`,
    imageSmall: `/images/trivia/approved-chrome/${id}-576.webp`,
    imageWidth: id === 'history' ? 768 : 960,
    imageHeight: id === 'history' ? 512 : 640,
    fallbackImage: mode.image,
  });
}));

// Retain category deep links from the previous lobby without adding extra cards.
const CATEGORY_IDS = Object.freeze({
  featured: Object.freeze(['history', 'rules', 'pro']),
  free: Object.freeze(['history', 'rules', 'pro']),
  knowledge: Object.freeze(['history', 'rules', 'pro']),
  strategy: Object.freeze(['gto', 'mtt', 'cash', 'icm']),
  timed: Object.freeze(['time-attack', 'endless', 'survival']),
  survival: Object.freeze(['time-attack', 'endless', 'survival']),
  challenge: Object.freeze(['time-attack', 'endless', 'survival']),
  competitive: Object.freeze(['pvp', 'tournaments']),
});

export function filterTriviaLobbyCards(query = '', category = 'all') {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const modeIds = CATEGORY_IDS[String(category || 'all').trim().toLowerCase()];
  return TRIVIA_LOBBY_CARDS.filter((mode) => {
    if (modeIds && !modeIds.includes(mode.id)) return false;
    const searchable = [mode.id, mode.name, mode.displayName, mode.caption, mode.description, mode.category]
      .join(' ').toLowerCase();
    return words.every((word) => searchable.includes(word));
  });
}
