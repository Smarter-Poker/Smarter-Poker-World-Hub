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

    /**
     * Phase 203: Generate board coverage data — which ranks/suits does hero's range cover?
     */
    generateBoardCoverageData(board, heroPosition, isPFR) {
        if (!board || board.length < 3) return null;
        const ranks = 'AKQJT98765432'.split('');
        const boardRanks = board.map(c => c[0]);
        const boardSuits = board.map(c => c[1]);

        const coverage = {};
        for (const rank of ranks) {
            const onBoard = boardRanks.includes(rank);
            const rankVal = '23456789TJQKA'.indexOf(rank);
            coverage[rank] = {
                onBoard,
                pfrHits: isPFR ? (rankVal >= 9 ? 'high' : rankVal >= 5 ? 'medium' : 'low') : null,
                callerHits: !isPFR ? (rankVal <= 8 && rankVal >= 3 ? 'high' : 'medium') : null,
                sets: onBoard ? 'possible' : 'impossible',
            };
        }
        return coverage;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 204: NUT COMBO COUNTING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 204: Count exact combos for nutted hands on this board.
     */
    countNutCombos(board) {
        if (!board || board.length < 3) return null;
        const boardRanks = board.map(c => '23456789TJQKA'.indexOf(c[0]));
        const boardSuits = board.map(c => c[1]);
        const combos = {};

        // Sets: 3 combos each (4C2 = 6, minus the one card on board × remaining = 3)
        const uniqueRanks = [...new Set(boardRanks)];
        for (const r of uniqueRanks) {
            const count = boardRanks.filter(br => br === r).length;
            if (count === 1) combos[`set_of_${'23456789TJQKA'[r]}s`] = 3;
            if (count === 2) combos[`quads_${'23456789TJQKA'[r]}s`] = 1;
        }

        // Two-pair combos (rough count)
        if (uniqueRanks.length >= 2) {
            const pairCombos = uniqueRanks.length * (uniqueRanks.length - 1) / 2;
            combos['two_pair_total'] = pairCombos * 9; // ~9 combos per two-pair type
        }

        // Flush draws (if 2+ of same suit)
        const suitCounts = {};
        boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
        for (const [suit, ct] of Object.entries(suitCounts || {})) {
            if (ct >= 2 && ct < board.length) {
                const remainingOfSuit = 13 - ct;
                combos[`flush_draw_${suit}`] = Math.floor(remainingOfSuit * (remainingOfSuit - 1) / 2);
            }
            if (ct >= 3) {
                const remainingOfSuit = 13 - ct;
                combos[`made_flush_${suit}`] = Math.floor(remainingOfSuit * (remainingOfSuit - 1) / 2);
            }
        }

        return combos;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 205: BLOCKER INTERACTION MATRIX
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 205: Show which blockers affect which combos.
     */
    _getBlockerMatrixNote(heroHand, board, handStrength, optimalAction) {
        const handToken = this._getHandToken(handStrength);
        if (!heroHand || heroHand.length < 2 || !board || board.length < 3) return '';
        const a = (optimalAction || '').toLowerCase();
        const r1 = heroHand[0], r2 = heroHand.length >= 3 ? heroHand[1] : heroHand[1];

        // Specific blocker effects
        const effects = [];
        if (r1 === 'A' || r2 === 'A') {
            effects.push('Ace blocks: removes 3 AA combos, 4 AK combos, and reduces nut flush combos');
        }
        if (r1 === 'K' || r2 === 'K') {
            effects.push('King blocks: removes 3 KK combos, 4 AK combos');
        }
        const boardRanks = board.map(c => c[0]);
        if (boardRanks.includes(r1) || boardRanks.includes(r2)) {
            effects.push('Board interaction: your card matches a board card, reducing villain\'s set/trips combos');
        }

        if (effects.length === 0) return '';
        if (a.startsWith('r') && ['high_card', 'ace_high', 'missed_draw', 'underpair'].includes(handToken)) {
            return `Blocker advantage for bluffing: ${effects[0]}. This makes your bluff more effective — villain has fewer nutted hands.`;
        }
        if (a === 'call') {
            return `Blocker effect when calling: ${effects[0]}. This slightly improves your call since villain is less likely to have the nuts.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 206: POT COMMITMENT THRESHOLD
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 206: Calculate pot commitment threshold.
     * When you've invested X% of your stack, folding becomes -EV.
     */
    _getPotCommitmentNote(estimatedPot, stackDepth, optimalAction) {
        if (!estimatedPot || !stackDepth) return '';
        const invested = estimatedPot / 2; // Rough hero investment
        const investedPct = (invested / stackDepth * 100).toFixed(0);
        const a = (optimalAction || '').toLowerCase();

        if (parseInt(investedPct) >= 33 && a === 'f') {
            return `▲ Pot commitment: you've invested ~${investedPct}% of your stack. At this point, folding is expensive. The threshold for pot commitment is typically 30-33% — once past that, you often need a very strong reason to fold.`;
        }
        if (parseInt(investedPct) >= 50) {
            return `Pot committed (~${investedPct}% of stack invested): you're essentially committed to this pot. Getting all-in is almost always correct — the remaining stack is too small relative to the pot.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 207: CHECK-CALL VS CHECK-FOLD FRAMEWORK
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 207: Decision framework for check-calling vs check-folding.
     */
    _getCheckCallFoldNote(optimalAction, handStrength, street, nodeType) {
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'call' && a !== 'f') return '';
        const node = (nodeType || '').toLowerCase();
        if (!node.includes('facing') && !node.includes('bet')) return '';

        const handToken = this._getHandToken(handStrength);
        const isMedium = ['top_pair', 'top_pair_weak_kicker', 'middle_pair', 'second_pair', 'overpair'].includes(handToken);
        const isWeak = ['bottom_pair', 'underpair', 'ace_high', 'high_card', 'weak_pair', 'overcards', 'air'].includes(handToken);

        if (a === 'call' && isMedium) {
            return 'Check-call: your hand beats bluffs but loses to value. Calling keeps villain\'s bluffs in your range. Key question: does villain bluff enough to justify calling?';
        }
        if (a === 'call' && isWeak && street === 'river') {
            return 'Bluff-catching: calling with a weak hand to catch bluffs. This only works if villain bluffs frequently enough. Calculate: you need to be right > pot odds % of the time.';
        }
        if (a === 'f' && isMedium) {
            return 'Check-fold with a medium hand: GTO says fold here. Villain\'s betting range is too strong — your hand doesn\'t beat enough of their value bets, and they\'re not bluffing enough to justify calling.';
        }
        if (a === 'f' && isWeak) {
            return 'Check-fold: no showdown value and not enough equity to justify calling. Save your chips for a better spot.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 208: FACING DONK BET THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 208: How to react when facing a donk bet (OOP leads into PFR).
     */
    _getFacingDonkNote(optimalAction, handStrength, street, nodeType) {
        const node = (nodeType || '').toLowerCase();
        if (!node.includes('donk') && !node.includes('facing_lead')) return '';
        const a = (optimalAction || '').toLowerCase();

        if (this._isAggressiveAction(a)) {
            return 'Facing donk bet — raise: donk bets are often polarized or merged-weak. Raising puts maximum pressure. Your raising range should include strong value hands and semi-bluffs with good equity.';
        }
        if (a === 'call') {
            return 'Facing donk bet — call: flatting keeps the pot controlled and lets you see how villain plays on later streets. Many donk bettors give up on the turn if called.';
        }
        if (a === 'f') {
            return 'Facing donk bet — fold: even though donk bets are often weak, your hand doesn\'t have enough equity to continue. Respect the action when your hand is at the bottom of your range.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 209: SLOW-PLAY CRITERIA CHECKLIST
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 209: When is slow-playing correct? Checklist approach.
     */
    _getSlowPlayChecklistNote(optimalAction, handStrength, street, texture) {
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'x' && a !== 'check' && a !== 'call') return '';
        const isMonster = ['nuts', 'second_nuts', 'full_house', 'set', 'flush', 'straight'].includes(this._getHandToken(handStrength));
        if (!isMonster) return '';

        const isDry = texture && texture.dry && !(texture.flushy || texture.monotone);
        const criteria = [];
        if (isDry) criteria.push('✓ Dry board (villain has few draws)');
        else criteria.push('✕ Wet board (draws can outdraw you — prefer betting)');

        if (street === 'flop') criteria.push('✓ Early street (time to trap on later streets)');
        if (street === 'river') criteria.push('✕ River (no more streets to extract value)');

        if (criteria.some(c => c.startsWith('✕'))) {
            return `Slow-play analysis: ${criteria.join('. ')}. Consider whether slow-playing is optimal — wet boards and late streets often favor fast-playing strong hands.`;
        }
        return `Slow-play checklist: ${criteria.join('. ')}. Conditions favor a trap — villain can't outdraw you and has room to bluff on later streets.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 210: OVERBETTING CRITERIA CHECKLIST
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 210: When to overbet — structured checklist.
     */
    _getOverbetChecklistNote(optimalAction, handStrength, street, texture, stackDepth, estimatedPot) {
        const handToken = this._getHandToken(handStrength);
        const a = (optimalAction || '').toLowerCase();
        const sizePct = this._actionSizePct(a);
        if (sizePct == null || sizePct <= 100) return '';

        const criteria = [];
        const isNuts = ['nuts', 'second_nuts', 'full_house'].includes(handToken);
        const isAir = ['high_card', 'ace_high', 'missed_draw'].includes(handToken);

        if (isNuts) criteria.push('✓ Nutted hand — overbet for max value');
        if (isAir) criteria.push('✓ Air — overbet as a bluff to maximize fold equity');
        if (street === 'river') criteria.push('✓ River — maximum polarization');
        if (stackDepth && estimatedPot && stackDepth > estimatedPot * 2) criteria.push('✓ Deep enough stacks for overbet');
        if (texture && texture.dry) criteria.push('✓ Dry/static board — ranges are clearer');

        if (criteria.length >= 3) {
            return `Overbet criteria (${sizePct}% pot): ${criteria.join('. ')}. Multiple conditions met — overbet is well-justified.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 211: RIVER POLARIZATION INDEX
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 211: Quantify how polarized the river action is.
     */
    _getRiverPolarizationIndex(handActions, street) {
        if (street !== 'river' || !handActions) return '';
        const raiseFreq = Object.entries(handActions || {}).filter(([k]) => k.startsWith('r') || k === 'allin').reduce((s, [, v]) => s + v, 0);
        const foldFreq = handActions['f'] || 0;
        const callFreq = handActions['call'] || 0;
        const checkFreq = handActions['x'] || handActions['check'] || 0;

        const polarizationScore = (raiseFreq + foldFreq) / (raiseFreq + foldFreq + callFreq + checkFreq + 0.001);

        if (polarizationScore > 0.8) return 'Polarization index: VERY HIGH — this river spot is extremely polarized. Ranges consist of the nuts and bluffs with almost no medium hands.';
        if (polarizationScore > 0.6) return 'Polarization index: HIGH — river ranges are fairly polarized. Most hands are clearly value or clearly bluffs.';
        if (polarizationScore > 0.4) return 'Polarization index: MODERATE — some medium-strength hands exist in the range. Not fully polarized.';
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 212: STREET-BY-STREET EV DECOMPOSITION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 212: Break down EV contribution by street.
     */
    _getEVDecompositionNote(street, optimalAction, handStrength, estimatedPot) {
        const handToken = this._getHandToken(handStrength);
        if (!estimatedPot || street === 'preflop') return '';
        const a = (optimalAction || '').toLowerCase();
        const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'overpair', 'flush', 'straight', 'full_house'].includes(handToken);

        if (street === 'flop') {
            if (isStrong && this._isAggressiveAction(a)) return `EV source (flop): ~30% of your total hand EV comes from flop betting. Building the pot early with strong hands sets up larger bets on later streets.`;
            return '';
        }
        if (street === 'turn') {
            if (isStrong && this._isAggressiveAction(a)) return `EV source (turn): the turn is where the most EV is generated in a hand. Pot is larger, ranges are narrower, and strong hands extract significant value.`;
            return '';
        }
        if (street === 'river') {
            if (this._isAggressiveAction(a) && isStrong) return `EV source (river): river value bets capture the final portion of the hand's EV. Sizing correctly here — not too big to fold out everything, not too small to leave money behind.`;
            if (a === 'call') return `EV source (river): river calls with bluff-catchers generate EV by catching villain's bluffs. The value comes from correct bluff-catching frequency.`;
            return '';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 213: ACTION CLUSTERING FOR PATTERN RECOGNITION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 213: Cluster similar spots together for pattern recognition.
     */
    getActionClusters() {
        if (!this._handHistory || this._handHistory.length < 10) return null;
        const clusters = {};

        for (const hand of this._handHistory) {
            const key = `${hand.street}|${hand.nodeType || 'general'}|${hand.correctAction?.toLowerCase().startsWith('r') ? 'raise' : hand.correctAction}`;
            if (!clusters[key]) clusters[key] = { total: 0, correct: 0, hands: [] };
            clusters[key].total++;
            if (hand.isCorrect) clusters[key].correct++;
            if (clusters[key].hands.length < 3) clusters[key].hands.push(hand.id);
        }

        // Return clusters sorted by most common
        return Object.entries(clusters || {})
            .filter(([, d]) => d.total >= 3)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([key, data]) => ({
                pattern: key,
                total: data.total,
                accuracy: ((data.correct / data.total) * 100).toFixed(0) + '%',
                exampleHands: data.hands,
            }));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 214: SCENARIO TAGGING SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 214: Tag scenarios for later review.
     */
    tagScenario(handId, tag) {
        if (!this._scenarioTags) this._scenarioTags = {};
        if (!this._scenarioTags[handId]) this._scenarioTags[handId] = [];
        if (!this._scenarioTags[handId].includes(tag)) {
            this._scenarioTags[handId].push(tag);
        }
    }

    getTaggedScenarios(tag) {
        if (!this._scenarioTags) return [];
        if (tag) {
            return Object.entries(this._scenarioTags || {})
                .filter(([, tags]) => tags.includes(tag))
                .map(([id]) => parseInt(id));
        }
        return this._scenarioTags;
    }

    getAllTags() {
        if (!this._scenarioTags) return [];
        const allTags = new Set();
        for (const tags of Object.values(this._scenarioTags || {})) {
            tags.forEach(t => allTags.add(t));
        }
        return [...allTags];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 215: ADAPTIVE HINT SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 215: Progressive hints before revealing the answer.
     * Hint 1: vague, Hint 2: more specific, Hint 3: almost reveals.
     */
    _legacyGenerateHints(scenario, heroHand, board, handActions, correctAction) {
        const hints = [];
        const a = (correctAction || '').toLowerCase();
        const street = scenario.street || 'flop';

        // Hint 1: General direction
        if (a === 'f') hints.push('Think about whether your hand has enough equity to continue here.');
        else if (a === 'call') hints.push('Consider whether this hand has showdown value worth protecting.');
        else if (a.startsWith('r') || a === 'allin') hints.push('Think about what you want to accomplish — are you building the pot or applying pressure?');
        else hints.push('Consider the pot size and your position before deciding.');

        // Hint 2: More specific
        if (a === 'f') hints.push(`On the ${street}, look at pot odds. Does your hand have enough equity against villain's likely range?`);
        else if (a === 'call') hints.push(`Your hand has some value but maybe not enough to raise. Is there a reason to keep the pot small?`);
        else if (a.startsWith('r')) {
            const match = a.match(/r(\d+)/);
            hints.push(match ? `Consider the sizing — what does a ${parseInt(match[1]) > 75 ? 'large' : 'small-to-medium'} bet accomplish here?` : 'Think about why raising is better than calling.');
        }

        // Hint 3: Almost reveals
        const freq = handActions?.[correctAction] || 0;
        if (freq >= 0.9) hints.push(`This is a near-pure strategy spot — the solver almost always takes one specific action here. What's the clearest play?`);
        else hints.push(`This is a mixed spot — but the most frequent action (${(freq * 100).toFixed(0)}%) should guide your default.`);

        return hints;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 216: EXPLANATION QUALITY SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 216: Rate explanation quality for continuous improvement.
     */
    rateExplanation(handId, rating, feedback) {
        if (!this._explanationRatings) this._explanationRatings = [];
        this._explanationRatings.push({ handId, rating, feedback, timestamp: Date.now() });
    }

    getExplanationQualityStats() {
        if (!this._explanationRatings || this._explanationRatings.length < 3) return null;
        const ratings = this._explanationRatings.map(r => r.rating);
        const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
        return {
            averageRating: avg.toFixed(1),
            totalRatings: ratings.length,
            lowRated: this._explanationRatings.filter(r => r.rating <= 2).length,
            highRated: this._explanationRatings.filter(r => r.rating >= 4).length,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 217: MULTI-SIZING EXPLANATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 217: Explain why solver uses size X instead of size Y.
     */
    _getMultiSizingNote(optimalAction, handActions, handStrength, street, texture) {
        const handToken = this._getHandToken(handStrength);
        if (!handActions) return '';
        const raises = Object.entries(handActions || {}).filter(([k, f]) => k.startsWith('r') && f > 0.05);
        if (raises.length < 2) return '';

        const sizes = raises.map(([k, f]) => ({ size: parseInt(k.slice(1)) || 0, freq: f })).sort((a, b) => b.freq - a.freq);
        const primary = sizes[0];
        const secondary = sizes[1];

        if (!primary || !secondary || primary.size === 0) return '';

        if (primary.size > secondary.size) {
            return `Multi-sizing: solver prefers ${primary.size}% pot (${(primary.freq * 100).toFixed(0)}%) over ${secondary.size}% (${(secondary.freq * 100).toFixed(0)}%). The larger size is used with ${['nuts', 'second_nuts', 'flush', 'straight', 'set'].includes(handToken) ? 'strong value hands and big bluffs (polarized)' : 'a polarized range to maximize fold equity'}.`;
        }
        return `Multi-sizing: solver splits between ${primary.size}% (${(primary.freq * 100).toFixed(0)}%) and ${secondary.size}% (${(secondary.freq * 100).toFixed(0)}%). Different sizes target different parts of villain's range.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 218: FREQUENCY-WEIGHTED SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 218: Partial credit scoring for mixed strategy spots.
     * If solver plays action at 40%, choosing it isn't a full mistake.
     */
    calculateFrequencyWeightedScore(chosenAction, handActions) {
        if (!handActions) return { score: 0, maxScore: 1, details: 'No data' };
        const chosenFreq = handActions[chosenAction] || 0;
        const maxFreq = Math.max(...Object.values(handActions || {}));
        const optimalAction = Object.entries(handActions || {}).sort((a, b) => b[1] - a[1])[0]?.[0];

        if (chosenAction === optimalAction) return { score: 1.0, maxScore: 1.0, details: 'Perfect — you chose the most frequent action.' };
        if (chosenFreq >= 0.4) return { score: 0.8, maxScore: 1.0, details: `Good — your action is played ${(chosenFreq * 100).toFixed(0)}% of the time. Very close to optimal.` };
        if (chosenFreq >= 0.2) return { score: 0.5, maxScore: 1.0, details: `Acceptable — your action is in the solver's strategy at ${(chosenFreq * 100).toFixed(0)}%, but not the primary action.` };
        if (chosenFreq > 0) return { score: 0.2, maxScore: 1.0, details: `Marginal — your action exists at ${(chosenFreq * 100).toFixed(0)}%, but it's rarely used. The primary action is much more frequent.` };
        return { score: 0, maxScore: 1.0, details: 'This action is never in the solver\'s strategy — 0% frequency.' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 219: CHALLENGE MODE DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 219: Challenge mode — timed questions with streak multipliers.
     */
    initChallengeMode(config) {
        this._challengeMode = {
            active: true,
            timeLimit: config?.timeLimit || 15000, // 15s default
            streakMultiplier: 1.0,
            currentStreak: 0,
            score: 0,
            questionsAnswered: 0,
            startTime: Date.now(),
        };
        return this._challengeMode;
    }

    recordChallengeAnswer(isCorrect, timeMs) {
        if (!this._challengeMode?.active) return null;
        this._challengeMode.questionsAnswered++;

        if (isCorrect) {
            this._challengeMode.currentStreak++;
            this._challengeMode.maxStreak = Math.max(this._challengeMode.maxStreak || 0, this._challengeMode.currentStreak);
            this._challengeMode.streakMultiplier = 1 + (this._challengeMode.currentStreak * 0.25);
            const timeBonus = timeMs < 5000 ? 1.5 : timeMs < 10000 ? 1.2 : 1.0;
            const points = Math.round(100 * this._challengeMode.streakMultiplier * timeBonus);
            this._challengeMode.score += points;
            return { points, streak: this._challengeMode.currentStreak, multiplier: this._challengeMode.streakMultiplier.toFixed(2), total: this._challengeMode.score };
        }

        this._challengeMode.currentStreak = 0;
        this._challengeMode.streakMultiplier = 1.0;
        return { points: 0, streak: 0, multiplier: '1.00', total: this._challengeMode.score };
    }

    getChallengeResults() {
        if (!this._challengeMode) return null;
        const elapsed = (Date.now() - this._challengeMode.startTime) / 1000;
        return {
            score: this._challengeMode.score,
            questionsAnswered: this._challengeMode.questionsAnswered,
            elapsed: elapsed.toFixed(0) + 's',
            avgPointsPerQuestion: this._challengeMode.questionsAnswered > 0 ? (this._challengeMode.score / this._challengeMode.questionsAnswered).toFixed(0) : 0,
            bestStreak: this._challengeMode.maxStreak || this._challengeMode.currentStreak || 0,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 220: ACHIEVEMENT/BADGE SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 220: Award badges for milestones and achievements.
     */
    checkAchievements() {
        if (!this._achievements) this._achievements = new Set();
        const newBadges = [];

        const total = this._sessionStats?.total || 0;
        const correct = this._sessionStats?.correct || 0;
        const accuracy = total > 0 ? correct / total : 0;

        // Question count badges
        if (total >= 10 && !this._achievements.has('first_10')) { this._achievements.add('first_10'); newBadges.push({ id: 'first_10', name: 'Getting Started', desc: 'Answered 10 questions'}); }
        if (total >= 50 && !this._achievements.has('fifty_club')) { this._achievements.add('fifty_club'); newBadges.push({ id: 'fifty_club', name: 'Fifty Club', desc: 'Answered 50 questions in one session'}); }
        if (total >= 100 && !this._achievements.has('century')) { this._achievements.add('century'); newBadges.push({ id: 'century', name: 'Century', desc: '100 questions in one session!'}); }

        // Accuracy badges
        if (total >= 20 && accuracy >= 0.8 && !this._achievements.has('sharpshooter')) { this._achievements.add('sharpshooter'); newBadges.push({ id: 'sharpshooter', name: 'Sharpshooter', desc: '80%+ accuracy over 20+ questions'}); }
        if (total >= 30 && accuracy >= 0.9 && !this._achievements.has('gto_master')) { this._achievements.add('gto_master'); newBadges.push({ id: 'gto_master', name: 'GTO Master', desc: '90%+ accuracy over 30+ questions'}); }

        // Streak badges
        const streak = this._sessionBests?.streak || 0;
        if (streak >= 10 && !this._achievements.has('hot_streak')) { this._achievements.add('hot_streak'); newBadges.push({ id: 'hot_streak', name: '▲ Hot Streak', desc: '10 correct answers in a row'}); }
        if (streak >= 20 && !this._achievements.has('unstoppable')) { this._achievements.add('unstoppable'); newBadges.push({ id: 'unstoppable', name: 'Unstoppable', desc: '20 correct answers in a row'}); }

        // Concept badges
        const concepts = this.getConceptMastery();
        const mastered = Object.values(concepts || {}).filter(c => c.mastery === 'mastered').length;
        if (mastered >= 3 && !this._achievements.has('well_rounded')) { this._achievements.add('well_rounded'); newBadges.push({ id: 'well_rounded', name: 'Well-Rounded', desc: 'Mastered 3+ GTO concepts'}); }
        if (mastered >= 8 && !this._achievements.has('gto_scholar')) { this._achievements.add('gto_scholar'); newBadges.push({ id: 'gto_scholar', name: 'GTO Scholar', desc: 'Mastered 8+ GTO concepts'}); }

        return { newBadges, totalBadges: this._achievements.size, allBadges: [...this._achievements] };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 221: CONCEPT DEPENDENCY TREE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 221: Define prerequisites for GTO concepts.
     * Learn fundamentals before advanced topics.
     */
    getConceptDependencyTree() {
        return {
            'opening_ranges': { prereqs: [], level: 1, desc: 'Which hands to open from each position' },
            'preflop_defense': { prereqs: ['opening_ranges'], level: 1, desc: 'How to defend against opens' },
            '3betting': { prereqs: ['opening_ranges', 'preflop_defense'], level: 2, desc: '3-bet ranges and sizing' },
            'cbetting': { prereqs: ['opening_ranges'], level: 2, desc: 'Continuation betting strategy' },
            'pot_odds': { prereqs: [], level: 1, desc: 'Basic pot odds calculation' },
            'implied_odds': { prereqs: ['pot_odds'], level: 2, desc: 'Implied odds for drawing hands' },
            'flop_betting': { prereqs: ['cbetting'], level: 2, desc: 'Flop betting strategy' },
            'turn_betting': { prereqs: ['flop_betting'], level: 3, desc: 'Turn barrel strategy' },
            'river_betting': { prereqs: ['turn_betting'], level: 3, desc: 'River value/bluff decisions' },
            'check_raising': { prereqs: ['flop_betting'], level: 3, desc: 'Check-raise strategy' },
            'bluff_catching': { prereqs: ['pot_odds', 'river_betting'], level: 3, desc: 'River bluff-catching' },
            'range_advantage': { prereqs: ['cbetting', 'opening_ranges'], level: 3, desc: 'Range vs nut advantage' },
            'board_texture': { prereqs: ['flop_betting'], level: 2, desc: 'Board texture analysis' },
            'multi_street_planning': { prereqs: ['turn_betting', 'river_betting'], level: 4, desc: 'Planning across all streets' },
            'exploitative_play': { prereqs: ['range_advantage', 'bluff_catching'], level: 4, desc: 'Deviating from GTO' },
            'mixed_strategies': { prereqs: ['multi_street_planning'], level: 4, desc: 'Understanding solver mixing' },
            'overbetting': { prereqs: ['river_betting', 'range_advantage'], level: 4, desc: 'Overbet strategy' },
            'icm': { prereqs: ['preflop_defense', '3betting'], level: 4, desc: 'Tournament ICM pressure' },
        };
    }

    getRecommendedConcept() {
        const tree = this.getConceptDependencyTree();
        const mastery = this.getConceptMastery();

        // Find concepts where all prereqs are mastered but this isn't
        for (const [concept, info] of Object.entries(tree || {})) {
            const isMastered = mastery[concept]?.mastery === 'mastered';
            if (isMastered) continue;
            const prereqsMet = info.prereqs.every(p => mastery[p]?.mastery === 'mastered' || !mastery[p]);
            if (prereqsMet) return { concept, ...info };
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 222: DRILL RECOMMENDATION ENGINE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 222: Recommend drills based on weaknesses and concept mastery.
     */
    getRecommendedDrills() {
        const weaknesses = this.getWeaknessTargets();
        const concepts = this.getConceptMastery();
        const recommendations = [];

        // Weakness-based drills
        if (weaknesses) {
            for (const w of weaknesses.slice(0, 3)) {
                const dim = w.dimension;
                if (dim.startsWith('street:')) {
                    const street = dim.split(':')[1];
                    recommendations.push({
                        name: `${street.charAt(0).toUpperCase() + street.slice(1)} Practice`,
                        desc: `Focus on ${street} decisions — your mistake rate is ${(w.mistakeRate * 100).toFixed(0)}%`,
                        filters: { streets: [street] },
                        priority: 'HIGH',
                    });
                }
                if (dim.startsWith('action:')) {
                    const action = dim.split(':')[1];
                    recommendations.push({
                        name: `${action.charAt(0).toUpperCase() + action.slice(1)} Situations`,
                        desc: `Practice spots where ${action} is correct — ${(w.mistakeRate * 100).toFixed(0)}% mistake rate`,
                        filters: { nodeTypes: [action] },
                        priority: 'HIGH',
                    });
                }
            }
        }

        // Concept-based drills
        for (const [concept, data] of Object.entries(concepts || {})) {
            if (data.mastery === 'needs_work') {
                recommendations.push({
                    name: `Master: ${concept.replace(/_/g, ' ')}`,
                    desc: `Only ${data.accuracy} accuracy — needs focused practice`,
                    filters: { nodeTypes: [concept] },
                    priority: 'MEDIUM',
                });
            }
        }

        // General recommended drill if few weaknesses
        if (recommendations.length === 0) {
            const nextConcept = this.getRecommendedConcept();
            if (nextConcept) {
                recommendations.push({
                    name: `New concept: ${nextConcept.desc}`,
                    desc: `Ready to learn ${nextConcept.concept.replace(/_/g, ' ')}`,
                    filters: { nodeTypes: [nextConcept.concept] },
                    priority: 'NORMAL',
                });
            }
        }

        return recommendations.slice(0, 5);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 223: SOLVER LINE COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 223: Show what solver does across the full hand.
     */
    _getSolverLineNote(street, optimalAction, nodeType, handStrength) {
        const a = (optimalAction || '').toLowerCase();
        const node = (nodeType || '').toLowerCase();
        const handToken = this._getHandToken(handStrength);
        const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'flush', 'straight', 'full_house'].includes(handToken);
        const isMedium = ['overpair', 'top_pair_top_kicker', 'top_pair'].includes(handToken);

        if (street === 'flop' && isStrong) {
            if (a.startsWith('r')) return 'Solver line: strong hands typically bet flop → bet turn → bet/check river (depending on runout). Fast-playing builds the pot for a big river bet.';
            if (a === 'x' || a === 'call') return 'Solver line: slow-playing the flop to trap. The typical continuation is bet turn → bet river, or check-raise if villain bets.';
        }
        if (street === 'flop' && isMedium) {
            return 'Solver line: medium hands often bet flop → check turn (for pot control) → check/call or thin value bet river.';
        }
        if (street === 'turn' && a.startsWith('r') && isStrong) {
            return 'Solver line: betting turn with a strong hand after flop action. Typical continuation is a value bet on the river sized to get stacks in.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 224: EXPECTED FREQUENCY TRACKER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 224: Track if user's overall action frequencies match GTO.
     * Over many hands, you should fold ~35%, call ~30%, raise ~35% (approx).
     */
    getExpectedFrequencyBalance() {
        if (!this._freqComparison) return null;

        const userTotals = { fold: 0, call: 0, raise: 0, check: 0, total: 0 };
        for (const data of Object.values(this._freqComparison || {})) {
            for (const [action, ct] of Object.entries(data.userActions || {})) {
                userTotals[action] = (userTotals[action] || 0) + ct;
                userTotals.total += ct;
            }
        }

        if (userTotals.total < 15) return null;

        const freqs = {
            fold: ((userTotals.fold / userTotals.total) * 100).toFixed(0),
            call: ((userTotals.call / userTotals.total) * 100).toFixed(0),
            raise: ((userTotals.raise / userTotals.total) * 100).toFixed(0),
            check: ((userTotals.check / userTotals.total) * 100).toFixed(0),
        };

        // Rough GTO benchmarks (varies heavily by spot)
        const assessment = [];
        if (parseInt(freqs.fold) > 45) assessment.push('Folding more than expected — you may be too tight');
        if (parseInt(freqs.fold) < 20) assessment.push('Folding less than expected — you may be too loose');
        if (parseInt(freqs.raise) > 50) assessment.push('Raising very aggressively — make sure you have value to back it up');
        if (parseInt(freqs.raise) < 20) assessment.push('Raising infrequently — you may be too passive');

        return { frequencies: freqs, total: userTotals.total, assessment: assessment.length > 0 ? assessment : ['Well-balanced overall action frequencies'] };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 225: SMART RECAP SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 225: Periodic concept recaps — summarize key learnings.
     */
    generateSmartRecap(questionNumber) {
        if (questionNumber % 25 !== 0 || questionNumber === 0) return null;

        const recap = { questionNumber, sections: [] };

        // Recent performance
        const recent = (this._recentResults || []).slice(-10);
        const recentAcc = recent.length > 0 ? (recent.filter(r => r).length / recent.length * 100).toFixed(0) : 'N/A';
        recap.sections.push({ title: 'Recent Performance', content: `Last 10 questions: ${recentAcc}% accuracy` });

        // Key concepts practiced
        const concepts = this.getConceptMastery();
        const recentConcepts = Object.entries(concepts || {}).filter(([, d]) => d.total >= 2).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
        if (recentConcepts.length > 0) {
            recap.sections.push({
                title: 'Concepts Practiced',
                content: recentConcepts.map(([c, d]) => `${c.replace(/_/g, ' ')}: ${d.accuracy} (${d.mastery})`).join(', '),
            });
        }

        // Weakest areas
        const weaknesses = this.getWeaknessTargets();
        if (weaknesses && weaknesses.length > 0) {
            recap.sections.push({
                title: 'Focus Areas',
                content: weaknesses.slice(0, 3).map(w => `${w.dimension}: ${(w.mistakeRate * 100).toFixed(0)}% mistake rate`).join(', '),
            });
        }

        // Improvement tips
        const deviations = this.getDeviationSummary();
        if (deviations && deviations.tendency !== 'balanced') {
            recap.sections.push({ title: 'Key Adjustment', content: `Your tendency: ${deviations.tendency}. Focus on correcting this in the next set of questions.` });
        }

        // Next recommended focus
        const nextConcept = this.getRecommendedConcept();
        if (nextConcept) {
            recap.sections.push({ title: 'Next Up', content: `Ready to work on: ${nextConcept.desc}` });
        }

        return recap;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 226: RANGE EQUITY CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 226: Approximate equity vs villain's range based on hand strength.
     * Uses pre-computed equity tables for common matchups.
     */
    _legacyEstimateEquityVsRange(handStrength, street, villainRangeType) {
        // Pre-computed approximate equities for common matchups
        const equities = {
            'nuts': { wide: 95, medium: 92, tight: 85 },
            'second_nuts': { wide: 90, medium: 87, tight: 80 },
            'full_house': { wide: 92, medium: 88, tight: 82 },
            'flush': { wide: 85, medium: 80, tight: 70 },
            'straight': { wide: 82, medium: 76, tight: 65 },
            'set': { wide: 80, medium: 75, tight: 65 },
            'trips': { wide: 75, medium: 70, tight: 58 },
            'two_pair': { wide: 72, medium: 65, tight: 55 },
            'overpair': { wide: 65, medium: 58, tight: 45 },
            'top_pair_top_kicker': { wide: 62, medium: 55, tight: 42 },
            'top_pair': { wide: 58, medium: 50, tight: 38 },
            'top_pair_weak_kicker': { wide: 52, medium: 45, tight: 33 },
            'middle_pair': { wide: 42, medium: 35, tight: 25 },
            'second_pair': { wide: 38, medium: 30, tight: 22 },
            'bottom_pair': { wide: 32, medium: 25, tight: 18 },
            'underpair': { wide: 28, medium: 22, tight: 15 },
            'ace_high': { wide: 25, medium: 18, tight: 12 },
            'high_card': { wide: 18, medium: 12, tight: 8 },
            'combo_draw': { wide: 48, medium: 45, tight: 42 },
            'flush_draw': { wide: 36, medium: 34, tight: 32 },
            'oesd': { wide: 32, medium: 30, tight: 28 },
            'gutshot': { wide: 18, medium: 16, tight: 14 },
            'missed_draw': { wide: 8, medium: 5, tight: 3 },
        };

        const rangeType = villainRangeType || 'medium';
        const eq = equities[handStrength];
        if (!eq) return null;

        const equity = eq[rangeType] || eq.medium;
        return {
            equity: equity + '%',
            vsRange: rangeType,
            assessment: equity >= 70 ? 'Strong favorite — bet for value' :
                equity >= 50 ? 'Slight favorite — thin value or pot control' :
                equity >= 30 ? 'Underdog — need pot odds or implied odds to continue' :
                'Significant underdog — fold unless getting excellent price',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 227: GTO DEVIATION COST TRACKER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 227: Track cumulative EV cost of all deviations from GTO.
     */
    recordDeviationCost(evLossBB) {
        if (!this._cumulativeDeviationCost) this._cumulativeDeviationCost = { total: 0, count: 0, history: [] };
        if (evLossBB > 0) {
            this._cumulativeDeviationCost.total += evLossBB;
            this._cumulativeDeviationCost.count++;
            this._cumulativeDeviationCost.history.push({ loss: evLossBB, question: this._getSessionQuestionCount() });
        }
    }

    getCumulativeDeviationCost() {
        if (!this._cumulativeDeviationCost) return null;
        const c = this._cumulativeDeviationCost;
        return {
            totalEVLost: c.total.toFixed(1) + 'bb',
            mistakes: c.count,
            avgLossPerMistake: c.count > 0 ? (c.total / c.count).toFixed(1) + 'bb' : '0bb',
            costPerHundred: this._sessionStats?.total > 0 ? ((c.total / this._sessionStats.total) * 100).toFixed(1) + 'bb/100' : 'N/A',
            message: c.total > 50 ? '▲ Significant EV leakage — focus on your biggest mistake categories.':
                c.total > 20 ? 'Moderate leaks — fixing your top 3 mistakes would save most of this.' :
                'Small leaks — you\'re playing close to GTO. Fine-tuning will get you even closer.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 228: HAND CATEGORY DEEP-DIVE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 228: Detailed explanation notes for specific hand categories.
     */
    _getHandCategoryDeepDive(handStrength, street, optimalAction) {
        if (street === 'preflop') return '';
        const a = (optimalAction || '').toLowerCase();

        const deepDives = {
            'set': `Sets are the strongest hidden hands in hold'em. With a set, you hold 3-of-a-kind with a pocket pair, making it nearly invisible to opponents. On most boards, fast-play your set to build the pot — slow-playing risks being outdrawn.`,
            'two_pair': `Two pair is strong but vulnerable. On wet boards, straights and flushes can overtake you. The key: bet for value on the flop/turn to deny equity, but be cautious if the board gets scarier on later streets.`,
            'overpair': `Overpairs (pair higher than all board cards) are strong on dry boards but can be tricky on wet boards. The danger: opponents may have flopped sets, two pair, or draws. Play your overpair aggressively on favorable boards.`,
            'flush_draw': `Flush draws have ~35% equity on the flop (2 streets) and ~19% on the turn (1 street). Rule of 4/2: multiply outs by 4 on flop, by 2 on turn. With 9 outs, that's 36% on flop, 18% on turn. Always consider whether you're drawing to the nut flush.`,
            'combo_draw': `Combo draws (flush draw + straight draw) are monsters with 12-15 outs. That's 48-60% equity on the flop — you're often a favorite! Play these aggressively: raise and re-raise to build the pot or win it outright.`,
            'top_pair': `Top pair is the backbone of postflop play. Its value depends heavily on your kicker. TPTK (top pair top kicker) is much stronger than TPWK (weak kicker). On wet boards, bet for protection. On dry boards, pot control may be optimal.`,
        };

        return deepDives[this._getHandToken(handStrength)] || '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 229: BOARD RUNOUT SIMULATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 229: Simulate possible runouts and their strategic implications.
     */
    simulateRunouts(board, handStrength, street) {
        if (!board || board.length < 3 || street === 'river') return null;
        const boardSuits = board.map(c => c[1]);
        const boardRanks = board.map(c => '23456789TJQKA'.indexOf(c[0]));
        const suitCounts = {};
        boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });

        const scenarios = [];

        // Flush-completing card
        const flushSuit = Object.entries(suitCounts || {}).find(([, ct]) => ct >= 2);
        if (flushSuit && flushSuit[1] < 3) {
            scenarios.push({ type: 'flush_completing', desc: `A ${flushSuit[0]} card completes the flush draw`, impact: 'bad_for_non_flush', strategy: 'Check or slow down without a flush — villain\'s draw got there.' });
        }

        // Overcard (Ace or King)
        const maxRank = Math.max(...boardRanks);
        if (maxRank < 12) { // No Ace on board
            scenarios.push({ type: 'ace_comes', desc: 'An Ace hits the turn/river', impact: 'changes_dynamics', strategy: 'Ace is the most impactful overcard — it helps Ax hands in both ranges but especially favors the preflop raiser.' });
        }
        if (maxRank < 11) { // No King on board
            scenarios.push({ type: 'king_comes', desc: 'A King hits', impact: 'overcard', strategy: 'King improves KQ/KJ type hands. Reassess — your top pair may now be second pair.' });
        }

        // Board pairing
        scenarios.push({ type: 'board_pairs', desc: 'The board pairs', impact: 'favors_pfr', strategy: 'Paired boards reduce straight/flush equity and favor the preflop raiser who has more big-card hands.' });

        // Brick
        scenarios.push({ type: 'brick', desc: 'A low unconnected card (2-5)', impact: 'neutral', strategy: 'Bricks maintain the status quo. Continue with your flop plan.' });

        // Straight completing
        const sorted = [...new Set(boardRanks)].sort((a, b) => a - b);
        if (sorted.length >= 2 && sorted[sorted.length - 1] - sorted[0] <= 4) {
            scenarios.push({ type: 'straight_completing', desc: 'A card that completes a straight', impact: 'bad_for_one_pair', strategy: 'Connected cards getting there is dangerous for one-pair hands. Consider checking or folding to aggression.' });
        }

        return scenarios;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 230: 3-BET DEFENSE MATRIX BY POSITION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 230: Pre-computed 3-bet defense frequencies by position pair.
     */
    get3BetDefenseMatrix() {
        return {
            'UTG_vs_BB': { fold: 55, call: 20, fourBet: 25, desc: 'UTG opens tight, BB 3-bets polarized. UTG folds a lot but 4-bets AA/KK/AKs.' },
            'UTG_vs_BTN': { fold: 50, call: 25, fourBet: 25, desc: 'BTN 3-bets wider. UTG still defends tight but has more calling hands IP.' },
            'MP_vs_BB': { fold: 50, call: 25, fourBet: 25, desc: 'MP range is wider. Defend with medium pairs and suited broadways.' },
            'CO_vs_BB': { fold: 40, call: 30, fourBet: 30, desc: 'CO opens wide, more incentive to defend. Mix 4-bets with value and bluffs.' },
            'CO_vs_BTN': { fold: 35, call: 35, fourBet: 30, desc: 'CO vs BTN is a key battleground. Defend wider with position.' },
            'BTN_vs_BB': { fold: 30, call: 40, fourBet: 30, desc: 'BTN opens widest, defends wide vs BB 3-bet. IP advantage lets you flat more.' },
            'BTN_vs_SB': { fold: 25, call: 40, fourBet: 35, desc: 'SB 3-bets tighter. BTN can defend very wide with IP postflop.' },
            'SB_vs_BB': { fold: 40, call: 15, fourBet: 45, desc: 'SB vs BB: SB opens wide, often 4-bets or folds vs 3-bet. Flatting OOP is bad.' },
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 231: POSTFLOP AGGRESSION COACHING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 231: Optimal aggression level by spot type.
     */
    _getAggressionCoachingNote(optimalAction, handStrength, street, nodeType, texture) {
        const handToken = this._getHandToken(handStrength);
        const a = (optimalAction || '').toLowerCase();
        const node = (nodeType || '').toLowerCase();

        // Only show coaching for betting/raising decisions
        if (!this._isAggressiveAction(a)) return '';

        const isIP = node.includes('ip') || node.includes('btn') || node.includes('co');
        const isWet = texture && (texture.wet || texture.flushy || texture.monotone);
        const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'flush', 'straight', 'full_house'].includes(handToken);

        if (isIP && isWet && isStrong) {
            return 'Aggression coaching: IP on a wet board with a strong hand — maximum aggression. Bet/raise for value AND protection. Villain has draws that you need to charge.';
        }
        if (!isIP && isStrong) {
            return 'Aggression coaching: OOP with a strong hand — lead out or check-raise. Being OOP means you need to build the pot before villain can take a free card.';
        }
        return '';
    }

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
