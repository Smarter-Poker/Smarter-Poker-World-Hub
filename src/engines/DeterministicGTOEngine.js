// @@PUB_REGION_01@@
        // IMP-1 FIX: Filter out scenarios that generated questions the user already saw
        const safeSeenIds = Array.isArray(seenIds) ? seenIds : [];
        let pool = scenarios;
// @@PUB_REGION_02@@
        // ═══ Phase 76: DYNAMIC EXPLANATION DEPTH ═══
        const explanationDepth = this._getExplanationDepth(street, handStrength, optimalAction, ctx.nodeType, ctx.spotType);
        const coachingNote = this._getDepthCoachingNote(explanationDepth, street, handStrength, optimalAction);
// @@PUB_REGION_03@@
                }
            }
        }
// @@PUB_REGION_04@@
            if (street === 'river') {
                if (texture.flushy || texture.monotone) return `At the bluff-catching threshold on a flushy river board. Missed flush draws are a large part of villain's bluffing range — calling just enough to prevent them from auto-profiting with bluffs.`;
                return `At the exact bluff-catching threshold on the river. Calling too much lets villain profit by over-bluffing; folding too much lets villain steal pots unchallenged. The solver calls just enough to keep villain indifferent.`;
// @@PUB_REGION_05@@
            parts.push('Turn cards to watch:');
        } else {
            parts.push('River cards to watch:');
// @@PUB_REGION_06@@
                accuracy: 1 - (v.mistakes / v.total),
            }))
            .sort((a, b) => b.mistakeRate - a.mistakeRate);
// @@PUB_REGION_07@@
    /**
     * Phase 110: Explain probe bets — when you bet into the PFR after they
     * checked the previous street.
// @@PUB_REGION_08@@
    /**
     * Phase 138: How well does each player's range interact with this board?
     */
// @@PUB_REGION_09@@
    /**
     * Phase 167: Explain the concept of node locking for exploitative play.
     */
// @@PUB_REGION_10@@
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 203: BOARD COVERAGE HEATMAP DATA
    // ═══════════════════════════════════════════════════════════════════════════
// @@PUB_REGION_11@@
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 232: BET/RAISE SIZING OPTIMIZER
    // ═══════════════════════════════════════════════════════════════════════════
