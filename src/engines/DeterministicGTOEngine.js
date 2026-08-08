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
// @@PUB_REGION_14@@
                else mediumBets++;
            }
        });

        // Polarization = ratio of (big bets + checks) to total actions
        // Highly polarized ranges use big bets or check, rarely medium
        const totalActions = history.length;
        const polarizationScore = totalActions > 0
            ? Math.round(((bigBets + checks) / totalActions) * 100)
            : 50;

        let style, description;
        if (polarizationScore >= 70) {
            style = 'polarized';
            description = 'Your range is highly polarized — you tend to use big bets or check. This is optimal on many board textures.';
        } else if (polarizationScore >= 50) {
            style = 'semi-polarized';
            description = 'Mix of polarized and merged strategies. Generally solid approach.';
        } else {
            style = 'merged';
            description = 'Your range is merged — lots of medium bets. Consider polarizing more on favorable textures.';
        }

        return {
            polarizationScore,
            style,
            description,
            breakdown: { bigBets, mediumBets, smallBets, checks, totalAggressive },
            tip: style === 'merged'
                ? 'On dry boards where you have range advantage, use a polarized strategy: bet big with strong hands and bluffs, check medium hands.'
                : 'Good polarization awareness. Keep adjusting your strategy based on board texture.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 305: MISTAKE RECOVERY RATE
    // ═══════════════════════════════════════════════════════════════════════════

    getMistakeRecoveryRate() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;

        // After each mistake, how many hands to get back to a correct answer?
        const recoveryTimes = [];
        let inMistakeStreak = false;
        let streakLength = 0;

        for (let i = 0; i < history.length; i++) {
            if (!history[i].correct) {
                if (!inMistakeStreak) inMistakeStreak = true;
                streakLength++;
            } else {
                if (inMistakeStreak) {
                    recoveryTimes.push(streakLength);
                    inMistakeStreak = false;
                    streakLength = 0;
                }
            }
        }
        if (inMistakeStreak) recoveryTimes.push(streakLength);

        const avgRecovery = recoveryTimes.length > 0
            ? Math.round((recoveryTimes.reduce((s, v) => s + v, 0) / recoveryTimes.length) * 10) / 10
            : 0;
        const maxRecovery = recoveryTimes.length > 0 ? Math.max(...recoveryTimes) : 0;
        const quickRecoveries = recoveryTimes.filter(r => r === 1).length;
        const prolongedTilts = recoveryTimes.filter(r => r >= 3).length;

        let grade;
        if (avgRecovery <= 1.2) grade = 'A';
        else if (avgRecovery <= 1.8) grade = 'B';
        else if (avgRecovery <= 2.5) grade = 'C';
        else grade = 'D';

        return {
            avgRecoveryTime: avgRecovery,
            maxMistakeStreak: maxRecovery,
            totalMistakeStreaks: recoveryTimes.length,
            quickRecoveries,
            prolongedTilts,
            grade,
            insight: grade === 'A' ? 'Excellent mental recovery — you bounce back quickly after mistakes.'
                : grade === 'B' ? 'Good recovery — occasional short mistake streaks but you reset well.'
                : grade === 'C' ? 'Average recovery — mistakes sometimes cascade. Practice resetting between hands.'
                : 'Tilt-prone — mistakes cluster together. Work on mental game fundamentals.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 306: CONCEPT QUIZ GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    getConceptQuiz() {
        const quizzes = [
            {
                concept: 'Minimum Defense Frequency',
                question: 'Villain bets 2/3 pot. What % of your range should you continue with?',
                answer: '60%',
                explanation: 'MDF = 1 - (bet / (pot + bet)) = 1 - (0.67 / 1.67) = ~60%. You must defend at least 60% to prevent villain from profiting with any two cards.',
            },
            {
                concept: 'Pot Odds',
                question: 'You face a pot-sized bet. What odds are you getting to call?',
                answer: '2:1 (33%)',
                explanation: 'Pot is X, villain bets X. You call X to win 2X+X = 3X. You need X/3X = 33% equity to call profitably.',
            },
            {
                concept: 'Position',
                question: 'Which position has the highest win-rate in 6-max?',
                answer: 'Button (BTN)',
                explanation: 'The Button acts last on every postflop street, giving maximum information advantage. Solvers open widest from BTN (~42%).',
            },
            {
                concept: 'SPR',
                question: 'With 15bb effective stacks and a 6bb pot, what is the SPR?',
                answer: '2.5',
                explanation: 'SPR = Effective Stack / Pot = 15 / 6 = 2.5. Low SPR (<4) means you should be more willing to commit with top pair.',
            },
            {
                concept: 'Blockers',
                question: 'You hold A♠ on a board with 3 spades. Why is this a good bluff blocker?',
                answer: 'You block the nut flush',
                explanation: 'Holding A♠ means villain cannot have the nut flush (A-high flush). This increases the chance they fold to aggression since more of their range is weaker.',
            },
            {
                concept: 'Range Polarization',
                question: 'What does it mean when a range is "polarized"?',
                answer: 'It contains strong value hands and bluffs, but few medium hands',
                explanation: 'A polarized range bets big because it either has the nuts or nothing. Medium hands prefer to check since they have showdown value.',
            },
            {
                concept: 'Equity Denial',
                question: 'Why do you bet with medium-strength hands on wet boards?',
                answer: 'To deny free cards that could improve villain',
                explanation: 'On wet, connected boards, free cards are dangerous. Betting denies villain the free equity they would gain from seeing another card.',
            },
            {
                concept: 'ICM',
                question: 'In a tournament, why is a chip won worth less than a chip lost?',
                answer: 'Due to ICM — your tournament equity diminishes as your stack grows',
                explanation: 'The Independent Chip Model shows that doubling your stack does not double your tournament equity because of the prize structure.',
            },
        ];

        // Pick based on session history for relevance
        const idx = this._sessionStats?.total
            ? (this._sessionStats.total * 7 + 13) % quizzes.length
            : Math.floor(Math.random() * quizzes.length);

        return quizzes[idx];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 307: SESSION MILESTONES
    // ═══════════════════════════════════════════════════════════════════════════

    getSessionMilestones() {
        if (!this._sessionStats) return [];
        const stats = this._sessionStats;
        const milestones = [];

        if (stats.total >= 5) milestones.push({ id: 'warmup', label: 'Warm Up', description: '5 hands completed', achieved: true, icon: '▲'});
        if (stats.total >= 10) milestones.push({ id: 'focused', label: 'Focused', description: '10 hands completed', achieved: true, icon: ''});
        if (stats.total >= 25) milestones.push({ id: 'grinder', label: 'Grinder', description: '25 hands completed', achieved: true, icon: ''});
        if (stats.total >= 50) milestones.push({ id: 'marathon', label: 'Marathon', description: '50 hands completed', achieved: true, icon: ''});

        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        if (accuracy >= 90 && stats.total >= 10) milestones.push({ id: 'precision', label: 'Precision', description: '90%+ accuracy (10+ hands)', achieved: true, icon: ''});
        if (accuracy >= 80 && stats.total >= 20) milestones.push({ id: 'consistent', label: 'Consistent', description: '80%+ accuracy (20+ hands)', achieved: true, icon: '★'});

        // Streak-based
        const streak = stats.currentStreak || 0;
        if (streak >= 5) milestones.push({ id: 'hot_streak', label: 'Hot Streak', description: '5+ correct in a row', achieved: true, icon: '▲'});
        if (streak >= 10) milestones.push({ id: 'unstoppable', label: 'Unstoppable', description: '10+ correct in a row', achieved: true, icon: ''});

        // Recovery milestone
        try {
            const recovery = this.getMistakeRecoveryRate();
            if (recovery && recovery.grade === 'A' && stats.total >= 10) {
                milestones.push({ id: 'resilient', label: 'Resilient', description: 'Grade A mistake recovery', achieved: true, icon: ''});
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        return milestones;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 308: ADAPTIVE DRILL RECOMMENDATION
    // ═══════════════════════════════════════════════════════════════════════════

    getAdaptiveDrillRecommendation() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const recommendations = [];

        // Check street weakness
        const streetAcc = {};
        history.forEach(h => {
            const st = (h.street || 'flop').toLowerCase();
            if (!streetAcc[st]) streetAcc[st] = { c: 0, t: 0 };
            streetAcc[st].t++;
            if (h.correct) streetAcc[st].c++;
        });
        const weakStreet = Object.entries(streetAcc || {}).filter(([_, d]) => d.t >= 3).sort((a, b) => (a[1].c / a[1].t) - (b[1].c / b[1].t))[0];
        if (weakStreet && (weakStreet[1].c / weakStreet[1].t) < 0.5) {
            recommendations.push({
                drill: `${weakStreet[0].charAt(0).toUpperCase() + weakStreet[0].slice(1)} Mastery`,
                reason: `${Math.round((weakStreet[1].c / weakStreet[1].t) * 100)}% accuracy on the ${weakStreet[0]}`,
                type: 'street_focus',
                priority: 'high',
            });
        }

        // Check position weakness
        const posAcc = {};
        history.forEach(h => {
            const pos = (h.heroPosition || h.position || 'MP').toUpperCase();
            if (!posAcc[pos]) posAcc[pos] = { c: 0, t: 0 };
            posAcc[pos].t++;
            if (h.correct) posAcc[pos].c++;
        });
        const weakPos = Object.entries(posAcc || {}).filter(([_, d]) => d.t >= 3).sort((a, b) => (a[1].c / a[1].t) - (b[1].c / b[1].t))[0];
        if (weakPos && (weakPos[1].c / weakPos[1].t) < 0.5) {
            recommendations.push({
                drill: `${weakPos[0]} Position Drill`,
                reason: `${Math.round((weakPos[1].c / weakPos[1].t) * 100)}% accuracy from ${weakPos[0]}`,
                type: 'position_focus',
                priority: 'high',
            });
        }

        // Check exploitative tendencies
        try {
            const ea = this.getExploitativeAdjustments();
            if (ea && ea.adjustments.length > 0) {
                const topAdj = ea.adjustments[0];
                recommendations.push({
                    drill: `Balance Training: ${topAdj.title}`,
                    reason: topAdj.description,
                    type: 'balance',
                    priority: topAdj.severity === 'critical' ? 'high' : 'medium',
                });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Check defense frequency
        try {
            const df = this.getDefenseFrequencyCheck();
            if (df && !df.isBalanced) {
                const issue = df.assessments.find(a => a.severity !== 'good');
                if (issue) {
                    recommendations.push({
                        drill: 'Defense Frequency Drill',
                        reason: issue.message,
                        type: 'defense',
                        priority: issue.severity === 'critical' ? 'high' : 'medium',
                    });
                }
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        recommendations.sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1));

        return {
            recommendations: recommendations.slice(0, 5),
            topRecommendation: recommendations[0] || null,
            totalWeaknesses: recommendations.length,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 309: CRITICAL HAND HIGHLIGHTS
    // ═══════════════════════════════════════════════════════════════════════════

    getCriticalHandHighlights() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Find the most impactful hands (highest EV loss + most important correct decisions)
        const sorted = [...history].map((h, i) => ({ ...h, index: i + 1 }));

        // Biggest mistakes
        const biggestMistakes = sorted
            .filter(h => !h.correct && (h.evLoss || 0) > 0)
            .sort((a, b) => (b.evLoss || 0) - (a.evLoss || 0))
            .slice(0, 3)
            .map(h => ({
                handNumber: h.index,
                type: 'mistake',
                evLoss: Math.round((h.evLoss || 0) * 100) / 100,
                street: h.street || 'unknown',
                position: h.heroPosition || h.position || 'unknown',
                userAction: h.selectedAction || 'unknown',
                correctAction: h.correctAction || 'unknown',
                description: `Hand #${h.index}: ${h.selectedAction || 'unknown'} instead of ${h.correctAction || 'unknown'} on the ${h.street || 'unknown'} (${Math.round((h.evLoss || 0) * 100) / 100} EV loss)`,
            }));

        // Best decisions (correct on hard spots)
        const bestDecisions = sorted
            .filter(h => h.correct)
            .sort((a, b) => {
                // Prioritize correct answers on mixed frequency spots
                const aScore = a.correctFreq ? (100 - a.correctFreq) : 0;
                const bScore = b.correctFreq ? (100 - b.correctFreq) : 0;
                return bScore - aScore;
            })
            .slice(0, 2)
            .map(h => ({
                handNumber: h.index,
                type: 'great_play',
                street: h.street || 'unknown',
                position: h.heroPosition || h.position || 'unknown',
                action: h.selectedAction || 'unknown',
                description: `Hand #${h.index}: Correct ${h.selectedAction || 'unknown'} on the ${h.street || 'unknown'} — well played!`,
            }));

        return {
            biggestMistakes,
            bestDecisions,
            totalHighlights: biggestMistakes.length + bestDecisions.length,
            summaryEVLost: Math.round(biggestMistakes.reduce((sum, m) => sum + (m.evLoss || 0), 0) * 100) / 100,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 310: COMPREHENSIVE SESSION REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    getComprehensiveSessionReport() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const stats = this._sessionStats;
        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

        // Aggregate all sub-analyses
        const report = {
            overview: {
                totalHands: stats.total,
                correct: stats.correct,
                accuracy,
                totalEVLoss: Math.round((stats.evLoss || 0) * 100) / 100,
                avgEVLoss: stats.total > 0 ? Math.round((stats.evLoss || 0) / stats.total * 100) / 100 : 0,
            },
            grade: accuracy >= 85 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 55 ? 'C' : accuracy >= 40 ? 'D' : 'F',
            sections: [],
        };

        // Streak analysis
        try {
            const sa = this.getStreakAnalysis();
            if (sa) report.sections.push({ title: 'Mental Game', data: { tiltResistance: sa.tiltResistance, longestWinStreak: sa.longestWinStreak, insight: sa.insight } });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Performance trend
        try {
            const pt = this.getPerformanceTrendAnalysis();
            if (pt) report.sections.push({ title: 'Trend', data: { trend: pt.trend, consistency: pt.consistencyScore, insight: pt.insight } });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Exploitable tendencies
        try {
            const ea = this.getExploitativeAdjustments();
            if (ea) report.sections.push({ title: 'Balance', data: { profile: ea.actionProfile, adjustments: ea.adjustments.length, summary: ea.summary } });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Critical hands
        try {
            const ch = this.getCriticalHandHighlights();
            if (ch) report.sections.push({ title: 'Key Hands', data: { mistakes: ch.biggestMistakes.length, greatPlays: ch.bestDecisions.length, evLost: ch.summaryEVLost } });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Drill recommendation
        try {
            const dr = this.getAdaptiveDrillRecommendation();
            if (dr && dr.topRecommendation) report.sections.push({ title: 'Next Focus', data: { drill: dr.topRecommendation.drill, reason: dr.topRecommendation.reason } });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Milestones
        try {
            const ms = this.getSessionMilestones();
            if (ms.length > 0) report.milestones = ms;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Coaching summary
        try {
            const cs = this.generateCoachingSummary();
            if (cs) report.coachingSummary = cs.summary;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        return report;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 311: NODE TYPE BREAKDOWN
    // ═══════════════════════════════════════════════════════════════════════════

    getNodeTypeBreakdown() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const nodeMap = {};

        history.forEach(h => {
            const node = (h.nodeType || 'SRP').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            if (!nodeMap[node]) nodeMap[node] = { correct: 0, total: 0, evLoss: 0 };
            nodeMap[node].total++;
            if (h.correct) nodeMap[node].correct++;
            nodeMap[node].evLoss += (h.evLoss || 0);
        });

        const breakdown = Object.entries(nodeMap || {}).map(([node, data]) => ({
            nodeType: node,
            total: data.total,
            correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            avgEVLoss: data.total > 0 ? Math.round((data.evLoss / data.total) * 100) / 100 : 0,
        })).sort((a, b) => b.total - a.total);

        const weakest = breakdown.filter(n => n.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0] || null;

        return { breakdown, weakestNodeType: weakest, totalNodeTypes: breakdown.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 312: ACTION TIMELINE
    // ═══════════════════════════════════════════════════════════════════════════

    getActionTimeline() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 3) return null;
        const history = this._sessionStats.history;

        return history.map((h, i) => ({
            hand: i + 1,
            correct: h.correct,
            action: h.selectedAction || 'unknown',
            correctAction: h.correctAction || 'unknown',
            street: h.street || 'unknown',
            position: h.heroPosition || h.position || 'unknown',
            evLoss: Math.round((h.evLoss || 0) * 100) / 100,
            classification: h.classification || null,
        }));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 313: STREET-SPECIFIC LEAKS
    // ═══════════════════════════════════════════════════════════════════════════

    getStreetSpecificLeaks() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;
        const leaks = {};

        history.forEach(h => {
            if (h.correct) return;
            const street = (h.street || 'flop').toLowerCase();
            const userAction = this._normalizeActionCategory(h.selectedAction || '');
            const correctAction = this._normalizeActionCategory(h.correctAction || '');
            const key = `${street}_${userAction}_should_${correctAction}`;

            if (!leaks[key]) leaks[key] = { street, userAction, correctAction, count: 0, totalEVLoss: 0 };
            leaks[key].count++;
            leaks[key].totalEVLoss += (h.evLoss || 0);
        });

        const sorted = Object.values(leaks || {})
            .sort((a, b) => b.totalEVLoss - a.totalEVLoss)
            .slice(0, 10)
            .map(l => ({
                ...l,
                totalEVLoss: Math.round(l.totalEVLoss * 100) / 100,
                description: `${l.street.charAt(0).toUpperCase() + l.street.slice(1)}: ${l.userAction} instead of ${l.correctAction} (${l.count}x, -${Math.round(l.totalEVLoss * 100) / 100} EV)`,
            }));

        return { leaks: sorted, totalLeaks: sorted.length, biggestLeak: sorted[0] || null };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 314: OVERBET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getOverbetAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let overbetSpots = 0, overbetCorrect = 0, shouldOverbet = 0, missedOverbets = 0;

        history.forEach(h => {
            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const isUserOverbet = userAction.includes('overbet') || userAction.includes('150%') || userAction.includes('200%');
            const isCorrectOverbet = correctAction.includes('overbet') || correctAction.includes('150%') || correctAction.includes('200%');

            if (isUserOverbet) { overbetSpots++; if (h.correct) overbetCorrect++; }
            if (isCorrectOverbet) { shouldOverbet++; if (!isUserOverbet) missedOverbets++; }
        });

        return {
            overbetSpots,
            overbetCorrect,
            overbetAccuracy: overbetSpots > 0 ? Math.round((overbetCorrect / overbetSpots) * 100) : null,
            shouldOverbet,
            missedOverbets,
            tip: missedOverbets > 0
                ? `You missed ${missedOverbets} overbet spot${missedOverbets > 1 ? 's' : ''}. Overbets are optimal when your range is highly polarized and villain is range-capped.`
                : overbetSpots === 0
                    ? 'No overbet spots this session. Overbets are powerful on dry boards where villain checks back capped ranges.'
                    : `You used overbets ${overbetSpots} time${overbetSpots > 1 ? 's' : ''} with ${overbetSpots > 0 ? Math.round((overbetCorrect / overbetSpots) * 100) : 0}% accuracy.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 315: CHECK-RAISE ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getCheckRaiseAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let crSpots = 0, crCorrect = 0, shouldCR = 0, missedCR = 0;

        history.forEach(h => {
            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const isUserCR = userAction.includes('check') && userAction.includes('raise');
            const isCorrectCR = correctAction.includes('check') && correctAction.includes('raise');

            // Also catch "raise" when facing a bet (which is effectively a check-raise in OOP spots)
            const node = (h.nodeType || '').toLowerCase();
            const isCRSpot = node.includes('check_raise') || node.includes('facing_cbet');

            if (isUserCR || (isCRSpot && userAction.includes('raise'))) { crSpots++; if (h.correct) crCorrect++; }
            if (isCorrectCR || (isCRSpot && correctAction.includes('raise'))) { shouldCR++; if (!isUserCR && !userAction.includes('raise')) missedCR++; }
        });

        return {
            checkRaiseSpots: crSpots,
            checkRaiseCorrect: crCorrect,
            accuracy: crSpots > 0 ? Math.round((crCorrect / crSpots) * 100) : null,
            shouldCheckRaise: shouldCR,
            missedCheckRaises: missedCR,
            tip: missedCR > 1
                ? `You missed ${missedCR} check-raise opportunities. Check-raising is crucial for protecting your checking range and building pots with strong hands OOP.`
                : crSpots === 0
                    ? 'No check-raise spots this session. Watch for check-raise opportunities when you have strong hands or draws in the blinds.'
                    : `Check-raise accuracy: ${crSpots > 0 ? Math.round((crCorrect / crSpots) * 100) : 0}%. Keep up the aggression from OOP.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 316: C-BET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getCBetAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let cbetSpots = 0, cbetCorrect = 0, shouldCbet = 0, shouldCheck = 0, cbetWhenShouldCheck = 0, checkWhenShouldCbet = 0;

        history.forEach(h => {
            const node = (h.nodeType || '').toLowerCase();
            const street = (h.street || '').toLowerCase();
            if (!node.includes('cbet') && !node.includes('continuation') && street !== 'flop') return;

            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const userBets = userAction.includes('bet');
            const correctBets = correctAction.includes('bet');

            if (correctBets) { shouldCbet++; if (!userBets) checkWhenShouldCbet++; }
            else { shouldCheck++; if (userBets) cbetWhenShouldCheck++; }

            if (userBets) { cbetSpots++; if (h.correct) cbetCorrect++; }
        });

        return {
            cbetSpots,
            cbetCorrect,
            accuracy: cbetSpots > 0 ? Math.round((cbetCorrect / cbetSpots) * 100) : null,
            shouldCbet,
            shouldCheck,
            cbetWhenShouldCheck,
            checkWhenShouldCbet,
            tip: cbetWhenShouldCheck > 2
                ? `You c-bet too often — ${cbetWhenShouldCheck} times when the solver prefers checking. Not every flop deserves a c-bet.`
                : checkWhenShouldCbet > 2
                    ? `You miss c-bet opportunities — the solver wants you to bet on ${checkWhenShouldCbet} more flops.`
                    : 'Your c-bet frequency looks reasonable for this session.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 317: POSITION PAIR ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getPositionPairAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;
        const pairs = {};

        history.forEach(h => {
            const hero = (h.heroPosition || h.position || 'MP').toUpperCase();
            const villain = (h.villainPosition || 'BB').toUpperCase();
            const key = `${hero} vs ${villain}`;
            if (!pairs[key]) pairs[key] = { correct: 0, total: 0, evLoss: 0 };
            pairs[key].total++;
            if (h.correct) pairs[key].correct++;
            pairs[key].evLoss += (h.evLoss || 0);
        });

        const analysis = Object.entries(pairs || {}).map(([pair, data]) => ({
            matchup: pair,
            total: data.total,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            avgEVLoss: data.total > 0 ? Math.round((data.evLoss / data.total) * 100) / 100 : 0,
        })).sort((a, b) => b.total - a.total);

        const weakest = analysis.filter(a => a.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0] || null;

        return { pairs: analysis, weakestMatchup: weakest, totalMatchups: analysis.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 318: FREQUENCY CONVERGENCE TRACKER
    // ═══════════════════════════════════════════════════════════════════════════

    getFrequencyConvergenceTracker() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 10) return null;
        const history = this._sessionStats.history;
        const halfPoint = Math.floor(history.length / 2);
        const firstHalf = history.slice(0, halfPoint);
        const secondHalf = history.slice(halfPoint);

        const calcDeviation = (hands) => {
            let totalDev = 0, count = 0;
            hands.forEach(h => {
                if (h.correctFreq && h.selectedFreq !== undefined) {
                    totalDev += Math.abs((h.selectedFreq || 0) - (h.correctFreq || 0));
                    count++;
                }
            });
            return count > 0 ? Math.round(totalDev / count) : null;
        };

        const earlyDeviation = calcDeviation(firstHalf);
        const lateDeviation = calcDeviation(secondHalf);

        // Also track overall action accuracy convergence
        const earlyAcc = firstHalf.length > 0 ? Math.round((firstHalf.filter(h => h.correct).length / firstHalf.length) * 100) : 0;
        const lateAcc = secondHalf.length > 0 ? Math.round((secondHalf.filter(h => h.correct).length / secondHalf.length) * 100) : 0;

        const isConverging = lateAcc > earlyAcc || (lateDeviation !== null && earlyDeviation !== null && lateDeviation < earlyDeviation);

        return {
            earlyAccuracy: earlyAcc,
            lateAccuracy: lateAcc,
            earlyDeviation,
            lateDeviation,
            isConverging,
            improvement: lateAcc - earlyAcc,
            insight: isConverging
                ? `Great progress! Your accuracy improved from ${earlyAcc}% to ${lateAcc}% over the session.`
                : earlyAcc === lateAcc
                    ? 'Consistent play throughout. Try to push past your comfort zone to improve.'
                    : `Accuracy dipped from ${earlyAcc}% to ${lateAcc}%. Possible fatigue — consider shorter sessions.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 319: SMART SESSION LENGTH RECOMMENDATION
    // ═══════════════════════════════════════════════════════════════════════════

    getSmartSessionLength() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 10) return null;
        const history = this._sessionStats.history;

        // Find the point where accuracy starts consistently dropping
        const windowSize = 5;
        let peakWindow = 0;
        let peakAcc = 0;

        for (let i = 0; i <= history.length - windowSize; i++) {
            const window = history.slice(i, i + windowSize);
            const acc = window.filter(h => h.correct).length / window.length;
            if (acc >= peakAcc) { peakAcc = acc; peakWindow = i; }
        }

        // Find where accuracy drops below 60% of peak
        let dropOffPoint = history.length;
        const threshold = peakAcc * 0.8;
        for (let i = peakWindow + windowSize; i <= history.length - windowSize; i++) {
            const window = history.slice(i, i + windowSize);
            const acc = window.filter(h => h.correct).length / window.length;
            if (acc < threshold) { dropOffPoint = i; break; }
        }

        const optimalLength = Math.min(dropOffPoint + windowSize, history.length);
        const currentLength = history.length;

        return {
            optimalLength,
            currentLength,
            peakAccuracy: Math.round(peakAcc * 100),
            peakAt: peakWindow + 1,
            shouldContinue: currentLength < optimalLength * 0.9,
            recommendation: currentLength >= optimalLength
                ? `Consider stopping — your optimal session length is ~${optimalLength} hands based on when accuracy peaks.`
                : currentLength >= optimalLength * 0.8
                    ? `You're nearing your optimal session length (~${optimalLength} hands). Stay sharp for the last few.`
                    : `You're in the zone. Optimal session length estimate: ~${optimalLength} hands.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 320: TRAINING PLAN GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    getTrainingPlan() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;

        const plan = { sessions: [], focus: [], estimatedImprovement: 0 };

        // Gather weaknesses from various analyzers
        const weaknesses = [];

        try {
            const posLB = this.getPositionLeaderboard();
            if (posLB?.worstPosition && posLB.worstPosition.accuracy < 60) {
                weaknesses.push({ area: 'position', detail: `${posLB.worstPosition.position} at ${posLB.worstPosition.accuracy}%`, priority: 1 });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        try {
            const sta = this.getStreetTransitionAnalysis();
            if (sta?.weakestStreet && sta.weakestStreet.accuracy < 55) {
                weaknesses.push({ area: 'street', detail: `${sta.weakestStreet.street} at ${sta.weakestStreet.accuracy}%`, priority: 1 });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        try {
            const ea = this.getExploitativeAdjustments();
            if (ea?.adjustments?.length > 0) {
                ea.adjustments.slice(0, 2).forEach(adj => {
                    weaknesses.push({ area: 'balance', detail: adj.title, priority: adj.severity === 'critical' ? 1 : 2 });
                });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        try {
            const df = this.getDefenseFrequencyCheck();
            if (df && !df.isBalanced) {
                weaknesses.push({ area: 'defense', detail: 'Defense frequency imbalance', priority: 2 });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        try {
            const mr = this.getMistakeRecoveryRate();
            if (mr && (mr.grade === 'C' || mr.grade === 'D')) {
                weaknesses.push({ area: 'mental', detail: `Mistake recovery grade: ${mr.grade}`, priority: 2 });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Generate 5-session plan
        weaknesses.sort((a, b) => a.priority - b.priority);
        const sessionLabels = ['Session 1: Foundation', 'Session 2: Deep Dive', 'Session 3: Practice', 'Session 4: Integration', 'Session 5: Assessment'];

        for (let i = 0; i < 5; i++) {
            const weakness = weaknesses[i % Math.max(1, weaknesses.length)];
            plan.sessions.push({
                label: sessionLabels[i],
                focus: weakness ? weakness.detail : 'General practice',
                hands: i < 2 ? 15 : i < 4 ? 20 : 25,
                goal: i < 2 ? 'Identify patterns' : i < 4 ? 'Apply corrections' : 'Maintain accuracy',
            });
        }

        plan.focus = weaknesses.slice(0, 3).map(w => w.detail);
        plan.estimatedImprovement = Math.min(15, weaknesses.length * 3);

        return plan;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 321: HAND STRENGTH DISTRIBUTION
    // ═══════════════════════════════════════════════════════════════════════════

    getHandStrengthDistribution() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const buckets = { premium: 0, strong: 0, medium: 0, weak: 0, trash: 0 };

        history.forEach(h => {
            const cat = (h.handCategory || '').toLowerCase();
            if (cat.includes('premium') || cat.includes('aa') || cat.includes('kk') || cat.includes('qq') || cat.includes('aks')) buckets.premium++;
            else if (cat.includes('strong') || cat.includes('top pair') || cat.includes('overpair') || cat.includes('two pair') || cat.includes('set')) buckets.strong++;
            else if (cat.includes('medium') || cat.includes('middle pair') || cat.includes('draw') || cat.includes('second')) buckets.medium++;
            else if (cat.includes('weak') || cat.includes('bottom') || cat.includes('gutshot') || cat.includes('backdoor')) buckets.weak++;
            else buckets.trash++;
        });

        const total = history.length;
        return {
            distribution: Object.entries(buckets || {}).map(([strength, count]) => ({
                strength: strength.charAt(0).toUpperCase() + strength.slice(1),
                count,
                percentage: Math.round((count / total) * 100),
            })).filter(d => d.count > 0),
            totalHands: total,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 322: AGGRESSION PROFILE (VPIP/PFR/3BET-like)
    // ═══════════════════════════════════════════════════════════════════════════

    getAggressionProfile() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let voluntaryActions = 0, aggressiveActions = 0, passiveActions = 0, folds = 0;

        history.forEach(h => {
            const action = (h.selectedAction || '').toLowerCase();
            if (action.includes('fold')) { folds++; return; }
            voluntaryActions++;
            if (action.includes('bet') || action.includes('raise') || action.includes('all')) aggressiveActions++;
            else passiveActions++;
        });

        const total = history.length;
        const vpip = Math.round((voluntaryActions / total) * 100);
        const aggPct = voluntaryActions > 0 ? Math.round((aggressiveActions / voluntaryActions) * 100) : 0;
        const afr = passiveActions > 0 ? Math.round((aggressiveActions / passiveActions) * 10) / 10 : aggressiveActions;

        let profile;
        if (vpip >= 70 && aggPct >= 60) profile = 'LAG (Loose-Aggressive)';
        else if (vpip >= 70) profile = 'LP (Loose-Passive)';
        else if (aggPct >= 60) profile = 'TAG (Tight-Aggressive)';
        else profile = 'TP (Tight-Passive)';

        return {
            vpip,
            aggressionPct: aggPct,
            aggressionFactor: afr,
            foldPct: Math.round((folds / total) * 100),
            profile,
            totalHands: total,
            tip: profile === 'TAG' ? 'Tight-aggressive is the foundation of winning poker. Keep it up!'
                : profile === 'LAG' ? 'Loose-aggressive can be profitable but requires deep understanding. Make sure your bluffs have blockers.'
                : profile === 'LP' ? 'Loose-passive is the weakest style. Add more aggression — bet and raise more with draws and strong hands.'
                : 'Tight-passive plays too few hands and too passively. Open wider in position and bet for value more.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 323: WIN RATE BY HAND CATEGORY
    // ═══════════════════════════════════════════════════════════════════════════

    getWinRateByHandCategory() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const categories = {};

        history.forEach(h => {
            const cat = h.handCategory || 'Unknown';
            if (!categories[cat]) categories[cat] = { correct: 0, total: 0 };
            categories[cat].total++;
            if (h.correct) categories[cat].correct++;
        });

        const results = Object.entries(categories || {}).map(([cat, data]) => ({
            category: cat,
            total: data.total,
            correct: data.correct,
            winRate: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        })).sort((a, b) => b.total - a.total);

        const weakest = results.filter(r => r.total >= 2).sort((a, b) => a.winRate - b.winRate)[0] || null;

        return { categories: results, weakestCategory: weakest, totalCategories: results.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 324: TIGHT/LOOSE PROFILE VS SOLVER
    // ═══════════════════════════════════════════════════════════════════════════

    getTightLooseProfile() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let userFolds = 0, solverFolds = 0, userContinues = 0, solverContinues = 0;

        history.forEach(h => {
            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();

            if (userAction.includes('fold')) userFolds++;
            else userContinues++;

            if (correctAction.includes('fold')) solverFolds++;
            else solverContinues++;
        });

        const total = history.length;
        const userFoldPct = Math.round((userFolds / total) * 100);
        const solverFoldPct = Math.round((solverFolds / total) * 100);
        const diff = userFoldPct - solverFoldPct;

        let assessment;
        if (diff > 10) assessment = 'too_tight';
        else if (diff > 5) assessment = 'slightly_tight';
        else if (diff < -10) assessment = 'too_loose';
        else if (diff < -5) assessment = 'slightly_loose';
        else assessment = 'balanced';

        return {
            userFoldPct,
            solverFoldPct,
            difference: diff,
            assessment,
            description: assessment === 'balanced' ? 'Your fold frequency matches the solver well.'
                : assessment.includes('tight') ? `You fold ${Math.abs(diff)}% more than the solver. You might be leaving value on the table.`
                : `You fold ${Math.abs(diff)}% less than the solver. You might be calling too wide in some spots.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 325: BLUFF SPOT ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getBluffSpotAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let bluffAttempts = 0, correctBluffs = 0, shouldBluff = 0, missedBluffs = 0;

        history.forEach(h => {
            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const handCat = (h.handCategory || '').toLowerCase();

            // Detect bluffs: aggressive action with weak hand
            const isWeakHand = handCat.includes('weak') || handCat.includes('air') || handCat.includes('trash') || handCat.includes('nothing') || handCat.includes('backdoor');
            const userBets = userAction.includes('bet') || userAction.includes('raise') || userAction.includes('all');
            const solverBets = correctAction.includes('bet') || correctAction.includes('raise') || correctAction.includes('all');

            if (isWeakHand && userBets) { bluffAttempts++; if (h.correct) correctBluffs++; }
            if (isWeakHand && solverBets) { shouldBluff++; if (!userBets) missedBluffs++; }
        });

        return {
            bluffAttempts,
            correctBluffs,
            bluffAccuracy: bluffAttempts > 0 ? Math.round((correctBluffs / bluffAttempts) * 100) : null,
            shouldBluff,
            missedBluffs,
            tip: missedBluffs > 2
                ? `You missed ${missedBluffs} bluff opportunities. Look for spots with good blockers and fold equity.`
                : bluffAttempts > shouldBluff + 2
                    ? 'You bluff more than the solver recommends. Be selective — choose spots with good blockers.'
                    : 'Your bluffing frequency looks reasonable.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 326: VALUE BET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getValueBetAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let valueBets = 0, correctValue = 0, shouldValueBet = 0, missedValue = 0;

        history.forEach(h => {
            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const handCat = (h.handCategory || '').toLowerCase();

            const isStrongHand = handCat.includes('strong') || handCat.includes('top pair') || handCat.includes('overpair') || handCat.includes('set') || handCat.includes('two pair') || handCat.includes('premium');
            const userBets = userAction.includes('bet') || userAction.includes('raise');
            const solverBets = correctAction.includes('bet') || correctAction.includes('raise');

            if (isStrongHand && userBets) { valueBets++; if (h.correct) correctValue++; }
            if (isStrongHand && solverBets) { shouldValueBet++; if (!userBets) missedValue++; }
        });

        return {
            valueBets,
            correctValue,
            accuracy: valueBets > 0 ? Math.round((correctValue / valueBets) * 100) : null,
            shouldValueBet,
            missedValue,
            tip: missedValue > 2
                ? `You missed ${missedValue} value bet opportunities. Don't be afraid to bet for thin value with strong hands.`
                : valueBets > 0 && (correctValue / valueBets) < 0.6
                    ? 'Some of your value bets might be too thin. Ensure villain calls with worse.'
                    : 'Your value betting looks solid.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 327: SESSION SUMMARY CARD (shareable)
    // ═══════════════════════════════════════════════════════════════════════════

    getSessionSummaryCard() {
        if (!this._sessionStats || this._sessionStats.total < 3) return null;
        const stats = this._sessionStats;
        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        const grade = accuracy >= 90 ? 'S' : accuracy >= 80 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 55 ? 'C' : accuracy >= 40 ? 'D' : 'F';

        return {
            grade,
            accuracy,
            totalHands: stats.total,
            correct: stats.correct,
            evLoss: Math.round((stats.evLoss || 0) * 100) / 100,
            currentStreak: stats.currentStreak || 0,
            bestStreak: stats.bestStreak || 0,
            timestamp: new Date().toISOString(),
            shareText: `GTO Trainer: ${grade} grade | ${accuracy}% accuracy | ${stats.total} hands | ${Math.round((stats.evLoss || 0) * 100) / 100} EV loss`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 328: DIFFICULTY PROGRESSION
    // ═══════════════════════════════════════════════════════════════════════════

    getDifficultyProgression() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Track spot difficulty over time
        const progression = history.map((h, i) => ({
            hand: i + 1,
            difficulty: h.spotDifficulty || h.difficulty || 'standard',
            correct: h.correct,
        }));

        const diffCounts = { easy: 0, standard: 0, hard: 0, expert: 0 };
        const diffCorrect = { easy: 0, standard: 0, hard: 0, expert: 0 };

        progression.forEach(p => {
            const d = (p.difficulty || 'standard').toLowerCase();
            const key = d.includes('easy') ? 'easy' : d.includes('hard') || d.includes('difficult') ? 'hard' : d.includes('expert') ? 'expert' : 'standard';
            diffCounts[key]++;
            if (p.correct) diffCorrect[key]++;
        });

        const summary = Object.entries(diffCounts || {}).filter(([_, c]) => c > 0).map(([diff, count]) => ({
            difficulty: diff.charAt(0).toUpperCase() + diff.slice(1),
            count,
            accuracy: count > 0 ? Math.round((diffCorrect[diff] / count) * 100) : 0,
        }));

        return { progression, summary, totalHands: history.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 329: WEAKNESS HEATMAP (position × street)
    // ═══════════════════════════════════════════════════════════════════════════

    getWeaknessHeatmap() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;
        const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
        const streets = ['Preflop', 'Flop', 'Turn', 'River'];
        const cells = {};

        history.forEach(h => {
            const pos = (h.heroPosition || h.position || 'MP').toUpperCase();
            const street = (h.street || 'flop').charAt(0).toUpperCase() + (h.street || 'flop').slice(1);
            const key = `${pos}_${street}`;
            if (!cells[key]) cells[key] = { correct: 0, total: 0 };
            cells[key].total++;
            if (h.correct) cells[key].correct++;
        });

        const heatmap = [];
        positions.forEach(pos => {
            streets.forEach(street => {
                const key = `${pos}_${street}`;
                const data = cells[key] || { correct: 0, total: 0 };
                if (data.total > 0) {
                    const accuracy = Math.round((data.correct / data.total) * 100);
                    heatmap.push({
                        position: pos,
                        street,
                        accuracy,
                        total: data.total,
                        intensity: accuracy >= 80 ? 'strong' : accuracy >= 60 ? 'medium' : accuracy >= 40 ? 'weak' : 'critical',
                    });
                }
            });
        });

        const weakest = heatmap.filter(c => c.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0] || null;

        return { heatmap, weakestCell: weakest, positions, streets };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 330: GTO COMPLIANCE SCORE
    // ═══════════════════════════════════════════════════════════════════════════

    getGTOComplianceScore() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
// @@PUB_REGION_16@@
