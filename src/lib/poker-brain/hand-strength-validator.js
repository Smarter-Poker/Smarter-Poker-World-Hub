/**
 * Poker Brain - Hand Strength Label Validator
 * ============================================
 * PokerBros renders a hand strength label ("High Card", "One Pair",
 * "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House",
 * "Four of a Kind", "Straight Flush", "Royal Flush") below the hero
 * avatar whenever hole + board can form a made hand.
 *
 * We run our own evaluation on the detected cards and then OCR that label.
 * If our computed hand strength disagrees with what PokerBros shows, the
 * detection is almost certainly wrong - either we misread a card or the
 * layout regions are off. We surface that as a warning so the HUD can
 * flash a red border around the cards and refuse to output a decision
 * until the conflict clears.
 *
 * This is the single best sanity check available to us because it comes
 * from PokerBros itself, not from our own code.
 */

// Canonical rank strings matching PokerBros. Longest-first so "Full House"
// matches before "Full" inside any fuzzy matcher.
const PB_LABELS = [
  'Royal Flush',
  'Straight Flush',
  'Four of a Kind',
  'Full House',
  'Flush',
  'Straight',
  'Three of a Kind',
  'Two Pair',
  'One Pair',
  'High Card',
];

// Engine hand names (from engine.js evaluateHand) -> canonical rank
const ENGINE_TO_CANONICAL = {
  'Royal Flush':     'Royal Flush',
  'Straight Flush':  'Straight Flush',
  'Four of a Kind':  'Four of a Kind',
  'Full House':      'Full House',
  'Flush':           'Flush',
  'Straight':        'Straight',
  'Three of a Kind': 'Three of a Kind',
  'Two Pair':        'Two Pair',
  'One Pair':        'One Pair',
  'High Card':       'High Card',
};

/**
 * Normalize an OCR string to a canonical PokerBros label, or null.
 * Accepts minor OCR noise (trailing punctuation, case, extra whitespace).
 */
export function normalizeLabel(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const clean = rawText.trim().replace(/[^a-zA-Z ]/g, '').replace(/\s+/g, ' ');
  const lower = clean.toLowerCase();
  for (const label of PB_LABELS) {
    if (lower === label.toLowerCase()) return label;
  }
  // Fuzzy: if label appears inside the string (with mild allowance)
  for (const label of PB_LABELS) {
    const needle = label.toLowerCase();
    if (lower.indexOf(needle) !== -1) return label;
  }
  // Tighter partial match: "pair of aces" -> "One Pair" only if single pair
  if (lower.indexOf('pair') !== -1 && lower.indexOf('two') !== -1) return 'Two Pair';
  if (lower.indexOf('pair') !== -1) return 'One Pair';
  if (lower.indexOf('flush') !== -1 && lower.indexOf('straight') !== -1) return 'Straight Flush';
  if (lower.indexOf('flush') !== -1) return 'Flush';
  if (lower.indexOf('straight') !== -1) return 'Straight';
  if (lower.indexOf('trip') !== -1 || lower.indexOf('three') !== -1) return 'Three of a Kind';
  if (lower.indexOf('four') !== -1) return 'Four of a Kind';
  if (lower.indexOf('full') !== -1 || lower.indexOf('boat') !== -1) return 'Full House';
  return null;
}

/**
 * Numeric rank of a hand strength label. Higher = stronger.
 */
export function strengthRank(label) {
  const idx = PB_LABELS.indexOf(label);
  if (idx === -1) return -1;
  return PB_LABELS.length - 1 - idx; // Royal Flush = 9, High Card = 0
}

/**
 * Compare what our engine says vs what PokerBros shows.
 * Returns { match: true|false, ourRank, theirRank, severity }
 *   severity: 'ok' | 'warn' | 'critical'
 *     ok       - exact match
 *     warn     - off by one step (e.g., flop draw updates slightly late)
 *     critical - off by >1 step - strongly suggests a detection error
 */
export function compareHandStrength(ourEngineName, pokerBrosRawText) {
  const ours = ENGINE_TO_CANONICAL[ourEngineName] || null;
  const theirs = normalizeLabel(pokerBrosRawText);

  if (!ours || !theirs) {
    return {
      match: null,
      ours,
      theirs,
      severity: 'unknown',
      reason: !ours ? 'Engine produced no label' : 'OCR returned no recognizable label',
    };
  }

  if (ours === theirs) {
    return { match: true, ours, theirs, severity: 'ok', reason: 'Engine agrees with PokerBros' };
  }

  const oR = strengthRank(ours);
  const tR = strengthRank(theirs);
  const diff = Math.abs(oR - tR);

  if (diff === 1) {
    return {
      match: false,
      ours,
      theirs,
      severity: 'warn',
      reason: `Engine says ${ours}, PokerBros shows ${theirs} - possible transient mismatch`,
    };
  }
  return {
    match: false,
    ours,
    theirs,
    severity: 'critical',
    reason: `Engine says ${ours}, PokerBros shows ${theirs} - likely a card misdetection`,
  };
}

export const LABELS = PB_LABELS;

export default { normalizeLabel, compareHandStrength, strengthRank, LABELS };
