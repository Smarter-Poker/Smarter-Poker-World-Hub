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
 * Scenario Source Levels (from SolverScenarioGenerator):
 *   L1: RFI from EP (UTG, MP, HJ) + stack depth variants
 *   L2: RFI from LP (CO, BTN, SB) + stack depth variants
 *   L3: BB Defense (vs UTG, vs CO, vs BTN, vs SB)
 *   L4: 3-Bet ranges (BTN/SB/BB vs various openers)
 *   L5: Cold Call ranges (CO/BTN flat vs opener)
 *   L6: 4-Bet ranges (facing 3-bet after opening)
 *   L7: Squeeze ranges (3-bet over open + caller)
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
// MTT GAMES — Tournament focus
// ═══════════════════════════════════════════════════════════════════════════

const MTT_MAP: GameScenarioConfig[] = [
    { gameId: 'mtt_01', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20], positions: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'], notes: 'Nash Push/Fold — use 20BB RFI ranges for shove/fold decisions' },
    { gameId: 'mtt_02', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 50], notes: 'ICM Pressure — tighter ranges on bubble, wider when big stack' },
    { gameId: 'mtt_03', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [50, 100], notes: 'Chip Accumulator — standard opens in middle stages' },
    { gameId: 'mtt_04', scenarioLevels: [2, 4, 5], spotTypes: ['rfi', 'vs3bet', 'cold_call'], stackDepths: [50, 100], notes: 'PKO Bounty — wider iso ranges when bounty covers' },
    { gameId: 'mtt_05', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 50], notes: 'Satellite Bubble — survival GTO, tight near bubble' },
    { gameId: 'mtt_06', scenarioLevels: [3], spotTypes: ['bb_defense'], stackDepths: [20], notes: 'Stop-and-Go — BB defense into shove on flop' },
    { gameId: 'mtt_07', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 50], notes: 'Ladder Jump — protect ROI at pay jumps' },
    { gameId: 'mtt_08', scenarioLevels: [3], spotTypes: ['bb_defense'], stackDepths: [20, 50], notes: 'BB Ante Defense — exploit dead money from antes' },
    { gameId: 'mtt_09', scenarioLevels: [4, 7], spotTypes: ['vs3bet', 'squeeze'], stackDepths: [20], notes: 'Re-Steal Shove — 3bet shove light at 20BB' },
    { gameId: 'mtt_10', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [20, 50, 100], notes: 'Ring Mastery — full HU range work' },
    { gameId: 'mtt_11', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [50, 100], notes: 'Bubble Bully — wide opens as big stack on bubble' },
    { gameId: 'mtt_12', scenarioLevels: [7], spotTypes: ['squeeze'], stackDepths: [100], notes: 'Squeeze Play — squeeze over open + caller' },
    { gameId: 'mtt_13', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20], notes: 'Stall Master — tight play near money, clock management' },
    { gameId: 'mtt_14', scenarioLevels: [2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], positions: ['SB', 'BB'], notes: 'BvB Brawl — blind vs blind combat' },
    { gameId: 'mtt_15', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', '4bet', 'squeeze'], stackDepths: [20, 50], notes: 'Post-Flop ICM — all preflop spots at FT stacks' },
    { gameId: 'mtt_16', scenarioLevels: [4, 6], spotTypes: ['vs3bet', '4bet'], stackDepths: [100], notes: '3-Barrel Unblock — bluff selection with blockers' },
    { gameId: 'mtt_17', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Hero Engine — blocker-based hero calls' },
    { gameId: 'mtt_18', scenarioLevels: [4, 6], spotTypes: ['vs3bet', '4bet'], stackDepths: [200], notes: 'Nut Overbet — polarized sizing with deep stacks' },
    { gameId: 'mtt_19', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Check-Trap — inducing bluffs with strong holdings' },
    { gameId: 'mtt_20', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Range Nailer — pot control and range narrowing' },
    { gameId: 'mtt_21', scenarioLevels: [2, 4], spotTypes: ['rfi', 'vs3bet'], stackDepths: [50, 100], notes: 'Bounty Isolation — wider isos in PKO' },
    { gameId: 'mtt_22', scenarioLevels: [2], spotTypes: ['rfi'], positions: ['SB'], stackDepths: [100], notes: 'SB Limp-Stab — SB open/limp strategy' },
    { gameId: 'mtt_23', scenarioLevels: [3], spotTypes: ['bb_defense'], stackDepths: [100], notes: 'Donk-Crusher — responding to weak leads' },
    { gameId: 'mtt_24', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 50, 100], notes: 'Asymmetric Stack — different-depth matchups' },
    { gameId: 'mtt_25', scenarioLevels: [1, 2, 3, 4, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'squeeze'], stackDepths: [20, 50], notes: 'FT Multi-Way — multi-way pots at final table' },
];

// ═══════════════════════════════════════════════════════════════════════════
// CASH GAMES — Cash game focus
// ═══════════════════════════════════════════════════════════════════════════

const CASH_MAP: GameScenarioConfig[] = [
    { gameId: 'cash_01', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [100], notes: '6-Max Blueprint — all 6 position RFI ranges' },
    { gameId: 'cash_02', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Rake-Proof Defense — tighter at high rake' },
    { gameId: 'cash_03', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [200], notes: '200BB Deep Diver — deep stack adjustments' },
    { gameId: 'cash_04', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [200], notes: 'Straddle Sniper — adjusted for bloated pots' },
    { gameId: 'cash_05', scenarioLevels: [4], spotTypes: ['vs3bet'], stackDepths: [100], notes: '3-Bet Factory — all 3-bet spot matchups' },
    { gameId: 'cash_06', scenarioLevels: [3], spotTypes: ['bb_defense'], stackDepths: [100], notes: 'Check-Raise Clinic — BB defense with raises' },
    { gameId: 'cash_07', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Value-Trap — river sizing for max value' },
    { gameId: 'cash_08', scenarioLevels: [5, 7], spotTypes: ['cold_call', 'squeeze'], stackDepths: [100], notes: 'Multi-Way Logic — 3+ player pot decisions' },
    { gameId: 'cash_09', scenarioLevels: [2], spotTypes: ['rfi'], positions: ['CO', 'BTN', 'SB'], stackDepths: [100], notes: 'The Blind Thief — LP stealing ranges' },
    { gameId: 'cash_10', scenarioLevels: [6], spotTypes: ['4bet'], stackDepths: [100], notes: '4-Bet War — facing and making 4-bets' },
    { gameId: 'cash_11', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Turn Probing — OOP turn strategies' },
    { gameId: 'cash_12', scenarioLevels: [1, 2, 4], spotTypes: ['rfi', 'vs3bet'], stackDepths: [100], notes: 'Delay C-Bet — check-back flop, bet turn' },
    { gameId: 'cash_13', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Ace-High Hero — blocker-based defense' },
    { gameId: 'cash_14', scenarioLevels: [7], spotTypes: ['squeeze'], stackDepths: [100], notes: 'The Squeeze — squeeze spot training' },
    { gameId: 'cash_15', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Monotone Board — flush texture awareness' },
    { gameId: 'cash_16', scenarioLevels: [2], spotTypes: ['rfi'], positions: ['SB'], stackDepths: [100], notes: 'SB Limp-Range — SB completion strategy' },
    { gameId: 'cash_17', scenarioLevels: [3], spotTypes: ['bb_defense'], stackDepths: [100], notes: 'Bluff-Catcher — MDF compliance training' },
    { gameId: 'cash_18', scenarioLevels: [1, 2, 4], spotTypes: ['rfi', 'vs3bet'], stackDepths: [100], notes: 'Thin Value Hunter — marginal value bets' },
    { gameId: 'cash_19', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', '4bet', 'cold_call', 'squeeze'], stackDepths: [100], notes: 'Board Coverage — all spots for range interaction' },
    { gameId: 'cash_20', scenarioLevels: [5, 6], spotTypes: ['cold_call', '4bet'], stackDepths: [100], notes: 'Cold 4-Bet — facing opens with 3bet behind' },
    { gameId: 'cash_21', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Texture Awareness — board-dependent sizing' },
    { gameId: 'cash_22', scenarioLevels: [3], spotTypes: ['bb_defense'], stackDepths: [100], notes: 'Donk-Counter — responding to donk bets' },
    { gameId: 'cash_23', scenarioLevels: [1, 2, 5], spotTypes: ['rfi', 'cold_call'], stackDepths: [100, 200], notes: 'Suited Connectors — speculative hand play' },
    { gameId: 'cash_24', scenarioLevels: [4, 6], spotTypes: ['vs3bet', '4bet'], stackDepths: [100], notes: 'Triple Barrel — 3-street bluff construction' },
    { gameId: 'cash_25', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Fish Exploiter — deviations vs weak players' },
];

// ═══════════════════════════════════════════════════════════════════════════
// SPINS GAMES — Spin & Go / SNG focus
// ═══════════════════════════════════════════════════════════════════════════

const SPINS_MAP: GameScenarioConfig[] = [
    { gameId: 'spin_01', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20, 50], notes: 'Hyper Opener — 3-max with 25BB' },
    { gameId: 'spin_02', scenarioLevels: [2], spotTypes: ['rfi'], positions: ['BTN'], stackDepths: [20, 50], notes: 'Button Limp — BTN small-ball strategy' },
    { gameId: 'spin_03', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [20, 50], notes: 'Jackpot Stress — high multiplier adjustments' },
    { gameId: 'spin_04', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [20], notes: 'HU Finisher — heads-up with 10BB' },
    { gameId: 'spin_05', scenarioLevels: [1, 2, 4], spotTypes: ['rfi', 'vs3bet'], stackDepths: [20, 50], notes: 'Redline Pro — aggressive non-showdown winnings' },
    { gameId: 'spin_06', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 50, 100], notes: 'Phase Shift — transitioning between stack depths' },
    { gameId: 'spin_07', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20], notes: '50/50 Survival — SNG bubble ICM' },
    { gameId: 'spin_08', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [20], notes: 'Poverty Drill — extreme short stack play' },
    { gameId: 'spin_09', scenarioLevels: [4], spotTypes: ['vs3bet'], stackDepths: [20], notes: '3-Bet Shove — resteal spots' },
    { gameId: 'spin_10', scenarioLevels: [3], spotTypes: ['bb_defense'], positions: ['BB'], stackDepths: [20, 50], notes: 'Dealer Defense — BB vs BTN at various depths' },
];

// ═══════════════════════════════════════════════════════════════════════════
// PSYCHOLOGY GAMES — Mental game (use basic ranges for context)
// ═══════════════════════════════════════════════════════════════════════════

const PSYCHOLOGY_MAP: GameScenarioConfig[] = [
    { gameId: 'psy_01', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [100], notes: 'The Metronome — timed decisions with standard ranges' },
    { gameId: 'psy_02', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'The Cooler Cage — maintain GTO after bad beats' },
    { gameId: 'psy_03', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'The Reviewer — identify bias in your play' },
    { gameId: 'psy_04', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'The Marathon — long session endurance' },
    { gameId: 'psy_05', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [100], notes: 'The Mucker — resist temptation to see results' },
    { gameId: 'psy_06', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Decision Speed — rapid-fire GTO decisions' },
    { gameId: 'psy_07', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'The Zen Player — calm under pressure' },
    { gameId: 'psy_08', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: "Winner's Tilt — stay disciplined while winning" },
    { gameId: 'psy_09', scenarioLevels: [1, 2, 3, 4, 5], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call'], stackDepths: [100], notes: 'The Multitasker — multi-table attention training' },
    { gameId: 'psy_10', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Self-Awareness — honest assessment of decisions' },
    { gameId: 'psy_11', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Ego Killer — making correct folds' },
    { gameId: 'psy_12', scenarioLevels: [1, 2], spotTypes: ['rfi'], stackDepths: [100], notes: 'Patience Drill — waiting for good spots' },
    { gameId: 'psy_13', scenarioLevels: [4, 6, 7], spotTypes: ['vs3bet', '4bet', 'squeeze'], stackDepths: [100], notes: 'Pressure Plate — high-pressure spot simulation' },
    { gameId: 'psy_14', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [20, 50, 100, 200], notes: 'The Chameleon — adapting to changing conditions' },
    { gameId: 'psy_15', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [100], notes: 'Information Filter — focus on relevant data' },
    { gameId: 'psy_16', scenarioLevels: [1, 2, 3, 4, 5, 6], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet'], stackDepths: [100], notes: 'Intuition Test — gut feel vs solver' },
    { gameId: 'psy_17', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Fortitude — consistency during downswings' },
    { gameId: 'psy_18', scenarioLevels: [1, 2, 3, 4, 5], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call'], stackDepths: [100], notes: 'Focus Lock — concentration training' },
    { gameId: 'psy_19', scenarioLevels: [4, 6, 7], spotTypes: ['vs3bet', '4bet', 'squeeze'], stackDepths: [100], notes: 'Aggro Dial — managing aggression levels' },
    { gameId: 'psy_20', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Process Focus — process over results' },
];

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED GAMES — Elite strategy
// ═══════════════════════════════════════════════════════════════════════════

const ADVANCED_MAP: GameScenarioConfig[] = [
    { gameId: 'adv_01', scenarioLevels: [2, 4], spotTypes: ['rfi', 'vs3bet'], positions: ['CO', 'BTN', 'SB'], stackDepths: [100], notes: 'Aggro Vampire — aggressive redline play' },
    { gameId: 'adv_02', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Meta-Shifter — adapting to current pool tendencies' },
    { gameId: 'adv_03', scenarioLevels: [1, 2, 5], spotTypes: ['rfi', 'cold_call'], stackDepths: [100, 200], notes: 'Equity Guardian — equity realization concepts' },
    { gameId: 'adv_04', scenarioLevels: [4, 6], spotTypes: ['vs3bet', '4bet'], stackDepths: [100], notes: 'Invisible Nut — disguised strong hands' },
    { gameId: 'adv_05', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Flow-State Fix — high-pressure rapid decisions' },
    { gameId: 'adv_06', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [20, 50, 100, 200], notes: 'Context Switcher — rapid format changes' },
    { gameId: 'adv_07', scenarioLevels: [4, 5, 6, 7], spotTypes: ['vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Blocker Matrix — combo counting and blockers' },
    { gameId: 'adv_08', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Range Architect — building ranges from scratch' },
    { gameId: 'adv_09', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Solver Mimicry — match solver outputs exactly' },
    { gameId: 'adv_10', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'The Exploiter — optimal deviations from GTO' },
    { gameId: 'adv_11', scenarioLevels: [4, 6], spotTypes: ['vs3bet', '4bet'], stackDepths: [100, 200], notes: 'Geometry — bet sizing theory' },
    { gameId: 'adv_12', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Node Locker — solving specific game tree nodes' },
    { gameId: 'adv_13', scenarioLevels: [1, 2, 3], spotTypes: ['rfi', 'bb_defense'], stackDepths: [20, 50, 100, 200], notes: 'Asymmetric Combat — unequal stack matchups' },
    { gameId: 'adv_14', scenarioLevels: [3, 5], spotTypes: ['bb_defense', 'cold_call'], stackDepths: [100], notes: 'Indifference — bluff-catching at MDF' },
    { gameId: 'adv_15', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Balance — maintaining balanced frequencies' },
    { gameId: 'adv_16', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'Texture Transpo — multi-street range evolution' },
    { gameId: 'adv_17', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Unexploitable — zero-leak GTO play' },
    { gameId: 'adv_18', scenarioLevels: [1, 2, 3, 4], spotTypes: ['rfi', 'bb_defense', 'vs3bet'], stackDepths: [100], notes: 'HUD Hunter — using stats to exploit' },
    { gameId: 'adv_19', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [100], notes: 'Algorithm — machine-learning-ready play' },
    { gameId: 'adv_20', scenarioLevels: [1, 2, 3, 4, 5, 6, 7], spotTypes: ['rfi', 'bb_defense', 'vs3bet', 'cold_call', '4bet', 'squeeze'], stackDepths: [20, 50, 100, 200], notes: 'Final Solution — all spots, all depths, max difficulty' },
];

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED MAP
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
