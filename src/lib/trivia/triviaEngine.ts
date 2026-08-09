/**
 * TRIVIA ENGINE - Core game logic
 */

export interface TriviaQuestion {
    id: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
    question: string;
    options: string[];
    correct_index: number;
    explanation?: string;
}

export interface TriviaSession {
    mode: string;
    questions: TriviaQuestion[];
    currentIndex: number;
    answers: number[];
    correctCount: number;
    startTime: number;
    timeLimit?: number;
}

/**
 * Shared shape for the per-page saveGameResult payloads.
 * `diamondsEarned` is the CREDITED amount (post daily-cap clamp) — never the
 * raw calculateDiamonds() output. Result screens must render this field, not
 * the raw formula, or players are told they earned up to 100x what they got.
 */
export interface TriviaResult {
    mode: string;
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
    timeSpent: number;

    diamondsEarned: number;
    streakBonus: number;
}

export const TRIVIA_MODES = {
    daily: {
        id: 'daily',
        name: 'Daily Trivia',
        description: '10 Questions • Fresh Daily',
        questionsCount: 10,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'lightning',
        color: '#00ccff'
    },
    history: {
        id: 'history',
        name: 'Poker History',
        description: '20 Questions • Iconic moments, famous hands, legendary players',
        questionsCount: 20,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 3,
        perfectBonus: 5,
        icon: 'trophy',
        color: '#fbbf24'
    },
    rules: {
        id: 'rules',
        name: 'Rules Quiz',
        description: '20 Questions • Official poker rules',
        questionsCount: 20,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 3,
        perfectBonus: 5,
        icon: 'book',
        color: '#3b82f6'
    },
    pro: {
        id: 'pro',
        name: 'Pro Knowledge',
        description: '20 Questions • Strategy concepts, GTO basics',
        questionsCount: 20,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'graduation',
        color: '#8b5cf6'
    },
    arcade: {
        id: 'arcade',
        name: 'Quick Stakes',
        // timeLimit was 60s for 20 questions (3s each) — a perfect run was
        // effectively impossible, so the "perfect bonus" advertised a payout
        // nobody could reach. 180s is 9s/question: fast, but achievable.
        description: '20 Questions • 3 Minute Clock • Diamond Entry',
        questionsCount: 20,
        timeLimit: 180,
        diamondCost: 10,
        // Rebalanced: was 100 base + 50 perfect (+ time bonus) for a 10-diamond
        // entry, while every other mode pays 5-23. That made deliberately
        // busting the stake pot on the last question strictly +EV, because the
        // bust path fell through to this reward instead of paying 0.
        diamondReward: 25,
        perfectBonus: 15,
        icon: 'diamond',
        color: '#06b6d4'
    },
    // ── ENTRY PRICING ────────────────────────────────────────────────────────
    // diamondCost is the SINGLE SOURCE OF TRUTH for what entering a mode
    // costs. It used to read 0 for every mode below while the charging code
    // (StrategyTrivia for mtt/cash/icm/gto, and each standalone page's local
    // GAME_ENTRY_COST for mixed/endless/survival/time-attack) took 10 — so the
    // lobby advertised 10 and a direct URL advertised "free" for the same
    // game, and the caller-side override tables existed only to paper over the
    // gap. Those numbers now live here, and only here.
    //
    // NOTE: [mode].js charges straight from this field, but every mode priced
    // at 10 below resolves to its own static page (mtt.js, cash.js, icm.js,
    // gto.js, mixed.js, endless.js, survival-game.js, time-attack.js), which
    // takes precedence over the /hub/trivia/[mode] dynamic route. So no mode
    // gets charged twice by this change.
    //
    // INTERIM FREE ENTRY (2026-08-08): every mode below that still grades and
    // credits itself in the browser is priced at 0. Their reward path calls
    // supabase.rpc('add_diamonds_to_balance') directly, and EXECUTE on that
    // RPC was revoked from `authenticated` on 2026-08-03 (migration
    // 20260803140000) - so since then these modes charged a real 10-diamond
    // entry through the working server spend path and then silently failed
    // to pay ANY reward. Charging for a game that cannot pay out is not
    // defensible, so entry is free until each page adopts the
    // server-authoritative session flow (session-start / session-answer /
    // session-submit - see arcade, which kept its price because it pays
    // through award_trivia_run). Restore each price in the SAME commit that
    // adopts server grading for that mode.
    survival: {
        id: 'survival',
        name: 'Survival Mode',
        description: 'Answer until you miss. Rewards stack!',
        questionsCount: 100, // Unlimited effectively
        timeLimit: null,
        diamondCost: 10, // restored - survival pays via award_trivia_run now
        diamondReward: 1, // Per correct answer
        perfectBonus: 0,
        icon: 'heart',
        color: '#ef4444'
    },
    // NEW GAME MODES - Strategy Categories
    mtt: {
        id: 'mtt',
        name: 'MTT Scenarios',
        description: '20 Questions • MTT situations and decisions',
        questionsCount: 20,
        timeLimit: null,
        diamondCost: 10, // restored - mtt pays via award_trivia_run now
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'users',
        color: '#f97316'
    },
    cash: {
        id: 'cash',
        name: 'Cash Game',
        description: '20 Questions • Deep stack scenarios and dynamics',
        questionsCount: 20,
        timeLimit: null,
        diamondCost: 10, // restored - cash pays via award_trivia_run now
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'banknote',
        color: '#22c55e'
    },
    icm: {
        id: 'icm',
        name: 'ICM & Chip EV',
        description: '20 Questions • Tournament equity and $EV',
        questionsCount: 20,
        timeLimit: null,
        diamondCost: 10, // restored - icm pays via award_trivia_run now
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'calculator',
        color: '#06b6d4'
    },
    gto: {
        id: 'gto',
        name: 'GTO Master',
        description: '20 Questions • Solver-based scenarios',
        questionsCount: 20,
        timeLimit: null,
        diamondCost: 10, // restored - gto pays via award_trivia_run now
        diamondReward: 8,
        perfectBonus: 15,
        icon: 'brain',
        color: '#a855f7'
    },
    // Standalone-route modes. These live at their own pages (mixed.js,
    // endless.js, time-attack.js, pvp.js, tournaments.js) rather than under
    // [mode].js, but their economy belongs in the same table so a mode's
    // numbers can be read from one place instead of five hardcoded copies.
    mixed: {
        id: 'mixed',
        name: 'Mixed Bag',
        description: 'All Categories • Rotating Mix',
        questionsCount: 20,
        timeLimit: null,
        diamondCost: 10, // restored ccbfa17b - mixed pays via award_trivia_run now
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'shuffle',
        color: '#eab308'
    },
    endless: {
        id: 'endless',
        name: 'Endless',
        description: 'Keep Answering Until You Miss Three',
        questionsCount: 0,
        timeLimit: null,
        diamondCost: 10, // restored - endless pays via award_trivia_run now
        diamondReward: 1,
        perfectBonus: 0,
        icon: 'infinity',
        color: '#f43f5e'
    },
    'time-attack': {
        id: 'time-attack',
        name: 'Time Attack',
        description: 'As Many As You Can Before The Clock Runs Out',
        questionsCount: 0,
        timeLimit: 120,
        diamondCost: 10, // restored 20f63684 - time-attack pays via award_trivia_run now
        diamondReward: 1,
        perfectBonus: 0,
        icon: 'timer',
        color: '#14b8a6'
    },
    pvp: {
        id: 'pvp',
        name: 'Heads-Up',
        description: '10 Questions • Head To Head',
        questionsCount: 10,
        timeLimit: 40,
        diamondCost: 0,
        diamondReward: 0,
        perfectBonus: 0,
        icon: 'swords',
        color: '#ec4899'
    },
    tournaments: {
        id: 'tournaments',
        name: 'Tournaments',
        description: 'Multi-Round Bracket Play',
        questionsCount: 10,
        timeLimit: 30,
        diamondCost: 0,
        diamondReward: 0,
        perfectBonus: 0,
        icon: 'trophy',
        color: '#f59e0b'
    }
} as const;

