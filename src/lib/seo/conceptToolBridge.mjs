/**
 * Deterministic Concept-To-Tool Conversion Bridge Mapper.
 *
 * Maps any /glossary/[term] or /rules/[slug] poker concept to the exact
 * interactive Smarter.Poker tool that lets the reader apply the concept
 * immediately, paired with a contextual 107-GTO-Games signup unlock payload.
 *
 * House style: Title Case copy, zero em/en dashes, zero banned gold, zero
 * unsubstantiated venue wording. Pure ES module with zero runtime deps.
 */

const PRACTICE_CTA_LABEL = 'Practice Free In 107 GTO Games';

const BRIDGE_FAMILIES = Object.freeze([
  {
    key: 'plo-outs',
    pattern: /\b(?:plo|plo4|plo5|plo6|omaha|wrap|pot[-\s]?limit)\b/i,
    toolHref: '/tools/plo-outs-calculator',
    toolLabel: 'PLO Straight Wrap & Outs Calculator',
    headline: 'Count PLO Wrap Outs & Nut Equity Instantly',
    subcopy:
      'Verify 13-Out To 20-Out Omaha Wraps, Nut Flush Draws, And Multiway Equity Without Guesswork.',
  },
  {
    key: 'pot-odds',
    pattern: /\b(?:pot[-\s]?odds|implied[-\s]?odds|reverse[-\s]?implied|outs|equity)\b/i,
    toolHref: '/tools/pot-odds-calculator',
    toolLabel: 'Pot Odds & Implied Odds Calculator',
    headline: 'Calculate Exact Pot Odds & Break-Even Equity',
    subcopy:
      'Turn Pot Odds Math Into Profitable Calls With Live Outs Calculations And 107 Free GTO Training Games.',
  },
  {
    key: 'icm',
    pattern: /\b(?:icm|bubble|final[-\s]?table|push[-\s]?fold|push|fold|shov(?:e|ing)|satellite|bounty|pko|knockout|m[-\s]?ratio)\b/i,
    toolHref: '/tools/icm-calculator',
    toolLabel: 'Interactive ICM Payout Calculator',
    headline: 'Solve Bubble Pressure & Final Table ICM Equity',
    subcopy:
      'Simulate Real Tournament Payout Jumps, Bubble Factors, And Shove Ranges Before Your Next Deep Run.',
  },
  {
    key: 'showdown',
    pattern: /\b(?:hand[-\s]?rankings?|kicker|split|showdown|tie|ties|flush|straight|full[-\s]?house)\b/i,
    toolHref: '/tools/who-wins-calculator',
    toolLabel: 'Showdown & Kicker Resolver',
    headline: 'Resolve Split Pots, Kickers & Showdown Hands',
    subcopy:
      'Settle Showdown Hand Rankings, Kicker Tie-Breakers, And Split Pot Disputes In Seconds At The Table.',
  },
  {
    key: 'live-table-priority',
    pattern: /\b(?:straddles?|string[-\s]?bets?|missed[-\s]?blinds?|big[-\s]?blind[-\s]?ante)\b/i,
    toolHref: '/tools/poker-odds-calculator',
    toolLabel: 'Live Poker Odds Calculator',
    headline: 'Run Live Table Equity & All-In Odds Instantly',
    subcopy:
      'Check Exact All-In Runout Probabilities And Multiway Equities Directly From Your Live Table Session.',
    unlockSuffix: 'live-rules',
  },
  {
    key: 'preflop',
    pattern: /\b(?:preflop|pre[-\s]?flop|3[-\s]?bet|4[-\s]?bet|range|rfi|button|hijack|cutoff|squeeze|open)\b/i,
    toolHref: '/tools/preflop-ranges',
    toolLabel: '13x13 GTO Preflop Range Matrix',
    headline: 'Drill 13x13 Preflop Ranges By Position & Stack',
    subcopy:
      'Inspect Full 169-Hand Opening, 3-Bet, And Defense Charts Across 15BB To 100BB Stack Depths Free.',
  },
  {
    key: 'board-texture',
    pattern: /\b(?:c[-\s]?bet|continuation[-\s]?bet|texture|board|wet|dry|check[-\s]?rais(?:e|ing)|barrel|float|bluff|mdf)\b/i,
    toolHref: '/tools/board-texture-analyzer',
    toolLabel: 'Flop Board Texture Analyzer',
    headline: 'Analyze Wet & Dry Flop Textures & C-Bet Frequencies',
    subcopy:
      'Compare Range Advantage, Nut Advantage, And Optimal Continuation Betting Across Every Flop Texture.',
  },
  {
    key: 'bankroll',
    pattern: /\b(?:bankroll|variance|win[-\s]?rate|bb\/100|bb[-\s]?100|downswing|rake(?:back)?|buy[-\s]?ins?|stakes?)\b/i,
    toolHref: '/hub/bankroll-manager',
    toolLabel: 'Free Cloud Bankroll Manager',
    headline: 'Track Bankroll Variance, Winrate & Live Sessions',
    subcopy:
      'Log Cash And Tournament Sessions, Monitor Downswings, And Protect Your Bankroll In A Free Cloud Account.',
  },
  {
    key: 'live-rules',
    pattern: /\b(?:live[-\s]?rules?|tda|floor|string[-\s]?bets?|blinds?|straddles?|home[-\s]?games?|chips?|live[-\s]?room|waitlist|must[-\s]?move|table[-\s]?balancing|misdeals?|dead[-\s]?hands?|verbal[-\s]?declarations?|shot[-\s]?clock|time[-\s]?bank|run[-\s]?it[-\s]?twice|disputed[-\s]?pots?)\b/i,
    toolHref: '/tools/poker-odds-calculator',
    toolLabel: 'Live Poker Odds Calculator',
    headline: 'Run Live Table Equity & All-In Odds Instantly',
    subcopy:
      'Check Exact All-In Runout Probabilities And Multiway Equities Directly From Your Live Table Session.',
  },
]);

