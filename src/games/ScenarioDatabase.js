/* ═══════════════════════════════════════════════════════════════════════════
   📊 GTO SCENARIO DATABASE — 50+ Scenarios Across 10 Levels
   Placeholder data until PioSolver integration
   ═══════════════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════════════
// RANK DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export function getHandName(row, col) {
    if (row === col) return RANKS[row] + RANKS[col];
    if (row < col) return RANKS[row] + RANKS[col] + 's';
    return RANKS[col] + RANKS[row] + 'o';
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 1: NEURAL BOOT — UTG/MP Opening Ranges
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_1_SCENARIOS = [
    {
        id: 'l1-utg-open-100bb',
        level: 1,
        title: 'UTG RFI (100bb)',
        description: 'Select the standard Opening Range from Under the Gun at 100bb effective.',
        position: 'UTG',
        stackDepth: 100,
        action: 'open',
        difficulty: 'beginner',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'KQo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'JTs': 'raise', 'T9s': 'raise',
            '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise',
        }
    },
    {
        id: 'l1-utg-open-50bb',
        level: 1,
        title: 'UTG RFI (50bb)',
        description: 'UTG Opening Range at 50bb effective (tighter).',
        position: 'UTG',
        stackDepth: 50,
        action: 'open',
        difficulty: 'beginner',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'QJs': 'raise', 'JTs': 'raise',
        }
    },
    {
        id: 'l1-mp-open-100bb',
        level: 1,
        title: 'MP RFI (100bb)',
        description: 'Middle Position Opening Range at 100bb effective.',
        position: 'MP',
        stackDepth: 100,
        action: 'open',
        difficulty: 'beginner',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A8s': 'raise', 'A7s': 'raise', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'KQo': 'raise', 'KJo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'JTs': 'raise', 'J9s': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise', '54s': 'raise',
        }
    },
    {
        id: 'l1-utg1-open-100bb',
        level: 1,
        title: 'UTG+1 RFI (100bb)',
        description: 'UTG+1 Opening Range at 100bb—slightly wider than UTG.',
        position: 'UTG+1',
        stackDepth: 100,
        action: 'open',
        difficulty: 'beginner',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A8s': 'raise', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'KQo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'JTs': 'raise', 'J9s': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise',
        }
    },
    {
        id: 'l1-hj-open-100bb',
        level: 1,
        title: 'HJ RFI (100bb)',
        description: 'Hijack Opening Range—the widest early position.',
        position: 'HJ',
        stackDepth: 100,
        action: 'open',
        difficulty: 'beginner',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise',
            'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'QJo': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise', 'JTo': 'raise',
            'T9s': 'raise', 'T8s': 'raise', '98s': 'raise', '97s': 'raise',
            '87s': 'raise', '86s': 'raise', '76s': 'raise', '75s': 'raise',
            '65s': 'raise', '64s': 'raise', '54s': 'raise', '53s': 'raise',
        }
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 2: POSITION PULSE — CO/BTN/SB Opening
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_2_SCENARIOS = [
    {
        id: 'l2-co-open-100bb',
        level: 2,
        title: 'CO RFI (100bb)',
        description: 'Cutoff Opening Range—begin opening very wide.',
        position: 'CO',
        stackDepth: 100,
        action: 'open',
        difficulty: 'beginner',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise', '33': 'raise', '22': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise', 'A8o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'K7s': 'raise', 'K6s': 'raise', 'K5s': 'raise',
            'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise', 'K9o': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'Q8s': 'raise', 'Q7s': 'raise',
            'QJo': 'raise', 'QTo': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise', 'J7s': 'raise', 'JTo': 'raise', 'J9o': 'raise',
            'T9s': 'raise', 'T8s': 'raise', 'T7s': 'raise', 'T9o': 'raise',
            '98s': 'raise', '97s': 'raise', '96s': 'raise', '98o': 'raise',
            '87s': 'raise', '86s': 'raise', '85s': 'raise', '76s': 'raise', '75s': 'raise', '74s': 'raise',
            '65s': 'raise', '64s': 'raise', '54s': 'raise', '53s': 'raise', '43s': 'raise',
        }
    },
    {
        id: 'l2-btn-open-100bb',
        level: 2,
        title: 'BTN RFI (100bb)',
        description: 'Button Opening Range—the widest opener.',
        position: 'BTN',
        stackDepth: 100,
        action: 'open',
        difficulty: 'beginner',
        solution: {
            // Very wide - almost everything with potential
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise', '33': 'raise', '22': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise', 'A8o': 'raise', 'A7o': 'raise', 'A6o': 'raise', 'A5o': 'raise', 'A4o': 'raise', 'A3o': 'raise', 'A2o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'K7s': 'raise', 'K6s': 'raise', 'K5s': 'raise', 'K4s': 'raise', 'K3s': 'raise', 'K2s': 'raise',
            'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise', 'K9o': 'raise', 'K8o': 'raise', 'K7o': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'Q8s': 'raise', 'Q7s': 'raise', 'Q6s': 'raise', 'Q5s': 'raise', 'Q4s': 'raise', 'Q3s': 'raise', 'Q2s': 'raise',
            'QJo': 'raise', 'QTo': 'raise', 'Q9o': 'raise', 'Q8o': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise', 'J7s': 'raise', 'J6s': 'raise', 'J5s': 'raise',
            'JTo': 'raise', 'J9o': 'raise', 'J8o': 'raise',
            'T9s': 'raise', 'T8s': 'raise', 'T7s': 'raise', 'T6s': 'raise',
            'T9o': 'raise', 'T8o': 'raise',
            '98s': 'raise', '97s': 'raise', '96s': 'raise', '95s': 'raise',
            '98o': 'raise', '97o': 'raise',
            '87s': 'raise', '86s': 'raise', '85s': 'raise', '84s': 'raise',
            '87o': 'raise', '86o': 'raise',
            '76s': 'raise', '75s': 'raise', '74s': 'raise', '73s': 'raise',
            '76o': 'raise',
            '65s': 'raise', '64s': 'raise', '63s': 'raise', '62s': 'raise',
            '54s': 'raise', '53s': 'raise', '52s': 'raise',
            '43s': 'raise', '42s': 'raise', '32s': 'raise',
        }
    },
    {
        id: 'l2-sb-open-100bb',
        level: 2,
        title: 'SB Open vs BB (100bb)',
        description: 'Small Blind Opening (steal) Range when folded to you.',
        position: 'SB',
        stackDepth: 100,
        action: 'open',
        difficulty: 'intermediate',
        solution: {
            // Very wide SB steals
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise', '33': 'raise', '22': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise', 'A8o': 'raise', 'A7o': 'raise', 'A6o': 'raise', 'A5o': 'raise', 'A4o': 'raise', 'A3o': 'raise', 'A2o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'K7s': 'raise', 'K6s': 'raise', 'K5s': 'raise', 'K4s': 'raise', 'K3s': 'raise', 'K2s': 'raise',
            'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise', 'K9o': 'raise', 'K8o': 'raise', 'K7o': 'raise', 'K6o': 'raise', 'K5o': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'Q8s': 'raise', 'Q7s': 'raise', 'Q6s': 'raise', 'Q5s': 'raise', 'Q4s': 'raise', 'Q3s': 'raise', 'Q2s': 'raise',
            'QJo': 'raise', 'QTo': 'raise', 'Q9o': 'raise', 'Q8o': 'raise', 'Q7o': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise', 'J7s': 'raise', 'J6s': 'raise', 'J5s': 'raise', 'J4s': 'raise',
            'JTo': 'raise', 'J9o': 'raise', 'J8o': 'raise', 'J7o': 'raise',
            'T9s': 'raise', 'T8s': 'raise', 'T7s': 'raise', 'T6s': 'raise', 'T5s': 'raise',
            'T9o': 'raise', 'T8o': 'raise', 'T7o': 'raise',
            '98s': 'raise', '97s': 'raise', '96s': 'raise', '95s': 'raise',
            '98o': 'raise', '97o': 'raise',
            '87s': 'raise', '86s': 'raise', '85s': 'raise', '84s': 'raise',
            '87o': 'raise', '86o': 'raise',
            '76s': 'raise', '75s': 'raise', '74s': 'raise',
            '76o': 'raise', '75o': 'raise',
            '65s': 'raise', '64s': 'raise', '63s': 'raise',
            '65o': 'raise',
            '54s': 'raise', '53s': 'raise', '52s': 'raise',
            '43s': 'raise', '42s': 'raise',
            '32s': 'raise',
        }
    },
    {
        id: 'l2-btn-open-30bb',
        level: 2,
        title: 'BTN RFI (30bb MTT)',
        description: 'Button Opening in a tournament with 30bb—tighter.',
        position: 'BTN',
        stackDepth: 30,
        action: 'open',
        difficulty: 'intermediate',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise', '44': 'raise', '33': 'raise', '22': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise', 'A8o': 'raise', 'A7o': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise', 'K7s': 'raise', 'K6s': 'raise',
            'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise', 'K9o': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'Q8s': 'raise', 'Q7s': 'raise',
            'QJo': 'raise', 'QTo': 'raise', 'Q9o': 'raise',
            'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise', 'J7s': 'raise',
            'JTo': 'raise', 'J9o': 'raise',
            'T9s': 'raise', 'T8s': 'raise', 'T7s': 'raise',
            'T9o': 'raise',
            '98s': 'raise', '97s': 'raise', '96s': 'raise',
            '87s': 'raise', '86s': 'raise',
            '76s': 'raise', '75s': 'raise',
            '65s': 'raise', '64s': 'raise',
            '54s': 'raise', '53s': 'raise',
            '43s': 'raise',
        }
    },
    {
        id: 'l2-co-open-20bb',
        level: 2,
        title: 'CO RFI (20bb Push/Fold)',
        description: 'Cutoff with 20bb—all-in or fold territory.',
        position: 'CO',
        stackDepth: 20,
        action: 'open',
        difficulty: 'intermediate',
        solution: {
            'AA': 'all_in', 'KK': 'all_in', 'QQ': 'all_in', 'JJ': 'all_in', 'TT': 'all_in',
            '99': 'all_in', '88': 'all_in', '77': 'all_in', '66': 'all_in', '55': 'all_in', '44': 'all_in', '33': 'all_in', '22': 'all_in',
            'AKs': 'all_in', 'AQs': 'all_in', 'AJs': 'all_in', 'ATs': 'all_in', 'A9s': 'all_in',
            'A8s': 'all_in', 'A7s': 'all_in', 'A6s': 'all_in', 'A5s': 'all_in', 'A4s': 'all_in', 'A3s': 'all_in', 'A2s': 'all_in',
            'AKo': 'all_in', 'AQo': 'all_in', 'AJo': 'all_in', 'ATo': 'all_in', 'A9o': 'all_in', 'A8o': 'all_in', 'A7o': 'all_in',
            'KQs': 'all_in', 'KJs': 'all_in', 'KTs': 'all_in', 'K9s': 'all_in', 'K8s': 'all_in',
            'KQo': 'all_in', 'KJo': 'all_in', 'KTo': 'all_in',
            'QJs': 'all_in', 'QTs': 'all_in', 'Q9s': 'all_in',
            'QJo': 'all_in', 'QTo': 'all_in',
            'JTs': 'all_in', 'J9s': 'all_in',
            'JTo': 'all_in',
            'T9s': 'all_in', '98s': 'all_in', '87s': 'all_in', '76s': 'all_in', '65s': 'all_in', '54s': 'all_in',
        }
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 3: DEFENSE MATRIX — BB Defense vs All Positions
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_3_SCENARIOS = [
    {
        id: 'l3-bb-vs-btn-100bb',
        level: 3,
        title: 'BB Defense vs BTN Open (100bb)',
        description: 'Big Blind calling range vs Button 2.5x open.',
        position: 'BB',
        vsPosition: 'BTN',
        stackDepth: 100,
        action: 'defend',
        difficulty: 'intermediate',
        solution: {
            // Wide defense vs late position
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'call', '88': 'call', '77': 'call', '66': 'call', '55': 'call', '44': 'call', '33': 'call', '22': 'call',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'call', 'ATs': 'call', 'A9s': 'call',
            'A8s': 'call', 'A7s': 'call', 'A6s': 'call', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'call', 'A2s': 'call',
            'AKo': 'raise', 'AQo': 'call', 'AJo': 'call', 'ATo': 'call', 'A9o': 'call', 'A8o': 'call', 'A7o': 'call',
            'KQs': 'raise', 'KJs': 'call', 'KTs': 'call', 'K9s': 'call', 'K8s': 'call', 'K7s': 'call', 'K6s': 'call', 'K5s': 'call', 'K4s': 'call', 'K3s': 'call', 'K2s': 'call',
            'KQo': 'call', 'KJo': 'call', 'KTo': 'call', 'K9o': 'call', 'K8o': 'call',
            'QJs': 'call', 'QTs': 'call', 'Q9s': 'call', 'Q8s': 'call', 'Q7s': 'call', 'Q6s': 'call', 'Q5s': 'call',
            'QJo': 'call', 'QTo': 'call', 'Q9o': 'call',
            'JTs': 'call', 'J9s': 'call', 'J8s': 'call', 'J7s': 'call', 'J6s': 'call',
            'JTo': 'call', 'J9o': 'call', 'J8o': 'call',
            'T9s': 'call', 'T8s': 'call', 'T7s': 'call', 'T6s': 'call',
            'T9o': 'call', 'T8o': 'call',
            '98s': 'call', '97s': 'call', '96s': 'call', '95s': 'call',
            '98o': 'call', '97o': 'call',
            '87s': 'call', '86s': 'call', '85s': 'call',
            '87o': 'call', '86o': 'call',
            '76s': 'call', '75s': 'call', '74s': 'call',
            '76o': 'call',
            '65s': 'call', '64s': 'call', '63s': 'call',
            '54s': 'call', '53s': 'call',
            '43s': 'call', '42s': 'call',
            '32s': 'call',
        }
    },
    {
        id: 'l3-bb-vs-utg-100bb',
        level: 3,
        title: 'BB Defense vs UTG Open (100bb)',
        description: 'Big Blind calling range vs UTG 2.5x open—much tighter.',
        position: 'BB',
        vsPosition: 'UTG',
        stackDepth: 100,
        action: 'defend',
        difficulty: 'intermediate',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'call', 'TT': 'call',
            '99': 'call', '88': 'call', '77': 'call', '66': 'call', '55': 'call', '44': 'call',
            'AKs': 'raise', 'AQs': 'call', 'AJs': 'call', 'ATs': 'call', 'A9s': 'call',
            'AKo': 'call', 'AQo': 'call',
            'KQs': 'call', 'KJs': 'call', 'KTs': 'call',
            'QJs': 'call', 'QTs': 'call',
            'JTs': 'call', 'J9s': 'call',
            'T9s': 'call', '98s': 'call', '87s': 'call', '76s': 'call', '65s': 'call', '54s': 'call',
        }
    },
    {
        id: 'l3-bb-vs-sb-100bb',
        level: 3,
        title: 'BB Defense vs SB Open (100bb)',
        description: 'Big Blind defense vs SB 3x open—very wide.',
        position: 'BB',
        vsPosition: 'SB',
        stackDepth: 100,
        action: 'defend',
        difficulty: 'intermediate',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'call', '88': 'call', '77': 'call', '66': 'call', '55': 'call', '44': 'call', '33': 'call', '22': 'call',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'call', 'A9s': 'call',
            'A8s': 'call', 'A7s': 'call', 'A6s': 'call', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'call', 'A2s': 'call',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'call', 'ATo': 'call', 'A9o': 'call', 'A8o': 'call', 'A7o': 'call', 'A6o': 'call', 'A5o': 'call', 'A4o': 'call', 'A3o': 'call', 'A2o': 'call',
            'KQs': 'raise', 'KJs': 'call', 'KTs': 'call', 'K9s': 'call', 'K8s': 'call', 'K7s': 'call', 'K6s': 'call', 'K5s': 'call', 'K4s': 'call', 'K3s': 'call', 'K2s': 'call',
            'KQo': 'call', 'KJo': 'call', 'KTo': 'call', 'K9o': 'call', 'K8o': 'call', 'K7o': 'call', 'K6o': 'call', 'K5o': 'call',
            'QJs': 'call', 'QTs': 'call', 'Q9s': 'call', 'Q8s': 'call', 'Q7s': 'call', 'Q6s': 'call', 'Q5s': 'call', 'Q4s': 'call', 'Q3s': 'call', 'Q2s': 'call',
            'QJo': 'call', 'QTo': 'call', 'Q9o': 'call', 'Q8o': 'call', 'Q7o': 'call', 'Q6o': 'call',
            'JTs': 'call', 'J9s': 'call', 'J8s': 'call', 'J7s': 'call', 'J6s': 'call', 'J5s': 'call', 'J4s': 'call',
            'JTo': 'call', 'J9o': 'call', 'J8o': 'call', 'J7o': 'call', 'J6o': 'call',
            'T9s': 'call', 'T8s': 'call', 'T7s': 'call', 'T6s': 'call', 'T5s': 'call',
            'T9o': 'call', 'T8o': 'call', 'T7o': 'call', 'T6o': 'call',
            '98s': 'call', '97s': 'call', '96s': 'call', '95s': 'call', '94s': 'call',
            '98o': 'call', '97o': 'call', '96o': 'call',
            '87s': 'call', '86s': 'call', '85s': 'call', '84s': 'call', '83s': 'call',
            '87o': 'call', '86o': 'call', '85o': 'call',
            '76s': 'call', '75s': 'call', '74s': 'call', '73s': 'call',
            '76o': 'call', '75o': 'call', '74o': 'call',
            '65s': 'call', '64s': 'call', '63s': 'call', '62s': 'call',
            '65o': 'call', '64o': 'call',
            '54s': 'call', '53s': 'call', '52s': 'call',
            '54o': 'call', '53o': 'call',
            '43s': 'call', '42s': 'call',
            '43o': 'call',
            '32s': 'call',
        }
    },
    {
        id: 'l3-bb-vs-co-100bb',
        level: 3,
        title: 'BB Defense vs CO Open (100bb)',
        description: 'Big Blind defense vs Cutoff 2.5x open.',
        position: 'BB',
        vsPosition: 'CO',
        stackDepth: 100,
        action: 'defend',
        difficulty: 'intermediate',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'call',
            '99': 'call', '88': 'call', '77': 'call', '66': 'call', '55': 'call', '44': 'call', '33': 'call', '22': 'call',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'call', 'ATs': 'call', 'A9s': 'call',
            'A8s': 'call', 'A7s': 'call', 'A6s': 'call', 'A5s': 'raise', 'A4s': 'raise', 'A3s': 'call', 'A2s': 'call',
            'AKo': 'raise', 'AQo': 'call', 'AJo': 'call', 'ATo': 'call', 'A9o': 'call', 'A8o': 'call',
            'KQs': 'raise', 'KJs': 'call', 'KTs': 'call', 'K9s': 'call', 'K8s': 'call', 'K7s': 'call', 'K6s': 'call', 'K5s': 'call',
            'KQo': 'call', 'KJo': 'call', 'KTo': 'call', 'K9o': 'call',
            'QJs': 'call', 'QTs': 'call', 'Q9s': 'call', 'Q8s': 'call', 'Q7s': 'call',
            'QJo': 'call', 'QTo': 'call', 'Q9o': 'call',
            'JTs': 'call', 'J9s': 'call', 'J8s': 'call', 'J7s': 'call',
            'JTo': 'call', 'J9o': 'call',
            'T9s': 'call', 'T8s': 'call', 'T7s': 'call',
            'T9o': 'call', 'T8o': 'call',
            '98s': 'call', '97s': 'call', '96s': 'call',
            '98o': 'call',
            '87s': 'call', '86s': 'call', '85s': 'call',
            '87o': 'call',
            '76s': 'call', '75s': 'call',
            '65s': 'call', '64s': 'call',
            '54s': 'call', '53s': 'call',
            '43s': 'call',
        }
    },
    {
        id: 'l3-sb-defend-vs-btn-100bb',
        level: 3,
        title: 'SB 3-Bet vs BTN Open (100bb)',
        description: 'Small Blind 3-bet range vs Button open.',
        position: 'SB',
        vsPosition: 'BTN',
        stackDepth: 100,
        action: '3bet',
        difficulty: 'intermediate',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
            'A5s': 'raise', 'A4s': 'raise', 'A3s': 'raise', 'A2s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise',
            'KQo': 'raise', 'KJo': 'raise',
            'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise',
            'JTs': 'raise', 'J9s': 'raise',
            'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise', '65s': 'raise',
        }
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// LEVELS 4-10: PLACEHOLDER DATA (Will expand with PioSolver)
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_4_SCENARIOS = [
    {
        id: 'l4-btn-3bet-vs-utg',
        level: 4,
        title: 'BTN 3-Bet vs UTG Open',
        description: 'Button 3-bet range vs UTG 2.5x open.',
        position: 'BTN',
        vsPosition: 'UTG',
        stackDepth: 100,
        action: '3bet',
        difficulty: 'advanced',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise',
            'A5s': 'raise', 'A4s': 'raise',
            'AKo': 'raise', 'AQo': 'raise',
            'KQs': 'raise',
        }
    },
    {
        id: 'l4-co-3bet-vs-mp',
        level: 4,
        title: 'CO 3-Bet vs MP Open',
        description: 'Cutoff 3-bet range vs Middle Position open.',
        position: 'CO',
        vsPosition: 'MP',
        stackDepth: 100,
        action: '3bet',
        difficulty: 'advanced',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'A5s': 'raise', 'A4s': 'raise',
            'AKo': 'raise', 'AQo': 'raise',
            'KQs': 'raise', 'KJs': 'raise',
            'QJs': 'raise',
        }
    },
];

export const LEVEL_5_SCENARIOS = [
    {
        id: 'l5-btn-flat-vs-utg',
        level: 5,
        title: 'BTN Flat vs UTG Open',
        description: 'Button flatting range vs UTG 2.5x (trapping hands).',
        position: 'BTN',
        vsPosition: 'UTG',
        stackDepth: 100,
        action: 'call',
        difficulty: 'advanced',
        solution: {
            '99': 'call', '88': 'call', '77': 'call', '66': 'call', '55': 'call', '44': 'call', '33': 'call', '22': 'call',
            'AQs': 'call', 'AJs': 'call', 'ATs': 'call', 'A9s': 'call',
            'KQs': 'call', 'KJs': 'call', 'KTs': 'call',
            'QJs': 'call', 'QTs': 'call',
            'JTs': 'call', 'J9s': 'call',
            'T9s': 'call', 'T8s': 'call',
            '98s': 'call', '87s': 'call', '76s': 'call', '65s': 'call', '54s': 'call',
        }
    },
];

export const LEVEL_6_SCENARIOS = [
    {
        id: 'l6-4bet-vs-btn-3bet',
        level: 6,
        title: 'CO 4-Bet vs BTN 3-Bet',
        description: 'Cutoff 4-bet range vs Button 3-bet.',
        position: 'CO',
        vsPosition: 'BTN',
        stackDepth: 100,
        action: '4bet',
        difficulty: 'expert',
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
        id: 'l7-cbet-dry-flop',
        level: 7,
        title: 'C-Bet on Dry Flop',
        description: 'C-bet frequency on K72 rainbow as PFR.',
        position: 'BTN',
        board: 'K72r',
        stackDepth: 100,
        action: 'cbet',
        difficulty: 'expert',
        solution: {
            // High frequency c-bet range
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            'AKs': 'raise', 'AKo': 'raise', 'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise',
            'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'QJs': 'raise', 'JTs': 'raise',
        }
    },
];

export const LEVEL_8_SCENARIOS = [
    {
        id: 'l8-turn-barrel',
        level: 8,
        title: 'Turn Barrel Decision',
        description: 'Which hands barrel the turn on K72-T?',
        position: 'BTN',
        board: 'K72T',
        stackDepth: 100,
        action: 'barrel',
        difficulty: 'expert',
        solution: {
            'AA': 'raise', 'KK': 'raise', 'TT': 'raise',
            'AKs': 'raise', 'AKo': 'raise', 'KQs': 'raise', 'KTs': 'raise',
            'AQs': 'raise', 'AJs': 'raise',
        }
    },
];

export const LEVEL_9_SCENARIOS = [
    {
        id: 'l9-river-value',
        level: 9,
        title: 'River Value Betting',
        description: 'Which hands bet river for value on K72T5?',
        position: 'BTN',
        board: 'K72T5',
        stackDepth: 100,
        action: 'value',
        difficulty: 'master',
        solution: {
            'AA': 'raise', 'KK': 'raise',
            'AKs': 'raise', 'AKo': 'raise', 'KQs': 'raise',
        }
    },
];

export const LEVEL_10_SCENARIOS = [
    {
        id: 'l10-mixed-strategy',
        level: 10,
        title: 'Mixed Strategy: BTN Open',
        description: 'Which hands mix open/fold on the Button?',
        position: 'BTN',
        stackDepth: 100,
        action: 'mixed',
        difficulty: 'master',
        solution: {
            // These hands have mixed frequencies
            'K4o': 'raise', 'K3o': 'raise', 'K2o': 'raise',
            'Q5o': 'raise', 'Q4o': 'raise',
            'J6o': 'raise',
            'T6o': 'raise',
            '96o': 'raise',
            '85o': 'raise',
            '74o': 'raise',
            '63o': 'raise',
            '52o': 'raise',
        }
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// MASTER EXPORT — All Scenarios by Level
// ═══════════════════════════════════════════════════════════════════════════
export const ALL_SCENARIOS = [
    ...LEVEL_1_SCENARIOS,
    ...LEVEL_2_SCENARIOS,
    ...LEVEL_3_SCENARIOS,
    ...LEVEL_4_SCENARIOS,
    ...LEVEL_5_SCENARIOS,
    ...LEVEL_6_SCENARIOS,
    ...LEVEL_7_SCENARIOS,
    ...LEVEL_8_SCENARIOS,
    ...LEVEL_9_SCENARIOS,
    ...LEVEL_10_SCENARIOS,
];

export function getScenariosByLevel(level) {
    return ALL_SCENARIOS.filter(s => s.level === level);
}

export function getRandomScenario(level) {
    const levelScenarios = getScenariosByLevel(level);
    return levelScenarios[Math.floor(Math.random() * levelScenarios.length)];
}

export function getTotalScenarioCount() {
    return ALL_SCENARIOS.length;
}

export default {
    ALL_SCENARIOS,
    RANKS,
    getHandName,
    getScenariosByLevel,
    getRandomScenario,
    getTotalScenarioCount,
};
