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
    _getBoardInteractionNote(heroPosition, villainPosition, texture, nodeType, street) {
        if (street === 'preflop' || !texture) return '';
        const isPFR = nodeType === 'hero_bets_or_checks';
        const isCaller = !isPFR;
        const isMonotone = texture.monotone;
        const isPaired = texture.paired;
        const isConnected = texture.connected;

        if (isMonotone && isCaller) {
            return 'Board interaction: monotone boards favor the caller\'s range — callers have more suited hands in their range, giving them more flush draws and made flushes.';
        }
        if (isPaired && isPFR) {
            return 'Board interaction: paired boards favor the PFR — the preflop raiser has more big pairs and overcards that use the board pair for trips. Callers rarely have trips.';
        }
        if (isConnected && isCaller) {
            return 'Board interaction: connected boards (like 7-8-9) favor the caller\'s range — callers have more suited connectors and middling hands that hit these boards hard.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 139: EQUITY DISTRIBUTION NOTES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 139: Notes about how equity is distributed between ranges.
     */
    _getEquityDistributionNote(handStrength, optimalAction, street, nodeType) {
        if (street === 'preflop') return '';
        const a = (optimalAction || '').toLowerCase();
        const handToken = this._getHandToken(handStrength);
        const isNutted = ['nuts', 'second_nuts', 'full_house', 'flush', 'straight'].includes(handToken);
        const isAir = ['high_card', 'ace_high', 'missed_draw', 'overcards', 'air'].includes(handToken);
        const isMedium = ['top_pair', 'overpair', 'middle_pair', 'second_pair', 'top_pair_weak_kicker'].includes(handToken);

        if (isNutted && (a.startsWith('r') || a === 'allin')) {
            return 'Equity distribution: you\'re at the top of your range. Your hand beats nearly everything villain can have. Size for maximum value — go big against their calling range.';
        }
        if (isAir && (a.startsWith('r') || a === 'allin')) {
            return 'Equity distribution: you\'re at the bottom of your range with no showdown value. This makes your hand a natural bluff candidate — you have nothing to lose by betting.';
        }
        if (isMedium && (a === 'x' || a === 'call')) {
            return 'Equity distribution: your hand is in the middle of your range — beating bluffs but losing to value. These hands are natural check/calls that keep villain\'s bluffing range honest.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 140: GTO DEVIATION DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 140: Detect when user's play deviates from GTO patterns.
     * Track cumulative deviations to identify tendencies.
     */
    detectGTODeviation(chosenAction, correctAction, freq, street, handStrength) {
        if (!this._deviationTracker) this._deviationTracker = { overFold: 0, overCall: 0, overRaise: 0, totalSpots: 0 };
        this._deviationTracker.totalSpots++;

        const chosen = (chosenAction || '').toLowerCase();
        const correct = (correctAction || '').toLowerCase();
        if (chosen === correct) return null;

        // Track deviation direction
        const actionStrength = { 'f': 0, 'x': 1, 'call': 2, 'check': 1 };
        const chosenStr = this._isAggressiveAction(chosen) ? 3 : (actionStrength[chosen] ?? 1);
        const correctStr = this._isAggressiveAction(correct) ? 3 : (actionStrength[correct] ?? 1);

        if (chosenStr < correctStr) {
            if (chosen === 'f') {
                this._deviationTracker.overFold++;
                return `▲ Deviation: folding when GTO says ${correct === 'call'? 'call': 'raise'}. You may be over-folding — this leak gives villain free equity when they bet.`;
            }
            this._deviationTracker.overCall++;
            return `Deviation: calling when GTO says raise. Passive play lets villain control the pot size and realize equity cheaply.`;
        }
        if (chosenStr > correctStr) {
            if (correct === 'f') {
                this._deviationTracker.overCall++;
                return `▲ Deviation: calling/raising when GTO says fold. You may be defending too wide — losing money in spots where your equity is too low.`;
            }
            this._deviationTracker.overRaise++;
            return `Deviation: raising when GTO says ${correct}. Over-aggression bloats pots with hands that don't have enough equity.`;
        }
        return null;
    }

    getDeviationSummary() {
        if (!this._deviationTracker || this._deviationTracker.totalSpots < 5) return null;
        const t = this._deviationTracker;
        const total = t.totalSpots;
        const foldRate = ((t.overFold / total) * 100).toFixed(0);
        const callRate = ((t.overCall / total) * 100).toFixed(0);
        const raiseRate = ((t.overRaise / total) * 100).toFixed(0);

        const biggest = Math.max(t.overFold, t.overCall, t.overRaise);
        let tendency = 'balanced';
        if (biggest === t.overFold && t.overFold > total * 0.15) tendency = 'too tight (over-folding)';
        else if (biggest === t.overCall && t.overCall > total * 0.15) tendency = 'too loose-passive (over-calling)';
        else if (biggest === t.overRaise && t.overRaise > total * 0.15) tendency = 'too aggressive (over-raising)';

        return { tendency, overFoldPct: foldRate, overCallPct: callRate, overRaisePct: raiseRate, totalSpots: total };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 141: EXPLOITATIVE ADJUSTMENT SUGGESTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 141: Suggest exploitative deviations from GTO based on opponent tendencies.
     */
    _getExploitativeSuggestion(handStrength, optimalAction, street, nodeType) {
        const handToken = this._getHandToken(handStrength);
        // Only show when user is performing well (indicating they understand GTO)
        if (!this._sessionStats || !this._sessionStats.total || this._sessionStats.total < 10) return '';
        const accuracy = this._sessionStats.correct / this._sessionStats.total;
        if (accuracy < 0.6) return ''; // Only suggest exploits when user knows GTO

        const a = (optimalAction || '').toLowerCase();
        const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'overpair', 'top_pair_top_kicker'].includes(handToken);
        const isMedium = ['top_pair', 'middle_pair', 'second_pair'].includes(handToken);

        // Only offer exploit tips occasionally (every ~5th question when applicable)
        if (this._sessionStats.total % 5 !== 0) return '';

        if (a.startsWith('r') && isStrong) {
            return 'Exploit tip: vs opponents who call too much, increase your value bet sizing. GTO uses balanced sizes, but exploitatively you can size up against calling stations.';
        }
        if (a === 'f' && isMedium) {
            return 'Exploit tip: GTO folds here, but vs opponents who bluff too much, consider calling. Adjust your defense frequency upward against overly aggressive players.';
        }
        if (a.startsWith('r') && !isStrong) {
            return 'Exploit tip: vs opponents who over-fold, increase your bluffing frequency. GTO balances bluffs and value, but exploitatively you can bluff more against tight players.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 142: HAND READING NARRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 142: Narrate what villain's actions tell us about their range.
     */
    _getHandReadingNote(street, nodeType, optimalAction) {
        if (street === 'preflop') return '';
        const node = (nodeType || '').toLowerCase();

        if (street === 'flop') {
            if (node.includes('cbet')) {
                return 'Hand reading: villain\'s c-bet tells us little — most PFRs c-bet the flop at high frequency. Their range is still wide.';
            }
            if (node.includes('check')) {
                return 'Hand reading: villain checked. This caps their range — they probably don\'t have the nuts or a strong overpair. Their range is weighted toward medium hands and draws.';
            }
            if (node.includes('raise') || node.includes('xr')) {
                return 'Hand reading: villain\'s check-raise on the flop is polarized — they have either a very strong hand (set, two pair) or a draw/bluff. Medium-strength hands just call.';
            }
        }
        if (street === 'turn') {
            if (node.includes('barrel') || node.includes('bet')) {
                return 'Hand reading: villain betting again on the turn narrows their range. They\'re representing real strength or a committed bluff. Floaters and medium hands often give up here.';
            }
            if (node.includes('check')) {
                return 'Hand reading: villain checking the turn after betting the flop signals weakness. Their range is capped — strong hands almost always continue betting.';
            }
        }
        if (street === 'river') {
            if (node.includes('bet') || node.includes('barrel')) {
                return 'Hand reading: triple-barreling on the river is the most polarized action. Villain has either the nuts or air — very few medium hands take this line.';
            }
            if (node.includes('check')) {
                return 'Hand reading: villain checking the river means they\'re giving up on bluffs or have a medium hand looking to get to showdown. Consider a thin value bet.';
            }
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 143: SESSION DIFFICULTY AUTO-ADJUSTMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 143: Automatically adjust difficulty based on rolling performance.
     * Tracks last 10 answers and adjusts difficulty target.
     */
    getAutoAdjustedDifficulty() {
        if (!this._recentResults) this._recentResults = [];
        const recent = this._recentResults.slice(-10);
        if (recent.length < 5) return 'standard'; // Not enough data

        const recentAccuracy = recent.filter(r => r).length / recent.length;

        if (recentAccuracy >= 0.85) return 'expert'; // Crushing it — make it harder
        if (recentAccuracy >= 0.55) return 'standard'; // Doing well — maintain
        return 'beginner'; // Struggling — ease up
    }

    recordRecentResult(isCorrect) {
        if (!this._recentResults) this._recentResults = [];
        this._recentResults.push(isCorrect);
        if (this._recentResults.length > 20) this._recentResults.shift();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 144: CONCEPT MASTERY TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 144: Track mastery of individual GTO concepts.
     * e.g., "c-betting", "3-betting", "river bluffing", "pot odds".
     */
    recordConceptExposure(concept, isCorrect) {
        if (!this._conceptMastery) this._conceptMastery = {};
        if (!concept) return;
        if (!this._conceptMastery[concept]) this._conceptMastery[concept] = { total: 0, correct: 0 };
        this._conceptMastery[concept].total++;
        if (isCorrect) this._conceptMastery[concept].correct++;
    }

    getConceptMastery() {
        if (!this._conceptMastery) return {};
        const result = {};
        for (const [concept, data] of Object.entries(this._conceptMastery || {})) {
            if (data.total < 2) continue;
            const rate = data.correct / data.total;
            result[concept] = {
                accuracy: (rate * 100).toFixed(0) + '%',
                total: data.total,
                mastery: rate >= 0.8 ? 'mastered' : rate >= 0.5 ? 'learning' : 'needs_work',
            };
        }
        return result;
    }

    /**
     * Phase 144: Derive concept from question context.
     */
    deriveConceptFromContext(nodeType, street, optimalAction, handStrength) {
        const a = (optimalAction || '').toLowerCase();
        const node = (nodeType || '').toLowerCase();
        if (street === 'preflop') {
            if (node.includes('open')) return 'opening_ranges';
            if (node.includes('facing') && a.startsWith('r')) return '3betting';
            if (node.includes('facing') && a === 'call') return 'preflop_defense';
            if (node.includes('facing') && a === 'f') return 'preflop_folding';
            return 'preflop_general';
        }
        if (node.includes('cbet')) return 'cbetting';
        if (node.includes('xr') || node.includes('check_raise')) return 'check_raising';
        if (a === 'f') return `${street}_folding`;
        if (a === 'call') return `${street}_calling`;
        if (a.startsWith('r') || a === 'allin') return `${street}_betting`;
        return `${street}_general`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 145: WEAKNESS-TARGETED QUESTION GENERATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 145: Bias question generation toward weak spots.
     * Returns a filter preference for question selection.
     */
    getWeaknessTargets() {
        if (!this._mistakeTracker) return null;
        const weakSpots = [];
        for (const [dim, data] of Object.entries(this._mistakeTracker || {})) {
            if (data.total < 3) continue;
            const rate = data.mistakes / data.total;
            if (rate >= 0.4) {
                weakSpots.push({ dimension: dim, mistakeRate: rate, samples: data.total });
            }
        }
        if (weakSpots.length === 0) return null;
        weakSpots.sort((a, b) => b.mistakeRate - a.mistakeRate);
        return weakSpots.slice(0, 5); // Top 5 weakest areas
    }

    /**
     * Phase 145: Score a potential question against user's weakness targets.
     * Higher score = more likely to be selected.
     */
    scoreQuestionForWeakness(scenario) {
        const targets = this.getWeaknessTargets();
        if (!targets || targets.length === 0) return 0;
        let score = 0;
        for (const target of targets) {
            const dim = target.dimension;
            if (dim.startsWith('street:') && scenario.street === dim.split(':')[1]) score += target.mistakeRate * 2;
            if (dim.startsWith('action:') && scenario.correctAction && scenario.correctAction.toLowerCase().startsWith(dim.split(':')[1])) score += target.mistakeRate * 2;
            if (dim.startsWith('spot:') && scenario.spotType === dim.split(':')[1]) score += target.mistakeRate * 3;
        }
        return score;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 146: SPACED REPETITION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 146: Spaced repetition — re-present missed scenarios at increasing intervals.
     */
    recordMissedScenario(scenario, classification) {
        if (!this._spacedRepetition) this._spacedRepetition = [];
        const severity = classification === 'BLUNDER' ? 3 : classification === 'WRONG' ? 2 : 1;
        this._spacedRepetition.push({
            scenario: { street: scenario.street, nodeType: scenario.nodeType, spotType: scenario.spotType, stack_depth: scenario.stack_depth },
            severity,
            nextReview: this._getSessionQuestionCount() + Math.max(3, Math.floor(5 / severity)),
            reviewCount: 0,
        });
    }

    _getSessionQuestionCount() {
        return this._sessionStats?.total || 0;
    }

    getSpacedRepetitionDue() {
        if (!this._spacedRepetition || this._spacedRepetition.length === 0) return null;
        const currentQ = this._getSessionQuestionCount();
        const due = this._spacedRepetition.filter(sr => sr.nextReview <= currentQ);
        if (due.length === 0) return null;
        // Return highest severity first
        due.sort((a, b) => b.severity - a.severity);
        return due[0];
    }

    markSpacedRepetitionReviewed(index) {
        if (!this._spacedRepetition || !this._spacedRepetition[index]) return;
        const sr = this._spacedRepetition[index];
        sr.reviewCount++;
        sr.nextReview = this._getSessionQuestionCount() + Math.min(20, 5 * sr.reviewCount); // Increasing intervals
        if (sr.reviewCount >= 3) {
            this._spacedRepetition.splice(index, 1); // Mastered after 3 successful reviews
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 147: EV LOSS QUANTIFICATION PER MISTAKE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 147: Estimate EV loss for each mistake in bb.
     */
    estimateEVLoss(chosenAction, correctAction, actionEVs, estimatedPot) {
        if (!actionEVs || !chosenAction || !correctAction) return null;
        const correctEV = actionEVs[correctAction];
        const chosenEV = actionEVs[chosenAction];
        if (correctEV == null || chosenEV == null) return null;

        const evDiff = correctEV - chosenEV;
        if (evDiff <= 0) return null; // No loss

        // actionEVs are already bb-scaled — evDiff IS the bb loss (no pot re-scaling)
        const pot = estimatedPot || 1;
        const evLossBB = evDiff;
        const evLossPct = ((evDiff / (Math.abs(correctEV) || 1)) * 100).toFixed(1);

        let severity = 'minor';
        if (evLossBB > 3) severity = 'major';
        else if (evLossBB > 1) severity = 'significant';

        return {
            evLossBB: evLossBB.toFixed(1),
            evLossPctPot: pot > 0 ? ((evDiff / pot) * 100).toFixed(1) + '% of pot' : '0% of pot',
            severity,
            message: `EV loss: ~${evLossBB.toFixed(1)}bb (${evLossPct}% of optimal EV). ${severity === 'major' ? 'This is a costly mistake — focus on this spot.' : severity === 'significant' ? 'Moderate leak that adds up over time.' : 'Small loss, but fixing it improves your win rate.'}`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 148: COMPARISON TO OPTIMAL PLAY STATISTICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 148: Compare user's session stats against optimal play benchmarks.
     */
    getOptimalPlayComparison() {
        if (!this._sessionStats || this._sessionStats.total < 10) return null;
        const accuracy = this._sessionStats.correct / this._sessionStats.total;
        const total = this._sessionStats.total;

        // GTO Wizard benchmarks (approximate): top 10% score ~75%, average ~55%
        const benchmarks = [
            { label: 'GTO Master (top 1%)', threshold: 0.85 },
            { label: 'Advanced (top 10%)', threshold: 0.75 },
            { label: 'Intermediate (top 25%)', threshold: 0.65 },
            { label: 'Learning (top 50%)', threshold: 0.55 },
            { label: 'Beginner (bottom 50%)', threshold: 0 },
        ];

        let userLevel = benchmarks[benchmarks.length - 1];
        for (const b of benchmarks) {
            if (accuracy >= b.threshold) { userLevel = b; break; }
        }

        // Per-street breakdown
        const streetBreakdown = {};
        if (this._mistakeTracker) {
            for (const street of ['flop', 'turn', 'river', 'preflop']) {
                const key = `street:${street}`;
                const data = this._mistakeTracker[key];
                if (data && data.total >= 3) {
                    streetBreakdown[street] = {
                        accuracy: (((data.total - data.mistakes) / data.total) * 100).toFixed(0) + '%',
                        total: data.total,
                    };
                }
            }
        }

        return {
            overall: { accuracy: (accuracy * 100).toFixed(1) + '%', total, level: userLevel.label },
            streetBreakdown,
            vsOptimal: `Your accuracy: ${(accuracy * 100).toFixed(1)}%. ${userLevel.label}. ${accuracy >= 0.75 ? 'Excellent — you\'re playing at an advanced GTO level!' : accuracy >= 0.55 ? 'Solid foundation — focus on your weak spots to level up.' : 'Keep studying — every session builds your GTO intuition.'}`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 149: END-OF-SESSION DETAILED BREAKDOWN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 149: Comprehensive session report with improvement suggestions.
     */
    generateDetailedSessionReport() {
        const summary = this.generateSessionSummary();
        const comparison = this.getOptimalPlayComparison();
        const conceptMastery = this.getConceptMastery();
        const deviations = this.getDeviationSummary();
        const trend = this.getPerformanceTrend();
        const weaknesses = this.getWeaknessTargets();

        const report = {
            summary,
            comparison,
            conceptMastery,
            deviations,
            trend,
            weaknesses: weaknesses ? weaknesses.map(w => ({
                area: w.dimension,
                mistakeRate: (w.mistakeRate * 100).toFixed(0) + '%',
                priority: w.mistakeRate >= 0.6 ? 'HIGH' : 'MEDIUM',
            })) : [],
            improvementPlan: [],
        };

        // Generate improvement suggestions
        if (deviations) {
            if (deviations.tendency.includes('over-folding')) {
                report.improvementPlan.push('Defend more against bets — study pot odds and MDF (Minimum Defense Frequency) to find calls you\'re missing.');
            }
            if (deviations.tendency.includes('over-calling')) {
                report.improvementPlan.push('Tighten your calling range — learn when to fold marginal hands, especially on the river.');
            }
            if (deviations.tendency.includes('over-raising')) {
                report.improvementPlan.push('Reduce aggression with medium hands — learn when calling or checking is more profitable than raising.');
            }
        }

        if (weaknesses) {
            for (const w of weaknesses.slice(0, 3)) {
                if (w.dimension.includes('river')) report.improvementPlan.push('Focus on river play — practice value betting, bluff-catching, and knowing when to give up.');
                if (w.dimension.includes('turn')) report.improvementPlan.push('Work on turn strategy — this is where ranges narrow and decisions get complex.');
                if (w.dimension.includes('hand:weak')) report.improvementPlan.push('Practice playing weak hands — know when to bluff and when to fold.');
                if (w.dimension.includes('action:raise')) report.improvementPlan.push('Study raising strategy — when to raise for value vs as a bluff.');
            }
        }

        // Deduplicate improvement suggestions
        report.improvementPlan = [...new Set(report.improvementPlan)].slice(0, 5);

        return report;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 150: ADAPTIVE COACHING PERSONALITY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 150: Adjust coaching tone based on user's performance and emotional state.
     * Encouraging when struggling, challenging when excelling, neutral otherwise.
     */
    getCoachingTone() {
        if (!this._sessionStats || this._sessionStats.total < 5) return 'encouraging';
        const accuracy = this._sessionStats.correct / this._sessionStats.total;
        const trend = this.getPerformanceTrend();

        if (accuracy >= 0.8 && trend && trend.trend === 'improving') return 'challenging'; // Push them
        if (accuracy < 0.4) return 'supportive'; // They're struggling
        if (trend && trend.trend === 'declining') return 'encouraging'; // Boost morale
        return 'neutral';
    }

    /**
     * Phase 150: Generate a coaching message based on tone and context.
     */
    getCoachingMessage(classification, questionNumber) {
        const tone = this.getCoachingTone();
        const isCorrect = classification === 'CORRECT' || classification === 'GOOD';

        if (tone === 'challenging') {
            if (isCorrect) return questionNumber % 3 === 0 ? '✓ Solid play. Can you explain WHY this is correct without looking at the explanation?': null;
            return '✕ You should know this one. Study the explanation carefully and don\'t repeat this mistake.';
        }
        if (tone === 'supportive') {
            if (isCorrect) return 'Great job! You got this one right — you\'re building strong GTO instincts!';
            return 'Don\'t worry about this one — every top player made these mistakes while learning. Focus on the concept.';
        }
        if (tone === 'encouraging') {
            if (isCorrect) return questionNumber % 5 === 0 ? 'Keep it up! Your understanding is growing with every question.': null;
            return 'Close! Review the explanation — these spots get easier with practice.';
        }
        // neutral
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 151: RANGE VISUALIZATION DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 151: Generate range grid data for visualization.
     * Returns a 13x13 grid with action frequencies for each hand combo.
     */
    generateRangeGridData(handActions, nodeType) {
        const ranks = 'AKQJT98765432'.split('');
        const grid = [];
        for (let i = 0; i < 13; i++) {
            const row = [];
            for (let j = 0; j < 13; j++) {
                let hand;
                if (i === j) hand = ranks[i] + ranks[j]; // Pairs
                else if (i < j) hand = ranks[i] + ranks[j] + 's'; // Suited (above diagonal)
                else hand = ranks[j] + ranks[i] + 'o'; // Offsuit (below diagonal)

                const actions = handActions?.[hand] || {};
                const raiseFreq = Object.entries(actions || {}).filter(([k]) => k.startsWith('r') || k === 'allin').reduce((s, [, v]) => s + v, 0);
                const callFreq = actions['call'] || 0;
                const foldFreq = actions['f'] || 0;
                const checkFreq = actions['x'] || actions['check'] || 0;

                row.push({
                    hand,
                    raise: raiseFreq,
                    call: callFreq,
                    fold: foldFreq,
                    check: checkFreq,
                    isPair: i === j,
                    isSuited: i < j,
                });
            }
            grid.push(row);
        }
        return grid;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 152: ACTION FREQUENCY HEATMAP DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 152: Generate action frequency data for heatmap display.
     */
    generateActionHeatmap(nodeType, street) {
        if (!this._mistakeTracker) return null;
        const actions = ['fold', 'call', 'raise', 'check', 'bet'];
        const streets = ['preflop', 'flop', 'turn', 'river'];
        const heatmap = {};

        for (const s of streets) {
            heatmap[s] = {};
            for (const a of actions) {
                // Tracker compound keys use full-word action buckets (see _getActionBucket)
                const key = `${s}:${a}`;
                const data = this._mistakeTracker[key];
                heatmap[s][a] = data ? {
                    total: data.total,
                    mistakes: data.mistakes,
                    accuracy: data.total > 0 ? ((data.total - data.mistakes) / data.total * 100).toFixed(0) + '%' : 'N/A',
                } : { total: 0, mistakes: 0, accuracy: 'N/A' };
            }
        }
        return heatmap;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 153: EV GRAPH DATA GENERATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 153: Track EV data across the session for graphing.
     */
    recordEVDataPoint(questionNumber, isCorrect, evLoss, street) {
        if (!this._evGraphData) this._evGraphData = [];
        const cumulativeEV = this._evGraphData.length > 0
            ? this._evGraphData[this._evGraphData.length - 1].cumulativeEV
            : 0;

        this._evGraphData.push({
            question: questionNumber,
            correct: isCorrect,
            evLoss: evLoss || 0,
            cumulativeEV: cumulativeEV + (isCorrect ? 0 : -(evLoss || 0)),
            street,
        });
    }

    getEVGraphData() {
        return this._evGraphData || [];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 154: HAND STRENGTH RANKING IN RANGE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 154: Where does this hand rank in the player's range?
     * Top 10%, top 25%, middle, bottom — helps contextualize decisions.
     */
    _getHandRankingNote(handStrength, optimalAction, street) {
        if (street === 'preflop') return '';
        const strengthOrder = [
            'nuts', 'second_nuts', 'full_house', 'flush', 'straight', 'set', 'trips',
            'two_pair', 'overpair', 'top_pair_top_kicker', 'top_pair', 'top_pair_weak_kicker',
            'middle_pair', 'second_pair', 'third_pair', 'bottom_pair', 'weak_pair', 'underpair',
            'ace_high', 'high_card', 'overcards', 'missed_draw', 'air',
            'combo_draw', 'oesd', 'flush_draw', 'gutshot', 'backdoor_flush_draw',
        ];
        const idx = strengthOrder.indexOf(this._getHandToken(handStrength));
        if (idx < 0) return '';

        const totalCategories = strengthOrder.length;
        const percentile = ((idx / totalCategories) * 100).toFixed(0);

        if (idx <= 3) return `Range ranking: your hand is in the top ~5% of possible holdings — a premium hand you should be looking to get value from.`;
        if (idx <= 7) return `Range ranking: your hand is in the top ~25% — a strong hand that can bet for value on most board textures.`;
        if (idx <= 12) return `Range ranking: your hand is in the middle of your range — decent but vulnerable. These hands need careful pot control.`;
        if (idx <= 18) return `Range ranking: your hand is in the bottom ~30% of made hands — marginal showdown value at best. Consider whether checking or folding is better than betting.`;
        return `Range ranking: your hand is a draw/air — no current showdown value. Play for equity realization or as a bluff.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 155: NUT BLOCKER EFFECTS ON BLUFFING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 155: Specific nut blocker logic for bluff selection.
     * Blocking the nuts makes your bluffs more profitable.
     */
    _getNutBlockerBluffNote(heroHand, board, handStrength, optimalAction, street) {
        if (street === 'preflop' || !board || board.length < 3) return '';
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';
        const handToken = this._getHandToken(handStrength);
        const isWeak = ['high_card', 'ace_high', 'missed_draw', 'underpair', 'bottom_pair', 'weak_pair', 'overcards', 'air'].includes(handToken);
        if (!isWeak) return ''; // Only relevant for bluffs

        const boardSuits = board.map(c => c[1]);
        const boardRanks = board.map(c => c[0]);
        const heroRanks = [heroHand[0], heroHand.length >= 3 ? heroHand[1] : ''];
        const heroSuit1 = heroHand.length >= 4 ? heroHand[3] : '';

        // Flush blocker
        const suitCounts = {};
        boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const flushSuit = Object.entries(suitCounts || {}).find(([_, ct]) => ct >= 3);
        if (flushSuit) {
            const hasNutFlushBlocker = heroRanks[0] === 'A' || heroRanks[1] === 'A';
            if (hasNutFlushBlocker) {
                return `Nut flush blocker: your Ace blocks the nut flush, making villain less likely to have the nuts. This makes your bluff more effective — they can\'t confidently call with non-nut hands.`;
            }
        }

        // Straight blocker on connected boards
        const rankVals = boardRanks.map(r => '23456789TJQKA'.indexOf(r)).sort((a, b) => a - b);
        const isConnected = rankVals.length >= 3 && (rankVals[2] - rankVals[0]) <= 4;
        if (isConnected) {
            const highRank = Math.max(...rankVals);
            const heroVal = Math.max('23456789TJQKA'.indexOf(heroRanks[0]), '23456789TJQKA'.indexOf(heroRanks[1]));
            if (heroVal === highRank + 1 || heroVal === highRank + 2) {
                return `Straight blocker: your high card blocks key straight combos on this connected board. Villain is less likely to have the nuts, improving your bluff\'s success rate.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 156: EQUITY DENIAL CONCEPT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 156: Equity denial — betting to prevent villain from realizing their equity.
     */
    _getEquityDenialNote(optimalAction, handStrength, street, texture) {
        const handToken = this._getHandToken(handStrength);
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';
        if (street === 'preflop' || street === 'river') return ''; // No equity denial on river

        const isWet = texture && (texture.wet || texture.flushy || texture.monotone);
        const isMedium = ['overpair', 'top_pair_top_kicker', 'top_pair', 'top_pair_weak_kicker'].includes(handToken);

        if (isMedium && isWet) {
            return 'Equity denial: betting forces draws to pay to continue or fold. If you check, villain gets a free card and can realize their equity for free — costing you money long-term.';
        }
        if (isMedium && !isWet) {
            return 'Equity denial: even on dry boards, villain\'s overcards have equity against your pair. Betting makes them fold hands with 3-6 outs they would otherwise see for free.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 157: POT ODDS VS IMPLIED ODDS COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 157: Compare pot odds vs implied odds to explain calling decisions.
     */
    _getPotVsImpliedOddsNote(optimalAction, handStrength, street, estimatedPot, stackDepth) {
        const handToken = this._getHandToken(handStrength);
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'call') return '';
        if (street === 'preflop') return '';
        const isDraw = ['oesd', 'flush_draw', 'combo_draw', 'gutshot'].includes(handToken);
        if (!isDraw) return '';

        const outs = handToken === 'combo_draw' ? 15 : handToken === 'flush_draw' ? 9 : handToken === 'oesd' ? 8 : 4;
        const equity = street === 'flop' ? (outs * 4) : (outs * 2); // Rule of 4/2
        // Assume a ~2/3 pot bet: required equity = bet / (pot + 2 * bet)
        const bet = (estimatedPot || 10) * 0.67;
        const potOddsNeeded = ((bet / ((estimatedPot || 10) + 2 * bet)) * 100).toFixed(0);

        if (equity >= parseInt(potOddsNeeded)) {
            return `Pot odds justify the call: ${outs} outs = ~${equity}% equity. You need ~${potOddsNeeded}% to call profitably. Direct pot odds are sufficient.`;
        }
        if (stackDepth && stackDepth > estimatedPot * 3) {
            return `Implied odds justify the call: ${outs} outs = ~${equity}% equity, but pot odds alone don't cover it (~${potOddsNeeded}% needed). With ${stackDepth}BB behind, the potential to win a big pot when you hit makes this profitable.`;
        }
        return `Drawing decision: ${outs} outs = ~${equity}% equity. Need ~${potOddsNeeded}% to call — check if implied odds make up the difference.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 158: AGGRESSION FACTOR TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * True when the action is a bet ('b33'), raise ('r50'), or all-in.
     * Solver action ids use both 'b' and 'r' prefixes for aggressive actions.
     */
    _isAggressiveAction(a) { a = (a || '').toLowerCase(); return a.startsWith('b') || a.startsWith('r') || a === 'allin'; }

    /**
     * Extract the bet/raise size (% of pot) from a 'b<n>' or 'r<n>' action id.
     */
    _actionSizePct(a) { const m = (a || '').toLowerCase().match(/^[br](\d+)$/); return m ? parseInt(m[1], 10) : null; }

    /**
     * Phase 158: Track user's aggression factor per street.
     * AF = (bets + raises) / calls. Optimal ~2-3.
     */
    recordAggressionAction(action, street) {
        if (!this._aggressionTracker) this._aggressionTracker = {};
        if (!this._aggressionTracker[street]) this._aggressionTracker[street] = { betsRaises: 0, calls: 0, total: 0 };
        const a = (action || '').toLowerCase();
        this._aggressionTracker[street].total++;
        if (this._isAggressiveAction(a)) this._aggressionTracker[street].betsRaises++;
        else if (a === 'call') this._aggressionTracker[street].calls++;
    }

    getAggressionFactors() {
        if (!this._aggressionTracker) return {};
        const result = {};
        for (const [street, data] of Object.entries(this._aggressionTracker || {})) {
            const af = data.calls > 0 ? (data.betsRaises / data.calls).toFixed(1) : data.betsRaises > 0 ? 'Inf' : '0';
            result[street] = {
                af,
                betsRaises: data.betsRaises,
                calls: data.calls,
                assessment: parseFloat(af) >= 4 ? 'too aggressive' : parseFloat(af) >= 2 ? 'good' : parseFloat(af) >= 1 ? 'slightly passive' : 'too passive',
            };
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 159: VPIP/PFR EQUIVALENT TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 159: Track VPIP and PFR equivalents in training.
     */
    recordPreflopAction(action, nodeType) {
        if (!this._preflopStats) this._preflopStats = { hands: 0, vpip: 0, pfr: 0 };
        this._preflopStats.hands++;
        const a = (action || '').toLowerCase();
        if (a !== 'f') this._preflopStats.vpip++; // Voluntarily put money in pot
        if (this._isAggressiveAction(a)) this._preflopStats.pfr++; // Preflop raise
    }

    getPreflopStats() {
        if (!this._preflopStats || this._preflopStats.hands < 5) return null;
        const vpipPct = ((this._preflopStats.vpip / this._preflopStats.hands) * 100).toFixed(1);
        const pfrPct = ((this._preflopStats.pfr / this._preflopStats.hands) * 100).toFixed(1);
        const gap = (vpipPct - pfrPct).toFixed(1);

        return {
            vpip: vpipPct + '%',
            pfr: pfrPct + '%',
            gap: gap + '%',
            hands: this._preflopStats.hands,
            assessment: parseFloat(gap) > 15 ? 'Too much cold-calling — tighten your flatting range or raise more.' :
                parseFloat(vpipPct) > 35 ? 'Playing too many hands preflop — tighten your opening range.' :
                parseFloat(vpipPct) < 18 ? 'Playing too tight — you\'re missing profitable spots.' :
                'Solid preflop stats.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 160: POSITIONAL AWARENESS SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 160: Score how well user adjusts play by position.
     */
    recordPositionalDecision(heroPosition, isCorrect) {
        if (!this._positionalAwareness) this._positionalAwareness = {};
        if (!heroPosition) return;
        if (!this._positionalAwareness[heroPosition]) this._positionalAwareness[heroPosition] = { total: 0, correct: 0 };
        this._positionalAwareness[heroPosition].total++;
        if (isCorrect) this._positionalAwareness[heroPosition].correct++;
    }

    getPositionalAwarenessScore() {
        if (!this._positionalAwareness) return null;
        const result = {};
        let totalScore = 0, totalWeight = 0;
        for (const [pos, data] of Object.entries(this._positionalAwareness || {})) {
            if (data.total < 2) continue;
            const accuracy = data.correct / data.total;
            result[pos] = { accuracy: (accuracy * 100).toFixed(0) + '%', total: data.total };
            totalScore += accuracy * data.total;
            totalWeight += data.total;
        }
        const overall = totalWeight > 0 ? ((totalScore / totalWeight) * 100).toFixed(0) : 'N/A';
        return { positions: result, overallScore: overall + '%' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 161: 4-BET/5-BET POT THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 161: Explain 4-bet and 5-bet pot dynamics.
     */
    _get4Bet5BetNote(nodeType, potType, optimalAction, handStrength, stackDepth) {
        if (!potType) return '';
        const is4Bet = potType.includes('4-Bet') || potType.includes('4bet');
        const is5Bet = potType.includes('5-Bet') || potType.includes('5bet');
        if (!is4Bet && !is5Bet) return '';
        const a = (optimalAction || '').toLowerCase();

        if (is5Bet) {
            return '5-bet pot: ranges are extremely narrow — typically AA/KK for value, possibly AKs. At this point, SPR is so low that you\'re committed with any hand you continue with.';
        }

        if (is4Bet) {
            if (a.startsWith('r') || a === 'allin') {
                if (stackDepth && stackDepth <= 40) return '4-bet pot with short stacks: you\'re pot-committed. Any continuation is essentially an all-in decision.';
                return '4-bet pot: the raise here narrows ranges significantly. Value 4-bets are typically AA-QQ, AKs. Bluff 4-bets use blockers (A5s, A4s) to remove key combos from villain\'s range.';
            }
            if (a === 'call') {
                return '4-bet pot flat call: flatting keeps villain\'s bluffs in and disguises hand strength. Be ready to play a large pot postflop with a narrow range.';
            }
            if (a === 'f') {
                return '4-bet pot fold: facing a 4-bet, most hands are folds. Only continue with the top of your range — the pot is already very large relative to remaining stacks.';
            }
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 162: MULTI-STREET BLUFF PLANNING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 162: Multi-street bluff commitment — plan the whole line.
     */
    _getMultiStreetBluffNote(optimalAction, handStrength, street, texture) {
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';
        const handToken = this._getHandToken(handStrength);
        const isWeak = ['high_card', 'ace_high', 'missed_draw', 'underpair', 'weak_pair', 'overcards', 'air'].includes(handToken);
        const hasDraw = ['oesd', 'flush_draw', 'combo_draw', 'gutshot'].includes(handToken);

        if (street === 'flop' && (isWeak || hasDraw)) {
            return 'Multi-street planning: when you start bluffing the flop, have a plan for turn and river. Which turn cards do you barrel? Which do you give up? Good bluffs have clear barrel-or-give-up criteria.';
        }
        if (street === 'turn' && isWeak) {
            return 'Turn barrel commitment: you\'ve bet the flop and now the turn. If you plan to bluff the river too (triple barrel), you need to commit ~65% of your stack total. Make sure the story is consistent.';
        }
        if (street === 'turn' && hasDraw) {
            return 'Turn semi-bluff: your draw gives you a safety net — if called, you can still hit. If you miss the river, you can give up or fire the third barrel as a pure bluff.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 163: CHECK-RAISE SIZING THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 163: Optimal check-raise sizing by context.
     */
    _getCheckRaiseSizingNote(optimalAction, street, nodeType, texture) {
        const node = (nodeType || '').toLowerCase();
        if (!node.includes('xr') && !node.includes('check_raise')) return '';
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';

        const sizePct = this._actionSizePct(a) ?? 0;

        if (street === 'flop') {
            if (sizePct <= 250) return `Check-raise to ${sizePct}%: standard sizing on the flop. A 3x check-raise puts villain in a tough spot — they need a strong hand to continue.`;
            return `Large check-raise to ${sizePct}%: oversized check-raise commits a large portion of your stack. This polarized sizing screams "I have a monster or nothing."`;
        }
        if (street === 'turn') {
            return `Turn check-raise: a very strong play. By the turn, check-raising is heavily weighted toward value. Villain\'s range is narrowed from the flop action — target their medium-strength continuing range.`;
        }
        if (street === 'river') {
            return `River check-raise: the strongest possible line. This is almost always the nuts or a big bluff — villain needs a very strong hand to call a river check-raise.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 164: OVERBETTING RIVER THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 164: Deep river overbet theory — maximizing polarization.
     */
    _getRiverOverbetNote(optimalAction, handStrength, street, stackDepth, estimatedPot) {
        if (street !== 'river') return '';
        const a = (optimalAction || '').toLowerCase();
        const sizePct = this._actionSizePct(a);
        if (sizePct == null) return '';
        if (sizePct <= 100) return ''; // Not an overbet

        const handToken = this._getHandToken(handStrength);
        const isNuts = ['nuts', 'second_nuts', 'full_house'].includes(handToken);
        const isAir = ['high_card', 'ace_high', 'missed_draw', 'overcards', 'air'].includes(handToken);

        if (isNuts) {
            return `River overbet for value (${sizePct}% pot): with the nuts, overbetting extracts maximum value. Villain's calling range narrows but each call pays more. This is optimal when you have a hand that beats everything but the absolute nuts.`;
        }
        if (isAir) {
            return `River overbet bluff (${sizePct}% pot): a maximally polarized bluff. The large size means villain needs to be right a high percentage of the time to call — even strong one-pair hands might fold. You need this to work ~${(sizePct / (100 + sizePct) * 100).toFixed(0)}% of the time.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 165: THIN VALUE VS THICK VALUE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 165: Distinguish thin value from thick value bets.
     */
    _getValueThicknessNote(handStrength, optimalAction, street) {
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';

        const handToken = this._getHandToken(handStrength);
        const isThickValue = ['nuts', 'second_nuts', 'full_house', 'flush', 'straight', 'set', 'trips'].includes(handToken);
        const isThinValue = ['two_pair', 'overpair', 'top_pair_top_kicker'].includes(handToken);
        const isVeryThin = ['top_pair', 'top_pair_weak_kicker', 'middle_pair'].includes(handToken);

        if (isThickValue) {
            return 'Thick value: your hand beats a large portion of villain\'s range. Size bigger to extract maximum value — you can afford to be called by worse hands frequently.';
        }
        if (isThinValue && street === 'river') {
            return 'Thin value bet: your hand beats some of villain\'s calling range but loses to some too. Size smaller to get called by more worse hands while minimizing losses against better.';
        }
        if (isVeryThin && street === 'river') {
            return '▲ Very thin value: this bet targets a narrow slice of villain\'s range that is worse but might call. The risk: getting raised means you\'re almost always behind. Consider check-calling instead.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 166: MERGED VS POLARIZED RANGE DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 166: Detect whether the current betting line is merged or polarized.
     */
    _getMergedVsPolarizedNote(optimalAction, handStrength, street, freq) {
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';
        const sizePct = this._actionSizePct(a) ?? 50;

        const handToken = this._getHandToken(handStrength);
        const isMedium = ['overpair', 'top_pair_top_kicker', 'top_pair', 'top_pair_weak_kicker', 'middle_pair'].includes(handToken);
        const isStrong = ['nuts', 'second_nuts', 'flush', 'straight', 'set'].includes(handToken);
        const isWeak = ['high_card', 'ace_high', 'missed_draw', 'underpair', 'weak_pair', 'overcards', 'air'].includes(handToken);

        if (sizePct <= 33 && freq >= 0.6) {
            if (isMedium) return 'Merged betting range: small sizing + high frequency = a merged/depolarized range. You\'re betting both value hands and medium hands at this size. Villain should defend wide.';
            return 'Range bet: small sizing used across your entire range to put pressure. This strategy works on boards that favor your range.';
        }
        if (sizePct >= 75) {
            if (isStrong || isWeak) return 'Polarized betting range: large sizing signals a polarized range — you either have the nuts or nothing. Medium hands check or use smaller sizes.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 167: NODE LOCKING CONCEPT
    // ═══════════════════════════════════════════════════════════════════════════

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
// @@PUB_REGION_15@@
    getGTOComplianceScore() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
// @@PUB_REGION_16@@
