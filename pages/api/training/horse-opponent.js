/**
 * RETIRED: this public route disguised a random heuristic bot as a real
 * ranked player, accepted caller-authored personality/game state, and returned
 * fabricated decisions when its database lookup failed. Training opponents
 * must use the Club Arena's authenticated, explicitly identified game engine.
 */
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({
    success: false,
    code: 'LEGACY_HORSE_OPPONENT_RETIRED',
    error: 'Legacy simulated matchmaking is unavailable. Open Club Arena for verified gameplay.',
  });
}
