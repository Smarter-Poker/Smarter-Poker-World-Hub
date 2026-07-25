/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GAME → SCENARIO MAPPING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Maps each of the 100 training games to the solver scenario levels and
 * spot types that match its focus area. This tells the scenario engine
 * which SolverScenarioGenerator levels to pull from when a player trains
 * in a specific game.
 *
 * GAME IDs MATCH TRAINING_LIBRARY.js EXACTLY — no generic names.
 *
 * Scenario Source Levels (from SolverScenarioGenerator):
 *   L1: RFI from EP (UTG, MP, HJ) + stack depth variants
 *   L2: RFI from LP (CO, BTN, SB) + stack depth variants
 *   L3: BB Defense (vs UTG, vs CO, vs BTN, vs SB)
 *   L4: 3-Bet ranges (BTN/SB/BB vs various openers)
 *   L5: Cold Call ranges (CO/BTN flat vs opener)
 *   L6: 4-Bet ranges (facing 3-bet after opening)
 *   L7: Squeeze ranges (3-bet over open + caller)
 *   L8: Flop decisions (c-bet, check-raise, float) — PostflopScenarioGenerator
 *   L9: Turn decisions (barrel, give up, raise) — PostflopScenarioGenerator
 *   L10: River decisions (value bet, bluff, hero call) — PostflopScenarioGenerator
 *
 * Each mapping specifies:
 *   - scenarioLevels: which generator levels to pull scenarios from
 *   - spotTypes: which spot types are relevant (rfi, vs3bet, bb_defense, cold_call, 4bet, squeeze)
 *   - stackDepths: preferred stack depths (defaults to [100])
 *   - positions: preferred hero positions (defaults to all)
 *   - notes: how to customize for this game's specific focus
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface GameScenarioConfig {
    gameId: string;
    scenarioLevels: number[];
    spotTypes: string[];
    stackDepths?: number[];
    positions?: string[];
    notes: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MTT GAMES (25) — IDs match TRAINING_LIBRARY exactly
// ═══════════════════════════════════════════════════════════════════════════

const MTT_MAP: GameScenarioConfig[] = [
    { gameId: 'mtt-001', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20], positions: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'], notes: 'Push/Fold Mastery — Nash shove/fold with 20BB RFI ranges' },
    { gameId: 'mtt-002', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 40], notes: 'ICM Fundamentals — tighter ranges on bubble, wider as big stack' },
    { gameId: 'mtt-003', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20, 40], notes: 'Bubble Pressure — survival-focused opens near money' },
    { gameId: 'mtt-004', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', '4bet', 'squeeze'], stackDepths: [20, 40], notes: 'Final Table ICM — all preflop spots at FT stacks' },
    { gameId: 'mtt-005', scenarioLevels: [2, 4, 5], spotTypes: ['rfi', 'vs3bet', 'cold_call'], stackDepths: [40, 100], notes: 'PKO Bounty Hunter — wider iso ranges when bounty covers' },
    { gameId: 'mtt-006', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 40], notes: 'Satellite Survival — extreme ICM discipline near bubble' },
    { gameId: 'mtt-007', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [40, 100], notes: 'Deep Stack MTT — early tournament open ranges' },
    { gameId: 'mtt-008', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20], notes: 'Short Stack Ninja — 10-20BB shove/open mastery' },
    { gameId: 'mtt-009', scenarioLevels: [4, 7], spotTypes: ['vs3bet', 'squeeze'], stackDepths: [20], notes: 'Resteal Wars — 3bet shove defense at 20BB' },
    { gameId: 'mtt-010', scenarioLevels: [7], spotTypes: ['squeeze'], stackDepths: [100], notes: 'Squeeze Master — squeeze over open + caller' },
    { gameId: 'mtt-011', scenarioLevels: [3], spotTypes: ['bb_defense'], stackDepths: [20, 40], notes: 'Ante Theft — exploit dead money from BB antes' },
    { gameId: 'mtt-012', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [40, 100], notes: 'Big Stack Bully — wide opens as covering stack' },
    { gameId: 'mtt-013', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 40], notes: 'Ladder Jump — protect ROI at pay jumps' },
    { gameId: 'mtt-014', scenarioLevels: [2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], positions: ['SB', 'BB'], notes: '3-Max Blitz — final 3 blind vs blind aggression' },
    { gameId: 'mtt-015', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [20, 40, 100], notes: 'Heads Up Duel — 1v1 tournament finale range work' },
    { gameId: 'mtt-016', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20], notes: 'Chip & Chair — micro-stack comeback ranges' },
    { gameId: 'mtt-017', scenarioLevels: [3], spotTypes: ['bb_defense'], stackDepths: [20, 40, 100], notes: 'Blind Defense MTT — tournament BB defense' },
    { gameId: 'mtt-018', scenarioLevels: [2], spotTypes: ['rfi'], positions: ['BTN'], stackDepths: [100], notes: 'Button Warfare — BTN open/defend ranges' },
    { gameId: 'mtt-019', scenarioLevels: [3], spotTypes: ['bb_defense'], stackDepths: [20], notes: 'Stop & Go — BB defense into delayed shove' },
    { gameId: 'mtt-020', scenarioLevels: [2, 4], spotTypes: ['rfi', 'vs3bet'], stackDepths: [40, 100], notes: 'Multi-way Bounty — PKO pot odds overlay' },
    { gameId: 'mtt-021', scenarioLevels: [8, 9, 10], spotTypes: ['cbet', 'turn_barrel', 'river_bluff'], stackDepths: [100], notes: 'Check-Shove Power — postflop aggression after preflop 3bet' },
    { gameId: 'mtt-022', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20], notes: 'Clock Management — tight time bank strategy' },
    { gameId: 'mtt-023', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Registration Edge — late reg stack advantages' },
    { gameId: 'mtt-024', scenarioLevels: [8, 9, 10], spotTypes: ['cbet', 'turn_barrel', 'river_bluff'], stackDepths: [100], notes: 'Triple Barrel — MTT 3-street bluff construction' },
    { gameId: 'mtt-025', scenarioLevels: [1, 2, 3, 4, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'squeeze'], stackDepths: [20, 40], notes: 'MTT Champion — full tourney simulation, all spots' },
    // Named MTT games
    { gameId: 'tournament-prep', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 40, 100], notes: 'Tournament Prep — ICM structure planner' },
    { gameId: 'final-table-sim', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', '4bet', 'squeeze'], stackDepths: [20, 40], notes: 'Final Table Sim — ICM $equity analysis at FT' },
];

