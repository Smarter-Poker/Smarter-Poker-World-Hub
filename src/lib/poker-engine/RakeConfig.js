/**
 * CLUB ARENA — Rake & BBJ Configuration
 * ═══════════════════════════════════════════════════════════
 * 
 * OFFICIAL RAKE SCHEDULE (all cash games):
 *   - All stakes: 10% rake
 *   - Caps are FIXED DOLLAR AMOUNTS per stakes level (not BB-based)
 *   - BBJ fee is in BB units per qualifying hand
 *   - BBJ pool allocation: Main 40% / BackUp 30% / Promotional 30%
 * 
 * BBJ RULES:
 *   - Pot must be >= 10 BB
 *   - 4+ players must be dealt in preflop
 *   - Not available for Double/Triple Board games
 *   - If run it multiple times, only first runout counts
 *   - If multiple losers qualify, prize split proportionally
 * 
 * QUALIFYING HANDS (minimum losing hand):
 *   NLH/FLH: AAAJJ (full house, Aces full of Jacks)
 *   PLO4/FLO4: KKKK2 (four Kings)
 *   PLO5/FLO5: 87654 (eight-high straight flush)
 */

// ═══════════════════════════════════════════════════════════
// OFFICIAL RAKE SCHEDULE — Per-stakes lookup table
// rakeCap is an ABSOLUTE DOLLAR AMOUNT (not BB-based).
// ═══════════════════════════════════════════════════════════
const RAKE_SCHEDULE = [
  { sb: 0.10, bb: 0.20, rakePercent: 10, rakeCap: 3,    bbjFeeBB: 0.6  },
  { sb: 0.20, bb: 0.40, rakePercent: 10, rakeCap: 3,    bbjFeeBB: 0.6  },
  { sb: 0.25, bb: 0.50, rakePercent: 10, rakeCap: 3,    bbjFeeBB: 0.6  },
  { sb: 0.30, bb: 0.60, rakePercent: 10, rakeCap: 5,    bbjFeeBB: 0.6  },
  { sb: 0.50, bb: 1.00, rakePercent: 10, rakeCap: 5,    bbjFeeBB: 0.25 },
  { sb: 1,    bb: 2,    rakePercent: 10, rakeCap: 5,    bbjFeeBB: 0.25 },
  { sb: 2,    bb: 4,    rakePercent: 10, rakeCap: 7.5,  bbjFeeBB: 0.12 },
  { sb: 2,    bb: 5,    rakePercent: 10, rakeCap: 7.5,  bbjFeeBB: 0.12 },
  { sb: 5,    bb: 5,    rakePercent: 10, rakeCap: 7.5,  bbjFeeBB: 0.12 },
  { sb: 3,    bb: 6,    rakePercent: 10, rakeCap: 8,    bbjFeeBB: 0.12 },
  { sb: 4,    bb: 8,    rakePercent: 10, rakeCap: 10,   bbjFeeBB: 0.12 },
  { sb: 5,    bb: 10,   rakePercent: 10, rakeCap: 12.5, bbjFeeBB: 0.06 },
  { sb: 10,   bb: 20,   rakePercent: 10, rakeCap: 15,   bbjFeeBB: 0.06 },
  { sb: 10,   bb: 25,   rakePercent: 10, rakeCap: 15,   bbjFeeBB: 0.06 },
];

// BBJ Pool Allocation — uniform across all stakes
const BBJ_POOL_ALLOCATION = {
  mainBBJ: 0.40,        // 40% of BBJ rake goes to Main BBJ pool
  backUpBBJ: 0.30,      // 30% goes to Back Up BBJ pool
  promotional: 0.30,     // 30% goes to Promotional fund
};

