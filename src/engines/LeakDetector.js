/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * LEAK DETECTOR — Auto-Identify Poker Leaks & Recommend Drills
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Aggregates stats from analyzed hand histories and training sessions:
 *   - Aggregate stats by position, street, action type
 *   - Compare to GTO benchmarks
 *   - Identify top 5 leak areas
 *   - Auto-generate recommended drill configurations
 *
 * Works with HandAnalyzer output and SessionTracker history.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// ●● GTO Benchmark Values ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// These are approximate GTO frequencies for 6-max cash, 100BB

const GTO_BENCHMARKS = {
    // Preflop frequencies by position
    preflop_rfi: {
        UTG: { raise: 0.155, fold: 0.845 },
        MP: { raise: 0.195, fold: 0.805 },
        CO: { raise: 0.270, fold: 0.730 },
        BTN: { raise: 0.420, fold: 0.580 },
        SB: { raise: 0.400, fold: 0.600 },
    },

    // Flop c-bet frequencies
    flop_cbet: {
        IP: { bet: 0.55, check: 0.45 },
        OOP: { bet: 0.40, check: 0.60 },
    },

    // Flop check-raise frequency
    flop_checkraise: {
        overall: 0.10,
    },

    // Turn barrel frequency (after flop c-bet)
    turn_barrel: {
        IP: { bet: 0.55, check: 0.45 },
        OOP: { bet: 0.45, check: 0.55 },
    },

    // River bet frequency
    river_bet: {
        IP: { bet: 0.40, check: 0.60 },
        OOP: { bet: 0.30, check: 0.70 },
    },

    // Fold to c-bet (as defender)
    fold_to_cbet: {
        flop: 0.42,
        turn: 0.38,
        river: 0.45,
    },

    // VPIP (voluntarily put money in pot) benchmark
    vpip: {
        tight: 0.20,
        normal: 0.25,
        loose: 0.32,
    },

    // PFR (preflop raise) benchmark
    pfr: {
        tight: 0.16,
        normal: 0.20,
        loose: 0.28,
    },
};

// ●● Leak Types ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const LEAK_TYPES = {
    TOO_TIGHT_PREFLOP: 'too_tight_preflop',
    TOO_LOOSE_PREFLOP: 'too_loose_preflop',
    NOT_ENOUGH_CBET: 'not_enough_cbet',
    TOO_MUCH_CBET: 'too_much_cbet',
    NOT_ENOUGH_CHECK_RAISE: 'not_enough_check_raise',
    FOLDING_TOO_MUCH: 'folding_too_much',
    NOT_FOLDING_ENOUGH: 'not_folding_enough',
    MISSING_VALUE_BETS: 'missing_value_bets',
    BLUFFING_TOO_MUCH: 'bluffing_too_much',
    NOT_BLUFFING_ENOUGH: 'not_bluffing_enough',
    TURN_GIVE_UP: 'turn_give_up',
    RIVER_GIVE_UP: 'river_give_up',
    POSITION_LEAK: 'position_leak',
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// LEAK DETECTION
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Detect leaks from a session analysis report.
 *
 * @param {Object} report - Output from HandAnalyzer.analyzeSession().report
 * @returns {Array<{ type: string, severity: string, score: number, description: string, drill: Object }>}
 */
export function detectLeaks(report) {
    if (!report) return [];

    const leaks = [];

    // Check street-level leaks
    if (report.streetStats) {
        _checkStreetLeaks(report.streetStats, leaks);
    }

    // Check position-level leaks
    if (report.positionStats) {
        _checkPositionLeaks(report.positionStats, leaks);
    }

    // Check overall accuracy leak
    if (report.gtoScore < 70) {
        leaks.push({
            type: 'overall_accuracy',
            severity: report.gtoScore < 50 ? 'critical' : 'major',
            score: report.gtoScore,
            description: `Overall GTO accuracy is ${report.gtoScore}% — below the 70% target.`,
            drill: {
                gameId: 'adv-001',
                title: 'Solver Mimicry — Full Range Review',
                focus: 'All spots, start with fundamentals',
            },
        });
    }

    // Check blunder rate
    const blunderRate = report.totalDecisions > 0
        ? report.classifications.blunder / report.totalDecisions
        : 0;
    if (blunderRate > 0.08) {
        leaks.push({
            type: 'high_blunder_rate',
            severity: blunderRate > 0.15 ? 'critical' : 'major',
            score: Math.round((1 - blunderRate) * 100),
            description: `Blunder rate of ${Math.round(blunderRate * 100)}% is too high (target: <8%).`,
            drill: {
                gameId: 'psy-001',
                title: 'Tilt Control — Slow Down and Think',
                focus: 'Take more time on each decision',
            },
        });
    }

    // Sort by severity
    const severityOrder = { critical: 0, major: 1, minor: 2 };
    leaks.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

    return leaks.slice(0, 10); // Top 10 leaks
}

