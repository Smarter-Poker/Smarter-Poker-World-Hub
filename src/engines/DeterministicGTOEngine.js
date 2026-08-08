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
        }

        // Category 5: Fold vs call decision (defensive error)
        if ((sel === 'f' || sel === 'fold') && (cor === 'call' || cor === 'c')) {
            return { type: 'OVER_FOLD', label: 'Over-Folding', description: 'Your hand has enough equity vs villain\'s range to continue. Folding too much lets villain profit with any two cards.', severity: 'high' };
        }
        if ((sel === 'call' || sel === 'c') && (cor === 'f' || cor === 'fold')) {
            return { type: 'OVER_CALL', label: 'Over-Calling', description: 'This hand doesn\'t have enough equity against villain\'s betting range. Calling here is burning money.', severity: 'high' };
        }

        // Default
        return { type: 'STRATEGY_ERROR', label: 'Strategy Error', description: 'The solver sees a better play here. Review the spot\'s fundamentals.', severity: 'medium' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 253: PATTERN DETECTION ACROSS SESSION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 253: Find if the current mistake matches a pattern from earlier in the session.
     */
    _findMistakePattern(street, nodeType, selectedAction, correctAction) {
        if (!this._mistakeTracker) return null;
        const key = `${street}:${nodeType || 'general'}`;
        const mistakes = this._mistakeTracker[key];
        if (!mistakes || mistakes < 2) return null;

        // Check if user repeatedly makes the same type of error in the same spot
        const totalForSpot = mistakes;
        if (totalForSpot >= 3) {
            return {
                isRecurring: true,
                count: totalForSpot,
                message: `This is the ${totalForSpot}${totalForSpot === 3 ? 'rd' : 'th'} time you've missed a ${street} ${nodeType || ''} spot this session. This is a systematic leak — add it to your study list.`,
                spotType: key,
            };
        }
        if (totalForSpot === 2) {
            return {
                isRecurring: true,
                count: 2,
                message: `You missed a similar ${street} spot earlier. Pay extra attention to ${street} strategy in ${nodeType || 'this configuration'}.`,
                spotType: key,
            };
        }
        return null;
    }

    /**
     * Phase 253: Generate an actionable fix instruction based on mistake type.
     */
    _generateActionableFix(mistakeType, street, nodeType, handCategory) {
        if (!mistakeType) return null;
        const mt = mistakeType.type;

        if (mt === 'OVER_FOLD') {
            if (street === 'river') return 'Practice: Estimate your bluff-catching frequency. You need to call enough to make villain indifferent to bluffing.';
            if (street === 'flop') return 'Practice: Check if your hand has enough equity (draws, backdoors, overcards) to continue. Folding too early forfeits equity.';
            return 'Drill: Review pot odds math. Calculate the minimum equity needed to call and compare it to your hand\'s equity.';
        }
        if (mt === 'TOO_PASSIVE') {
            if (street === 'flop' && (nodeType || '').includes('ip')) return 'Practice: IP on the flop with initiative, you should be c-betting frequently. Ask: does betting deny equity or extract value?';
            if (street === 'turn') return 'Practice: When you bet the flop, plan your turn action in advance. Checking the turn after a flop bet often signals weakness.';
            return 'Drill: For each hand you want to check, ask: would betting accomplish more (deny equity, charge draws, build pot)?';
        }
        if (mt === 'TOO_AGGRESSIVE') {
            if (street === 'river') return 'Practice: On the river, only bet for value (can you get called by worse?) or as a bluff (can you fold out better?). If neither, check.';
            return 'Drill: Before betting, identify your hand\'s goal — value, protection, or bluff. If none apply clearly, checking is usually correct.';
        }
        if (mt === 'SIZING_ERROR') return 'Practice: Small bets target inelastic calls; large bets polarize. Match your sizing to your range, not just your hand.';
        if (mt === 'MIX_MISREAD') return 'Practice: In mixed strategy spots, default to the highest-frequency action. Only deviate when you have a strong exploitative reason.';
        if (mt === 'OVER_CALL') return 'Drill: Calculate minimum defense frequency vs the bet size. Some hands must fold even if they look decent — that\'s how ranges work.';
        if (mt === 'HERO_CALL') return 'Practice: Before calling a big bet, ask: what value hands does villain bet that I beat? If the answer is few or none, fold.';

        return 'Review this spot type in your next study session. Focus on understanding the solver\'s reasoning, not memorizing the action.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 254: POST-SESSION LEAK REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 254: Analyze session data and generate a ranked leak report.
     * Returns top 3 specific leaks with fix instructions.
     */
    generateLeakReport() {
        const total = this._sessionStats?.total || 0;
        if (total < 5) return { leaks: [], summary: 'Play at least 5 hands to generate a leak report.' };

        const leaks = [];
        const accuracy = total > 0 ? (this._sessionStats.correct / total) * 100 : 0;

        // Leak 1: Positional weaknesses
        if (this._positionalAwareness) {
            const posEntries = Object.entries(this._positionalAwareness || {});
            for (const [pos, data] of posEntries) {
                if (data.total >= 2) {
                    const posAcc = (data.correct / data.total) * 100;
                    if (posAcc < 50) {
                        leaks.push({
                            type: 'POSITIONAL',
                            severity: posAcc < 30 ? 'critical' : 'high',
                            title: `Weak from ${pos}`,
                            detail: `${Math.round(posAcc)}% accuracy from ${pos} (${data.correct}/${data.total}). Your overall is ${Math.round(accuracy)}%.`,
                            fix: `Focus your next session on ${pos}-specific spots. Review opening ranges and postflop strategy when playing from ${pos}.`,
                            score: (accuracy - posAcc) * data.total, // Higher = worse leak
                        });
                    }
                }
            }
        }

        // Leak 2: Street-specific weaknesses from question type tracker
        if (this._questionTypeTracker) {
            const streetStats = {};
            for (const [key, count] of Object.entries(this._questionTypeTracker || {})) {
                const street = key.split(':')[0];
                if (!streetStats[street]) streetStats[street] = { total: 0, wrong: 0 };
                streetStats[street].total += count;
            }
            // Cross-reference with mistakes
            if (this._mistakeTracker) {
                for (const [key, count] of Object.entries(this._mistakeTracker || {})) {
                    const street = key.split(':')[0];
                    if (streetStats[street]) streetStats[street].wrong += count;
                }
            }
            for (const [street, data] of Object.entries(streetStats || {})) {
                if (data.total >= 3 && data.wrong > 0) {
                    const streetAcc = ((data.total - data.wrong) / data.total) * 100;
                    if (streetAcc < 50) {
                        leaks.push({
                            type: 'STREET',
                            severity: streetAcc < 30 ? 'critical' : 'high',
                            title: `${street.charAt(0).toUpperCase() + street.slice(1)} play needs work`,
                            detail: `${Math.round(streetAcc)}% accuracy on the ${street} (${data.wrong} mistakes in ${data.total} hands).`,
                            fix: street === 'river' ? 'River play requires precise ranging. Practice identifying villain\'s value and bluff combos before deciding.'
                                : street === 'turn' ? 'The turn is where ranges narrow. Practice turn barreling theory and check-raise spots.'
                                : street === 'flop' ? 'Flop play is about range vs range. Practice c-bet frequency decisions based on board texture.'
                                : 'Review preflop ranges for your position and stack depth.',
                            score: (accuracy - streetAcc) * data.total,
                        });
                    }
                }
            }
        }

        // Leak 3: Aggression imbalance
        if (this._aggressionTracker) {
            let totalBets = 0;
            let totalChecks = 0;
            for (const [street, actions] of Object.entries(this._aggressionTracker || {})) {
                for (const [action, count] of Object.entries(actions || {})) {
                    const a = action.toLowerCase();
                    if (a.match(/^(b|bet|r|raise|allin)/)) totalBets += count;
                    else if (a === 'x' || a === 'check' || a === 'c' || a === 'call' || a === 'f' || a === 'fold') totalChecks += count;
                }
            }
            const totalActions = totalBets + totalChecks;
            if (totalActions >= 5) {
                const aggPct = (totalBets / totalActions) * 100;
                if (aggPct > 75) {
                    leaks.push({
                        type: 'AGGRESSION',
                        severity: 'medium',
                        title: 'Over-aggressive tendencies',
                        detail: `You bet/raise ${Math.round(aggPct)}% of the time. The solver typically bets 40-60% depending on the spot.`,
                        fix: 'Not every hand benefits from aggression. Practice identifying check-back and check-call spots where pot control is optimal.',
                        score: Math.abs(aggPct - 55) * 2,
                    });
                } else if (aggPct < 30) {
                    leaks.push({
                        type: 'AGGRESSION',
                        severity: 'medium',
                        title: 'Too passive — not betting enough',
                        detail: `You only bet/raise ${Math.round(aggPct)}% of the time. You\'re likely missing value bets and failing to deny equity.`,
                        fix: 'Focus on spots where betting is clearly +EV: thin value bets, equity denial on wet boards, and balanced bluffs.',
                        score: Math.abs(aggPct - 55) * 2,
                    });
                }
            }
        }

        // Leak 4: Concept mastery gaps
        if (this._conceptMastery) {
            for (const [concept, data] of Object.entries(this._conceptMastery || {})) {
                if (data.total >= 3) {
                    const conceptAcc = (data.correct / data.total) * 100;
                    if (conceptAcc < 40) {
                        leaks.push({
                            type: 'CONCEPT',
                            severity: conceptAcc < 20 ? 'critical' : 'high',
                            title: `Weak concept: ${concept}`,
                            detail: `Only ${Math.round(conceptAcc)}% accuracy on ${concept} spots (${data.correct}/${data.total}).`,
                            fix: `Dedicate a study session to ${concept}. Review solver outputs for 10+ examples of this spot type and note the patterns.`,
                            score: (100 - conceptAcc) * data.total,
                        });
                    }
                }
            }
        }

        // Sort by severity score (highest = worst leak)
        leaks.sort((a, b) => b.score - a.score);

        // Generate summary
        const topLeaks = leaks.slice(0, 3);
        let summary = '';
        if (topLeaks.length === 0) {
            if (accuracy >= 80) summary = 'Excellent session. No significant leaks detected. Keep pushing to higher difficulty levels.';
            else if (accuracy >= 60) summary = 'Solid session. Minor areas for improvement but no glaring leaks. Focus on consistency.';
            else summary = 'Tough session, but the data is limited. Play more hands to get meaningful leak detection.';
        } else {
            const criticalCount = topLeaks.filter(l => l.severity === 'critical').length;
            if (criticalCount > 0) summary = `Found ${criticalCount} critical leak${criticalCount > 1 ? 's' : ''}. Prioritize fixing ${topLeaks[0].title.toLowerCase()} before moving to harder levels.`;
            else summary = `Found ${topLeaks.length} area${topLeaks.length > 1 ? 's' : ''} for improvement. Your biggest opportunity is: ${topLeaks[0].title.toLowerCase()}.`;
        }

        return { leaks: topLeaks, summary, totalHands: total, accuracy: Math.round(accuracy) };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 255: SESSION GRADING SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 255: Grade the overall session performance (A+ through F).
     */
    getSessionGrade() {
        const total = this._sessionStats?.total || 0;
        if (total < 3) return { grade: '-', label: 'Too few hands', color: '#64748b' };

        const accuracy = (this._sessionStats.correct / total) * 100;
        const streak = this._sessionBests?.streak || 0;
        const tilt = this.detectTilt();
        const tiltPenalty = tilt?.level === 'CRITICAL' ? 10 : tilt?.level === 'WARNING' ? 5 : 0;

        // Weighted score: accuracy (70%) + streak bonus (15%) + consistency bonus (15%) - tilt penalty
        const streakBonus = Math.min(15, (streak / total) * 30);
        // Consistency: std deviation of recent results (lower = more consistent = better)
        const recent = (this._recentResults || []).slice(-10);
        let consistencyBonus = 10;
        if (recent.length >= 5) {
            const recentAcc = recent.filter(Boolean).length / recent.length;
            consistencyBonus = recentAcc >= 0.7 ? 15 : recentAcc >= 0.5 ? 10 : 5;
        }

        const rawScore = (accuracy * 0.7) + streakBonus + consistencyBonus - tiltPenalty;
        const score = Math.max(0, Math.min(100, rawScore));

        if (score >= 95) return { grade: 'A+', label: 'Exceptional', color: '#22c55e', score: Math.round(score) };
        if (score >= 88) return { grade: 'A', label: 'Excellent', color: '#22c55e', score: Math.round(score) };
        if (score >= 82) return { grade: 'A-', label: 'Very Good', color: '#4ade80', score: Math.round(score) };
        if (score >= 76) return { grade: 'B+', label: 'Good', color: '#86efac', score: Math.round(score) };
        if (score >= 70) return { grade: 'B', label: 'Above Average', color: '#fbbf24', score: Math.round(score) };
        if (score >= 64) return { grade: 'B-', label: 'Decent', color: '#fbbf24', score: Math.round(score) };
        if (score >= 56) return { grade: 'C+', label: 'Needs Work', color: '#f97316', score: Math.round(score) };
        if (score >= 48) return { grade: 'C', label: 'Below Average', color: '#f97316', score: Math.round(score) };
        if (score >= 40) return { grade: 'C-', label: 'Struggling', color: '#ef4444', score: Math.round(score) };
        if (score >= 30) return { grade: 'D', label: 'Poor', color: '#ef4444', score: Math.round(score) };
        return { grade: 'F', label: 'Review Fundamentals', color: '#dc2626', score: Math.round(score) };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 256: SPOT DIFFICULTY ESTIMATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 256: Estimate how hard a given spot is (1-10 difficulty).
     * Uses frequency distribution, street, and stack depth.
     */
    estimateSpotDifficulty(frequencies, street, stackDepth, nodeType) {
        let difficulty = 3; // baseline

        // Mixed strategy spots are harder
        if (frequencies) {
            const freqs = Object.values(frequencies || {}).filter(f => f > 0.01);
            const entropy = freqs.reduce((sum, f) => sum - (f > 0 ? f * Math.log2(f) : 0), 0);
            difficulty += Math.min(3, entropy * 2); // Max +3 from mixing
        }

        // Later streets are harder
        if (street === 'turn') difficulty += 1;
        if (street === 'river') difficulty += 2;

        // Deeper stacks add complexity
        if (stackDepth && stackDepth > 100) difficulty += 1;
        if (stackDepth && stackDepth > 200) difficulty += 1;

        // Complex node types are harder
        if (nodeType && (nodeType.includes('3bet') || nodeType.includes('4bet'))) difficulty += 1;
        if (nodeType && nodeType.includes('squeeze')) difficulty += 1;

        return {
            difficulty: Math.max(1, Math.min(10, Math.round(difficulty))),
            label: difficulty >= 8 ? 'Expert' : difficulty >= 6 ? 'Advanced' : difficulty >= 4 ? 'Intermediate' : 'Beginner',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 257: IMPROVEMENT VELOCITY TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 257: Track improvement velocity — are you getting better or worse over the session?
     */
    getImprovementVelocity() {
        const recent = this._recentResults || [];
        if (recent.length < 10) return { velocity: 0, trend: 'INSUFFICIENT_DATA', message: 'Play more hands to see your improvement trend.' };

        // Compare first half vs second half of the session
        const midpoint = Math.floor(recent.length / 2);
        const firstHalf = recent.slice(0, midpoint);
        const secondHalf = recent.slice(midpoint);

        const firstAcc = firstHalf.filter(Boolean).length / firstHalf.length;
        const secondAcc = secondHalf.filter(Boolean).length / secondHalf.length;
        const delta = secondAcc - firstAcc;

        // Also check rolling 5-hand windows for micro-trends
        let improving = 0;
        let declining = 0;
        for (let i = 5; i < recent.length; i++) {
            const prev = recent.slice(i - 5, i - 2).filter(Boolean).length / 3;
            const curr = recent.slice(i - 2, i + 1).filter(Boolean).length / 3;
            if (curr > prev) improving++;
            else if (curr < prev) declining++;
        }

        if (delta > 0.15) return { velocity: delta, trend: 'STRONG_IMPROVEMENT', message: `Strong upward trend. Your accuracy improved by ${Math.round(delta * 100)}% from the first to the second half.` };
        if (delta > 0.05) return { velocity: delta, trend: 'IMPROVING', message: `Positive trend. You\'re getting sharper as the session progresses (+${Math.round(delta * 100)}%).` };
        if (delta < -0.15) return { velocity: delta, trend: 'DECLINING', message: `Accuracy dropped ${Math.round(Math.abs(delta) * 100)}% in the second half. Consider taking a break or lowering difficulty.` };
        if (delta < -0.05) return { velocity: delta, trend: 'SLIGHT_DECLINE', message: `Slight dip in the second half (-${Math.round(Math.abs(delta) * 100)}%). Could be fatigue or harder spots.` };
        return { velocity: delta, trend: 'STABLE', message: 'Consistent performance throughout the session. Good focus and discipline.' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 258: DRILL PRESCRIPTION ENGINE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 258: Based on session performance, prescribe specific drills.
     */
    prescribeDrills() {
        const leakReport = this.generateLeakReport();
        const drills = [];

        for (const leak of (leakReport.leaks || [])) {
            if (leak.type === 'POSITIONAL') {
                drills.push({
                    name: `${leak.title} Bootcamp`,
                    description: `Play 25 hands exclusively from ${leak.title.replace('Weak from ', '')}. Focus on range construction and postflop fundamentals.`,
                    type: 'position',
                    duration: '15 min',
                    priority: leak.severity === 'critical' ? 1 : 2,
                });
            }
            if (leak.type === 'STREET') {
                const street = leak.title.split(' ')[0].toLowerCase();
                drills.push({
                    name: `${leak.title.split(' ')[0]} Accuracy Drill`,
                    description: `Focus session on ${street}-only decisions. Review solver frequencies before each hand.`,
                    type: 'street',
                    duration: '20 min',
                    priority: leak.severity === 'critical' ? 1 : 2,
                });
            }
            if (leak.type === 'AGGRESSION') {
                drills.push({
                    name: 'Aggression Calibration',
                    description: leak.title.includes('passive')
                        ? 'Practice identifying thin value bets and equity denial spots. For each check, ask: should I bet?'
                        : 'Practice pot control and check-back spots. For each bet, ask: am I getting called by worse or folding out better?',
                    type: 'aggression',
                    duration: '15 min',
                    priority: 2,
                });
            }
            if (leak.type === 'CONCEPT') {
                drills.push({
                    name: `${leak.title.replace('Weak concept: ', '')} Deep Dive`,
                    description: `Study 10 solver examples of ${leak.title.replace('Weak concept: ', '')} spots. Note the common patterns.`,
                    type: 'concept',
                    duration: '10 min',
                    priority: leak.severity === 'critical' ? 1 : 3,
                });
            }
        }

        // Always suggest a warmup drill
        if (drills.length === 0) {
            drills.push({
                name: 'Maintain Your Edge',
                description: 'No specific leaks detected. Continue at current difficulty and try a challenge mode session.',
                type: 'general',
                duration: '10 min',
                priority: 3,
            });
        }

        return drills.sort((a, b) => a.priority - b.priority).slice(0, 3);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 259: FREQUENCY MASTERY SCORE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 259: Score how well the user matches solver frequencies over the session.
     * This is the ultimate measure — not just right/wrong but frequency alignment.
     */
    getFrequencyMasteryScore() {
        if (!this._freqComparison) return { score: 0, label: 'No data', details: [] };

        let totalDeviation = 0;
        let totalDataPoints = 0;
        const details = [];

        for (const [street, nodes] of Object.entries(this._freqComparison || {})) {
            for (const [nodeType, actions] of Object.entries(nodes || {})) {
                for (const [action, data] of Object.entries(actions || {})) {
                    if (data.count >= 2) {
                        const userFreq = data.count > 0 ? data.userCount / data.count : 0;
                        const solverFreq = data.solverAvg || 0;
                        const deviation = Math.abs(userFreq - solverFreq);
                        totalDeviation += deviation;
                        totalDataPoints++;

                        if (deviation > 0.2) {
                            details.push({
                                spot: `${street} ${nodeType}`,
                                action: action,
                                userFreq: Math.round(userFreq * 100),
                                solverFreq: Math.round(solverFreq * 100),
                                deviation: Math.round(deviation * 100),
                            });
                        }
                    }
                }
            }
        }

        if (totalDataPoints === 0) return { score: 0, label: 'Insufficient data', details: [] };

        const avgDeviation = totalDeviation / totalDataPoints;
        const score = Math.max(0, Math.round((1 - avgDeviation) * 100));

        const label = score >= 90 ? 'Solver-Level Play' : score >= 75 ? 'Strong Frequency Alignment' : score >= 60 ? 'Decent Balance' : score >= 40 ? 'Frequency Imbalance' : 'Major Frequency Leaks';

        return {
            score,
            label,
            avgDeviation: Math.round(avgDeviation * 100),
            dataPoints: totalDataPoints,
            details: details.sort((a, b) => b.deviation - a.deviation).slice(0, 5),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 260: ENHANCED SESSION SUMMARY REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 260: Generate a comprehensive end-of-session report object
     * that includes grading, leaks, drills, frequency mastery, and improvement velocity.
     */
    generateSessionReport() {
        return {
            grade: this.getSessionGrade(),
            leakReport: this.generateLeakReport(),
            drills: this.prescribeDrills(),
            frequencyMastery: this.getFrequencyMasteryScore(),
            velocity: this.getImprovementVelocity(),
            dashboard: this.getTrainingDashboard(),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 250: COMPREHENSIVE TRAINING DASHBOARD DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 250: Generate all data needed for a comprehensive training dashboard.
     */
    getTrainingDashboard() {
        return {
            // Core stats
            session: {
                total: this._sessionStats?.total || 0,
                correct: this._sessionStats?.correct || 0,
                accuracy: this._sessionStats?.total > 0 ? ((this._sessionStats.correct / this._sessionStats.total) * 100).toFixed(1) + '%' : 'N/A',
            },
            // Performance
            trend: this.getPerformanceTrend(),
            comparison: this.getOptimalPlayComparison(),
            deviations: this.getDeviationSummary(),
            // Analytics
            aggression: this.getAggressionFactors(),
            preflopStats: this.getPreflopStats(),
            positional: this.getPositionalAwarenessScore(),
            frequencyBalance: this.getExpectedFrequencyBalance(),
            // Learning
            conceptMastery: this.getConceptMastery(),
            weaknesses: this.getWeaknessTargets(),
            recommendedDrills: this.getRecommendedDrills(),
            progressiveLevel: this.getProgressiveLevelDescription(),
            // Engagement
            achievements: this.checkAchievements(),
            challengeResults: this.getChallengeResults(),
            streak: this._sessionBests?.streak || 0,
            tiltStatus: this.detectTilt(),
            // Session
            timing: this.getTimingAnalysis(),
            evGraph: this.getEVGraphData(),
            cumulativeCost: this.getCumulativeDeviationCost(),
            // Meta
            engineHealth: this.getEngineHealth(),
            autodifficulty: this.getAutoAdjustedDifficulty(),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 271: HAND STRENGTH CLASSIFICATION DISPLAY
    // ═══════════════════════════════════════════════════════════════════════════

    classifyHandStrength(handCategory, boardTexture, street) {
        const cat = (handCategory || '').toLowerCase();
        const tiers = {
            premium: { tier: 'premium', label: 'Premium', color: '#22c55e', icon: '★★★', playabilityScore: 95 },
            strong: { tier: 'strong', label: 'Strong', color: '#4ade80', icon: '★★☆', playabilityScore: 80 },
            medium: { tier: 'medium', label: 'Marginal', color: '#fbbf24', icon: '★☆☆', playabilityScore: 55 },
            weak: { tier: 'weak', label: 'Weak', color: '#f97316', icon: '☆☆☆', playabilityScore: 30 },
            trash: { tier: 'trash', label: 'Air', color: '#ef4444', icon: '✕', playabilityScore: 10 },
            draw: { tier: 'draw', label: 'Draw', color: '#3b82f6', icon: '♦', playabilityScore: 50 },
        };
        let tier = 'medium';
        let description = 'Medium-strength hand with thin value or marginal showdown equity.';
        if (cat.includes('nut') || cat.includes('full house') || cat.includes('straight flush') || cat.includes('quads') || cat.includes('set') || cat.includes('top two')) {
            tier = 'premium'; description = 'Monster hand — focus on building the pot and extracting maximum value.';
        } else if (cat.includes('overpair') || cat.includes('top pair top kicker') || cat.includes('tptk') || cat.includes('two pair')) {
            tier = 'strong'; description = 'Strong made hand — generally betting for value but watch for board texture changes.';
        } else if (cat.includes('flush draw') || cat.includes('open ended') || cat.includes('combo draw') || cat.includes('oesd')) {
            tier = 'draw'; description = 'Drawing hand — equity comes from completing the draw; consider semi-bluff aggression.';
        } else if (cat.includes('middle pair') || cat.includes('second pair') || cat.includes('weak top pair') || cat.includes('top pair weak kicker')) {
            tier = 'medium'; description = 'Marginal showdown value — pot control, careful with sizing, avoid bloating the pot.';
        } else if (cat.includes('bottom pair') || cat.includes('ace high') || cat.includes('king high') || cat.includes('underpair')) {
            tier = 'weak'; description = 'Weak holding — limited showdown value, consider if bluff-catching is profitable.';
        } else if (cat.includes('air') || cat.includes('no pair') || cat.includes('missed') || cat.includes('gutshot')) {
            tier = 'trash'; description = 'No showdown value — only profitable as a bluff with good blockers or fold equity.';
        }
        if (street === 'river' && tier === 'draw') { tier = 'trash'; description = 'Missed draw on the river — no equity improvement possible, bluff or give up.'; }
        return { ...tiers[tier], description };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 272: EQUITY VS RANGE ESTIMATE
    // ═══════════════════════════════════════════════════════════════════════════

    estimateEquityVsRange(handCategory, street, nodeType, heroPosition, villainPosition) {
        const cat = (handCategory || '').toLowerCase();
        const st = (street || 'flop').toLowerCase();
        const node = (nodeType || '').toLowerCase();
        let equity = 50;
        if (cat.includes('nut') || cat.includes('full house') || cat.includes('quads')) equity = 92;
        else if (cat.includes('set') || cat.includes('top two')) equity = 85;
        else if (cat.includes('overpair') || cat.includes('tptk')) equity = 72;
        else if (cat.includes('two pair')) equity = 68;
        else if (cat.includes('top pair')) equity = 60;
        else if (cat.includes('flush draw') && cat.includes('combo')) equity = 52;
        else if (cat.includes('flush draw') || cat.includes('oesd') || cat.includes('open ended')) equity = 38;
        else if (cat.includes('middle pair') || cat.includes('second pair')) equity = 42;
        else if (cat.includes('gutshot')) equity = 22;
        else if (cat.includes('ace high') || cat.includes('overcards')) equity = 28;
        else if (cat.includes('bottom pair')) equity = 35;
        else if (cat.includes('air') || cat.includes('no pair')) equity = 15;
        if (st === 'turn') equity = equity > 50 ? equity + 3 : equity - 3;
        if (st === 'river') equity = equity > 50 ? equity + 5 : equity - 5;
        if (node.includes('facing') && node.includes('raise')) equity -= 8;
        if (node.includes('facing') && node.includes('3bet')) equity -= 12;
        if (node.includes('facing') && node.includes('bet')) equity -= 4;
        equity = Math.max(2, Math.min(98, Math.round(equity)));
        let equityBucket = 'medium', rangeDesc = 'Villain likely has a mixed range of value and bluffs.';
        if (equity >= 75) { equityBucket = 'dominating'; rangeDesc = 'You dominate villain\'s range — strong value region.'; }
        else if (equity >= 60) { equityBucket = 'ahead'; rangeDesc = 'Ahead of most of villain\'s range but vulnerable to draws and stronger hands.'; }
        else if (equity >= 45) { equityBucket = 'coin-flip'; rangeDesc = 'Roughly even against villain\'s range — marginal spot.'; }
        else if (equity >= 30) { equityBucket = 'behind'; rangeDesc = 'Behind most of villain\'s range — need improvement or fold equity.'; }
        else { equityBucket = 'crushed'; rangeDesc = 'Very low equity vs range — only continue as a bluff.'; }
        return { equity, confidence: 'estimated', rangeDescription: rangeDesc, equityBucket };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 273: ACTION EV COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    getActionEVComparison(frequencies, correctAction, selectedAction) {
        if (!frequencies || Object.keys(frequencies || {}).length === 0) return null;
        const actions = [];
        let maxFreq = 0, bestKey = '';
        Object.entries(frequencies || {}).forEach(([key, freq]) => { if (freq > maxFreq) { maxFreq = freq; bestKey = key; } });
        const totalFreq = Object.values(frequencies || {}).reduce((s, v) => s + v, 0) || 1;
        Object.entries(frequencies || {}).forEach(([key, freq]) => {
            const evFromOptimal = maxFreq > 0 ? ((freq - maxFreq) / totalFreq) * 2 : 0;
            actions.push({ action: key, frequency: freq, ev: Math.round(evFromOptimal * 100) / 100, evDiff: Math.round((freq - maxFreq) * 2) / 100, isOptimal: key === bestKey, isSelected: key === selectedAction });
        });
        actions.sort((a, b) => b.frequency - a.frequency);
        return { actions, bestAction: bestKey, worstAction: actions[actions.length - 1]?.action || '' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 274: SOLVER LINE COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    getSolverLineComparison(selectedAction, correctAction, frequencies, street, nodeType) {
        const selected = (selectedAction || '').toLowerCase();
        const correct = (correctAction || '').toLowerCase();
        if (!selected || !correct) return null;
        const isMatch = selected === correct || (selected.includes('check') && correct.includes('check')) || (selected.includes('fold') && correct.includes('fold')) || (selected.includes('call') && correct.includes('call')) || (selected.includes('raise') && correct.includes('raise')) || (selected.includes('bet') && correct.includes('bet'));
        const correctFreq = frequencies?.[correctAction] || 0;
        const selectedFreq = frequencies?.[selectedAction] || 0;
        let solverPreference = 'mixed';
        if (correctFreq > 80) solverPreference = 'strong';
        else if (correctFreq > 60) solverPreference = 'moderate';
        else if (correctFreq > 40) solverPreference = 'slight';
        let alignment = 'aligned', summary = '';
        if (isMatch) {
            if (solverPreference === 'strong') { alignment = 'perfect'; summary = `Perfect play — solver strongly prefers this action (${correctFreq}% of the time).`; }
            else if (solverPreference === 'mixed') { alignment = 'acceptable'; summary = `Acceptable — this is part of a mixed strategy (solver plays this ${selectedFreq}%).`; }
            else { alignment = 'aligned'; summary = 'Good — you matched the solver\'s preferred action.'; }
        } else {
            const freqDiff = correctFreq - selectedFreq;
            if (freqDiff > 50) { alignment = 'major_deviation'; summary = `Major deviation — solver prefers ${correctAction} (${correctFreq}%) over your ${selectedAction} (${selectedFreq}%).`; }
            else if (freqDiff > 20) { alignment = 'moderate_deviation'; summary = `Moderate deviation — solver slightly prefers ${correctAction} but your choice isn't terrible.`; }
            else { alignment = 'minor_deviation'; summary = 'Minor deviation — both actions are close in the solver\'s strategy.'; }
        }
        return { solverLine: correctAction, userLine: selectedAction, solverFrequency: correctFreq, userFrequency: selectedFreq, alignment, solverPreference, summary };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 275: CONCEPT MASTERY TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    getConceptMasteryReport() {
        if (!this._sessionStats || this._sessionStats.total < 3) return { concepts: [], overallMastery: 0, message: 'Need more hands for mastery data.' };
        const conceptTracker = {};
        const history = this._sessionStats?.history || [];
        history.forEach(h => {
            const concepts = this._identifyHandConcepts(h);
            concepts.forEach(concept => {
                if (!conceptTracker[concept]) conceptTracker[concept] = { correct: 0, total: 0 };
                conceptTracker[concept].total++;
                if (h.correct) conceptTracker[concept].correct++;
            });
        });
        const concepts = Object.entries(conceptTracker || {}).map(([name, data]) => ({
            name, accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0, total: data.total, correct: data.correct,
            mastered: data.total >= 3 && (data.correct / data.total) >= 0.75, struggling: data.total >= 3 && (data.correct / data.total) < 0.5,
        }));
        concepts.sort((a, b) => a.accuracy - b.accuracy);
        const masteredCount = concepts.filter(c => c.mastered).length;
        return { concepts, overallMastery: concepts.length > 0 ? Math.round((masteredCount / concepts.length) * 100) : 0, masteredCount, totalConcepts: concepts.length, weakestConcept: concepts[0] || null, strongestConcept: concepts[concepts.length - 1] || null };
    }

    _identifyHandConcepts(handRecord) {
        const concepts = [];
        const street = (handRecord.street || '').toLowerCase();
        const nodeType = (handRecord.nodeType || '').toLowerCase();
        const action = (handRecord.correctAction || handRecord.action || '').toLowerCase();
        const cat = (handRecord.handCategory || '').toLowerCase();
        if (nodeType.includes('cbet') || nodeType.includes('c-bet')) concepts.push('C-Bet');
        if (nodeType.includes('3bet') || nodeType.includes('3-bet')) concepts.push('3-Bet Pots');
        if (nodeType.includes('check-raise') || nodeType.includes('xr')) concepts.push('Check-Raise');
        if (action.includes('fold') && (nodeType.includes('facing') || nodeType.includes('vs'))) concepts.push('Fold Discipline');
        if (action.includes('call') && street === 'river') concepts.push('River Calling');
        if (action.includes('bet') && street === 'river') concepts.push('River Value');
        if (action.includes('raise')) concepts.push('Aggression');
        if (cat.includes('draw') || cat.includes('flush') || cat.includes('oesd')) concepts.push('Draw Play');
        if (cat.includes('top pair') || cat.includes('overpair')) concepts.push('Strong Made Hands');
        if (cat.includes('air') || cat.includes('no pair')) concepts.push('Bluffing');
        if (street === 'preflop') concepts.push('Preflop Strategy');
        if (nodeType.includes('blind')) concepts.push('Blind Defense');
        if (nodeType.includes('multi') || nodeType.includes('3way')) concepts.push('Multiway Pots');
        return concepts.length > 0 ? concepts : ['General Strategy'];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 276: ADAPTIVE HINT SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    generateHints(frequencies, street, nodeType, handCategory, heroPosition, texture) {
        const hints = [];
        const pos = (heroPosition || '').toUpperCase();
        const cat = (handCategory || '').toLowerCase();
        if (pos === 'BTN' || pos === 'CO') hints.push('You\'re in a late position — this gives you an information advantage.');
        else if (pos === 'SB' || pos === 'BB') hints.push('Playing from the blinds means you\'ll be OOP on every street. Tighten up.');
        else hints.push('Think about your position relative to the remaining players.');
        if (cat.includes('draw')) hints.push('You have a drawing hand. Consider your outs, pot odds, and fold equity.');
        else if (cat.includes('top pair') || cat.includes('overpair')) hints.push('You have a strong made hand. Think about sizing for value while protecting against draws.');
        else if (cat.includes('air') || cat.includes('no pair')) hints.push('You have no made hand. Do you have any fold equity or blockers?');
        else hints.push('Evaluate your hand\'s strength relative to the board texture.');
        if (frequencies) {
            const entries = Object.entries(frequencies || {}).sort((a, b) => b[1] - a[1]);
            if (entries.length > 0) {
                const topFreq = entries[0][1];
                if (topFreq > 80) hints.push('The solver has a very strong preference here (>80% for one action).');
                else if (topFreq > 50) hints.push('The solver slightly favors one action, but there\'s a mix.');
                else hints.push('This is a mixed spot — multiple actions are viable.');
                const topAction = entries[0][0];
                const actionType = topAction.includes('bet') || topAction.includes('raise') ? 'aggressive' : topAction.includes('check') ? 'passive' : topAction.includes('fold') ? 'defensive' : 'standard';
                hints.push(`The solver leans toward a ${actionType} approach in this spot.`);
            }
        }
        return { hints, currentLevel: 0, maxLevel: hints.length - 1 };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 277: BOARD RUNOUT IMPACT PREVIEW
    // ═══════════════════════════════════════════════════════════════════════════

    getRunoutImpactPreview(handCategory, street, correctAction, boardTexture) {
        if (street === 'river') return null;
        const cat = (handCategory || '').toLowerCase();
        const runouts = [];
        if (street === 'flop' || street === 'turn') {
            runouts.push({ type: 'Flush Card', card: '♠♣♥♦', impact: cat.includes('flush draw') ? 'positive' : cat.includes('set') || cat.includes('two pair') ? 'negative' : 'neutral',
                strategyChange: cat.includes('flush draw') ? 'Your draw completes — shift to value betting.' : 'Board gets wetter — check more, bet less.' });
            runouts.push({ type: 'Connected Card', card: '5-9', impact: cat.includes('oesd') || cat.includes('open ended') ? 'positive' : 'negative',
                strategyChange: cat.includes('oesd') ? 'Draw completes — value bet your straight.' : 'More straights possible — tighten your range.' });
            runouts.push({ type: 'Overcard (A/K)', card: 'A♠/K♠', impact: cat.includes('overpair') ? 'neutral' : cat.includes('top pair') ? 'negative' : 'varies',
                strategyChange: cat.includes('top pair') ? 'An overcard hits — your top pair is no longer top pair. Check more.' : 'New high card changes range dynamics — re-evaluate.' });
            runouts.push({ type: 'Board Pairs', card: 'Paired', impact: cat.includes('trips') || cat.includes('set') ? 'positive' : 'neutral',
                strategyChange: 'Board pairing favors the pre-flop aggressor. Full houses now possible.' });
            runouts.push({ type: 'Brick (Low Card)', card: '2♣/3♦', impact: cat.includes('pair') ? 'positive' : 'neutral',
                strategyChange: 'Low brick changes little — ranges remain similar. Continue your plan.' });
        }
        return { runouts, street, nextStreet: street === 'flop' ? 'Turn' : 'River' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 278: FREQUENCY PRACTICE MODE DATA
    // ═══════════════════════════════════════════════════════════════════════════

    getMixedFrequencyDrillData() {
        if (!this._sessionStats || !this._sessionStats.history) return { mixedSpots: [], needsPractice: false };
        const freqTracker = {};
        (this._sessionStats.history || []).forEach(h => {
            if (!h.frequencies) return;
            const entries = Object.entries(h.frequencies || {});
            const maxFreq = Math.max(...entries.map(([_, f]) => f));
            if (maxFreq < 80 && maxFreq > 20) {
                const key = `${h.street || 'flop'}_${h.nodeType || 'general'}`;
                if (!freqTracker[key]) freqTracker[key] = { targetFreqs: {}, userActions: [], total: 0 };
                freqTracker[key].total++;
                freqTracker[key].userActions.push((h.action || h.selectedAction || '').toLowerCase());
                entries.forEach(([act, freq]) => {
                    if (!freqTracker[key].targetFreqs[act]) freqTracker[key].targetFreqs[act] = [];
                    freqTracker[key].targetFreqs[act].push(freq);
                });
            }
        });
        const mixedSpots = [];
        Object.entries(freqTracker || {}).forEach(([key, data]) => {
            if (data.total < 2) return;
            Object.entries(data.targetFreqs || {}).forEach(([action, freqs]) => {
                const avgTarget = freqs.reduce((s, v) => s + v, 0) / freqs.length;
                const userCount = data.userActions.filter(a => a.includes(action.toLowerCase())).length;
                const userFreq = (userCount / data.total) * 100;
                const deviation = Math.abs(userFreq - avgTarget);
                if (deviation > 10) mixedSpots.push({ spot: key, action, targetFreq: Math.round(avgTarget), userFreq: Math.round(userFreq), deviation: Math.round(deviation), sampleSize: data.total });
            });
        });
        mixedSpots.sort((a, b) => b.deviation - a.deviation);
        return { mixedSpots: mixedSpots.slice(0, 10), needsPractice: mixedSpots.length > 3, totalMixedSpots: Object.keys(freqTracker || {}).length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 279: HAND CATEGORY PERFORMANCE BREAKDOWN
    // ═══════════════════════════════════════════════════════════════════════════

    getHandCategoryBreakdown() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 3) return { categories: [], message: 'Need more hands for category breakdown.' };
        const categoryMap = {};
        this._sessionStats.history.forEach(h => {
            const rawCat = (h.handCategory || h.category || 'Unknown').toLowerCase();
            let normCat = 'Other';
            if (rawCat.includes('premium') || rawCat.includes('nut') || rawCat.includes('set') || rawCat.includes('full house')) normCat = 'Premium Hands';
            else if (rawCat.includes('overpair') || rawCat.includes('top pair')) normCat = 'Top Pair+';
            else if (rawCat.includes('middle pair') || rawCat.includes('second pair') || rawCat.includes('underpair')) normCat = 'Medium Pairs';
            else if (rawCat.includes('draw') || rawCat.includes('flush') || rawCat.includes('oesd') || rawCat.includes('straight draw')) normCat = 'Draws';
            else if (rawCat.includes('air') || rawCat.includes('no pair') || rawCat.includes('overcards') || rawCat.includes('high card')) normCat = 'Air/Bluffs';
            else if (rawCat.includes('pair')) normCat = 'Small Pairs';
            if (!categoryMap[normCat]) categoryMap[normCat] = { correct: 0, total: 0, evLoss: 0 };
            categoryMap[normCat].total++;
            if (h.correct) categoryMap[normCat].correct++;
            categoryMap[normCat].evLoss += (h.evLoss || 0);
        });
        const categories = Object.entries(categoryMap || {}).map(([name, data]) => ({
            name, total: data.total, correct: data.correct, accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0, evLoss: Math.round(data.evLoss * 100) / 100,
        }));
        categories.sort((a, b) => a.accuracy - b.accuracy);
        return { categories, weakestCategory: categories[0] || null, strongestCategory: categories[categories.length - 1] || null };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 280: SESSION COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    getSessionComparison(previousSessionData = null) {
        const current = {
            accuracy: this._sessionStats?.total > 0 ? Math.round((this._sessionStats.correct / this._sessionStats.total) * 100) : 0,
            total: this._sessionStats?.total || 0, correct: this._sessionStats?.correct || 0,
            streak: this._sessionBests?.streak || 0, evLoss: 0,
        };
        if (this._sessionStats?.history) { current.evLoss = Math.round(this._sessionStats.history.reduce((sum, h) => sum + (h.evLoss || 0), 0) * 100) / 100; }
        const baseline = previousSessionData || { accuracy: 60, total: 25, correct: 15, streak: 3, evLoss: 8.5, label: 'Average Player' };
        const improvements = [], regressions = [];
        if (current.accuracy > baseline.accuracy) improvements.push({ metric: 'Accuracy', current: current.accuracy + '%', baseline: baseline.accuracy + '%', delta: '+' + (current.accuracy - baseline.accuracy) + '%' });
        else if (current.accuracy < baseline.accuracy) regressions.push({ metric: 'Accuracy', current: current.accuracy + '%', baseline: baseline.accuracy + '%', delta: (current.accuracy - baseline.accuracy) + '%' });
        if (current.streak > baseline.streak) improvements.push({ metric: 'Best Streak', current: current.streak, baseline: baseline.streak, delta: '+' + (current.streak - baseline.streak) });
        if (current.total > 0 && current.evLoss / current.total < baseline.evLoss / baseline.total) improvements.push({ metric: 'EV Loss/Hand', current: (current.evLoss / current.total).toFixed(2) + ' BB', baseline: (baseline.evLoss / baseline.total).toFixed(2) + ' BB', delta: 'Better' });
        else if (current.total > 0) regressions.push({ metric: 'EV Loss/Hand', current: (current.evLoss / current.total).toFixed(2) + ' BB', baseline: (baseline.evLoss / baseline.total).toFixed(2) + ' BB', delta: 'Worse' });
        return { current, baseline, improvements, regressions };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 281: PRE-DECISION HAND PREVIEW
    // ═══════════════════════════════════════════════════════════════════════════

    getPreDecisionPreview(handCategory, street, nodeType, heroPosition, frequencies) {
        const strength = this.classifyHandStrength(handCategory, null, street);
        const equity = this.estimateEquityVsRange(handCategory, street, nodeType, heroPosition, '');
        let spotType = 'standard';
        if (frequencies) {
            const vals = Object.values(frequencies || {});
            const maxF = Math.max(...vals);
            if (maxF > 80) spotType = 'clear';
            else if (maxF < 40) spotType = 'complex_mix';
            else spotType = 'moderate_mix';
        }
        return { handStrength: strength, equity, spotType, spotTypeLabel: spotType === 'clear' ? 'Clear Decision' : spotType === 'complex_mix' ? 'Complex Mixed Spot' : 'Moderate Mix' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 282: RUNNING ACTION FREQUENCY TRACKER
    // ═══════════════════════════════════════════════════════════════════════════

    getRunningActionFrequencies() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 2) return null;
        const actionCounts = {};
        const solverCounts = {};
        let total = 0;
        this._sessionStats.history.forEach(h => {
            const userAct = this._normalizeActionCategory(h.action || h.selectedAction || '');
            const solverAct = this._normalizeActionCategory(h.correctAction || '');
            if (!userAct) return;
            total++;
            actionCounts[userAct] = (actionCounts[userAct] || 0) + 1;
            if (solverAct) solverCounts[solverAct] = (solverCounts[solverAct] || 0) + 1;
        });
        if (total < 2) return null;
        const allActions = [...new Set([...Object.keys(actionCounts || {}), ...Object.keys(solverCounts || {})])];
        const frequencies = allActions.map(action => ({
            action, userFreq: Math.round(((actionCounts[action] || 0) / total) * 100), solverFreq: Math.round(((solverCounts[action] || 0) / total) * 100),
            deviation: Math.round(((actionCounts[action] || 0) / total - (solverCounts[action] || 0) / total) * 100),
        }));
        frequencies.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
        return { frequencies, totalHands: total, biggestLeak: frequencies[0] || null };
    }

    _normalizeActionCategory(action) {
        const a = (action || '').toLowerCase();
        if (a.includes('fold')) return 'Fold';
        if (a.includes('check')) return 'Check';
        if (a.includes('call')) return 'Call';
        if (a.includes('raise') || a.includes('3-bet') || a.includes('4-bet')) return 'Raise';
        if (a.includes('bet') || a.includes('pot') || a.includes('overbet')) return 'Bet';
        if (a.includes('all-in') || a.includes('push') || a.includes('allin')) return 'All-In';
        return a ? 'Other' : '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 283: MISTAKE CLUSTERING
    // ═══════════════════════════════════════════════════════════════════════════
// @@PUB_REGION_14@@
                else mediumBets++;
            }
        });
// @@PUB_REGION_15@@
    getGTOComplianceScore() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
// @@PUB_REGION_16@@