// ═══════════════════════════════════════════════════════════
// STAKES TIERS — Fallback for custom/non-standard stakes
// Only used when no exact match found in RAKE_SCHEDULE.
// All tiers use 10% rake per the official schedule.
// rakeCap is always an absolute dollar amount.
// rakeCapBB is kept as a legacy alias for callers that still
// reference it — but the value IS dollars, not BB units.
// ═══════════════════════════════════════════════════════════
const STAKES_TIERS = {
  nano: {
    label: 'Nano',
    blindRange: '0.05/0.10 - 0.25/0.50',
    minBB: 0.1,
    maxBB: 0.5,
    rakePercent: 10,
    rakeCap: 3,
    rakeCapBB: 3,
    bbjFeeBB: 0.6,
  },
  micro: {
    label: 'Micro',
    blindRange: '0.30/0.60 - 0.50/1.00',
    minBB: 0.6,
    maxBB: 1,
    rakePercent: 10,
    rakeCap: 5,
    rakeCapBB: 5,
    bbjFeeBB: 0.25,
  },
  small: {
    label: 'Small',
    blindRange: '1/2',
    minBB: 1.5,
    maxBB: 3,
    rakePercent: 10,
    rakeCap: 5,
    rakeCapBB: 5,
    bbjFeeBB: 0.25,
  },
  mid: {
    label: 'Mid',
    blindRange: '2/4 - 4/8',
    minBB: 3.5,
    maxBB: 8,
    rakePercent: 10,
    rakeCap: 8,
    rakeCapBB: 8,
    bbjFeeBB: 0.12,
  },
  high: {
    label: 'High',
    blindRange: '5/10 - 10/25',
    minBB: 9,
    maxBB: 25,
    rakePercent: 10,
    rakeCap: 15,
    rakeCapBB: 15,
    bbjFeeBB: 0.06,
  },
  nosebleeds: {
    label: 'Nosebleeds',
    blindRange: '25/50+',
    minBB: 26,
    maxBB: Infinity,
    rakePercent: 10,
    rakeCap: 20,
    rakeCapBB: 20,
    bbjFeeBB: 0.03,
  },
};

// ═══════════════════════════════════════════════════════════
// BBJ QUALIFYING HANDS — Minimum losing hand per game variant
// ═══════════════════════════════════════════════════════════
const BBJ_QUALIFYING_HANDS = {
  nlh: {
    label: 'NLH / FLH',
    minLosingHand: 'AAAJJ',
    description: 'Full House (Aces full of Jacks) or better must LOSE to Quads or Straight Flush',
    rules: [
      'AAAJJ+ must lose to Quads or Straight Flush',
      'Player holding Full House must have at least one Ace in their hole cards (dealt cards)',
      'Both cards from hand must play',
    ],
    handRank: 'full_house',
    minRankValue: 'AAAJJ',
  },
  plo4: {
    label: 'PLO4 / FLO4',
    minLosingHand: 'KKKK2',
    description: 'Four of a Kind (Kings) or better must LOSE',
    rules: [
      'Must use exactly 2 cards from hand',
      'Both players must use two cards from their hole cards',
    ],
    handRank: 'four_of_a_kind',
    minRankValue: 'KKKK',
  },
  plo5: {
    label: 'PLO5 / FLO5',
    minLosingHand: '87654',
    description: 'Straight Flush (8-high) or better must LOSE',
    rules: [
      'Must use exactly 2 cards from hand',
      'Both players must use two cards from their hole cards',
    ],
    handRank: 'straight_flush',
    minRankValue: '87654',
  },
  plo6: {
    label: 'PLO6',
    minLosingHand: '87654',
    description: 'Straight Flush (8-high) or better must LOSE',
    rules: ['Must use exactly 2 cards from hand'],
    handRank: 'straight_flush',
    minRankValue: '87654',
  },
  short_deck: {
    label: 'Short Deck',
    minLosingHand: null,
    description: 'BBJ not available for Short Deck',
    rules: [],
    eligible: false,
  },
  ofc: {
    label: 'Open Face Chinese',
    minLosingHand: null,
    description: 'BBJ not available for OFC',
    rules: [],
    eligible: false,
  },
};

// ═══════════════════════════════════════════════════════════
// BBJ GENERAL RULES
// ═══════════════════════════════════════════════════════════
const BBJ_RULES = {
  minPotBB: 10,
  minPlayersDealt: 4,
  excludeDoubleBoard: true,
  onlyFirstRunout: true,
  splitIfMultipleQualify: true,
  requireBothHoleCards: true,
};

// ═══════════════════════════════════════════════════════════
// LOOKUP: Find exact match in RAKE_SCHEDULE by SB/BB
// Falls back to tier-based config for non-standard stakes
// ═══════════════════════════════════════════════════════════
function findScheduleMatch(smallBlind, bigBlind) {
  const sb = parseFloat(smallBlind) || 0;
  const bb = parseFloat(bigBlind) || 0;
  // Exact match first (floating point tolerance)
  const match = RAKE_SCHEDULE.find(row =>
    Math.abs(row.sb - sb) < 0.001 && Math.abs(row.bb - bb) < 0.001
  );
  return match || null;
}

