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
    _getNodeLockingNote(handStrength, optimalAction, street) {
        // Only show occasionally as an educational note
        if (!this._sessionStats || this._sessionStats.total % 15 !== 0) return '';
        if (this._sessionStats.total < 15) return '';

        return 'GTO concept — Node Locking: in real solvers, you can "lock"villain\'s strategy at a node (e.g., force them to always fold) and re-solve to find the best exploit. This is how pros find maximum deviation from GTO against specific player types.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 168: ICM PRESSURE CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 168: ICM (Independent Chip Model) pressure explanation.
     */
    _getICMNote(stackDepth, handStrength, optimalAction, category = null) {
        // ICM only applies in tournament formats — never emit for cash games
        if (category !== 'MTT' && category !== 'SPINS') return '';
        // ICM notes shown for tournament-like stack depths
        if (!stackDepth || stackDepth > 60) return ''; // Only relevant at shorter stacks
        if (!this._sessionStats || this._sessionStats.total % 12 !== 0) return '';

        const a = (optimalAction || '').toLowerCase();
        if (a === 'f') {
            return 'Tournament concept — ICM: in tournaments, chips lost are worth more than chips won (diminishing marginal utility). This means folding borderline spots is more correct than in cash games. Survival is paramount near pay jumps.';
        }
        if (a.startsWith('r') || a === 'allin') {
            return 'Tournament concept — ICM pressure: raising and going all-in applies ICM pressure to opponents who can\'t afford to bust. Players with medium stacks near the bubble fold more than GTO dictates.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 169: BUBBLE FACTOR EXPLANATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 169: Explain bubble factor for tournament contexts.
     */
    _getBubbleFactorNote(stackDepth, category = null) {
        // Bubble factor only applies in tournament formats — never emit for cash games
        if (category !== 'MTT' && category !== 'SPINS') return '';
        if (!stackDepth || stackDepth > 50) return '';
        if (!this._sessionStats || this._sessionStats.total % 18 !== 0) return '';

        return 'Bubble Factor: the ratio of chip value when losing vs winning. On the bubble, losing your stack costs much more (in $ EV) than doubling up gains. A bubble factor of 2.0 means you need 2x the chip equity to call compared to a cash game. Tighten your calling range near the bubble.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 170: SHORT-STACK PUSH/FOLD
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 170: Push/fold ranges for short stacks.
     */
    _getPushFoldNote(stackDepth, heroHand, heroPosition, optimalAction) {
        if (!stackDepth || stackDepth > 15) return '';
        const a = (optimalAction || '').toLowerCase();

        if (stackDepth <= 8) {
            if (a.startsWith('r') || a === 'allin') {
                return `Push/fold mode (${stackDepth}BB): at this stack depth, open-raising is an all-in. Your fold equity + hand equity combined determines profitability. Push ranges are significantly wider from late position.`;
            }
            if (a === 'f') {
                return `Push/fold fold (${stackDepth}BB): even at short stacks, some hands are too weak to shove. Wait for a better spot — your fold equity decreases as your stack shrinks further.`;
            }
        }
        if (stackDepth <= 15) {
            if (a.startsWith('r') || a === 'allin') {
                return `Short-stack play (${stackDepth}BB): raise-folding becomes awkward at this depth. Consider whether your hand is strong enough to call a shove if 3-bet — if not, shoving preflop may be better.`;
            }
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 171: ANTE-ADJUSTED OPENING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 171: How antes change opening ranges.
     */
    _getAnteNote(potType) {
        if (!potType || !potType.toLowerCase().includes('ante')) return '';
        return 'Ante pot: antes increase the dead money in the pot, making steals more profitable. Open wider from all positions — the extra dead money shifts marginal folds into profitable opens.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 172: LIMP-RAISE TRAPPING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 172: Limp-raise trapping theory.
     */
    _getLimpRaiseNote(nodeType, optimalAction, handStrength) {
        const handToken = this._getHandToken(handStrength);
        if (!nodeType || !nodeType.includes('limp')) return '';
        const a = (optimalAction || '').toLowerCase();
        const isPremium = ['nuts', 'second_nuts'].includes(handToken) || handToken === 'premium_pair';

        if (a.startsWith('r') && isPremium) {
            return 'Limp-raise trap: limping in first with a premium hand, then raising over an isolator. This is an exploitative play that works against aggressive opponents who iso-raise frequently. In GTO, limping is generally avoided.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 173: COLD-CALLING RANGE THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 173: Cold-calling range construction.
     */
    _getColdCallNote(nodeType, optimalAction, heroPosition, villainPosition) {
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'call' || !nodeType || !nodeType.includes('facing_raise')) return '';

        const isIP = this._isInPosition(heroPosition, villainPosition);
        if (isIP) {
            return 'Cold-calling in position: your flatting range should be hands that play well postflop — suited broadways, medium pairs, suited connectors. These hands have implied odds and realize equity well IP.';
        }
        return 'Cold-calling out of position: be selective. Only call with hands that have strong postflop playability or can hit hard. Suited connectors and medium pairs are better than offsuit broadways OOP.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 174: ISOLATION RAISE THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 174: Isolation raise vs limpers.
     */
    _getIsoRaiseNote(nodeType, optimalAction, heroPosition, handStrength) {
        if (!nodeType || !nodeType.includes('bb_option') && !nodeType.includes('iso')) return '';
        const a = (optimalAction || '').toLowerCase();
        if (!a.startsWith('r')) return '';

        const isLatePos = ['CO', 'BTN', 'SB'].includes(heroPosition);
        if (isLatePos) {
            return 'Iso-raise from late position: isolating a limper with a wide range exploits their weak, passive range. Size 3-4x the big blind to ensure you go heads-up with position.';
        }
        return 'Iso-raise: raising over a limper to play heads-up with initiative. Your range should be tighter than a standard open since the limper has already shown interest.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 175: BLIND VS BLIND DYNAMICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 175: Special SB vs BB (blind vs blind) dynamics.
     */
    _getBlindVsBlindNote(heroPosition, villainPosition, nodeType, optimalAction) {
        const isBvB = (heroPosition === 'SB' && villainPosition === 'BB') || (heroPosition === 'BB' && villainPosition === 'SB');
        if (!isBvB) return '';
        const a = (optimalAction || '').toLowerCase();

        if (heroPosition === 'SB') {
            if (a.startsWith('r')) return 'SB vs BB: the most contested pot in poker. SB should open very wide (~65-80%) since only one opponent remains. Size 2.5x to steal efficiently.';
            if (a === 'f') return 'SB fold: even in BvB where ranges are wide, some hands are unprofitable to play OOP. This hand doesn\'t have enough playability to overcome the positional disadvantage.';
        }
        if (heroPosition === 'BB') {
            if (a === 'call') return 'BB defense vs SB: defend very wide here — the SB opens with a huge range, so your calling range should be equally wide. You\'re getting good pot odds with position postflop.';
            if (a.startsWith('r')) return 'BB 3-bet vs SB: 3-betting from the BB is highly effective against the SB\'s wide stealing range. Many of their hands can\'t continue vs a 3-bet.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 176: SCENARIO DIFFICULTY SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 176: Rate each question's difficulty 1-10 based on spot complexity.
     */
    scoreScenarioDifficulty(scenario, handActions) {
        let difficulty = 5; // Base difficulty

        // Mixed frequency increases difficulty
        const freqs = Object.values(handActions || {});
        const maxFreq = Math.max(...freqs, 0);
        if (maxFreq < 0.6) difficulty += 2; // Heavily mixed = harder
        else if (maxFreq < 0.8) difficulty += 1; // Somewhat mixed

        // Multi-way harder than HU
        if (scenario.potType && scenario.potType.toLowerCase().includes('multi')) difficulty += 1;

        // Later streets slightly harder
        if (scenario.street === 'turn') difficulty += 0.5;
        if (scenario.street === 'river') difficulty += 1;

        // 3-bet/4-bet pots harder
        if (scenario.potType && (scenario.potType.includes('3-Bet') || scenario.potType.includes('4-Bet'))) difficulty += 1;

        // Deep stacks add complexity
        if (scenario.stack_depth && scenario.stack_depth > 150) difficulty += 1;

        return Math.min(10, Math.max(1, Math.round(difficulty)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 177: MISTAKE CLASSIFICATION REFINEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 177: Refine mistake classification with EV-based magnitude.
     */
    classifyMistakeMagnitude(chosenAction, correctAction, handActions, actionEVs, estimatedPot = 0) {
        const chosenFreq = handActions?.[chosenAction] || 0;
        const correctFreq = handActions?.[correctAction] || 1;

        // Check if EV data available
        if (actionEVs && actionEVs[chosenAction] != null && actionEVs[correctAction] != null) {
            const evGap = actionEVs[correctAction] - actionEVs[chosenAction];
            // actionEVs are bb-scaled — convert the gap to a pot fraction before
            // comparing against the pot-fraction thresholds below
            const pot = estimatedPot || 0;
            const gapPctPot = pot > 0 ? evGap / pot : evGap;
            if (gapPctPot <= 0.02) return { classification: 'TRIVIAL', desc: 'Negligible EV difference — both plays are essentially equal.' };
            if (gapPctPot <= 0.10) return { classification: 'INACCURACY', desc: 'Small EV loss — acceptable in real-time play.' };
            if (gapPctPot <= 0.30) return { classification: 'MISTAKE', desc: 'Moderate EV loss — worth studying this spot.' };
            return { classification: 'BLUNDER', desc: 'Significant EV loss — this is a major leak to fix.' };
        }

        // Fallback to frequency-based
        if (chosenFreq >= 0.3) return { classification: 'INACCURACY', desc: 'Your action is a valid part of the mixed strategy, just not the most frequent.' };
        if (chosenFreq >= 0.1) return { classification: 'MISTAKE', desc: 'Your action exists in the solver\'s strategy but at low frequency.' };
        if (chosenFreq > 0) return { classification: 'MISTAKE', desc: 'Rarely taken action — the solver almost never plays this way.' };
        return { classification: 'BLUNDER', desc: 'This action is never in the solver\'s strategy — significant deviation from GTO.' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 178: STREAK-BASED MOTIVATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 178: Streak-based motivation messages.
     */
    getStreakMessage(currentStreak) {
        if (!currentStreak || currentStreak < 3) return null;
        if (currentStreak === 3) return '▲ 3 in a row! You\'re warming up!';
        if (currentStreak === 5) return '▲▲ 5-streak! Your GTO instincts are sharp!';
        if (currentStreak === 10) return '▲▲▲ 10 in a row! You\'re in the zone — GTO machine!';
        if (currentStreak === 15) return '15 streak! You\'re playing at an elite level!';
        if (currentStreak === 20) return '20 in a row! Solver-level accuracy — incredible!';
        if (currentStreak >= 25 && currentStreak % 5 === 0) return `${currentStreak} streak! You might be the best player in this training session ever!`;
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 179: HISTORICAL BEST TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 179: Track session bests for motivation.
     */
    recordSessionBest(metric, value) {
        if (!this._sessionBests) this._sessionBests = {};
        if (!this._sessionBests[metric] || value > this._sessionBests[metric]) {
            this._sessionBests[metric] = value;
            return true; // New record!
        }
        return false;
    }

    getSessionBests() {
        return this._sessionBests || {};
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 180: QUESTION TYPE DIVERSITY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 180: Track question type distribution to ensure variety.
     */
    recordQuestionType(type) {
        if (!this._questionTypeTracker) this._questionTypeTracker = {};
        this._questionTypeTracker[type] = (this._questionTypeTracker[type] || 0) + 1;
    }

    getUnderrepresentedTypes() {
        if (!this._questionTypeTracker) return [];
        const types = Object.entries(this._questionTypeTracker || {});
        if (types.length < 3) return [];
        const avg = types.reduce((s, [, ct]) => s + ct, 0) / types.length;
        return types.filter(([, ct]) => ct < avg * 0.5).map(([type]) => type);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 181: BOARD TEXTURE QUIZ DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 181: Generate board texture quiz — identify texture characteristics.
     */
    generateTextureQuiz(board) {
        if (!board || board.length < 3) return null;
        const texture = this._analyzeTexture(board);
        if (!texture) return null;

        const questions = [];
        questions.push({ q: 'Is this board wet or dry?', a: texture.wet ? 'Wet' : 'Dry', explain: texture.flushy || texture.monotone ? 'Flush draws present' : texture.straightDrawHeavy || texture.straightPossible ? 'Straight draws present' : 'No obvious draws' });
        questions.push({ q: 'Is a flush draw possible?', a: (texture.flushy || texture.monotone) ? 'Yes' : 'No', explain: texture.monotone ? 'Monotone board — flush already possible' : texture.flushy ? 'Three of one suit on board' : 'Not enough of one suit for a flush' });
        questions.push({ q: 'Is the board paired?', a: texture.paired ? 'Yes' : 'No', explain: texture.paired ? 'Board has a pair — full houses and trips possible' : 'No pair on board' });

        return questions;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 182: PREFLOP RANGE QUIZ DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 182: Generate preflop range quiz — is this hand in the opening range?
     */
    generateRangeQuiz(position) {
        const ranges = {
            'UTG': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs'],
            'HJ': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'KQs', 'KQo', 'KJs', 'QJs', 'JTs'],
            'CO': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'A9s', 'KQs', 'KQo', 'KJs', 'QJs', 'JTs', 'T9s'],
            'SB': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'A9s', 'KQs', 'KQo', 'KJs', 'QJs', 'JTs', 'T9s'],
            'BTN': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s', 'KQs', 'KQo', 'KJs', 'KJo', 'KTs', 'K9s', 'QJs', 'QJo', 'QTs', 'Q9s', 'JTs', 'J9s', 'T9s', 'T8s', '98s', '87s', '76s', '65s'],
        };
        const range = ranges[position] || ranges['CO'];

        // Generate 5 random quiz hands
        const allHands = ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
            'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'ATo', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
            'KQs', 'KQo', 'KJs', 'KJo', 'KTs', 'K9s', 'K8s', 'QJs', 'QJo', 'QTs', 'Q9s',
            'JTs', 'J9s', 'T9s', 'T8s', '98s', '97s', '87s', '76s', '65s', '54s',
            'J8o', 'T7o', '96o', '85o', '74o', '63o', '52o'];

        const quizHands = [];
        const used = new Set();
        while (quizHands.length < 5 && quizHands.length < allHands.length) {
            const idx = Math.floor(Math.random() * allHands.length);
            if (used.has(idx)) continue;
            used.add(idx);
            const hand = allHands[idx];
            quizHands.push({ hand, inRange: range.includes(hand), position });
        }
        return quizHands;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 183: POT ODDS QUIZ DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 183: Generate pot odds quiz scenarios.
     */
    generatePotOddsQuiz() {
        const scenarios = [
            { pot: 10, bet: 5, outs: 9, street: 'turn', answer: 'Call', explain: '9 outs × 2 = 18% equity. Need 5/(10+5+5) = 25%. Close but implied odds make it a call.' },
            { pot: 20, bet: 10, outs: 8, street: 'flop', answer: 'Call', explain: '8 outs × 4 = 32% equity (2 streets). Need 10/(20+10+10) = 25%. Easy call.' },
            { pot: 15, bet: 15, outs: 4, street: 'turn', answer: 'Fold', explain: '4 outs × 2 = 8% equity. Need 15/(15+15+15) = 33%. Way too expensive.' },
            { pot: 30, bet: 10, outs: 15, street: 'flop', answer: 'Raise', explain: '15 outs × 4 = 60% equity. You\'re a favorite — raise for value!' },
            { pot: 8, bet: 8, outs: 6, street: 'turn', answer: 'Fold', explain: '6 outs × 2 = 12% equity. Need 8/(8+8+8) = 33%. Not enough equity to call.' },
        ];
        return scenarios[Math.floor(Math.random() * scenarios.length)];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 184: MIXED STRATEGY EXPLANATION ENHANCEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 184: Enhanced explanation for mixed strategy spots.
     */
    _getMixedStrategyNote(handActions, optimalAction, freq) {
        if (!handActions || freq >= 0.9) return ''; // Pure strategy — no mixing
        const actions = Object.entries(handActions || {}).filter(([, f]) => f > 0.05);
        if (actions.length < 2) return '';

        const sorted = actions.sort((a, b) => b[1] - a[1]);
        if (sorted.length === 2) {
            const [a1, f1] = sorted[0];
            const [a2, f2] = sorted[1];
            const label1 = this._actionLabel(a1);
            const label2 = this._actionLabel(a2);
            if (Math.abs(f1 - f2) < 0.15) {
                return `Nearly even split: solver uses ${label1} ${(f1 * 100).toFixed(0)}% and ${label2} ${(f2 * 100).toFixed(0)}%. Both plays are close in EV — in practice, either is acceptable. The mix exists for balance.`;
            }
            return `Mixed strategy: ${label1} ${(f1 * 100).toFixed(0)}% is preferred over ${label2} ${(f2 * 100).toFixed(0)}%. The less frequent action keeps your range balanced but isn't required for most players.`;
        }
        if (sorted.length >= 3) {
            return `Complex mixed spot: solver splits between ${sorted.length} actions. The primary play (${this._actionLabel(sorted[0][0])} ${(sorted[0][1] * 100).toFixed(0)}%) is a safe default. Mixing is mainly for GTO balance at high levels.`;
        }
        return '';
    }

    _actionLabel(action) {
        if (!action) return 'unknown';
        const a = action.toLowerCase();
        if (a === 'f') return 'fold';
        if (a === 'call') return 'call';
        if (a === 'x' || a === 'check') return 'check';
        if (a === 'allin') return 'all-in';
        if (a.startsWith('r')) return `raise ${a.slice(1)}%`;
        return action;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 185: USER VS SOLVER FREQUENCY COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 185: Track user's action frequencies vs solver's.
     */
    recordUserAction(action, solverAction, street, nodeType) {
        if (!this._freqComparison) this._freqComparison = {};
        const key = `${street}:${nodeType || 'general'}`;
        if (!this._freqComparison[key]) this._freqComparison[key] = { userActions: {}, solverActions: {} };

        const ua = this._normalizeAction(action);
        const sa = this._normalizeAction(solverAction);
        this._freqComparison[key].userActions[ua] = (this._freqComparison[key].userActions[ua] || 0) + 1;
        this._freqComparison[key].solverActions[sa] = (this._freqComparison[key].solverActions[sa] || 0) + 1;
    }

    _normalizeAction(action) {
        if (!action) return 'unknown';
        const a = action.toLowerCase();
        if (a === 'f') return 'fold';
        if (a === 'call') return 'call';
        if (a === 'x' || a === 'check') return 'check';
        if (this._isAggressiveAction(a)) return 'raise';
        return a;
    }

    getFrequencyComparison() {
        if (!this._freqComparison) return null;
        const result = {};
        for (const [key, data] of Object.entries(this._freqComparison || {})) {
            const userTotal = Object.values(data.userActions || {}).reduce((s, v) => s + v, 0);
            const solverTotal = Object.values(data.solverActions || {}).reduce((s, v) => s + v, 0);
            if (userTotal < 3) continue;
            result[key] = {
                user: Object.fromEntries(Object.entries(data.userActions || {}).map(([a, ct]) => [a, ((ct / userTotal) * 100).toFixed(0) + '%'])),
                solver: Object.fromEntries(Object.entries(data.solverActions || {}).map(([a, ct]) => [a, ((ct / solverTotal) * 100).toFixed(0) + '%'])),
            };
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 186: OPPONENT MODELING BASICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 186: Basic opponent type identification note.
     */
    _getOpponentModelNote(nodeType, street) {
        if (!this._sessionStats || this._sessionStats.total % 20 !== 0) return '';
        if (this._sessionStats.total < 20) return '';

        return 'Opponent modeling: in real games, categorize opponents. TAG (Tight-Aggressive): plays few hands, bets strong — respect their bets. LAG (Loose-Aggressive): plays many hands aggressively — widen your calling range. Nit: folds too much — bluff more. Fish: calls too much — value bet wider, bluff less.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 187: LEAK FINDER REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 187: Generate a detailed leak finder report.
     */
    generateLeakFinderReport() {
        const deviations = this.getDeviationSummary();
        const aggression = this.getAggressionFactors();
        const preflopStats = this.getPreflopStats();
        const positional = this.getPositionalAwarenessScore();
        const concepts = this.getConceptMastery();

        const leaks = [];

        // Check deviations
        if (deviations) {
            if (parseInt(deviations.overFoldPct) > 20) leaks.push({ leak: 'Over-folding', severity: 'HIGH', fix: 'Study pot odds and MDF. You\'re folding too many hands that have enough equity to continue.' });
            if (parseInt(deviations.overCallPct) > 20) leaks.push({ leak: 'Over-calling', severity: 'HIGH', fix: 'Tighten calling ranges, especially on the river. Learn to let go of medium-strength hands.' });
            if (parseInt(deviations.overRaisePct) > 20) leaks.push({ leak: 'Over-raising', severity: 'MEDIUM', fix: 'Sometimes calling or checking is better than raising. Not every hand needs to be played aggressively.' });
        }

        // Check aggression
        for (const [street, data] of Object.entries(aggression || {})) {
            if (data.assessment === 'too passive') leaks.push({ leak: `Too passive on ${street}`, severity: 'MEDIUM', fix: `Increase your betting and raising frequency on the ${street}. Passive play lets opponents realize equity for free.` });
            if (data.assessment === 'too aggressive') leaks.push({ leak: `Over-aggressive on ${street}`, severity: 'MEDIUM', fix: `Dial back aggression on the ${street}. Not every hand should be bet — some are better as checks/calls.` });
        }

        // Check preflop stats
        if (preflopStats) {
            if (parseFloat(preflopStats.vpip) > 35) leaks.push({ leak: 'Playing too many hands preflop', severity: 'HIGH', fix: 'Tighten your preflop range. Focus on quality hands and position.' });
            if (parseFloat(preflopStats.gap) > 15) leaks.push({ leak: 'Large VPIP/PFR gap (too much cold-calling)', severity: 'MEDIUM', fix: 'Instead of flat-calling, consider 3-betting or folding. Cold-calling creates dominated spots.' });
        }

        // Check concept mastery
        for (const [concept, data] of Object.entries(concepts || {})) {
            if (data.mastery === 'needs_work') leaks.push({ leak: `Weak at: ${concept.replace(/_/g, ' ')}`, severity: 'MEDIUM', fix: `Focus study on ${concept.replace(/_/g, ' ')} spots. Review solver solutions for this category.` });
        }

        return { leaks: leaks.slice(0, 8), totalLeaksFound: leaks.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 188: SESSION PACING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 188: Track time per question for pacing analysis.
     */
    recordQuestionTiming(questionNumber, timeMs) {
        if (!this._timingData) this._timingData = [];
        this._timingData.push({ question: questionNumber, timeMs, timestamp: Date.now() });
    }

    getTimingAnalysis() {
        if (!this._timingData || this._timingData.length < 5) return null;
        const times = this._timingData.map(t => t.timeMs);
        const avg = times.reduce((s, v) => s + v, 0) / times.length;
        const fastest = Math.min(...times);
        const slowest = Math.max(...times);
        const recent5 = times.slice(-5);
        const recentAvg = recent5.reduce((s, v) => s + v, 0) / recent5.length;

        return {
            avgTimeMs: Math.round(avg),
            avgTimeSec: (avg / 1000).toFixed(1) + 's',
            fastest: (fastest / 1000).toFixed(1) + 's',
            slowest: (slowest / 1000).toFixed(1) + 's',
            recentAvg: (recentAvg / 1000).toFixed(1) + 's',
            trend: recentAvg < avg * 0.8 ? 'speeding_up' : recentAvg > avg * 1.2 ? 'slowing_down' : 'consistent',
            assessment: avg < 5000 ? 'Quick decisions — make sure you\'re thinking it through, not just guessing.' :
                avg < 15000 ? 'Good pace — taking enough time to think but not overthinking.' :
                'Taking a while — try to identify the key factors faster. Pattern recognition will come with practice.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 189: CONFIDENCE CALIBRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 189: Track user confidence vs actual correctness.
     */
    recordConfidence(questionNumber, confidenceLevel, isCorrect) {
        if (!this._confidenceData) this._confidenceData = [];
        this._confidenceData.push({ question: questionNumber, confidence: confidenceLevel, correct: isCorrect });
    }

    getConfidenceCalibration() {
        if (!this._confidenceData || this._confidenceData.length < 10) return null;
        const byConfidence = {};
        for (const d of this._confidenceData) {
            const bucket = d.confidence >= 80 ? 'high' : d.confidence >= 50 ? 'medium' : 'low';
            if (!byConfidence[bucket]) byConfidence[bucket] = { total: 0, correct: 0 };
            byConfidence[bucket].total++;
            if (d.correct) byConfidence[bucket].correct++;
        }

        const result = {};
        for (const [bucket, data] of Object.entries(byConfidence || {})) {
            const accuracy = (data.correct / data.total * 100).toFixed(0);
            result[bucket] = {
                accuracy: accuracy + '%',
                total: data.total,
                calibrated: bucket === 'high' ? parseInt(accuracy) >= 70 : bucket === 'low' ? parseInt(accuracy) <= 40 : true,
            };
        }

        const overconfident = result.high && !result.high.calibrated;
        const underconfident = result.low && !result.low.calibrated && parseInt(result.low.accuracy) > 50;

        return {
            buckets: result,
            assessment: overconfident ? 'Overconfident: you\'re confident on questions you\'re getting wrong. Slow down and double-check.' :
                underconfident ? 'Underconfident: you\'re second-guessing yourself on questions you know. Trust your instincts more.' :
                'Well-calibrated: your confidence matches your accuracy.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 190: HAND HISTORY REPLAY DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 190: Generate hand history replay format for review.
     */
    recordHandForReplay(scenario, heroHand, board, chosenAction, correctAction, explanation) {
        if (!this._handHistory) this._handHistory = [];
        this._handHistory.push({
            id: this._handHistory.length + 1,
            timestamp: Date.now(),
            street: scenario.street,
            heroHand,
            board: board ? [...board] : [],
            heroPosition: scenario.heroPosition,
            villainPosition: scenario.villainPosition,
            nodeType: scenario.nodeType,
            potType: scenario.potType,
            chosenAction,
            correctAction,
            isCorrect: chosenAction === correctAction,
            explanation: explanation || '',
        });
    }

    getHandHistory() { return this._handHistory || []; }

    getFilteredHandHistory(filter) {
        const history = this._handHistory || [];
        if (!filter) return history;
        return history.filter(h => {
            if (filter.street && h.street !== filter.street) return false;
            if (filter.correctOnly && !h.isCorrect) return false;
            if (filter.mistakesOnly && h.isCorrect) return false;
            if (filter.position && h.heroPosition !== filter.position) return false;
            return true;
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 191: CUSTOM DRILL CREATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 191: Allow users to create custom drills for specific spots.
     */
    createCustomDrill(config) {
        if (!this._customDrills) this._customDrills = [];
        const drill = {
            id: this._customDrills.length + 1,
            name: config.name || `Drill ${this._customDrills.length + 1}`,
            filters: {
                streets: config.streets || ['flop', 'turn', 'river'],
                positions: config.positions || null,
                nodeTypes: config.nodeTypes || null,
                handStrengths: config.handStrengths || null,
                difficulty: config.difficulty || null,
            },
            questionsPerSession: config.questionsPerSession || 20,
            created: Date.now(),
        };
        this._customDrills.push(drill);
        return drill;
    }

    getCustomDrills() { return this._customDrills || []; }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 192: PROGRESSIVE COMPLEXITY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 192: Progressive complexity system — start simple, build up.
     */
    getProgressiveLevel() {
        if (!this._sessionStats) return 1;
        const total = this._sessionStats.total || 0;
        const accuracy = total > 0 ? this._sessionStats.correct / total : 0;

        if (total < 10) return 1; // Beginner: pure strategy spots
        if (total < 25 && accuracy >= 0.6) return 2; // Intermediate: some mixed
        if (total < 50 && accuracy >= 0.65) return 3; // Advanced: mixed + multi-street
        if (accuracy >= 0.7) return 4; // Expert: all spot types
        return Math.max(1, Math.min(4, Math.floor(accuracy * 5)));
    }

    getProgressiveLevelDescription() {
        const level = this.getProgressiveLevel();
        const descs = {
            1: { name: 'Foundation', desc: 'Pure strategy spots — clear correct answers. Building basic GTO instincts.' },
            2: { name: 'Developing', desc: 'Introducing mixed strategies and positional play. Learning when the solver splits actions.' },
            3: { name: 'Advanced', desc: 'Complex multi-street scenarios, multi-way pots, and tight mixed spots.' },
            4: { name: 'Expert', desc: 'Full solver complexity — close EV spots, complex board interactions, multi-street planning.' },
        };
        return descs[level] || descs[1];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 193: CROSS-STREET CONSISTENCY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 193: Check if user's line makes sense across streets.
     */
    _getCrossStreetConsistencyNote(street, nodeType, optimalAction, handStrength) {
        if (street === 'preflop' || street === 'flop') return '';
        // On turn/river, comment on whether the line is consistent
        const a = (optimalAction || '').toLowerCase();
        const node = (nodeType || '').toLowerCase();

        if (street === 'turn' && a.startsWith('r') && node.includes('check')) {
            return 'Line consistency: checking the flop then betting the turn is a well-known "delayed c-bet" line. It tells a consistent story — you checked to trap or control the pot, then bet when the turn changed things.';
        }
        if (street === 'river' && a.startsWith('r')) {
            return 'Cross-street consistency: triple-barreling (betting all three streets) is a polarized line. Make sure your story is consistent — did each card justify continued aggression?';
        }
        if (street === 'river' && a === 'x' && node.includes('bet')) {
            return 'Line change: betting earlier then checking the river can mean your hand has showdown value but can\'t bet for value (only better calls, worse folds). This is a natural endpoint for many medium-strength hands.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 194: RANGE VS SPECIFIC HAND THINKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 194: Encourage range-based thinking over hand-based thinking.
     */
    _getRangeThinkingNote(street, handStrength) {
        if (!this._sessionStats || this._sessionStats.total % 10 !== 0) return '';
        if (this._sessionStats.total < 10) return '';

        return 'Think in ranges, not hands: instead of asking "what does villain have?", ask "what does villain\'s RANGE look like?". GTO strategy is about balancing your range — not reading a specific hand. Every decision should consider how your entire range plays, not just this one hand.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 195: SOLVER APPROXIMATION TRANSPARENCY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 195: Note how close our answer is to a real solver.
     */
    _getSolverApproximationNote(freq, handActions) {
        if (!handActions) return '';
        const actions = Object.entries(handActions || {}).filter(([, f]) => f > 0.01);
        if (actions.length <= 1) return ''; // Pure strategy — high confidence

        const maxFreq = Math.max(...actions.map(([, f]) => f));
        if (maxFreq >= 0.9) return 'Solver confidence: HIGH — this is a near-pure strategy. The solver almost always takes this action.';
        if (maxFreq >= 0.7) return 'Solver confidence: MEDIUM — this is the preferred action but alternatives exist. In-game, defaulting to the highest-frequency action is correct.';
        return 'Solver confidence: LOW — this is a heavily mixed spot. Multiple actions have similar EV. Don\'t stress about getting the "right" answer in mixed spots.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 196: PRE-ACTION THOUGHT PROMPTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 196: Generate thought prompts for players to consider before deciding.
     */
    generateThoughtPrompts(scenario, heroHand, board) {
        const prompts = [];
        const street = scenario.street || 'flop';

        if (street === 'preflop') {
            prompts.push('What position am I in?');
            prompts.push('What is the action behind me?');
            prompts.push('Is my hand in my range for this action?');
        } else {
            prompts.push('What is the board texture?');
            prompts.push('Am I in position or out of position?');
            prompts.push('What is the stack-to-pot ratio?');
            if (street === 'flop') prompts.push('Who has the range advantage on this board?');
            if (street === 'turn') prompts.push('How did the turn card change the board dynamic?');
            if (street === 'river') prompts.push('Is my hand good enough to bet for value? Or should I check?');
            prompts.push('What would my range look like here? Am I balanced?');
        }
        return prompts;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 197: POST-HAND ANALYSIS FRAMEWORK
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 197: Framework for analyzing a hand after it's played.
     */
    generatePostHandAnalysis(scenario, heroHand, board, chosenAction, correctAction, handActions) {
        const analysis = {
            decision: chosenAction === correctAction ? 'Correct' : 'Incorrect',
            solverFrequency: handActions?.[correctAction] ? (handActions[correctAction] * 100).toFixed(0) + '%' : 'N/A',
            chosenFrequency: handActions?.[chosenAction] ? (handActions[chosenAction] * 100).toFixed(0) + '%' : '0%',
            keyFactors: [],
            alternativeLines: [],
        };

        // Key factors
        if (scenario.street !== 'preflop') {
            analysis.keyFactors.push('Board texture');
            analysis.keyFactors.push('Position');
            analysis.keyFactors.push('Stack depth / SPR');
        }
        analysis.keyFactors.push('Hand strength relative to range');
        analysis.keyFactors.push('Villain\'s likely range given the action');

        // Alternative lines
        const alts = Object.entries(handActions || {}).filter(([a, f]) => f > 0.1 && a !== correctAction).sort((a, b) => b[1] - a[1]);
        for (const [a, f] of alts.slice(0, 2)) {
            analysis.alternativeLines.push({ action: this._actionLabel(a), frequency: (f * 100).toFixed(0) + '%' });
        }

        return analysis;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 198: MENTAL GAME COACHING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 198: Mental game coaching notes — tilt control, focus, etc.
     */
    getMentalGameNote() {
        if (!this._sessionStats || this._sessionStats.total < 10) return null;
        const recent = (this._recentResults || []).slice(-5);
        const recentWrong = recent.filter(r => !r).length;

        if (recentWrong >= 4) {
            return 'Mental game check: 4 of your last 5 answers were incorrect. This might be tilt creeping in — take a deep breath, refocus on the fundamentals. Quality of study matters more than quantity.';
        }
        if (recentWrong >= 3) {
            return 'Tough stretch — don\'t let frustration affect your next decision. Each question is independent. Reset and focus on the current hand only.';
        }

        // Periodic mental game tips
        const total = this._sessionStats.total;
        if (total === 30) return '30 questions in! Stay focused — fatigue can creep in. Take a short break if you need it.';
        if (total === 50) return '50 questions! Great session length. Studies show GTO training is most effective in 30-60 minute sessions.';
        if (total === 75) return 'Long session! Your concentration may be waning. Consider wrapping up and reviewing your session report.';

        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 199: BANKROLL MANAGEMENT NOTES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 199: Bankroll management integration.
     */
    getBankrollNote() {
        if (!this._sessionStats || this._sessionStats.total % 25 !== 0) return null;
        if (this._sessionStats.total < 25) return null;

        const accuracy = this._sessionStats.correct / this._sessionStats.total;
        if (accuracy >= 0.75) {
            return 'Bankroll tip: with your accuracy level, you should be profitable at the tables. The standard recommendation is 20-30 buy-ins for cash games and 100+ for tournaments.';
        }
        if (accuracy >= 0.55) {
            return 'Bankroll tip: you\'re developing solid fundamentals. Focus on building a bankroll of 30+ buy-ins before moving up in stakes. Proper bankroll management prevents going broke during downswings.';
        }
        return 'Bankroll tip: while you\'re still building your GTO knowledge, play at stakes where losses won\'t affect your bankroll significantly. Study is more important than playing right now.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 200: FINAL ENGINE OPTIMIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 200: Engine summary and optimization utilities.
     * - Clear session data for fresh starts
     * - Engine health check
     * - Version info
     */
    resetSession() {
        this._sessionStats = { total: 0, correct: 0 };
        this._mistakeTracker = {};
        this._recentResults = [];
        this._deviationTracker = null;
        this._conceptMastery = {};
        this._spacedRepetition = [];
        this._evGraphData = [];
        this._aggressionTracker = {};
        this._preflopStats = { hands: 0, vpip: 0, pfr: 0 };
        this._positionalAwareness = {};
        this._questionTypeTracker = {};
        this._timingData = [];
        this._confidenceData = [];
        this._handHistory = [];
        this._sessionBests = {};
        this._freqComparison = {};
        this._challengeMode = null;
        this._achievements = new Set();
        this._trainingCalendar = {};
        this._cumulativeDeviationCost = null;
        this._explanationRatings = [];
        this._customDrills = [];
        this._scenarioTags = {};
    }

    getEngineHealth() {
        const statsCount = this._sessionStats?.total || 0;
        const trackerDims = this._mistakeTracker ? Object.keys(this._mistakeTracker || {}).length : 0;
        const concepts = this._conceptMastery ? Object.keys(this._conceptMastery || {}).length : 0;
        const historySize = (this._handHistory || []).length;

        return {
            status: 'healthy',
            version: '4.2.0-phase350',
            questionsAnswered: statsCount,
            mistakeTrackerDimensions: trackerDims,
            conceptsTracked: concepts,
            handHistorySize: historySize,
            memoryEstimate: `~${Math.round((historySize * 200 + trackerDims * 50 + concepts * 30) / 1024)}KB`,
            features: 350,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 201: EQUITY BUCKET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 201: Analyze how equity distributes across action choices.
     * Helps understand why solver splits between actions.
     */
    _getEquityBucketNote(handStrength, optimalAction, handActions) {
        if (!handActions) return '';
        const actions = Object.entries(handActions || {}).filter(([, f]) => f > 0.05);
        if (actions.length < 2) return '';

        const strengthOrder = {
            'nuts': 95, 'second_nuts': 90, 'full_house': 88, 'flush': 82, 'straight': 78,
            'set': 75, 'trips': 72, 'two_pair': 65, 'overpair': 60, 'top_pair_top_kicker': 55,
            'top_pair': 50, 'top_pair_weak_kicker': 45, 'middle_pair': 35, 'second_pair': 30,
            'third_pair': 25, 'bottom_pair': 20, 'weak_pair': 20, 'underpair': 18, 'ace_high': 15,
            'overcards': 15, 'high_card': 10, 'air': 10,
            'combo_draw': 55, 'oesd': 40, 'flush_draw': 38, 'gutshot': 20, 'missed_draw': 5,
        };
        const equity = strengthOrder[this._getHandToken(handStrength)] ?? 30;

        if (equity >= 70) return 'Equity bucket: TOP — your hand is in the strongest portion of your range. This equity bucket almost always bets for value. The question is sizing, not whether to bet.';
        if (equity >= 45) return 'Equity bucket: MIDDLE — your hand has decent equity but isn\'t a clear value bet or fold. These hands often check for pot control or bet small as a merge.';
        if (equity >= 25) return 'Equity bucket: BOTTOM of made hands — marginal showdown value. In GTO, these are natural check/calls on most streets or bluff candidates on the river.';
        return 'Equity bucket: AIR — no real showdown value. This is the bluff portion of your range. The solver uses these hands as bluffs to balance the value bets.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 202: RANGE MORPHOLOGY TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 202: Track how ranges change shape street by street.
     */
    _getRangeMorphologyNote(street, nodeType, handStrength) {
        const handToken = this._getHandToken(handStrength);
        if (street === 'preflop') return '';

        if (street === 'flop') {
            return 'Range shape (flop): both ranges are still wide. The PFR has an overpair/big card advantage, the caller has more suited connectors and medium pairs. Ranges begin to narrow based on the flop texture.';
        }
        if (street === 'turn') {
            const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'flush', 'straight'].includes(handToken);
            if (isStrong) return 'Range shape (turn): ranges have narrowed significantly. Weak hands have folded, and remaining ranges are polarized — strong hands and draws vs medium hands and bluffs.';
            return 'Range shape (turn): by the turn, ranges are much narrower. Players who continued from the flop have shown interest — expect stronger average hand strength from both sides.';
        }
        if (street === 'river') {
            return 'Range shape (river): maximally narrowed. Draws have either hit or missed. Remaining ranges are highly polarized — the nuts/strong value vs bluff-catchers vs bluffs. No more drawing equity to consider.';
        }
        return '';
    }

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
