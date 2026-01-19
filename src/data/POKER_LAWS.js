/**
 * 🎯 POKER LAWS — The 12 Fundamental GTO Principles
 * ═══════════════════════════════════════════════════════════════════════════
 * Each law represents a core strategic concept that players must master.
 * When a player violates a law, they have a "leak" that needs fixing.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const POKER_LAWS = {
    // === POSITION LAWS ===
    LAW_01: {
        id: 'LAW_01',
        name: 'Position is Power',
        shortName: 'Position Matters',
        category: 'POSITION',
        description: 'Acting last provides informational advantage. Tighter ranges OOP, wider IP.',
        violation: 'Playing too loose out of position or too tight in position.',
        quickFix: 'Tighten up OOP, open wider on BTN/CO.',
        relatedClinics: ['clinic-04', 'clinic-23']
    },

    LAW_02: {
        id: 'LAW_02',
        name: 'Stack Depth Dictates Strategy',
        shortName: 'Respect Stack Depth',
        category: 'SIZING',
        description: 'Effective stack size determines optimal bet sizing and hand playability.',
        violation: 'Ignoring SPR (Stack-to-Pot Ratio) when making decisions.',
        quickFix: 'With <15BB, switch to push/fold. With 100BB+, play postflop.',
        relatedClinics: ['clinic-12', 'clinic-21', 'clinic-22']
    },

    LAW_03: {
        id: 'LAW_03',
        name: 'Defend Your Blind',
        shortName: 'Blind Defense',
        category: 'DEFENSE',
        description: 'The BB has odds to call with a wide range against single raises.',
        violation: 'Over-folding the big blind to steals.',
        quickFix: 'Defend ~60% of hands in BB vs BTN open.',
        relatedClinics: ['clinic-01', 'clinic-03', 'clinic-17']
    },

    // === AGGRESSION LAWS ===
    LAW_04: {
        id: 'LAW_04',
        name: "Don't Pay Nits",
        shortName: 'Nit Payoff',
        category: 'AGGRESSION',
        description: 'Tight players rarely bluff. Fold marginal hands to their aggression.',
        violation: 'Calling raises from tight players with weak holdings.',
        quickFix: 'When a nit raises, they have it. Fold bottom of range.',
        relatedClinics: ['clinic-01', 'clinic-10']
    },

    LAW_05: {
        id: 'LAW_05',
        name: 'Punish Passivity',
        shortName: 'Exploit Passive',
        category: 'AGGRESSION',
        description: 'Passive players check too much. Attack their weakness with aggression.',
        violation: 'Checking back value hands against passive opponents.',
        quickFix: 'Bet thin for value against calling stations.',
        relatedClinics: ['clinic-02', 'clinic-10']
    },

    LAW_06: {
        id: 'LAW_06',
        name: 'Bet for Value',
        shortName: 'Thin Value',
        category: 'SIZING',
        description: 'Extract maximum value with strong hands through optimal sizing.',
        violation: 'Missing value bets or betting too small with strong hands.',
        quickFix: 'On safe boards, bet 66-75% pot with value hands.',
        relatedClinics: ['clinic-02', 'clinic-26']
    },

    // === ICM LAWS ===
    LAW_07: {
        id: 'LAW_07',
        name: 'ICM Pressure Matters',
        shortName: 'ICM Awareness',
        category: 'MTT',
        description: 'Tournament chips ≠ cash value. Survival impacts calling ranges.',
        violation: 'Calling too wide on the bubble or near pay jumps.',
        quickFix: 'Tighten calling range on bubble, widen shoving range.',
        relatedClinics: ['clinic-13', 'clinic-15', 'clinic-16', 'clinic-18', 'clinic-19']
    },

    LAW_08: {
        id: 'LAW_08',
        name: 'Push/Fold Zones',
        shortName: 'Short Stack',
        category: 'MTT',
        description: 'With <10BB, the only plays are all-in or fold. No limping.',
        violation: 'Min-raising or calling with a short stack.',
        quickFix: 'Under 10BB: shove or fold. No middle ground.',
        relatedClinics: ['clinic-21', 'clinic-13']
    },

    // === PSYCHOLOGY LAWS ===
    LAW_09: {
        id: 'LAW_09',
        name: 'Control Your Emotions',
        shortName: 'Tilt Resistance',
        category: 'PSYCHOLOGY',
        description: 'Emotional decisions are -EV. Maintain discipline after bad beats.',
        violation: 'Making revenge plays or spewy calls after losing a pot.',
        quickFix: 'Take a break after a bad beat. Reset mentally.',
        relatedClinics: ['clinic-07', 'clinic-06']
    },

    LAW_10: {
        id: 'LAW_10',
        name: 'Results ≠ Decision Quality',
        shortName: 'Process Focus',
        category: 'PSYCHOLOGY',
        description: 'A correct decision can lose. Judge plays by reasoning, not outcome.',
        violation: 'Changing strategy based on short-term results.',
        quickFix: 'Review hands for decision quality, not just winnings.',
        relatedClinics: ['clinic-08']
    },

    // === ADVANCED LAWS ===
    LAW_11: {
        id: 'LAW_11',
        name: 'Range Advantage Determines Aggression',
        shortName: 'Range Advantage',
        category: 'ADVANCED',
        description: 'The player with stronger range on a given board should bet more.',
        violation: 'C-betting flops that favor villain\'s range.',
        quickFix: 'Check more on low/coordinated boards as the preflop raiser.',
        relatedClinics: ['clinic-05', 'clinic-11']
    },

    LAW_12: {
        id: 'LAW_12',
        name: 'Balance Your Frequencies',
        shortName: 'Mixed Strategy',
        category: 'ADVANCED',
        description: 'GTO requires mixing actions at certain frequencies to remain unexploitable.',
        violation: 'Always betting or always checking in spots that require mixing.',
        quickFix: 'Use a randomizer for borderline spots.',
        relatedClinics: ['clinic-28', 'clinic-27']
    }
};

// Quick lookup by lawId
export function getLaw(lawId) {
    return POKER_LAWS[lawId] || null;
}

// Get all laws for a category
export function getLawsByCategory(category) {
    return Object.values(POKER_LAWS).filter(law => law.category === category);
}

// Get violation explanation for a specific law
export function getViolationExplanation(lawId) {
    const law = POKER_LAWS[lawId];
    if (!law) return null;
    return {
        title: `You Violated: ${law.name}`,
        description: law.violation,
        quickFix: law.quickFix,
        clinics: law.relatedClinics
    };
}

// Map leak categories to laws
export const LEAK_TO_LAW_MAP = {
    'FOLD_TO_AGGRESSION': 'LAW_04',
    'THIN_VALUE': 'LAW_06',
    'BLUFF_FREQUENCY': 'LAW_03',
    'POSITION_AWARENESS': 'LAW_01',
    'CBET_DEFENSE': 'LAW_11',
    'TIMING_TELLS': 'LAW_09',
    'TILT_PLAY': 'LAW_09',
    'RESULT_BIAS': 'LAW_10',
    'CONTEXT_ADAPTATION': 'LAW_02',
    'MISSED_EXPLOIT': 'LAW_05',
    'CAPPED_FOLDING': 'LAW_11',
    'EFFECTIVE_STACK': 'LAW_02',
    'ICM_AWARENESS': 'LAW_07',
    'BOUNTY_MATH': 'LAW_07',
    'SATELLITE_ICM': 'LAW_07',
    'BIG_STACK_PRESSURE': 'LAW_07',
    'ANTE_DEFENSE': 'LAW_03',
    'PAY_JUMP_PATIENCE': 'LAW_07',
    'FINAL_TABLE_ICM': 'LAW_07',
    'HEADS_UP_PLAY': 'LAW_01',
    'SHORT_STACK': 'LAW_08',
    'DEEP_STACK': 'LAW_02',
    'BVB_RANGES': 'LAW_03',
    'MULTI_WAY': 'LAW_11',
    'RIVER_PLAY': 'LAW_06',
    'OVERBET_FREQUENCY': 'LAW_06',
    'CHECK_RAISE_FREQUENCY': 'LAW_12',
    'MIXED_FREQUENCY': 'LAW_12'
};

export function getLawForLeak(leakCategory) {
    const lawId = LEAK_TO_LAW_MAP[leakCategory];
    return lawId ? POKER_LAWS[lawId] : null;
}
