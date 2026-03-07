/* ═══════════════════════════════════════════════════════════════════════════
   📊 GTO SCENARIO DATABASE - Progressive Difficulty System
   Each level builds on previous knowledge with increasing complexity
   ═══════════════════════════════════════════════════════════════════════════ */

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export function getHandName(row, col) {
    if (row === col) return RANKS[row] + RANKS[col];
    if (row < col) return RANKS[row] + RANKS[col] + 's';
    return RANKS[col] + RANKS[row] + 'o';
}

// ═══════════════════════════════════════════════════════════════════════════
// DIFFICULTY SETTINGS - Timer, complexity, and scoring adjustments
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_CONFIG = {
    1: { timer: 90, gridSize: 13, maxHands: 20, xpMultiplier: 1.0 },
    2: { timer: 85, gridSize: 13, maxHands: 22, xpMultiplier: 1.2 },
    3: { timer: 80, gridSize: 13, maxHands: 24, xpMultiplier: 1.4 },
    4: { timer: 75, gridSize: 13, maxHands: 26, xpMultiplier: 1.6 },
    5: { timer: 70, gridSize: 13, maxHands: 28, xpMultiplier: 1.8 },
    6: { timer: 65, gridSize: 13, maxHands: 30, xpMultiplier: 2.0 },
    7: { timer: 60, gridSize: 13, maxHands: 32, xpMultiplier: 2.2 },
    8: { timer: 55, gridSize: 13, maxHands: 34, xpMultiplier: 2.4 },
    9: { timer: 50, gridSize: 13, maxHands: 36, xpMultiplier: 2.6 },
    10: { timer: 45, gridSize: 13, maxHands: 40, xpMultiplier: 3.0 },
};

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 1: NEURAL BOOT - Simple UTG/MP Opens (Tight ranges, easy to learn)
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_1_SCENARIOS = [
    {
        id: 'l1-utg-100BB', level: 1, title: 'UTG Open (100BB)', position: 'UTG', stackDepth: 100,
        description: 'The Tightest Opening Range. Only Premium Hands.',
        tip: 'Focus On Pairs TT+, Broadway Suited, And Strong Offsuit Broadways.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'A5s': 'raise', 'A4s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'QJs': 'raise', 'JTs': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise',
        }
    },
    {
        id: 'l1-mp-100BB', level: 1, title: 'MP Open (100BB)', position: 'MP', stackDepth: 100,
        description: 'Slightly Wider Than UTG. Add Some Suited Connectors.',
        tip: 'Include 66, More Suited Ax, And K9s+.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'JTs': 'raise', 'J9s': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise', '54s': 'raise',
        }
    },
    {
        id: 'l1-hj-100BB', level: 1, title: 'HJ Open (100BB)', position: 'HJ', stackDepth: 100,
        description: 'The Widest Early Position. Transition to Late Position Opens.',
        tip: 'Add 55, 44, More Offsuit Broadways, And Suited Gappers.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise', 'A8s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise', 'KJo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'QJo': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'JTo': 'raise',
            'T9s': 'raise', 'T8s': 'raise', '98s': 'raise', '97s': 'raise',
            '87s': 'raise', '86s': 'raise', '76s': 'raise', '75s': 'raise',
            '65s': 'raise', '64s': 'raise', '54s': 'raise', '53s': 'raise',
        }
    },
    {
        id: 'l1-utg-50BB', level: 1, title: 'UTG Open (50BB)', position: 'UTG', stackDepth: 50,
        description: 'Shorter Stack UTG Range. Tighter Than 100BB.',
        tip: 'Cut Some Suited Connectors, Focus On High Card Strength.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'A5s': 'raise', 'A4s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'QJs': 'raise', 'JTs': 'raise',
            'T9s': 'raise', '98s': 'raise',
        }
    },
    {
        id: 'l1-utg-200BB', level: 1, title: 'UTG Open (200BB)', position: 'UTG', stackDepth: 200,
        description: 'Deep Stack UTG. Can Add More Speculative Hands.',
        tip: 'Add Small Pairs And More Suited Connectors For Implied Odds.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'QJs': 'raise', 'QTs': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise', '54s': 'raise',
        }
    },
    {
        id: 'l1-mp-50BB', level: 1, title: 'MP Open (50BB)', position: 'MP', stackDepth: 50,
        description: 'Middle Position with Shorter Stack.',
        tip: 'Slightly Wider Than UTG 50BB, But Still Tight.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'KQo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'JTs': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise',
        }
    },
    {
        id: 'l1-mp-200BB', level: 1, title: 'MP Open (200BB)', position: 'MP', stackDepth: 200,
        description: 'Deep Stack Middle Position.',
        tip: 'Add More Suited Hands And Small Pairs.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise', 'A8s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'KQo': 'raise', 'KJo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'JTs': 'raise', 'J9s': 'raise',
            'T9s': 'raise', 'T8s': 'raise', '98s': 'raise', '97s': 'raise', '87s': 'raise', '86s': 'raise',
            '76s': 'raise', '75s': 'raise', '65s': 'raise', '64s': 'raise', '54s': 'raise', '53s': 'raise',
        }
    },
    {
        id: 'l1-hj-50BB', level: 1, title: 'HJ Open (50BB)', position: 'HJ', stackDepth: 50,
        description: 'Hijack with Shorter Stack.',
        tip: 'Wider Than MP, But Not As Wide As 100BB HJ.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise', 'A8s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise', 'KJo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'QJo': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'T9s': 'raise', 'T8s': 'raise',
            '98s': 'raise', '97s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise',
        }
    },
    {
        id: 'l1-hj-200BB', level: 1, title: 'HJ Open (200BB)', position: 'HJ', stackDepth: 200,
        description: 'Deep Stack Hijack.',
        tip: 'Very Wide Range With Deep Stacks.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise', '33': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise', 'A8s': 'raise', 'A7s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise', 'A8o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'K7s': 'raise', 'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'Q8s': 'raise', 'QJo': 'raise', 'QTo': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise', 'JTo': 'raise',
            'T9s': 'raise', 'T8s': 'raise', 'T7s': 'raise', 'T9o': 'raise',
            '98s': 'raise', '97s': 'raise', '96s': 'raise', '87s': 'raise', '86s': 'raise', '85s': 'raise',
            '76s': 'raise', '75s': 'raise', '74s': 'raise', '65s': 'raise', '64s': 'raise', '54s': 'raise', '53s': 'raise', '43s': 'raise',
        }
    },
    // Additional UTG variations
    {
        id: 'l1-utg-30BB', level: 1, title: 'UTG Open (30BB)', position: 'UTG', stackDepth: 30,
        description: 'Short Stack UTG. Very Tight Range.',
        tip: 'Premium Hands Only. No Speculative Plays.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'QJs': 'raise',
        }
    },
    {
        id: 'l1-mp-30BB', level: 1, title: 'MP Open (30BB)', position: 'MP', stackDepth: 30,
        description: 'Short Stack Middle Position.',
        tip: 'Slightly Wider Than UTG 30BB.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'KQo': 'raise',
            'QJs': 'raise', 'JTs': 'raise',
        }
    },
    {
        id: 'l1-hj-30BB', level: 1, title: 'HJ Open (30BB)', position: 'HJ', stackDepth: 30,
        description: 'Short Stack Hijack.',
        tip: 'Wider Than MP 30BB, But Still Relatively Tight.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'JTs': 'raise',
            'T9s': 'raise', '98s': 'raise',
        }
    },
    // UTG+1 scenarios
    {
        id: 'l1-utg1-100BB', level: 1, title: 'UTG+1 Open (100BB)', position: 'UTG+1', stackDepth: 100,
        description: 'One Seat After UTG. Slightly Wider.',
        tip: 'Add A Few More Suited Hands Than UTG.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'JTs': 'raise', 'J9s': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise',
        }
    },
    {
        id: 'l1-utg1-50BB', level: 1, title: 'UTG+1 Open (50BB)', position: 'UTG+1', stackDepth: 50,
        description: 'UTG+1 with Shorter Stack.',
        tip: 'Tighter Than 100BB, But Wider Than UTG 50BB.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'A5s': 'raise', 'A4s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'QJs': 'raise', 'JTs': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise',
        }
    },
    {
        id: 'l1-lj-100BB', level: 1, title: 'LJ Open (100BB)', position: 'LJ', stackDepth: 100,
        description: 'Lojack (MP2). Between MP and HJ.',
        tip: 'Wider Than MP, Narrower Than HJ.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise', 'A8s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise', 'KJo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'QJo': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'JTo': 'raise',
            'T9s': 'raise', 'T8s': 'raise', '98s': 'raise', '97s': 'raise',
            '87s': 'raise', '86s': 'raise', '76s': 'raise', '75s': 'raise', '65s': 'raise', '64s': 'raise', '54s': 'raise',
        }
    },
    // Ante vs No Ante scenarios
    {
        id: 'l1-utg-100BB-ante', level: 1, title: 'UTG Open (100BB, Ante)', position: 'UTG', stackDepth: 100,
        description: 'UTG with Big-Blind Ante. Slightly Wider.',
        tip: 'Ante Makes Stealing More Profitable. Add A Few More Hands.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'JTs': 'raise', 'J9s': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise', '54s': 'raise',
        }
    },
    {
        id: 'l1-mp-100BB-ante', level: 1, title: 'MP Open (100BB, Ante)', position: 'MP', stackDepth: 100,
        description: 'Middle Position with Ante.',
        tip: 'Ante Increases Pot Odds. Open Wider.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise', 'A8s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'KQo': 'raise', 'KJo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'JTs': 'raise', 'J9s': 'raise',
            'T9s': 'raise', 'T8s': 'raise', '98s': 'raise', '97s': 'raise', '87s': 'raise', '86s': 'raise',
            '76s': 'raise', '75s': 'raise', '65s': 'raise', '64s': 'raise', '54s': 'raise', '53s': 'raise',
        }
    },
    // 6-max vs 9-max
    {
        id: 'l1-utg-6max', level: 1, title: 'UTG Open (6-Max)', position: 'UTG', stackDepth: 100,
        description: 'UTG in 6-max. Wider Than 9-max UTG.',
        tip: '6-max UTG Is Like 9-max MP. Open Wider.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise', 'KJo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'JTs': 'raise', 'J9s': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise', '54s': 'raise',
        }
    },
    {
        id: 'l1-mp-6max', level: 1, title: 'MP Open (6-Max)', position: 'MP', stackDepth: 100,
        description: 'MP in 6-max. Very Wide.',
        tip: '6-max MP Is Like 9-max HJ. Open Very Wide.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise', 'A8s': 'raise', 'A7s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise', 'A8o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'Q8s': 'raise', 'QJo': 'raise', 'QTo': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise', 'JTo': 'raise',
            'T9s': 'raise', 'T8s': 'raise', 'T7s': 'raise', '98s': 'raise', '97s': 'raise', '96s': 'raise',
            '87s': 'raise', '86s': 'raise', '85s': 'raise', '76s': 'raise', '75s': 'raise', '74s': 'raise',
            '65s': 'raise', '64s': 'raise', '54s': 'raise', '53s': 'raise', '43s': 'raise',
        }
    },
    // Tournament vs Cash
    {
        id: 'l1-utg-mtt-20BB', level: 1, title: 'UTG Open (MTT, 20BB)', position: 'UTG', stackDepth: 20,
        description: 'Tournament UTG with 20BB. Push/fold Territory.',
        tip: 'Very Tight. Only Premium Hands.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise',
            'AKo': 'raise', 'AQo': 'raise',
            'KQs': 'raise', 'KJs': 'raise',
        }
    },
    {
        id: 'l1-mp-mtt-20BB', level: 1, title: 'MP Open (MTT, 20BB)', position: 'MP', stackDepth: 20,
        description: 'Tournament MP with 20BB.',
        tip: 'Slightly Wider Than UTG 20BB.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'A5s': 'raise', 'A4s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'QJs': 'raise',
        }
    },
    {
        id: 'l1-hj-mtt-20BB', level: 1, title: 'HJ Open (MTT, 20BB)', position: 'HJ', stackDepth: 20,
        description: 'Tournament HJ with 20BB.',
        tip: 'Wider Than MP, But Still Relatively Tight.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'KQo': 'raise',
            'QJs': 'raise', 'JTs': 'raise', 'T9s': 'raise',
        }
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 2: POSITION PULSE - Late Position Opens (Much wider, position power)
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_2_SCENARIOS = [
    {
        id: 'l2-co-100BB', level: 2, title: 'CO Open (100BB)', position: 'CO', stackDepth: 100,
        description: 'Cutoff is Where Ranges Explode. Open Very Wide.',
        tip: 'All Pairs, Most Suited Hands, Broadway Offsuit To K9o.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise', '33': 'raise', '22': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise', 'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise', 'A8o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'K7s': 'raise', 'K6s': 'raise', 'K5s': 'raise',
            'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise', 'K9o': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'Q8s': 'raise', 'Q7s': 'raise', 'QJo': 'raise', 'QTo': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise', 'J7s': 'raise', 'JTo': 'raise', 'J9o': 'raise',
            'T9s': 'raise', 'T8s': 'raise', 'T7s': 'raise', 'T9o': 'raise',
            '98s': 'raise', '97s': 'raise', '96s': 'raise', '98o': 'raise',
            '87s': 'raise', '86s': 'raise', '85s': 'raise', '76s': 'raise', '75s': 'raise', '74s': 'raise',
            '65s': 'raise', '64s': 'raise', '54s': 'raise', '53s': 'raise', '43s': 'raise',
        }
    },
    {
        id: 'l2-btn-100BB', level: 2, title: 'BTN Open (100BB)', position: 'BTN', stackDepth: 100,
        description: 'The Widest Opener! Position is Everything.',
        tip: 'Almost Any Suited Hand, All Pairs, Most Broadway Offsuit.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise', '33': 'raise', '22': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise', 'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise', 'A8o': 'raise', 'A7o': 'raise', 'A6o': 'raise', 'A5o': 'raise', 'A4o': 'raise', 'A3o': 'raise', 'A2o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'K7s': 'raise', 'K6s': 'raise', 'K5s': 'raise', 'K4s': 'raise', 'K3s': 'raise', 'K2s': 'raise',
            'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise', 'K9o': 'raise', 'K8o': 'raise', 'K7o': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'Q8s': 'raise', 'Q7s': 'raise', 'Q6s': 'raise', 'Q5s': 'raise', 'Q4s': 'raise', 'Q3s': 'raise', 'Q2s': 'raise',
            'QJo': 'raise', 'QTo': 'raise', 'Q9o': 'raise', 'Q8o': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise', 'J7s': 'raise', 'J6s': 'raise', 'J5s': 'raise',
            'JTo': 'raise', 'J9o': 'raise', 'J8o': 'raise',
            'T9s': 'raise', 'T8s': 'raise', 'T7s': 'raise', 'T6s': 'raise', 'T9o': 'raise', 'T8o': 'raise',
            '98s': 'raise', '97s': 'raise', '96s': 'raise', '95s': 'raise', '98o': 'raise', '97o': 'raise',
            '87s': 'raise', '86s': 'raise', '85s': 'raise', '84s': 'raise', '87o': 'raise', '86o': 'raise',
            '76s': 'raise', '75s': 'raise', '74s': 'raise', '73s': 'raise', '76o': 'raise',
            '65s': 'raise', '64s': 'raise', '63s': 'raise', '62s': 'raise',
            '54s': 'raise', '53s': 'raise', '52s': 'raise', '43s': 'raise', '42s': 'raise', '32s': 'raise',
        }
    },
    {
        id: 'l2-sb-steal', level: 2, title: 'SB Steal vs BB (100BB)', position: 'SB', stackDepth: 100,
        description: 'Stealing From Small-Blind. Very Wide but Vulnerable.',
        tip: 'Wide Linear Range-high Cards And Suited Hands.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise', '33': 'raise', '22': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise', 'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise', 'A8o': 'raise', 'A7o': 'raise', 'A6o': 'raise', 'A5o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'K7s': 'raise', 'K6s': 'raise', 'K5s': 'raise', 'K4s': 'raise', 'K3s': 'raise', 'K2s': 'raise',
            'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise', 'K9o': 'raise', 'K8o': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'Q8s': 'raise', 'Q7s': 'raise', 'Q6s': 'raise', 'Q5s': 'raise',
            'QJo': 'raise', 'QTo': 'raise', 'Q9o': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise', 'J7s': 'raise', 'J6s': 'raise', 'JTo': 'raise', 'J9o': 'raise',
            'T9s': 'raise', 'T8s': 'raise', 'T7s': 'raise', 'T6s': 'raise', 'T9o': 'raise', 'T8o': 'raise',
            '98s': 'raise', '97s': 'raise', '96s': 'raise', '98o': 'raise',
            '87s': 'raise', '86s': 'raise', '85s': 'raise', '87o': 'raise',
            '76s': 'raise', '75s': 'raise', '74s': 'raise', '76o': 'raise',
            '65s': 'raise', '64s': 'raise', '54s': 'raise', '53s': 'raise', '43s': 'raise',
        }
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 3: DEFENSE MATRIX - BB Defense (Call vs Raise decisions)
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_3_SCENARIOS = [
    {
        id: 'l3-bb-vs-btn', level: 3, title: 'BB vs BTN Open', position: 'BB', vsPosition: 'BTN', stackDepth: 100,
        description: 'Wide Defense vs Late Position. Mix Calls and 3-bets.',
        tip: 'Defend Wide-you Close The Action And Get Good Pot Odds.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'call', '88': 'call', '77': 'call', '66': 'call', '55': 'call', '44': 'call', '33': 'call', '22': 'call',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'call', 'ATs': 'call', 'A9s': 'call', 'A8s': 'call', 'A7s': 'call', 'A6s': 'call', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'call', 'A2s': 'call',
            'AKo': 'raise', 'AQo': 'call', 'AJo': 'call', 'ATo': 'call', 'A9o': 'call', 'A8o': 'call', 'A7o': 'call',
            'KQs': 'raise', 'KJs': 'call', 'KTs': 'call', 'K9s': 'call', 'K8s': 'call', 'K7s': 'call', 'K6s': 'call', 'K5s': 'call', 'K4s': 'call', 'K3s': 'call', 'K2s': 'call',
            'KQo': 'call', 'KJo': 'call', 'KTo': 'call', 'K9o': 'call', 'K8o': 'call',
            'QJs': 'call', 'QTs': 'call', 'Q9s': 'call', 'Q8s': 'call', 'Q7s': 'call', 'Q6s': 'call', 'Q5s': 'call',
            'QJo': 'call', 'QTo': 'call', 'Q9o': 'call',
            'JTs': 'call', 'J9s': 'call', 'J8s': 'call', 'J7s': 'call', 'J6s': 'call', 'JTo': 'call', 'J9o': 'call', 'J8o': 'call',
            'T9s': 'call', 'T8s': 'call', 'T7s': 'call', 'T6s': 'call', 'T9o': 'call', 'T8o': 'call',
            '98s': 'call', '97s': 'call', '96s': 'call', '95s': 'call', '98o': 'call', '97o': 'call',
            '87s': 'call', '86s': 'call', '85s': 'call', '87o': 'call', '86o': 'call',
            '76s': 'call', '75s': 'call', '74s': 'call', '76o': 'call',
            '65s': 'call', '64s': 'call', '63s': 'call', '54s': 'call', '53s': 'call', '43s': 'call', '42s': 'call', '32s': 'call',
        }
    },
    {
        id: 'l3-bb-vs-utg', level: 3, title: 'BB vs UTG Open', position: 'BB', vsPosition: 'UTG', stackDepth: 100,
        description: 'Tight Defense vs Early Position. Respect Their Range.',
        tip: 'Only Defend With Hands That Play Well Postflop.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'call', 'TT': 'call',
            '99': 'call', '88': 'call', '77': 'call', '66': 'call', '55': 'call', '44': 'call',
            'AKs': 'raise', 'AQs': 'call', 'AJs': 'call', 'ATs': 'call', 'A9s': 'call', 'A5s': 'call', 'A4s': 'call',
            'AKo': 'call', 'AQo': 'call',
            'KQs': 'call', 'KJs': 'call', 'KTs': 'call',
            'QJs': 'call', 'QTs': 'call',
            'JTs': 'call', 'J9s': 'call',
            'T9s': 'call', '98s': 'call', '87s': 'call', '76s': 'call', '65s': 'call', '54s': 'call',
        }
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// LEVELS 4-10 - Progressive complexity with explanations
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_4_SCENARIOS = [
    {
        id: 'l4-btn-3bet-vs-co', level: 4, title: 'BTN 3-Bet vs CO', position: 'BTN', vsPosition: 'CO', stackDepth: 100,
        description: '3-bet for Value and as Bluffs. Polarized Range.',
        tip: 'Premium Hands For Value, Ax-suited Bluffs For Blockers.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise',
            'QJs': 'raise', 'JTs': 'raise', 'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise',
        }
    },
    {
        id: 'l4-sb-3bet-vs-btn', level: 4, title: 'SB 3-Bet vs BTN', position: 'SB', vsPosition: 'BTN', stackDepth: 100,
        description: "Wide 3-bet from SB. You're OOP so build the pot.",
        tip: '3-bet Or Fold-avoid Flatting From The SB vs BTN.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise', 'KJo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise',
        }
    },
];

