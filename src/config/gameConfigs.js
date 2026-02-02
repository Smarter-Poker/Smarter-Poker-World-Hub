/**
 * 🎮 GAME CONFIGURATION DATABASE
 * ═══════════════════════════════════════════════════════════════════════════
 * Comprehensive mapping of all 100 training games with:
 * - Player count (2-9 players)
 * - Game format (Heads-Up, 3-Max, 6-Max, 9-Max)
 * - Stack depths
 * - Special rules
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const GAME_CONFIGS = {
    // ═══════════════════════════════════════════════════════════════════════
    // MTT GAMES (25) - Tournament Format
    // ═══════════════════════════════════════════════════════════════════════
    'mtt-001': { players: 9, format: '9-Max Tournament', stackDepth: '10-15bb', gameType: 'tournament', engine: 'CHART' }, // Push/fold
    'mtt-002': { players: 9, format: '9-Max Tournament', stackDepth: '15-30bb', gameType: 'tournament', engine: 'PIO' }, // ICM math
    'mtt-003': { players: 9, format: '9-Max Tournament', stackDepth: '20-40bb', gameType: 'tournament', engine: 'PIO' }, // Bubble
    'mtt-004': { players: 9, format: 'Final Table (9-Max)', stackDepth: '15-50bb', gameType: 'tournament', engine: 'PIO' }, // ICM
    'mtt-005': { players: 9, format: '9-Max PKO', stackDepth: '20-40bb', gameType: 'tournament', engine: 'PIO' }, // Bounty math
    'mtt-006': { players: 9, format: '9-Max Satellite', stackDepth: '20-40bb', gameType: 'tournament', engine: 'PIO' }, // Extreme ICM
    'mtt-007': { players: 9, format: '9-Max Tournament', stackDepth: '100-200bb', gameType: 'tournament', engine: 'PIO' }, // Deep stack GTO
    'mtt-008': { players: 9, format: '9-Max Tournament', stackDepth: '10-20bb', gameType: 'tournament', engine: 'PIO' }, // Short stack GTO
    'mtt-009': { players: 9, format: '9-Max Tournament', stackDepth: '12-25bb', gameType: 'tournament', engine: 'PIO' }, // Resteal
    'mtt-010': { players: 9, format: '9-Max Tournament', stackDepth: '20-40bb', gameType: 'tournament', engine: 'PIO' }, // Squeeze
    'mtt-011': { players: 9, format: '9-Max Tournament', stackDepth: '15-30bb', gameType: 'tournament', engine: 'PIO' }, // Ante theft
    'mtt-012': { players: 9, format: '9-Max Tournament', stackDepth: '30-80bb', gameType: 'tournament', engine: 'PIO' }, // Big stack
    'mtt-013': { players: 9, format: 'Final Table (9-Max)', stackDepth: '10-40bb', gameType: 'tournament', engine: 'PIO' }, // Ladder jump
    'mtt-014': { players: 3, format: '3-Max Tournament', stackDepth: '15-40bb', gameType: 'tournament', engine: 'PIO' }, // 3-max GTO
    'mtt-015': { players: 2, format: 'Heads-Up Tournament', stackDepth: '20-50bb', gameType: 'tournament', engine: 'PIO' }, // HU GTO
    'mtt-016': { players: 9, format: '9-Max Tournament', stackDepth: '1-5bb', gameType: 'tournament', engine: 'CHART' }, // Micro-stack
    'mtt-017': { players: 9, format: '9-Max Tournament', stackDepth: '15-40bb', gameType: 'tournament', engine: 'PIO' }, // BB defense
    'mtt-018': { players: 9, format: '9-Max Tournament', stackDepth: '15-40bb', gameType: 'tournament', engine: 'PIO' }, // BTN warfare
    'mtt-019': { players: 9, format: '9-Max Tournament', stackDepth: '8-15bb', gameType: 'tournament', engine: 'PIO' }, // Stop & go
    'mtt-020': { players: 9, format: '9-Max PKO', stackDepth: '20-40bb', gameType: 'tournament', engine: 'PIO' }, // Multi-way bounty
    'mtt-021': { players: 9, format: '9-Max Tournament', stackDepth: '15-30bb', gameType: 'tournament', engine: 'PIO' }, // Check-shove
    'mtt-022': { players: 9, format: '9-Max Tournament', stackDepth: '20-40bb', gameType: 'tournament', engine: 'SCENARIO' }, // Clock management
    'mtt-023': { players: 9, format: '9-Max Tournament', stackDepth: '30-60bb', gameType: 'tournament', engine: 'PIO' }, // Late reg
    'mtt-024': { players: 9, format: '9-Max Tournament', stackDepth: '25-50bb', gameType: 'tournament', engine: 'PIO' }, // Triple barrel
    'mtt-025': { players: 9, format: '9-Max Tournament', stackDepth: '10-100bb', gameType: 'tournament', engine: 'PIO' }, // Full simulation

    // ═══════════════════════════════════════════════════════════════════════
    // CASH GAMES (25) - Ring Game Format
    // ═══════════════════════════════════════════════════════════════════════
    'cash-001': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // RFI ranges
    'cash-002': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // C-bet sizing
    'cash-003': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Defense
    'cash-004': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Value betting
    'cash-005': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Bluff catching
    'cash-006': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Position
    'cash-007': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // 3-bet pots
    'cash-008': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // 4-bet wars
    'cash-009': { players: 6, format: '6-Max Cash', stackDepth: '200bb', gameType: 'cash', engine: 'PIO' }, // Deep stack
    'cash-010': { players: 6, format: '6-Max Cash', stackDepth: '40bb', gameType: 'cash', engine: 'CHART' }, // Short stack
    'cash-011': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Donk defense
    'cash-012': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // River decisions
    'cash-013': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Probe betting
    'cash-014': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Check-raise
    'cash-015': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Overbetting
    'cash-016': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Multi-way
    'cash-017': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Rake awareness
    'cash-018': { players: 2, format: 'Heads-Up Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // ← HEADS-UP GTO!
    'cash-019': { players: 6, format: '6-Max Cash (Straddle)', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Straddle
    'cash-020': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Table selection
    'cash-021': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Mixed strategies
    'cash-022': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Texture reading
    'cash-023': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Equity denial
    'cash-024': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Pot control
    'cash-025': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Full session

    // ═══════════════════════════════════════════════════════════════════════
    // SPINS (10) - Hyper-Turbo SNG Format
    // ═══════════════════════════════════════════════════════════════════════
    'spins-001': { players: 3, format: '3-Max Spin & Go', stackDepth: '25bb', gameType: 'sng', engine: 'PIO' }, // 3-max early
    'spins-002': { players: 3, format: '3-Max Spin & Go', stackDepth: '25bb', gameType: 'sng', engine: 'PIO' }, // Jackpot
    'spins-003': { players: 3, format: '3-Max Spin & Go', stackDepth: '25bb', gameType: 'sng', engine: 'PIO' }, // Button limp
    'spins-004': { players: 2, format: 'Heads-Up Spin & Go', stackDepth: '15bb', gameType: 'sng', engine: 'PIO' }, // HU endgame
    'spins-005': { players: 3, format: '3-Max Spin & Go', stackDepth: '10-25bb', gameType: 'sng', engine: 'PIO' }, // Phase shifting
    'spins-006': { players: 3, format: '3-Max Spin & Go', stackDepth: '25bb', gameType: 'sng', engine: 'PIO' }, // Limp trap
    'spins-007': { players: 3, format: '3-Max Spin & Go', stackDepth: '15bb', gameType: 'sng', engine: 'PIO' }, // Extreme ICM
    'spins-008': { players: 3, format: '3-Max Spin & Go', stackDepth: '20bb', gameType: 'sng', engine: 'PIO' }, // Aggression mode
    'spins-009': { players: 3, format: '3-Max Spin & Go', stackDepth: '25bb', gameType: 'sng', engine: 'PIO' }, // Chip lead
    'spins-010': { players: 3, format: '3-Max Spin & Go', stackDepth: '10-25bb', gameType: 'sng', engine: 'PIO' }, // Full simulation

    // ═══════════════════════════════════════════════════════════════════════
    // PSYCHOLOGY (20) - Mental Game (SCENARIO ENGINE)
    // ═══════════════════════════════════════════════════════════════════════
    'psy-001': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Tilt control
    'psy-002': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Timing
    'psy-003': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Cooler cage
    'psy-004': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Pressure
    'psy-005': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Patience
    'psy-006': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Focus
    'psy-007': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Result detachment
    'psy-008': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Confidence
    'psy-009': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Fear eraser
    'psy-010': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Ego killer
    'psy-011': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Session stamina
    'psy-012': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Snap decision
    'psy-013': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Tell blindness
    'psy-014': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Bankroll
    'psy-015': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Winners tilt
    'psy-016': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Variance zen
    'psy-017': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Study habits
    'psy-018': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Table image
    'psy-019': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Autopilot escape
    'psy-020': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'SCENARIO' }, // Mind master

    // ═══════════════════════════════════════════════════════════════════════
    // ADVANCED (20) - Theory (PIO ENGINE)
    // ═══════════════════════════════════════════════════════════════════════
    'adv-001': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Solver mimicry
    'adv-002': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Blocker logic
    'adv-003': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Node locking
    'adv-004': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Range construction
    'adv-005': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Frequency math
    'adv-006': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // EV calculations
    'adv-007': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Indifference theory
    'adv-008': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Range advantage
    'adv-009': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Nut advantage
    'adv-010': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Board coverage
    'adv-011': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // SPR mastery
    'adv-012': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // MDF defender
    'adv-013': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Combo counting
    'adv-014': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Bet sizing theory
    'adv-015': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Population reads
    'adv-016': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Exploit ladder
    'adv-017': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Capped ranges
    'adv-018': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Polarity index
    'adv-019': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // Solver scripts
    'adv-020': { players: 6, format: '6-Max Cash', stackDepth: '100bb', gameType: 'cash', engine: 'PIO' }, // GTO apex
};

/**
 * Get game configuration by ID
 */
export function getGameConfig(gameId) {
    return GAME_CONFIGS[gameId] || {
        players: 6,
        format: '6-Max Cash',
        stackDepth: '100bb',
        gameType: 'cash'
    };
}

/**
 * Get stack depth as number (for Grok prompts)
 */
export function getStackDepthNumber(stackDepthString) {
    // Parse "100bb" → 100, "10-15bb" → 12 (midpoint), "200bb" → 200
    const match = stackDepthString.match(/(\d+)(?:-(\d+))?bb/);
    if (!match) return 100;

    const min = parseInt(match[1]);
    const max = match[2] ? parseInt(match[2]) : min;
    return Math.floor((min + max) / 2);
}

export default GAME_CONFIGS;
