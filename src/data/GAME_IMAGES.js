/**
 * 🎨 GAME IMAGES MAPPING
 * Maps every training game ID to a specific asset in public/images/training/
 * Uses intelligent reuse for 100% coverage.
 */

export const GAME_IMAGES = {
    // ═══════════════════════════════════════════════════════════════════════
    // MTT GAMES (25)
    // ═══════════════════════════════════════════════════════════════════════
    'mtt-001': '/images/training/mtt_push_fold.png',           // Push/Fold Mastery
    'mtt-002': '/images/training/mtt_icm_chart.png',           // ICM Fundamentals
    'mtt-003': '/images/training/mtt_bubble_tech.png',         // Bubble Pressure
    'mtt-004': '/images/training/mtt_final_table.png',         // Final Table ICM
    'mtt-005': '/images/training/mtt_pko_bounty.png',          // PKO Bounty Hunter
    'mtt-006': '/images/training/mtt_satellite.png',           // Satellite Survival
    'mtt-007': '/images/training/mtt_deep_stack.png',          // Deep Stack MTT (Reuse cash deep stack logic or similar?) -> mapped to generic if needed, but we likely have one. Using mtt_bubble_tech fallback if specific missing, but we generated chip_chair. 
    // Wait, generated images need to be copied with specific names.
    // Let's use the filenames we will copy to.

    'mtt-007': '/images/training/cash_deep_stack.png',         // Deep Stack MTT (Reuse Cash Deep Stack - safe reuse)
    'mtt-008': '/images/training/mtt_short_stack.png',         // Short Stack Ninja
    'mtt-009': '/images/training/mtt_resteal.png',             // Resteal Wars
    'mtt-010': '/images/training/mtt_squeeze.png',             // Squeeze Master
    'mtt-011': '/images/training/mtt_ante_theft.png',          // Ante Theft
    'mtt-012': '/images/training/mtt_boss_champion.png',       // Big Stack Bully (The Boss image works well here too)
    'mtt-013': '/images/training/mtt_ladder_jump.png',         // Ladder Jump
    'mtt-014': '/images/training/mtt_3max_blitz.png',          // 3-Max Blitz (We have this? If not, use generic) -> Let's check listing.
    // From listing: mtt_3max_blitz_... existing. Yes. 
    // Using simple names that deploy script will enforce.

    'mtt-015': '/images/training/mtt_headsup.png',             // Heads Up Duel
    'mtt-016': '/images/training/mtt_chip_chair.png',          // Chip & Chair (NEW)
    'mtt-017': '/images/training/mtt_blind_defense.png',       // Blind Defense (NEW)
    'mtt-018': '/images/training/mtt_button_warfare.png',      // Button Warfare
    'mtt-019': '/images/training/mtt_stop_go.png',             // Stop & Go (NEW)
    'mtt-020': '/images/training/mtt_multiway_bounty.png',     // Multi-way Bounty (NEW)
    'mtt-021': '/images/training/mtt_check_shove_power.png',   // Check-Shove Power (NEW)
    'mtt-022': '/images/training/mtt_clock_management.png',    // Clock Management (NEW)
    'mtt-023': '/images/training/mtt_registration_edge.png',   // Registration Edge (NEW)
    'mtt-024': '/images/training/mtt_triple_barrel.png',       // Triple Barrel (NEW)
    'mtt-025': '/images/training/mtt_boss_champion.png',       // Boss: MTT Champion

    // ═══════════════════════════════════════════════════════════════════════
    // CASH GAMES (25)
    // ═══════════════════════════════════════════════════════════════════════
    'cash-001': '/images/training/cash_preflop.png',           // Preflop Blueprint
    'cash-002': '/images/training/cash_cbet_mastery.png',      // C-Bet Academy
    'cash-003': '/images/training/cash_defense_tech.png',      // Defense Matrix
    'cash-004': '/images/training/cash_value_bet.png',         // Value Extractor
    'cash-005': '/images/training/cash_bluff_catcher.png',     // Bluff Catcher
    'cash-006': '/images/training/cash_position_power.png',    // Position Power (NEW)
    'cash-007': '/images/training/cash_3bet_pots.png',         // 3-Bet Pots
    'cash-008': '/images/training/cash_4bet_war.png',          // 4-Bet Wars
    'cash-009': '/images/training/cash_deep_stack.png',        // Deep Stack Cash
    'cash-010': '/images/training/mtt_short_stack.png',        // Short Stack Rat (Reuse MTT short stack)
    'cash-011': '/images/training/cash_defense_tech.png',      // Donk Defense (Reuse Defense)
    'cash-012': '/images/training/cash_river_decision.png',    // River Decisions
    'cash-013': '/images/training/cash_probe_bet.png',         // Probe Betting
    'cash-014': '/images/training/cash_check_raise.png',       // Check-Raise Art (Have explicit 'cash_check_raise' in file list? Yes: cash_check_raise_...)
    'cash-015': '/images/training/cash_overbet.png',           // Overbetting
    'cash-016': '/images/training/cash_multiway.png',          // Multi-way Pots
    'cash-017': '/images/training/advanced_ev_calc.png',       // Rake Awareness (Reuse EV calc)
    'cash-018': '/images/training/cash_preflop.png',           // Blind vs Blind (Reuse Preflop)
    'cash-019': '/images/training/cash_deep_stack.png',        // Straddle Games (Reuse Deep Stack)
    'cash-020': '/images/training/cash_value_bet.png',         // Table Selection (Reuse Value)
    'cash-021': '/images/training/advanced_frequency.png',     // Mixed Strategies (Reuse Advanced Frequency? Need to check if have advanced_frequency. List has advanced_gto, advanced_mdf, advanced_polarity. Use Polarity)
    'cash-021': '/images/training/advanced_polarity.png',      // Mixed Strategies
    'cash-022': '/images/training/advanced_blocker_tech.png',  // Texture Reading (Reuse Blocker)
    'cash-023': '/images/training/cash_equity_denial.png',     // Equity Denial
    'cash-024': '/images/training/cash_cbet_wide.png',         // Pot Control (Reuse Cbet Wide)
    'cash-025': '/images/training/cash_value_bet.png',         // Boss: Cash King (Using value bet art)

    // ═══════════════════════════════════════════════════════════════════════
    // SPINS (10)
    // ═══════════════════════════════════════════════════════════════════════
    'spins-001': '/images/training/spins_3max.png',            // Hyper Opener
    'spins-002': '/images/training/spins_jackpot.png',         // Jackpot Pressure
    'spins-003': '/images/training/spins_limp_trap.png',       // Button Limp
    'spins-004': '/images/training/spins_endgame.png',         // SNG Endgame
    'spins-005': '/images/training/spins_phase_shift.png',     // Phase Shifting
    'spins-006': '/images/training/spins_limp_trap.png',       // Limb Trap
    'spins-007': '/images/training/mtt_icm_modern.png',        // 50/50 Survival (Reuse ICM)
    'spins-008': '/images/training/spins_aggression.png',      // Aggression Mode (Check list... spins_aggression_... exists)
    'spins-009': '/images/training/spins_jackpot_wide.png',    // Chip Lead Lock (Reuse Jackpot Wide)
    'spins-010': '/images/training/spins_jackpot.png',         // Boss: Spin Master (Using jackpot art)

    // ═══════════════════════════════════════════════════════════════════════
    // PSYCHOLOGY (20)
    // ═══════════════════════════════════════════════════════════════════════
    'psy-001': '/images/training/psychology_tilt_control.png', // Tilt Control
    'psy-002': '/images/training/mtt_clock_management.png',    // Timing Discipline (Reuse Clock)
    'psy-003': '/images/training/psychology_variance.png',     // Cooler Cage (Reuse Variance)
    'psy-004': '/images/training/psychology_pressure.png',     // Pressure Chamber
    'psy-005': '/images/training/psychology_zen.png',          // Patience Master
    'psy-006': '/images/training/psychology_focus.png',        // Focus Flow
    'psy-007': '/images/training/psychology_zen.png',          // Result Detachment
    'psy-008': '/images/training/psychology_confidence.png',   // Confidence Builder
    'psy-009': '/images/training/psychology_pressure.png',     // Fear Eraser
    'psy-010': '/images/training/psychology_brain.png',        // Ego Killer
    'psy-011': '/images/training/psychology_session.png',      // Session Stamina
    'psy-012': '/images/training/psychology_focus.png',        // Snap Decision
    'psy-013': '/images/training/psychology_tilt_control.png', // Tell Blindness
    'psy-014': '/images/training/advanced_ev_calc.png',        // Bankroll Mind (Reuse EV)
    'psy-015': '/images/training/psychology_confidence.png',   // Winners Tilt
    'psy-016': '/images/training/psychology_variance.png',     // Variance Zen
    'psy-017': '/images/training/psychology_session.png',      // Study Habits
    'psy-018': '/images/training/psychology_brain.png',        // Table Image
    'psy-019': '/images/training/psychology_focus.png',        // Autopilot Escape
    'psy-020': '/images/training/psychology_brain.png',        // Boss: Mind Master (Using brain art)

    // ═══════════════════════════════════════════════════════════════════════
    // ADVANCED (20)
    // ═══════════════════════════════════════════════════════════════════════
    'adv-001': '/images/training/advanced_solver_hi.png',      // Solver Mimicry
    'adv-002': '/images/training/advanced_blocker_tech.png',   // Blocker Logic
    'adv-003': '/images/training/advanced_node_lock.png',      // Node Locking
    'adv-004': '/images/training/advanced_range_chart.png',    // Range Construction
    'adv-005': '/images/training/advanced_gto.png',            // Frequency Math
    'adv-006': '/images/training/advanced_ev_calc.png',        // EV Calculations
    'adv-007': '/images/training/advanced_mdf.png',            // Indifference Theory
    'adv-008': '/images/training/advanced_range_chart.png',    // Range Advantage
    'adv-009': '/images/training/advanced_polarity.png',       // Nut Advantage
    'adv-010': '/images/training/advanced_range_chart.png',    // Board Coverage
    'adv-011': '/images/training/advanced_spr.png',            // SPR Mastery
    'adv-012': '/images/training/advanced_mdf.png',            // MDF Defender
    'adv-013': '/images/training/advanced_blocker_tech.png',   // Combo Counting
    'adv-014': '/images/training/advanced_solver_hi.png',      // Bet Sizing Theory
    'adv-015': '/images/training/advanced_exploit.png',        // Population Reads
    'adv-016': '/images/training/advanced_exploit.png',        // Exploit Ladder
    'adv-017': '/images/training/advanced_range_chart.png',    // Capped Ranges
    'adv-018': '/images/training/advanced_polarity.png',       // Polarity Index
    'adv-019': '/images/training/advanced_solver_hi.png',      // Solver Scripts
    'adv-020': '/images/training/advanced_gto.png',            // Boss: GTO Apex (Using GTO art)
};

export const getGameImage = (gameId) => {
    return GAME_IMAGES[gameId] || '/images/training/mtt_game_card_art.png'; // Fallback
};

export default GAME_IMAGES;
