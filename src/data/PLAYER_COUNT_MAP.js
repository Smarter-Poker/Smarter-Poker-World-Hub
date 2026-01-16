/**
 * 👥 PLAYER COUNT MAPPING
 * Maps each of the 100 training games to their required player count
 * Based on format standards: MTT=9, Cash=6, Spins=3, HU=2
 */

export const PLAYER_COUNT_MAP = {
    // MTT (25 games) - Default 9-max, exceptions: 3-max Blitz, Heads Up Duel
    'mtt-001': 9, // Push/Fold Mastery
    'mtt-002': 9, // ICM Fundamentals
    'mtt-003': 9, // Bubble Pressure
    'mtt-004': 9, // Final Table ICM
    'mtt-005': 9, // PKO Bounty Hunter
    'mtt-006': 9, // Satellite Survival
    'mtt-007': 9, // Deep Stack MTT
    'mtt-008': 9, // Short Stack Ninja
    'mtt-009': 9, // Resteal Wars
    'mtt-010': 9, // Squeeze Master
    'mtt-011': 9, // Ante Theft
    'mtt-012': 9, // Big Stack Bully
    'mtt-013': 9, // Ladder Jump
    'mtt-014': 3, // 3-Max Blitz (EXCEPTION)
    'mtt-015': 2, // Heads Up Duel (EXCEPTION)
    'mtt-016': 9, // Chip & Chair
    'mtt-017': 9, // Blind Defense MTT
    'mtt-018': 9, // Button Warfare
    'mtt-019': 9, // Stop & Go
    'mtt-020': 9, // Multi-way Bounty
    'mtt-021': 9, // Check-Shove Power
    'mtt-022': 9, // Clock Management
    'mtt-023': 9, // Registration Edge
    'mtt-024': 9, // Triple Barrel
    'mtt-025': 9, // Boss: MTT Champion

    // CASH (25 games) - All 6-max
    'cash-001': 6, // Preflop Blueprint
    'cash-002': 6, // C-Bet Academy
    'cash-003': 6, // Defense Matrix
    'cash-004': 6, // Value Extractor
    'cash-005': 6, // Bluff Catcher
    'cash-006': 6, // Position Power
    'cash-007': 6, // 3-Bet Pots
    'cash-008': 6, // 4-Bet Wars
    'cash-009': 6, // Deep Stack Cash
    'cash-010': 6, // Short Stack Rat
    'cash-011': 6, // Donk Defense
    'cash-012': 6, // River Decisions
    'cash-013': 6, // Probe Betting
    'cash-014': 6, // Check-Raise Art
    'cash-015': 6, // Overbetting
    'cash-016': 6, // Multi-way Pots
    'cash-017': 6, // Rake Awareness
    'cash-018': 6, // Blind vs Blind
    'cash-019': 6, // Straddle Games
    'cash-020': 6, // Table Selection
    'cash-021': 6, // Mixed Strategies
    'cash-022': 6, // Texture Reading
    'cash-023': 6, // Equity Denial
    'cash-024': 6, // Pot Control
    'cash-025': 6, // Boss: Cash King

    // SPINS (10 games) - All 3-max
    'spins-001': 3, // Hyper Opener
    'spins-002': 3, // Jackpot Pressure
    'spins-003': 3, // Button Limp
    'spins-004': 3, // SNG Endgame
    'spins-005': 3, // Phase Shifting
    'spins-006': 3, // Limp Trap
    'spins-007': 3, // 50/50 Survival
    'spins-008': 3, // Aggression Mode
    'spins-009': 3, // Chip Lead Lock
    'spins-010': 3, // Boss: Spin Master

    // PSYCHOLOGY (20 games) - Default 6-max, exceptions: 3 games are 9-max (live context)
    'psy-001': 6, // Tilt Control
    'psy-002': 6, // Timing Discipline
    'psy-003': 6, // Cooler Cage
    'psy-004': 6, // Pressure Chamber
    'psy-005': 9, // Patience Master (LIVE CONTEXT)
    'psy-006': 6, // Focus Flow
    'psy-007': 6, // Result Detachment
    'psy-008': 6, // Confidence Builder
    'psy-009': 6, // Fear Eraser
    'psy-010': 6, // Ego Killer
    'psy-011': 6, // Session Stamina
    'psy-012': 6, // Snap Decision
    'psy-013': 9, // Tell Blindness (LIVE CONTEXT)
    'psy-014': 6, // Bankroll Mind
    'psy-015': 6, // Winners Tilt
    'psy-016': 6, // Variance Zen
    'psy-017': 6, // Study Habits
    'psy-018': 9, // Table Image (LIVE CONTEXT)
    'psy-019': 6, // Autopilot Escape
    'psy-020': 6, // Boss: Mind Master

    // ADVANCED (20 games) - Default 6-max, exception: Indifference Theory is 2-max
    'adv-001': 6, // Solver Mimicry
    'adv-002': 6, // Blocker Logic
    'adv-003': 6, // Node Locking
    'adv-004': 6, // Range Construction
    'adv-005': 6, // Frequency Math
    'adv-006': 6, // EV Calculations
    'adv-007': 2, // Indifference Theory (TOY GAME / HEADS UP)
    'adv-008': 6, // Range Advantage
    'adv-009': 6, // Nut Advantage
    'adv-010': 6, // Board Coverage
    'adv-011': 6, // SPR Mastery
    'adv-012': 6, // MDF Defender
    'adv-013': 6, // Combo Counting
    'adv-014': 6, // Bet Sizing Theory
    'adv-015': 6, // Population Reads
    'adv-016': 6, // Exploit Ladder
    'adv-017': 6, // Capped Ranges
    'adv-018': 6, // Polarity Index
    'adv-019': 6, // Solver Scripts
    'adv-020': 6, // Boss: GTO Apex
};

// Helper function to get player count for a game
export const getPlayerCount = (gameId) => {
    return PLAYER_COUNT_MAP[gameId] || 6; // Default to 6-max if not found
};

export default PLAYER_COUNT_MAP;
