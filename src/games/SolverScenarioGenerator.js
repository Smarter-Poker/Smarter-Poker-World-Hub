/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOLVER SCENARIO GENERATOR — Builds Training Scenarios from Solver Data
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Replaces the 18,000+ lines of stale hardcoded scenarios (levels 2-10)
 * with dynamically generated, solver-accurate scenarios derived directly
 * from solverRanges.js.
 *
 * Level → Spot Type Mapping:
 *   Level 1: RFI from early positions (UTG, MP, HJ) + stack depth variants
 *   Level 2: RFI from late positions (CO, BTN, SB) + stack depth variants
 *   Level 3: BB Defense (vs UTG, vs CO, vs BTN, vs SB)
 *   Level 4: 3-Bet ranges (BTN/SB/BB vs various openers)
 *   Level 5: Cold Call ranges (CO/BTN flat vs opener)
 *   Level 6: 4-Bet ranges (facing a 3-bet after opening)
 *   Level 7: Squeeze ranges (3-bet over open + caller)
 *   Level 8-10: Reserved for post-flop (not yet populated)
 *
 * Each generated scenario has:
 *   - Solver-accurate solution with raise/call/fold for every hand
 *   - Mixed-frequency data built in (no enrichment bridge needed)
 *   - Proper position, vsPosition, stackDepth metadata
 *   - Human-readable titles, descriptions, and tips
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
    RFI, THREE_BET, BB_DEFENSE, FOUR_BET, SQUEEZE, COLD_CALL,
    RFI_20BB, RFI_50BB, RFI_200BB,
    ALL_HANDS, getHandFrequencies, getRFIByDepth,
} from '../config/solverRanges';

// ── Threshold: solver freq must be ≥ this to count as "in range" ────────
const IN_RANGE_THRESHOLD = 0.10;

/**
 * Build a binary solution object from solver spot data.
 * Maps each hand to its primary action ('raise', 'call', or 'fold')
 * and also builds the enrichedSolution with full frequencies.
 *
 * Only hands with (raise + call) >= IN_RANGE_THRESHOLD are included in the
 * binary solution. The enrichedSolution includes ALL hands that have any action.
 */
function buildSolutionFromSpot(spotData) {
    const solution = {};
    const enrichedSolution = {};

    for (const hand of ALL_HANDS) {
        const f = getHandFrequencies(spotData, hand);
        const totalAction = f.raise + f.call;

        // Always build enriched solution for any hand with action
        if (totalAction > 0.02) {
            enrichedSolution[hand] = {
                primaryAction: f.raise >= f.call ? 'raise' : 'call',
                raise: f.raise,
                call: f.call,
                fold: f.fold,
            };
        }

        // Binary solution: only include clearly in-range hands
        if (totalAction >= IN_RANGE_THRESHOLD) {
            if (f.raise >= f.call && f.raise >= 0.05) {
                solution[hand] = 'raise';
            } else if (f.call >= 0.05) {
                solution[hand] = 'call';
            }
        }
    }

    return { solution, enrichedSolution };
}

/**
 * Create a single scenario object with full metadata.
 */
