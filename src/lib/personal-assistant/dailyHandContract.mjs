const EXACT_HAND = /^([2-9TJQKA])([shdc])([2-9TJQKA])([shdc])$/i;
const RANGE_HAND = /^([2-9TJQKA])([2-9TJQKA])([so])?$/i;

/** Materialize canonical range notation into a stable, legal two-card combo. */
export function materializeCanonicalHeroHand(value) {
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
  if (first === second) return `${first}s${second}h`;
  return range[3]?.toLowerCase() === 's'
    ? `${first}s${second}s`
    : `${first}s${second}h`;
}

/**
 * The API's scenario and hero_hand fields are canonical. heroCards is a
 * compatibility field and may belong to an older cached question revision.
 */
export function resolveDailyHeroHand(raw, scenario = raw?.scenario || {}) {
  const canonicalCandidates = [
    scenario?.heroCards,
    scenario?.heroHand,
    raw?.hero_hand,
    raw?.heroHand,
  ];
  for (const candidate of canonicalCandidates) {
    const hand = materializeCanonicalHeroHand(candidate);
    if (hand) return hand;
  }
  return materializeCanonicalHeroHand(raw?.heroCards);
}