export const LEVEL_5_SCENARIOS = [
    {
        id: 'l5-btn-flat-vs-mp', level: 5, title: 'BTN Flat vs MP', position: 'BTN', vsPosition: 'MP', stackDepth: 100,
        description: 'When to Call vs 3-bet. Trapping and IP Advantage.',
        tip: "Flat with hands that play well postflop but don't 3-bet.",
        solution: {
            'JJ': 'call', 'TT': 'call', '99': 'call', '88': 'call', '77': 'call', '66': 'call', '55': 'call', '44': 'call', '33': 'call', '22': 'call',
            'AQs': 'call', 'AJs': 'call', 'ATs': 'call', 'A9s': 'call', 'A8s': 'call',
            'KQs': 'call', 'KJs': 'call', 'KTs': 'call', 'K9s': 'call',
            'QJs': 'call', 'QTs': 'call', 'Q9s': 'call',
            'JTs': 'call', 'J9s': 'call', 'T9s': 'call', 'T8s': 'call',
            '98s': 'call', '97s': 'call', '87s': 'call', '86s': 'call',
            '76s': 'call', '75s': 'call', '65s': 'call', '64s': 'call', '54s': 'call',
        }
    },
];

export const LEVEL_6_SCENARIOS = [
    {
        id: 'l6-co-4bet-vs-btn', level: 6, title: 'CO 4-Bet vs BTN 3-Bet', position: 'CO', vsPosition: 'BTN', stackDepth: 100,
        description: 'Polarized 4-bet Range. Value Heavy with Blockers.',
        tip: 'AA/KK/QQ For Value, Ax-suited Bluffs With Blockers.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise',
            'AKs': 'raise', 'AQs': 'raise',
            'A5s': 'raise', 'A4s': 'raise',
            'AKo': 'raise',
        }
    },
];