function makeScenario({ id, level, title, description, tip, position, vsPosition, stackDepth, spotData, spotType }) {
    const { solution, enrichedSolution } = buildSolutionFromSpot(spotData);

    return {
        id,
        level,
        title,
        description,
        tip,
        position,
        vsPosition: vsPosition || null,
        stackDepth: stackDepth || 100,
        spotType: spotType || 'rfi',
        solution,
        enrichedSolution,
        hasMixedFrequencies: true,
        solverGenerated: true,  // Flag: this came from solver data, not hardcoded
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 1: RFI from Early Positions (UTG, MP/HJ) — Foundations
// ═══════════════════════════════════════════════════════════════════════════
// Previously hardcoded in ScenarioDatabase.js. Now generated from solver data
// so L1 has the same mixed-frequency enrichedSolution as every other level.

function generateLevel1() {
    const scenarios = [];

    // Core EP opens at 100BB — the tightest ranges, perfect for beginners
    const earlyPositions = [
        { pos: 'UTG', label: 'Under The Gun', desc: 'The Tightest Opening Range. Only Premium Hands.', tip: 'Focus On Pairs TT+, Broadway Suited, And Strong Offsuit Broadways.' },
        { pos: 'MP', label: 'Middle Position', desc: 'Slightly Wider Than UTG. Add Some Suited Connectors.', tip: 'Include 66+, More Suited Ax, And K9s+.' },
        { pos: 'HJ', label: 'Hijack', desc: 'The Widest Early Position. Transition to Late Position Opens.', tip: 'Add 55, 44, More Offsuit Broadways, And Suited Gappers.' },
    ];

    for (const { pos, label, desc, tip } of earlyPositions) {
        const spotData = RFI[pos];
        if (!spotData) continue;
        scenarios.push(makeScenario({
            id: `l1-rfi-${pos.toLowerCase()}-100bb`, level: 1,
            title: `${label} (${pos}) Open — 100BB`,
            description: desc, tip,
            position: pos, stackDepth: 100, spotData, spotType: 'rfi',
        }));
    }

    // Stack depth variants for EP — teaches that ranges change with stack depth
    const depthVariants = [
        { depth: 50, data: RFI_50BB, label: '50BB', desc: 'Shorter Stack Range. Tighter Than 100BB — Cut Speculative Hands.', tip: 'Cut Some Suited Connectors, Focus On High Card Strength.' },
        { depth: 200, data: RFI_200BB, label: '200BB', desc: 'Deep Stack Range. Can Add More Speculative Hands For Implied Odds.', tip: 'Add Small Pairs And More Suited Connectors For Set-Mining And Straight Potential.' },
    ];

    for (const { depth, data, label, desc, tip } of depthVariants) {
        for (const pos of ['UTG', 'MP']) {
            const spotData = data?.[pos] || data?.['UTG'];
            if (!spotData) continue;
            scenarios.push(makeScenario({
                id: `l1-rfi-${pos.toLowerCase()}-${depth}bb`, level: 1,
                title: `${pos} Open — ${label}`,
                description: `${pos} opening range at ${label} effective stacks. ${desc}`,
                tip, position: pos, stackDepth: depth, spotData, spotType: 'rfi',
            }));
        }
    }

    // 20BB short-stack for UTG — crucial for tournament foundations
    const shortStackData = RFI_20BB?.['UTG'];
    if (shortStackData) {
        scenarios.push(makeScenario({
            id: 'l1-rfi-utg-20bb', level: 1,
            title: 'UTG Open — 20BB (Short Stack)',
            description: 'Short stack UTG range. Very tight — no implied odds for speculative hands.',
            tip: 'At 20BB, open-shove range diverges from raise range. Focus on high-equity hands.',
            position: 'UTG', stackDepth: 20, spotData: shortStackData, spotType: 'rfi',
        }));
    }

    return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 2: RFI from Late Positions + Stack Depth Variants
// ═══════════════════════════════════════════════════════════════════════════

function generateLevel2() {
    const scenarios = [];
    let idx = 0;

    // CO, BTN, SB opens at 100BB (the standard positions new players learn next)
    const latePositions = [
        { pos: 'CO', label: 'Cutoff', desc: 'Wider than HJ. Add more suited connectors, suited aces, and medium pairs.', tip: 'CO opens roughly 25-28% of hands. Include all pairs down to 33, most suited aces, and suited connectors.' },
        { pos: 'BTN', label: 'Button', desc: 'The widest RFI range. Positional advantage lets you play many more hands.', tip: 'BTN opens ~40%+ of hands. Almost all suited hands with connectivity, most offsuit broadways, and all pairs.' },
        { pos: 'SB', label: 'Small Blind', desc: 'Wide open since only BB remains. Mix of raises and limps at some stack depths.', tip: 'SB opens wide but faces BB 3-bets. Include strong suited connectors and most broadways.' },
    ];

    for (const { pos, label, desc, tip } of latePositions) {
        const spotData = RFI[pos];
        if (!spotData) continue;
        scenarios.push(makeScenario({
            id: `l2-rfi-${pos.toLowerCase()}-100bb`, level: 2,
            title: `${label} (${pos}) Open — 100BB`,
            description: desc, tip,
            position: pos, stackDepth: 100, spotData, spotType: 'rfi',
        }));
        idx++;
    }

    // Stack depth variants for CO and BTN
    const depthVariants = [
        { depth: 20, data: RFI_20BB, label: '20BB', desc: 'Short stack — tighter range, no implied odds for speculative hands.', tip: 'At 20BB, cut suited connectors below T9s and small pairs below 66.' },
        { depth: 50, data: RFI_50BB, label: '50BB', desc: 'Medium stack — slightly tighter than 100BB, less implied odds.', tip: 'At 50BB, trim the weakest speculative hands but keep strong suited connectors.' },
        { depth: 200, data: RFI_200BB, label: '200BB', desc: 'Deep stack — add speculative hands for implied odds.', tip: 'At 200BB, add more small pairs and suited connectors for set-mining and straight potential.' },
    ];

    for (const { depth, data, label, desc, tip } of depthVariants) {
        for (const pos of ['CO', 'BTN', 'SB']) {
            const spotData = data?.[pos];
            if (!spotData) continue;
            scenarios.push(makeScenario({
                id: `l2-rfi-${pos.toLowerCase()}-${depth}bb`, level: 2,
                title: `${pos} Open — ${label}`,
                description: `${pos} opening range at ${label} effective stacks. ${desc}`,
                tip, position: pos, stackDepth: depth, spotData, spotType: 'rfi',
            }));
            idx++;
        }
    }

    return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 3: BB Defense (Call + 3-Bet vs each opener)
// ═══════════════════════════════════════════════════════════════════════════

function generateLevel3() {
    const scenarios = [];
    const defenseSpots = [
        { key: 'vs_UTG', vs: 'UTG', desc: 'Tight defense vs the tightest opener. Only defend with strong hands and suited connectors.', tip: 'Defend ~32%. 3-bet premiums (AA-QQ, AKs). Call with medium pairs, suited broadways, suited connectors.' },
        { key: 'vs_CO', vs: 'CO', desc: 'Wider defense vs a late-position opener. Add more suited gappers and offsuit broadways.', tip: 'Defend ~42%. CO opens wide, so you defend wider. Add A9s, K9s, Q9s, suited one-gappers.' },
        { key: 'vs_BTN', vs: 'BTN', desc: 'Wide defense vs the widest opener. You get a good price and defend over half your hands.', tip: 'Defend ~55%. BTN opens 40%+, so defend very wide. Include small pairs, suited gappers, offsuit connectors.' },
        { key: 'vs_SB', vs: 'SB', desc: 'Widest defense — great pot odds facing the SB open. Defend roughly 60%+ of hands.', tip: 'Defend ~62%. Getting great odds. Include most suited hands, many offsuit connectors, all pairs.' },
    ];

    for (const { key, vs, desc, tip } of defenseSpots) {
        const spotData = BB_DEFENSE[key];
        if (!spotData) continue;
        scenarios.push(makeScenario({
            id: `l3-bb-def-${key}`, level: 3,
            title: `BB Defense vs ${vs} Open — 100BB`,
            description: desc, tip,
            position: 'BB', vsPosition: vs, stackDepth: 100, spotData, spotType: 'bb_defense',
        }));
    }

    return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 4: 3-Bet Ranges (IP and OOP 3-bets)
// ═══════════════════════════════════════════════════════════════════════════

function generateLevel4() {
    const scenarios = [];

    // BTN 3-bet vs each opener (IP)
    const btn3bSpots = [
        { key: 'BTN_vs_UTG', vs: 'UTG', desc: 'Tight 3-bet range on BTN vs UTG. Polarized — premiums + some blocker bluffs.', tip: '3-bet AA-QQ, AKs for value. Bluff with A5s-A4s (blocker + nut potential). Flat the rest of your continuing range.' },
        { key: 'BTN_vs_MP', vs: 'MP', desc: 'Slightly wider 3-bet vs MP. More value hands and bluff combos.', tip: 'Add AQs, KQs as value 3-bets. A5s/A4s/A3s as bluffs. Flat broadways and suited connectors.' },
        { key: 'BTN_vs_HJ', vs: 'HJ', desc: '3-bet from BTN vs HJ opener. Wider than vs EP — add suited broadways.', tip: 'Widen value to include AJs, 3-bet bluff with A5s-A3s. Flat wider with suited connectors.' },
        { key: 'BTN_vs_CO', vs: 'CO', desc: 'Widest BTN 3-bet. CO opens wide, so 3-bet more for value and as bluffs.', tip: '3-bet QQ+, AQs+, KQs for value. A5s/A4s/A3s as bluffs. Wide flats with connectors.' },
    ];

    for (const { key, vs, desc, tip } of btn3bSpots) {
        const spotData = THREE_BET[key];
        if (!spotData) continue;
        scenarios.push(makeScenario({
            id: `l4-3bet-${key.toLowerCase()}`, level: 4,
            title: `BTN 3-Bet vs ${vs} Open`,
            description: desc, tip,
            position: 'BTN', vsPosition: vs, stackDepth: 100, spotData, spotType: 'vs3bet',
        }));
    }

    // SB 3-bet vs each opener (OOP)
    const sb3bSpots = [
        { key: 'SB_vs_UTG', vs: 'UTG', desc: 'Very tight OOP 3-bet from SB vs UTG. Only premiums — no flatting OOP vs EP.', tip: 'SB 3-bets a very tight, linear range vs UTG. QQ+, AKs, and a few blocker bluffs like A5s.' },
        { key: 'SB_vs_CO', vs: 'CO', desc: 'SB 3-bet vs CO. Wider than vs EP but still tight out of position.', tip: '3-bet JJ+, AQs+, KQs for value. A5s/A4s as bluffs. Avoid flatting from SB — 3-bet or fold.' },
        { key: 'SB_vs_BTN', vs: 'BTN', desc: 'Widest SB 3-bet. BTN opens very wide — punish with a wide 3-bet range.', tip: '3-bet TT+, ATs+, KJs+, QJs for value. A5s-A2s as bluffs. Suited connectors like JTs, T9s.' },
    ];

    for (const { key, vs, desc, tip } of sb3bSpots) {
        const spotData = THREE_BET[key];
        if (!spotData) continue;
        scenarios.push(makeScenario({
            id: `l4-3bet-${key.toLowerCase()}`, level: 4,
            title: `SB 3-Bet vs ${vs} Open`,
            description: desc, tip,
            position: 'SB', vsPosition: vs, stackDepth: 100, spotData, spotType: 'vs3bet',
        }));
    }

    // BB 3-bet (pure raise portion) vs each opener
    const bb3bSpots = [
        { key: 'BB_vs_UTG', vs: 'UTG', desc: 'BB 3-bet vs UTG. Very tight — only premiums and a few blockers.', tip: 'QQ+, AKs for value. A5s as blocker bluff. Most of your defense is calling, not 3-betting.' },
        { key: 'BB_vs_BTN', vs: 'BTN', desc: 'BB 3-bet vs BTN. Wide — punish the BTN\'s wide opens.', tip: '3-bet TT+, ATs+, KQs+ for value. A5s-A2s as bluffs. Wide 3-bet since BTN opens 40%+.' },
        { key: 'BB_vs_SB', vs: 'SB', desc: 'BB 3-bet vs SB. Widest — great odds and SB opens wide.', tip: '3-bet very wide: 88+, ATs+, KTs+, suited connectors. SB opens wide and you close the action.' },
    ];

    for (const { key, vs, desc, tip } of bb3bSpots) {
        const spotData = THREE_BET[key];
        if (!spotData) continue;
        scenarios.push(makeScenario({
            id: `l4-3bet-${key.toLowerCase()}`, level: 4,
            title: `BB 3-Bet vs ${vs} Open`,
            description: desc, tip,
            position: 'BB', vsPosition: vs, stackDepth: 100, spotData, spotType: 'vs3bet',
        }));
    }

    return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 5: Cold Call (Flatting an open in position)
// ═══════════════════════════════════════════════════════════════════════════

function generateLevel5() {
    const scenarios = [];

    const coldCallSpots = [
        { key: 'CO_vs_UTG', hero: 'CO', vs: 'UTG', desc: 'CO cold-call vs UTG open. Hands that play well post-flop in position but aren\'t strong enough to 3-bet.', tip: 'Flat medium pairs (JJ-77), suited broadways (AJs-KTs), suited connectors (JTs-54s). 3-bet your premiums instead.' },
        { key: 'BTN_vs_UTG', hero: 'BTN', vs: 'UTG', desc: 'BTN cold-call vs UTG. Wider flats since you have guaranteed position.', tip: 'Flat wider than CO: 88-44, ATs-A8s, KJs-K9s, all suited connectors T9s-54s. Great implied odds IP.' },
        { key: 'BTN_vs_CO', hero: 'BTN', vs: 'CO', desc: 'BTN cold-call vs CO open. Wide flat range since CO opens wide and you have position.', tip: 'Flat very wide: TT-55, all suited broadways, suited connectors, some offsuit broadways. Position is king.' },
        { key: 'SB_vs_BTN', hero: 'SB', vs: 'BTN', desc: 'SB flat vs BTN open. Unusual spot — most SB strategy is 3-bet or fold.', tip: 'SB cold-call is rarely used in modern GTO — most strategies prefer 3-bet or fold from SB. Any flats are very narrow.' },
    ];

    for (const { key, hero, vs, desc, tip } of coldCallSpots) {
        const spotData = COLD_CALL[key];
        if (!spotData) continue;
        scenarios.push(makeScenario({
            id: `l5-cc-${key.toLowerCase()}`, level: 5,
            title: `${hero} Cold Call vs ${vs} Open`,
            description: desc, tip,
            position: hero, vsPosition: vs, stackDepth: 100, spotData, spotType: 'cold_call',
        }));
    }

    return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 6: 4-Bet Ranges (Facing a 3-bet after opening)
// ═══════════════════════════════════════════════════════════════════════════

function generateLevel6() {
    const scenarios = [];

    const fourBetSpots = [
        { key: 'UTG_vs_3bet', hero: 'UTG', desc: 'UTG facing a 3-bet. Very tight 4-bet range — only premiums.', tip: '4-bet AA, KK, AKs for value. QQ is a mix (4-bet ~70%, call ~30%). A5s/A4s as occasional blocker bluffs.' },
        { key: 'CO_vs_3bet', hero: 'CO', desc: 'CO facing a 3-bet. Wider 4-bet than UTG since your open range is wider.', tip: '4-bet AA, KK, AKs/AKo. QQ mostly 4-bet. A5s/A4s as bluffs. Call JJ, TT, AQs, KQs.' },
        { key: 'BTN_vs_3bet', hero: 'BTN', desc: 'BTN facing a 3-bet. Widest 4-bet range — you opened widest.', tip: '4-bet AA-QQ, AKs, AQs. A5s-A3s as bluffs. Call JJ-88, KQs, AJs, suited connectors.' },
    ];

    for (const { key, hero, desc, tip } of fourBetSpots) {
        const spotData = FOUR_BET[key];
        if (!spotData) continue;
        scenarios.push(makeScenario({
            id: `l6-4bet-${key.toLowerCase()}`, level: 6,
            title: `${hero} 4-Bet vs 3-Bet — 100BB`,
            description: desc, tip,
            position: hero, stackDepth: 100, spotData, spotType: '4bet',
        }));
    }

    return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 7: Squeeze Ranges (3-bet over open + cold caller)
// ═══════════════════════════════════════════════════════════════════════════

function generateLevel7() {
    const scenarios = [];

    const squeezeSpots = [
        { key: 'BTN_vs_UTG_open_MP_call', hero: 'BTN', desc: 'BTN squeeze vs UTG open + MP cold-call. Very tight — two ranges to beat.', tip: 'Squeeze only premiums: AA-QQ, AKs. QQ is a mix. A5s/A4s as rare bluffs with blockers.' },
        { key: 'SB_vs_CO_open_BTN_call', hero: 'SB', desc: 'SB squeeze vs CO open + BTN call. Tighter than 3-bet since facing two players.', tip: 'Squeeze QQ+, AKs, AQs. JJ is a mix. A5s/A4s as bluffs. Fold everything else.' },
        { key: 'BB_vs_CO_open_BTN_call', hero: 'BB', desc: 'BB squeeze vs CO open + BTN call. Similar to SB but you close the action.', tip: 'Squeeze QQ+, AKs. A5s/A4s as bluffs. Wider call range since you get a better price.' },
    ];

    for (const { key, hero, desc, tip } of squeezeSpots) {
        const spotData = SQUEEZE[key];
        if (!spotData) continue;
        scenarios.push(makeScenario({
            id: `l7-sqz-${key.toLowerCase()}`, level: 7,
            title: `${hero} Squeeze — 100BB`,
            description: desc, tip,
            position: hero, stackDepth: 100, spotData, spotType: 'squeeze',
        }));
    }

    return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER GENERATOR — All levels
// ═══════════════════════════════════════════════════════════════════════════

let _cachedScenarios = null;

/**
 * Generate all solver-accurate scenarios for levels 1-7.
 * Results are cached after first call.
 *
 * @returns {{ [level: number]: Array<Scenario> }}
 */
export function generateAllSolverScenarios() {
    if (_cachedScenarios) return _cachedScenarios;

    _cachedScenarios = {
        1: generateLevel1(),
        2: generateLevel2(),
        3: generateLevel3(),
        4: generateLevel4(),
        5: generateLevel5(),
        6: generateLevel6(),
        7: generateLevel7(),
        // Levels 8-10: reserved for post-flop solver data (not yet available)
        8: [],
        9: [],
        10: [],
    };

    return _cachedScenarios;
}

/**
 * Get generated scenarios for a specific level.
 */
export function getSolverScenariosForLevel(level) {
    const all = generateAllSolverScenarios();
    return all[level] || [];
}

/**
 * Get a random generated scenario for a level.
 */
export function getRandomSolverScenario(level) {
    const scenarios = getSolverScenariosForLevel(level);
    if (scenarios.length === 0) return null;
    return scenarios[Math.floor(Math.random() * scenarios.length)];
}

/**
 * Pick a weighted hand from a scenario for training.
 * Replaces the old approach of only picking in-range hands.
 *
 * Distribution:
 *   50% — In-range hands (raise+call > 10%)
 *   30% — Boundary/mixed hands (action 10-90% or genuine raise/call mix)
 *   20% — Any hand from the full 169 matrix (including clear folds)
 *
 * Returns: { hand, correctAction, frequencies, scenario }
 */
export function pickWeightedHandFromScenario(scenario) {
    if (!scenario) return null;

    const enriched = scenario.enrichedSolution || {};
    const solution = scenario.solution || {};

    // Categorize hands
    const inRange = [];
    const boundary = [];

    for (const hand of ALL_HANDS) {
        const f = enriched[hand];
        if (!f) continue;
        const total = f.raise + f.call;
        if (total > 0.10) {
            inRange.push(hand);
            // Boundary: mixed freq (not pure) or total action < 90%
            const isMixed = (f.raise > 0.10 && f.raise < 0.90 && f.call > 0.10);
            const isPartial = (total > 0.10 && total < 0.90);
            if (isMixed || isPartial) boundary.push(hand);
        }
    }

    // Weighted random selection
    const roll = Math.random();
    let hand;
    if (roll < 0.50 && inRange.length > 0) {
        hand = inRange[Math.floor(Math.random() * inRange.length)];
    } else if (roll < 0.80 && boundary.length > 0) {
        hand = boundary[Math.floor(Math.random() * boundary.length)];
    } else {
        hand = ALL_HANDS[Math.floor(Math.random() * ALL_HANDS.length)];
    }

    // Determine correct action and frequencies
    const frequencies = enriched[hand] || null;
    let correctAction;
    if (frequencies) {
        // Primary action is the one with highest frequency
        if (frequencies.raise >= frequencies.call && frequencies.raise >= frequencies.fold) {
            correctAction = 'raise';
        } else if (frequencies.call >= frequencies.raise && frequencies.call >= frequencies.fold) {
            correctAction = 'call';
        } else {
            correctAction = 'fold';
        }
    } else {
        // Hand not in enriched solution — it's a fold
        correctAction = solution[hand] || 'fold';
    }

    return {
        hand,
        correctAction,
        scenario,
        frequencies: frequencies || { raise: 0, call: 0, fold: 1.0, primaryAction: 'fold' },
    };
}
