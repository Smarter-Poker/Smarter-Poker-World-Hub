/**
 * One sizing rule for the certified next-street continuation branch.
 *
 * The canonical side (DeterministicGTOEngine.selectExactContinuationBetSourceAction)
 * decides which raw Pio token owns the continuation from the exact tree
 * geometry, and the public side
 * (trainingAttestationContinuationContract.selectPublicAttestationContinuationAnswer)
 * must recognise that same action from the pre-answer public payload. Both
 * sides therefore share this constant and this predicate. The canonical tree
 * never produces an exact 75% bet: `int(round(550 * 0.75))` is 412 chips, or
 * 74.909% of the 550-chip root pot, and the turn's cumulative b1442 target adds
 * 1030 chips into 1374, or 74.964%. A rule that required exactly 0.75 could
 * only ever match a fixture.
 */
export const TRAINING_CONTINUATION_TARGET_POT_FRACTION = 0.75;
export const TRAINING_CONTINUATION_POT_FRACTION_TOLERANCE = 0.03;

// Absorbs binary representation error at the band edges (0.72 and 0.78) so
// an integer chip amount that lands exactly on an edge is classified the same
// way whether it arrives as chips/pot or as a two-decimal public percentage.
const EDGE_EPSILON = 1e-9;

export function isTrainingContinuationTargetPotFraction(potFraction) {
  const fraction = Number(potFraction);
  return Number.isFinite(fraction)
    && Math.abs(fraction - TRAINING_CONTINUATION_TARGET_POT_FRACTION)
      <= TRAINING_CONTINUATION_POT_FRACTION_TOLERANCE + EDGE_EPSILON;
}

/**
 * Return the one candidate whose pot fraction sits inside the tolerance band.
 * Two sizes inside the band are not interchangeable branches of the tree, so
 * an ambiguous set fails closed with null rather than picking the nearest.
 */
export function selectUniqueTrainingContinuationCandidate(candidates, potFractionOf) {
  if (!Array.isArray(candidates) || typeof potFractionOf !== 'function') return null;
  const matching = candidates.filter((candidate) => (
    isTrainingContinuationTargetPotFraction(potFractionOf(candidate))
  ));
  return matching.length === 1 ? matching[0] : null;
}