// ═══════════════════════════════════════════════════════════
// HELPER: Get tier config for a given big blind size (fallback)
// ═══════════════════════════════════════════════════════════
function getTierForBB(bigBlind) {
  const bb = parseFloat(bigBlind) || 0;
  if (bb <= 0.5)  return STAKES_TIERS.nano;
  if (bb <= 1)    return STAKES_TIERS.micro;
  if (bb <= 3)    return STAKES_TIERS.small;
  if (bb <= 8)    return STAKES_TIERS.mid;
  if (bb <= 25)   return STAKES_TIERS.high;
  return STAKES_TIERS.nosebleeds;
}

// ═══════════════════════════════════════════════════════════
// MAIN: Get full rake + BBJ config for table creation
// Tries exact schedule match first, then falls back to tier.
// IMPORTANT: rakeCap is always an absolute dollar amount.
// ═══════════════════════════════════════════════════════════
function getRakeConfig(bigBlind, variant = 'nlh', smallBlind = null) {
  // Try exact schedule match
  const sb = smallBlind != null ? parseFloat(smallBlind) : parseFloat(bigBlind) / 2;
  const bb = parseFloat(bigBlind) || 0;
  const scheduleMatch = findScheduleMatch(sb, bb);

  // Fall back to tier
  const tier = getTierForBB(bb);
  const qualifying = BBJ_QUALIFYING_HANDS[variant] || BBJ_QUALIFYING_HANDS.nlh;
  const bbjEligible = qualifying.eligible !== false;

  const rakePercent = scheduleMatch ? scheduleMatch.rakePercent : tier.rakePercent;
  const rakeCap = scheduleMatch ? scheduleMatch.rakeCap : tier.rakeCap;
  const bbjFeeBB = scheduleMatch ? scheduleMatch.bbjFeeBB : tier.bbjFeeBB;

  return {
    tier: tier.label,
    blindRange: tier.blindRange,
    // Rake — rakeCap is an absolute dollar amount
    rakePercent,
    rakeCap,
    rakeCapBB: rakeCap,        // Legacy alias (value is dollars, not BB)
    rakeCapDollars: rakeCap,   // Explicit alias
    // BBJ (only if game variant is eligible)
    bbjEnabled: bbjEligible,
    bbjFeeBB: bbjEligible ? bbjFeeBB : 0,
    // BBJ pool allocation
    bbjPoolAllocation: BBJ_POOL_ALLOCATION,
    // Legacy payout fields — kept for backward compat but
    // the pool allocation model is now Main/BackUp/Promotional
    bbjPayoutTotal: 100,
    bbjPayoutLoser: 0,
    bbjPayoutWinner: 0,
    bbjPayoutTable: 0,
    // Qualifying hand info
    qualifyingHand: qualifying,
    // Rules
    rules: BBJ_RULES,
    // Whether this was an exact schedule match
    _exactMatch: !!scheduleMatch,
  };
}

// ═══════════════════════════════════════════════════════════
// HELPER: Calculate BBJ fee for a specific hand
// Returns the BBJ amount to deduct (in chips/dollars)
// ═══════════════════════════════════════════════════════════
function calculateBBJFee(bigBlind, potSize, numPlayersDealt, variant = 'nlh', smallBlind = null) {
  const config = getRakeConfig(bigBlind, variant, smallBlind);

  if (!config.bbjEnabled) return 0;
  if (numPlayersDealt < BBJ_RULES.minPlayersDealt) return 0;
  if (potSize < bigBlind * BBJ_RULES.minPotBB) return 0;

  return Math.round(bigBlind * config.bbjFeeBB * 100) / 100;
}

// ═══════════════════════════════════════════════════════════
// HELPER: Get allowed stakes for table creation UI
// Returns the official list of supported stake levels
// ═══════════════════════════════════════════════════════════
function getAllowedStakes() {
  return RAKE_SCHEDULE.map(row => ({
    label: `${row.sb}/${row.bb}`,
    smallBlind: row.sb,
    bigBlind: row.bb,
    rakeCap: row.rakeCap,
    bbjFeeBB: row.bbjFeeBB,
  }));
}

module.exports = {
  RAKE_SCHEDULE,
  BBJ_POOL_ALLOCATION,
  STAKES_TIERS,
  BBJ_QUALIFYING_HANDS,
  BBJ_RULES,
  findScheduleMatch,
  getTierForBB,
  getRakeConfig,
  calculateBBJFee,
  getAllowedStakes,
};