export type TriviaMode = keyof typeof TRIVIA_MODES;

/**
 * Per-mode daily diamond caps. The mode pages each hardcoded their own
 * DAILY_DIAMOND_CAP constant; this is the shared table they should read.
 *
 * PAID MODES: a cap must be strictly greater than the entry cost, or the mode
 * is net-negative by construction and no amount of skill can beat it. Every
 * mode below with diamondCost: 10 previously sat at a 10/day cap (time-attack
 * at 5/day — literally unwinnable), which is below a single perfect run's
 * payout. Each paid cap is now roughly 2-3 clean runs, so a strong player can
 * profit while the daily ceiling still bounds the mint.
 *
 *   mode        entry   max single run                 cap
 *   mtt/cash/icm  10    15  (5 base + 10 perfect)       40
 *   gto           10    23  (8 base + 15 perfect)       60
 *   mixed         10    15                              40
 *   endless       10    1/correct                       40
 *   survival      10    60  (SURVIVAL_MAX)              80
 *   time-attack   10    1/correct                       40
 *   arcade        10    50  (25 + 15 perfect + 10 time) 40 (unchanged)
 *
 * Free modes (daily/history/rules/pro) keep the 10/day cap — nothing is spent
 * to enter them, so a cap below a perfect run is a design choice, not a bug.
 */
