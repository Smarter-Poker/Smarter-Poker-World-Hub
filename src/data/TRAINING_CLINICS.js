/**
 * 🏥 TRAINING CLINICS — 28 Specialized Leak-Fixing Drills
 * ═══════════════════════════════════════════════════════════════════════════
 * From the GTO Training Engine Blueprint:
 * - Each clinic targets a specific leak category
 * - 10-level progressive difficulty
 * - 2.5x XP multiplier for remediation mode
 * - Awards badges on completion
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Clinic categories map to leak detection categories
export const LEAK_CATEGORY_MAP = {
    FOLD_TO_AGGRESSION: 'clinic-01',
    CBET_DEFENSE: 'clinic-05',
    THIN_VALUE: 'clinic-02',
    BLUFF_FREQUENCY: 'clinic-03',
    POSITION_AWARENESS: 'clinic-04',
    ICM_AWARENESS: 'clinic-13',
    TIMING_TELLS: 'clinic-06',
    TILT_PLAY: 'clinic-07'
};

// Full 28 Training Clinics from the Blueprint
export const TRAINING_CLINICS = [
    // ═══════════════════════════════════════════════════════════════════════
    // DEFENSE CLINICS (1-4)
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'clinic-01',
        name: 'The Iron Wall',
        title: 'Defending the Big Blind',
        subtitle: 'Clinic #1: Defense',
        category: 'DEFENSE',
        targetLeak: 'FOLD_TO_AGGRESSION',
        description: 'Stop folding bottom-of-range winners against aggressive opponents',
        icon: '🛡️',
        badge: 'Iron Wall Master',
        xpMultiplier: 1.5,
        laws: [8, 9], // Stack Awareness, Bully Archetype
        difficulty: 3,
        levels: 10,
        passThreshold: 85,
        villainArchetype: 'BULLY',
        visualEffects: ['VILLAIN_SCALE_1.4x', 'INTIMIDATION_GLOW'],
        startingState: {
            heroCards: ['Ks', 'Qc'],
            villainCards: ['??', '??'],
            board: [],
            pot: 5.5,
            dealerBtn: 'villain',
            heroStack: 40,
            villainStack: 40
        },
        questions: [
            {
                id: 'q1',
                street: 'preflop',
                villainAction: 'Raises to 2.5BB',
                correctAction: 'call',
                explanation: 'With KQo, you are getting the right price to call and realize equity against a wide button range.'
            }
        ]
    },
    {
        id: 'clinic-02',
        name: 'The Value Extractor',
        title: 'Thin Value Betting',
        subtitle: 'Clinic #2: Sizing',
        category: 'SIZING',
        targetLeak: 'THIN_VALUE',
        description: 'Maximize EV with strong holdings through precise bet sizing',
        icon: '💎',
        badge: 'Value Assassin',
        xpMultiplier: 1.0,
        laws: [6], // Physical Slider
        difficulty: 4,
        levels: 10,
        passThreshold: 85,
        requiresSlider: true,
        visualEffects: ['SIZING_GLOW', 'EV_METER'],
        startingState: {
            heroCards: ['As', 'Jh'],
            villainCards: ['??', '??'],
            board: ['Ah', '9c', '4d', '2s', '7h'],
            pot: 45,
            dealerBtn: 'hero',
            heroStack: 60,
            villainStack: 55
        },
        questions: [
            {
                id: 'q1',
                street: 'river',
                villainAction: 'Checks',
                correctAction: 'raise',
                explanation: 'With top pair on a dry board, you should bet for thin value. Villain will call with worse Ax hands.'
            }
        ]
    },
    {
        id: 'clinic-03',
        name: 'The Indifference',
        title: 'Minimum Defense Frequency',
        subtitle: 'Clinic #3: Defense Math',
        category: 'DEFENSE',
        targetLeak: 'BLUFF_FREQUENCY',
        description: 'Master Minimum Defense Frequency (MDF) to prevent profitable villain bluffs',
        icon: '⚖️',
        badge: 'MDF Master',
        xpMultiplier: 1.0,
        laws: [9], // River Pressure
        difficulty: 4,
        levels: 10,
        passThreshold: 85,
        focusStreet: 'RIVER',
        visualEffects: ['LARGE_POT_1.5x', 'MATH_OVERLAY'],
        startingState: {
            heroCards: ['Kd', 'Qd'],
            villainCards: ['??', '??'],
            board: ['Ac', 'Jh', '7s', '3c', '2d'],
            pot: 80,
            dealerBtn: 'villain',
            heroStack: 45,
            villainStack: 50
        },
        questions: [
            {
                id: 'q1',
                street: 'river',
                villainAction: 'Bets 60BB (Pot-sized)',
                correctAction: 'call',
                explanation: 'Villain is betting pot, so you need to defend 50% of your range (MDF). KQ high is a bluff-catcher that should call.'
            }
        ]
    },
    {
        id: 'clinic-04',
        name: 'The Positional Blitz',
        title: 'Position Awareness Drill',
        subtitle: 'Clinic #4: Seat Mastery',
        category: 'POSITION',
        targetLeak: 'POSITION_AWARENESS',
        description: 'Train seat-relative range mastery through rapid-fire drills',
        icon: '🔄',
        badge: 'Position Master',
        xpMultiplier: 1.0,
        laws: [2, 3], // Table Re-orient, Button Motion
        difficulty: 3,
        levels: 10,
        passThreshold: 85,
        timeLimit: 2, // Blitz mode: 2 seconds
        visualEffects: ['BUTTON_ROTATION', 'SEAT_HIGHLIGHT'],
        startingState: {
            heroCards: ['Ts', '9s'],
            villainCards: ['??', '??'],
            board: [],
            pot: 3.5,
            dealerBtn: 'hero',
            heroStack: 40,
            villainStack: 40
        },
        questions: [
            {
                id: 'q1',
                street: 'preflop',
                villainAction: 'Raises to 3BB from UTG',
                correctAction: 'fold',
                explanation: 'T9s is too weak to call a UTG raise when out of position. Fold and wait for a better spot.'
            }
        ]
    },

    // ═══════════════════════════════════════════════════════════════════════
    // STRATEGY CLINICS (5-8)
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'clinic-05',
        name: 'The C-Bet Clinic',
        subtitle: 'Clinic #5: Strategic Logic',
        category: 'STRATEGY',
        targetLeak: 'CBET_DEFENSE',
        description: 'Master continuation betting logic by identifying Range vs Nut advantage',
        icon: '💥',
        badge: 'C-Bet Pro',
        xpMultiplier: 1.0,
        laws: [10], // Concept Mastery
        difficulty: 3,
        levels: 10,
        passThreshold: 85,
        boardTypes: ['HIGH_DRY', 'HIGH_WET', 'MIDDLE', 'LOW_CONNECTED'],
        visualEffects: ['BOARD_ANALYZER', 'RANGE_ADVANTAGE_GLOW']
    },
    {
        id: 'clinic-06',
        name: 'The Metronome',
        subtitle: 'Clinic #6: Timing Discipline',
        category: 'PSYCHOLOGY',
        targetLeak: 'TIMING_TELLS',
        description: 'Eliminate timing tells by enforcing consistent action-rhythm',
        icon: '⏱️',
        badge: 'Rhythm Master',
        xpMultiplier: 1.0,
        laws: [9], // Visual Rhythm
        difficulty: 2,
        levels: 10,
        passThreshold: 85,
        detectsSnapActions: true,
        detectsTanking: true,
        visualEffects: ['SAFE_ZONE_PULSE', 'RHYTHM_GLOW']
    },
    {
        id: 'clinic-07',
        name: 'The Cooler Cage',
        subtitle: 'Clinic #7: Tilt Resistance',
        category: 'PSYCHOLOGY',
        targetLeak: 'TILT_PLAY',
        description: 'Test emotional discipline through deliberate bad-beat sequences',
        icon: '🧊',
        badge: 'Ice Master',
        xpMultiplier: 2.0,
        laws: [9], // Immersion
        difficulty: 5,
        levels: 10,
        passThreshold: 85,
        inducedBadBeats: true,
        testHandAfterCooler: true,
        visualEffects: ['SOUL_CRUSH', 'TILT_DETECTOR']
    },
    {
        id: 'clinic-08',
        name: 'The Reviewer',
        subtitle: 'Clinic #8: Result Bias',
        category: 'PSYCHOLOGY',
        targetLeak: 'RESULT_BIAS',
        description: 'Separate decision quality from outcome through self-assessment',
        icon: '🔍',
        badge: 'Clear Thinker',
        xpMultiplier: 1.0,
        laws: [10], // Feedback
        difficulty: 3,
        levels: 10,
        passThreshold: 85,
        requiresSelfGrade: true,
        visualEffects: ['GRADE_CARD', 'REVEAL_TRUTH']
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ADVANCED CLINICS (9-12)
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'clinic-09',
        name: 'Context Switcher',
        subtitle: 'Clinic #9: Agility',
        category: 'ADVANCED',
        targetLeak: 'CONTEXT_ADAPTATION',
        description: 'Adapt to switching table types and stack depths mid-session',
        icon: '⚡',
        badge: 'Agility Master',
        xpMultiplier: 1.5,
        laws: [2], // Instant Orientation
        difficulty: 5,
        levels: 10,
        passThreshold: 100, // Fail-on-First
        switchesTableTypes: true,
        tableTypes: ['HU', '6MAX', 'FULL_RING'],
        visualEffects: ['TABLE_MORPH', 'STACK_SHIFT']
    },
    {
        id: 'clinic-10',
        name: 'Exploitative Deviation',
        subtitle: 'Clinic #10: Exploit',
        category: 'ADVANCED',
        targetLeak: 'MISSED_EXPLOIT',
        description: 'Punish non-GTO opponents by identifying villain leaks',
        icon: '🎣',
        badge: 'Exploit Hunter',
        xpMultiplier: 1.5,
        laws: [9], // Villain Immersion
        difficulty: 5,
        levels: 10,
        passThreshold: 85,
        villainArchetypes: ['NIT', 'STATION', 'LAG', 'PASSIVE'],
        rewardsMaxEVAdjustment: true,
        visualEffects: ['VILLAIN_PROFILE', 'LEAK_HIGHLIGHT']
    },
    {
        id: 'clinic-11',
        name: 'Capped Range Defense',
        subtitle: 'Clinic #11: Capped',
        category: 'ADVANCED',
        targetLeak: 'CAPPED_FOLDING',
        description: 'Stop folding when your range is condensed due to pre-flop calling',
        icon: '📦',
        badge: 'Range Defender',
        xpMultiplier: 1.0,
        laws: [9], // Danger Immersion
        difficulty: 4,
        levels: 10,
        passThreshold: 85,
        targetDefendPercent: 35,
        visualEffects: ['RED_BORDER_DANGER', 'CAPPED_WARNING']
    },
    {
        id: 'clinic-12',
        name: 'Asymmetric Stack',
        subtitle: 'Clinic #12: Stack Math',
        category: 'ADVANCED',
        targetLeak: 'EFFECTIVE_STACK',
        description: 'Master effective stack math and price-commitment thresholds',
        icon: '📐',
        badge: 'Stack Mathematician',
        xpMultiplier: 1.0,
        laws: [8], // Effective Stack Math
        difficulty: 4,
        levels: 10,
        passThreshold: 85,
        autoCallThreshold: 15, // ≤15BB
        visualEffects: ['EFFECTIVE_STACK_GLOW', 'COMMIT_WARNING']
    },

    // ═══════════════════════════════════════════════════════════════════════
    // MTT CLINICS (13-18)
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'clinic-13',
        name: 'Tournament World',
        title: 'ICM Fundamentals',
        subtitle: 'Clinic #13: MTT',
        category: 'MTT',
        targetLeak: 'ICM_AWARENESS',
        description: 'Comprehensive 150-level tournament engine: Push/Fold, ICM, ChipEV',
        icon: '🏆',
        badge: 'Tournament Master',
        xpMultiplier: 1.5,
        laws: [3, 8, 9], // Button Rotation, Adaptive Difficulty, Environmental Pulse
        difficulty: 4,
        levels: 150,
        passThreshold: 85,
        modes: ['PUSH_FOLD', 'ICM', 'CHIP_EV'],
        visualEffects: ['MODE_SPECIFIC_GLOW', 'BUTTON_ROTATION'],
        startingState: {
            heroCards: ['Ah', 'Ks'],
            villainCards: ['??', '??'],
            board: [],
            pot: 4.5,
            dealerBtn: 'villain',
            heroStack: 15,
            villainStack: 25
        },
        questions: [
            {
                id: 'q1',
                street: 'preflop',
                villainAction: 'Shoves All-In (25BB)',
                correctAction: 'call',
                explanation: 'With AKs and 15BB, you are getting the right ICM-adjusted odds to call a shove. AKs has ~45% equity against a wide pushing range.'
            }
        ]
    },
    {
        id: 'clinic-14',
        name: 'PKO Bounty Engine',
        subtitle: 'Clinic #14: PKO',
        category: 'MTT',
        targetLeak: 'BOUNTY_MATH',
        description: 'Adjust calling ranges based on bounty chip equivalents',
        icon: '💰',
        badge: 'Bounty Hunter',
        xpMultiplier: 1.5,
        laws: [8, 9], // Bounty Math, Bounty Visuals
        difficulty: 4,
        levels: 10,
        passThreshold: 85,
        convertsBountyToChips: true,
        visualEffects: ['BOUNTY_CHIP_GLOW', 'CHIP_CASCADE']
    },
    {
        id: 'clinic-15',
        name: 'Satellite Bubble',
        subtitle: 'Clinic #15: Satellites',
        category: 'MTT',
        targetLeak: 'SATELLITE_ICM',
        description: 'Absolute survival GTO for tournament ticket bubbles',
        icon: '🎫',
        badge: 'Ticket Master',
        xpMultiplier: 2.0,
        laws: [9, 10], // Survival Pressure, Survival Concepts
        difficulty: 5,
        levels: 10,
        passThreshold: 85,
        foldFrequency: 1.0, // Extreme discipline
        visualEffects: ['TICKET_PULSE', 'GOLDEN_TICKET_GLOW']
    },
    {
        id: 'clinic-16',
        name: 'Bubble Bully',
        subtitle: 'Clinic #16: Big Stack',
        category: 'MTT',
        targetLeak: 'BIG_STACK_PRESSURE',
        description: 'Exploit ICM pressure when playing as a big stack',
        icon: '🦈',
        badge: 'Shark',
        xpMultiplier: 1.5,
        laws: [8, 9], // Stack Awareness, Shark Mode
        difficulty: 4,
        levels: 10,
        passThreshold: 85,
        rangeExpansion: 2.0, // 2x vs fearful stacks
        visualEffects: ['SHARK_PULSE', 'SHARK_CHOMP']
    },
    {
        id: 'clinic-17',
        name: 'BB Ante Defense',
        subtitle: 'Clinic #17: Large Pot',
        category: 'MTT',
        targetLeak: 'ANTE_DEFENSE',
        description: 'Correct defense frequencies for BB Ante formats (67% larger pots)',
        icon: '🎰',
        badge: 'Ante Master',
        xpMultiplier: 1.0,
        laws: [9, 12], // Large Pot Visual, Format Consistency
        difficulty: 3,
        levels: 10,
        passThreshold: 85,
        defenseExpansion: 0.18, // +18% hands
        visualEffects: ['LARGE_POT_GLOW']
    },
    {
        id: 'clinic-18',
        name: 'Ladder Jump Patience',
        subtitle: 'Clinic #18: Discipline',
        category: 'MTT',
        targetLeak: 'PAY_JUMP_PATIENCE',
        description: 'Extreme discipline for pay-jump maximization',
        icon: '🪜',
        badge: 'Ladder Master',
        xpMultiplier: 2.0,
        laws: [9, 10], // Patience Visual, ICM Survival
        difficulty: 5,
        levels: 10,
        passThreshold: 85,
        visualEffects: ['HOURGLASS_WAIT', 'GOLDEN_LADDER']
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SPECIALIZED CLINICS (19-28)
    // ═══════════════════════════════════════════════════════════════════════
    {
        id: 'clinic-19',
        name: 'Final Table Pressure',
        subtitle: 'Clinic #19: Final Table',
        category: 'MTT',
        targetLeak: 'FINAL_TABLE_ICM',
        description: 'Master pay-jump optimization at the final table',
        icon: '👑',
        badge: 'Final Table Champion',
        xpMultiplier: 2.0,
        laws: [8, 9], // Stack Asymmetry, Pressure
        difficulty: 5,
        levels: 10,
        passThreshold: 85,
        detectsHeroicFolds: true,
        visualEffects: ['CROWN_GLOW', 'PAY_LADDER']
    },
    {
        id: 'clinic-20',
        name: 'Heads-Up Mastery',
        subtitle: 'Clinic #20: 1v1',
        category: 'MTT',
        targetLeak: 'HEADS_UP_PLAY',
        description: 'Specialized training for heads-up tournament finales',
        icon: '⚔️',
        badge: 'Duel Champion',
        xpMultiplier: 1.5,
        laws: [2, 3], // Table Re-orient, Button Rotation
        difficulty: 5,
        levels: 10,
        passThreshold: 85,
        tableSize: 2,
        visualEffects: ['DUEL_MODE', 'BUTTON_RAPID']
    },
    {
        id: 'clinic-21',
        name: 'Short Stack Ninja',
        subtitle: 'Clinic #21: 10-20BB',
        category: 'MTT',
        targetLeak: 'SHORT_STACK',
        description: 'Master push/fold ranges with 10-20BB stacks',
        icon: '🥷',
        badge: 'Short Stack Ninja',
        xpMultiplier: 1.0,
        laws: [8], // Stack Awareness
        difficulty: 3,
        levels: 10,
        passThreshold: 85,
        stackRange: [10, 20],
        visualEffects: ['DANGER_STACK', 'PUSH_FOLD_MODE']
    },
    {
        id: 'clinic-22',
        name: 'Deep Stack Strategy',
        subtitle: 'Clinic #22: 100BB+',
        category: 'CASH',
        targetLeak: 'DEEP_STACK',
        description: 'Master deep-stack play with 100BB+ effective stacks',
        icon: '📚',
        badge: 'Deep Stack Pro',
        xpMultiplier: 1.0,
        laws: [8], // Stack Awareness
        difficulty: 4,
        levels: 10,
        passThreshold: 85,
        minStack: 100,
        visualEffects: ['DEEP_GLOW', 'MULTI_STREET']
    },
    {
        id: 'clinic-23',
        name: 'Blind vs Blind',
        subtitle: 'Clinic #23: SB vs BB',
        category: 'CASH',
        targetLeak: 'BVB_RANGES',
        description: 'Master blind vs blind battles with wide ranges',
        icon: '🥊',
        badge: 'Blind Warrior',
        xpMultiplier: 1.0,
        laws: [2, 3], // Position awareness
        difficulty: 3,
        levels: 10,
        passThreshold: 85,
        positions: ['SB', 'BB'],
        visualEffects: ['BLIND_BATTLE', 'WIDE_RANGE']
    },
    {
        id: 'clinic-24',
        name: 'Multi-Way Pots',
        subtitle: 'Clinic #24: 3+ Players',
        category: 'CASH',
        targetLeak: 'MULTI_WAY',
        description: 'Adjust strategy for multi-way pot dynamics',
        icon: '👥',
        badge: 'Multi-Way Master',
        xpMultiplier: 1.0,
        laws: [6, 8], // Dynamic Sizing, Stack Awareness
        difficulty: 4,
        levels: 10,
        passThreshold: 85,
        minPlayers: 3,
        visualEffects: ['MULTI_PLAYER_GLOW']
    },
    {
        id: 'clinic-25',
        name: 'River Decision',
        subtitle: 'Clinic #25: Final Street',
        category: 'STRATEGY',
        targetLeak: 'RIVER_PLAY',
        description: 'Master the final street where decisions are most critical',
        icon: '🌊',
        badge: 'River Pro',
        xpMultiplier: 1.5,
        laws: [9, 10], // Pressure, Concepts
        difficulty: 5,
        levels: 10,
        passThreshold: 85,
        focusStreet: 'RIVER',
        visualEffects: ['RIVER_FOCUS', 'DECISION_WEIGHT']
    },
    {
        id: 'clinic-26',
        name: 'Overbetting',
        subtitle: 'Clinic #26: Polarized Bets',
        category: 'ADVANCED',
        targetLeak: 'OVERBET_FREQUENCY',
        description: 'Master polarized overbetting for maximum EV extraction',
        icon: '💣',
        badge: 'Overbet Master',
        xpMultiplier: 1.5,
        laws: [6], // Dynamic Sizing
        difficulty: 5,
        levels: 10,
        passThreshold: 85,
        betSizes: ['1.5x', '2x', '3x'],
        visualEffects: ['OVERBET_GLOW', 'POLARIZED_RANGE']
    },
    {
        id: 'clinic-27',
        name: 'Check-Raise Clinic',
        subtitle: 'Clinic #27: Aggression',
        category: 'STRATEGY',
        targetLeak: 'CHECK_RAISE_FREQUENCY',
        description: 'Master the check-raise for both value and bluffs',
        icon: '📈',
        badge: 'Check-Raise Artist',
        xpMultiplier: 1.0,
        laws: [9], // Pressure
        difficulty: 4,
        levels: 10,
        passThreshold: 85,
        actionSequence: ['CHECK', 'RAISE'],
        visualEffects: ['TRAP_GLOW', 'AGGRESSION_METER']
    },
    {
        id: 'clinic-28',
        name: 'Frequency Execution',
        subtitle: 'Clinic #28: Mixed Strategy',
        category: 'ADVANCED',
        targetLeak: 'MIXED_FREQUENCY',
        description: 'Execute mixed strategies with precise solver frequencies',
        icon: '🎲',
        badge: 'Frequency Master',
        xpMultiplier: 2.0,
        laws: [6], // Physical Slider
        difficulty: 5,
        levels: 10,
        passThreshold: 90, // Higher threshold for precision
        requiresSlider: true,
        precisionTiers: ['GOLD', 'GREEN', 'YELLOW'],
        visualEffects: ['FREQUENCY_METER', 'PRECISION_GLOW']
    }
];

// Helper functions
export const getClinicById = (id) =>
    TRAINING_CLINICS.find(c => c.id === id);

export const getClinicsByCategory = (category) =>
    TRAINING_CLINICS.filter(c => c.category === category);

export const getClinicsByDifficulty = (min, max) =>
    TRAINING_CLINICS.filter(c => c.difficulty >= min && c.difficulty <= max);

export const getClinicForLeak = (leakCategory) => {
    const clinicId = LEAK_CATEGORY_MAP[leakCategory];
    return clinicId ? getClinicById(clinicId) : null;
};

export const getAllCategories = () =>
    [...new Set(TRAINING_CLINICS.map(c => c.category))];

export const getRemediationXPMultiplier = (clinicId) => {
    const clinic = getClinicById(clinicId);
    return clinic ? clinic.xpMultiplier * 2.5 : 1.0; // 2.5x base for remediation
};

export default TRAINING_CLINICS;