function _checkStreetLeaks(streetStats, leaks) {
    // Flop accuracy
    if (streetStats.flop) {
        const flopAcc = streetStats.flop.accuracy;
        if (flopAcc < 65) {
            leaks.push({
                type: LEAK_TYPES.NOT_ENOUGH_CBET,
                severity: flopAcc < 50 ? 'major' : 'minor',
                score: flopAcc,
                description: `Flop play accuracy ${flopAcc}% — review c-bet strategy and flop defense.`,
                drill: {
                    gameId: 'cash-002',
                    level: 8,
                    title: 'C-Bet Academy — Flop Decisions',
                    focus: 'Practice c-bet frequency by board texture',
                },
            });
        }
    }

    // Turn accuracy
    if (streetStats.turn) {
        const turnAcc = streetStats.turn.accuracy;
        if (turnAcc < 60) {
            leaks.push({
                type: LEAK_TYPES.TURN_GIVE_UP,
                severity: turnAcc < 45 ? 'major' : 'minor',
                score: turnAcc,
                description: `Turn play accuracy ${turnAcc}% — likely giving up too often or barreling incorrectly.`,
                drill: {
                    gameId: 'cash-013',
                    level: 9,
                    title: 'Turn Barrel Decisions',
                    focus: 'When to continue aggression vs pot control',
                },
            });
        }
    }

    // River accuracy
    if (streetStats.river) {
        const riverAcc = streetStats.river.accuracy;
        if (riverAcc < 55) {
            leaks.push({
                type: LEAK_TYPES.RIVER_GIVE_UP,
                severity: riverAcc < 40 ? 'major' : 'minor',
                score: riverAcc,
                description: `River play accuracy ${riverAcc}% — missing value bets or bluffing incorrectly.`,
                drill: {
                    gameId: 'cash-012',
                    level: 10,
                    title: 'River Decisions — Value & Bluff',
                    focus: 'Practice river value bets and bluff spots',
                },
            });
        }
    }
}

