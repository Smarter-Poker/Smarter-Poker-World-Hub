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
// @@PUB_REGION_15@@
    getGTOComplianceScore() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Multi-factor GTO compliance
        let accuracyScore = 0, frequencyScore = 0, balanceScore = 0;
        let freqCount = 0;

        // 1. Action accuracy (40% weight)
        const accuracy = history.filter(h => h.correct).length / history.length;
        accuracyScore = accuracy * 100;

        // 2. Frequency deviation (30% weight)
        history.forEach(h => {
            if (h.correctFreq !== undefined && h.selectedFreq !== undefined) {
                const dev = Math.abs((h.selectedFreq || 0) - (h.correctFreq || 0));
                frequencyScore += Math.max(0, 100 - dev * 2);
                freqCount++;
            }
        });
        if (freqCount > 0) frequencyScore = frequencyScore / freqCount;
        else frequencyScore = accuracyScore; // Fallback

        // 3. Balance (30% weight) — fold/call/raise distribution
        let folds = 0, calls = 0, raises = 0;
        let sFolds = 0, sCalls = 0, sRaises = 0;
        history.forEach(h => {
            const ua = (h.selectedAction || '').toLowerCase();
            const ca = (h.correctAction || '').toLowerCase();
            if (ua.includes('fold')) folds++; else if (ua.includes('call') || ua.includes('check')) calls++; else raises++;
            if (ca.includes('fold')) sFolds++; else if (ca.includes('call') || ca.includes('check')) sCalls++; else sRaises++;
        });
        const total = history.length;
        const fDiff = Math.abs((folds / total) - (sFolds / total));
        const cDiff = Math.abs((calls / total) - (sCalls / total));
        const rDiff = Math.abs((raises / total) - (sRaises / total));
        balanceScore = Math.max(0, 100 - (fDiff + cDiff + rDiff) * 200);

        const overall = Math.round(accuracyScore * 0.4 + frequencyScore * 0.3 + balanceScore * 0.3);

        let tier;
        if (overall >= 90) tier = 'Elite';
        else if (overall >= 80) tier = 'Advanced';
        else if (overall >= 70) tier = 'Intermediate';
        else if (overall >= 55) tier = 'Developing';
        else tier = 'Beginner';

        return {
            overall,
            tier,
            components: {
                accuracy: Math.round(accuracyScore),
                frequency: Math.round(frequencyScore),
                balance: Math.round(balanceScore),
            },
            weights: { accuracy: '40%', frequency: '30%', balance: '30%' },
            totalHands: history.length,
            insight: tier === 'Elite' ? 'Your play closely mirrors GTO solutions. Exceptional!'
                : tier === 'Advanced' ? 'Strong GTO fundamentals. Fine-tune mixed frequency spots.'
                : tier === 'Intermediate' ? 'Good foundation. Focus on frequency accuracy and range balance.'
                : tier === 'Developing' ? 'Growing understanding. Study solver outputs and focus on one leak at a time.'
                : 'Building fundamentals. Start with preflop ranges and basic c-bet strategy.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 331: RANGE BALANCE SCORE
    // ═══════════════════════════════════════════════════════════════════════════

    getRangeBalanceScore() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;

        // For each action type, how well does user match solver frequencies?
        const userActions = {};
        const solverActions = {};

        history.forEach(h => {
            const ua = this._normalizeActionCategory(h.selectedAction || '');
            const ca = this._normalizeActionCategory(h.correctAction || '');
            userActions[ua] = (userActions[ua] || 0) + 1;
            solverActions[ca] = (solverActions[ca] || 0) + 1;
        });

        const total = history.length;
        const allActions = [...new Set([...Object.keys(userActions || {}), ...Object.keys(solverActions || {})])];

        let totalDeviation = 0;
        const actionComparison = allActions.map(action => {
            const userPct = Math.round(((userActions[action] || 0) / total) * 100);
            const solverPct = Math.round(((solverActions[action] || 0) / total) * 100);
            const deviation = Math.abs(userPct - solverPct);
            totalDeviation += deviation;
            return { action, userPct, solverPct, deviation };
        });

        const balanceScore = Math.max(0, Math.round(100 - totalDeviation));

        return {
            balanceScore,
            actionComparison,
            totalDeviation,
            grade: balanceScore >= 85 ? 'A' : balanceScore >= 70 ? 'B' : balanceScore >= 55 ? 'C' : 'D',
            insight: balanceScore >= 85 ? 'Excellent range balance — your action frequencies match the solver closely.'
                : balanceScore >= 70 ? 'Good balance with minor deviations. Fine-tune your weaker spots.'
                : 'Significant frequency imbalances. Study which actions you over- or under-use.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 332: CHECK-BACK ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getCheckBackAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let checkBackCorrect = 0, checkBackTotal = 0, shouldCheckBack = 0, betInsteadOfCheck = 0;

        history.forEach(h => {
            const ua = (h.selectedAction || '').toLowerCase();
            const ca = (h.correctAction || '').toLowerCase();
            const isUserCheck = ua.includes('check');
            const isCorrectCheck = ca.includes('check');

            if (isUserCheck && isCorrectCheck) { checkBackCorrect++; checkBackTotal++; }
            else if (isUserCheck && !isCorrectCheck) { checkBackTotal++; }
            if (isCorrectCheck) { shouldCheckBack++; if (!isUserCheck) betInsteadOfCheck++; }
        });

        return {
            checkBackTotal,
            checkBackCorrect,
            accuracy: checkBackTotal > 0 ? Math.round((checkBackCorrect / checkBackTotal) * 100) : null,
            shouldCheckBack,
            betInsteadOfCheck,
            tip: betInsteadOfCheck > 3
                ? `You bet ${betInsteadOfCheck} times when the solver prefers checking. Checking protects your range and avoids bloating pots with medium hands.`
                : 'Your check-back decisions look solid.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 333: DONK BET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getDonkBetAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        let donkSpots = 0, donkCorrect = 0;

        history.forEach(h => {
            const node = (h.nodeType || '').toLowerCase();
            if (node.includes('donk') || node.includes('lead')) {
                donkSpots++;
                if (h.correct) donkCorrect++;
            }
        });

        return {
            donkSpots,
            donkCorrect,
            accuracy: donkSpots > 0 ? Math.round((donkCorrect / donkSpots) * 100) : null,
            tip: donkSpots === 0
                ? 'No donk bet spots this session. Donk bets are rare in GTO play but correct on specific board textures.'
                : `Donk bet accuracy: ${donkSpots > 0 ? Math.round((donkCorrect / donkSpots) * 100) : 0}%. Donk bets work on boards that favor the caller\\'s range heavily.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 334: MULTIWAY POT ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getMultiWayPotAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let multiway = { correct: 0, total: 0 };
        let headsUp = { correct: 0, total: 0 };

        history.forEach(h => {
            const node = (h.nodeType || '').toLowerCase();
            const isMultiway = node.includes('multiway') || node.includes('multi_way') || node.includes('3way') || node.includes('4way');
            const target = isMultiway ? multiway : headsUp;
            target.total++;
            if (h.correct) target.correct++;
        });

        return {
            multiway: { ...multiway, accuracy: multiway.total > 0 ? Math.round((multiway.correct / multiway.total) * 100) : null },
            headsUp: { ...headsUp, accuracy: headsUp.total > 0 ? Math.round((headsUp.correct / headsUp.total) * 100) : null },
            tip: multiway.total > 0 && headsUp.total > 0 && multiway.total >= 2
                ? `Multiway: ${Math.round((multiway.correct / multiway.total) * 100)}% vs Heads-up: ${Math.round((headsUp.correct / headsUp.total) * 100)}%. Multiway pots require tighter ranges and less bluffing.`
                : 'Most spots were heads-up this session.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 335: THIN VALUE FREQUENCY
    // ═══════════════════════════════════════════════════════════════════════════

    getThinValueFrequency() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Thin value = betting with medium-strength hands for value
        let thinValueSpots = 0, thinValueCorrect = 0;

        history.forEach(h => {
            const handCat = (h.handCategory || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const isMediumHand = handCat.includes('medium') || handCat.includes('middle') || handCat.includes('second') || handCat.includes('top pair weak');
            const isBetting = correctAction.includes('bet') || correctAction.includes('raise');

            if (isMediumHand && isBetting) {
                thinValueSpots++;
                if (h.correct) thinValueCorrect++;
            }
        });

        return {
            thinValueSpots,
            thinValueCorrect,
            accuracy: thinValueSpots > 0 ? Math.round((thinValueCorrect / thinValueSpots) * 100) : null,
            tip: thinValueSpots === 0
                ? 'No thin value spots identified. Thin value betting with medium-strength hands is a key skill for maximizing winnings.'
                : thinValueSpots > 0 && (thinValueCorrect / thinValueSpots) < 0.5
                    ? 'Your thin value betting needs work. Focus on determining if villain calls with worse.'
                    : 'Good thin value betting recognition.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 336: PROTECTION BET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getProtectionBetAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Protection bets: betting to deny free cards (usually on wet boards)
        let protectionSpots = 0, protectionCorrect = 0;

        history.forEach(h => {
            const street = (h.street || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const handCat = (h.handCategory || '').toLowerCase();
            const texture = (h.boardTexture || h.texture || '').toLowerCase();

            const isVulnerable = (handCat.includes('top pair') || handCat.includes('overpair') || handCat.includes('medium')) && (texture.includes('wet') || texture.includes('draw'));
            const isBetting = correctAction.includes('bet');

            if (isVulnerable && isBetting && (street === 'flop' || street === 'turn')) {
                protectionSpots++;
                if (h.correct) protectionCorrect++;
            }
        });

        return {
            protectionSpots,
            protectionCorrect,
            accuracy: protectionSpots > 0 ? Math.round((protectionCorrect / protectionSpots) * 100) : null,
            tip: protectionSpots > 0 && (protectionCorrect / protectionSpots) < 0.5
                ? 'You miss protection bets. On wet boards, bet to deny villain free equity with draws.'
                : 'Your protection betting looks appropriate.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 337: SHOWDOWN ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getShowdownAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // How often user checks down to showdown vs takes aggressive line
        let checkdowns = 0, aggressiveLines = 0, foldedOut = 0;

        history.forEach(h => {
            const action = (h.selectedAction || '').toLowerCase();
            if (action.includes('fold')) foldedOut++;
            else if (action.includes('check') || action.includes('call')) checkdowns++;
            else aggressiveLines++;
        });

        const total = history.length;
        const showdownRate = Math.round(((checkdowns + aggressiveLines) / total) * 100);
        const aggressionRate = (checkdowns + aggressiveLines) > 0
            ? Math.round((aggressiveLines / (checkdowns + aggressiveLines)) * 100) : 0;

        return {
            showdownRate,
            aggressionRate,
            checkdowns,
            aggressiveLines,
            foldedOut,
            total,
            insight: showdownRate > 75 ? 'High showdown rate — you see a lot of rivers. Make sure you are not calling too light.'
                : showdownRate < 40 ? 'Low showdown rate — you fold a lot. Consider defending wider, especially in position.'
                : 'Balanced showdown frequency.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 338: RIVER DECISION QUALITY
    // ═══════════════════════════════════════════════════════════════════════════

    getRiverDecisionQuality() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const riverHands = history.filter(h => (h.street || '').toLowerCase() === 'river');
        if (riverHands.length < 3) return null;

        const correct = riverHands.filter(h => h.correct).length;
        const accuracy = Math.round((correct / riverHands.length) * 100);
        const totalEV = riverHands.reduce((sum, h) => sum + (h.evLoss || 0), 0);
        const avgEV = Math.round((totalEV / riverHands.length) * 100) / 100;

        // River-specific action breakdown
        let riverFolds = 0, riverCalls = 0, riverBets = 0;
        riverHands.forEach(h => {
            const action = (h.selectedAction || '').toLowerCase();
            if (action.includes('fold')) riverFolds++;
            else if (action.includes('call') || action.includes('check')) riverCalls++;
            else riverBets++;
        });

        return {
            totalRiverHands: riverHands.length,
            accuracy,
            avgEVLoss: avgEV,
            actions: { folds: riverFolds, calls: riverCalls, bets: riverBets },
            grade: accuracy >= 80 ? 'A' : accuracy >= 65 ? 'B' : accuracy >= 50 ? 'C' : 'D',
            insight: accuracy >= 80 ? 'Excellent river play — this is where the biggest decisions happen.'
                : accuracy >= 65 ? 'Good river decisions. Focus on close bluff-catching and value betting spots.'
                : 'River play needs work. This is the highest-EV street to improve on.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 339: PREFLOP LEAK IDENTIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    getPreFlopLeaks() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const preflopHands = history.filter(h => (h.street || '').toLowerCase() === 'preflop');
        if (preflopHands.length < 3) return null;

        const leaks = [];
        let openCorrect = 0, openTotal = 0;
        let defenseCorrect = 0, defenseTotal = 0;
        let threeBetCorrect = 0, threeBetTotal = 0;

        preflopHands.forEach(h => {
            const node = (h.nodeType || '').toLowerCase();
            if (node.includes('open') || node.includes('rfi')) {
                openTotal++;
                if (h.correct) openCorrect++;
            } else if (node.includes('defense') || node.includes('facing') || node.includes('vs_')) {
                defenseTotal++;
                if (h.correct) defenseCorrect++;
            } else if (node.includes('3bet') || node.includes('squeeze')) {
                threeBetTotal++;
                if (h.correct) threeBetCorrect++;
            }
        });

        if (openTotal >= 2 && (openCorrect / openTotal) < 0.6) {
            leaks.push({ area: 'Open Range', accuracy: Math.round((openCorrect / openTotal) * 100), fix: 'Review position-based open ranges. Memorize top hands for each position.' });
        }
        if (defenseTotal >= 2 && (defenseCorrect / defenseTotal) < 0.6) {
            leaks.push({ area: 'Defense', accuracy: Math.round((defenseCorrect / defenseTotal) * 100), fix: 'Study defense ranges vs raises. Know which hands to call, 3-bet, or fold.' });
        }
        if (threeBetTotal >= 2 && (threeBetCorrect / threeBetTotal) < 0.5) {
            leaks.push({ area: '3-Bet', accuracy: Math.round((threeBetCorrect / threeBetTotal) * 100), fix: 'Your 3-bet range may be too wide or too narrow. Study position-based 3-bet ranges.' });
        }

        return {
            totalPreflopHands: preflopHands.length,
            accuracy: preflopHands.length > 0 ? Math.round((preflopHands.filter(h => h.correct).length / preflopHands.length) * 100) : 0,
            leaks,
            hasLeaks: leaks.length > 0,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 340: SESSION PROGRESSION CHART DATA
    // ═══════════════════════════════════════════════════════════════════════════

    getSessionProgressionChart() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Generate rolling accuracy data points for charting
        let runningCorrect = 0;
        const dataPoints = history.map((h, i) => {
            if (h.correct) runningCorrect++;
            return {
                hand: i + 1,
                correct: h.correct,
                runningAccuracy: Math.round((runningCorrect / (i + 1)) * 100),
                evLoss: Math.round((h.evLoss || 0) * 100) / 100,
                cumulativeEVLoss: 0, // Will calculate below
                street: h.street || 'unknown',
            };
        });

        // Calculate cumulative EV loss
        let cumEV = 0;
        dataPoints.forEach(dp => {
            cumEV += dp.evLoss;
            dp.cumulativeEVLoss = Math.round(cumEV * 100) / 100;
        });

        return {
            dataPoints,
            totalHands: history.length,
            finalAccuracy: dataPoints[dataPoints.length - 1]?.runningAccuracy || 0,
            totalEVLoss: Math.round(cumEV * 100) / 100,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 341: EQUITY REALIZATION ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getEquityRealizationAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // IP vs OOP equity realization
        const ipHands = history.filter(h => {
            const pos = (h.heroPosition || h.position || '').toUpperCase();
            return ['BTN', 'CO', 'IP'].includes(pos);
        });
        const oopHands = history.filter(h => {
            const pos = (h.heroPosition || h.position || '').toUpperCase();
            return ['SB', 'BB', 'UTG', 'OOP', 'EP'].includes(pos);
        });

        const calcAcc = (arr) => arr.length > 0 ? Math.round((arr.filter(h => h.correct).length / arr.length) * 100) : 0;

        return {
            ipAccuracy: calcAcc(ipHands),
            oopAccuracy: calcAcc(oopHands),
            ipHands: ipHands.length,
            oopHands: oopHands.length,
            positionAdvantage: calcAcc(ipHands) - calcAcc(oopHands),
            insight: calcAcc(ipHands) - calcAcc(oopHands) > 15
                ? 'Significant IP advantage — you realize equity much better in position. Work on OOP strategy.'
                : calcAcc(ipHands) - calcAcc(oopHands) > 5
                    ? 'Slight IP advantage — normal pattern. Position is power in poker.'
                    : 'Your IP/OOP accuracy is close — either great OOP play or room to improve IP play.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 342: POT CONTROL ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getPotControlAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let shouldControl = 0, controlledCorrectly = 0, inflatedWhenShouldControl = 0;

        history.forEach(h => {
            const correctAction = (h.correctAction || '').toLowerCase();
            const userAction = (h.selectedAction || '').toLowerCase();
            const isCorrectPassive = correctAction.includes('check') || correctAction.includes('call');
            const isUserAggressive = userAction.includes('bet') || userAction.includes('raise');

            if (isCorrectPassive) {
                shouldControl++;
                if (!isUserAggressive) controlledCorrectly++;
                else inflatedWhenShouldControl++;
            }
        });

        return {
            shouldControl,
            controlledCorrectly,
            inflatedWhenShouldControl,
            controlRate: shouldControl > 0 ? Math.round((controlledCorrectly / shouldControl) * 100) : null,
            tip: inflatedWhenShouldControl > 3
                ? `You inflated the pot ${inflatedWhenShouldControl} times when the solver prefers pot control. Save aggression for polarized spots.`
                : 'Good pot control awareness — you keep pots small when appropriate.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 343: BOARD TEXTURE QUIZ
    // ═══════════════════════════════════════════════════════════════════════════

    getBoardTextureQuiz() {
        const quizzes = [
            { board: 'A♠ K♥ 7♦', texture: 'Dry', cbetFreq: 'High (~75%)', explanation: 'Dry, disconnected board with high cards. Preflop raiser has massive range advantage. C-bet frequently with small sizing.' },
            { board: 'J♠ T♥ 9♣', texture: 'Wet/Connected', cbetFreq: 'Low (~33%)', explanation: 'Highly connected board. Many draws available. Callers connect well here. Check more frequently and bet larger when you do.' },
            { board: '8♠ 7♠ 6♥', texture: 'Very Wet', cbetFreq: 'Low (~25%)', explanation: 'Extremely connected with straight and flush draws. Callers hit this board hard. Mostly check, bet large with strong hands and good draws.' },
            { board: 'K♠ 8♦ 3♣', texture: 'Dry', cbetFreq: 'High (~70%)', explanation: 'Dry board with one high card. Raiser has range advantage. C-bet small (1/3 pot) with high frequency.' },
            { board: 'Q♥ J♦ T♠', texture: 'Wet/Broadway', cbetFreq: 'Medium (~45%)', explanation: 'Connected broadway board. Both ranges connect, but callers have more two-pair combos. Be selective with c-bets.' },
            { board: '2♠ 2♥ 5♦', texture: 'Paired/Dry', cbetFreq: 'Medium (~50%)', explanation: 'Paired board. Nobody connects often. Small sizing works well because ranges are wide and equity runs close.' },
        ];

        const idx = this._sessionStats?.total
            ? (this._sessionStats.total * 13 + 7) % quizzes.length
            : Math.floor(Math.random() * quizzes.length);

        return quizzes[idx];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 344: STACK DEPTH STRATEGY
    // ═══════════════════════════════════════════════════════════════════════════

    getStackDepthStrategy(effectiveStack = 100) {
        let strategy;
        if (effectiveStack <= 10) {
            strategy = {
                depth: 'Ultra-Short (≤10bb)',
                approach: 'Push/Fold',
                keyPrinciple: 'At 10bb or less, your strategy is binary: shove or fold. No limping, no min-raising.',
                ranges: 'Shove wider from late position. Tighten up from early position. Any pair, suited ace, KQ+ from BTN.',
                mistakes: 'Limping, calling opens, min-raising — all are errors at this depth.',
            };
        } else if (effectiveStack <= 20) {
            strategy = {
                depth: 'Short (11-20bb)',
                approach: 'Raise/Fold or Shove',
                keyPrinciple: 'Open-raise to 2-2.2x or shove. Your 3-bet range should be shove-or-fold only.',
                ranges: 'Open wider from BTN/CO. Shove over opens with 15bb or less with strong broadways and pairs.',
                mistakes: 'Calling 3-bets and seeing flops with shallow stacks is a major leak.',
            };
        } else if (effectiveStack <= 40) {
            strategy = {
                depth: 'Medium (21-40bb)',
                approach: 'Standard with adjustments',
                keyPrinciple: 'Standard preflop ranges but postflop play simplifies. SPR is low, so commit easier with top pair+.',
                ranges: 'Can open standard ranges but 4-bet/shove ranges widen. Avoid flatting 3-bets with speculative hands.',
                mistakes: 'Playing too many multi-street bluffs. With low SPR, one pair hands become very committal.',
            };
        } else {
            strategy = {
                depth: 'Deep (40bb+)',
                approach: 'Full postflop poker',
                keyPrinciple: 'Deep stacks enable complex multi-street play. Implied odds increase for speculative hands.',
                ranges: 'Can flat more with suited connectors, small pairs. Position is even more valuable deep.',
                mistakes: 'Not adjusting bet sizes for stack depth. Overbetting becomes more powerful when deep.',
            };
        }

        return { ...strategy, effectiveStack };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 345: MIXED STRATEGY ACCURACY
    // ═══════════════════════════════════════════════════════════════════════════

    getMixedStrategyAccuracy() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let mixedSpots = 0, mixedCorrect = 0, pureSpots = 0, pureCorrect = 0;

        history.forEach(h => {
            const isMixed = h.correctFreq && h.correctFreq < 85 && h.correctFreq > 15;
            if (isMixed) { mixedSpots++; if (h.correct) mixedCorrect++; }
            else { pureSpots++; if (h.correct) pureCorrect++; }
        });

        return {
            mixedSpots,
            mixedCorrect,
            mixedAccuracy: mixedSpots > 0 ? Math.round((mixedCorrect / mixedSpots) * 100) : null,
            pureSpots,
            pureCorrect,
            pureAccuracy: pureSpots > 0 ? Math.round((pureCorrect / pureSpots) * 100) : null,
            gap: (pureSpots > 0 && mixedSpots > 0)
                ? Math.round((pureCorrect / pureSpots) * 100) - Math.round((mixedCorrect / mixedSpots) * 100)
                : null,
            insight: mixedSpots > 0 && (mixedCorrect / mixedSpots) < 0.5
                ? 'Mixed strategy spots are your weakest area. These spots have close EV between actions — focus on understanding why the solver mixes.'
                : 'Your mixed strategy spot accuracy is respectable.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 346: ENDGAME REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    getEndgameReport() {
        if (!this._sessionStats || this._sessionStats.total < 5) return null;
        const stats = this._sessionStats;
        const accuracy = Math.round((stats.correct / stats.total) * 100);

        // Aggregate key metrics
        const report = {
            accuracy,
            totalHands: stats.total,
            grade: accuracy >= 90 ? 'S' : accuracy >= 80 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 55 ? 'C' : accuracy >= 40 ? 'D' : 'F',
            evLoss: Math.round((stats.evLoss || 0) * 100) / 100,
            highlights: [],
            areasForImprovement: [],
        };

        // Highlights
        if (accuracy >= 80) report.highlights.push(`${accuracy}% accuracy — top tier performance!`);
        if (stats.bestStreak >= 5) report.highlights.push(`${stats.bestStreak}-hand winning streak!`);

        // Areas for improvement from various sources
        try { const ea = this.getExploitativeAdjustments(); if (ea?.adjustments?.[0]) report.areasForImprovement.push(ea.adjustments[0].title); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        try { const pfl = this.getPreFlopLeaks(); if (pfl?.leaks?.[0]) report.areasForImprovement.push(`Preflop: ${pfl.leaks[0].area}`); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        try { const rdq = this.getRiverDecisionQuality(); if (rdq?.grade === 'D') report.areasForImprovement.push('River decisions'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        return report;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 347: PLAYSTYLE EVOLUTION
    // ═══════════════════════════════════════════════════════════════════════════

    getPlaystyleEvolution() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 10) return null;
        const history = this._sessionStats.history;
        const half = Math.floor(history.length / 2);
        const firstHalf = history.slice(0, half);
        const secondHalf = history.slice(half);

        const getProfile = (hands) => {
            let folds = 0, calls = 0, raises = 0;
            hands.forEach(h => {
                const a = (h.selectedAction || '').toLowerCase();
                if (a.includes('fold')) folds++;
                else if (a.includes('call') || a.includes('check')) calls++;
                else raises++;
            });
            const t = hands.length;
            return {
                foldPct: Math.round((folds / t) * 100),
                callPct: Math.round((calls / t) * 100),
                raisePct: Math.round((raises / t) * 100),
                accuracy: Math.round((hands.filter(h => h.correct).length / t) * 100),
            };
        };

        const early = getProfile(firstHalf);
        const late = getProfile(secondHalf);

        const aggressionShift = late.raisePct - early.raisePct;
        let evolution;
        if (aggressionShift > 10) evolution = 'Becoming more aggressive';
        else if (aggressionShift < -10) evolution = 'Becoming more passive';
        else if (late.accuracy > early.accuracy + 10) evolution = 'Improving accuracy';
        else if (late.accuracy < early.accuracy - 10) evolution = 'Declining focus';
        else evolution = 'Consistent play';

        return { early, late, evolution, aggressionShift };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 348: KEY CONCEPT REMINDERS
    // ═══════════════════════════════════════════════════════════════════════════

    getKeyConceptReminders(street = 'flop', nodeType = '', heroPosition = '') {
        const reminders = [];

        if (street === 'preflop') {
            reminders.push('Position is the most valuable asset in poker — play tighter from early positions.');
            if (nodeType.includes('3bet')) reminders.push('3-bet with a polarized range: premiums for value + suited aces/small pairs as bluffs.');
        } else if (street === 'flop') {
            reminders.push('On dry boards, c-bet small and frequently. On wet boards, check more and bet larger.');
            if (heroPosition === 'SB' || heroPosition === 'BB') reminders.push('OOP ranges should check-raise strong hands and draws to build pots.');
        } else if (street === 'turn') {
            reminders.push('The turn is where ranges narrow significantly. Continuing to barrel shows real strength.');
            reminders.push('If you checked the flop, consider a delayed c-bet if the turn improves your range.');
        } else if (street === 'river') {
            reminders.push('River ranges should be polarized: bet big with strong hands and bluffs, check medium hands.');
            reminders.push('Use blockers to select bluffs — blocking strong hands villain could have makes bluffs more profitable.');
        }

        return { reminders: reminders.slice(0, 3), street, position: heroPosition };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 349: NEXT SESSION PREPARATION
    // ═══════════════════════════════════════════════════════════════════════════

    getNextSessionPrep() {
        if (!this._sessionStats || this._sessionStats.total < 5) return null;

        const prep = { warmup: [], focus: [], studyTopics: [] };

        // Warmup based on strengths
        try {
            const posLB = this.getPositionLeaderboard();
            if (posLB?.bestPosition) prep.warmup.push(`Start from your strongest position: ${posLB.bestPosition.position} (${posLB.bestPosition.accuracy}%)`);
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Focus areas from weaknesses
        try {
            const dr = this.getAdaptiveDrillRecommendation();
            if (dr?.recommendations) dr.recommendations.slice(0, 2).forEach(r => prep.focus.push(r.drill));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Study topics
        try {
            const gto = this.getGTOComplianceScore();
            if (gto) {
                if (gto.components.frequency < 70) prep.studyTopics.push('Mixed frequency spots — understand when the solver mixes and why');
                if (gto.components.balance < 70) prep.studyTopics.push('Range balance — review your fold/call/raise distribution vs solver');
                if (gto.components.accuracy < 70) prep.studyTopics.push('Core strategy — review opening ranges and postflop fundamentals');
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        try {
            const rdq = this.getRiverDecisionQuality();
            if (rdq && rdq.grade === 'C' || rdq?.grade === 'D') prep.studyTopics.push('River play — focus on bluff-catching and thin value betting');
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        if (prep.warmup.length === 0) prep.warmup.push('Start with 5 hands of familiar spots to get warmed up');
        if (prep.focus.length === 0) prep.focus.push('General GTO practice');
        if (prep.studyTopics.length === 0) prep.studyTopics.push('Review solver lines for spots you found tricky');

        return prep;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 350: ULTIMATE PLAYER RATING
    // ═══════════════════════════════════════════════════════════════════════════

    getUltimatePlayerRating() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Composite rating from multiple dimensions
        let scores = {};

        // Accuracy (25%)
        const accuracy = Math.round((history.filter(h => h.correct).length / history.length) * 100);
        scores.accuracy = accuracy;

        // GTO Compliance (20%)
        try {
            const gto = this.getGTOComplianceScore();
            scores.gtoCompliance = gto?.overall || accuracy;
        } catch (_) { scores.gtoCompliance = accuracy; }

        // Mental game (15%)
        try {
            const sa = this.getStreakAnalysis();
            scores.mentalGame = sa?.tiltResistance || 70;
        } catch (_) { scores.mentalGame = 70; }

        // Range balance (15%)
        try {
            const rb = this.getRangeBalanceScore();
            scores.rangeBalance = rb?.balanceScore || 60;
        } catch (_) { scores.rangeBalance = 60; }

        // Consistency (10%)
        try {
            const pt = this.getPerformanceTrendAnalysis();
            scores.consistency = pt?.consistencyScore || 60;
        } catch (_) { scores.consistency = 60; }

        // Adaptability (10%)
        try {
            const fc = this.getFrequencyConvergenceTracker();
            scores.adaptability = fc?.isConverging ? 80 : 50;
        } catch (_) { scores.adaptability = 50; }

        // Mixed strategy skill (5%)
        try {
            const ms = this.getMixedStrategyAccuracy();
            scores.mixedStrategy = ms?.mixedAccuracy || 50;
        } catch (_) { scores.mixedStrategy = 50; }

        const compositeRating = Math.round(
            scores.accuracy * 0.25 +
            scores.gtoCompliance * 0.20 +
            scores.mentalGame * 0.15 +
            scores.rangeBalance * 0.15 +
            scores.consistency * 0.10 +
            scores.adaptability * 0.10 +
            scores.mixedStrategy * 0.05
        );

        // Convert to tier
        let tier, elo;
        if (compositeRating >= 90) { tier = 'Grandmaster'; elo = 2400 + (compositeRating - 90) * 20; }
        else if (compositeRating >= 80) { tier = 'Master'; elo = 2200 + (compositeRating - 80) * 20; }
        else if (compositeRating >= 70) { tier = 'Expert'; elo = 2000 + (compositeRating - 70) * 20; }
        else if (compositeRating >= 60) { tier = 'Advanced'; elo = 1800 + (compositeRating - 60) * 20; }
        else if (compositeRating >= 50) { tier = 'Intermediate'; elo = 1600 + (compositeRating - 50) * 20; }
        else if (compositeRating >= 35) { tier = 'Developing'; elo = 1400 + (compositeRating - 35) * 13; }
        else { tier = 'Beginner'; elo = 1200 + compositeRating * 6; }

        return {
            compositeRating,
            elo: Math.round(elo),
            tier,
            scores,
            totalHands: history.length,
            insight: `Your ${tier} rating of ${Math.round(elo)} reflects ${compositeRating}% composite skill across accuracy, GTO compliance, mental game, range balance, consistency, and adaptability.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 355: HAND HISTORY IMPORT → TRAINING QUESTION CONVERTER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 355: Convert an imported hand history into a training-ready question.
     * Tries to find matching solver data for the exact spot. If no solver data,
     * generates a heuristic-based question with approximate GTO frequencies.
     */
    importHandToTrainingQuestion(parsedHand, targetStreet) {
        if (!parsedHand || !parsedHand.success) return null;

        const street = targetStreet || (parsedHand.board.river ? 'river' : parsedHand.board.turn ? 'turn' : 'flop');
        const bbSize = parsedHand.blinds?.bb || 1;

        // Build board cards for the target street
        let boardCards = [...(parsedHand.board.flop || [])];
        if ((street === 'turn' || street === 'river') && parsedHand.board.turn) boardCards.push(parsedHand.board.turn);
        if (street === 'river' && parsedHand.board.river) boardCards.push(parsedHand.board.river);

        // Calculate pot at target street
        let pot = (parsedHand.blinds?.sb || 0.5) + bbSize;
        const streets = ['preflop'];
        if (street !== 'flop') streets.push('flop');
        if (street === 'river') streets.push('turn');

        for (const st of streets) {
            for (const action of (parsedHand.streetActions?.[st] || [])) {
                if (['call', 'raise', 'bet'].includes(action.action)) {
                    pot += action.amount || 0;
                }
            }
        }
        const potBB = Math.round(pot / bbSize) || 6;

        // Build hero hand notation
        let heroHandNotation = '';
        if (parsedHand.heroHand?.card1 && parsedHand.heroHand?.card2) {
            const r1 = parsedHand.heroHand.card1[0];
            const r2 = parsedHand.heroHand.card2[0];
            const s1 = parsedHand.heroHand.card1[1];
            const s2 = parsedHand.heroHand.card2[1];
            const RANK_ORDER = 'AKQJT98765432';
            if (r1 === r2) {
                heroHandNotation = `${r1}${r2}`;
            } else {
                const idx1 = RANK_ORDER.indexOf(r1);
                const idx2 = RANK_ORDER.indexOf(r2);
                const hi = idx1 < idx2 ? r1 : r2;
                const lo = idx1 < idx2 ? r2 : r1;
                heroHandNotation = s1 === s2 ? `${hi}${lo}s` : `${hi}${lo}o`;
            }
        }

        // Generate heuristic GTO frequencies based on position + board texture
        const gtoFreqs = this._heuristicGTOFrequencies(heroHandNotation, boardCards, parsedHand.heroPosition, street, potBB, parsedHand.villainPosition);

        return {
            id: `hh_import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            source: 'hand_history_import',
            heroHand: heroHandNotation,
            heroCards: parsedHand.heroCards || [],
            scenario: {
                gameType: (parsedHand.numPlayers || 6) <= 2 ? 'hu_cash' : 'cash_6max',
                street,
                board: boardCards.join(' '),
                boardCards,
                pot: potBB,
                heroPosition: parsedHand.heroPosition || 'BTN',
                villainPosition: parsedHand.villainPosition || 'BB',
                heroStack: parsedHand.heroStack || 100,
                villainStack: parsedHand.villains?.[0]?.stack || 100,
                stackDepth: parsedHand.heroStack || 100,
                isImported: true,
                importFormat: parsedHand.format || 'unknown',
            },
            gtoFrequencies: gtoFreqs,
            actions: Object.entries(gtoFreqs || {}).map(([action, freq]) => ({
                action,
                frequency: freq,
                label: this._actionLabel(action),
            })),
        };
    }

    /**
     * Phase 355: Generate heuristic GTO frequencies for imported hands
     * when no solver data is available.
     */
    _heuristicGTOFrequencies(heroHand, boardCards, position, street, potBB, villainPosition) {
        const freqs = {};
        // Position is relative: SB is OOP against everyone, BB is IP against SB.
        const isIP = this._isInPosition(position, villainPosition);

        // Classify board texture
        const texture = this.classifyBoardTexture(boardCards);
        const textureType = texture?.type || 'STANDARD';

        // Base frequencies by texture.
        // These are check/bet nodes (hero is not facing a bet), so fold is not
        // a legal action — former 'f' weight is folded into 'x'.
        if (textureType.includes('DRY') || textureType.includes('RAINBOW')) {
            // Dry board = more checking, small bets
            freqs['x'] = 0.45;
            freqs['b33'] = 0.35;
            freqs['b50'] = 0.15;
            freqs['b75'] = 0.05;
        } else if (textureType.includes('MONOTONE')) {
            // Monotone = polarized
            freqs['x'] = 0.70;
            freqs['b75'] = 0.20;
            freqs['b33'] = 0.10;
        } else if (textureType.includes('CONNECTED') || textureType.includes('WET')) {
            // Wet = larger sizes, more checking
            freqs['x'] = 0.45;
            freqs['b50'] = 0.25;
            freqs['b75'] = 0.20;
            freqs['b33'] = 0.10;
        } else {
            // Standard
            freqs['x'] = 0.45;
            freqs['b33'] = 0.25;
            freqs['b50'] = 0.20;
            freqs['b75'] = 0.10;
        }

        // Position adjustments
        if (isIP) {
            freqs['x'] = (freqs['x'] || 0) - 0.05;
            freqs['b33'] = (freqs['b33'] || 0) + 0.05;
        }

        // Street adjustments
        if (street === 'river') {
            freqs['x'] = (freqs['x'] || 0) + 0.10;
            freqs['b75'] = (freqs['b75'] || 0) + 0.05;
            freqs['b33'] = (freqs['b33'] || 0) - 0.10;
        }

        // Normalize
        const total = Object.values(freqs || {}).reduce((s, v) => s + Math.max(v, 0), 0) || 1;
        for (const k of Object.keys(freqs || {})) {
            freqs[k] = Math.max(0, freqs[k]) / total;
        }

        return freqs;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 356: ENHANCED GAME TREE BUILDER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 356: Build a detailed game tree for the current spot.
     * Goes 3 levels deep: Hero action → Villain response → Hero re-action.
     * Uses solver frequencies when available, heuristics otherwise.
     */
    buildDetailedGameTree(spotData, heroHand, heroPosition, villainPosition, street) {
        if (!spotData && !heroHand) return null;

        const actions = spotData?.actions || spotData?.gtoFrequencies || {};
        const total = Object.values(actions || {}).reduce((s, v) => s + (v || 0), 0) || 1;
        const boardCards = spotData?.scenario?.boardCards || spotData?.boardCards || [];

        const ACTION_META = {
            x: { type: 'check', label: 'Check', color: '#3b82f6', abbr: 'X' },
            c: { type: 'call', label: 'Call', color: '#22c55e', abbr: 'C' },
            f: { type: 'fold', label: 'Fold', color: '#64748b', abbr: 'F' },
            b33: { type: 'bet', label: 'Bet 33%', color: '#ef4444', abbr: 'B33' },
            b50: { type: 'bet', label: 'Bet 50%', color: '#ef4444', abbr: 'B50' },
            b67: { type: 'bet', label: 'Bet 67%', color: '#ef4444', abbr: 'B67' },
            b75: { type: 'bet', label: 'Bet 75%', color: '#ef4444', abbr: 'B75' },
            b100: { type: 'bet', label: 'Bet 100%', color: '#ef4444', abbr: 'B100' },
            b150: { type: 'overbet', label: 'Bet 150%', color: '#a855f7', abbr: 'OB' },
            allin: { type: 'allin', label: 'All-In', color: '#a855f7', abbr: 'AI' },
            r: { type: 'raise', label: 'Raise', color: '#ef4444', abbr: 'R' },
        };

        const rootChildren = [];

        Object.entries(actions || {}).forEach(([key, freq]) => {
            if (freq <= 0.005) return;
            const meta = ACTION_META[key] || ACTION_META[key[0]] || { type: 'check', label: key, color: '#3b82f6', abbr: key.slice(0, 2).toUpperCase() };
            const pct = Math.round((freq / total) * 100);
            const isTerminal = meta.type === 'fold';

            // Level 2: Villain responses
            const villainChildren = [];
            if (!isTerminal) {
                if (meta.type === 'bet' || meta.type === 'raise' || meta.type === 'overbet' || meta.type === 'allin') {
                    // After hero bet/raise: villain can fold, call, or raise.
                    //
                    // Operation Grok-Sweep (2026-05): the prior implementation
                    // used Math.random() to jitter these "default" frequencies
                    // 0–10 points on each render — making the EV-tree numbers
                    // change every time the user re-rendered the view. Worse,
                    // the values were presented to the user as solver
                    // frequencies. They are NOT solver-derived; they are
                    // reasonable static defaults until per-node solver-defense
                    // data is wired through. Stable values stop the jiggle and
                    // preserve user trust.
                    villainChildren.push(
                        { id: `v-fold-${key}`, type: 'terminal', action: 'fold', label: `${villainPosition || 'V'} Fold`, abbr: 'F', frequency: 35, isApprox: true, color: '#64748b', children: [], depth: 2 },
                        { id: `v-call-${key}`, type: 'decision', action: 'call', label: `${villainPosition || 'V'} Call`, abbr: 'C', frequency: 50, isApprox: true, color: '#22c55e', children: [
                            // Level 3: Next street or showdown
                            ...(street === 'river' ? [
                                { id: `sd-${key}`, type: 'terminal', action: 'showdown', label: 'Showdown', abbr: 'SD', frequency: 100, color: '#eab308', children: [], depth: 3 },
                            ] : [
                                { id: `ns-chk-${key}`, type: 'decision', action: 'check', label: 'Check', abbr: 'X', frequency: 45, isApprox: true, color: '#3b82f6', children: [], depth: 3 },
                                { id: `ns-bet-${key}`, type: 'decision', action: 'bet', label: 'Bet', abbr: 'B', frequency: 55, isApprox: true, color: '#ef4444', children: [], depth: 3 },
                            ]),
                        ], depth: 2 },
                        { id: `v-raise-${key}`, type: 'decision', action: 'raise', label: `${villainPosition || 'V'} Raise`, abbr: 'R', frequency: 15, isApprox: true, color: '#ef4444', children: [
                            { id: `h-fold-${key}`, type: 'terminal', action: 'fold', label: 'Fold', abbr: 'F', frequency: 40, color: '#64748b', children: [], depth: 3 },
                            { id: `h-call-${key}`, type: 'decision', action: 'call', label: 'Call', abbr: 'C', frequency: 45, color: '#22c55e', children: [], depth: 3 },
                            { id: `h-4bet-${key}`, type: 'decision', action: 'raise', label: 'Re-raise', abbr: 'RR', frequency: 15, color: '#a855f7', children: [], depth: 3 },
                        ], depth: 2 },
                    );
                } else if (meta.type === 'check') {
                    // After hero check: villain can check or bet
                    villainChildren.push(
                        { id: `v-chk-${key}`, type: 'chance', action: 'check', label: `${villainPosition || 'V'} Check`, abbr: 'X', frequency: 55, color: '#3b82f6', children: [
                            ...(street === 'river' ? [
                                { id: `sd-chk-${key}`, type: 'terminal', action: 'showdown', label: 'Showdown', abbr: 'SD', frequency: 100, color: '#eab308', children: [], depth: 3 },
                            ] : [
                                { id: `ns-${key}`, type: 'chance', action: 'check', label: 'Next Street', abbr: '>', frequency: 100, color: '#3b82f6', children: [], depth: 3 },
                            ]),
                        ], depth: 2 },
                        { id: `v-bet-${key}`, type: 'decision', action: 'bet', label: `${villainPosition || 'V'} Bet`, abbr: 'B', frequency: 45, color: '#ef4444', children: [
                            { id: `h-fold-chk-${key}`, type: 'terminal', action: 'fold', label: 'Fold', abbr: 'F', frequency: 30, color: '#64748b', children: [], depth: 3 },
                            { id: `h-call-chk-${key}`, type: 'decision', action: 'call', label: 'Call', abbr: 'C', frequency: 50, color: '#22c55e', children: [], depth: 3 },
                            { id: `h-raise-chk-${key}`, type: 'decision', action: 'raise', label: 'Raise', abbr: 'R', frequency: 20, color: '#ef4444', children: [], depth: 3 },
                        ], depth: 2 },
                    );
                } else if (meta.type === 'call') {
                    // After hero call: next street or showdown
                    villainChildren.push(
                        ...(street === 'river' ? [
                            { id: `sd-call-${key}`, type: 'terminal', action: 'showdown', label: 'Showdown', abbr: 'SD', frequency: 100, color: '#eab308', children: [], depth: 2 },
                        ] : [
                            { id: `ns-call-${key}`, type: 'chance', action: 'check', label: 'Next Street', abbr: '>', frequency: 100, color: '#3b82f6', children: [], depth: 2 },
                        ]),
                    );
                }
            }

            rootChildren.push({
                id: `root-${key}`,
                type: isTerminal ? 'terminal' : 'decision',
                action: meta.type,
                label: `${meta.label} (${pct}%)`,
                abbr: meta.abbr,
                frequency: pct,
                color: meta.color,
                children: villainChildren,
                depth: 1,
            });
        });

        // Sort by frequency
        rootChildren.sort((a, b) => b.frequency - a.frequency);

        return {
            id: 'root',
            type: 'decision',
            label: `${heroPosition || 'Hero'} (${heroHand || '??'})`,
            color: '#00d4ff',
            children: rootChildren,
            depth: 0,
            meta: {
                heroHand,
                heroPosition,
                villainPosition,
                street,
                boardCards,
            },
        };
    }
}

// Export singleton
export const deterministicEngine = new DeterministicGTOEngine();
