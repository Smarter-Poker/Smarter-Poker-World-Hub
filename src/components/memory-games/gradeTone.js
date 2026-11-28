/**
 * Grade letter colours for Preflop Charts (S ice, A green, B blue, C silver,
 * D red). Grade letters carry the meaning; colour is only a second cue (no
 * gold).
 *
 * Its own module so the menu can colour its grade chip without importing the
 * whole PreflopGameKit (and the game screens' framer-motion with it) into the
 * first page load. The kit re-exports both names for the game screens.
 */
export const GRADE_TONES = {
  S: '#86daff',
  A: '#39e9a5',
  B: '#5aa9ff',
  C: '#bdd0e2',
  D: '#ff5c74',
};

export function gradeTone(grade) {
  return GRADE_TONES[grade] || '#f2f7ff';
}