function _checkPositionLeaks(positionStats, leaks) {
    // Find worst position
    let worstPos = null;
    let worstAcc = 100;

    for (const [pos, stats] of Object.entries(positionStats || {})) {
        if (stats.decisions >= 3 && stats.accuracy < worstAcc) {
            worstAcc = stats.accuracy;
            worstPos = pos;
        }
    }

    if (worstPos && worstAcc < 60) {
        const isEP = ['UTG', 'MP'].includes(worstPos);
        leaks.push({
            type: LEAK_TYPES.POSITION_LEAK,
            severity: worstAcc < 40 ? 'major' : 'minor',
            score: worstAcc,
            description: `${worstPos} accuracy is ${worstAcc}% — significantly below other positions.`,
            drill: {
                gameId: isEP ? 'cash-001' : 'cash-006',
                title: `${worstPos} Range Work`,
                focus: `Drill ${worstPos} opening and defense ranges`,
            },
        });
    }

    // Check BB defense specifically (most common leak area)
    const bbStats = positionStats['BB'];
    if (bbStats && bbStats.decisions >= 5 && bbStats.accuracy < 55) {
        leaks.push({
            type: LEAK_TYPES.FOLDING_TOO_MUCH,
            severity: 'major',
            score: bbStats.accuracy,
            description: `BB play accuracy ${bbStats.accuracy}% — likely over-folding in the big blind.`,
            drill: {
                gameId: 'cash-003',
                level: 3,
                title: 'Defense Matrix — BB Defense',
                focus: 'Practice BB defense vs each position opener',
            },
        });
    }
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// FREQUENCY ANALYSIS — Compare player frequencies to GTO
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Analyze player frequencies vs GTO benchmarks.
 *
 * @param {Array} decisions - All analyzed decisions
 * @returns {Object} Frequency comparison
 */
export function analyzeFrequencies(decisions) {
    if (!decisions || decisions.length === 0) return {};

    // Count actions by street
    const counts = {};
    for (const d of decisions) {
        const key = `${d.street}_${d.action}`;
        counts[key] = (counts[key] || 0) + 1;
    }

    const streetTotals = {};
    for (const d of decisions) {
        streetTotals[d.street] = (streetTotals[d.street] || 0) + 1;
    }

    // Calculate frequencies
    const frequencies = {};
    for (const [key, count] of Object.entries(counts || {})) {
        const [street] = key.split('_');
        frequencies[key] = {
            count,
            frequency: Math.round((count / streetTotals[street]) * 100) / 100,
        };
    }

    // Compare to GTO benchmarks
    const comparisons = [];

    // Flop c-bet frequency
    const flopBets = counts['flop_bet'] || 0;
    const flopChecks = counts['flop_check'] || 0;
    const flopTotal = flopBets + flopChecks;
    if (flopTotal > 0) {
        const playerCbet = flopBets / flopTotal;
        const gtoCbet = GTO_BENCHMARKS.flop_cbet.IP.bet; // Simplified
        comparisons.push({
            metric: 'Flop C-Bet',
            player: Math.round(playerCbet * 100),
            gto: Math.round(gtoCbet * 100),
            deviation: Math.round((playerCbet - gtoCbet) * 100),
            assessment: Math.abs(playerCbet - gtoCbet) < 0.10 ? 'good' :
                playerCbet > gtoCbet ? 'too_aggressive' : 'too_passive',
        });
    }

    // Turn barrel frequency
    const turnBets = counts['turn_bet'] || 0;
    const turnChecks = counts['turn_check'] || 0;
    const turnTotal = turnBets + turnChecks;
    if (turnTotal > 0) {
        const playerTurn = turnBets / turnTotal;
        const gtoTurn = GTO_BENCHMARKS.turn_barrel.IP.bet;
        comparisons.push({
            metric: 'Turn Barrel',
            player: Math.round(playerTurn * 100),
            gto: Math.round(gtoTurn * 100),
            deviation: Math.round((playerTurn - gtoTurn) * 100),
            assessment: Math.abs(playerTurn - gtoTurn) < 0.10 ? 'good' :
                playerTurn > gtoTurn ? 'too_aggressive' : 'too_passive',
        });
    }

    // River bet frequency
    const riverBets = counts['river_bet'] || 0;
    const riverChecks = counts['river_check'] || 0;
    const riverTotal = riverBets + riverChecks;
    if (riverTotal > 0) {
        const playerRiver = riverBets / riverTotal;
        const gtoRiver = GTO_BENCHMARKS.river_bet.IP.bet;
        comparisons.push({
            metric: 'River Bet',
            player: Math.round(playerRiver * 100),
            gto: Math.round(gtoRiver * 100),
            deviation: Math.round((playerRiver - gtoRiver) * 100),
            assessment: Math.abs(playerRiver - gtoRiver) < 0.10 ? 'good' :
                playerRiver > gtoRiver ? 'too_aggressive' : 'too_passive',
        });
    }

    // Fold frequency
    const totalFolds = Object.entries(counts || {})
        .filter(([k]) => k.endsWith('_fold'))
        .reduce((a, [, v]) => a + v, 0);
    const totalDecisions = decisions.length;
    if (totalDecisions > 0) {
        const foldFreq = totalFolds / totalDecisions;
        comparisons.push({
            metric: 'Overall Fold %',
            player: Math.round(foldFreq * 100),
            gto: 40, // Approximate overall fold frequency
            deviation: Math.round((foldFreq - 0.40) * 100),
            assessment: Math.abs(foldFreq - 0.40) < 0.08 ? 'good' :
                foldFreq > 0.40 ? 'too_tight' : 'too_loose',
        });
    }

    return { frequencies, comparisons };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// DRILL RECOMMENDATIONS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Generate recommended drills based on detected leaks.
 *
 * @param {Array} leaks - Output from detectLeaks
 * @returns {Array<{ gameId: string, title: string, level: number, priority: string, reason: string }>}
 */
export function generateDrillRecommendations(leaks) {
    if (!leaks || leaks.length === 0) {
        return [{
            gameId: 'cash-025',
            title: 'Cash King — Full Session Grind',
            level: 1,
            priority: 'low',
            reason: 'No specific leaks detected. Practice all spots to maintain sharpness.',
        }];
    }

    const drills = [];

    for (const leak of leaks.slice(0, 5)) {
        if (leak.drill) {
            drills.push({
                gameId: leak.drill.gameId,
                title: leak.drill.title,
                level: leak.drill.level || 1,
                priority: leak.severity === 'critical' ? 'high' : leak.severity === 'major' ? 'medium' : 'low',
                reason: leak.description,
                focus: leak.drill.focus,
            });
        }
    }

    return drills;
}

export default {
    detectLeaks,
    analyzeFrequencies,
    generateDrillRecommendations,
    LEAK_TYPES,
    GTO_BENCHMARKS,
};
