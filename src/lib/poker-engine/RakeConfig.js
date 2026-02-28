/**
 * CLUB ARENA — Rake & BBJ Configuration
 * 
 * RAKE: 10% / $5 max at 1/2 standard, scaled by stakes tier
 * BBJ FEE: Separate from rake, taken in BB units per hand
 * BBJ PAYOUT: % of main pool paid out per tier (Loser/Winner/TableShare)
 * 
 * BBJ RULES:
 *   - Pot must be ≥ 10 BB
 *   - 4+ players must be dealt in preflop
 *   - Not available for Double/Triple Board games
 *   - If run it multiple times, only first runout counts
 *   - If multiple losers qualify, prize split proportionally
 * 
 * QUALIFYING HANDS (minimum losing hand):
 *   NLH/FLH: AAAJJ (full house, Aces full of Jacks)
 *     - Must lose to Quads or Straight Flush
 *     - Player holding Full House must have at least one Ace in hole cards
 *   PLO4/FLO4: KKKK2 (four Kings)
 *   PLO5/FLO5: 87654 (eight-high straight flush)
 */

// ═══════════════════════════════════════════════════════════
// STAKES TIERS — Maps blind ranges to rake + BBJ config
// ═══════════════════════════════════════════════════════════
const STAKES_TIERS = {
  nano: {
    label: 'Nano',
    blindRange: '0.05/0.1 – 0.1/0.2',
    minBB: 0.1,
    maxBB: 0.2,
    // Rake
    rakePercent: 5,
    rakeCapBB: 10,        // 10 BB = $1-$2 depending on stakes
    rakeCapDollars: 1,
    // BBJ
    bbjFeeBB: 0.6,        // 0.6 BB taken per qualifying hand for BBJ pool
    bbjPayoutTotal: 15,   // 15% of main BBJ pool paid out when hit
    bbjPayoutLoser: 7.5,  // Loser gets 7.5% of pool
    bbjPayoutWinner: 3.75,// Winner gets 3.75%
    bbjPayoutTable: 3.75, // Table share 3.75%
  },
  micro: {
    label: 'Micro',
    blindRange: '0.2/0.4 – 0.4/0.8',
    minBB: 0.4,
    maxBB: 0.8,
    rakePercent: 7,
    rakeCapBB: 8,
    rakeCapDollars: 3,
    bbjFeeBB: 0.4,
    bbjPayoutTotal: 25,
    bbjPayoutLoser: 12.5,
    bbjPayoutWinner: 6.25,
    bbjPayoutTable: 6.25,
  },
  small: {
    label: 'Small',
    blindRange: '0.5/1 – 1.5/3',
    minBB: 1,
    maxBB: 3,
    rakePercent: 10,       // ← THE STANDARD: 10% / $5 cap at 1/2
    rakeCapBB: 5,
    rakeCapDollars: 5,
    bbjFeeBB: 0.25,
    bbjPayoutTotal: 40,
    bbjPayoutLoser: 20,
    bbjPayoutWinner: 10,
    bbjPayoutTable: 10,
  },
  mid: {
    label: 'Mid',
    blindRange: '2/4 – 4/8',
    minBB: 4,
    maxBB: 8,
    rakePercent: 8,
    rakeCapBB: 3,
    rakeCapDollars: 12,
    bbjFeeBB: 0.12,
    bbjPayoutTotal: 55,
    bbjPayoutLoser: 27.5,
    bbjPayoutWinner: 13.75,
    bbjPayoutTable: 13.75,
  },
  high: {
    label: 'High',
    blindRange: '5/10 – 20/40',
    minBB: 10,
    maxBB: 40,
    rakePercent: 5,
    rakeCapBB: 2,
    rakeCapDollars: 20,
    bbjFeeBB: 0.06,
    bbjPayoutTotal: 70,
    bbjPayoutLoser: 35,
    bbjPayoutWinner: 17.5,
    bbjPayoutTable: 17.5,
  },
  nosebleeds: {
    label: 'Nosebleeds',
    blindRange: '25/50+',
    minBB: 50,
    maxBB: Infinity,
    rakePercent: 3,
    rakeCapBB: 1,
    rakeCapDollars: 50,
    bbjFeeBB: 0.03,
    bbjPayoutTotal: 85,
    bbjPayoutLoser: 42.5,
    bbjPayoutWinner: 21.25,
    bbjPayoutTable: 21.25,
  },
};