// @@PUB_REGION_12@@
        // Category 4: Mixed strategy misread (both in strategy but wrong primary)
        if (selPct > 0 && selPct < 30) {
            return { type: 'MIX_MISREAD', label: 'Mixed Strategy Misread', description: 'Your action is in the solver\'s strategy but at low frequency. Study when the solver shifts to this action vs the primary.', severity: 'low' };
// @@PUB_REGION_13@@
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 283: MISTAKE CLUSTERING
    // ═══════════════════════════════════════════════════════════════════════════

    getMistakeClusters() {
        if (!this._sessionStats?.history) return { clusters: [], totalMistakes: 0 };
        const mistakes = this._sessionStats.history.filter(h => !h.correct);
        if (mistakes.length < 2) return { clusters: [], totalMistakes: mistakes.length };
        const clusterMap = {};
        mistakes.forEach(m => {
            const street = (m.street || 'unknown').toLowerCase();
            const node = (m.nodeType || 'general').toLowerCase();
            const userAct = this._normalizeActionCategory(m.action || m.selectedAction || '');
            const solverAct = this._normalizeActionCategory(m.correctAction || '');
            const key = `${street}_${userAct}_instead_of_${solverAct}`;
            if (!clusterMap[key]) clusterMap[key] = { street, userAction: userAct, solverAction: solverAct, count: 0, nodeTypes: [], evLoss: 0 };
            clusterMap[key].count++;
            clusterMap[key].evLoss += (m.evLoss || 0);
            if (!clusterMap[key].nodeTypes.includes(node)) clusterMap[key].nodeTypes.push(node);
        });
        const clusters = Object.values(clusterMap || {}).map(c => ({
            ...c, evLoss: Math.round(c.evLoss * 100) / 100,
            description: `${c.street}: You ${c.userAction.toLowerCase()} instead of ${c.solverAction.toLowerCase()} (${c.count}x, -${c.evLoss.toFixed(2)} BB)`,
            severity: c.count >= 3 ? 'critical' : c.count >= 2 ? 'high' : 'medium',
        }));
        clusters.sort((a, b) => b.count - a.count);
        return { clusters: clusters.slice(0, 8), totalMistakes: mistakes.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 284: BOARD COVERAGE ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getBoardCoverageAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const textureMap = { dry: { total: 0, correct: 0 }, wet: { total: 0, correct: 0 }, monotone: { total: 0, correct: 0 }, paired: { total: 0, correct: 0 }, disconnected: { total: 0, correct: 0 }, connected: { total: 0, correct: 0 } };
        this._sessionStats.history.forEach(h => {
            const tex = (h.texture || h.boardTexture || '').toLowerCase();
            if (tex.includes('dry') || tex.includes('rainbow')) { textureMap.dry.total++; if (h.correct) textureMap.dry.correct++; }
            if (tex.includes('wet') || tex.includes('draw')) { textureMap.wet.total++; if (h.correct) textureMap.wet.correct++; }
            if (tex.includes('monotone') || tex.includes('flush')) { textureMap.monotone.total++; if (h.correct) textureMap.monotone.correct++; }
            if (tex.includes('paired') || tex.includes('pair')) { textureMap.paired.total++; if (h.correct) textureMap.paired.correct++; }
            if (tex.includes('connected') || tex.includes('straight')) { textureMap.connected.total++; if (h.correct) textureMap.connected.correct++; }
            if (tex.includes('disconnected') || tex.includes('rainbow')) { textureMap.disconnected.total++; if (h.correct) textureMap.disconnected.correct++; }
        });
        const textures = Object.entries(textureMap || {}).filter(([_, d]) => d.total > 0).map(([name, data]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1), total: data.total, correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        }));
        textures.sort((a, b) => a.accuracy - b.accuracy);
        return { textures, weakestTexture: textures[0] || null, strongestTexture: textures[textures.length - 1] || null };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 285: BLUFF-TO-VALUE RATIO
    // ═══════════════════════════════════════════════════════════════════════════

    getBluffToValueRatio() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        let userBluffs = 0, userValue = 0, solverBluffs = 0, solverValue = 0;
        this._sessionStats.history.forEach(h => {
            const cat = (h.handCategory || '').toLowerCase();
            const userAct = (h.action || h.selectedAction || '').toLowerCase();
            const solverAct = (h.correctAction || '').toLowerCase();
            const isAggressive = a => a.includes('bet') || a.includes('raise') || a.includes('all-in');
            const isBluffHand = cat.includes('air') || cat.includes('no pair') || cat.includes('missed') || cat.includes('gutshot') || cat.includes('backdoor');
            if (isAggressive(userAct)) { if (isBluffHand) userBluffs++; else userValue++; }
            if (isAggressive(solverAct)) { if (isBluffHand) solverBluffs++; else solverValue++; }
        });
        const userTotal = userBluffs + userValue;
        const solverTotal = solverBluffs + solverValue;
        const userRatio = userTotal > 0 ? Math.round((userBluffs / userTotal) * 100) : 0;
        const solverRatio = solverTotal > 0 ? Math.round((solverBluffs / solverTotal) * 100) : 0;
        let assessment = 'balanced';
        if (userRatio > solverRatio + 15) assessment = 'over_bluffing';
        else if (userRatio < solverRatio - 15) assessment = 'under_bluffing';
        return { userBluffPct: userRatio, solverBluffPct: solverRatio, userBluffs, userValue, solverBluffs, solverValue, assessment,
            message: assessment === 'over_bluffing' ? 'You\'re bluffing too often — tighten your aggression range.' : assessment === 'under_bluffing' ? 'You\'re not bluffing enough — add more semi-bluffs to stay balanced.' : 'Your bluff-to-value ratio is well-balanced.' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 286: EV LOSS HEATMAP DATA
    // ═══════════════════════════════════════════════════════════════════════════

    getEVLossHeatmap() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 3) return null;
        const grid = {};
        const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
        const streets = ['preflop', 'flop', 'turn', 'river'];
        positions.forEach(p => { grid[p] = {}; streets.forEach(s => { grid[p][s] = { evLoss: 0, hands: 0 }; }); });
        this._sessionStats.history.forEach(h => {
            const pos = (h.heroPosition || h.position || 'MP').toUpperCase();
            const st = (h.street || 'flop').toLowerCase();
            const normPos = positions.includes(pos) ? pos : 'MP';
            const normSt = streets.includes(st) ? st : 'flop';
            grid[normPos][normSt].evLoss += (h.evLoss || 0);
            grid[normPos][normSt].hands++;
        });
        const cells = [];
        let maxLoss = 0;
        positions.forEach(p => { streets.forEach(s => {
            const cell = grid[p][s];
            const avg = cell.hands > 0 ? cell.evLoss / cell.hands : 0;
            if (avg > maxLoss) maxLoss = avg;
            cells.push({ position: p, street: s, totalEVLoss: Math.round(cell.evLoss * 100) / 100, hands: cell.hands, avgEVLoss: Math.round(avg * 100) / 100 });
        }); });
        cells.forEach(c => { c.intensity = maxLoss > 0 ? Math.min(1, c.avgEVLoss / maxLoss) : 0; });
        return { cells, positions, streets, maxLoss: Math.round(maxLoss * 100) / 100 };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 287: QUICK-FIRE REVIEW MODE
    // ═══════════════════════════════════════════════════════════════════════════

    getQuickFireReviewCards() {
        if (!this._sessionStats?.history) return [];
        const mistakes = this._sessionStats.history.filter(h => !h.correct);
        return mistakes.map((m, i) => ({
            index: i + 1,
            street: m.street || 'flop',
            position: m.heroPosition || m.position || '?',
            handCategory: m.handCategory || 'Unknown',
            userAction: m.action || m.selectedAction || '?',
            solverAction: m.correctAction || '?',
            evLoss: Math.round((m.evLoss || 0) * 100) / 100,
            keyTakeaway: m.takeaway || `Should have ${(m.correctAction || '').toLowerCase()} instead of ${(m.action || m.selectedAction || '').toLowerCase()}.`,
            nodeType: m.nodeType || '',
        }));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 288: SOLVER FREQUENCY QUIZ DATA
    // ═══════════════════════════════════════════════════════════════════════════

    generateFrequencyQuizQuestion() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const handsWithFreqs = this._sessionStats.history.filter(h => h.frequencies && Object.keys(h.frequencies || {}).length >= 2);
        if (handsWithFreqs.length === 0) return null;
        const hand = handsWithFreqs[Math.floor(Math.random() * handsWithFreqs.length)];
        const entries = Object.entries(hand.frequencies || {}).sort((a, b) => b[1] - a[1]);
        const topAction = entries[0][0];
        const topFreq = entries[0][1];
        return {
            question: `In this ${(hand.street || 'flop')} spot (${hand.nodeType || 'standard'}), what % does the solver ${topAction}?`,
            correctAnswer: Math.round(topFreq),
            tolerance: 10,
            handCategory: hand.handCategory || 'Unknown',
            street: hand.street || 'flop',
            allFrequencies: hand.frequencies,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 289: POSITION LEADERBOARD
    // ═══════════════════════════════════════════════════════════════════════════

    getPositionLeaderboard() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 3) return null;
        const posMap = {};
        this._sessionStats.history.forEach(h => {
            const pos = (h.heroPosition || h.position || 'MP').toUpperCase();
            if (!posMap[pos]) posMap[pos] = { correct: 0, total: 0, evLoss: 0 };
            posMap[pos].total++;
            if (h.correct) posMap[pos].correct++;
            posMap[pos].evLoss += (h.evLoss || 0);
        });
        const leaderboard = Object.entries(posMap || {}).map(([pos, data]) => ({
            position: pos, total: data.total, correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            evLoss: Math.round(data.evLoss * 100) / 100,
            grade: data.total >= 3 && data.correct / data.total >= 0.8 ? 'A' : data.correct / data.total >= 0.6 ? 'B' : data.correct / data.total >= 0.4 ? 'C' : 'D',
        }));
        leaderboard.sort((a, b) => b.accuracy - a.accuracy);
        return { leaderboard, bestPosition: leaderboard[0] || null, worstPosition: leaderboard[leaderboard.length - 1] || null };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 290: COACHING SUMMARY GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    generateCoachingSummary() {
        const stats = this._sessionStats;
        if (!stats || stats.total < 5) return { summary: 'Complete more hands for a coaching summary.', tips: [] };
        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        const tips = [];
        const parts = [];
        // Overall assessment
        if (accuracy >= 80) parts.push(`Excellent session — ${accuracy}% accuracy shows strong GTO understanding.`);
        else if (accuracy >= 65) parts.push(`Solid session at ${accuracy}% accuracy. A few key spots to review.`);
        else if (accuracy >= 50) parts.push(`Average session at ${accuracy}% accuracy. Multiple areas need work.`);
        else parts.push(`Tough session at ${accuracy}% accuracy. Focus on fundamentals.`);
        // Leak analysis
        try {
            const leaks = this.generateLeakReport();
            if (leaks?.leaks?.length > 0) {
                const topLeak = leaks.leaks[0];
                parts.push(`Biggest leak: ${topLeak.title} (${topLeak.severity}).`);
                tips.push(topLeak.fix);
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        // Position insight
        try {
            const posLB = this.getPositionLeaderboard();
            if (posLB?.worstPosition && posLB.worstPosition.accuracy < 50) {
                parts.push(`Weakest position: ${posLB.worstPosition.position} at ${posLB.worstPosition.accuracy}%.`);
                tips.push(`Focus on ${posLB.worstPosition.position} strategy — study solver ranges for this seat.`);
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        // Bluff ratio
        try {
            const bvr = this.getBluffToValueRatio();
            if (bvr && bvr.assessment !== 'balanced') {
                parts.push(bvr.message);
                if (bvr.assessment === 'over_bluffing') tips.push('Cut marginal bluffs — focus on hands with good blockers.');
                else tips.push('Add more semi-bluffs with draws and backdoor equity.');
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        // Improvement velocity
        try {
            const vel = this.getImprovementVelocity();
            if (vel && vel.trend !== 'INSUFFICIENT_DATA') {
                if (vel.trend.includes('IMPROV')) parts.push('Your accuracy improved as the session went on — good mental stamina.');
                else if (vel.trend.includes('DECLIN')) { parts.push('Accuracy declined later in the session — consider shorter sessions.'); tips.push('Try 15-hand sessions to stay sharp.'); }
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        return { summary: parts.join(' '), tips: tips.slice(0, 5), accuracy, totalHands: stats.total };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 291: STREAK PATTERN ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getStreakAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        let currentStreak = 0;
        let currentStreakType = null;
        let longestWin = 0;
        let longestLoss = 0;
        let tempStreak = 0;
        let tempType = null;
        const streakBreakers = { afterWinStreak: [], afterLossStreak: [] };

        for (let i = 0; i < history.length; i++) {
            const isCorrect = history[i].correct;
            if (tempType === null) {
                tempType = isCorrect ? 'win' : 'loss';
                tempStreak = 1;
            } else if ((isCorrect && tempType === 'win') || (!isCorrect && tempType === 'loss')) {
                tempStreak++;
            } else {
                // Streak broke
                if (tempType === 'win' && tempStreak >= 3) {
                    longestWin = Math.max(longestWin, tempStreak);
                    streakBreakers.afterWinStreak.push({
                        street: history[i].street || 'unknown',
                        position: history[i].heroPosition || history[i].position || 'unknown',
                        action: history[i].selectedAction || 'unknown',
                    });
                } else if (tempType === 'loss' && tempStreak >= 3) {
                    longestLoss = Math.max(longestLoss, tempStreak);
                    streakBreakers.afterLossStreak.push({
                        street: history[i].street || 'unknown',
                        position: history[i].heroPosition || history[i].position || 'unknown',
                    });
                }
                tempType = isCorrect ? 'win' : 'loss';
                tempStreak = 1;
            }
        }
        // Final streak
        if (tempType === 'win') longestWin = Math.max(longestWin, tempStreak);
        else if (tempType === 'loss') longestLoss = Math.max(longestLoss, tempStreak);

        const lastResult = history[history.length - 1]?.correct;
        currentStreakType = lastResult ? 'win' : 'loss';
        currentStreak = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].correct === lastResult) currentStreak++;
            else break;
        }

        // Pattern: do mistakes cluster after certain events?
        let tiltAfterMistake = 0;
        let recoveryAfterMistake = 0;
        for (let i = 1; i < history.length; i++) {
            if (!history[i - 1].correct) {
                if (!history[i].correct) tiltAfterMistake++;
                else recoveryAfterMistake++;
            }
        }
        const tiltResistance = (tiltAfterMistake + recoveryAfterMistake) > 0
            ? Math.round((recoveryAfterMistake / (tiltAfterMistake + recoveryAfterMistake)) * 100)
            : 100;

        return {
            currentStreak,
            currentStreakType,
            longestWinStreak: longestWin,
            longestLossStreak: longestLoss,
            tiltResistance,
            tiltAfterMistake,
            recoveryAfterMistake,
            streakBreakers,
            insight: tiltResistance >= 70
                ? 'Strong mental game — you recover well after mistakes.'
                : tiltResistance >= 50
                    ? 'Moderate tilt resistance — some cascade errors after mistakes.'
                    : 'Watch for tilt — mistakes tend to cluster. Take a breath after errors.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 292: DECISION SPEED ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getTimePressureAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        // Simulate time via hand index proximity (we don't track real time)
        // Instead, analyze if accuracy degrades over session length (fatigue proxy)
        const totalHands = history.length;
        const firstThird = history.slice(0, Math.floor(totalHands / 3));
        const middleThird = history.slice(Math.floor(totalHands / 3), Math.floor(2 * totalHands / 3));
        const lastThird = history.slice(Math.floor(2 * totalHands / 3));

        const calcAcc = (arr) => arr.length > 0 ? Math.round((arr.filter(h => h.correct).length / arr.length) * 100) : 0;

        const earlyAcc = calcAcc(firstThird);
        const midAcc = calcAcc(middleThird);
        const lateAcc = calcAcc(lastThird);

        const fatigueDropoff = earlyAcc - lateAcc;
        let staminaRating;
        if (fatigueDropoff <= 5) staminaRating = 'Excellent';
        else if (fatigueDropoff <= 15) staminaRating = 'Good';
        else if (fatigueDropoff <= 25) staminaRating = 'Fair';
        else staminaRating = 'Poor';

        // Check if complex spots (multi-street, 3bet pots) have worse accuracy
        const complexSpots = history.filter(h => {
            const node = (h.nodeType || '').toLowerCase();
            return node.includes('3bet') || node.includes('4bet') || node.includes('squeeze');
        });
        const simpleSpots = history.filter(h => {
            const node = (h.nodeType || '').toLowerCase();
            return !node.includes('3bet') && !node.includes('4bet') && !node.includes('squeeze');
        });

        return {
            earlyAccuracy: earlyAcc,
            midAccuracy: midAcc,
            lateAccuracy: lateAcc,
            fatigueDropoff,
            staminaRating,
            complexSpotAccuracy: calcAcc(complexSpots),
            simpleSpotAccuracy: calcAcc(simpleSpots),
            totalHands,
            recommendation: fatigueDropoff > 20
                ? 'Your accuracy drops significantly later in sessions. Consider 15-20 hand sessions.'
                : fatigueDropoff > 10
                    ? 'Mild fatigue detected. A short break every 20 hands could help.'
                    : 'Great mental stamina — your accuracy holds well throughout the session.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 293: RANGE CONSTRUCTION DRILL
    // ═══════════════════════════════════════════════════════════════════════════

    getRangeConstructionDrill(heroPosition = 'CO', nodeType = 'open') {
        const OPEN_RANGES = {
            UTG: { hands: 15, top: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo', 'AJs', 'KQs'], description: 'UTG opens ~15% — premium pairs + strong broadways' },
            MP: { hands: 18, top: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', 'AKs', 'AQs', 'AJs', 'AKo', 'KQs', 'AQo'], description: 'MP opens ~18% — add 99, more broadways' },
            CO: { hands: 27, top: ['AA-77', 'AKs-A2s', 'KQs-KTs', 'QJs-QTs', 'JTs', 'AKo-ATo', 'KQo', 'KJo'], description: 'CO opens ~27% — wide but structured' },
            BTN: { hands: 42, top: ['AA-22', 'AKs-A2s', 'KQs-K5s', 'QJs-Q8s', 'JTs-J8s', 'T9s-T8s', 'AKo-A7o', 'KQo-KTo', 'QJo-QTo'], description: 'BTN opens ~42% — very wide, all pairs + suited connectors' },
            SB: { hands: 36, top: ['AA-22', 'AKs-A2s', 'KQs-K7s', 'QJs-Q9s', 'JTs-J9s', 'T9s', 'AKo-A8o', 'KQo-KJo'], description: 'SB opens ~36% vs BB only' },
        };

        const _3BET_RANGES = {
            'vs_UTG': { hands: 6, top: ['AA', 'KK', 'QQ', 'AKs', 'AKo'], description: '3-Bet vs UTG: ~6% — only premiums' },
            'vs_MP': { hands: 8, top: ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs'], description: '3-Bet vs MP: ~8% — add JJ, AQs' },
            'vs_CO': { hands: 11, top: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo', 'A5s-A4s', 'KQs'], description: '3-Bet vs CO: ~11% — value + blockers' },
            'vs_BTN': { hands: 14, top: ['AA-88', 'AKs-ATs', 'AKo-AJo', 'KQs', 'A5s-A2s'], description: '3-Bet from blinds vs BTN: ~14% — wider value + bluffs' },
        };

        const rangeSet = nodeType === 'open' ? OPEN_RANGES : _3BET_RANGES;
        const key = nodeType === 'open' ? heroPosition.toUpperCase() : `vs_${heroPosition.toUpperCase()}`;
        const range = rangeSet[key] || rangeSet[Object.keys(rangeSet || {})[0]];

        // Generate a quiz-style question
        const allHands = ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A5s', 'A4s', 'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', 'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'KQo', 'KJo', 'QJo', '98s', '87s', '76s', '65s'];
        const testHand = allHands[Math.floor(this._deterministicSeed() * allHands.length) % allHands.length];
        const isInRange = range.top.some(h => {
            if (h.includes('-')) return true; // Simplified — range notation
            return h === testHand;
        });

        return {
            position: heroPosition,
            nodeType,
            rangeSize: range.hands,
            description: range.description,
            keyHands: range.top,
            quizHand: testHand,
            quizAnswer: isInRange ? 'in_range' : 'borderline',
            tip: `The solver ${nodeType === 'open' ? 'opens' : '3-bets'} about ${range.hands}% of hands from ${heroPosition}. Memorize the top of this range first, then expand.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 294: EXPLOITATIVE ADJUSTMENT SUGGESTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    getExploitativeAdjustments() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;
        const adjustments = [];

        // Analyze user tendencies to suggest exploitative counter-adjustments
        let foldCount = 0, callCount = 0, raiseCount = 0, totalActions = 0;
        history.forEach(h => {
            const action = (h.selectedAction || '').toLowerCase();
            totalActions++;
            if (action.includes('fold')) foldCount++;
            else if (action.includes('call')) callCount++;
            else if (action.includes('raise') || action.includes('bet') || action.includes('all')) raiseCount++;
        });

        const foldPct = Math.round((foldCount / totalActions) * 100);
        const callPct = Math.round((callCount / totalActions) * 100);
        const raisePct = Math.round((raiseCount / totalActions) * 100);

        // Over-folding exploit
        if (foldPct > 40) {
            adjustments.push({
                type: 'exploit_overfold',
                title: 'You fold too much',
                description: `Folding ${foldPct}% of the time. Villains should bluff you more.`,
                fix: 'Defend wider — call with more marginal hands, especially in position.',
                severity: foldPct > 55 ? 'critical' : 'moderate',
            });
        }

        // Over-calling exploit
        if (callPct > 45) {
            adjustments.push({
                type: 'exploit_overcall',
                title: 'You call too much',
                description: `Calling ${callPct}% of the time. Villains should value-bet thinner against you.`,
                fix: 'Convert some calls to raises (for value or as bluffs). Fold more weak draws.',
                severity: callPct > 55 ? 'critical' : 'moderate',
            });
        }

        // Under-aggressing exploit
        if (raisePct < 25) {
            adjustments.push({
                type: 'exploit_passive',
                title: 'Not aggressive enough',
                description: `Only raising/betting ${raisePct}% — too passive.`,
                fix: 'Add more semi-bluff raises with draws. Bet for value more thinly.',
                severity: raisePct < 15 ? 'critical' : 'moderate',
            });
        }

        // Over-aggressing exploit
        if (raisePct > 55) {
            adjustments.push({
                type: 'exploit_overaggro',
                title: 'Over-aggressive',
                description: `Raising/betting ${raisePct}% — too aggressive for balanced play.`,
                fix: 'Include more checks and calls. Not every hand needs aggression.',
                severity: raisePct > 65 ? 'critical' : 'moderate',
            });
        }

        // Street-specific: check if river accuracy is notably worse
        const riverHands = history.filter(h => (h.street || '').toLowerCase() === 'river');
        const nonRiverHands = history.filter(h => (h.street || '').toLowerCase() !== 'river');
        if (riverHands.length >= 3 && nonRiverHands.length >= 3) {
            const riverAcc = Math.round((riverHands.filter(h => h.correct).length / riverHands.length) * 100);
            const nonRiverAcc = Math.round((nonRiverHands.filter(h => h.correct).length / nonRiverHands.length) * 100);
            if (nonRiverAcc - riverAcc > 20) {
                adjustments.push({
                    type: 'exploit_river_weak',
                    title: 'River play is a leak',
                    description: `River accuracy ${riverAcc}% vs ${nonRiverAcc}% on other streets.`,
                    fix: 'Practice river-specific scenarios. Focus on value betting and bluff-catching frequencies.',
                    severity: 'moderate',
                });
            }
        }

        return {
            adjustments,
            actionProfile: { foldPct, callPct, raisePct },
            totalActions,
            isBalanced: adjustments.length === 0,
            summary: adjustments.length === 0
                ? 'Your action frequencies look balanced — keep it up!'
                : `Found ${adjustments.length} exploitable tendenc${adjustments.length === 1 ? 'y' : 'ies'} in your play.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 295: ICM PRESSURE ANALYSIS (MTT-specific)
    // ═══════════════════════════════════════════════════════════════════════════

    getICMPressureAnalysis(stackSize = 30, avgStack = 30, playersLeft = 9, payoutSpots = 3) {
        const stackRatio = stackSize / avgStack;
        let icmPressure;
        let adjustments = [];

        if (playersLeft <= payoutSpots + 2) {
            // Bubble zone
            icmPressure = 'bubble';
            if (stackRatio > 1.5) {
                adjustments.push({ action: 'Apply pressure', detail: 'You are a big stack near the bubble. Raise wider to exploit ICM pressure on medium stacks.' });
                adjustments.push({ action: 'Target medium stacks', detail: 'Medium stacks (15-25bb) must fold wider near the bubble — attack them.' });
            } else if (stackRatio < 0.7) {
                adjustments.push({ action: 'Tighten up', detail: 'Short stack near the bubble. Only shove premium hands unless forced.' });
                adjustments.push({ action: 'Avoid marginal spots', detail: 'Every chip lost is worth more than every chip won in ICM terms.' });
            } else {
                adjustments.push({ action: 'Play cautiously', detail: 'Medium stack near the bubble — avoid coinflips. Let short stacks bust.' });
            }
        } else if (playersLeft <= payoutSpots * 2) {
            icmPressure = 'approaching_money';
            if (stackRatio < 0.5) {
                adjustments.push({ action: 'Find a spot', detail: 'Short stack — look for a shove spot with any ace, pair, or suited broadway.' });
            } else {
                adjustments.push({ action: 'Standard play', detail: 'Not yet on the bubble. Play close to chip-EV but be aware of stack dynamics.' });
            }
        } else {
            icmPressure = 'early_stage';
            adjustments.push({ action: 'Chip accumulation', detail: 'Far from the money — play for chip EV. Accumulate chips for a deep run.' });
        }

        // Push/fold ranges at various stack depths
        let pushFoldNote = null;
        if (stackSize <= 10) {
            pushFoldNote = 'At 10bb or less, you should be push/fold only. Open-shove or fold — no limping, no min-raising.';
        } else if (stackSize <= 15) {
            pushFoldNote = 'At 11-15bb, your strategy simplifies. Open-shove or raise/fold. Avoid calling 3-bets unless you have a premium.';
        } else if (stackSize <= 25) {
            pushFoldNote = 'At 16-25bb, you can still open-raise, but your 3-bet range should be shove-or-fold.';
        }

        return {
            icmPressure,
            stackRatio: Math.round(stackRatio * 100) / 100,
            stackSize,
            avgStack,
            playersLeft,
            payoutSpots,
            adjustments,
            pushFoldNote,
            summary: `${icmPressure.replace(/_/g, ' ').toUpperCase()} — Stack: ${stackSize}bb (${Math.round(stackRatio * 100)}% of average). ${adjustments[0]?.detail || ''}`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 296: CROSS-GAME-TYPE PERFORMANCE
    // ═══════════════════════════════════════════════════════════════════════════

    getMultiGameTypeStats() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const gameTypes = {};

        history.forEach(h => {
            const nodeType = (h.nodeType || 'unknown').toLowerCase();
            let category;
            if (nodeType.includes('3bet') || nodeType.includes('4bet') || nodeType.includes('squeeze')) category = '3Bet+ Pots';
            else if (nodeType.includes('srp') || nodeType.includes('single')) category = 'Single Raised Pots';
            else if (nodeType.includes('limp')) category = 'Limped Pots';
            else if (nodeType.includes('blind')) category = 'Blind vs Blind';
            else category = 'Other';

            if (!gameTypes[category]) gameTypes[category] = { correct: 0, total: 0, evLoss: 0 };
            gameTypes[category].total++;
            if (h.correct) gameTypes[category].correct++;
            gameTypes[category].evLoss += (h.evLoss || 0);
        });

        const stats = Object.entries(gameTypes || {}).map(([type, data]) => ({
            type,
            total: data.total,
            correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            avgEVLoss: data.total > 0 ? Math.round((data.evLoss / data.total) * 100) / 100 : 0,
        }));
        stats.sort((a, b) => b.total - a.total);

        const weakest = stats.filter(s => s.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0] || null;
        const strongest = stats.filter(s => s.total >= 2).sort((a, b) => b.accuracy - a.accuracy)[0] || null;

        return {
            stats,
            weakestGameType: weakest,
            strongestGameType: strongest,
            totalGameTypes: stats.length,
            recommendation: weakest && weakest.accuracy < 50
                ? `Focus on ${weakest.type} — your ${weakest.accuracy}% accuracy suggests a gap in understanding.`
                : 'Your performance across pot types looks solid.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 297: BET SIZING ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getBettingSizeAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const sizingData = { small: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, large: { correct: 0, total: 0 }, overbet: { correct: 0, total: 0 } };

        history.forEach(h => {
            const action = (h.selectedAction || h.correctAction || '').toLowerCase();
            let sizeCategory = null;
            if (action.includes('25%') || action.includes('33%') || action.includes('1/3') || action.includes('small')) sizeCategory = 'small';
            else if (action.includes('50%') || action.includes('half') || action.includes('1/2') || action.includes('medium')) sizeCategory = 'medium';
            else if (action.includes('66%') || action.includes('75%') || action.includes('2/3') || action.includes('3/4') || action.includes('pot') || action.includes('large')) sizeCategory = 'large';
            else if (action.includes('overbet') || action.includes('150%') || action.includes('200%') || action.includes('all-in') || action.includes('allin') || action.includes('all in')) sizeCategory = 'overbet';

            if (sizeCategory) {
                sizingData[sizeCategory].total++;
                if (h.correct) sizingData[sizeCategory].correct++;
            }
        });

        const analysis = Object.entries(sizingData || {}).map(([size, data]) => ({
            size: size.charAt(0).toUpperCase() + size.slice(1),
            total: data.total,
            correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        })).filter(a => a.total > 0);

        const weakestSize = analysis.sort((a, b) => a.accuracy - b.accuracy)[0] || null;

        return {
            analysis,
            weakestSize,
            tip: weakestSize && weakestSize.accuracy < 60
                ? `Your ${weakestSize.size} sizing spots are at ${weakestSize.accuracy}% accuracy. Review when to use ${weakestSize.size.toLowerCase()} bets.`
                : 'Your sizing accuracy looks solid across all bet sizes.',
            generalTips: [
                'Small bets (25-33%): Use on dry boards with range advantage.',
                'Medium bets (50%): Default on most textures.',
                'Large bets (66-75%): Use on wet/connected boards to deny equity.',
                'Overbets (100%+): Use when your range is polarized and villain\'s is capped.',
            ],
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 298: HAND READING DRILL
    // ═══════════════════════════════════════════════════════════════════════════

    getHandReadingDrill(street = 'flop', villainActions = []) {
        const RANGE_NARROWING = {
            preflop_open: { range: '~20-30%', description: 'Villain opens from middle/late position', combos: '~250-400 combos' },
            preflop_3bet: { range: '~8-12%', description: 'Villain 3-bets', combos: '~100-160 combos' },
            flop_cbet: { range: '~60-70% of pfr range', description: 'Villain c-bets on the flop', removes: 'Weakest air hands that give up' },
            flop_check: { range: '~30-40% of pfr range', description: 'Villain checks back the flop', removes: 'Strong value and best bluffs', keeps: 'Marginal hands, showdown value, traps' },
            turn_barrel: { range: '~40-50% of cbet range', description: 'Villain double-barrels the turn', removes: 'Weak one-and-done bluffs, marginal hands' },
            turn_check: { range: '~50-60% of cbet range', description: 'Villain checks the turn after c-betting', removes: 'Strong value, most bluffs', keeps: 'Medium strength, pot control, traps' },
            river_bet: { range: 'Polarized', description: 'Villain bets the river', composition: 'Strong value hands + bluffs, very few medium hands' },
            river_check: { range: 'Bluff-catchers', description: 'Villain checks the river', composition: 'Medium strength hands that want to see showdown' },
        };

        const actions = villainActions.length > 0
            ? villainActions
            : ['preflop_open', `${street}_cbet`];

        const steps = actions.map(a => RANGE_NARROWING[a] || { range: 'Unknown', description: a });

        return {
            street,
            steps,
            villainActions: actions,
            keyPrinciple: 'Each action a villain takes either widens or narrows their range. Track their range across streets.',
            exercise: `After villain ${actions.map(a => a.replace(/_/g, ' ')).join(', then ')}: What hands are in their range? What hands are NOT?`,
            tips: [
                'Bets remove medium-strength hands from range (polarization)',
                'Checks add medium-strength hands, remove strongest value + bluffs',
                'Multiple barrels = very narrow, strong range',
                'Check-raise = polarized (strong value + draws/bluffs)',
            ],
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 299: VARIANCE SIMULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    getVarianceSimulator(winRate = 65, sampleSize = 100) {
        // Simulate binomial variance for given accuracy rate
        const p = winRate / 100;
        const n = sampleSize;
        const mean = n * p;
        const variance = n * p * (1 - p);
        const stdDev = Math.sqrt(variance);

        // 1 std dev range (68% confidence)
        const low1sd = Math.max(0, Math.round(mean - stdDev));
        const high1sd = Math.min(n, Math.round(mean + stdDev));

        // 2 std dev range (95% confidence)
        const low2sd = Math.max(0, Math.round(mean - 2 * stdDev));
        const high2sd = Math.min(n, Math.round(mean + 2 * stdDev));

        // Simulate 5 "runs" of n hands
        const simulations = [];
        for (let sim = 0; sim < 5; sim++) {
            let correct = 0;
            for (let i = 0; i < n; i++) {
                // Use deterministic seed-based random
                const seed = ((sim * 1000 + i * 7 + 13) * 2654435761) >>> 0;
                if ((seed / 4294967296) < p) correct++;
            }
            simulations.push({
                run: sim + 1,
                correct,
                accuracy: Math.round((correct / n) * 100),
            });
        }

        return {
            trueWinRate: winRate,
            sampleSize: n,
            expectedCorrect: Math.round(mean),
            standardDeviation: Math.round(stdDev * 10) / 10,
            confidence68: { low: low1sd, high: high1sd, lowPct: Math.round(low1sd / n * 100), highPct: Math.round(high1sd / n * 100) },
            confidence95: { low: low2sd, high: high2sd, lowPct: Math.round(low2sd / n * 100), highPct: Math.round(high2sd / n * 100) },
            simulations,
            insight: `With a true ${winRate}% win rate over ${n} hands, you'll see results between ${Math.round(low2sd / n * 100)}% and ${Math.round(high2sd / n * 100)}% roughly 95% of the time. Don't over-react to short-term swings.`,
            keyTakeaway: n < 50
                ? 'Small sample size — results can vary wildly. Don\'t draw conclusions from under 50 hands.'
                : n < 200
                    ? 'Moderate sample — trends are starting to emerge but variance is still significant.'
                    : 'Large sample — your results are becoming statistically meaningful.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 300: PERFORMANCE TREND ANALYSIS (COMPREHENSIVE)
    // ═══════════════════════════════════════════════════════════════════════════

    getPerformanceTrendAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 10) return null;
        const history = this._sessionStats.history;
        const windowSize = Math.max(3, Math.floor(history.length / 5));

        // Rolling accuracy windows
        const windows = [];
        for (let i = 0; i <= history.length - windowSize; i++) {
            const window = history.slice(i, i + windowSize);
            const acc = Math.round((window.filter(h => h.correct).length / window.length) * 100);
            const avgEV = window.reduce((sum, h) => sum + (h.evLoss || 0), 0) / window.length;
            windows.push({
                startIndex: i,
                endIndex: i + windowSize - 1,
                accuracy: acc,
                avgEVLoss: Math.round(avgEV * 100) / 100,
            });
        }

        // Calculate linear trend (simple least squares)
        const n = windows.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        windows.forEach((w, i) => {
            sumX += i;
            sumY += w.accuracy;
            sumXY += i * w.accuracy;
            sumX2 += i * i;
        });
        const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;
        const intercept = n > 0 ? (sumY - slope * sumX) / n : 0;

        // Determine trend
        let trend;
        if (slope > 0.5) trend = 'strongly_improving';
        else if (slope > 0.1) trend = 'slightly_improving';
        else if (slope < -0.5) trend = 'strongly_declining';
        else if (slope < -0.1) trend = 'slightly_declining';
        else trend = 'stable';

        // Peak and trough
        const peakWindow = windows.reduce((best, w) => w.accuracy > best.accuracy ? w : best, windows[0]);
        const troughWindow = windows.reduce((worst, w) => w.accuracy < worst.accuracy ? w : worst, windows[0]);

        // Consistency score (lower std dev = more consistent)
        const avgAcc = sumY / n;
        const varianceAcc = windows.reduce((sum, w) => sum + Math.pow(w.accuracy - avgAcc, 2), 0) / n;
        const consistencyScore = Math.max(0, Math.round(100 - Math.sqrt(varianceAcc)));

        return {
            windows: windows.map((w, i) => ({ ...w, trendLine: Math.round(intercept + slope * i) })),
            trend,
            slope: Math.round(slope * 100) / 100,
            averageAccuracy: Math.round(avgAcc),
            consistencyScore,
            peakAccuracy: peakWindow.accuracy,
            peakAt: `Hands ${peakWindow.startIndex + 1}-${peakWindow.endIndex + 1}`,
            troughAccuracy: troughWindow.accuracy,
            troughAt: `Hands ${troughWindow.startIndex + 1}-${troughWindow.endIndex + 1}`,
            totalHands: history.length,
            windowSize,
            insight: trend === 'strongly_improving'
                ? 'Excellent improvement trend! Your accuracy is climbing steadily.'
                : trend === 'slightly_improving'
                    ? 'Positive trend — you are getting better as the session continues.'
                    : trend === 'stable'
                        ? 'Stable performance — consistency is good. Push for improvement with targeted drills.'
                        : trend === 'slightly_declining'
                            ? 'Mild decline detected — possible fatigue. Consider a break.'
                            : 'Significant accuracy drop — take a break and review your recent mistakes.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 301: OPTIMAL LINE NARRATION
    // ═══════════════════════════════════════════════════════════════════════════

    getOptimalLineNarration(correctAction, frequencies, street, nodeType, heroPosition, handCategory) {
        const freqEntries = frequencies ? Object.entries(frequencies || {}).sort((a, b) => b[1] - a[1]) : [];
        const topAction = freqEntries[0] || [correctAction, 100];
        const secondAction = freqEntries[1] || null;
        const isMixed = secondAction && secondAction[1] >= 15;

        const streetName = (street || 'flop').charAt(0).toUpperCase() + (street || 'flop').slice(1);
        const posLabel = (heroPosition || 'IP').toUpperCase();

        let narration = '';
        if (isMixed) {
            narration = `On the ${streetName} from ${posLabel}, the solver mixes between ${topAction[0]} (${topAction[1]}%) and ${secondAction[0]} (${secondAction[1]}%). `;
            narration += `This mixing occurs because both actions have similar EV. `;
            if (topAction[0].toLowerCase().includes('bet') || topAction[0].toLowerCase().includes('raise')) {
                narration += `The aggressive option builds the pot when you have equity advantage, while the passive option controls pot size.`;
            } else {
                narration += `The passive option protects your checking range, while the aggressive option extracts value or denies equity.`;
            }
        } else {
            narration = `The solver strongly prefers ${correctAction} here (${topAction[1]}%). `;
            const action = correctAction.toLowerCase();
            if (action.includes('fold')) narration += `Your hand doesn't have enough equity to continue profitably in this spot.`;
            else if (action.includes('check') || action.includes('call')) narration += `This is a spot to control the pot and realize equity rather than inflate it.`;
            else if (action.includes('bet') || action.includes('raise')) narration += `You have enough equity and fold equity to justify aggression here.`;
            else if (action.includes('all')) narration += `Stack depth and pot odds make committing all chips the highest-EV play.`;
        }

        return {
            narration,
            correctAction,
            isMixed,
            topActions: freqEntries.slice(0, 3).map(([a, f]) => ({ action: a, frequency: f })),
            street: streetName,
            position: posLabel,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 302: STREET TRANSITION ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getStreetTransitionAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;
        const transitions = { 'flop_to_turn': { correct: 0, total: 0 }, 'turn_to_river': { correct: 0, total: 0 }, 'preflop_to_flop': { correct: 0, total: 0 } };

        // Group hands by their multi-street sequences
        const streetOrder = { preflop: 0, flop: 1, turn: 2, river: 3 };
        let prevStreet = null;
        let prevCorrect = null;

        history.forEach(h => {
            const street = (h.street || 'flop').toLowerCase();
            if (prevStreet !== null) {
                const key = `${prevStreet}_to_${street}`;
                if (transitions[key]) {
                    transitions[key].total++;
                    if (h.correct) transitions[key].correct++;
                }
            }
            prevStreet = street;
            prevCorrect = h.correct;
        });

        const analysis = Object.entries(transitions || {})
            .filter(([_, data]) => data.total >= 2)
            .map(([transition, data]) => ({
                transition: transition.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                total: data.total,
                correct: data.correct,
                accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            }));

        // Check if accuracy drops on later streets
        const streetAcc = {};
        history.forEach(h => {
            const st = (h.street || 'flop').toLowerCase();
            if (!streetAcc[st]) streetAcc[st] = { correct: 0, total: 0 };
            streetAcc[st].total++;
            if (h.correct) streetAcc[st].correct++;
        });

        const streetResults = Object.entries(streetAcc || {}).map(([st, data]) => ({
            street: st.charAt(0).toUpperCase() + st.slice(1),
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            total: data.total,
        })).sort((a, b) => (streetOrder[a.street.toLowerCase()] || 0) - (streetOrder[b.street.toLowerCase()] || 0));

        const weakestStreet = streetResults.filter(s => s.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0] || null;

        return {
            transitions: analysis,
            streetAccuracy: streetResults,
            weakestStreet,
            recommendation: weakestStreet && weakestStreet.accuracy < 50
                ? `Your ${weakestStreet.street} play needs work (${weakestStreet.accuracy}%). Focus on ${weakestStreet.street.toLowerCase()}-specific strategy.`
                : 'Your accuracy across streets is reasonably balanced.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 303: DEFENSE FREQUENCY CHECK
    // ═══════════════════════════════════════════════════════════════════════════

    getDefenseFrequencyCheck() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // When facing bets, how often do we defend (call + raise) vs fold?
        let facingBet = { defend: 0, fold: 0, total: 0 };
        let facingRaise = { defend: 0, fold: 0, total: 0 };

        history.forEach(h => {
            const node = (h.nodeType || '').toLowerCase();
            const action = (h.selectedAction || '').toLowerCase();
            const isFacingAggression = node.includes('facing') || node.includes('vs_bet') || node.includes('vs_raise') ||
                node.includes('check_raise') || action.includes('fold') || action.includes('call');

            if (isFacingAggression) {
                const isFacingRaise = node.includes('raise') || node.includes('3bet') || node.includes('4bet');
                const target = isFacingRaise ? facingRaise : facingBet;
                target.total++;
                if (action.includes('fold')) target.fold++;
                else target.defend++;
            }
        });

        // MDF (Minimum Defense Frequency) is typically ~60-67% vs pot-sized bets
        const betDefendPct = facingBet.total > 0 ? Math.round((facingBet.defend / facingBet.total) * 100) : null;
        const raiseDefendPct = facingRaise.total > 0 ? Math.round((facingRaise.defend / facingRaise.total) * 100) : null;

        const assessments = [];
        if (betDefendPct !== null) {
            if (betDefendPct < 50) assessments.push({ type: 'overfolding_vs_bets', message: `Defending only ${betDefendPct}% vs bets — you are exploitably tight. MDF suggests ~60%+.`, severity: 'critical' });
            else if (betDefendPct < 60) assessments.push({ type: 'slightly_tight_vs_bets', message: `Defending ${betDefendPct}% vs bets — slightly below MDF. Consider widening.`, severity: 'moderate' });
            else if (betDefendPct > 80) assessments.push({ type: 'overdefending_vs_bets', message: `Defending ${betDefendPct}% vs bets — too loose. You can fold more weak hands.`, severity: 'moderate' });
            else assessments.push({ type: 'balanced_vs_bets', message: `Defending ${betDefendPct}% vs bets — well balanced.`, severity: 'good' });
        }

        return {
            facingBet: { ...facingBet, defendPct: betDefendPct },
            facingRaise: { ...facingRaise, defendPct: raiseDefendPct },
            assessments,
            mdfReference: 'MDF = 1 - (bet / (pot + bet)). Vs a pot-sized bet, defend ~50%. Vs 2/3 pot, defend ~60%. Vs 1/3 pot, defend ~75%.',
            isBalanced: assessments.every(a => a.severity === 'good'),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 304: POLARIZATION INDEX
    // ═══════════════════════════════════════════════════════════════════════════

    getPolarizationIndex() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Analyze bet sizing patterns: polarized = big bets/checks, merged = medium bets
        let bigBets = 0, smallBets = 0, checks = 0, mediumBets = 0, totalAggressive = 0;

        history.forEach(h => {
            const action = (h.selectedAction || '').toLowerCase();
            if (action.includes('check') || action.includes('fold')) { checks++; return; }
            if (action.includes('bet') || action.includes('raise') || action.includes('all')) {
                totalAggressive++;
                if (action.includes('all') || action.includes('overbet') || action.includes('150') || action.includes('200') || action.includes('pot') || action.includes('75%')) bigBets++;
                else if (action.includes('25%') || action.includes('33%') || action.includes('1/3') || action.includes('small')) smallBets++;
                else mediumBets++;
            }
        });
// @@PUB_REGION_15@@
    getGTOComplianceScore() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
// @@PUB_REGION_16@@
