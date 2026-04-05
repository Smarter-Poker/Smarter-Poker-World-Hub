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
// SOLVER-GENERATED SCENARIOS (Levels 2-7)
// ═══════════════════════════════════════════════════════════════════════════
// Previously this section contained 17,000+ lines of stale AI-generated
// scenarios that did NOT match actual solver data. They have been replaced
// with dynamically generated scenarios built directly from solverRanges.js.
//
// See: SolverScenarioGenerator.js for the generation logic.
// ═══════════════════════════════════════════════════════════════════════════

import {
    generateAllSolverScenarios,
    getSolverScenariosForLevel,
    getRandomSolverScenario,
    pickWeightedHandFromScenario,
} from './SolverScenarioGenerator';

import {
    RFI as SOLVER_RFI,
    THREE_BET as SOLVER_3BET,
    BB_DEFENSE as SOLVER_BB_DEF,
    FOUR_BET as SOLVER_4BET,
    SQUEEZE as SOLVER_SQZ,
    COLD_CALL as SOLVER_CC,
    getHandFrequencies as solverGetFreqs,
    getRFIByDepth,
} from '../config/solverRanges';

// Generate all solver scenarios on first load (cached internally)
const _solverScenarios = generateAllSolverScenarios();

// ═══════════════════════════════════════════════════════════════════════════
// ALL SCENARIOS — Combines hand-curated L1 + solver-generated L2-7 + L10
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_SCENARIOS = [
    ...LEVEL_1_SCENARIOS,
    ...(_solverScenarios[2] || []),
    ...(_solverScenarios[3] || []),
    ...(_solverScenarios[4] || []),
    ...(_solverScenarios[5] || []),
    ...(_solverScenarios[6] || []),
    ...(_solverScenarios[7] || []),
    ...LEVEL_10_SCENARIOS,
];

/**
 * Get scenarios for a specific level.
 * Levels 2-7 come from the solver generator; levels 1, 10 from hardcoded.
 */
export function getScenariosByLevel(level) {
    if (level >= 2 && level <= 7) {
        return getSolverScenariosForLevel(level);
    }
    // Level 8-9: fall back to level 7 (squeeze) content
    if (level === 8 || level === 9) {
        return getSolverScenariosForLevel(7);
    }
    return ALL_SCENARIOS.filter(s => s.level === level);
}

/**
 * Get a random scenario for a level.
 */
export function getRandomScenario(level) {
    // Solver-generated levels
    if (level >= 2 && level <= 7) {
        return getRandomSolverScenario(level);
    }
    // Levels 8-9: fall back to level 7
    if (level === 8 || level === 9) {
        return getRandomSolverScenario(7);
    }
    const scenarios = getScenariosByLevel(level);
    if (scenarios.length === 0) return null;
    return scenarios[Math.floor(Math.random() * scenarios.length)];
}

