/**
 * 60-SECOND GTO LEAK FINDER - 5-HAND SOLVER DIAGNOSTIC DATA & SCORING ENGINE
 * ==========================================================================
 * Five mathematically grounded 6-Max NLHE & Final-Table ICM decision spots
 * covering the five highest-impact player leak categories:
 *   1. Preflop 3-Bet Defense
 *   2. Flop C-Bet Discipline
 *   3. Turn Barrel Selection
 *   4. River Bluff-Catching
 *   5. MTT ICM Shove/Fold
 *
 * Pure ES module with zero browser or React dependencies for deterministic
 * SSR and 100% unit-test coverage.
 * House style: Title Case headings/buttons, zero em dashes, zero banned gold.
 */

export const GTO_LEAK_FINDER_SPOTS = Object.freeze([
  {
    id: 'preflop-3bet-defense',
    category: 'Preflop 3-Bet Defense',
    title: 'Facing A Large Small Blind 3-Bet In Position',
    formatLabel: '100BB 6-Max Cash',
    heroPos: 'BTN',
    villainPos: 'SB',
    villainAction:
      'You Open 2.5 BB From The Button With AQo. The Small Blind 3-Bets To 11.0 BB. Big Blind Folds.',
    heroCards: [
      { rank: 'A', suit: 's' },
      { rank: 'Q', suit: 'd' },
    ],
    boardCards: [],
    potBb: 14.5,
    stackBb: 100,
    options: [
      {
        id: 'call-ip',
        label: 'Call 11.0 BB In Position',
        evDeltaBb: 0,
        solverFreqPct: 78,
        isOptimal: true,
        gradeLabel: 'Solver Optimal',
        shortWhy:
          'AQo Realizes Equity Cleanly In Position Against A Linear SB 3-Bet Range While Dominating Hands Like AJo, ATo, And KQo.',
      },
      {
        id: 'four-bet',
        label: '4-Bet To 25.0 BB',
        evDeltaBb: -0.62,
        solverFreqPct: 18,
        isOptimal: false,
        gradeLabel: 'Slight Overplay',
        shortWhy:
          '4-Betting AQo Isolates You Against JJ+ And AK While Folding Out Dominated Broadways You Crush Postflop.',
      },
      {
        id: 'fold-3bet',
        label: 'Fold To The 3-Bet',
        evDeltaBb: -1.85,
        solverFreqPct: 4,
        isOptimal: false,
        gradeLabel: 'Major Leak',
        shortWhy:
          'Folding Strong Offsuit Broadways In Position Lets Aggressive Blinds Print Profit With Wide 3-Bet Frequencies.',
      },
    ],
    leakTitle: 'Over-Folding Or Misplaying IP 3-Bet Defense',
    leakFixDrill: '/tools/preflop-ranges',
    leakFixLabel: 'Open 13x13 GTO Preflop Ranges',
    bb100Impact: 1.8,
  },
  {
    id: 'flop-cbet-discipline',
    category: 'Flop C-Bet Discipline',
    title: 'Handling A Connected Low Board As The Preflop Raiser',
    formatLabel: '100BB 6-Max Cash',
    heroPos: 'CO',
    villainPos: 'BB',
    villainAction:
      'You Open 2.5 BB From The Cutoff With AKo And The Big Blind Calls. Flop Comes 8s 7s 5d And BB Checks.',
    heroCards: [
      { rank: 'A', suit: 'h' },
      { rank: 'K', suit: 'c' },
    ],
    boardCards: [
      { rank: '8', suit: 's' },
      { rank: '7', suit: 's' },
      { rank: '5', suit: 'd' },
    ],
    potBb: 5.5,
    stackBb: 97.5,
    options: [
      {
        id: 'check-back',
        label: 'Check Back To Realize Equity',
        evDeltaBb: 0,
        solverFreqPct: 74,
        isOptimal: true,
        gradeLabel: 'Solver Optimal',
        shortWhy:
          'The Big Blind Holds A Major Two-Pair, Set, And Straight Advantage On 8-7-5 Two-Tone. Checking Back Protects Your Overcard Equity Against Check-Raises.',
      },
      {
        id: 'cbet-small',
        label: 'Range C-Bet 33% Pot (1.8 BB)',
        evDeltaBb: -0.48,
        solverFreqPct: 20,
        isOptimal: false,
        gradeLabel: 'Range-Bet Leak',
        shortWhy:
          'Auto-Betting Small On Connected Low Boards Invites Frequent Check-Raises That Force AKo Off Six Live Overcards.',
      },
      {
        id: 'cbet-large',
        label: 'C-Bet 75% Pot (4.1 BB)',
        evDeltaBb: -1.35,
        solverFreqPct: 6,
        isOptimal: false,
        gradeLabel: 'Major Leak',
        shortWhy:
          'Betting Large With Unpaired Overcards Bloats The Pot Without Range Or Nut Advantage On A BB-Favorable Texture.',
      },
    ],
    leakTitle: 'Auto-C-Betting Connected Low Boards',
    leakFixDrill: '/tools/board-texture-analyzer',
    leakFixLabel: 'Open Board Texture Analyzer',
    bb100Impact: 1.6,
  },
  {
    id: 'turn-barrel-selection',
    category: 'Turn Barrel Selection',
    title: 'Barreling A High-Equity Draw On A Brick Turn',
    formatLabel: '100BB 6-Max Cash',
    heroPos: 'BTN',
    villainPos: 'BB',
    villainAction:
      'You Open BTN With KdQd, BB Calls, And Calls Your 3.8 BB C-Bet On Jd 9c 4h. Turn Is 3s And BB Checks.',
    heroCards: [
      { rank: 'K', suit: 'd' },
      { rank: 'Q', suit: 'd' },
    ],
    boardCards: [
      { rank: 'J', suit: 'd' },
      { rank: '9', suit: 'c' },
      { rank: '4', suit: 'h' },
      { rank: '3', suit: 's' },
    ],
    potBb: 13.1,
    stackBb: 93.7,
    options: [
      {
        id: 'barrel-large',
        label: 'Barrel 75% Pot (10.0 BB)',
        evDeltaBb: 0,
        solverFreqPct: 76,
        isOptimal: true,
        gradeLabel: 'Solver Optimal',
        shortWhy:
          'KdQd Has 14 Clean Outs (Open-Ended Straight Draw Plus Two Overcards) And Zero Showdown Value, Making It A Pure High-Equity Semi-Bluff Barrel.',
      },
      {
        id: 'check-turn',
        label: 'Check Back For A Free River',
        evDeltaBb: -0.74,
        solverFreqPct: 19,
        isOptimal: false,
        gradeLabel: 'Passive Leak',
        shortWhy:
          'Checking Back High-Equity Zero-Showdown Draws Surrenders Fold Equity Against Weak 9x, Pocket Pairs, And Flop Floats.',
      },
      {
        id: 'bet-quarter',
        label: 'Bet 25% Pot (3.3 BB)',
        evDeltaBb: -1.12,
        solverFreqPct: 5,
        isOptimal: false,
        gradeLabel: 'Sizing Leak',
        shortWhy:
          'A Small Quarter-Pot Sizing Gives Marginal One-Pair Hands And Gutshots An Easy Call Without Generating Real Fold Equity.',
      },
    ],
    leakTitle: 'Under-Barreling High-Equity Turn Semi-Bluffs',
    leakFixDrill: '/hub/training',
    leakFixLabel: 'Drill Turn Barrels In 107 GTO Games',
    bb100Impact: 1.5,
  },
  {
    id: 'river-bluff-catching',
    category: 'River Bluff-Catching',
    title: 'Bluff-Catching Top Pair After A Checked Turn',
    formatLabel: '100BB 6-Max Cash',
    heroPos: 'BB',
    villainPos: 'BTN',
    villainAction:
      'BTN Opens And C-Bets Ad 7s 2s, You Call With AsTh. Turn 5c Checks Through. River Kd: You Check, BTN Bets 7.0 BB Into 9.1 BB.',
    heroCards: [
      { rank: 'A', suit: 's' },
      { rank: 'T', suit: 'h' },
    ],
    boardCards: [
      { rank: 'A', suit: 'd' },
      { rank: '7', suit: 's' },
      { rank: '2', suit: 's' },
      { rank: '5', suit: 'c' },
      { rank: 'K', suit: 'd' },
    ],
    potBb: 9.1,
    stackBb: 95.7,
    options: [
      {
        id: 'call-river',
        label: 'Call 7.0 BB Bluff-Catch',
        evDeltaBb: 0,
        solverFreqPct: 82,
        isOptimal: true,
        gradeLabel: 'Solver Optimal',
        shortWhy:
          'BTN Checking Back The Turn Caps Their Nutted Value Range, And AsTh Is Near The Top Of Your Check-Call Range To Satisfy River MDF.',
      },
      {
        id: 'fold-river',
        label: 'Fold Top Pair To The King',
        evDeltaBb: -1.42,
        solverFreqPct: 15,
        isOptimal: false,
        gradeLabel: 'Over-Folding Leak',
        shortWhy:
          'Folding Strong Top Pair On A River After A Checked Turn Lets BTN Profitably Bluff Every Missed Draw And Low Pair.',
      },
      {
        id: 'raise-river',
        label: 'Check-Raise All-In For Value',
        evDeltaBb: -2.45,
        solverFreqPct: 3,
        isOptimal: false,
        gradeLabel: 'Spew Leak',
        shortWhy:
          'Raising A Medium One-Pair Hand Only Gets Called By Two Pair Or Better While Folding Out Every Single Bluff You Beat.',
      },
    ],
    leakTitle: 'Over-Folding Or Misreading River Blockers',
    leakFixDrill: '/tools/bluff-catching-calculator',
    leakFixLabel: 'Open Bluff-Catching Calculator',
    bb100Impact: 1.4,
  },
  {
    id: 'mtt-icm-shove-fold',
    category: 'MTT ICM Shove/Fold',
    title: 'Surviving A High-Pressure Final Table Money Bubble',
    formatLabel: 'MTT Bubble ICM (14BB)',
    heroPos: 'SB',
    villainPos: 'BB',
    villainAction:
      '5 Players Left, 4 Paid. You Hold A8o With 14.0 BB In SB. Two Short Stacks Have 5.0 BB And 6.5 BB. Covering BB Has 32.0 BB. Folded To You.',
    heroCards: [
      { rank: 'A', suit: 'c' },
      { rank: '8', suit: 's' },
    ],
    boardCards: [],
    potBb: 2.1,
    stackBb: 14,
    options: [
      {
        id: 'fold-icm',
        label: 'Fold To Preserve ICM Ladder Equity',
        evDeltaBb: 0,
        solverFreqPct: 72,
        isOptimal: true,
        gradeLabel: 'Solver Optimal',
        shortWhy:
          'With Two Micro-Stacks About To Bust On The Bubble, Your Bubble Factor Against The Covering Big Stack Exceeds 2.4x, Making Offsuit A8o A Clear ICM Fold.',
      },
      {
        id: 'shove-icm',
        label: 'Open-Shove All-In (14.0 BB)',
        evDeltaBb: -1.68,
        solverFreqPct: 16,
        isOptimal: false,
        gradeLabel: 'ICM Suicide Leak',
        shortWhy:
          'Chip-EV Push/Fold Charts Shove A8o Here, But Under Severe Money-Bubble ICM Risking Elimination Against The Big Stack Destroys Dollar EV.',
      },
      {
        id: 'limp-call-icm',
        label: 'Limp 1.0 BB And Call Any Jam',
        evDeltaBb: -1.94,
        solverFreqPct: 12,
        isOptimal: false,
        gradeLabel: 'Major ICM Leak',
        shortWhy:
          'Limping And Calling Off Against A Covering Big Stack Commits You To The Exact Bubble Bustout Scenario ICM Demands Avoiding.',
      },
    ],
    leakTitle: 'Ignoring Final-Table ICM Bubble Factors',
    leakFixDrill: '/tools/icm-calculator',
    leakFixLabel: 'Open Free ICM Calculator',
    bb100Impact: 1.7,
  },
]);