export const LEVEL_7_SCENARIOS = [
    {
        id: 'l7-cbet-dry-k72r', level: 7, title: 'C-Bet K72r Flop', position: 'BTN', board: 'K72r', stackDepth: 100,
        description: 'C-bet on a Dry K-high Flop. High Frequency.',
        tip: 'Bet Small With Entire Range On Dry Boards.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'AKs': 'raise', 'AKo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise',
            'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise', '99': 'raise', '88': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'JTs': 'raise',
        }
    },
];

export const LEVEL_8_SCENARIOS = [
    {
        id: 'l8-turn-barrel', level: 8, title: 'Turn Barrel K72-T', position: 'BTN', board: 'K72T', stackDepth: 100,
        description: 'Which Hands Continue Betting the Turn?',
        tip: 'Barrel With Value Hands And Draws, Check Back Weak Hands.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'TT': 'raise',
            'AKs': 'raise', 'AKo': 'raise', 'KQs': 'raise', 'KTs': 'raise',
            'AQs': 'raise', 'AJs': 'raise', 'QJs': 'raise',
        }
    },
];

export const LEVEL_9_SCENARIOS = [
    {
        id: 'l9-river-value', level: 9, title: 'River Value K72T5', position: 'BTN', board: 'K72T5', stackDepth: 100,
        description: 'Thin Value Betting on the River.',
        tip: 'Only Bet For Value With Hands That Beat Their Calling Range.',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'TT': 'raise',
            'AKs': 'raise', 'AKo': 'raise', 'KQs': 'raise',
        }
    },
];