export function getLevelConfig(level) {
    return LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLVER-ENRICHED SCENARIO BRIDGE
// For Level 1 hand-curated scenarios: enriches binary solutions with
// solver frequencies. Solver-generated scenarios (L2-7) already have
// enriched data built in.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map scenario metadata to the best-matching solver spot.
 * Returns null if no solver data matches (e.g., post-flop or solver-generated scenarios).
 */
function matchSolverSpot(scenario) {
    // Solver-generated scenarios already have enrichedSolution — skip
    if (scenario.solverGenerated) return null;

    const pos = scenario.position;
    const level = scenario.level;
    const title = (scenario.title || '').toLowerCase();

    // Level 1-2: RFI opens — use stack-depth-aware data
    if (level <= 2 && (title.includes('open') || title.includes('rfi'))) {
        const depth = scenario.stackDepth || 100;
        return getRFIByDepth(depth, pos) || SOLVER_RFI[pos] || null;
    }

    // BB Defense
    if (title.includes('bb defense') || title.includes('bb def')) {
        const vsMatch = title.match(/vs\s*(utg|mp|hj|co|btn|sb)/i);
        if (vsMatch) {
            const vsKey = `vs_${vsMatch[1].toUpperCase()}`;
            return SOLVER_BB_DEF[vsKey] || null;
        }
        if (scenario.vsPosition) {
            return SOLVER_BB_DEF[`vs_${scenario.vsPosition}`] || null;
        }
    }

    // 3-bet ranges
    if (title.includes('3-bet') || title.includes('3bet')) {
        const keys = Object.keys(SOLVER_3BET);
        // Try exact match with vsPosition
        if (scenario.vsPosition) {
            const exactKey = `${pos}_vs_${scenario.vsPosition}`;
            if (SOLVER_3BET[exactKey]) return SOLVER_3BET[exactKey];
        }
        for (const key of keys) {
            if (key.toUpperCase().startsWith(pos)) return SOLVER_3BET[key];
        }
    }

    // 4-bet ranges
    if (title.includes('4-bet') || title.includes('4bet')) {
        const keys = Object.keys(SOLVER_4BET);
        for (const key of keys) {
            if (key.toUpperCase().startsWith(pos)) return SOLVER_4BET[key];
        }
    }

    // Squeeze ranges
    if (title.includes('squeeze') || title.includes('sqz')) {
        const keys = Object.keys(SOLVER_SQZ);
        for (const key of keys) {
            if (key.toUpperCase().startsWith(pos)) return SOLVER_SQZ[key];
        }
    }

    // Cold call ranges
    if (title.includes('cold call') || title.includes('flat') || title.includes('cold-call')) {
        const keys = Object.keys(SOLVER_CC);
        if (scenario.vsPosition) {
            const exactKey = `${pos}_vs_${scenario.vsPosition}`;
            if (SOLVER_CC[exactKey]) return SOLVER_CC[exactKey];
        }
        for (const key of keys) {
            if (key.toUpperCase().startsWith(pos)) return SOLVER_CC[key];
        }
    }

    return null;
}

/**
 * Enrich a scenario's binary solution with solver frequencies.
 * Solver-generated scenarios (L2-7) already have enrichedSolution built in,
 * so this is mainly for Level 1 hand-curated scenarios.
 */
export function enrichScenarioWithFrequencies(scenario) {
    if (!scenario || !scenario.solution) return scenario;

    // Solver-generated scenarios already have full frequency data
    if (scenario.solverGenerated && scenario.enrichedSolution) {
        return scenario;
    }

    const solverSpot = matchSolverSpot(scenario);
    if (!solverSpot) return scenario;

    const enrichedSolution = {};
    for (const [hand, action] of Object.entries(scenario.solution)) {
        const solverFreqs = solverGetFreqs(solverSpot, hand);
        enrichedSolution[hand] = {
            primaryAction: action,
            raise: solverFreqs.raise,
            call: solverFreqs.call,
            fold: solverFreqs.fold,
        };
    }

    // Include hands in solver range but NOT in the binary solution
    const allSolverHands = Object.keys(solverSpot);
    for (const hand of allSolverHands) {
        if (!enrichedSolution[hand]) {
            const solverFreqs = solverGetFreqs(solverSpot, hand);
            if (solverFreqs.raise > 0.05 || solverFreqs.call > 0.05) {
                enrichedSolution[hand] = {
                    primaryAction: solverFreqs.raise > solverFreqs.fold ? 'raise' : 'fold',
                    raise: solverFreqs.raise,
                    call: solverFreqs.call,
                    fold: solverFreqs.fold,
                };
            }
        }
    }

    return {
        ...scenario,
        enrichedSolution,
        hasMixedFrequencies: true,
    };
}

/**
 * Get solver-enriched scenarios for a level.
 */
export function getEnrichedScenariosByLevel(level) {
    return getScenariosByLevel(level).map(enrichScenarioWithFrequencies);
}

/**
 * Get a random solver-enriched scenario for a level.
 */
export function getRandomEnrichedScenario(level) {
    const scenario = getRandomScenario(level);
    if (!scenario) return null;
    return enrichScenarioWithFrequencies(scenario);
}

// Re-export pickWeightedHandFromScenario for speed games
export { pickWeightedHandFromScenario };

export default {
    ALL_SCENARIOS,
    getScenariosByLevel,
    getRandomScenario,
    getLevelConfig,
    RANKS,
    getHandName,
    MIXED_SCENARIOS,
    SPOT_SCENARIOS,
    enrichScenarioWithFrequencies,
    getEnrichedScenariosByLevel,
    getRandomEnrichedScenario,
    pickWeightedHandFromScenario,
};
