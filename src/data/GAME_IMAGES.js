/**
 * 🎮 GAME IMAGE MAPPING — Custom Artwork for 100 Training Games
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Maps game IDs to their custom techy digital art images
 * Images feature holographic HUDs, neon lighting, data displays
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Base path for training images
const IMAGE_BASE = '/images/training';

// Game ID to image filename mapping
export const GAME_IMAGES = {
    // ═══════════════════════════════════════════════════════════════════════
    // MTT GAMES (25) - Orange/Gold Theme
    // ═══════════════════════════════════════════════════════════════════════
    'mtt-001': `${IMAGE_BASE}/mtt_push_fold.png`,      // Push/Fold Mastery
    'mtt-002': `${IMAGE_BASE}/mtt_icm_chart.png`,     // ICM Fundamentals
    'mtt-003': `${IMAGE_BASE}/mtt_bubble_tech.png`,   // Bubble Pressure
    'mtt-004': `${IMAGE_BASE}/mtt_final_table.png`,   // Final Table ICM
    'mtt-005': `${IMAGE_BASE}/mtt_pko_bounty.png`,    // PKO Bounty Hunter
    'mtt-006': `${IMAGE_BASE}/mtt_satellite.png`,     // Satellite Survival
    'mtt-007': `${IMAGE_BASE}/mtt_icm_modern.png`,    // Deep Stack MTT
    'mtt-008': `${IMAGE_BASE}/mtt_short_stack.png`,   // Short Stack Ninja
    'mtt-009': `${IMAGE_BASE}/mtt_resteal.png`,       // Resteal Wars
    'mtt-010': `${IMAGE_BASE}/mtt_squeeze.png`,       // Squeeze Master
    'mtt-011': `${IMAGE_BASE}/mtt_ante_theft.png`,    // Ante Theft
    'mtt-012': `${IMAGE_BASE}/mtt_big_stack.png`,     // Big Stack Bully
    'mtt-013': `${IMAGE_BASE}/mtt_icm_chart.png`,     // Ladder Jump
    'mtt-014': `${IMAGE_BASE}/mtt_3max_blitz.png`,    // 3-Max Blitz
    'mtt-015': `${IMAGE_BASE}/mtt_headsup.png`,       // Heads Up Duel
    'mtt-016': `${IMAGE_BASE}/mtt_short_stack.png`,   // Chip & Chair
    'mtt-017': `${IMAGE_BASE}/cash_defense_tech.png`, // Blind Defense MTT
    'mtt-018': `${IMAGE_BASE}/mtt_button_warfare.png`,// Button Warfare
    'mtt-019': `${IMAGE_BASE}/mtt_squeeze.png`,       // Stop & Go
    'mtt-020': `${IMAGE_BASE}/mtt_pko_bounty.png`,    // Multi-way Bounty
    'mtt-021': `${IMAGE_BASE}/mtt_allin_chips.png`,   // Check-Shove Power
    'mtt-022': `${IMAGE_BASE}/mtt_bubble_tech.png`,   // Clock Management
    'mtt-023': `${IMAGE_BASE}/mtt_icm_modern.png`,    // Registration Edge
    'mtt-024': `${IMAGE_BASE}/mtt_resteal.png`,       // Triple Barrel
    'mtt-025': `${IMAGE_BASE}/mtt_boss_champion.png`, // Boss: MTT Champion

    // ═══════════════════════════════════════════════════════════════════════
    // CASH GAMES (25) - Green Theme
    // ═══════════════════════════════════════════════════════════════════════
    'cash-001': `${IMAGE_BASE}/cash_preflop.png`,         // Preflop Blueprint
    'cash-002': `${IMAGE_BASE}/cash_cbet_mastery.png`,    // C-Bet Academy
    'cash-003': `${IMAGE_BASE}/cash_defense_tech.png`,    // Defense Matrix
    'cash-004': `${IMAGE_BASE}/cash_value_bet.png`,       // Value Extractor
    'cash-005': `${IMAGE_BASE}/cash_bluff_catcher.png`,   // Bluff Catcher
    'cash-006': `${IMAGE_BASE}/mtt_resteal.png`,          // Position Power
    'cash-007': `${IMAGE_BASE}/cash_3bet_pots.png`,       // 3-Bet Pots
    'cash-008': `${IMAGE_BASE}/cash_overbet.png`,         // 4-Bet Wars
    'cash-009': `${IMAGE_BASE}/cash_deep_stack.png`,      // Deep Stack Cash
    'cash-010': `${IMAGE_BASE}/mtt_short_stack.png`,      // Short Stack Rat
    'cash-011': `${IMAGE_BASE}/cash_defense_tech.png`,    // Donk Defense
    'cash-012': `${IMAGE_BASE}/cash_river_decision.png`,  // River Decisions
    'cash-013': `${IMAGE_BASE}/cash_cbet_mastery.png`,    // Probe Betting
    'cash-014': `${IMAGE_BASE}/cash_check_raise.png`,// Check-Raise Art
    'cash-015': `${IMAGE_BASE}/cash_overbet.png`,         // Overbetting
    'cash-016': `${IMAGE_BASE}/cash_3bet_pots.png`,       // Multi-way Pots
    'cash-017': `${IMAGE_BASE}/advanced_ev_calc.png`,     // Rake Awareness
    'cash-018': `${IMAGE_BASE}/mtt_resteal.png`,          // Blind vs Blind
    'cash-019': `${IMAGE_BASE}/cash_deep_stack.png`,      // Straddle Games
    'cash-020': `${IMAGE_BASE}/cash_bluff_catcher.png`,   // Table Selection
    'cash-021': `${IMAGE_BASE}/advanced_range_chart.png`, // Mixed Strategies
    'cash-022': `${IMAGE_BASE}/advanced_blocker_tech.png`,// Texture Reading
    'cash-023': `${IMAGE_BASE}/cash_defense_tech.png`,    // Equity Denial
    'cash-024': `${IMAGE_BASE}/cash_value_bet.png`,       // Pot Control
    'cash-025': `${IMAGE_BASE}/cash_deep_stack.png`,      // Boss: Cash King

    // ═══════════════════════════════════════════════════════════════════════
    // SPINS (10) - Yellow Theme
    // ═══════════════════════════════════════════════════════════════════════
    'spins-001': `${IMAGE_BASE}/spins_3max.png`,          // Hyper Opener
    'spins-002': `${IMAGE_BASE}/spins_jackpot.png`,       // Jackpot Pressure
    'spins-003': `${IMAGE_BASE}/spins_endgame.png`,       // Button Limp
    'spins-004': `${IMAGE_BASE}/spins_endgame.png`,       // SNG Endgame
    'spins-005': `${IMAGE_BASE}/spins_3max.png`,          // Phase Shifting
    'spins-006': `${IMAGE_BASE}/spins_turbo_modern.png`,  // Limb Trap
    'spins-007': `${IMAGE_BASE}/mtt_icm_chart.png`,       // 50/50 Survival
    'spins-008': `${IMAGE_BASE}/spins_aggression.png`,// Aggression Mode
    'spins-009': `${IMAGE_BASE}/spins_endgame.png`,       // Chip Lead Lock
    'spins-010': `${IMAGE_BASE}/spins_jackpot.png`,       // Boss: Spin Master

    // ═══════════════════════════════════════════════════════════════════════
    // PSYCHOLOGY (20) - Purple Theme
    // ═══════════════════════════════════════════════════════════════════════
    'psy-001': `${IMAGE_BASE}/psychology_zen.png`,        // Tilt Control
    'psy-002': `${IMAGE_BASE}/psychology_focus.png`,      // Timing Discipline
    'psy-003': `${IMAGE_BASE}/psychology_brain.png`,      // Cooler Cage
    'psy-004': `${IMAGE_BASE}/psychology_pressure.png`,   // Pressure Chamber
    'psy-005': `${IMAGE_BASE}/psychology_zen.png`,        // Patience Master
    'psy-006': `${IMAGE_BASE}/psychology_focus.png`,      // Focus Flow
    'psy-007': `${IMAGE_BASE}/psychology_brain.png`,      // Result Detachment
    'psy-008': `${IMAGE_BASE}/psychology_confidence.png`,// Confidence Builder
    'psy-009': `${IMAGE_BASE}/psychology_focus.png`,      // Fear Eraser
    'psy-010': `${IMAGE_BASE}/psychology_zen.png`,        // Ego Killer
    'psy-011': `${IMAGE_BASE}/psychology_session.png`,   // Session Stamina
    'psy-012': `${IMAGE_BASE}/psychology_pressure.png`,   // Snap Decision
    'psy-013': `${IMAGE_BASE}/psychology_brain.png`,      // Tell Blindness
    'psy-014': `${IMAGE_BASE}/advanced_ev_calc.png`,      // Bankroll Mind
    'psy-015': `${IMAGE_BASE}/psychology_zen.png`,        // Winners Tilt
    'psy-016': `${IMAGE_BASE}/psychology_variance.png`,  // Variance Zen
    'psy-017': `${IMAGE_BASE}/psychology_focus.png`,      // Study Habits
    'psy-018': `${IMAGE_BASE}/psychology_pressure.png`,   // Table Image
    'psy-019': `${IMAGE_BASE}/psychology_focus.png`,      // Autopilot Escape
    'psy-020': `${IMAGE_BASE}/psychology_brain.png`,      // Boss: Mind Master

    // ═══════════════════════════════════════════════════════════════════════
    // ADVANCED (20) - Blue Theme
    // ═══════════════════════════════════════════════════════════════════════
    'adv-001': `${IMAGE_BASE}/advanced_solver_hi.png`,     // Solver Mimicry
    'adv-002': `${IMAGE_BASE}/advanced_blocker_tech.png`,  // Blocker Logic
    'adv-003': `${IMAGE_BASE}/advanced_solver_hi.png`,     // Node Locking
    'adv-004': `${IMAGE_BASE}/advanced_range_chart.png`,   // Range Construction
    'adv-005': `${IMAGE_BASE}/advanced_ev_calc.png`,       // Frequency Math
    'adv-006': `${IMAGE_BASE}/advanced_ev_calc.png`,       // EV Calculations
    'adv-007': `${IMAGE_BASE}/advanced_solver_hi.png`,     // Indifference Theory
    'adv-008': `${IMAGE_BASE}/advanced_range_chart.png`,   // Range Advantage
    'adv-009': `${IMAGE_BASE}/advanced_blocker_tech.png`,  // Nut Advantage
    'adv-010': `${IMAGE_BASE}/advanced_range_chart.png`,   // Board Coverage
    'adv-011': `${IMAGE_BASE}/advanced_spr.png`,          // SPR Mastery
    'adv-012': `${IMAGE_BASE}/advanced_mdf.png`,          // MDF Defender
    'adv-013': `${IMAGE_BASE}/advanced_blocker_tech.png`,  // Combo Counting
    'adv-014': `${IMAGE_BASE}/cash_overbet.png`,           // Bet Sizing Theory
    'adv-015': `${IMAGE_BASE}/advanced_range_chart.png`,   // Population Reads
    'adv-016': `${IMAGE_BASE}/advanced_exploit.png`,      // Exploit Ladder
    'adv-017': `${IMAGE_BASE}/advanced_range_chart.png`,   // Capped Ranges
    'adv-018': `${IMAGE_BASE}/advanced_blocker_tech.png`,  // Polarity Index
    'adv-019': `${IMAGE_BASE}/advanced_solver_hi.png`,     // Solver Scripts
    'adv-020': `${IMAGE_BASE}/advanced_gto.png`,           // Boss: GTO Apex
};

/**
 * Get image URL for a game
 * @param {string} gameId - The game ID (e.g., 'mtt-001')
 * @returns {string|null} Image URL or null if not found
 */
export function getGameImage(gameId) {
    return GAME_IMAGES[gameId] || null;
}

/**
 * Get default category image
 * @param {string} category - Category name (MTT, CASH, SPINS, PSYCHOLOGY, ADVANCED)
 * @returns {string} Default image URL for category
 */
export function getCategoryImage(category) {
    const defaults = {
        MTT: `${IMAGE_BASE}/mtt_final_table.png`,
        CASH: `${IMAGE_BASE}/cash_deep_stack.png`,
        SPINS: `${IMAGE_BASE}/spins_jackpot.png`,
        PSYCHOLOGY: `${IMAGE_BASE}/psychology_brain.png`,
        ADVANCED: `${IMAGE_BASE}/advanced_solver_hi.png`,
    };
    return defaults[category] || defaults.MTT;
}

export default GAME_IMAGES;
