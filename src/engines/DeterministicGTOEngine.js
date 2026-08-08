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

        if (entries.length === 0) return { summary: 'Not enough data to generate a summary.', weaknesses: [], strengths: [], totalQuestions: 0 };

        // Separate weaknesses and strengths
        const weaknesses = entries.filter(e => e.mistakeRate >= 0.35).slice(0, 5);
        const strengths = entries.filter(e => e.mistakeRate <= 0.15 && e.total >= 5).slice(0, 3);

        // Total questions from session stats
        const totalQuestions = this._sessionStats?.total || 0;

        // Build human-readable descriptions
        const describeKey = (key) => {
            const [type, value] = key.includes(':') ? key.split(':') : [key, ''];
            if (type === 'street') return `${value} decisions`;
            if (type === 'hand') return `playing ${value.replace(/_/g, ' ')} hands`;
            if (type === 'action') return `${value} decisions`;
            if (type === 'node') return value === 'hero_faces_bet' ? 'facing bets' : value === 'hero_bets_or_checks' ? 'bet/check decisions' : 'facing raises';
            if (type === 'spot') return `${value.replace(/_/g, ' ')} spots`;
            // Compound keys
            if (key.includes(':')) {
                const parts = key.split(':');
                return `${parts[0].replace(/_/g, ' ')} + ${parts[1].replace(/_/g, ' ')}`;
            }
            return key;
        };

        const weaknessDescriptions = weaknesses.map(w => ({
            ...w,
            description: describeKey(w.key),
            accuracyPct: Math.round(w.accuracy * 100),
            mistakeRatePct: Math.round(w.mistakeRate * 100),
        }));

        const strengthDescriptions = strengths.map(s => ({
            ...s,
            description: describeKey(s.key),
            accuracyPct: Math.round(s.accuracy * 100),
        }));

        // Build summary text
        const summaryParts = [];
        if (totalQuestions > 0) {
            const overallAcc = this._sessionStats ? Math.round((this._sessionStats.correct / this._sessionStats.total) * 100) : 0;
            summaryParts.push(`Session: ${totalQuestions} questions, ${overallAcc}% overall accuracy.`);
        }

        if (weaknessDescriptions.length > 0) {
            summaryParts.push('Areas to improve:');
            weaknessDescriptions.forEach((w, i) => {
                summaryParts.push(`${i + 1}. ${w.description} — ${w.mistakeRatePct}% mistake rate (${w.total} samples)`);
            });
        }

        if (strengthDescriptions.length > 0) {
            summaryParts.push('Strengths:');
            strengthDescriptions.forEach(s => {
                summaryParts.push(`✓ ${s.description} — ${s.accuracyPct}% accuracy`);
            });
        }

        // Improvement suggestions based on top weakness
        if (weaknessDescriptions.length > 0) {
            const topWeak = weaknessDescriptions[0];
            let suggestion = '';
            if (topWeak.key.includes('fold')) suggestion = 'Focus on pot odds calculations — you may be folding too often in spots where calling is profitable.';
            else if (topWeak.key.includes('river')) suggestion = 'River play is your biggest leak — study polarization (value vs. bluff) and bluff-catching frequencies.';
            else if (topWeak.key.includes('turn')) suggestion = 'Turn decisions need work — focus on when to continue barreling vs. pot-controlling with medium hands.';
            else if (topWeak.key.includes('draw') || topWeak.key.includes('flush_draw')) suggestion = 'Draw play is a weakness — practice pot odds, implied odds, and semi-bluff sizing decisions.';
            else if (topWeak.key.includes('air') || topWeak.key.includes('bluff')) suggestion = 'Bluffing decisions need refinement — look for hands with blockers and no showdown value for optimal bluffs.';
            else if (topWeak.key.includes('top_pair')) suggestion = 'Top pair play needs work — focus on kicker strength, board texture, and when to slow down vs. bet for value.';
            else suggestion = `Focus on ${topWeak.description} — review the solver explanations in these spots and look for patterns in your mistakes.`;

            summaryParts.push(`Suggestion: ${suggestion}`);
        }

        return {
            summary: summaryParts.join('\n'),
            weaknesses: weaknessDescriptions,
            strengths: strengthDescriptions,
            totalQuestions,
        };
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 91: PREFLOP HAND EQUITY TIERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 91: Classify preflop hands into equity tiers for explanation context.
     * Provides approximate all-in equity vs. typical ranges to help players
     * understand WHY certain hands are opens/3bets/folds.
     *
     * @param {string} heroHand - Hand notation (e.g., "AKs")
     * @returns {Object} { tier: string, equityVsRandom: number, description: string }
     */
    _getPreflopHandTier(heroHand) {
        if (!heroHand || heroHand.length < 2) return { tier: 'unknown', equityVsRandom: 50, description: '' };

        const r1 = heroHand[0].toUpperCase();
        const r2 = heroHand[1].toUpperCase();
        const suffix = heroHand.length >= 3 ? heroHand[2] : '';
        const isPair = r1 === r2;
        const isSuited = suffix === 's';
        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const v1 = rankVal(r1), v2 = rankVal(r2);
        const highVal = Math.max(v1, v2);
        const lowVal = Math.min(v1, v2);

        // Approximate equity vs random hand (simplified)
        let eq;
        if (isPair) {
            // Pairs: AA~85%, KK~82%, QQ~80%, JJ~77%, TT~75%, 99~72%, 88~69%, 77~66%, etc.
            eq = 50 + (v1 * 2.7);
        } else if (isSuited) {
            // Suited: AKs~67%, AQs~66%, KQs~63%, T9s~56%, 76s~52%
            eq = 46 + (highVal * 1.0) + (lowVal * 0.5) + 2;
        } else {
            // Offsuit: AKo~65%, AQo~64%, KQo~61%, T9o~54%, 76o~50%
            eq = 44 + (highVal * 1.0) + (lowVal * 0.5);
        }

        // Clamp
        eq = Math.min(87, Math.max(33, eq));

        // Tier classification
        let tier, description;
        if (eq >= 78) { tier = 'premium'; description = 'top-tier hand — always play aggressively'; }
        else if (eq >= 66) { tier = 'strong'; description = 'strong hand with high raw equity'; }
        else if (eq >= 58) { tier = 'playable'; description = 'solid playable hand with good equity'; }
        else if (eq >= 52) { tier = 'marginal'; description = 'marginal hand — position and context matter most'; }
        else { tier = 'speculative'; description = 'speculative hand — needs suitedness/connectivity to justify playing'; }

        return { tier, equityVsRandom: Math.round(eq), description };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 92: EV COMPARISON IN EXPLANATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 92: When EV data is available, add EV comparison context to explanations.
     * Shows the EV difference between the optimal action and alternatives.
     *
     * @param {string} optimalAction - Best action
     * @param {Object} actionEVs - Map of action → EV
     * @param {number} estimatedPot - Pot size
     * @returns {string} EV comparison note
     */
    _getEVComparisonNote(optimalAction, actionEVs, estimatedPot) {
        if (!actionEVs || !optimalAction) return '';
        const optEV = actionEVs[optimalAction];
        if (optEV === undefined || optEV === null) return '';

        // Find the second-best action for comparison
        const sorted = Object.entries(actionEVs || {})
            .filter(([a, _]) => a !== optimalAction)
            .sort(([_, ev1], [__, ev2]) => ev2 - ev1);

        if (sorted.length === 0) return '';
        const [secondAction, secondEV] = sorted[0];
        const evDiff = optEV - secondEV;

        if (evDiff <= 0) return ''; // No meaningful EV advantage

        const secondLabel = this.getActionLabelGTOW(secondAction);

        // Express EV diff relative to pot
        if (estimatedPot && estimatedPot > 0) {
            const diffAsPct = ((evDiff / estimatedPot) * 100).toFixed(1);
            if (evDiff >= estimatedPot * 0.15) {
                return `EV context: this action is significantly higher EV — ${diffAsPct}% of pot better than ${secondLabel}. Clear best play.`;
            }
            if (evDiff >= estimatedPot * 0.05) {
                return `EV context: ${diffAsPct}% pot EV edge over ${secondLabel}. Meaningful but not huge — a close spot where execution matters.`;
            }
            if (evDiff < estimatedPot * 0.02) {
                return `EV context: essentially break-even between top actions (${diffAsPct}% pot difference). Both are viable in practice.`;
            }
        }

        // Absolute EV diff
        if (evDiff >= 2.0) {
            return `EV context: ${evDiff.toFixed(1)}bb better than ${secondLabel}. Clear best action.`;
        }
        if (evDiff >= 0.5) {
            return `EV context: ${evDiff.toFixed(1)}bb edge over ${secondLabel}. Meaningful EV difference.`;
        }
        if (evDiff < 0.2) {
            return `EV context: only ${evDiff.toFixed(2)}bb separates the top actions — razor-thin margin. Mixed strategy is natural here.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 93: CHECK-RAISE STRATEGY CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 93: Explain check-raise strategy when hero faces a bet and raises.
     * Check-raises are complex because they serve multiple purposes:
     *   - Value: extracting maximum with strong hands
     *   - Semi-bluff: using fold equity with draws
     *   - Range balance: preventing villain from betting with impunity
     *   - Pot building: getting more money in OOP with strong hands
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {string} nodeType - Node type
     * @param {Object} texture - Board texture
     * @returns {string} Check-raise context note
     */
    _getCheckRaiseNote(optimalAction, handStrength, street, nodeType, texture) {
        const a = (optimalAction || '').toLowerCase();
        const isRaise = a.startsWith('r') || a === 'allin';
        if (!isRaise || nodeType !== 'hero_faces_bet') return '';

        const hc = (handStrength || '').toLowerCase();

        // ─── Value check-raises ───
        if (hc.includes('set') || hc.includes('two pair') || hc.includes('full house') || hc.includes('quads')) {
            if (street === 'flop') {
                return 'Check-raise for value: you have a monster that plays best by trapping then raising. This builds a big pot early while disguising your hand strength.';
            }
            if (street === 'turn') {
                return 'Turn check-raise for value: building the pot with a strong hand. After check-raising the turn, you can comfortably bet or shove the river.';
            }
            if (street === 'river') {
                return 'River check-raise for value: the ultimate extraction play — you checked hoping villain would bet, then raise for maximum value. Only do this with hands that beat villain\'s betting range.';
            }
        }

        // ─── Semi-bluff check-raises ───
        if (hc.includes('draw') || hc.includes('oesd') || hc.includes('gutshot') || hc.includes('combo draw')) {
            if (texture && texture.wet) {
                return 'Semi-bluff check-raise: raising with a draw on a wet board gives you two ways to win — villain folds now (instant profit) or you hit your draw when called. This is a key OOP play.';
            }
            return 'Semi-bluff check-raise: using your drawing equity plus fold equity. Even if called, you have outs to improve. This balances your check-raise range with value hands.';
        }

        // ─── Bluff check-raises ───
        if (hc.includes('air') || hc.includes('no pair') || hc.includes('overcard')) {
            return 'Bluff check-raise: raising with a weak hand to deny villain\'s equity and generate fold equity. This works because your range also contains strong hands — villain can\'t tell.';
        }

        // ─── Overpair/top pair check-raises ───
        if (hc.includes('overpair') || hc.includes('top pair')) {
            return 'Check-raise with a strong one-pair hand: raising for value and protection. On this texture, your hand is vulnerable enough that building the pot now is better than pot-controlling.';
        }

        return 'Check-raise: raising after checking builds a larger pot and applies maximum pressure. Your range should include both value hands and bluffs for balance.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 94: SESSION MILESTONE COACHING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 94: Generate coaching messages at session milestones.
     * Provides encouragement and targeted advice at key points:
     *   - Every 10 questions: quick progress check
     *   - Every 25 questions: deeper analysis
     *   - End of session: comprehensive review
     *
     * @param {number} questionNumber - Current question number
     * @returns {string|null} Coaching message or null if not a milestone
     */
    getMilestoneCoaching(questionNumber) {
        if (!this._sessionStats || this._sessionStats.total === 0) return null;

        const stats = this._sessionStats;
        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        const recentWindow = stats.recentWindow.slice(-10);
        const recentAcc = recentWindow.length > 0 ? Math.round((recentWindow.filter(Boolean).length / recentWindow.length) * 100) : 0;

        // Every 10 questions
        if (questionNumber % 10 === 0 && questionNumber > 0) {
            if (recentAcc >= 80) {
                return `▲ ${questionNumber} questions in! Last 10: ${recentAcc}% accuracy. You're in the zone — the solver would be proud.`;
            }
            if (recentAcc >= 60) {
                return `${questionNumber} questions in! Last 10: ${recentAcc}% accuracy. Solid progress — keep focusing on the explanations for spots you miss.`;
            }
            if (recentAcc >= 40) {
                return `${questionNumber} questions in! Last 10: ${recentAcc}% accuracy. Room to improve — try reading each explanation carefully and look for patterns in your mistakes.`;
            }
            return `${questionNumber} questions in! Last 10: ${recentAcc}% accuracy. Consider dropping down a level to build confidence, then come back stronger.`;
        }

        // Every 25 questions — deeper analysis
        if (questionNumber % 25 === 0 && questionNumber > 0) {
            const tracker = this._mistakeTracker || {};
            const weakest = Object.entries(tracker || {})
                .filter(([_, v]) => v.total >= 3 && v.mistakes / v.total >= 0.4)
                .sort(([_, a], [__, b]) => (b.mistakes / b.total) - (a.mistakes / a.total))
                .slice(0, 1);

            if (weakest.length > 0) {
                const [key, data] = weakest[0];
                const mistakeRate = Math.round((data.mistakes / data.total) * 100);
                return `${questionNumber}-question checkpoint! Overall: ${accuracy}%. Your biggest leak: "${key.replace(/_/g, '')}"(${mistakeRate}% mistake rate, ${data.total} samples). Focus on this area to see the biggest improvement.`;
            }
            return `${questionNumber}-question checkpoint! Overall accuracy: ${accuracy}%. ${accuracy >= 70 ? 'Great session — you\'re building strong GTO fundamentals.': 'Keep grinding — consistency is key to improving.'}`;
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 95: BOARD TEXTURE EVOLUTION TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 95: Describe how the board texture changed from previous street.
     * On turn and river, explains what changed and why it matters:
     *   - "Turn completed the flush draw"
     *   - "River bricked — all draws missed"
     *   - "Board paired, enabling full houses"
     *
     * @param {string[]} board - Full board cards (4 for turn, 5 for river)
     * @param {string} street - Current street (turn/river)
     * @returns {string} Texture evolution note
     */
    _getTextureEvolutionNote(board, street) {
        if (!board || street === 'flop' || street === 'preflop') return '';

        if (street === 'turn' && board.length >= 4) {
            const flopCards = board.slice(0, 3);
            const turnCard = board[3];
            return this._describeCardImpactV2(flopCards, turnCard, 'turn');
        }

        if (street === 'river' && board.length >= 5) {
            const turnBoard = board.slice(0, 4);
            const riverCard = board[4];
            return this._describeCardImpactV2(turnBoard, riverCard, 'river');
        }

        return '';
    }

    /**
     * Phase 95: Describe the impact of a new card on the existing board.
     */
    _describeCardImpactV2(existingBoard, newCard, streetName) {
        if (!newCard || !existingBoard || existingBoard.length < 3) return '';

        const newRank = newCard[0]?.toUpperCase();
        const newSuit = newCard[1]?.toLowerCase();
        const newVal = '23456789TJQKA'.indexOf(newRank);

        const boardRanks = existingBoard.map(c => c[0].toUpperCase());
        const boardSuits = existingBoard.map(c => c[1]?.toLowerCase());
        const boardVals = boardRanks.map(r => '23456789TJQKA'.indexOf(r));

        const impacts = [];

        // Check if the new card completes a flush
        const suitCounts = {};
        boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        if (newSuit && suitCounts[newSuit] >= 2) {
            const totalOfSuit = (suitCounts[newSuit] || 0) + 1;
            if (totalOfSuit >= 3 && existingBoard.length === 3) {
                impacts.push('puts a third flush card out — flush draws now have direct draws');
            } else if (totalOfSuit >= 4) {
                impacts.push('fourth flush card — flushes are now very likely');
            }
        }

        // Check if the new card pairs the board
        if (boardRanks.includes(newRank)) {
            impacts.push('pairs the board — full houses now possible');
        }

        // Check if the new card is an overcard to previous board
        const highestExisting = Math.max(...boardVals);
        if (newVal > highestExisting) {
            const overcardName = newRank;
            impacts.push(`${overcardName} is an overcard — shifts range advantage`);
        }

        // Check if the new card completes straight possibilities
        const allVals = [...boardVals, newVal].sort((a, b) => a - b);
        const uniqueVals = [...new Set(allVals)];
        // Check for 4-in-a-row
        for (let i = 0; i < uniqueVals.length - 3; i++) {
            if (uniqueVals[i + 3] - uniqueVals[i] === 3) {
                impacts.push('connects the board — many straights now possible');
                break;
            }
        }

        // Low card on a high board = blank
        if (impacts.length === 0 && newVal <= 5 && highestExisting >= 8) {
            impacts.push('low card on a high board — likely a blank that changes nothing');
        }

        // High card on a low board = dynamic
        if (impacts.length === 0 && newVal >= 9 && highestExisting <= 7) {
            impacts.push('overcard to the board — changes the equity landscape significantly');
        }

        if (impacts.length === 0) return '';
        return `${streetName.charAt(0).toUpperCase() + streetName.slice(1)} card impact: ${impacts.slice(0, 2).join('; ')}.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 96: OVERBETTING CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 96: Explain when and why overbetting (>100% pot) is the solver's choice.
     * Overbets are used when:
     *   - Hero has a strong nut advantage (range has many more nutted hands)
     *   - Villain's range is capped (can't have the nuts)
     *   - Board changed in a way that heavily favors hero's range
     *   - Maximizing value from the top of a polarized range
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {number} sizePct - Bet sizing percentage
     * @param {Object} texture - Board texture
     * @returns {string} Overbet context note
     */
    _getOverbetNote(optimalAction, handStrength, street, sizePct, texture) {
        if (sizePct < 100) return ''; // Only for overbets

        const hc = (handStrength || '').toLowerCase();
        const isNutted = hc.includes('nut') || hc.includes('full house') || hc.includes('quads') || hc.includes('set') || hc.includes('flush') || hc.includes('straight');
        const isAir = hc.includes('air') || hc.includes('no pair') || hc.includes('overcard');

        if (isNutted) {
            if (street === 'river') {
                return `Overbet for value: your nutted hand maximizes extraction by overbetting — villain's bluff-catchers face maximum pressure. They must call with their entire defend-vs-overbet range or let you profit.`;
            }
            return `Overbet for value: your strong hand leverages a nut advantage to overbet. This builds the maximum pot for when you have the goods and sets up large future bets.`;
        }

        if (isAir) {
            if (street === 'river') {
                return `Overbet bluff: with no showdown value, overbetting applies maximum fold pressure. Villain must defend narrowly against overbets — even strong one-pair hands often fold.`;
            }
            return `Overbet bluff: your hand has no showdown value. The overbet generates maximum fold equity — few hands in villain's range can profitably continue against this sizing.`;
        }

        if (hc.includes('draw')) {
            return `Overbet semi-bluff: massive sizing with a draw applies extreme fold pressure. If villain folds, you win immediately; if called, you have outs to improve.`;
        }

        return `Overbetting: the solver uses a size above pot to maximize leverage. This is a polarized play — your range here should be nutted hands for value and select bluffs.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 97: THIN VALUE BET RECOGNITION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 97: Identify when a bet is thin value — betting a hand that's only
     * marginally ahead of the calling range.
     *
     * Thin value is critical for GTO play because:
     *   - It extracts extra BB from spots most players check
     *   - It balances your betting range (not just nuts and bluffs)
     *   - Missing thin value is one of the biggest leaks for intermediate players
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {number} sizePct - Bet sizing percentage
     * @param {number} freq - Frequency of optimal action
     * @returns {string} Thin value note
     */
    _getThinValueNote(optimalAction, handStrength, street, sizePct, freq) {
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b');
        if (!isBet) return '';

        const hc = (handStrength || '').toLowerCase();

        // Thin value indicators: medium-strength hand + small-to-medium sizing + not pure
        const isMedium = hc.includes('middle pair') || hc.includes('bottom pair') || hc.includes('second pair') ||
                         hc.includes('weak pair') || (hc.includes('top pair') && !hc.includes('top kicker') && !hc.includes('good kicker'));

        if (isMedium && sizePct <= 50 && freq < 0.85) {
            if (street === 'river') {
                return `Thin value: betting ${handStrength} for thin value on the river. You beat bluff-catchers and some weaker pairs — missing this bet is a common leak. Only bet if you expect to be called by worse more than half the time.`;
            }
            if (street === 'turn') {
                return `Thin value: betting a medium-strength hand for value. This is thinly profitable — you beat some of villain's calling range, but be prepared to check the river if called.`;
            }
            return `Thin value: the solver bets this medium hand for a small amount, targeting worse hands that will call. Most players would check here — extracting thin value is what separates good from great.`;
        }

        // Top pair bad kicker thin value
        if (hc.includes('top pair') && !hc.includes('top kicker') && street === 'river' && sizePct <= 40) {
            return `Thin value: top pair without a premium kicker — betting small on the river targets second pair and other worse one-pair hands. This is a thin but profitable bet.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 98: GTO vs EXPLOITATIVE FRAMING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 98: Frame the explanation in terms of GTO principles vs. exploitative adjustments.
     * Helps players understand when they're at a "pure GTO" spot vs. a spot where
     * exploitative play differs significantly from GTO.
     *
     * @param {string} optimalAction - GTO correct action
     * @param {number} freq - Frequency of the action
     * @param {Object} handActions - All action frequencies
     * @param {string} handStrength - categorizeHand() output
     * @returns {string} GTO framing note
     */
    _getGTOFramingNote(optimalAction, freq, handActions, handStrength) {
        if (!handActions) return '';

        const mixedActions = Object.entries(handActions || {}).filter(([_, f]) => f > 0.05).length;

        // Pure strategy — GTO has one clear answer
        if (freq >= 0.95) {
            return 'GTO note: this is a pure strategy spot — the solver always takes this action. Exploitatively, this doesn\'t change unless villain deviates significantly.';
        }

        // Heavily mixed — GTO and exploitative diverge most here
        if (mixedActions >= 3 && freq < 0.50) {
            return `GTO note: highly mixed spot with ${mixedActions} actions. In practice, you should pick the highest-frequency action and deviate exploitatively based on villain tendencies.`;
        }

        // Close spot — both actions are correct
        if (mixedActions === 2 && freq < 0.65 && freq > 0.35) {
            return 'GTO note: close decision — the solver mixes nearly 50/50. Against unknown opponents, either action is fine. Against specific tendencies, exploit accordingly.';
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 99-100: ENGINE STATISTICS & VERSION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 99-100: Return comprehensive engine statistics.
     * Used for debugging, analytics, and understanding the system's capabilities.
     */
    getEngineStats() {
        return {
            version: '4.2.0-phase350',
            phasesImplemented: 350,
            explanationModules: {
                core: ['strategicConcept', 'sizingReason', 'mixingReason'],
                phase25_34: ['boardTexture', 'sizingReason'],
                phase42_46: ['riverContext', 'turnContext', 'flopContext'],
                phase60_62: ['blockerAwareness', 'rangeAdvantage', 'multiStreetPlan'],
                phase64_69: ['potOddsMath', 'sprContext'],
                phase72_73: ['enhancedTexture', 'villainTendency'],
                phase74_75: ['drawClassification', 'adaptiveDifficulty'],
                phase76_80: ['dynamicDepth', 'runoutImpact', 'equityRealization', 'positionStrategy', 'frequencyDeviation'],
                phase81_85: ['rangePolarization', 'trapDetection', 'boardCoverage', 'multiStreetEV', 'kickerStrength'],
                phase86_90: ['nutAdvantage', 'backdoorEquity', 'protectionUrgency', 'showdownValue', 'sessionSummary'],
                phase91_94: ['preflopEquityTiers', 'evComparison', 'checkRaiseStrategy', 'milestoneCoaching'],
                phase95_100: ['textureEvolution', 'overbetting', 'thinValue', 'gtoFraming', 'engineStats'],
                phase101_105: ['openRangeContext', '3betRangeContext', 'squeezeContext', 'blindDefenseTheory', 'positionEV'],
                phase106_110: ['cbetTheory', 'barrelTheory', 'donkBetTheory', 'mdfContext', 'probeBetTheory'],
                phase111_115: ['rangeCapping', 'reverseImpliedOdds', 'cardRemoval', 'impliedOdds', 'foldEquity'],
                phase116_120: ['combDraws', 'boardPairStrategy', 'aceHighBoards', 'monotoneBoards', 'lowBoards'],
                phase121_125: ['riverBluffCriteria', 'bluffCatching', 'rangeNarrowing', 'performanceTrend', 'relevanceScoring'],
                phase126_133: ['multiWayPots', 'betSizingTells', 'checkBackStrategy', 'delayedCBet', 'floatPlay', 'raiseVsCall', 'turnCardCategory', 'riverDecisionTree'],
                phase134_139: ['sprMatrix', 'stackDepthStrategy', 'potGeometry', 'rangeVsNutAdvantage', 'boardInteraction', 'equityDistribution'],
                phase140_142: ['gtoDeviationDetection', 'exploitativeSuggestions', 'handReadingNarration'],
                phase143_146: ['autoDifficulty', 'conceptMastery', 'weaknessTargeting', 'spacedRepetition'],
                phase147_150: ['evLossQuantification', 'optimalPlayComparison', 'detailedSessionReport', 'adaptiveCoaching'],
                phase151_155: ['rangeVisualization', 'actionHeatmap', 'evGraph', 'handRanking', 'nutBlockerBluffs'],
                phase156_160: ['equityDenial', 'potVsImplied', 'aggressionTracking', 'vpipPfr', 'positionalAwareness'],
                phase161_165: ['4bet5betTheory', 'multiStreetBluffs', 'checkRaiseSizing', 'riverOverbets', 'valueThickness'],
                phase166_170: ['mergedVsPolarized', 'nodeLocking', 'icmPressure', 'bubbleFactor', 'pushFold'],
                phase171_175: ['anteAdjustment', 'limpRaise', 'coldCalling', 'isoRaise', 'blindVsBlind'],
                phase176_180: ['difficultyScoring', 'mistakeMagnitude', 'streakMotivation', 'bestTracking', 'typeDiversity'],
                phase181_185: ['textureQuiz', 'rangeQuiz', 'potOddsQuiz', 'mixedStrategy', 'freqComparison'],
                phase186_190: ['opponentModeling', 'leakFinder', 'sessionPacing', 'confidenceCalibration', 'handReplay'],
                phase191_195: ['customDrills', 'progressiveComplexity', 'crossStreetConsistency', 'rangeThinking', 'solverTransparency'],
                phase196_200: ['thoughtPrompts', 'postHandAnalysis', 'mentalGame', 'bankrollNotes', 'engineOptimization'],
                phase201_207: ['equityBuckets', 'rangeMorphology', 'boardCoverageHeatmap', 'nutComboCounting', 'blockerMatrix', 'potCommitment', 'checkCallFold'],
                phase208_212: ['facingDonk', 'slowPlayChecklist', 'overbetChecklist', 'riverPolarizationIndex', 'evDecomposition'],
                phase213_218: ['actionClustering', 'scenarioTagging', 'adaptiveHints', 'explanationQuality', 'multiSizing', 'frequencyWeightedScoring'],
                phase219_225: ['challengeMode', 'achievements', 'conceptDependency', 'drillRecommendation', 'solverLineComparison', 'expectedFrequency', 'smartRecap'],
                phase226_232: ['rangeEquityCalc', 'deviationCostTracker', 'handCategoryDeepDive', 'runoutSimulation', '3betDefenseMatrix', 'aggressionCoaching', 'sizingOptimizer'],
                phase233_239: ['rangeAdvantageScore', 'villainRangeNarrowing', 'handEquityEstimate', 'drawEquityCalc', 'foldEquityCalc', 'evCalculator', 'bluffValueRatio'],
                phase240_245: ['sessionLeaderboard', 'trainingCalendar', 'conceptFlashcards', 'quickFireDrills', 'textureClassification12', 'actionTreeViz'],
                phase246_250: ['rangeVsRange', 'tournamentAdjustments', 'multiTableTips', 'tiltDetection', 'trainingDashboard'],
                phase251_255: ['structuredExplanations', 'leakReport', 'keyTakeaways', 'conceptSurface', 'patternRecognition'],
                phase256_260: ['sessionGrading', 'improvementVelocity', 'spotDifficulty', 'mistakeClassification', 'drillPrescription'],
                phase261_265: ['principleTeaching', 'positionReminders', 'textureStrategy', 'sprGuidance', 'rangeNarrowExplain'],
                phase266_270: ['multiStreetPlanning', 'freqSelfCorrect', 'tiltRecovery', 'sessionPacing', 'granularDifficulty'],
                phase271_275: ['handStrengthClassifier', 'equityVsRange', 'actionEVComparison', 'solverLineComparison', 'conceptMastery'],
                phase276_280: ['adaptiveHints', 'runoutImpactPreview', 'mixedFreqDrills', 'handCategoryBreakdown', 'sessionComparison'],
                phase281_285: ['preDecisionPreview', 'runningFreqTracker', 'mistakeClustering', 'boardCoverage', 'bluffValueRatio'],
                phase286_290: ['evLossHeatmap', 'quickFireReview', 'freqQuiz', 'positionLeaderboard', 'coachingSummary'],
                phase291_295: ['streakAnalysis', 'timePressure', 'rangeConstruction', 'exploitativeAdjust', 'icmPressure'],
                phase296_300: ['multiGameType', 'bettingSizeAnalysis', 'handReadingDrill', 'varianceSimulator', 'performanceTrend'],
                phase301_305: ['optimalLineNarration', 'streetTransition', 'defenseFrequency', 'polarizationIndex', 'mistakeRecovery'],
                phase306_310: ['conceptQuiz', 'sessionMilestones', 'adaptiveDrillRec', 'criticalHandHighlights', 'comprehensiveReport'],
                phase311_315: ['nodeTypeBreakdown', 'actionTimeline', 'streetSpecificLeaks', 'overbetAnalysis', 'checkRaiseAnalysis'],
                phase316_320: ['cbetAnalysis', 'positionPairAnalysis', 'freqConvergence', 'smartSessionLength', 'trainingPlan'],
                phase321_325: ['handStrengthDist', 'aggressionProfile', 'winRateByHand', 'tightLooseProfile', 'bluffSpotAnalysis'],
                phase326_330: ['valueBetAnalysis', 'sessionSummaryCard', 'difficultyProgression', 'weaknessHeatmap', 'gtoComplianceScore'],
                phase331_335: ['rangeBalance', 'checkBackAnalysis', 'donkBetAnalysis', 'multiWayPots', 'thinValueFreq'],
                phase336_340: ['protectionBets', 'showdownAnalysis', 'riverDecisionQuality', 'preFlopLeaks', 'sessionProgressChart'],
                phase341_345: ['equityRealization', 'potControl', 'boardTextureQuiz', 'stackDepthStrategy', 'mixedStrategyAccuracy'],
                phase346_350: ['endgameReport', 'playstyleEvolution', 'conceptReminders', 'nextSessionPrep', 'ultimatePlayerRating'],
            },
            totalExplanationNotes: 95, // Number of notes in allNotes pipeline
            smartNoteSelection: { concise: 1, standard: 3, verbose: 5, method: 'relevance-scored' },
            trackers: {
                sessionStats: !!this._sessionStats,
                mistakeTracker: !!this._mistakeTracker,
                mistakeTrackerDimensions: this._mistakeTracker ? Object.keys(this._mistakeTracker || {}).length : 0,
            },
            features: [
                'Deterministic solver-driven question generation',
                'Real PIO solver data (187k+ records)',
                'Adaptive difficulty (beginner/standard/expert)',
                'Dynamic explanation depth (concise/standard/verbose)',
                'Mistake pattern tracking across 8 dimensions',
                'Session weakness summary generation',
                'Milestone coaching messages',
                'Board runout impact predictions',
                'Equity realization context',
                'Position-aware strategy explanations',
                'Range polarization detection',
                'Trap/slow-play detection',
                'Nut advantage analysis',
                'Backdoor equity awareness',
                'Protection urgency assessment',
                'Showdown value vs bluff classification',
                'Solver frequency deviation warnings',
                'EV comparison in explanations',
                'Check-raise strategy context',
                'Board texture evolution tracking',
                'Overbet strategy explanations',
                'Thin value bet recognition',
                'GTO vs exploitative framing',
                'Kicker strength awareness',
                'Board coverage (range bet vs polar bet)',
                'Multi-street EV projection',
                'Preflop hand equity tier classification',
                'Open range context by position',
                '3-bet range theory (value vs bluff)',
                'Squeeze play dynamics',
                'Blind defense theory with MDF',
                'Position EV quantification',
                'C-bet theory (IP/OOP × wet/dry)',
                'Double/triple barrel strategy',
                'Donk bet theory',
                'MDF calculation context',
                'Probe bet theory',
                'Range capping detection',
                'Reverse implied odds warnings',
                'Card removal effects',
                'Implied odds calculation',
                'Fold equity analysis',
                'Combo draw recognition',
                'Paired board strategy',
                'Ace-high board dynamics',
                'Monotone board strategy',
                'Low board dynamics',
                'River bluff selection criteria',
                'Bluff-catcher identification',
                'Range narrowing across streets',
                'Performance trend tracking',
                'Relevance-scored note selection',
            ],
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 101: PREFLOP OPEN RANGE PERCENTAGES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 101: Provide approximate GTO open-raise range percentages by position.
     * Helps players understand where their hand falls in the opening range.
     */
    _getOpenRangeContext(heroPosition, heroHand) {
        if (!heroPosition || !heroHand) return '';
        const ranges = {
            'UTG': { pct: 13, desc: 'tight ~13%' }, 'UTG+1': { pct: 15, desc: '~15%' },
            'MP': { pct: 18, desc: '~18%' }, 'MP+1': { pct: 20, desc: '~20%' },
            'HJ': { pct: 23, desc: '~23%' }, 'CO': { pct: 30, desc: '~30%' },
            'BTN': { pct: 45, desc: '~45%' }, 'SB': { pct: 40, desc: '~40% (steal)' },
        };
        const r = ranges[heroPosition];
        if (!r) return '';
        const tier = this._getPreflopHandTier(heroHand);
        if (tier.tier === 'premium' || tier.tier === 'strong') {
            return `This hand is comfortably inside ${heroPosition}'s ${r.desc} opening range.`;
        }
        if (tier.tier === 'marginal' || tier.tier === 'speculative') {
            return `${heroPosition} opens ${r.desc} of hands — your hand is at or near the boundary. Position matters most for marginal opens.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 102: 3-BET RANGE CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 102: Explain 3-bet range construction — value vs bluff 3-bets.
     * GTO 3-bet ranges are polarized: premiums for value + suited Ax/Kx for bluffs.
     */
    _get3BetRangeContext(heroHand, heroPosition, villainPosition) {
        if (!heroHand || heroHand.length < 2) return '';
        const r1 = heroHand[0], r2 = heroHand[1];
        const suffix = heroHand.length >= 3 ? heroHand[2] : '';
        const isPair = r1 === r2;
        const isSuited = suffix === 's';
        const v1 = '23456789TJQKA'.indexOf(r1), v2 = '23456789TJQKA'.indexOf(r2);
        const isAx = r1 === 'A' || r2 === 'A';
        const isKx = (r1 === 'K' || r2 === 'K') && !isAx;

        // Value 3-bets
        if (isPair && v1 >= 9) { // JJ+ (J is index 9)
            return `3-bet for value: ${heroHand} is always in the value 3-bet range — too strong to flat and risk multiway pots.`;
        }
        if (isAx && (Math.min(v1, v2) >= 11 || (isSuited && Math.min(v1, v2) >= 10))) { // AK, AQs+
            return `3-bet for value: ${heroHand} — strong enough to 3-bet vs most positions. Building the pot preflop with a premium hand.`;
        }

        // Bluff 3-bets
        if (isAx && isSuited && Math.min(v1, v2) <= 5) { // A2s-A5s
            return `3-bet as a bluff: ${heroHand} — suited Ax blocks AA/AK in villain's range (removes ~16 combos) while having nut flush potential if called. Ideal 3-bet bluff.`;
        }
        if (isKx && isSuited && Math.min(v1, v2) <= 6) {
            return `3-bet as a bluff: ${heroHand} — suited Kx blocks KK/AK, removing key combos from villain's 4-bet/continue range. Good candidate for a polarized 3-bet.`;
        }

        // Flatting hands
        if (isPair && v1 >= 5 && v1 <= 8) { // 77-TT
            return `Medium pairs typically flat a raise rather than 3-bet — set mining value is highest when you see a flop, and 3-betting builds an awkward pot with a hand that's often behind.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 103: SQUEEZE PLAY CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 103: Explain squeeze play dynamics (3-bet over a raise + cold caller).
     */
    _getSqueezeContext(heroHand, heroPosition, nodeType, potType) {
        if (!potType || !potType.includes('squeeze') && !potType.includes('Squeeze')) return '';
        const tier = this._getPreflopHandTier(heroHand);
        if (tier.tier === 'premium' || tier.tier === 'strong') {
            return `Squeeze for value: with a strong hand against a raiser + cold caller, squeezing builds a large pot against two opponents who often have capped ranges.`;
        }
        if (tier.tier === 'marginal') {
            return `Squeeze as a semi-bluff: the cold caller often has a medium-strength hand that folds to a 3-bet. Squeezing picks up dead money from both opponents.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 104: BLIND DEFENSE THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 104: Explain BB defense theory — MDF and pot odds in blinds.
     * BB gets the best pot odds to defend (already invested 1bb).
     */
    _getBlindDefenseContext(heroPosition, optimalAction, heroHand, villainPosition) {
        if (heroPosition !== 'BB' && heroPosition !== 'SB') return '';
        const a = (optimalAction || '').toLowerCase();

        if (heroPosition === 'BB') {
            if (a === 'call') {
                return `BB defense: you're getting excellent pot odds (typically 2:1 or better) to call. The BB defends wide (~55-65% vs BTN open) because of the price — even marginal hands are profitable calls.`;
            }
            if (a === 'f') {
                return `BB fold: even though you have good pot odds, some hands are too weak to defend profitably — they play too poorly postflop OOP to justify the call.`;
            }
            if (a.startsWith('r')) {
                const tier = this._getPreflopHandTier(heroHand);
                if (tier.tier === 'premium') {
                    return `BB 3-bet for value: raising strong hands from the BB builds the pot while you're guaranteed to see a flop.`;
                }
                return `BB 3-bet: mixing raises into your BB defense range prevents villain from auto-profiting with steal attempts. Balance value raises with bluff 3-bets.`;
            }
        }

        if (heroPosition === 'SB') {
            if (a === 'call') {
                return `SB flat: SB flatting is generally discouraged in GTO — you'll be OOP postflop with the BB still to act. Consider 3-betting or folding instead.`;
            }
            if (a.startsWith('r')) {
                return `SB 3-bet: the preferred way to play from the SB is either fold or 3-bet — flatting creates a multiway pot where you're OOP, which is the worst outcome.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 105: PREFLOP POSITION ADVANTAGE QUANTIFIED
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 105: Quantify the positional advantage in BB/hand.
     * Research shows BTN is the most profitable seat (~10bb/100),
     * while SB is the most unprofitable (~-7bb/100).
     */
    _getPositionEVContext(heroPosition) {
        const posEV = {
            'BTN': '+10bb/100 — most profitable seat. IP postflop with widest stealing range.',
            'CO': '+5bb/100 — strong seat with IP advantage in most pots.',
            'HJ': '+2bb/100 — moderately profitable, narrower range but still favorable.',
            'MP': '~0bb/100 — break-even position, tight range required.',
            'UTG': '-1bb/100 — tightest range, often OOP postflop.',
            'SB': '-7bb/100 — most unprofitable seat. Always OOP postflop.',
            'BB': '-3bb/100 — forced investment, but best pot odds to defend.',
        };
        return posEV[heroPosition] ? `Position EV: ${heroPosition} averages ${posEV[heroPosition]}` : '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 106: CONTINUATION BET THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 106: Explain c-bet theory — when to c-bet, when to check.
     * Continuation bets are one of the most important postflop concepts.
     */
    _getCBetTheory(optimalAction, handStrength, street, nodeType, texture, heroPosition, villainPosition) {
        if (street !== 'flop' || nodeType !== 'hero_bets_or_checks') return '';
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b');
        const isCheck = a === 'c' || a === 'x';
        const isIP = this._isInPosition(heroPosition, villainPosition);
        const hc = (handStrength || '').toLowerCase();

        if (isBet) {
            if (isIP && texture && texture.dry) {
                return `C-bet theory: IP on a dry board — c-bet frequency should be high (70%+). Your range advantage is significant and villain rarely connects. Small sizing is most efficient.`;
            }
            if (isIP && texture && texture.wet) {
                return `C-bet theory: IP on a wet board — be selective. C-bet with strong hands, draws with equity, and give up weak holdings. Frequency drops to ~40-50%.`;
            }
            if (!isIP && texture && texture.dry) {
                return `C-bet theory: OOP on a dry board — c-betting is still effective but use a smaller size. Your range advantage as PFR still applies, but you lack position for future streets.`;
            }
            if (!isIP && texture && texture.wet) {
                return `C-bet theory: OOP on a wet board — the lowest c-bet frequency spot. Check more often to build a strong checking range. Only c-bet with strong hands and draws.`;
            }
        }

        if (isCheck) {
            if (isIP) {
                return `Checking IP as PFR: protecting your checking range by including some strong and medium hands. This prevents villain from probe-betting with impunity on the turn.`;
            }
            return `Checking OOP as PFR: building a strong checking range. On this board texture, checking allows you to check-raise with your strongest hands and check-call with draws.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 107: DOUBLE AND TRIPLE BARREL THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 107: Explain multi-street barreling — when to keep betting
     * and when to give up.
     */
    _getBarrelTheory(optimalAction, handStrength, street, texture, freq) {
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const hc = (handStrength || '').toLowerCase();

        if (street === 'turn' && isBet) {
            const isValue = hc.includes('overpair') || hc.includes('top pair') || hc.includes('set') || hc.includes('two pair') || hc.includes('flush') || hc.includes('straight');
            if (isValue) {
                return `Double barrel for value: continuing to bet strong hands on the turn builds the pot. Villain's flop calling range is now defined — extract from it.`;
            }
            if (hc.includes('draw') || hc.includes('oesd') || hc.includes('gutshot')) {
                return `Double barrel semi-bluff: barreling the turn with a draw maintains pressure. You have equity when called and fold equity against villain's weaker continuing range.`;
            }
            if (hc.includes('air') || hc.includes('no pair')) {
                return `Double barrel bluff: continuing the story on the turn. The turn card either helped your perceived range or you're targeting specific hands in villain's range that fold to continued pressure.`;
            }
        }

        if (street === 'turn' && isCheck) {
            if (hc.includes('air') || hc.includes('no pair') || hc.includes('overcard')) {
                return `Giving up on the turn: after c-betting the flop, not every hand should continue. Checking and giving up with air preserves your stack for better spots.`;
            }
        }

        if (street === 'river' && isBet) {
            if (hc.includes('air') || hc.includes('no pair')) {
                return `Triple barrel bluff: the ultimate test — betting all three streets with nothing. This only works against a range that can fold. Choose bluffs with good blockers to villain's calling range.`;
            }
            if (hc.includes('overpair') || hc.includes('top pair') || hc.includes('set') || hc.includes('flush') || hc.includes('straight')) {
                return `Triple barrel for value: betting all three streets with a strong hand maximizes extraction. Your sizing should target the specific hands villain calls with on the river.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 108: DONK BET THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 108: Explain donk betting — when the caller leads into the PFR.
     * Historically considered bad, but solvers use donk bets on specific textures.
     */
    _getDonkBetTheory(optimalAction, handStrength, street, nodeType, texture, heroPosition, villainPosition) {
        if (nodeType !== 'hero_bets_or_checks') return '';
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b');
        if (!isBet) return '';

        // Donk bet = caller leads into PFR
        const isPFR = !['SB', 'BB'].includes(heroPosition);
        if (isPFR) return ''; // PFR betting is a c-bet, not a donk

        const hc = (handStrength || '').toLowerCase();

        if (texture && texture.lowBoard) {
            return `Donk bet: leading into the PFR on a low board. Solver donk-bets here because the caller's range connects heavily with low/medium boards, giving you the range advantage.`;
        }
        if (texture && texture.paired) {
            return `Donk bet: leading on a paired board. The PFR's range misses trips as often as yours, so the informational disadvantage of donking is minimal while you seize the initiative.`;
        }
        if (hc.includes('set') || hc.includes('two pair')) {
            return `Donk bet with a monster: leading with a strong hand disguises your hand strength. Many players don't expect donk bets to be value-heavy, which gets you more action.`;
        }

        return `Donk bet: leading into the preflop raiser. Modern solvers use donk bets on specific board textures where the caller's range advantage justifies taking the betting lead.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 109: MINIMUM DEFENSE FREQUENCY (MDF)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 109: Calculate and explain MDF — the minimum percentage of range
     * that must defend to prevent villain from auto-profiting with bluffs.
     * MDF = 1 - (bet size / (pot + bet size))
     */
    _getMDFContext(optimalAction, street, nodeType, estimatedPot) {
        if (nodeType !== 'hero_faces_bet' || !estimatedPot) return '';
        const a = (optimalAction || '').toLowerCase();

        // Estimate bet size from the solver action
        const betMatch = a.match(/^[br](\d+)$/);
        const isCall = a === 'call';
        const isFold = a === 'f';

        if (!isFold && !isCall) return '';

        // We need the bet size villain used — estimate from common sizing
        // In facing-bet spots, the bet size is typically in the scenario
        // Use a reasonable default
        const commonBetPct = 67; // approximate
        const betSize = estimatedPot * (commonBetPct / 100);
        const totalPot = estimatedPot + betSize;
        const mdf = 1 - (betSize / totalPot);
        const mdfPct = Math.round(mdf * 100);

        if (isFold) {
            return `MDF note: against a ~${commonBetPct}% pot bet, you need to defend ~${mdfPct}% of your range to prevent villain from auto-profiting with bluffs. Folding here is fine — this hand is below your defense threshold.`;
        }
        if (isCall) {
            return `MDF note: against a ~${commonBetPct}% pot bet, MDF is ~${mdfPct}%. Calling keeps your defense frequency honest and prevents villain from exploiting with excessive bluffs.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 110: PROBE BET THEORY
    // ═══════════════════════════════════════════════════════════════════════════

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
// @@PUB_REGION_16@@
