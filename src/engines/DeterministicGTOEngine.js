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
        }

        if (goodCards.length > 0) {
            parts.push(`Good for you: ${goodCards.slice(0, 2).join('; ')}.`);
        }
        if (scaryCards.length > 0) {
            parts.push(`Scary: ${scaryCards.slice(0, 2).join('; ')}.`);
        }
        if (blanks.length > 0 && goodCards.length + scaryCards.length < 3) {
            parts.push(blanks[0] + '.');
        }

        return parts.join(' ');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 78: EQUITY REALIZATION CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 78: Explain equity realization — why position, hand type, and stack depth
     * affect how much of your raw equity you can actually capture.
     *
     * Key concepts:
     *   - IP (in position) realizes more equity than OOP (out of position)
     *   - Nutted hands realize close to 100% regardless of position
     *   - Draws with poor position realize less (can't control pot, face tough decisions)
     *   - Short stacks reduce the equity realization gap (less postflop play)
     *   - Dominated hands (e.g., KJo vs AK) realize poorly even with decent raw equity
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {string} heroPosition - Hero's position
     * @param {string} villainPosition - Villain's position
     * @param {number} stackDepth - Stack depth in BB
     * @param {Object} texture - Board texture
     * @returns {string} Equity realization context note
     */
    _getEquityRealizationNote(optimalAction, handStrength, street, heroPosition, villainPosition, stackDepth, texture) {
        if (!handStrength || street === 'preflop') return '';

        const hc = handStrength.toLowerCase();
        const a = (optimalAction || '').toLowerCase();
        const isIP = this._isInPosition(heroPosition, villainPosition);
        const spr = stackDepth && stackDepth > 0 ? stackDepth / (POT_BY_STREET[street] || 6) : 10;

        // Short stack SPR — equity realization matters less
        if (spr < 2) return '';

        const notes = [];

        // ─── POSITION-BASED EQUITY REALIZATION ───
        if (isIP) {
            // IP advantages
            if (hc.includes('draw') || hc.includes('gutshot') || hc.includes('oesd')) {
                notes.push('Being IP lets you control pot size with draws — you can take free cards when checked to or bet when equity is high.');
            } else if (hc.includes('middle pair') || hc.includes('bottom pair') || hc.includes('weak pair')) {
                notes.push('IP with medium-strength hands lets you pot-control effectively — check back to realize equity cheaply.');
            }
        } else {
            // OOP disadvantages
            if (hc.includes('draw') || hc.includes('gutshot') || hc.includes('oesd')) {
                if (a === 'c' || a === 'x') {
                    notes.push('OOP draws realize less equity — you can\'t take free cards, and villain\'s IP bet will force tough fold-or-call decisions.');
                } else if (a.startsWith('b') || a.startsWith('r')) {
                    notes.push('Semi-bluffing OOP with draws is important because you can\'t rely on free cards — building the pot with equity gives you fold equity now.');
                }
            } else if (hc.includes('top pair') && !hc.includes('top kicker')) {
                if (a === 'c' || a === 'x') {
                    notes.push('OOP top pair without a great kicker struggles to realize full equity — villain can put you in tough spots with raises and barrels.');
                }
            } else if (hc.includes('middle pair') || hc.includes('bottom pair')) {
                notes.push('Medium-strength hands OOP realize equity poorly — you face difficult decisions on every street without position.');
            }
        }

        // ─── HAND TYPE EQUITY REALIZATION ───
        if (hc.includes('nut') || hc.includes('full house') || hc.includes('quads') || hc.includes('set')) {
            // Nutted hands realize well regardless
            if (notes.length === 0 && spr > 4) {
                notes.push('Strong made hands realize close to 100% of their equity — focus on maximizing value across streets.');
            }
        }

        // ─── DOMINATION EFFECTS ───
        if (hc.includes('air') || hc.includes('no pair')) {
            if (!isIP && (a === 'c' || a === 'x')) {
                notes.push('With no made hand or draw, your equity realization is near zero — without fold equity or draw equity, checking and giving up is often correct.');
            }
        }

        // ─── STACK DEPTH EFFECTS ───
        if (spr > 8 && !isIP && (hc.includes('pair') || hc.includes('draw'))) {
            if (notes.length > 0) {
                notes.push(`Deep stacks (SPR ${spr.toFixed(0)}) amplify the positional disadvantage — more streets of play means more decisions OOP.`);
            }
        } else if (spr >= 2 && spr <= 4 && notes.length > 0) {
            notes.push(`Shorter effective stacks (SPR ${spr.toFixed(0)}) reduce the equity realization gap — fewer remaining decisions.`);
        }

        // ─── WET BOARD EQUITY REALIZATION ───
        if (texture && texture.wet && !isIP && hc.includes('pair') && !hc.includes('two pair') && !hc.includes('overpair')) {
            if (notes.length === 0) {
                notes.push('On wet boards OOP, one-pair hands struggle to realize equity — many turn and river cards can complete villain\'s draws.');
            }
        }

        if (notes.length === 0) return '';
        return 'Equity realization: ' + notes.slice(0, 2).join(' ');
    }

    /**
     * Phase 78: Determine if hero is in position relative to villain.
     * Same table as heroActsFirstPostflop() — see src/engines/positionOrder.js.
     */
    _isInPosition(heroPos, villainPos) {
        return heroIsInPosition(heroPos, villainPos);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 79: POSITION-AWARE STRATEGY ADJUSTMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 79: Explain how position shapes the optimal strategy for this spot.
     * Goes beyond Phase 78's equity realization to cover:
     *   - IP c-bet frequency and sizing tendencies
     *   - OOP check-raise construction and donk-bet spots
     *   - Blind defense vs steal dynamics
     *   - BTN vs blind postflop range asymmetry
     *   - HJ/CO dynamics in multiway considerations
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {string} heroPosition - Hero's position
     * @param {string} villainPosition - Villain's position
     * @param {string} nodeType - hero_bets_or_checks / hero_faces_bet / hero_faces_raise
     * @param {Object} texture - Board texture
     * @param {number} freq - Frequency of optimal action
     * @returns {string} Position strategy note
     */
    _getPositionStrategyNote(optimalAction, handStrength, street, heroPosition, villainPosition, nodeType, texture, freq) {
        if (!heroPosition || !villainPosition || street === 'preflop') return '';

        const a = (optimalAction || '').toLowerCase();
        const hc = handStrength.toLowerCase();
        const isIP = this._isInPosition(heroPosition, villainPosition);
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isRaise = a.startsWith('r');
        const isFold = a === 'f';

        // ─── BTN vs BB (most common postflop dynamic) ───
        if (heroPosition === 'BTN' && villainPosition === 'BB') {
            if (street === 'flop' && nodeType === 'hero_bets_or_checks') {
                if (isBet && texture && texture.dry) {
                    return 'BTN vs BB on dry boards: IP aggressor c-bets at high frequency with small sizing — BB\'s wide defense range misses these boards often.';
                }
                if (isBet && texture && texture.wet) {
                    return 'BTN vs BB on wet boards: IP c-bet frequency drops — BB connects more with suited/connected hands, so be selective with your bets.';
                }
                if (isCheck) {
                    return 'BTN checking back: even as IP aggressor, some hands prefer a free card — you can bet later streets when your equity improves or bluff when draws miss.';
                }
            }
            if (street === 'turn' && isBet) {
                return 'BTN double-barreling: the IP aggressor narrows to value + draws on the turn — be honest about whether your hand improved or if this is a profitable bluff card.';
            }
        }

        // ─── BB vs BTN (defending OOP) ───
        if (heroPosition === 'BB' && villainPosition === 'BTN') {
            if (street === 'flop' && nodeType === 'hero_faces_bet') {
                if (isRaise) {
                    return 'BB check-raising vs BTN c-bet: OOP needs to build a check-raise range with both value (sets, two pair) and semi-bluffs (draws) to prevent BTN from c-betting with impunity.';
                }
                if (isFold && freq > 0.5) {
                    return 'BB folding to BTN c-bet: even though you defend wide preflop, you must fold your weakest holdings — defending too wide here costs more than it saves.';
                }
            }
            if (nodeType === 'hero_bets_or_checks' && isBet) {
                return 'BB leading (donk bet) into BTN: solvers use donk bets on specific textures where BB\'s range advantage justifies taking the initiative despite being OOP.';
            }
        }

        // ─── SB dynamics ───
        if (heroPosition === 'SB') {
            if (street === 'flop' && isBet && nodeType === 'hero_bets_or_checks') {
                return 'SB as preflop raiser: playing a raised pot OOP, SB tends to c-bet at moderate frequency — your range is narrower but stronger than a cold-caller.';
            }
        }

        // ─── CO/HJ vs blinds ───
        if ((heroPosition === 'CO' || heroPosition === 'HJ') && (villainPosition === 'BB' || villainPosition === 'SB')) {
            if (street === 'flop' && isBet && nodeType === 'hero_bets_or_checks') {
                return `${heroPosition} vs ${villainPosition}: similar to BTN vs blind dynamics but with a tighter opening range — your range advantage on most boards supports c-betting.`;
            }
        }

        // ─── Generic IP vs OOP ───
        if (isIP && isCheck && street !== 'river') {
            if (hc.includes('pair') && !hc.includes('overpair') && !hc.includes('top pair')) {
                return 'IP with medium strength: checking behind controls the pot and lets you realize equity — no need to build a big pot with a marginal hand.';
            }
        }
        if (!isIP && nodeType === 'hero_faces_bet') {
            if (hc.includes('draw') && !isFold) {
                return 'Defending draws OOP vs IP bet: calling keeps your range balanced, but be prepared for tough river decisions if the draw misses.';
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 80: SOLVER FREQUENCY DEVIATION WARNINGS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 80: Generate a frequency deviation explanation when the player's
     * chosen action is in the solver mix but at a significantly lower frequency
     * than the optimal action.
     *
     * This helps players understand:
     *   - Why their action isn't "wrong" but isn't the primary choice
     *   - What distinguishes the optimal action from their chosen action
     *   - How to think about mixed strategies and when to deviate
     *
     * @param {string} chosenAction - Player's chosen action
     * @param {string} optimalAction - Solver's highest-frequency action
     * @param {Object} handActions - Map of action → frequency (0.0-1.0)
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {Object} texture - Board texture
     * @param {string} nodeType - Node type
     * @returns {string} Frequency deviation explanation
     */
    getFrequencyDeviationNote(chosenAction, optimalAction, handActions, handStrength, street, texture, nodeType) {
        if (!chosenAction || !optimalAction || chosenAction === optimalAction) return '';
        if (!handActions) return '';

        const chosenFreq = handActions[chosenAction] || 0;
        const optimalFreq = handActions[optimalAction] || 0;

        // Not in the mix at all — this is a mistake, not a deviation
        if (chosenFreq <= 0.01) return '';

        const chosenPct = (chosenFreq * 100).toFixed(0);
        const optimalPct = (optimalFreq * 100).toFixed(0);
        const gapPct = ((optimalFreq - chosenFreq) * 100).toFixed(0);

        const chosenLabel = this.getActionLabelGTOW(chosenAction);
        const optimalLabel = this.getActionLabelGTOW(optimalAction);

        const hc = (handStrength || '').toLowerCase();
        const ca = chosenAction.toLowerCase();
        const oa = optimalAction.toLowerCase();

        // ─── Determine the strategic reason for the preference ───
        let reason = '';

        // Chose check when solver prefers bet
        if ((ca === 'c' || ca === 'x') && (oa.startsWith('b') || oa === 'allin')) {
            if (hc.includes('draw') || hc.includes('gutshot') || hc.includes('oesd')) {
                reason = 'The solver prefers betting as a semi-bluff — you have equity when called and fold equity to win immediately. Checking surrenders your fold equity advantage.';
            } else if (hc.includes('top pair') || hc.includes('overpair') || hc.includes('set')) {
                reason = 'The solver prefers betting for value + protection — strong hands need to build the pot and deny equity to draws. Checking lets villain see cheap cards.';
            } else if (hc.includes('air') || hc.includes('no pair') || hc.includes('overcard')) {
                reason = 'The solver prefers bluffing here — your hand has no showdown value, so betting generates fold equity. Checking gives up because you can\'t win at showdown.';
            } else {
                reason = `The solver prefers ${optimalLabel} at ${optimalPct}% — building the pot or exerting pressure is higher EV than checking in this spot.`;
            }
        }

        // Chose bet when solver prefers check
        if ((oa === 'c' || oa === 'x') && (ca.startsWith('b') || ca === 'allin')) {
            if (hc.includes('middle pair') || hc.includes('bottom pair') || hc.includes('weak')) {
                reason = 'The solver prefers checking — medium-strength hands do better as check-calls, protecting your checking range while avoiding bloating the pot in a marginal spot.';
            } else if (hc.includes('draw')) {
                reason = 'The solver prefers checking here — this specific draw does better passively, perhaps because it has decent showdown potential or the board favors free cards.';
            } else {
                reason = `The solver prefers ${optimalLabel} at ${optimalPct}% — your hand benefits more from pot control or deception than from betting.`;
            }
        }

        // Chose fold when solver prefers call/check
        if (ca === 'f' && oa !== 'f') {
            reason = `The solver prefers ${optimalLabel} at ${optimalPct}% — your hand has enough equity or pot odds to continue. Folding is too tight and lets villain profit by over-bluffing.`;
        }

        // Chose call when solver prefers raise
        if ((ca === 'call') && (oa.startsWith('r') || oa === 'allin')) {
            reason = `The solver prefers raising — your hand is strong enough to raise for value or as a semi-bluff. Just calling misses out on building the pot and applying maximum pressure.`;
        }

        // Chose smaller bet when solver prefers larger
        if (ca.startsWith('b') && oa.startsWith('b')) {
            const chosenSize = parseInt(ca.replace('b', '')) || 0;
            const optimalSize = parseInt(oa.replace('b', '')) || 0;
            if (optimalSize > chosenSize) {
                reason = `The solver prefers a larger sizing (${optimalLabel}) — your hand's value or fold equity is maximized with a bigger bet. The smaller size doesn't apply enough pressure.`;
            } else {
                reason = `The solver prefers a smaller sizing (${optimalLabel}) — a smaller bet is higher EV here because it gets called by more hands you beat or maintains a balanced range.`;
            }
        }

        // Fallback
        if (!reason) {
            reason = `The solver prefers ${optimalLabel} at ${optimalPct}% over your ${chosenLabel} at ${chosenPct}%.`;
        }

        // Frequency context
        let freqContext = '';
        if (chosenFreq >= 0.30) {
            freqContext = `Your ${chosenLabel} is a legitimate secondary action (${chosenPct}% in the solver mix) — this is a close spot where both actions have merit.`;
        } else if (chosenFreq >= 0.10) {
            freqContext = `Your ${chosenLabel} is in the solver mix but only at ${chosenPct}% — it's not wrong per se, but it's significantly lower EV than the primary action.`;
        } else {
            freqContext = `Your ${chosenLabel} appears in the mix at just ${chosenPct}% — this is an edge-case action that the solver rarely uses. The ${gapPct}% frequency gap suggests a meaningful EV difference.`;
        }

        return `${reason} ${freqContext}`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 81: RANGE POLARIZATION CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 81: Explain whether hero's betting/raising range is polarized or merged/linear.
     * Polarized = nuts + bluffs (no medium strength). Used for large sizings.
     * Linear/merged = value-heavy with some medium strength. Used for small sizings.
     *
     * This helps players understand WHY specific sizings pair with specific hand types.
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {number} sizePct - Bet sizing as percentage of pot
     * @param {string} nodeType - Node type
     * @param {Object} texture - Board texture
     * @returns {string} Polarization context note
     */
    _getRangePolarizationNote(optimalAction, handStrength, street, sizePct, nodeType, texture) {
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isRaise = a.startsWith('r');
        if (!isBet && !isRaise) return ''; // Only relevant for aggressive actions

        const hc = (handStrength || '').toLowerCase();

        // Determine if hand is at the top, middle, or bottom of the range
        const isNuts = hc.includes('nut') || hc.includes('full house') || hc.includes('quads') || hc.includes('straight flush') || hc.includes('set') || hc.includes('flush');
        const isStrong = isNuts || hc.includes('overpair') || hc.includes('top pair, top kicker') || hc.includes('two pair');
        const isAir = hc.includes('air') || hc.includes('no pair') || hc.includes('overcard');
        const isDraw = hc.includes('draw') || hc.includes('gutshot') || hc.includes('oesd');
        const isMedium = !isStrong && !isAir && !isDraw;

        // Large sizing = polarized range
        if (sizePct >= 75 || a === 'allin') {
            if (isNuts || isStrong) {
                return `Range context: large sizing indicates a polarized range. Your strong hand is at the top of this range — you\'re betting big for value, knowing villain must call with their bluff-catchers.`;
            }
            if (isAir) {
                return `Range context: large sizing indicates a polarized range. Your hand is at the bluffing end — you have no showdown value, so you\'re maximizing fold equity with a large bet.`;
            }
            if (isDraw) {
                return `Range context: large sizing with a draw is a semi-bluff in a polarized range — you either win the pot now or have equity to improve when called.`;
            }
            if (isMedium) {
                return `Range context: interesting — medium-strength hands occasionally appear in large sizing ranges as thin value bets or as range balance. This is a solver nuance that prevents exploitation.`;
            }
        }

        // Small sizing = merged/linear range
        if (sizePct > 0 && sizePct <= 40) {
            if (isStrong) {
                return `Range context: small sizing with a strong hand suggests a merged/linear betting range — you\'re betting frequently with many hand types, using a small size to get called by a wide range.`;
            }
            if (isMedium) {
                return `Range context: small sizing fits naturally with medium-strength hands — a merged betting range includes thin value, letting you extract from worse while not overcommitting.`;
            }
            if (isAir) {
                return `Range context: small-sizing bluffs are cheap to execute — in a merged range, small bets risk less with air while maintaining pressure across your entire betting range.`;
            }
        }

        // Mid sizing
        if (sizePct > 40 && sizePct < 75) {
            if (street === 'river') {
                return `Range context: medium river sizing often indicates a somewhat polarized range — stronger than merged but not fully polarized. This sizing targets villain\'s medium-strength calling range.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 82: TRAP DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 82: Detect when checking a strong hand is a trapping play.
     * Explains the strategic rationale for slow-playing:
     *   - Checking range protection (preventing range reads)
     *   - Inducing bluffs from aggressive opponents
     *   - Board texture where strong hands are safe to slow-play
     *   - When trapping is bad (wet boards, multiway)
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {Object} texture - Board texture
     * @param {string} nodeType - Node type
     * @param {number} freq - Frequency of optimal action
     * @returns {string} Trap detection note
     */
    _getTrapDetectionNote(optimalAction, handStrength, street, texture, nodeType, freq) {
        const a = (optimalAction || '').toLowerCase();
        const isCheck = a === 'c' || a === 'x';
        const isCall = a === 'call';
        if (!isCheck && !isCall) return ''; // Trapping only applies to passive actions

        const hc = (handStrength || '').toLowerCase();
        const isVeryStrong = hc.includes('set') || hc.includes('full house') || hc.includes('quads') || hc.includes('nut flush') || hc.includes('nut straight') || hc.includes('two pair');
        const isStrong = isVeryStrong || hc.includes('overpair') || hc.includes('top pair, top kicker') || hc.includes('flush') || hc.includes('straight');

        if (!isStrong) return ''; // Only trapping with strong hands

        // Checking strong hands = trapping
        if (isCheck && isStrong) {
            if (texture && texture.dry) {
                if (isVeryStrong) {
                    return `Trapping play: checking ${handStrength} on a dry board is a classic slow-play — few draws can outdraw you, and checking induces bluffs or lighter bets from villain on later streets.`;
                }
                return `Slow-play: checking with strong hands on dry boards protects your checking range — if you always bet your best hands, villain can exploit your checks by over-bluffing.`;
            }

            if (texture && texture.wet) {
                if (freq >= 0.5) {
                    return `Trap on a wet board: the solver still prefers checking even on a draw-heavy board — this may protect your checking range or set up a check-raise if villain bets.`;
                }
                return `▲ Careful slow-play: checking strong hands on wet boards is risky since draws can get there. The solver mixes here — sometimes you need to protect your equity by betting.`;
            }

            if (nodeType === 'hero_faces_bet' || isCall) {
                return ''; // Calling a bet isn\'t really trapping
            }

            // Generic trap
            if (isVeryStrong && street !== 'river') {
                return `Trap: checking a monster on ${street} builds the pot on later streets when villain bets or lets you check-raise for maximum value.`;
            }
            if (isVeryStrong && street === 'river') {
                return `River check with a monster: this could be a trap hoping villain bluffs, or the solver recognizes that betting won\'t get called by worse hands often enough.`;
            }
        }

        // Flat-calling with a strong hand (when facing a bet)
        if (isCall && isStrong && nodeType === 'hero_faces_bet') {
            if (isVeryStrong) {
                return `Flat-calling with a monster: just calling instead of raising disguises your hand strength — this lets villain continue bluffing or value-betting thinner on later streets.`;
            }
        }

        return '';
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 83: BOARD COVERAGE — RANGE BET VS. POLAR BET STRATEGY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 83: Explain when the solver uses a range bet vs. polar bet strategy.
     * Range bet = small sizing with most of your range (33% pot with 70%+ frequency).
     * Polar bet = larger sizing with a selected subset (value + bluffs only).
     *
     * This is board-texture-dependent:
     *   - Dry A-high boards: range bet (PFR has massive range advantage)
     *   - Wet connected boards: more selective/polar (both ranges connect)
     *   - Paired boards: range bet with small sizing (hard for either range to have it)
     *   - Low boards: polar (caller's range connects more)
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {number} sizePct - Bet sizing percentage
     * @param {number} freq - Frequency of the optimal action (0.0-1.0)
     * @param {Object} texture - Board texture
     * @param {string} nodeType - Node type
     * @param {string} heroPosition - Hero's position
     * @returns {string} Board coverage strategy note
     */
    _getBoardCoverageNote(optimalAction, handStrength, street, sizePct, freq, texture, nodeType, heroPosition) {
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        if (!isBet || street !== 'flop' || !texture) return ''; // Most relevant on flop c-bets

        const isAggressor = nodeType === 'hero_bets_or_checks';
        if (!isAggressor) return ''; // Range/polar concepts apply to aggressor strategy

        // Detect range bet pattern: small sizing + high frequency
        const isRangeBet = sizePct <= 40 && freq >= 0.60;
        // Detect polar bet pattern: large sizing + lower frequency
        const isPolarBet = sizePct >= 60 && freq <= 0.50;

        if (isRangeBet) {
            if (texture.aceHigh && texture.dry) {
                return `Board coverage: this is a range bet spot — the A-high dry board heavily favors the preflop raiser\'s range. Bet small and frequently because villain\'s range rarely connects.`;
            }
            if (texture.paired && !texture.wet) {
                return `Board coverage: paired dry boards favor range betting — neither range hits trips often, but the aggressor\'s wider range of overcards and draws benefits from frequent small pressure.`;
            }
            if (texture.dry && !texture.lowBoard) {
                return `Board coverage: dry board = range bet. Bet small with most hands because the board doesn\'t help either range much, and small bets are efficient at winning dead money.`;
            }
            return `Board coverage: the solver is using a range-bet approach here — small sizing with high frequency across many hand types to put consistent pressure.`;
        }

        if (isPolarBet) {
            if (texture.wet) {
                return `Board coverage: wet board = polar betting. The solver bets selectively with strong made hands and draws, skipping medium holdings that prefer pot control.`;
            }
            if (texture.lowBoard) {
                return `Board coverage: low boards favor the caller\'s range — the aggressor can\'t range bet profitably, so they go polar with strong value hands and select bluffs.`;
            }
            if (texture.connected && texture.straightDrawHeavy) {
                return `Board coverage: highly connected board = polar strategy. Both ranges connect, so only strong hands and draws with equity justify building the pot.`;
            }
            return `Board coverage: polar betting spot — the solver is selective about which hands to bet, using a larger size with fewer hands for maximum leverage.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 84: MULTI-STREET EV PROJECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 84: Project how the current action affects future street EV.
     * Explains the multi-street implications:
     *   - Building the pot for value hands (geometric sizing)
     *   - Preserving fold equity for bluffs across streets
     *   - The concept of "pot geometry" — sizing to get stacks in by river
     *   - Why checking now can set up bigger future bets
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {number} sizePct - Bet sizing percentage
     * @param {number} estimatedPot - Current pot size
     * @param {number} stackDepth - Stack depth in BB
     * @param {Object} texture - Board texture
     * @returns {string} Multi-street EV projection note
     */
    _getMultiStreetEVNote(optimalAction, handStrength, street, sizePct, estimatedPot, stackDepth, texture) {
        if (!estimatedPot || !stackDepth || street === 'river') return '';
        const a = (optimalAction || '').toLowerCase();
        const hc = (handStrength || '').toLowerCase();
        const spr = stackDepth / estimatedPot;

        // ─── Geometric sizing for value ───
        if (a.startsWith('b') && spr > 2 && street === 'flop') {
            const isValue = hc.includes('overpair') || hc.includes('top pair') || hc.includes('set') || hc.includes('two pair') || hc.includes('flush') || hc.includes('straight');
            if (isValue) {
                // Calculate geometric pot growth to get stacks in by river
                // 3 streets remaining from flop: need pot to grow by spr factor over 3 bets
                const streetsLeft = street === 'flop' ? 3 : 2;
                const geoSize = Math.round((Math.pow(1 + spr, 1 / streetsLeft) - 1) * 100);
                if (geoSize > 20 && geoSize < 200) {
                    return `Multi-street plan: with ${streetsLeft} streets left and SPR ${spr.toFixed(1)}, geometric sizing of ~${geoSize}% pot per street gets all the money in by the river. This bet sets up the ideal pot trajectory for your value hand.`;
                }
            }
        }

        // ─── Check-to-bet lines ───
        if ((a === 'c' || a === 'x') && street === 'flop') {
            const isDrawy = hc.includes('draw') || hc.includes('gutshot') || hc.includes('oesd');
            if (isDrawy) {
                return `Multi-street plan: checking the flop with a draw preserves your stack for when you hit — on the turn, you can either bet with a made hand or check again for a free river.`;
            }
            const isStrong = hc.includes('set') || hc.includes('two pair') || hc.includes('overpair');
            if (isStrong && spr > 4) {
                return `Multi-street plan: checking a strong hand on the flop can set up bigger turn and river bets — if villain bets, you can check-raise; if they check, you can overbet later streets.`;
            }
        }

        // ─── Turn barrel implications ───
        if (a.startsWith('b') && street === 'turn') {
            const streetsLeft = 1; // Only river remains
            const newPot = estimatedPot * (1 + sizePct / 50); // Rough pot after bet+call
            const remainingStack = stackDepth - (estimatedPot * sizePct / 100);
            if (remainingStack > 0 && newPot > 0) {
                const riverSPR = remainingStack / newPot;
                if (riverSPR < 1) {
                    return `Multi-street plan: this turn bet sets up a river all-in — after bet and call, the remaining stack-to-pot ratio will be under 1, committing you on the river.`;
                }
                if (riverSPR >= 1 && riverSPR <= 2) {
                    return `Multi-street plan: this turn sizing leaves a pot-sized river bet — clean pot geometry that maximizes value or fold equity on the final street.`;
                }
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 85: KICKER STRENGTH AWARENESS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 85: Explain how kicker strength affects the decision.
     * Players often undervalue kicker differences:
     *   - Top pair top kicker (TPTK) is much stronger than top pair weak kicker (TPWK)
     *   - Kicker matters most in heads-up pots and on dry boards
     *   - Dominated kickers (KJ vs KQ) have very low equity
     *
     * @param {string} heroHand - Hero's hand notation
     * @param {string} handStrength - categorizeHand() output
     * @param {string[]} board - Board cards
     * @param {string} optimalAction - GTO correct action
     * @param {string} street - Current street
     * @returns {string} Kicker context note
     */
    _getKickerNote(heroHand, handStrength, board, optimalAction, street) {
        if (!heroHand || heroHand.length < 2 || !board || board.length < 3) return '';
        const hc = (handStrength || '').toLowerCase();

        // Only relevant for one-pair hands (top pair, middle pair, overpair)
        if (!hc.includes('pair') || hc.includes('two pair') || hc.includes('set') || hc.includes('trips')) return '';

        const r1 = heroHand[0].toUpperCase();
        const r2 = heroHand[1].toUpperCase();
        const rankOrder = '23456789TJQKA';
        const v1 = rankOrder.indexOf(r1);
        const v2 = rankOrder.indexOf(r2);
        const boardRanks = board.map(c => c[0].toUpperCase());
        const boardVals = boardRanks.map(r => rankOrder.indexOf(r));

        // Find which card is the pair and which is the kicker
        let pairCard, kickerVal;
        if (boardRanks.includes(r1)) {
            pairCard = r1;
            kickerVal = v2;
        } else if (boardRanks.includes(r2)) {
            pairCard = r2;
            kickerVal = v1;
        } else if (v1 === v2) {
            // Pocket pair — kicker is irrelevant for pair vs pair
            return '';
        } else {
            return ''; // Neither card pairs the board — overpair or something else
        }

        const a = (optimalAction || '').toLowerCase();
        const kickerRank = rankOrder[kickerVal];

        // Top pair analysis
        if (hc.includes('top pair')) {
            if (kickerVal >= 12) { // A kicker
                return `Kicker context: TPTK (top pair, top kicker) — your A kicker is the best possible. This hand can confidently bet for value across streets.`;
            }
            if (kickerVal >= 11) { // K kicker
                return `Kicker context: top pair with K kicker — very strong. Only Ax hands have a better kicker, and those are a small portion of villain's range.`;
            }
            if (kickerVal >= 9) { // Q-J kicker
                return `Kicker context: top pair with ${kickerRank} kicker — solid but not premium. Be cautious against raises, as better kickers (A/K) are possible.`;
            }
            if (kickerVal <= 6) { // 8 or lower
                if (a === 'c' || a === 'x' || a === 'f') {
                    return `Kicker context: top pair weak kicker (${kickerRank}) — your hand is vulnerable to domination. Many hands in villain's range have the same pair with a better kicker, making this a check/call at best.`;
                }
                return `Kicker context: top pair weak kicker (${kickerRank}) — be careful. Your hand can be dominated by the same pair with A/K/Q/J kicker.`;
            }
        }

        // Middle/bottom pair kicker
        if (hc.includes('middle pair') || hc.includes('bottom pair') || hc.includes('second pair')) {
            if (kickerVal >= 12) {
                return `Kicker context: ${hc} with A kicker — the best possible kicker elevates this medium-strength hand. Worth calling lighter than with a weak kicker.`;
            }
            if (kickerVal <= 7) {
                return `Kicker context: ${hc} with weak kicker (${kickerRank}) — this hand is at the bottom of the calling range. Folding to significant pressure is often correct.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 86: NUT ADVANTAGE DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 86: Detect which player has the nut advantage on this board texture.
     * Nut advantage = who is more likely to have the strongest hands.
     * This drives sizing, bluffing frequency, and checking strategy.
     *
     * @param {string[]} board - Board cards
     * @param {string} heroPosition - Hero's position
     * @param {string} villainPosition - Villain's position
     * @param {string} street - Current street
     * @param {Object} texture - Board texture
     * @param {string} nodeType - Node type
     * @returns {string} Nut advantage context note
     */
    _getNutAdvantageNote(board, heroPosition, villainPosition, street, texture, nodeType) {
        if (!board || board.length < 3 || !heroPosition || !villainPosition || street === 'preflop') return '';

        const boardRanks = board.map(c => c[0].toUpperCase());
        const boardVals = boardRanks.map(r => '23456789TJQKA'.indexOf(r));
        const highestBoard = Math.max(...boardVals);
        const isPFR = nodeType === 'hero_bets_or_checks'; // Simplified: aggressor = PFR

        // Determine if hero was likely the preflop raiser
        const earlyPositions = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ'];
        const latePositions = ['CO', 'BTN'];
        const blinds = ['SB', 'BB'];

        const heroIsPFR = !blinds.includes(heroPosition); // Simplified: non-blind = likely raiser
        const villainIsBB = villainPosition === 'BB';

        // ─── A-high boards ───
        if (highestBoard === 12) { // Ace on board
            if (heroIsPFR) {
                return 'Nut advantage: PFR has the nut advantage on A-high boards — more Ax combos in the raising range than the caller\'s range. This supports aggressive play.';
            }
            return 'Nut advantage: the raiser has more Ax combos on this A-high board. As the caller, be cautious — your range is capped more than villain\'s.';
        }

        // ─── K-high boards ───
        if (highestBoard === 11 && !boardRanks.includes('A')) {
            if (heroIsPFR) {
                return 'Nut advantage: PFR has a significant nut advantage on K-high boards — more KK/AK combos vs. caller\'s wider but weaker range.';
            }
        }

        // ─── Low/medium boards (7-high and below) ───
        if (highestBoard <= 5) {
            if (villainIsBB && heroIsPFR) {
                return 'Nut advantage: low boards favor the BB defender — their wider preflop range (small pairs, suited connectors) connects heavily here. PFR\'s range advantage is reduced.';
            }
        }

        // ─── Monotone boards ───
        if (texture && texture.monotone) {
            if (villainIsBB) {
                return 'Nut advantage: monotone boards shift nut advantage toward the caller — suited hands are more common in BB\'s wide defense range than in PFR\'s tighter range.';
            }
            if (heroIsPFR) {
                return 'Nut advantage: on monotone boards, be cautious — the caller often has more suited combos. Your nut advantage is reduced unless you hold the nut flush draw.';
            }
        }

        // ─── Paired boards ───
        if (texture && texture.paired) {
            if (heroIsPFR) {
                return 'Nut advantage: paired boards generally favor the PFR — trips and full houses come from pocket pairs, which the raiser has more of.';
            }
        }

        // ─── Connected low-mid boards ───
        if (texture && texture.connected && highestBoard <= 8) {
            if (villainIsBB) {
                return 'Nut advantage: connected middle/low boards favor the caller\'s range — suited connectors and small pairs hit these boards hard.';
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 87: BACKDOOR EQUITY AWARENESS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 87: Detect backdoor flush and straight draws that add equity.
     * Backdoor draws are hugely important in GTO play because they:
     *   - Add ~4-5% equity on the flop (2 cards to come)
     *   - Turn weak hands into semi-bluff candidates
     *   - Provide additional outs when combined with other draws
     *
     * @param {string} heroHand - Hero's hand notation
     * @param {string[]} board - Board cards
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @returns {string} Backdoor equity note
     */
    _getBackdoorEquityNote(heroHand, board, handStrength, street) {
        if (!heroHand || !board || board.length < 3 || street !== 'flop') return ''; // Only relevant on flop
        if (heroHand.length < 2) return '';

        const hc = (handStrength || '').toLowerCase();
        // Skip if already has a direct draw (the draw itself is more important)
        if (hc.includes('flush draw') || hc.includes('oesd') || hc.includes('combo draw') || hc.includes('monster draw')) return '';

        const r1 = heroHand[0].toUpperCase();
        const r2 = heroHand[1].toUpperCase();
        const isSuited = heroHand.length >= 3 && heroHand[2] === 's';

        const boardSuits = board.map(c => c[1]?.toLowerCase());
        const boardRanks = board.map(c => c[0].toUpperCase());
        const boardVals = boardRanks.map(r => '23456789TJQKA'.indexOf(r));
        const heroV1 = '23456789TJQKA'.indexOf(r1);
        const heroV2 = '23456789TJQKA'.indexOf(r2);

        const backdoors = [];

        // ─── Backdoor flush draw ───
        if (isSuited) {
            // Check if one board card matches hero's suit
            // Since hero is suited, both hero cards share a suit
            // We need 1 board card of that suit to have a backdoor flush draw (need 2 more of same suit)
            const suitCounts = {};
            boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
            // Hero needs a suit with exactly 1 board card (so 2 hero + 1 board = 3, need 2 more = backdoor)
            // Actually: backdoor flush = 2 cards of same suit on the flop (hero has 2). 1 board card of that suit = 3 total.
            // We need 2 more of that suit to come on turn+river.
            // The condition: hero suited + at least 1 board card of same suit but NOT 2 (that would be a direct flush draw)
            const heroSuit = isSuited ? 's' : ''; // We don't know the actual suit but can infer
            // Simpler check: if suited hand and board has 1 card of any single suit matching, it's a backdoor
            // Since we generated hero's cards to match suit in parseHandToCards, check if any suit appears exactly once
            const hasPotentialBackdoor = Object.values(suitCounts || {}).some(c => c === 1);
            if (hasPotentialBackdoor && !Object.values(suitCounts || {}).some(c => c >= 2)) {
                const highCard = Math.max(heroV1, heroV2);
                if (highCard >= 12) {
                    backdoors.push('nut backdoor flush draw (suited with A)');
                } else if (highCard >= 11) {
                    backdoors.push('strong backdoor flush draw (suited with K)');
                } else {
                    backdoors.push('backdoor flush draw');
                }
            }
        }

        // ─── Backdoor straight draw ───
        // Check if hero's cards connect with 1-2 board cards to create a 3-card straight base
        const allVals = [...new Set([...boardVals, heroV1, heroV2])].sort((a, b) => a - b);
        // Count 5-card windows where hero contributes at least 1 card and total >= 3
        let hasBackdoorStraight = false;
        for (let low = -1; low <= 8; low++) {
            const window = [];
            for (let j = 0; j < 5; j++) {
                let v = low + j;
                if (v === -1) v = 12; // Ace-low
                window.push(v);
            }
            const windowSet = new Set(window);
            const heroInWindow = windowSet.has(heroV1) || windowSet.has(heroV2);
            const boardInWindow = boardVals.filter(v => windowSet.has(v)).length;
            const totalInWindow = allVals.filter(v => windowSet.has(v)).length;

            // Backdoor straight: 3 cards in a 5-card window, hero contributes, need 2 more
            if (heroInWindow && totalInWindow === 3 && boardInWindow >= 1 && boardInWindow <= 2) {
                hasBackdoorStraight = true;
                break;
            }
        }
        if (hasBackdoorStraight && !hc.includes('gutshot') && !hc.includes('straight')) {
            backdoors.push('backdoor straight draw');
        }

        if (backdoors.length === 0) return '';

        const bdList = backdoors.join(' + ');
        if (hc.includes('pair')) {
            return `Backdoor equity: your ${bdList} adds ~4-5% equity on top of your made hand — this makes your hand significantly more playable across streets.`;
        }
        if (hc.includes('air') || hc.includes('no pair') || hc.includes('overcard')) {
            return `Backdoor equity: your ${bdList} is critical for this hand — without it, this would be pure air. The backdoor potential makes this a viable semi-bluff candidate.`;
        }
        return `Backdoor equity: ${bdList} — adds hidden equity that improves your hand's playability on future streets.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 88: PROTECTION URGENCY CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 88: Explain whether protection betting is urgent or unnecessary.
     * Protection = betting to deny equity to drawing hands.
     *
     * Urgency depends on:
     *   - Board wetness (more draws = more urgency)
     *   - Hand vulnerability (top pair < set in terms of needing protection)
     *   - Position (OOP has more urgency to protect than IP)
     *   - Stack depth (deeper = more implied odds for draws = more protection needed)
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {Object} texture - Board texture
     * @param {string} heroPosition - Hero's position
     * @param {string} villainPosition - Villain's position
     * @returns {string} Protection urgency note
     */
    _getProtectionNote(optimalAction, handStrength, street, texture, heroPosition, villainPosition) {
        if (!handStrength || street === 'preflop' || street === 'river') return '';
        const a = (optimalAction || '').toLowerCase();
        const hc = handStrength.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isIP = this._isInPosition(heroPosition, villainPosition);

        // Protection only matters for vulnerable made hands
        const isVulnerable = hc.includes('pair') && !hc.includes('two pair') && !hc.includes('set') && !hc.includes('full house');
        const isInvulnerable = hc.includes('set') || hc.includes('full house') || hc.includes('quads') || hc.includes('nut flush') || hc.includes('nut straight');

        if (!isVulnerable && !isInvulnerable) return '';

        if (isVulnerable && isBet) {
            if (texture && texture.wet) {
                return `Protection: betting is urgent — the wet board gives villain many drawing combinations. Checking lets them realize equity cheaply against your vulnerable ${hc}.`;
            }
            if (texture && texture.straightDrawHeavy) {
                return `Protection: straight draw heavy board requires a protection bet — many hands in villain\'s range have straight draws that erode your equity significantly.`;
            }
            if (!isIP && texture && !texture.dry) {
                return `Protection: betting OOP for protection is important here — if you check, villain gets a free card IP and can bet you off your hand on scary runouts.`;
            }
        }

        if (isVulnerable && isCheck) {
            if (texture && texture.dry) {
                return `No protection needed: the dry board has few draws that threaten your hand. Checking is fine — you can call future bets or bet later streets.`;
            }
            if (isIP) {
                return `Protection not urgent IP: you can control the pot by checking back. If a scary card comes, you save money; if a blank comes, you can bet for value later.`;
            }
        }

        if (isInvulnerable && isCheck) {
            return `No protection needed: your hand is nearly invulnerable — very few runouts hurt you. Slow-playing is viable to extract maximum value.`;
        }

        if (isInvulnerable && isBet && texture && texture.wet) {
            return `Strong but bet anyway: even with a near-invulnerable hand, the wet board means villain has many draws. Betting denies equity AND extracts value from draws.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 89: SHOWDOWN VALUE VS. BLUFF DICHOTOMY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 89: Clarify whether a hand should try to reach showdown cheaply
     * (showdown value) or should be used as a bluff (no showdown value).
     *
     * This is one of the most fundamental GTO concepts:
     *   - Hands with showdown value (pairs, overcards) should usually check/call
     *   - Hands without showdown value (air, weak draws) should bet as bluffs
     *   - Medium-strength hands are the toughest — sometimes both strategies apply
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {string} nodeType - Node type
     * @returns {string} Showdown value context note
     */
    _getShowdownValueNote(optimalAction, handStrength, street, nodeType) {
        if (!handStrength) return '';
        const a = (optimalAction || '').toLowerCase();
        const hc = handStrength.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';

        // ─── No showdown value → bluff candidate ───
        const noShowdown = hc.includes('air') || hc.includes('no pair') || (hc.includes('overcard') && !hc.includes('draw'));

        if (noShowdown && isBet) {
            if (street === 'river') {
                return 'Showdown value: zero — your hand can\'t win at showdown, so betting as a bluff is the only way to profit. Choose bluffs with good blockers to nutted hands.';
            }
            return 'Showdown value: very low — your hand needs to bet to win the pot since it can\'t win at showdown. This is a profitable bluff spot when you have fold equity.';
        }
        if (noShowdown && isCheck) {
            return 'Showdown value: none — checking here gives up on the pot. Sometimes this is correct to keep your checking range balanced, but you\'re surrendering equity.';
        }
        if (noShowdown && isFold) {
            return 'Showdown value: none — folding is correct because you have no equity, no draw, and no fold equity if you bet.';
        }

        // ─── Strong showdown value → protect it ───
        const strongShowdown = hc.includes('overpair') || hc.includes('top pair') || hc.includes('set') || hc.includes('two pair') || hc.includes('flush') || hc.includes('straight');

        if (strongShowdown && isCheck && street === 'river') {
            return 'Showdown value: high — your hand is strong enough to win at showdown. Checking aims to induce bluffs or because villain\'s calling range is too strong to value bet against.';
        }

        // ─── Medium showdown value → the decision is nuanced ───
        const mediumShowdown = hc.includes('middle pair') || hc.includes('bottom pair') || hc.includes('second pair') || hc.includes('weak pair');

        if (mediumShowdown && isCheck) {
            return 'Showdown value: medium — your hand has some showdown value but isn\'t strong enough to bet for value. Check-call to realize your equity without bloating the pot.';
        }
        if (mediumShowdown && isBet) {
            return 'Showdown value: medium but betting anyway — this could be thin value against worse hands or a merge-bet that uses your equity edge. Be aware your hand is vulnerable if raised.';
        }
        if (mediumShowdown && isCall && nodeType === 'hero_faces_bet') {
            return 'Showdown value: medium — calling is correct because you beat bluffs and some thin value bets. Folding would over-fold your range in this spot.';
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 90: SESSION WEAKNESS SUMMARY GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 90: Generate a comprehensive session weakness summary.
     * Analyzes mistake tracker data to produce an actionable summary of:
     *   - Top 3 weakness categories
     *   - Specific patterns (e.g., "folding too much on rivers")
     *   - Improvement suggestions
     *
     * Called externally after session ends or at checkpoints.
     *
     * @param {number} minSamples - Minimum samples for a pattern to be reported
     * @returns {Object} { summary: string, weaknesses: Array, strengths: Array, totalQuestions: number }
     */
    generateSessionSummary(minSamples = 3) {
        if (!this._mistakeTracker) return { summary: 'Not enough data yet.', weaknesses: [], strengths: [], totalQuestions: 0 };

        const entries = Object.entries(this._mistakeTracker || {})
            .filter(([_, v]) => v.total >= minSamples)
            .map(([key, v]) => ({
                key,
                total: v.total,
                mistakes: v.mistakes,
                mistakeRate: v.mistakes / v.total,
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
// @@PUB_REGION_16@@