// ═══════════════════════════════════════════════════════════════════════════
// CASH GAMES (25) — IDs match TRAINING_LIBRARY exactly
// ═══════════════════════════════════════════════════════════════════════════

const CASH_MAP: GameScenarioConfig[] = [
    { gameId: 'cash-001', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [100], notes: 'Preflop Blueprint — all 6 position RFI ranges' },
    { gameId: 'cash-002', scenarioLevels: [1, 2, 3, 8], spotTypes: ['rfi', 'bb_defense', 'cbet'], stackDepths: [100], notes: 'C-Bet Academy — continuation bet spots (now with postflop L8)' },
    { gameId: 'cash-003', scenarioLevels: [3, 5, 8], spotTypes: ['bb_defense', 'cold_call', 'check_raise'], stackDepths: [100], notes: 'Defense Matrix — facing aggression (with flop defense)' },
    { gameId: 'cash-004', scenarioLevels: [3, 5, 9, 10], spotTypes: ['bb_defense', 'cold_call', 'turn_barrel', 'river_value'], stackDepths: [100], notes: 'Value Extractor — thin value betting spots (turn + river)' },
    { gameId: 'cash-005', scenarioLevels: [3, 5, 10], spotTypes: ['bb_defense', 'cold_call', 'river_bluff_catcher'], stackDepths: [100], notes: 'Bluff Catcher — hero call decisions (river L10)' },
    { gameId: 'cash-006', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [100], notes: 'Position Power — IP vs OOP dynamics' },
    { gameId: 'cash-007', scenarioLevels: [4], spotTypes: ['vs3bet'], stackDepths: [100], notes: '3-Bet Pots — elevated pot strategy' },
    { gameId: 'cash-008', scenarioLevels: [6], spotTypes: ['4bet'], stackDepths: [100], notes: '4-Bet Wars — pre-flop escalation' },
    { gameId: 'cash-009', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [200], notes: 'Deep Stack Cash — 200BB+ strategy adjustments' },
    { gameId: 'cash-010', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [40], notes: 'Short Stack Rat — 40BB hit-and-run ranges' },
    { gameId: 'cash-011', scenarioLevels: [3, 8], spotTypes: ['bb_defense', 'cbet'], stackDepths: [100], notes: 'Donk Defense — facing lead bets (flop postflop)' },
    { gameId: 'cash-012', scenarioLevels: [3, 5, 10], spotTypes: ['bb_defense', 'cold_call', 'river_value', 'river_bluff'], stackDepths: [100], notes: 'River Decisions — final street mastery (L10 river)' },
    { gameId: 'cash-013', scenarioLevels: [3, 5, 9], spotTypes: ['bb_defense', 'cold_call', 'turn_barrel'], stackDepths: [100], notes: 'Probe Betting — taking the initiative (turn L9)' },
    { gameId: 'cash-014', scenarioLevels: [3, 8], spotTypes: ['bb_defense', 'check_raise'], stackDepths: [100], notes: 'Check-Raise Art — BB check-raise defense (flop L8)' },
    { gameId: 'cash-015', scenarioLevels: [4, 6, 10], spotTypes: ['vs3bet', '4bet', 'river_value'], stackDepths: [100, 200], notes: 'Overbetting — polarized big bet sizing (river L10)' },
    { gameId: 'cash-016', scenarioLevels: [5, 7], spotTypes: ['cold_call', 'squeeze'], stackDepths: [100], notes: 'Multi-way Pots — 3+ player dynamics' },
    { gameId: 'cash-017', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Rake Awareness — rake-adjusted ranges' },
    { gameId: 'cash-018', scenarioLevels: [2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], positions: ['SB', 'BB'], notes: 'Blind vs Blind — SB vs BB warfare' },
    { gameId: 'cash-019', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [200], notes: 'Straddle Games — extended pot dynamics' },
    { gameId: 'cash-020', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Table Selection — finding soft spots' },
    { gameId: 'cash-021', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Mixed Strategies — frequency execution across all spots' },
    { gameId: 'cash-022', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Texture Reading — board analysis' },
    { gameId: 'cash-023', scenarioLevels: [1, 2, 5], spotTypes: ['rfi', 'cold_call'], stackDepths: [100], notes: 'Equity Denial — protection betting' },
    { gameId: 'cash-024', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Pot Control — medium strength hand play' },
    { gameId: 'cash-025', scenarioLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze', 'cbet', 'turn_barrel', 'river_value', 'river_bluff'], stackDepths: [100], notes: 'Cash King — full session grind, all spots including postflop' },
];

// ═══════════════════════════════════════════════════════════════════════════
// SPINS (10) — IDs match TRAINING_LIBRARY exactly
// ═══════════════════════════════════════════════════════════════════════════

const SPINS_MAP: GameScenarioConfig[] = [
    { gameId: 'spins-001', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20, 40], notes: 'Hyper Opener — 3-max early game opens' },
    { gameId: 'spins-002', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [20, 40], notes: 'Jackpot Pressure — high multiplier play adjustments' },
    { gameId: 'spins-003', scenarioLevels: [2], spotTypes: ['rfi'], positions: ['BTN'], stackDepths: [20, 40], notes: 'Button Limp — BTN trap strategies' },
    { gameId: 'spins-004', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [20], notes: 'SNG Endgame — final 2 HU battles' },
    { gameId: 'spins-005', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 40, 100], notes: 'Phase Shifting — stack depth transitions' },
    { gameId: 'spins-006', scenarioLevels: [1, 2, 4], spotTypes: ['rfi', 'vs3bet'], stackDepths: [20, 40], notes: 'Limb Trap — limp-call lines' },
    { gameId: 'spins-007', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20], notes: '50/50 Survival — extreme SNG ICM' },
    { gameId: 'spins-008', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20], notes: 'Aggression Mode — constant pressure play' },
    { gameId: 'spins-009', scenarioLevels: [4], spotTypes: ['vs3bet'], stackDepths: [20], notes: 'Chip Lead Lock — protecting the lead with 3bet defense' },
    { gameId: 'spins-010', scenarioLevels: [3], spotTypes: ['bb_defense'], positions: ['BB'], stackDepths: [20, 40], notes: 'Spin Master — BB defense across all depths' },
];

// ═══════════════════════════════════════════════════════════════════════════
// PSYCHOLOGY (20) — IDs match TRAINING_LIBRARY exactly
// ═══════════════════════════════════════════════════════════════════════════

const PSYCHOLOGY_MAP: GameScenarioConfig[] = [
    { gameId: 'psy-001', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [100], notes: 'Tilt Control — timed decisions with standard ranges' },
    { gameId: 'psy-002', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [100], notes: 'Timing Discipline — consistent action speed' },
    { gameId: 'psy-003', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Cooler Cage — maintain GTO after bad beats' },
    { gameId: 'psy-004', scenarioLevels: [4, 6, 7], spotTypes: ['vs3bet', '4bet', 'squeeze'], stackDepths: [100], notes: 'Pressure Chamber — high-pressure spot simulation' },
    { gameId: 'psy-005', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [100], notes: 'Patience Master — waiting for correct spots' },
    { gameId: 'psy-006', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Focus Flow — concentration drills via rapid-fire GTO' },
    { gameId: 'psy-007', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Result Detachment — process over outcome' },
    { gameId: 'psy-008', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Confidence Builder — trust your reads' },
    { gameId: 'psy-009', scenarioLevels: [4, 6, 7], spotTypes: ['vs3bet', '4bet', 'squeeze'], stackDepths: [100], notes: 'Fear Eraser — bold decision making in big pots' },
    { gameId: 'psy-010', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Ego Killer — making correct folds' },
    { gameId: 'psy-011', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Session Stamina — long session endurance, all spots' },
    { gameId: 'psy-012', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Snap Decision — rapid-fire instinct training' },
    { gameId: 'psy-013', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Tell Blindness — ignore false reads, play GTO' },
    { gameId: 'psy-014', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [20, 40, 100, 200], notes: 'Bankroll Mind — money management across depths' },
    { gameId: 'psy-015', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: "Winners Tilt — staying disciplined while ahead" },
    { gameId: 'psy-016', scenarioLevels: [1, 2, 3, 4, 5, 6], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet'], stackDepths: [100], notes: 'Variance Zen — accepting swings via consistent GTO' },
    { gameId: 'psy-017', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Study Habits — effective learning via solver work' },
    { gameId: 'psy-018', scenarioLevels: [1, 2, 3, 4, 5], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call'], stackDepths: [100], notes: 'Table Image — perception awareness' },
    { gameId: 'psy-019', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Autopilot Escape — stay present with varied spots' },
    { gameId: 'psy-020', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Mind Master — full mental game integration' },
];

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED (20) — IDs match TRAINING_LIBRARY exactly
// ═══════════════════════════════════════════════════════════════════════════

const ADVANCED_MAP: GameScenarioConfig[] = [
    { gameId: 'adv-001', scenarioLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze', 'cbet', 'check_raise', 'turn_barrel', 'river_value'], stackDepths: [100], notes: 'Solver Mimicry — match solver outputs exactly (now with postflop)' },
    { gameId: 'adv-002', scenarioLevels: [4, 5, 6, 7], spotTypes: ['vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Blocker Logic — combo counting and card removal' },
    { gameId: 'adv-003', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Node Locking — exploitative game tree deviations' },
    { gameId: 'adv-004', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Range Construction — building ranges from scratch' },
    { gameId: 'adv-005', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Frequency Math — mixed strategy percentage execution' },
    { gameId: 'adv-006', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'EV Calculations — expected value math' },
    { gameId: 'adv-007', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Indifference Theory — MDF and making villains neutral' },
    { gameId: 'adv-008', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Range Advantage — equity distribution across positions' },
    { gameId: 'adv-009', scenarioLevels: [4, 6], spotTypes: ['vs3bet', '4bet'], stackDepths: [100], notes: 'Nut Advantage — polarization spots' },
    { gameId: 'adv-010', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Board Coverage — range composition across all spots' },
    { gameId: 'adv-011', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'SPR Mastery — stack-to-pot ratio awareness' },
    { gameId: 'adv-012', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'MDF Defender — minimum defense frequency' },
    { gameId: 'adv-013', scenarioLevels: [4, 5, 6, 7], spotTypes: ['vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Combo Counting — hand combinations math' },
    { gameId: 'adv-014', scenarioLevels: [4, 6], spotTypes: ['vs3bet', '4bet'], stackDepths: [100], notes: 'Bet Sizing Theory — geometric sizing' },
    { gameId: 'adv-015', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Population Reads — pool tendency exploitation' },
    { gameId: 'adv-016', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Exploit Ladder — deviation strategy' },
    { gameId: 'adv-017', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Capped Ranges — playing condensed range' },
    { gameId: 'adv-018', scenarioLevels: [4, 6], spotTypes: ['vs3bet', '4bet'], stackDepths: [100], notes: 'Polarity Index — range splitting' },
    { gameId: 'adv-019', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Solver Scripts — simulation interpretation' },
    { gameId: 'adv-020', scenarioLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze', 'cbet', 'check_raise', 'turn_barrel', 'river_value', 'river_bluff'], stackDepths: [100], notes: 'GTO Apex — ultimate theory test, all spots, all depths, all streets' },
    // Named Advanced games
    { gameId: 'quiz-gauntlet', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Quiz Gauntlet — high-speed GTO blitz across all spots' },
    { gameId: 'hand-lab', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Hand Lab V2 — interactive equity builder' },
    { gameId: 'bluff-catcher', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Bluff Catcher — MDF & hand reading' },
    { gameId: 'mixed-strategy-lab', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Mixed Strategy Lab — frequency EV visualizer' },
    { gameId: 'study-group', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Study Group — collaborative hand review' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MASTER MAP (all 100+ games combined)
// ═══════════════════════════════════════════════════════════════════════════

export const GAME_SCENARIO_MAP: GameScenarioConfig[] = [
    ...MTT_MAP,
    ...CASH_MAP,
    ...SPINS_MAP,
    ...PSYCHOLOGY_MAP,
    ...ADVANCED_MAP,
];

/** Lookup a game's scenario config by ID */
export function getGameScenarioConfig(gameId: string): GameScenarioConfig | undefined {
    return GAME_SCENARIO_MAP.find(g => g.gameId === gameId);
}

/** Get all games that use a specific scenario level */
export function getGamesByScenarioLevel(level: number): GameScenarioConfig[] {
    return GAME_SCENARIO_MAP.filter(g => g.scenarioLevels.includes(level));
}

/** Get all games that use a specific spot type */
export function getGamesBySpotType(spotType: string): GameScenarioConfig[] {
    return GAME_SCENARIO_MAP.filter(g => g.spotTypes.includes(spotType));
}