const FALLBACK_BRIDGE = Object.freeze({
  key: 'gto-leak-finder',
  toolHref: '/tools/gto-leak-finder',
  toolLabel: '60-Second GTO Poker Leak Finder',
  headline: 'Diagnose Your Biggest GTO Leaks In 60 Seconds',
  subcopy:
    'Spot Preflop, Postflop, And River EV Leaks In Under A Minute, Then Train Every Weakness Across 107 GTO Games.',
});

export const CONCEPT_TOOL_BRIDGE_TARGETS = Object.freeze([
  '/tools/pot-odds-calculator',
  '/tools/icm-calculator',
  '/tools/preflop-ranges',
  '/tools/plo-outs-calculator',
  '/tools/board-texture-analyzer',
  '/hub/bankroll-manager',
  '/tools/who-wins-calculator',
  '/tools/poker-odds-calculator',
  '/tools/gto-leak-finder',
]);

function normalizeInput(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function matchFamily(text) {
  if (!text) return null;
  for (const family of BRIDGE_FAMILIES) {
    if (family.pattern.test(text)) {
      return family;
    }
  }
  return null;
}

/**
 * Resolve the highest-intent interactive Smarter.Poker tool for a poker
 * glossary term or floor ruling page.
 */
export function resolveConceptToolBridge({
  kind = 'glossary',
  slug = '',
  title = '',
  category = '',
} = {}) {
  const normalizedKind = normalizeInput(kind) === 'rules' ? 'rules' : 'glossary';
  const primaryText = `${normalizeInput(slug)} ${normalizeInput(title)}`.trim();
  const categoryText = normalizeInput(category);

  const matched =
    matchFamily(primaryText) ||
    matchFamily(categoryText) ||
    FALLBACK_BRIDGE;

  const unlockSegment = matched.unlockSuffix || matched.key;
  const eyebrow =
    normalizedKind === 'rules'
      ? 'Interactive Floor Rule To Tool Bridge'
      : 'Interactive Concept To Tool Bridge';

  return {
    toolHref: matched.toolHref,
    toolLabel: matched.toolLabel,
    eyebrow,
    headline: matched.headline,
    subcopy: matched.subcopy,
    unlockKey: `${normalizedKind}-bridge-${unlockSegment}`,
    practiceLabel: PRACTICE_CTA_LABEL,
  };
}
