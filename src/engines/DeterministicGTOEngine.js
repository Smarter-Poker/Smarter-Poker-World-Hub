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
     */
    _getProbeBetTheory(optimalAction, handStrength, street, nodeType, texture) {
        if (street === 'flop' || nodeType !== 'hero_bets_or_checks') return '';
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b');
        if (!isBet) return '';

        const hc = (handStrength || '').toLowerCase();

        // Probe bet = betting when PFR checked previous street (indicating weakness)
        if (street === 'turn') {
            if (hc.includes('air') || hc.includes('no pair') || hc.includes('overcard')) {
                return `Probe bet: betting the turn after PFR checked flop. Their check signals a capped range — they would have c-bet with strong hands. Exploit this weakness with a probe bet.`;
            }
            if (hc.includes('pair') || hc.includes('draw')) {
                return `Probe bet for thin value: PFR's flop check caps their range. You can bet thinner for value here because their range is weaker than if they had c-bet.`;
            }
        }

        if (street === 'river') {
            return `River probe: villain has checked two streets, heavily capping their range. A well-timed river bet exploits their passivity — they rarely have strong hands after checking twice.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 111: OPPONENT RANGE CAPPING DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 111: Detect when villain's range is capped (limited to non-nutted hands).
     * Capped ranges allow hero to apply more pressure.
     */
    _getRangeCappingNote(street, nodeType, texture) {
        if (street === 'preflop') return '';

        // Villain's range is capped when they've made passive actions
        if (nodeType === 'hero_bets_or_checks') {
            // If we're the one to act, villain checked to us
            if (street === 'turn') {
                return 'Range capping: villain checked to you on the turn. If they c-bet the flop and checked the turn, their range is capped — they likely don\'t have strong value hands, which they would have bet. Increase your bluffing frequency.';
            }
            if (street === 'river') {
                return 'Range capping: two checks from villain suggests a heavily capped range. Strong hands would have bet for value on at least one street. You can bluff more aggressively here.';
            }
        }

        if (nodeType === 'hero_faces_bet' && street === 'river') {
            if (texture && texture.wet) {
                return 'Villain betting river on a wet board: if draws completed, villain\'s bet could be a made flush/straight. If draws missed, their range is polarized — they either have it or they\'re bluffing.';
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 112: REVERSE IMPLIED ODDS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 112: Explain reverse implied odds — when making your hand
     * will lose you even more money.
     */
    _getReverseImpliedOddsNote(handStrength, street, texture) {
        if (street === 'preflop' || street === 'river') return '';
        const hc = (handStrength || '').toLowerCase();

        // Non-nut flush draws
        if (hc.includes('flush draw') && !hc.includes('nut') && !hc.includes('strong')) {
            return `Reverse implied odds: your non-nut flush draw is dangerous — if you hit, a higher flush could cost you your entire stack. Proceed with caution.`;
        }

        // Bottom-end straight draws
        if (hc.includes('bottom-end') || hc.includes('baby straight')) {
            return `Reverse implied odds: completing a bottom-end straight means higher straights are also possible. You might make your hand and still lose a big pot.`;
        }

        // Dominated top pair
        if (hc.includes('top pair') && (hc.includes('weak kicker') || hc.includes('bad kicker'))) {
            if (texture && texture.wet) {
                return `Reverse implied odds: top pair with a weak kicker on a wet board is dangerous. You might pay off better top pairs or two pairs/sets.`;
            }
        }

        // Second pair facing aggression
        if ((hc.includes('middle pair') || hc.includes('second pair') || hc.includes('bottom pair'))) {
            return `Reverse implied odds: medium/small pairs have significant reverse implied odds — when villain has a better hand, you'll often lose more than you gain from catching bluffs.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 113: CARD REMOVAL EFFECTS (COMBINATORICS)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 113: Explain card removal (blocker) effects quantitatively.
     * When hero holds certain cards, it changes the number of combos
     * villain can have of specific hands.
     */
    _getCardRemovalNote(heroHand, board, handStrength, optimalAction) {
        if (!heroHand || heroHand.length < 2) return '';
        const r1 = heroHand[0].toUpperCase(), r2 = heroHand[1].toUpperCase();
        const a = (optimalAction || '').toLowerCase();
        const hc = (handStrength || '').toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isFold = a === 'f';

        // Ace blocker effects
        if (r1 === 'A' || r2 === 'A') {
            if (isBet && (hc.includes('air') || hc.includes('no pair'))) {
                return `Card removal: holding an Ace removes 3 combos of AA, 4 combos of AK, and blocks villain's strongest holdings. This makes your bluff more effective — villain is less likely to have the nuts.`;
            }
            if (isFold) {
                return `Card removal: your Ace blocks AA/AK combos, reducing the chance villain has premiums. However, other factors outweigh this blocker effect in this spot.`;
            }
        }

        // King blocker
        if (r1 === 'K' || r2 === 'K') {
            if (isBet && (hc.includes('air') || hc.includes('no pair'))) {
                return `Card removal: holding a King blocks KK (3 combos) and AK (8 combos). This is a good bluffing blocker — villain is less likely to have a hand that can comfortably call.`;
            }
        }

        // Flush blocker
        if (board && board.length >= 3) {
            const boardSuits = board.map(c => c[1]?.toLowerCase());
            const suitCounts = {};
            boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
            const flushSuit = Object.entries(suitCounts || {}).find(([_, c]) => c >= 3)?.[0];
            if (flushSuit && !hc.includes('flush')) {
                // Hero's cards that block the flush suit
                const heroSuits = [];
                // We don't know exact suits but can note the concept
                if (isBet) {
                    return `Card removal on a flush board: if you block the nut flush suit, villain has fewer flush combos. Blocking the A or K of the flush suit is a powerful bluffing factor.`;
                }
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 114: IMPLIED ODDS CALCULATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 114: Calculate and explain implied odds for drawing hands.
     * Implied odds = how much you expect to win on future streets if you hit.
     */
    _getImpliedOddsNote(handStrength, street, optimalAction, estimatedPot, stackDepth) {
        if (!estimatedPot || !stackDepth || street === 'river' || street === 'preflop') return '';
        const hc = (handStrength || '').toLowerCase();
        const a = (optimalAction || '').toLowerCase();
        const isCall = a === 'call';
        if (!isCall) return '';

        const isDraw = hc.includes('draw') || hc.includes('oesd') || hc.includes('gutshot');
        if (!isDraw) return '';

        const remainingStack = stackDepth - estimatedPot;
        if (remainingStack <= 0) return '';

        const impliedOddsRatio = remainingStack / estimatedPot;

        if (impliedOddsRatio >= 5) {
            return `Implied odds: excellent (${impliedOddsRatio.toFixed(1)}x pot behind). When you hit your draw, villain's stack provides massive implied odds. Even marginal draws become profitable calls.`;
        }
        if (impliedOddsRatio >= 2) {
            return `Implied odds: good (${impliedOddsRatio.toFixed(1)}x pot behind). Enough stack depth to profit when your draw completes. Focus on draws that make the nuts.`;
        }
        if (impliedOddsRatio < 1) {
            return `Implied odds: poor — not much stack left behind (${impliedOddsRatio.toFixed(1)}x pot). You need direct pot odds to justify calling, as there's little extra money to win.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 115: FOLD EQUITY ESTIMATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 115: Estimate fold equity and explain when it matters.
     * Fold equity = the chance villain folds to your bet/raise.
     */
    _getFoldEquityNote(optimalAction, handStrength, street, nodeType, freq) {
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isRaise = a.startsWith('r');
        if (!isBet && !isRaise) return '';

        const hc = (handStrength || '').toLowerCase();
        const hasShowdownValue = hc.includes('pair') || hc.includes('flush') || hc.includes('straight') || hc.includes('set');
        const noShowdownValue = hc.includes('air') || hc.includes('no pair') || hc.includes('overcard');
        const isDraw = hc.includes('draw') || hc.includes('oesd') || hc.includes('gutshot');

        if (noShowdownValue) {
            if (street === 'river') {
                return `Fold equity is everything: with no showdown value, your entire profit comes from villain folding. Your bluff needs to work often enough to compensate for the times you're caught.`;
            }
            return `Fold equity driven: your hand can't win at showdown, so betting relies entirely on fold equity. The more polarized your range looks, the more fold equity you generate.`;
        }

        if (isDraw) {
            return `Combined equity: your semi-bluff has both fold equity (villain folds now) and draw equity (you improve when called). This dual equity makes aggressive play with draws highly profitable.`;
        }

        if (hasShowdownValue && isRaise && street === 'river') {
            return `Value raise with fold equity bonus: you're raising for value, but some of villain's calling range also folds, adding fold equity to your already-profitable raise.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 116: COMBO DRAW POWER RANKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 116: Quantify combo draw strength — total outs and equity.
     */
    _getCombDrawNote(handStrength) {
        const hc = (handStrength || '').toLowerCase();
        if (!hc.includes('combo draw') && !hc.includes('monster draw')) return '';

        let outs = 0;
        const parts = [];
        if (hc.includes('flush draw')) { outs += 9; parts.push('9 flush outs'); }
        if (hc.includes('oesd') || hc.includes('open-ended')) { outs += 8; parts.push('8 straight outs'); }
        else if (hc.includes('gutshot')) { outs += 4; parts.push('4 gutshot outs'); }
        if (hc.includes('overcard')) { outs += 6; parts.push('~6 overcard outs'); }

        // Remove double-counted outs (typically ~2 overlap between flush and straight)
        if (parts.length >= 2) outs = Math.max(outs - 2, outs * 0.85);

        const equityFlop = Math.min(outs * 4, 70); // Rule of 4 (capped)
        const equityTurn = Math.min(outs * 2, 45); // Rule of 2

        if (outs >= 12) {
            return `Monster draw: ~${Math.round(outs)} outs (${parts.join(' + ')}). Approximately ${Math.round(equityFlop)}% equity on the flop — you're actually a mathematical favorite vs most one-pair hands. Play aggressively.`;
        }
        return `Combo draw: ~${Math.round(outs)} outs (${parts.join(' + ')}). ~${Math.round(equityFlop)}% equity on flop. Strong enough to semi-bluff aggressively.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 117: BOARD PAIR IMPLICATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 117: Explain strategic implications of a paired board.
     */
    _getBoardPairNote(handStrength, texture, street) {
        if (!texture || !texture.paired || street === 'preflop') return '';
        const hc = (handStrength || '').toLowerCase();

        if (hc.includes('full house') || hc.includes('quads')) {
            return `Paired board: you have the nuts or near it. Paired boards reduce the number of strong hands in villain's range, making your monster even more disguised.`;
        }
        if (hc.includes('trips') || hc.includes('three of a kind')) {
            return `Paired board: you have trips — strong but vulnerable to full houses. Villain's pocket pairs could be full houses, so be cautious if raised.`;
        }
        if (hc.includes('flush') || hc.includes('straight')) {
            return `Paired board warning: your flush/straight is vulnerable to full houses. Paired boards allow trips and full houses that beat you. Size for value but be ready to fold to raises.`;
        }
        if (hc.includes('pair') && !hc.includes('two pair')) {
            return `Paired board: one-pair hands play cautiously on paired boards. The pair on the board means fewer combinations of strong hands exist, but any trip or full house has you crushed.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 118: ACE-HIGH BOARD DYNAMICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 118: Specific strategy for ace-high boards (most common board type).
     */
    _getAceHighBoardNote(handStrength, texture, street, nodeType, heroPosition) {
        if (!texture || !texture.aceHigh || street === 'preflop') return '';
        const hc = (handStrength || '').toLowerCase();

        if (hc.includes('top pair') && hc.includes('ace')) {
            return `Ace-high board with top pair: you have the nuts in terms of one-pair hands. The PFR's range heavily favors Ax, so you can bet confidently for value.`;
        }
        if (hc.includes('pair') && !hc.includes('ace') && !hc.includes('top pair')) {
            return `Ace-high board without an ace: your pair is dominated by all the Ax combos in villain's range. Play cautiously — you're often behind.`;
        }
        if (hc.includes('air') || hc.includes('no pair')) {
            if (nodeType === 'hero_bets_or_checks') {
                return `Ace-high board with air: the Ace on the board is great for bluffing as PFR — your range is perceived to have many Ax hands. Villain will fold pairs below top pair.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 119: MONOTONE BOARD STRATEGY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 119: Strategy for monotone (3+ cards same suit) boards.
     */
    _getMonotoneBoardNote(handStrength, texture, street) {
        if (!texture || !texture.monotone || street === 'preflop') return '';
        const hc = (handStrength || '').toLowerCase();

        if (hc.includes('nut flush')) {
            return `Monotone board with nut flush: you have the nuts. Bet for value — anyone with a lower flush or a pair will often pay you off.`;
        }
        if (hc.includes('flush') && !hc.includes('nut')) {
            return `Monotone board with a non-nut flush: be cautious. The board having 3+ of a suit means anyone with a higher card of that suit beats you. Size for thin value but don't overcommit.`;
        }
        if (hc.includes('flush draw') && !hc.includes('nut')) {
            return `Monotone board with a flush draw: dangerous situation. Even if you hit, you might not have the best flush. Nut draws are valuable; non-nut draws have significant reverse implied odds.`;
        }
        if (!hc.includes('flush') && !hc.includes('flush draw')) {
            return `Monotone board without flush equity: play defensively. Anyone with a single card of the flush suit has a draw, and made flushes are common. One-pair hands are significantly devalued.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 120: LOW BOARD DYNAMICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 120: Strategy for low boards (highest card ≤ 8).
     */
    _getLowBoardNote(handStrength, texture, street, heroPosition, nodeType) {
        if (!texture || !texture.lowBoard || street === 'preflop') return '';
        const hc = (handStrength || '').toLowerCase();

        if (hc.includes('overpair')) {
            return `Low board with overpair: your hand is very strong but vulnerable to sets and two pairs. Villain's BB defense range connects heavily with low cards — bet for value and protection.`;
        }
        if (hc.includes('air') || hc.includes('no pair')) {
            if (nodeType === 'hero_bets_or_checks') {
                return `Low board with overcards: your range advantage as PFR is reduced on low boards. Villain's wide calling range hits these boards often. Be selective with bluffs.`;
            }
        }
        if (hc.includes('set') || hc.includes('two pair')) {
            return `Low board with a strong made hand: excellent spot. Low boards heavily favor the caller's range, so when you have a monster, villain's strong hands (two pairs, straights) will often pay you off.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 121: RIVER BLUFF SELECTION CRITERIA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 121: Explain what makes a good river bluff candidate.
     */
    _getRiverBluffCriteria(heroHand, handStrength, board, optimalAction, street) {
        if (street !== 'river') return '';
        const a = (optimalAction || '').toLowerCase();
        if (!a.startsWith('b') && a !== 'allin') return '';
        const hc = (handStrength || '').toLowerCase();
        if (!hc.includes('air') && !hc.includes('no pair') && !hc.includes('overcard') && !hc.includes('missed')) return '';

        const r1 = heroHand?.[0]?.toUpperCase(), r2 = heroHand?.[1]?.toUpperCase();
        const criteria = [];

        // Blockers to calling range
        if (r1 === 'A' || r2 === 'A') criteria.push('blocks top pair/overpairs');
        if (r1 === 'K' || r2 === 'K') criteria.push('blocks second-best holdings');

        // Missed draws are good bluff candidates
        if (hc.includes('missed') || hc.includes('draw')) criteria.push('missed draw — naturally arrives at river without a made hand');

        // No showdown value
        criteria.push('zero showdown value — can only win by betting');

        if (criteria.length > 0) {
            return `River bluff selection: your hand qualifies because: ${criteria.join('; ')}. Ideal river bluffs combine blocker effects with no showdown equity.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 122: RIVER BLUFF-CATCHING CRITERIA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 122: Explain what makes a hand a good bluff-catcher on the river.
     */
    _getBluffCatcherNote(handStrength, optimalAction, street, nodeType) {
        if (street !== 'river' || nodeType !== 'hero_faces_bet') return '';
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'call') return '';
        const hc = (handStrength || '').toLowerCase();

        const isBluffCatcher = hc.includes('pair') && !hc.includes('two pair') && !hc.includes('set') && !hc.includes('overpair');

        if (isBluffCatcher) {
            return `Bluff-catching: your one-pair hand beats bluffs but loses to value bets. The decision comes down to: does villain bluff enough in this spot? If villain's bluff-to-value ratio exceeds your pot odds, calling is correct.`;
        }

        if (hc.includes('overpair') || hc.includes('top pair')) {
            return `Strong bluff-catcher: your hand is near the top of the bluff-catching range. Calling is correct because folding would let villain profit by bluffing with impunity in this spot.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 123: STREET-BY-STREET RANGE NARROWING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 123: Explain how ranges narrow across streets.
     */
    _getRangeNarrowingNote(street, nodeType) {
        if (street === 'preflop' || street === 'flop') return '';

        if (street === 'turn') {
            if (nodeType === 'hero_faces_bet') {
                return `Range narrowing: by the turn, both ranges have narrowed significantly from the flop. Villain's betting range is now weighted toward strong made hands and draws — medium hands would have checked.`;
            }
            return `Range narrowing: the turn is where ranges start to crystallize. Hands that continued from the flop either improved, had draws, or were strong enough to keep investing.`;
        }

        if (street === 'river') {
            if (nodeType === 'hero_faces_bet') {
                return `Range narrowing: villain's river betting range is highly polarized — they either have a strong hand (value) or nothing (bluff). Medium-strength hands check the river for showdown. Use this to calibrate your calling decision.`;
            }
            return `Range narrowing: by the river, ranges are at their narrowest. Decisions are binary: bet for value/bluff or check for showdown. Every hand in your range should have a clear purpose.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 124: SESSION PERFORMANCE TREND TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 124: Track performance trends within a session — are you improving
     * or declining as the session progresses?
     */
    getPerformanceTrend() {
        if (!this._sessionStats || this._sessionStats.total < 10) return null;

        const window = this._sessionStats.recentWindow;
        if (window.length < 10) return null;

        const firstHalf = window.slice(0, Math.floor(window.length / 2));
        const secondHalf = window.slice(Math.floor(window.length / 2));

        const firstAcc = firstHalf.filter(Boolean).length / firstHalf.length;
        const secondAcc = secondHalf.filter(Boolean).length / secondHalf.length;
        const diff = secondAcc - firstAcc;

        if (diff > 0.15) {
            return { trend: 'improving', diff: Math.round(diff * 100), message: `Your accuracy is improving! Up ${Math.round(diff * 100)}% in the second half of your session. You're warming up and making better decisions.` };
        }
        if (diff < -0.15) {
            return { trend: 'declining', diff: Math.round(diff * 100), message: `Your accuracy is declining (${Math.round(Math.abs(diff) * 100)}% drop). Consider taking a break — decision fatigue is real in poker training.` };
        }
        return { trend: 'stable', diff: Math.round(diff * 100), message: `Consistent performance throughout the session. You're maintaining focus well.` };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 125: COMPREHENSIVE EXPLANATION RELEVANCE SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 125: Score explanation notes for relevance to the specific hand.
     * Instead of just taking the first N notes, score each note and pick
     * the most relevant ones for this specific situation.
     *
     * Scoring factors:
     *   - Specificity (hand-specific > generic)
     *   - Actionability (teaches something concrete > abstract)
     *   - Street relevance (river notes on river > generic notes)
     *   - Player weakness (notes in weak areas score higher)
     */
    _scoreNoteRelevance(note, handStrength, street, optimalAction) {
        if (!note) return 0;
        let score = 1.0;
        const n = note.toLowerCase();
        const hc = (handStrength || '').toLowerCase();

        // Specificity bonus — notes that mention the specific hand type
        if (hc.includes('flush draw') && n.includes('flush')) score += 2;
        if (hc.includes('set') && (n.includes('set') || n.includes('trap'))) score += 2;
        if (hc.includes('top pair') && n.includes('top pair')) score += 1.5;
        if (hc.includes('air') && (n.includes('bluff') || n.includes('fold equity') || n.includes('showdown'))) score += 2;
        if (hc.includes('overbet') && n.includes('overbet')) score += 3;

        // Actionability bonus — concrete advice
        if (n.includes('bet') || n.includes('check') || n.includes('fold') || n.includes('call') || n.includes('raise')) score += 0.5;

        // Street relevance
        if (street === 'river' && n.includes('river')) score += 1;
        if (street === 'turn' && n.includes('turn')) score += 1;
        if (street === 'flop' && (n.includes('c-bet') || n.includes('flop'))) score += 1;

        // Warning/coaching markers
        if (n.includes('▲') || n.includes('') || n.includes('warning') || n.includes('caution')) score += 1;

        // Numeric/quantitative notes (EV, percentage, outs)
        if (n.includes('%') || n.includes('bb') || n.includes('outs') || n.includes('equity')) score += 0.5;

        // Check if this relates to a tracked weakness
        if (this._mistakeTracker) {
            const handBucket = this._getHandBucket(handStrength);
            const streetKey = `street:${street}`;
            const handKey = `hand:${handBucket}`;
            if (this._mistakeTracker[streetKey]?.mistakes > 0) score += 1;
            if (this._mistakeTracker[handKey]?.mistakes > 0) score += 1.5;
        }

        return score;
    }

    /**
     * Normalize categorizeHand() free-text output into a snake_case token
     * so the Phase 126+ helpers can compare against their enum values.
     */
    _getHandToken(handStrength) {
        const hc = (handStrength || '').toLowerCase();
        // GTOW parity #33 — this normaliser converts categorizeHand()'s free
        // prose ("top pair, top kicker") into the snake_case token the coaching
        // notes switch on. It was NOT idempotent: handed a token that already
        // matched, every `includes('top pair')` test failed on the underscore
        // and the function returned 'air'. That mattered the moment the raw
        // enum comparisons below were routed through here, because some of
        // their callers already pass tokens. Passing a known token straight
        // back makes the function safe to apply to either representation, which
        // is what lets one normaliser serve every consumer.
        if (_HAND_TOKENS.has(hc)) return hc;
        if (hc.includes('straight flush') || hc.includes('quads') || hc.includes('four of a kind')) return 'nuts';
        if (hc.includes('full house')) return 'full_house';
        if (hc.includes('flush') && !hc.includes('draw')) return 'flush';
        if (hc.includes('straight') && !hc.includes('draw')) return 'straight';
        if (hc.includes('set') || hc.includes('trips') || hc.includes('three of a kind')) return 'set';
        if (hc.includes('two pair')) return 'two_pair';
        if (hc.includes('overpair')) return 'overpair';
        if (hc.includes('top pair, top kicker') || hc.includes('top pair top kicker')) return 'top_pair_top_kicker';
        if (hc.includes('top pair')) return 'top_pair';
        if (hc.includes('middle pair') || hc.includes('second pair')) return 'middle_pair';
        if (hc.includes('bottom pair') || hc.includes('weak pair') || hc.includes('underpair') || hc.includes('pocket pair')) return 'weak_pair';
        if (hc.includes('combo draw')) return 'combo_draw';
        if (hc.includes('flush draw')) return 'flush_draw';
        if (hc.includes('oesd') || hc.includes('open-ended')) return 'oesd';
        if (hc.includes('gutshot')) return 'gutshot';
        if (hc.includes('overcard')) return 'overcards';
        return 'air';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 126: MULTI-WAY POT ADJUSTMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 126: Explain how multi-way dynamics change strategy.
     * In multi-way pots, bluffing frequency drops, value range tightens.
     */
    _getMultiWayNote(nodeType, potType, handStrength, optimalAction) {
        if (!potType || !potType.toLowerCase().includes('multi')) return '';
        const a = (optimalAction || '').toLowerCase();
        const handToken = this._getHandToken(handStrength);
        const isStrong = ['nuts', 'second_nuts', 'overpair', 'top_pair_top_kicker', 'top_pair', 'two_pair', 'set', 'trips', 'straight', 'flush', 'full_house'].includes(handToken);
        const isMedium = ['middle_pair', 'top_pair_weak_kicker', 'second_pair', 'third_pair', 'weak_pair'].includes(handToken);

        if (a === 'f' && isMedium) {
            return 'Multi-way pot: medium-strength hands lose significant value with multiple opponents — more players means someone likely has you beat. Folding marginal hands is correct.';
        }
        if (this._isAggressiveAction(a) && isStrong) {
            return 'Multi-way pot: with a strong hand, bet for value against multiple opponents who may each have some equity. Thin value goes up when facing wide ranges.';
        }
        if (a === 'call' || a === 'x') {
            return 'Multi-way pot: bluffing frequency drops dramatically — more players means more chance someone has a calling hand. Play honestly and wait for strong holdings.';
        }
        return 'Multi-way pot: tighten your range significantly. Bluff less, value bet more, and be cautious with medium-strength hands.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 127: BET SIZING TELLS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 127: What different bet sizes signal about villain's range.
     * Small bets = merged/wide range, large bets = polarized range.
     */
    _getBetSizingTellNote(nodeType, street, optimalAction) {
        if (!optimalAction) return '';
        const a = optimalAction.toLowerCase();
        // Extract sizing from action like 'r50', 'b33', or 'r125'
        const sizePct = this._actionSizePct(a);
        if (sizePct == null) return '';

        if (sizePct <= 33) {
            return `Small bet (${sizePct}% pot): signals a merged/depolarized range. Villain bets this size with both value and marginal hands — your bluff-catching threshold is lower. Defend wider.`;
        }
        if (sizePct <= 50) {
            return `Medium-small bet (${sizePct}% pot): common for range bets where villain c-bets their entire range. Indicates board favors their range but they're not committing heavily.`;
        }
        if (sizePct <= 75) {
            return `Standard sizing (${sizePct}% pot): balanced between value and bluffs. Villain's range is somewhat polarized — they have both strong hands and bluffs at this size.`;
        }
        if (sizePct <= 100) {
            return `Large bet (${sizePct}% pot): polarized range — villain has either a strong value hand or a bluff. Middle-strength hands rarely use this sizing. Bluff-catch or fold.`;
        }
        return `Overbet (${sizePct}% pot): maximally polarized. Villain is either nutted or bluffing — no medium-strength hands. Call with top of range, fold everything else.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 128: CHECK-BACK STRATEGY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 128: When to check back in position — pot control, deception, thin value.
     */
    _getCheckBackNote(optimalAction, handStrength, street, texture, heroPosition, villainPosition) {
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'x' && a !== 'check') return '';
        const isIP = this._isInPosition(heroPosition, villainPosition);
        if (!isIP) return ''; // Check-back only applies IP

        const handToken = this._getHandToken(handStrength);
        const isMedium = ['middle_pair', 'top_pair_weak_kicker', 'second_pair', 'third_pair'].includes(handToken);
        const isStrong = ['overpair', 'top_pair_top_kicker', 'top_pair', 'two_pair', 'set'].includes(handToken);
        const isWeak = ['high_card', 'ace_high', 'underpair', 'weak_pair', 'overcards', 'air'].includes(handToken);
        const isDry = texture && (texture.dry || !(texture.flushy || texture.monotone));

        if (isMedium && street === 'flop') {
            return 'Check-back for pot control: medium-strength hands benefit from seeing another card cheaply. Betting risks getting raised off the best hand or building a pot you can\'t win.';
        }
        if (isStrong && isDry && street === 'flop') {
            return 'Check-back to trap: on a dry board, villain has few draws. Checking back a strong hand disguises your strength and may induce bluffs on later streets.';
        }
        if (isWeak && street === 'turn') {
            return 'Check-back with air: give up on the bluff when villain has shown interest. Saving your stack for better spots is a key part of GTO play.';
        }
        if (street === 'river') {
            return 'Check-back on river: your hand has showdown value but isn\'t strong enough to bet for value — betting only gets called by better and folds out worse.';
        }
        return 'Check-back: controlling the pot and realizing equity. Not every hand needs to bet — sometimes checking maximizes EV by keeping the pot manageable.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 129: DELAYED C-BET THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 129: Delayed c-bet — checking flop, betting turn.
     * Common on boards that favor the caller's range.
     */
    _getDelayedCBetNote(optimalAction, handStrength, street, nodeType, texture) {
        const handToken = this._getHandToken(handStrength);
        if (street !== 'turn') return '';
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';
        // This is relevant when the PFR checked flop and now bets turn
        if (nodeType !== 'delayed_cbet' && nodeType !== 'probe') return '';

        const isDrawy = texture && (texture.wet || texture.flushy || texture.monotone);
        const isMedium = ['middle_pair', 'top_pair_weak_kicker', 'second_pair'].includes(handToken);

        if (isDrawy) {
            return 'Delayed c-bet: by checking the flop and betting the turn, you represent a hand that improved or was trapping. On draw-heavy boards, this pressures opponents who floated with draws that missed.';
        }
        if (isMedium) {
            return 'Delayed c-bet with a medium hand: checking the flop kept the pot small, and now you can value bet the turn against hands that would have check-raised you on the flop.';
        }
        return 'Delayed c-bet: checking the flop and betting the turn is a powerful line that keeps your range strong. Villain may have given up on bluffs, making this a profitable spot.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 130: FLOAT PLAY THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 130: Float play — calling in position with the plan to take the pot away later.
     */
    _getFloatPlayNote(optimalAction, handStrength, street, heroPosition, villainPosition) {
        if (street !== 'flop') return '';
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'call') return '';
        const isIP = this._isInPosition(heroPosition, villainPosition);
        if (!isIP) return '';

        const handToken = this._getHandToken(handStrength);
        const isWeak = ['high_card', 'ace_high', 'underpair', 'gutshot', 'backdoor_flush_draw', 'weak_pair', 'overcards', 'air'].includes(handToken);
        const hasDraw = ['gutshot', 'oesd', 'flush_draw', 'backdoor_flush_draw', 'combo_draw'].includes(handToken);

        if (isWeak) {
            return 'Float play: calling the flop bet in position with a weak hand, planning to take the pot when villain checks the turn. IP advantage means you get to act last — if villain shows weakness by checking, you can bluff profitably.';
        }
        if (hasDraw) {
            return 'Float with a draw: calling IP to see another card. If you hit, you can extract value. If villain checks the turn, you can semi-bluff with your draw or take a free card.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 131: RAISE VS CALL DECISION FRAMEWORK
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 131: Framework for deciding between raising and calling postflop.
     */
    _getRaiseVsCallNote(optimalAction, handStrength, street, nodeType, texture) {
        const a = (optimalAction || '').toLowerCase();
        const isRaise = this._isAggressiveAction(a);
        const isCall = a === 'call';
        if (!isRaise && !isCall) return '';

        const handToken = this._getHandToken(handStrength);
        const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'straight', 'flush'].includes(handToken);
        const isDraw = ['oesd', 'flush_draw', 'combo_draw'].includes(handToken);
        const isMedium = ['overpair', 'top_pair_top_kicker', 'top_pair'].includes(handToken);
        const isWet = texture && (texture.wet || texture.flushy || texture.monotone);

        if (isRaise && isStrong && isWet) {
            return 'Raise for value + protection: on a wet board, strong hands should raise to deny equity to draws. Calling lets villain realize their equity cheaply.';
        }
        if (isRaise && isDraw && isWet) {
            return 'Raise as a semi-bluff: your draw gives you equity when called, and raising may win the pot immediately. The combination of fold equity + draw equity makes this profitable.';
        }
        if (isCall && isMedium) {
            return 'Call rather than raise: medium-strength hands prefer to keep the pot controlled. Raising only gets action from better hands while folding out worse — the classic "raising turns your hand into a bluff" problem.';
        }
        if (isCall && isStrong && street === 'flop') {
            return 'Flat call with a monster: slow-playing on the flop to keep villain\'s bluffs in and allow them to catch up slightly. Raising may fold out everything but the nuts.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 132: TURN CARD CATEGORIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 132: Categorize turn cards — how they change the board dynamic.
     */
    _getTurnCardCategoryNote(board, street, handStrength, texture) {
        if (street !== 'turn' || !board || board.length < 4) return '';
        const turnCard = board[3];
        if (!turnCard || turnCard.length < 2) return '';
        const turnRank = turnCard[0];
        const turnSuit = turnCard[1];
        const flopCards = board.slice(0, 3);
        const flopSuits = flopCards.map(c => c[1]);
        const flopRanks = flopCards.map(c => '23456789TJQKA'.indexOf(c[0]));
        const turnRankVal = '23456789TJQKA'.indexOf(turnRank);

        // Flush completing
        const suitCounts = {};
        flopSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const flushDrawSuit = Object.entries(suitCounts || {}).find(([_, ct]) => ct >= 2);
        if (flushDrawSuit && turnSuit === flushDrawSuit[0]) {
            return `▲ Turn ${turnCard} completes the flush draw (three ${flushDrawSuit[0]} on the flop). This dramatically changes the board dynamic — flush draws got there, and hands without a flush need to proceed cautiously.`;
        }

        // Overcard
        const maxFlopRank = Math.max(...flopRanks);
        if (turnRankVal > maxFlopRank && turnRankVal >= 10) { // T+
            const rankNames = { 10: 'Jack', 11: 'Queen', 12: 'King', 13: 'Ace' };
            return `Turn ${turnCard} is an overcard to the flop — ${rankNames[turnRankVal] || turnRank} changes the dynamic. Top pairs from the flop may now be second pair. Ranges with big cards improve.`;
        }

        // Board pairing
        if (flopRanks.includes(turnRankVal)) {
            return `Turn ${turnCard} pairs the board. This is generally better for the preflop aggressor (sets/trips become possible) and reduces straight/flush draw equity.`;
        }

        // Brick/blank
        if (turnRankVal <= 5 && !flopRanks.includes(turnRankVal)) {
            return `Turn ${turnCard} is a relative blank — low card that doesn't complete obvious draws. The board dynamic stays similar to the flop. Continue with your flop plan.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 133: RIVER DECISION TREE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 133: River decision tree — value/bluff/check flowchart.
     */
    _getRiverDecisionNote(optimalAction, handStrength, street, nodeType) {
        if (street !== 'river') return '';
        const a = (optimalAction || '').toLowerCase();
        const handToken = this._getHandToken(handStrength);
        const isStrong = ['nuts', 'second_nuts', 'full_house', 'flush', 'straight', 'set', 'trips'].includes(handToken);
        const isMedium = ['two_pair', 'overpair', 'top_pair_top_kicker', 'top_pair'].includes(handToken);
        const isWeak = ['high_card', 'ace_high', 'underpair', 'bottom_pair', 'missed_draw', 'weak_pair', 'overcards', 'air'].includes(handToken);

        if (this._isAggressiveAction(a)) {
            if (isStrong) return 'River value bet: with a strong hand, bet for maximum value. Choose a size that gets called by enough worse hands — balance between frequency and size.';
            if (isWeak) return 'River bluff: with a weak hand, betting turns your hand into a bluff. The key question: does villain fold enough to make this profitable? Target their bluff-catching range.';
            if (isMedium) return 'River thin value: a medium-strength bet targeting worse hands that might call. Be careful — if villain only calls with better, this is a losing bet.';
        }
        if (a === 'call') {
            if (isMedium) return 'River bluff-catch: calling with a medium-strength hand to catch villain\'s bluffs. The decision: does villain bluff enough to justify calling? Compare to pot odds.';
            if (isStrong) return 'River snap-call: your hand beats most of villain\'s value range. An easy call.';
        }
        if (a === 'x' || a === 'check') {
            if (isMedium) return 'River check: your hand has showdown value but can\'t bet for value (only better hands call, only worse hands fold). Checking captures the equity you have.';
            if (isWeak) return 'River give-up: no showdown value and bluffing isn\'t profitable enough. Sometimes giving up is the highest-EV play.';
        }
        if (a === 'f') {
            return 'River fold: your hand can\'t beat villain\'s value range, and you\'re not getting the right odds to bluff-catch. Discipline to fold rivers saves significant EV long-term.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 134: SPR DECISION MATRIX
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 134: Stack-to-pot ratio matrix for strategic decisions.
     * Low SPR (≤3): commit with top pair+, high SPR (13+): speculative hands shine.
     */
    _getSPRMatrixNote(estimatedPot, stackDepth, handStrength, street) {
        const handToken = this._getHandToken(handStrength);
        if (!estimatedPot || !stackDepth || street === 'preflop') return '';
        const spr = stackDepth / (estimatedPot || 1);

        if (spr <= 2) {
            const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'overpair', 'top_pair_top_kicker', 'top_pair', 'straight', 'flush', 'full_house'].includes(handToken);
            if (isStrong) return `SPR ≈ ${spr.toFixed(1)} (very low): with a strong hand at this SPR, you should be looking to get all-in. The pot is too large relative to stacks to slow-play.`;
            return `SPR ≈ ${spr.toFixed(1)} (very low): shallow SPR means commitment decisions are simplified. Top pair+ is often strong enough to stack off. Draws lose implied odds.`;
        }
        if (spr <= 5) {
            return `SPR ≈ ${spr.toFixed(1)} (low): one-pair hands are often strong enough to go with. Sets and two-pair are monsters. Draws need to be strong to continue.`;
        }
        if (spr <= 10) {
            return `SPR ≈ ${spr.toFixed(1)} (medium): top pair is good but not stack-off worthy. Sets are ideal stacking hands. Drawing hands have reasonable implied odds.`;
        }
        return `SPR ≈ ${spr.toFixed(1)} (high): deep stacks favor implied-odds hands (suited connectors, small pairs). Top pair alone is rarely worth stacking off — play cautiously without a monster.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 135: EFFECTIVE STACK DEPTH ADJUSTMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 135: How effective stack depth changes strategy.
     */
    _getStackDepthStrategyNote(stackDepth, handStrength, street) {
        if (!stackDepth || street === 'preflop') return '';

        if (stackDepth <= 20) {
            return `Short-stacked (${stackDepth}BB): simplified strategy — push/fold dynamics dominate. Implied odds are minimal, so speculative hands lose value. Premium hands gain value.`;
        }
        if (stackDepth <= 40) {
            return `Medium stack (${stackDepth}BB): standard play applies. Top pair is often a stacking hand. Draws need decent equity to continue.`;
        }
        if (stackDepth <= 100) {
            return `Standard depth (${stackDepth}BB): full range of plays available. Balance between value, bluffs, and pot control.`;
        }
        return `Deep-stacked (${stackDepth}BB): implied odds are maximized — suited connectors, small pairs become more valuable. Be cautious with one-pair hands; the risk of stacking off is too high relative to hand strength.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 136: POT GEOMETRY — OPTIMAL SIZING TO GET STACKS IN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 136: Calculate geometric bet sizing to get stacks in by the river.
     */
    _getPotGeometryNote(estimatedPot, stackDepth, street, optimalAction) {
        if (!estimatedPot || !stackDepth || street === 'preflop') return '';
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';

        const remainingBets = street === 'flop' ? 3 : street === 'turn' ? 2 : 1;
        if (remainingBets <= 0) return '';

        const effectiveStack = stackDepth;
        const ratio = effectiveStack / estimatedPot;

        if (remainingBets === 3 && ratio > 2) {
            // Need 3 streets to get stacks in
            const perStreetMultiplier = Math.pow(ratio + 1, 1 / 3) - 1;
            const sizePct = (perStreetMultiplier * 100).toFixed(0);
            return `Pot geometry: to get ${effectiveStack}BB in over 3 streets with a ${estimatedPot.toFixed(0)}BB pot, bet ~${sizePct}% pot each street (geometric sizing). This builds the pot exponentially.`;
        }
        if (remainingBets === 2 && ratio > 1.5) {
            const perStreetMultiplier = Math.pow(ratio + 1, 1 / 2) - 1;
            const sizePct = (perStreetMultiplier * 100).toFixed(0);
            return `Pot geometry: ${effectiveStack}BB remaining over 2 streets — bet ~${sizePct}% pot per street to stack off naturally by the river.`;
        }
        if (remainingBets === 1) {
            const sizePct = ((effectiveStack / estimatedPot) * 100).toFixed(0);
            if (effectiveStack <= estimatedPot * 1.5) {
                return `River sizing: ${effectiveStack}BB into ${estimatedPot.toFixed(0)}BB pot — a ${sizePct}% pot jam gets all the money in.`;
            }
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 137: RANGE ADVANTAGE VS NUT ADVANTAGE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 137: Distinguish between range advantage (more equity overall)
     * and nut advantage (more very strong hands).
     */
    _getRangeVsNutAdvantageNote(heroPosition, villainPosition, texture, street, nodeType) {
        if (street === 'preflop' || !texture) return '';
        const isIP = this._isInPosition(heroPosition, villainPosition);
        const isPFR = nodeType === 'hero_bets_or_checks';
        // texture.highCard is a boolean — derive the actual high rank from lowestRank + spread
        const boardHighRank = (typeof texture.lowestRank === 'number' && typeof texture.spread === 'number')
            ? texture.lowestRank + texture.spread
            : (texture.highCard ? 11 : 0);

        // High boards favor PFR (Ace/King high)
        if (boardHighRank >= 11 && isPFR) { // K+ high
            return 'Range advantage + nut advantage: as the preflop raiser on a high board, you have both more strong hands (AA, AK, KQ) and more overall equity. This lets you c-bet at high frequency with a small size.';
        }
        // Low boards favor caller
        if (boardHighRank <= 7 && !isPFR) {
            return 'Nut advantage shifts to you: on low boards, the caller has more sets (22-77) and two pairs (45, 67) than the PFR. You can lead or check-raise more aggressively.';
        }
        // Medium boards — split advantage
        if (boardHighRank >= 8 && boardHighRank <= 10) {
            return 'Split advantage: on medium boards (8-T high), neither player has a clear nut advantage. This leads to more checking and smaller bets from both sides.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 138: BOARD INTERACTION ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

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