export const LEVEL_10_SCENARIOS = [
    {
        id: 'l10-mixed-btn', level: 10, title: 'BTN Mixed Strategy', position: 'BTN', stackDepth: 100,
        description: 'Hands That Mix Raise/fold on the Button.',
        tip: 'These Borderline Hands Use Mixed Frequencies In GTO.',
        solution: {
            'K4o': 'raise', 'K3o': 'raise', 'K2o': 'raise',
            'Q5o': 'raise', 'Q4o': 'raise', 'J6o': 'raise', 'T6o': 'raise',
            '96o': 'raise', '85o': 'raise', '74o': 'raise', '63o': 'raise', '52o': 'raise',
        }
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// MIXED STRATEGY SCENARIOS (for Mixed Strategy Trainer)
// ═══════════════════════════════════════════════════════════════════════════
export const MIXED_SCENARIOS = [
    { id: 'mix-1', title: 'BTN Open vs SB 3bet', hand: 'A5s', context: 'You Are BTN Facing A 3bet From SB', frequencies: { call: 45, raise: 55, fold: 0 } },
    { id: 'mix-2', title: 'BB Defense vs BTN', hand: 'KJo', context: 'You Are BB Facing A 2.5x Open', frequencies: { call: 60, raise: 0, fold: 40 } },
    { id: 'mix-3', title: 'SB vs BB Limp', hand: 'Q9o', context: 'You Are SB, BB Checks', frequencies: { raise: 50, fold: 10, call: 40 } }, // Limp strategy mocked
    { id: 'mix-4', title: 'UTG vs MP 3bet', hand: 'QQ', context: 'You Are UTG Facing MP 3bet', frequencies: { call: 50, raise: 50, fold: 0 } },
    { id: 'mix-5', title: 'Flop C-Bet', hand: 'Bottom Set', context: 'As PFR On Wet Board', frequencies: { check: 30, bet: 70 } },
    { id: 'mix-6', title: 'River Bluff', hand: 'Missed Draw', context: 'Triple Barrel Spot', frequencies: { check: 25, bet: 75 } },
    { id: 'mix-7', title: 'Turn Probe', hand: 'Middle Pair', context: 'OOP vs IP Checkback', frequencies: { check: 60, bet: 40 } },
    { id: 'mix-8', title: 'BTN Open', hand: 'K6o', context: 'Opening Range Boundary', frequencies: { raise: 40, fold: 60 } },
    { id: 'mix-9', title: 'BB Defense vs UTG', hand: '76s', context: 'Facing 2.2x Open', frequencies: { call: 85, raise: 15, fold: 0 } },
    { id: 'mix-10', title: 'SB Steal', hand: 'Q3s', context: 'Folded To You In SB', frequencies: { raise: 70, fold: 0, call: 30 } },
];

// ═══════════════════════════════════════════════════════════════════════════
// SPOT TRAINER SCENARIOS (Tree-based hands)
// ═══════════════════════════════════════════════════════════════════════════
export const SPOT_SCENARIOS = [
    {
        id: 'spot-1',
        title: 'BTN vs BB - Single Raised Pot',
        heroHand: 'AsKd',
        heroPos: 'BTN',
        villainPos: 'BB',
        initialPot: 5.5,
        stackDepth: 100,
        blinds: '0.5/1',
        history: ['Hero (BTN) raises to 2.5BB', 'Villain (BB) calls 1.5BB'],
        tree: {
            id: 'root',
            street: 'flop',
            board: ['Ks', '7h', '2d'],
            villainAction: 'check',
            description: 'You Flop Top Pair Top Kicker on a Dry Board. BB Checks.',
            options: [
                {
                    label: 'Check',
                    score: 40,
                    feedback: 'Too passive. You miss value and let them realize equity.',
                    next: null // End of line for bad move in this trainer
                },
                {
                    label: 'Bet 1.8BB (33%)',
                    score: 100,
                    feedback: 'Perfect. Small sizing works well on this dry texture.',
                    next: {
                        id: 'turn-1',
                        street: 'turn',
                        card: '9s',
                        villainAction: 'call',
                        pot: 9.1,
                        description: 'Villain Calls. Turn is 9s. BB Checks.',
                        options: [
                            {
                                label: 'Check',
                                score: 70,
                                feedback: 'Acceptable pot control, but you can get more value.',
                                next: null
                            },
                            {
                                label: 'Bet 6.5BB (75%)',
                                score: 100,
                                feedback: 'Great. Charging draws and worse Kx.',
                                next: {
                                    id: 'river-1',
                                    street: 'river',
                                    card: '3h',
                                    villainAction: 'call',
                                    pot: 22.1,
                                    description: 'Villain Calls. River is 3h (Brick). BB Checks.',
                                    options: [
                                        { label: 'Check', score: 50, feedback: 'Missed value. Villain has many worse Kings.' },
                                        { label: 'Bet 15BB (66%)', score: 100, feedback: 'Maximize value! Target KQ, KJ, KT.' },
                                        { label: 'All-In', score: 60, feedback: 'Too ambitious. Folds out everything you beat.' }
                                    ]
                                }
                            }
                        ]
                    }
                },
                {
                    label: 'Bet 4BB (75%)',
                    score: 75,
                    feedback: 'A bit large for this dry board. Folds out hands you want to call.',
                    next: null
                }
            ]
        }
    },
    {
        id: 'spot-2',
        title: 'SB 3-Bet Pot vs BTN',
        heroHand: 'QhQs',
        heroPos: 'SB',
        villainPos: 'BTN',
        initialPot: 20,
        stackDepth: 100,
        blinds: '0.5/1',
        history: ['Villain (BTN) raises 2.5BB', 'Hero (SB) raises to 9BB', 'Villain calls'],
        tree: {
            id: 'root',
            street: 'flop',
            board: ['Jc', '8d', '4s'],
            villainAction: null, // Hero is first to act
            description: '3-Bet Pot. You Have an Overpair on a Disconnected Board.',
            options: [
                {
                    label: 'Check',
                    score: 60,
                    feedback: 'Not terrible, but betting is standard to deny equity.',
                    next: null
                },
                {
                    label: 'Bet 6BB (30%)',
                    score: 95,
                    feedback: 'Good size. Keeps their range wide.',
                    next: {
                        id: 'turn-2',
                        street: 'turn',
                        card: 'Ac',
                        villainAction: 'call',
                        pot: 32,
                        description: 'Villain Calls. Turn is the Ace of Clubs. You Act First.',
                        options: [
                            {
                                label: 'Check',
                                score: 100,
                                feedback: 'Correct. The Ace favors the caller (BTN). Pot control mode.',
                                next: {
                                    id: 'river-2',
                                    street: 'river',
                                    card: '2d',
                                    villainAction: 'check',
                                    pot: 32,
                                    description: 'Villain Checks Back. River is 2d. You Act First.',
                                    options: [
                                        { label: 'Check', score: 90, feedback: 'Good to check-call or check-fold depending on size.' },
                                        { label: 'Bet 10BB', score: 100, feedback: 'Thin value/blocker bet. Tries to get value from JJ/TT.' }
                                    ]
                                }
                            },
                            {
                                label: 'Bet 16BB (50%)',
                                score: 40,
                                feedback: 'Dangerous. You act into the Ace which connects with their float range.'
                            }
                        ]
                    }
                },
                {
                    label: 'Bet 15BB (75%)',
                    score: 70,
                    feedback: 'Slightly too big. Isolates you against sets and better overpairs.'
                }
            ]
        }
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ALL
// ═══════════════════════════════════════════════════════════════════════════
export const ALL_SCENARIOS = [
    ...LEVEL_1_SCENARIOS, ...LEVEL_2_SCENARIOS, ...LEVEL_3_SCENARIOS,
    ...LEVEL_4_SCENARIOS, ...LEVEL_5_SCENARIOS, ...LEVEL_6_SCENARIOS,
    ...LEVEL_7_SCENARIOS, ...LEVEL_8_SCENARIOS, ...LEVEL_9_SCENARIOS, ...LEVEL_10_SCENARIOS,
];

export function getScenariosByLevel(level) {
    return ALL_SCENARIOS.filter(s => s.level === level);
}

export function getRandomScenario(level) {
    const scenarios = getScenariosByLevel(level);
    return scenarios[Math.floor(Math.random() * scenarios.length)];
}

export function getLevelConfig(level) {
    return LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
}

export default { ALL_SCENARIOS, getScenariosByLevel, getRandomScenario, getLevelConfig, RANKS, getHandName, MIXED_SCENARIOS };