// ═══════════════════════════════════════════════════════════
// BBJ QUALIFYING HANDS — Minimum losing hand per game variant
// ═══════════════════════════════════════════════════════════
const BBJ_QUALIFYING_HANDS = {
  nlh: {
    label: 'NLH / FLH',
    minLosingHand: 'AAAJJ',             // Aces full of Jacks
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
    minLosingHand: 'KKKK2',             // Four Kings
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
    minLosingHand: '87654',             // 8-high straight flush
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
    minLosingHand: null,                // BBJ not available
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
  minPotBB: 10,                          // Pot must be ≥ 10 BB
  minPlayersDealt: 4,                    // 4+ players dealt in preflop
  excludeDoubleBoard: true,              // Not available for double/triple board
  onlyFirstRunout: true,                 // If run it twice, only first runout counts
  splitIfMultipleQualify: true,          // If multiple losers qualify, split proportionally
  requireBothHoleCards: true,            // Both hole cards must play (NLH)
};

// ═══════════════════════════════════════════════════════════
// HELPER: Get tier config for a given big blind size
// ═══════════════════════════════════════════════════════════
function getTierForBB(bigBlind) {
  const bb = parseFloat(bigBlind) || 0;
  if (bb <= 0.2)  return STAKES_TIERS.nano;
  if (bb <= 0.8)  return STAKES_TIERS.micro;
  if (bb <= 3)    return STAKES_TIERS.small;
  if (bb <= 8)    return STAKES_TIERS.mid;
  if (bb <= 40)   return STAKES_TIERS.high;
  return STAKES_TIERS.nosebleeds;
}

// ═══════════════════════════════════════════════════════════
// HELPER: Get full rake + BBJ config for table creation
// Returns { rakePercent, rakeCapBB, bbjFeeBB, bbjPayouts, tier }
// ═══════════════════════════════════════════════════════════
function getRakeConfig(bigBlind, variant = 'nlh') {
  const tier = getTierForBB(bigBlind);
  const qualifying = BBJ_QUALIFYING_HANDS[variant] || BBJ_QUALIFYING_HANDS.nlh;
  const bbjEligible = qualifying.eligible !== false;

  return {
    tier: tier.label,
    blindRange: tier.blindRange,
    // Rake
    rakePercent: tier.rakePercent,
    rakeCapBB: tier.rakeCapBB,
    rakeCapDollars: tier.rakeCapDollars,
    // BBJ (only if game variant is eligible)
    bbjEnabled: bbjEligible,
    bbjFeeBB: bbjEligible ? tier.bbjFeeBB : 0,
    bbjPayoutTotal: bbjEligible ? tier.bbjPayoutTotal : 0,
    bbjPayoutLoser: bbjEligible ? tier.bbjPayoutLoser : 0,
    bbjPayoutWinner: bbjEligible ? tier.bbjPayoutWinner : 0,
    bbjPayoutTable: bbjEligible ? tier.bbjPayoutTable : 0,
    // Qualifying hand info
    qualifyingHand: qualifying,
    // Rules
    rules: BBJ_RULES,
  };
}

// ═══════════════════════════════════════════════════════════
// HELPER: Calculate BBJ fee for a specific hand
// Returns the BBJ amount to deduct (in chips/dollars)
// ═══════════════════════════════════════════════════════════
function calculateBBJFee(bigBlind, potSize, numPlayersDealt, variant = 'nlh') {
  const config = getRakeConfig(bigBlind, variant);
  
  // Check eligibility
  if (!config.bbjEnabled) return 0;
  if (numPlayersDealt < BBJ_RULES.minPlayersDealt) return 0;
  if (potSize < bigBlind * BBJ_RULES.minPotBB) return 0;
  
  // Fee is fixed at X BB per qualifying hand
  return Math.round(bigBlind * config.bbjFeeBB * 100) / 100;
}

module.exports = {
  STAKES_TIERS,
  BBJ_QUALIFYING_HANDS,
  BBJ_RULES,
  getTierForBB,
  getRakeConfig,
  calculateBBJFee,
};