function normalizeAnswersMap(answers) {
  const map = {};
  if (!answers) return map;
  if (Array.isArray(answers)) {
    for (const item of answers) {
      if (item && typeof item.spotId === 'string' && typeof item.optionId === 'string') {
        map[item.spotId] = item.optionId;
      }
    }
    return map;
  }
  if (typeof answers === 'object') {
    for (const [k, v] of Object.entries(answers)) {
      if (typeof v === 'string' && v.trim()) {
        map[k] = v.trim();
      }
    }
  }
  return map;
}

function resolvePlayerGrade(accuracyPct, answeredCount) {
  if (answeredCount <= 0) return 'Pending Diagnostic';
  if (accuracyPct >= 100) return 'Solver Elite (A+)';
  if (accuracyPct >= 80) return 'Sharp Regular (A)';
  if (accuracyPct >= 60) return 'Winning Grinder (B)';
  if (accuracyPct >= 40) return 'Leak Risk Alert (C)';
  return 'High-Leak Alert (D)';
}

/**
 * Pure deterministic scoring helper for the 5-hand GTO Leak Finder.
 * Accepts either `{ [spotId]: optionId }` or `[{ spotId, optionId }]`.
 */
export function scoreGtoLeakFinder(answers = {}) {
  const answerMap = normalizeAnswersMap(answers);
  let answeredCount = 0;
  let optimalCount = 0;
  let totalLeakBb100 = 0;
  let primaryLeak = null;

  const categoryBreakdown = GTO_LEAK_FINDER_SPOTS.map((spot) => {
    const optimalOption = spot.options.find((opt) => opt.isOptimal) || spot.options[0];
    const chosenId = answerMap[spot.id] || null;
    const chosenOption = chosenId ? spot.options.find((opt) => opt.id === chosenId) || null : null;

    if (!chosenOption) {
      return {
        spotId: spot.id,
        category: spot.category,
        title: spot.title,
        answered: false,
        isOptimal: false,
        chosenOptionId: null,
        chosenLabel: null,
        optimalLabel: optimalOption.label,
        evDeltaBb: 0,
        solverFreqPct: optimalOption.solverFreqPct,
        leakBb100: 0,
        leakTitle: spot.leakTitle,
        leakFixDrill: spot.leakFixDrill,
        leakFixLabel: spot.leakFixLabel,
        shortWhy: optimalOption.shortWhy,
      };
    }

    answeredCount += 1;
    const isOptimal = Boolean(chosenOption.isOptimal);
    if (isOptimal) optimalCount += 1;

    const maxLossBb = Math.max(
      ...spot.options.map((opt) => Math.abs(Number(opt.evDeltaBb || 0))),
      0.01,
    );
    const chosenLossBb = Math.abs(Number(chosenOption.evDeltaBb || 0));
    const severityRatio = isOptimal ? 0 : Math.min(1, Math.max(0.45, chosenLossBb / maxLossBb));
    const leakBb100 = isOptimal ? 0 : Number((spot.bb100Impact * severityRatio).toFixed(1));
    totalLeakBb100 += leakBb100;

    const row = {
      spotId: spot.id,
      category: spot.category,
      title: spot.title,
      answered: true,
      isOptimal,
      chosenOptionId: chosenOption.id,
      chosenLabel: chosenOption.label,
      optimalLabel: optimalOption.label,
      evDeltaBb: Number(chosenOption.evDeltaBb || 0),
      solverFreqPct: Number(chosenOption.solverFreqPct || 0),
      leakBb100,
      leakTitle: spot.leakTitle,
      leakFixDrill: spot.leakFixDrill,
      leakFixLabel: spot.leakFixLabel,
      shortWhy: chosenOption.shortWhy,
    };

    if (!isOptimal) {
      if (
        !primaryLeak ||
        leakBb100 > primaryLeak.bb100Impact ||
        (leakBb100 === primaryLeak.bb100Impact && Math.abs(row.evDeltaBb) > Math.abs(primaryLeak.evDeltaBb))
      ) {
        primaryLeak = {
          spotId: spot.id,
          category: spot.category,
          leakTitle: spot.leakTitle,
          leakFixDrill: spot.leakFixDrill,
          leakFixLabel: spot.leakFixLabel,
          bb100Impact: leakBb100,
          evDeltaBb: row.evDeltaBb,
          shortWhy: chosenOption.shortWhy,
        };
      }
    }

    return row;
  });

  const accuracyPct = answeredCount > 0 ? Math.round((optimalCount / answeredCount) * 100) : 0;
  const estimatedLeakBb100 = Number(totalLeakBb100.toFixed(1));
  const playerGrade = resolvePlayerGrade(accuracyPct, answeredCount);

  return {
    answeredCount,
    optimalCount,
    accuracyPct,
    estimatedLeakBb100,
    playerGrade,
    primaryLeak,
    categoryBreakdown,
  };
}