export const DAILY_DIAMOND_CAPS: Record<string, number> = {
    daily: 10,
    history: 10,
    rules: 10,
    pro: 10,
    arcade: 40,
    survival: 80,
    mtt: 40,
    cash: 40,
    icm: 40,
    gto: 60,
    mixed: 40,
    endless: 40,
    'time-attack': 40,
};

// Category mappings for new modes.
// NOTE: 'gto_scenarios' is a real category (it is in the trivia_questions
// CHECK constraint and in triviaValidator's STRATEGY_CATEGORIES) and was
// missing here, so GTO mode never drew from it.
export const CATEGORY_MAPPINGS = {
    mtt: ['mtt_situations'],
    cash: ['cash_game_situations'],
    icm: ['icm_chip_ev'],
    gto: ['gto_theory', 'gto_scenarios', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev'],
    history: ['poker_history', 'famous_hands', 'player_profiles'],
    rules: ['rule_knowledge'],
    pro: ['gto_theory', 'tournament_facts'],
    daily: [
        'poker_history', 'famous_hands', 'player_profiles', 'tournament_facts',
        'rule_knowledge', 'gto_theory', 'mtt_situations', 'cash_game_situations',
        'icm_chip_ev', 'gto_scenarios'
    ],
    mixed: [
        'poker_history', 'famous_hands', 'player_profiles', 'tournament_facts',
        'rule_knowledge', 'gto_theory', 'mtt_situations', 'cash_game_situations',
        'icm_chip_ev', 'gto_scenarios'
    ]
} as const;

/** Every category the question pool can contain. */
export const ALL_CATEGORIES = [
    'poker_history', 'famous_hands', 'player_profiles', 'tournament_facts',
    'rule_knowledge', 'gto_theory', 'mtt_situations', 'cash_game_situations',
    'icm_chip_ev', 'gto_scenarios'
] as const;

/**
 * Safe accessor — returns undefined for unknown modes instead of throwing on
 * a property read of undefined at the call site.
 */
export function getModeConfig(mode: string) {
    return (TRIVIA_MODES as Record<string, any>)[mode];
}

/** Categories a mode draws from, falling back to the full pool. */
export function getCategoriesForMode(mode: string): string[] {
    const mapped = (CATEGORY_MAPPINGS as Record<string, readonly string[]>)[mode];
    return mapped ? [...mapped] : [...ALL_CATEGORIES];
}

export function calculateDiamonds(
    mode: TriviaMode,
    correctCount: number,
    totalQuestions: number,
    timeRemaining: number = 0
): number {
    const config = getModeConfig(mode as string);
    if (!config) return 0;

    const safeCorrect = Number.isFinite(correctCount) && correctCount > 0 ? Math.floor(correctCount) : 0;
    const safeTotal = Number.isFinite(totalQuestions) && totalQuestions > 0 ? Math.floor(totalQuestions) : 0;
    const accuracy = safeTotal > 0 ? Math.min(1, safeCorrect / safeTotal) : 0;

    // Survival mode: 1 diamond per correct, escalating multiplier every 5.
    // The multiplier used to be unbounded — 50 correct produced 275 diamonds
    // and 100 correct produced 1,050, while the pages clamp the actual award
    // to the daily cap. Result screens then bragged about 100x what was
    // credited. Multiplier caps at 3 and the total caps at SURVIVAL_MAX so
    // the number shown is at least in the same universe as the payout.
    if (mode === 'survival') {
        const SURVIVAL_MAX = 60;
        let total = 0;
        for (let i = 1; i <= safeCorrect; i++) {
            const multiplier = Math.min(3, Math.floor((i - 1) / 5) + 1);
            total += multiplier;
            if (total >= SURVIVAL_MAX) return SURVIVAL_MAX;
        }
        return total;
    }

    // Quick Stakes (arcade): tiered system with a bounded time bonus.
    if (mode === 'arcade') {
        const ARCADE_MAX_TIME_BONUS = 10;
        const rawTimeBonus = Number.isFinite(timeRemaining) && timeRemaining > 0
            ? Math.floor(timeRemaining / 6)
            : 0;
        const timeBonus = Math.min(ARCADE_MAX_TIME_BONUS, rawTimeBonus);
        if (accuracy < 0.5) return 0;
        if (accuracy < 0.7) return Math.floor(config.diamondReward * 0.2) + timeBonus;
        if (accuracy < 0.9) return Math.floor(config.diamondReward * 0.5) + timeBonus;
        // perfectBonus is a PERFECT bonus — it used to be handed out at 90%,
        // which is one wrong answer out of twenty.
        if (accuracy < 1) return config.diamondReward + timeBonus;
        return config.diamondReward + config.perfectBonus + timeBonus;
    }

    // Count-based modes (endless / time-attack): 1 diamond per correct
    // answer (config.diamondReward per correct). These modes never had a
    // formula here - their pages computed per-correct payouts locally and
    // credited them client-side, which went dark when the credit RPC was
    // locked on 2026-08-03. The daily cap (DAILY_DIAMOND_CAPS) still binds
    // wherever this is consumed (calculateCreditedDiamonds and
    // /api/trivia/session-submit both clamp).
    if (mode === 'endless' || mode === 'time-attack') {
        return safeCorrect * (config.diamondReward || 1);
    }

    // All other modes: Base reward + perfect bonus
    if (accuracy === 1.0) {
        return config.diamondReward + config.perfectBonus;
    } else if (accuracy >= 0.7) {
        return config.diamondReward;
    } else if (accuracy >= 0.5) {
        return Math.floor(config.diamondReward * 0.5);
    }

    return 0; // Less than 50% accuracy = no diamonds
}

/**
 * The credited amount for a run: calculateDiamonds() clamped to the mode's
 * daily cap given what the player has already earned today. Use this for BOTH
 * the ledger write and the result screen so the two can never disagree.
 */
export function calculateCreditedDiamonds(
    mode: TriviaMode,
    correctCount: number,
    totalQuestions: number,
    timeRemaining: number = 0,
    earnedToday: number = 0
): number {
    const raw = calculateDiamonds(mode, correctCount, totalQuestions, timeRemaining);
    const cap = DAILY_DIAMOND_CAPS[mode as string];
    if (!Number.isFinite(cap)) return raw;
    return Math.max(0, Math.min(raw, cap - (Number.isFinite(earnedToday) ? earnedToday : 0)));
}

export function getDifficultyColor(difficulty: string): string {
    switch (difficulty) {
        case 'easy': return '#22c55e';
        case 'medium': return '#fbbf24';
        case 'hard': return '#ef4444';
        default: return '#6b7280';
    }
}

export function getCategoryIcon(category: string): string {
    switch (category) {
        case 'poker_history': return 'HIST';
        case 'famous_hands': return 'HAND';
        case 'gto_theory': return 'GTO';
        case 'player_profiles': return 'PRO';
        case 'tournament_facts': return 'TOUR';
        case 'rule_knowledge': return 'RULE';
        case 'mtt_situations': return 'MTT';
        case 'cash_game_situations': return 'CASH';
        case 'icm_chip_ev': return 'ICM';
        case 'gto_scenarios': return 'GTO';
        default: return '?';
    }
}

export function getCategoryName(category: string): string {
    switch (category) {
        case 'poker_history': return 'Poker History';
        case 'famous_hands': return 'Famous Hands';
        case 'gto_theory': return 'GTO Theory';
        case 'player_profiles': return 'Player Profiles';
        case 'tournament_facts': return 'Tournament Facts';
        case 'rule_knowledge': return 'Rules & Etiquette';
        // New categories
        case 'mtt_situations': return 'MTT Scenarios';
        case 'cash_game_situations': return 'Cash Game';
        case 'icm_chip_ev': return 'ICM & Chip EV';
        case 'gto_scenarios': return 'GTO Scenarios';
        default: return 'General';
    }
}
