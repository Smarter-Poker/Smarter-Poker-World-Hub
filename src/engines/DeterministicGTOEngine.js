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
            }
            if (texture.wet) return `At the minimum defense frequency on a wet board — many draws increase villain's semi-bluff frequency, but this hand is at the threshold of profitability.`;
            return `At the minimum defense frequency boundary — this hand is nearly indifferent between continuing and folding. Defending slightly more than breakeven prevents exploitation.`;
        }

        // Fold vs Call vs Raise three-way mix
        const hasFold = sorted.some(s => s.toLowerCase() === 'f');
        const hasCall = sorted.some(s => s.toLowerCase() === 'call');
        const hasRaise = sorted.some(s => s.toLowerCase().startsWith('r') || s.toLowerCase() === 'allin');
        if (hasFold && hasCall && hasRaise) {
            return `Three-way mix (fold/call/raise)${texTag} — this hand is at a complex indifference point where all three actions yield similar EV. The solver distributes across all lines to maintain perfect balance.`;
        }

        return `Multiple actions at the Nash equilibrium indifference point — all mixed-in actions yield identical EV. Deviating from these frequencies creates exploitable imbalances.`;
    }

    /**
     * Phase 26: Preflop-specific explanation with position awareness,
     * hand category reasoning, and open/3bet/call context.
     */
    _buildPreflopExplanation(heroHand, optimalAction, handActions, freq, freqPct, label, validActions, nodeType, heroPosition, villainPosition, stackDepth, potType) {
        const baseExpl = this._buildPreflopExplanationCore(heroHand, optimalAction, handActions, freq, freqPct, label, validActions, nodeType, heroPosition, villainPosition, stackDepth, potType);
        return this._appendPreflopContext(baseExpl, heroHand, heroPosition, villainPosition, optimalAction, nodeType, potType);
    }

    _buildPreflopExplanationCore(heroHand, optimalAction, handActions, freq, freqPct, label, validActions, nodeType, heroPosition, villainPosition, stackDepth, potType) {
        const r1 = heroHand[0], r2 = heroHand[1];
        const suffix = heroHand.length >= 3 ? heroHand[2] : '';
        const isPair = r1 === r2;
        const isSuited = suffix === 's';
        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const v1 = rankVal(r1), v2 = rankVal(r2);
        const isConnected = Math.abs(v1 - v2) <= 2 && !isPair;
        const isBroadway = v1 >= 8 && v2 >= 8; // T+ (T is index 8)
        const isPremium = isPair && v1 >= 10; // JJ+
        const isSuperPremium = isPair && v1 >= 11; // QQ+
        const isAx = r1 === 'A' || r2 === 'A';
        const isKx = (r1 === 'K' || r2 === 'K') && !isAx;

        const a = optimalAction.toLowerCase();
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r') || a === 'allin';

        // Position context
        const posName = heroPosition || 'Hero';
        const isEarlyPos = ['UTG', 'UTG+1'].includes(heroPosition);
        const isMiddlePos = ['MP', 'MP+1', 'HJ'].includes(heroPosition);
        const isLatePos = ['CO', 'BTN'].includes(heroPosition);
        const isBlind = ['SB', 'BB'].includes(heroPosition);

        // Hand description
        let handDesc = '';
        if (isSuperPremium) handDesc = 'a premium pair';
        else if (isPremium) handDesc = 'a strong pair';
        else if (isPair && v1 >= 6) handDesc = 'a medium pocket pair';
        else if (isPair) handDesc = 'a small pocket pair';
        else if (isAx && isSuited && v2 >= 9) handDesc = 'a strong suited ace';
        else if (isAx && isSuited) handDesc = 'a suited ace';
        else if (isAx && isBroadway) handDesc = 'a strong offsuit broadway';
        else if (isBroadway && isSuited) handDesc = 'suited broadway';
        else if (isBroadway) handDesc = 'offsuit broadway';
        else if (isKx && isSuited) handDesc = 'a suited king';
        else if (isConnected && isSuited) handDesc = 'a suited connector';
        else if (isConnected) handDesc = 'an offsuit connector';
        else if (isSuited) handDesc = 'a suited hand';
        else handDesc = 'an offsuit hand';

        // ═══ OPEN RAISE (RFI) ═══
        // Phase 41: Stack-depth-aware open raise explanations
        if (nodeType === 'preflop_open') {
            const stackNote = stackDepth ? (stackDepth <= 20 ? ` At ${stackDepth}BB, opening ranges tighten due to high SPR risk.` : stackDepth <= 40 ? '' : ` Deep-stacked — implied odds favor suited/connected hands.`) : '';
            if (isRaise) {
                if (freq >= 0.95) {
                    if (isPremium) return `${heroHand}: Always open ${handDesc} from ${posName}. ${this._positionOpenContext(heroPosition)}${stackNote}`;
                    if (isLatePos && isSuited && isConnected) return `${heroHand}: Pure open from ${posName}. ${handDesc} — ideal steal hand with playability, suitedness, and connectivity.${stackNote}`;
                    if (isLatePos) return `${heroHand}: Pure open from ${posName}. ${handDesc} — wide opening range in late position to steal blinds.${stackNote}`;
                    if (isEarlyPos) return `${heroHand}: Pure open from ${posName}. ${handDesc} strong enough to open even in early position against many opponents.${stackNote}`;
                    if (isBlind) return `${heroHand}: Pure open from ${posName}. ${handDesc} — stealing from the small blind with only BB to get through.${stackNote}`;
                    return `${heroHand}: Pure open from ${posName}. ${handDesc} is always in the opening range here.${stackNote}`;
                }
                const foldFreq = handActions['f'] ? (handActions['f'] * 100).toFixed(0) : null;
                if (foldFreq) {
                    return `${heroHand}: Open ${freqPct}%, fold ${foldFreq}% from ${posName}. ${handDesc} is at the boundary of the opening range — the solver mixes to stay balanced.${stackNote}`;
                }
                return `${heroHand}: Open ${freqPct}% from ${posName}. ${handDesc} — marginal open that the solver mixes.${stackNote}`;
            }
            if (isFold) {
                if (freq >= 0.95) {
                    if (isEarlyPos) {
                        if (!isPair && !isSuited && !isBroadway) return `${heroHand}: Pure fold from ${posName}. ${handDesc} — offsuit non-broadway hands are never in the ~13% EP opening range. Needs suitedness, connectivity, or high cards.${stackNote}`;
                        return `${heroHand}: Pure fold from ${posName}. ${handDesc} — too weak for the tight ~13% opening range with 5+ players behind.${stackNote}`;
                    }
                    if (isMiddlePos) return `${heroHand}: Pure fold from ${posName}. ${handDesc} falls outside the ~20% MP opening range — not enough playability to open profitably.${stackNote}`;
                    if (heroPosition === 'CO') return `${heroHand}: Fold from CO. ${handDesc} — falls just outside the ~30% CO opening range. Marginal hand that doesn't play well enough postflop.${stackNote}`;
                    if (heroPosition === 'BTN') return `${heroHand}: Fold from BTN. Even with the widest opening range (~45%), ${handDesc} doesn't have enough playability to open profitably.${stackNote}`;
                    if (isBlind) return `${heroHand}: Fold from ${posName}. ${handDesc} — even with the positional discount, this hand plays too poorly postflop out of position.${stackNote}`;
                    return `${heroHand}: Fold from ${posName}. ${handDesc} is outside the opening range.${stackNote}`;
                }
                if (isEarlyPos) return `${heroHand}: Fold ${freqPct}% from ${posName}. At the very edge of the ~13% EP opening range — the solver mostly folds this hand from early position.${stackNote}`;
                if (isLatePos) return `${heroHand}: Fold ${freqPct}% from ${posName}. Borderline hand at the bottom of the opening range — the solver sometimes folds to stay balanced.${stackNote}`;
                return `${heroHand}: Fold ${freqPct}% from ${posName}. Marginal hand at the edge of the opening range.${stackNote}`;
            }
        }

        // ═══ FACING A RAISE ═══
        // Phase 41: Pot-type-aware — differentiates facing open (3-bet decision) from facing 3-bet (4-bet decision)
        if (nodeType === 'preflop_facing_raise') {
            const vs = villainPosition || 'opponent';
            const isFacing3Bet = potType === '3-Bet Pot' || potType === '4-Bet Pot';
            const stackContext = stackDepth ? (stackDepth <= 25 ? ` At ${stackDepth}BB effective, stack-off thresholds are lower.` : stackDepth <= 50 ? ` At ${stackDepth}BB, you need to consider stack-to-pot ratio carefully.` : '') : '';

            if (isFacing3Bet) {
                // ═══ FACING A 3-BET (4-bet, call, or fold) ═══
                if (isRaise) {
                    if (freq >= 0.95) {
                        if (isSuperPremium) return `${heroHand}: Always 4-bet ${handDesc} vs ${vs}'s 3-bet. This is a mandatory value 4-bet — trap with AA/KK only at exploitative frequencies.${stackContext}`;
                        if (isPremium) return `${heroHand}: Pure 4-bet vs ${vs}'s 3-bet. ${handDesc} is too strong to flat — re-raising for value and pot control.${stackContext}`;
                        if (isAx && isSuited) return `${heroHand}: Pure 4-bet bluff vs ${vs}'s 3-bet. ${handDesc} blocks AA/AK in villain's value range (removing ~16 combos) and has nut potential if called.${stackContext}`;
                        if (isKx && isSuited) return `${heroHand}: Pure 4-bet bluff vs ${vs}'s 3-bet. ${handDesc} blocks KK and AK combos, reducing villain's premium holdings — a balanced 4-bet bluff.${stackContext}`;
                        return `${heroHand}: Pure 4-bet vs ${vs}'s 3-bet. Strong enough to continue aggressively in a 3-bet pot.${stackContext}`;
                    }
                    const callFreq = handActions['call'] ? (handActions['call'] * 100).toFixed(0) : null;
                    if (callFreq && parseInt(callFreq) > 5) {
                        return `${heroHand}: 4-bet ${freqPct}%, call ${callFreq}% vs ${vs}'s 3-bet. ${handDesc} — the solver mixes to keep its 4-bet and flatting ranges balanced.${stackContext}`;
                    }
                    return `${heroHand}: 4-bet ${freqPct}% vs ${vs}'s 3-bet. ${handDesc} at the boundary of the 4-bet range.${stackContext}`;
                }
                if (isCall) {
                    if (freq >= 0.95) {
                        if (isPair && v1 >= 8) return `${heroHand}: Flat the 3-bet with ${handDesc}. Set mining is very profitable in 3-bet pots — if you hit, villain's range is strong enough to pay off.${stackContext}`;
                        if (isBroadway && isSuited) return `${heroHand}: Call the 3-bet. ${handDesc} has enough equity and playability to continue in a 3-bet pot without bloating it further.${stackContext}`;
                        return `${heroHand}: Call vs ${vs}'s 3-bet. ${handDesc} is too good to fold but not strong enough to 4-bet — flatting to realize equity.${stackContext}`;
                    }
                    const fourBetFreq = validActions.filter(a2 => a2.startsWith('r')).map(a2 => handActions[a2] || 0).reduce((s, v) => s + v, 0);
                    if (fourBetFreq > 0.05) {
                        return `${heroHand}: Call ${freqPct}%, 4-bet ${(fourBetFreq * 100).toFixed(0)}% vs ${vs}'s 3-bet. Solver balances between defending flat and re-raising.${stackContext}`;
                    }
                    return `${heroHand}: Call ${freqPct}% vs ${vs}'s 3-bet. Borderline defend at the bottom of the flatting range.${stackContext}`;
                }
                if (isFold) {
                    if (freq >= 0.95) {
                        if (!isAx && !isKx) return `${heroHand}: Fold vs ${vs}'s 3-bet. ${handDesc} — not enough equity to continue, and no blockers to villain's premium range (AA/KK/AK).${stackContext}`;
                        return `${heroHand}: Fold vs ${vs}'s 3-bet. ${handDesc} — not enough equity to continue against a polarized 3-bet range. Pot odds don't justify calling.${stackContext}`;
                    }
                    const callFreq2 = handActions['call'] ? (handActions['call'] * 100).toFixed(0) : null;
                    if (callFreq2 && parseInt(callFreq2) > 5) {
                        return `${heroHand}: Fold ${freqPct}%, call ${callFreq2}% vs ${vs}'s 3-bet. The solver sometimes defends this hand but mostly folds facing aggression.${stackContext}`;
                    }
                    return `${heroHand}: Fold ${freqPct}% vs ${vs}'s 3-bet. ${handDesc} doesn't have enough equity or playability to continue.${stackContext}`;
                }
            } else {
                // ═══ FACING AN OPEN (3-bet, call, or fold) ═══
                if (isRaise) {
                    if (freq >= 0.95) {
                        if (isPremium) return `${heroHand}: Always 3-bet ${handDesc} vs ${vs}'s open. Too strong to just call — build the pot preflop.${stackContext}`;
                        if (isAx && isSuited) return `${heroHand}: Pure 3-bet vs ${vs}. ${handDesc} — premium 3-bet bluff because the A blocks AA/AK (removes ~16 combos), plus suitedness gives nut potential.${stackContext}`;
                        if (isKx && isSuited) return `${heroHand}: Pure 3-bet vs ${vs}. ${handDesc} — the K blocks KK and AK, reducing villain's continue range. Good 3-bet bluff with playability.${stackContext}`;
                        if (isBlind) return `${heroHand}: Pure 3-bet from the blinds vs ${vs}. ${handDesc} — 3-betting compensates for being out of position postflop.${stackContext}`;
                        return `${heroHand}: Pure 3-bet vs ${vs}'s open. Strong enough to re-raise for value and build the pot.${stackContext}`;
                    }
                    const callFreq = handActions['call'] ? (handActions['call'] * 100).toFixed(0) : null;
                    if (callFreq && parseInt(callFreq) > 5) {
                        return `${heroHand}: 3-bet ${freqPct}%, call ${callFreq}% vs ${vs}. ${handDesc} — the solver mixes between building the pot and keeping the range wide.${stackContext}`;
                    }
                    return `${heroHand}: 3-bet ${freqPct}% vs ${vs}. ${handDesc} at the boundary of the 3-bet range.${stackContext}`;
                }
                if (isCall) {
                    if (freq >= 0.95) {
                        if (isPair && v1 >= 8) return `${heroHand}: Call vs ${vs}. ${handDesc} has great set-mining equity and implied odds — 3-betting risks losing action.${stackContext}`;
                        if (isBroadway && isSuited) return `${heroHand}: Call vs ${vs}. ${handDesc} plays well postflop — good equity and playability without bloating the pot.${stackContext}`;
                        if (isConnected && isSuited) return `${heroHand}: Call vs ${vs}. ${handDesc} has strong implied odds — when it connects, it makes big hands.${stackContext}`;
                        if (isBlind) return `${heroHand}: Defend from the blind vs ${vs}. ${handDesc} has enough equity to defend at this price — closing the action with a discount.${stackContext}`;
                        return `${heroHand}: Call vs ${vs}. Good equity against the opening range — calling maintains position and pot control.${stackContext}`;
                    }
                    const threeBetFreq = validActions.filter(a2 => a2.startsWith('r')).map(a2 => handActions[a2] || 0).reduce((s, v) => s + v, 0);
                    if (threeBetFreq > 0.05) {
                        return `${heroHand}: Call ${freqPct}%, 3-bet ${(threeBetFreq * 100).toFixed(0)}% vs ${vs}. The solver polarizes — sometimes flatting, sometimes 3-betting for balance.${stackContext}`;
                    }
                    return `${heroHand}: Call ${freqPct}% vs ${vs}. Marginal call at the bottom of the defending range.${stackContext}`;
                }
                if (isFold) {
                    if (freq >= 0.95) {
                        if (isBlind) return `${heroHand}: Fold from the blind vs ${vs}'s open. ${handDesc} — even with the discount, you don't have enough equity to defend profitably.${stackContext}`;
                        return `${heroHand}: Fold vs ${vs}'s open. ${handDesc} lacks sufficient equity and playability to continue profitably.${stackContext}`;
                    }
                    const callFreq2 = handActions['call'] ? (handActions['call'] * 100).toFixed(0) : null;
                    if (callFreq2 && parseInt(callFreq2) > 5) {
                        return `${heroHand}: Fold ${freqPct}%, call ${callFreq2}% vs ${vs}. Borderline hand — sometimes the solver defends, but it's mostly a fold.${stackContext}`;
                    }
                    return `${heroHand}: Fold ${freqPct}% vs ${vs}. At the edge of the defending range.${stackContext}`;
                }
            }
        }

        // ═══ Phase 30: BB OPTION (check or raise vs limp) ═══
        if (nodeType === 'preflop_bb_option') {
            const vs = villainPosition || 'limper';
            if (isRaise) {
                if (freq >= 0.95) {
                    if (isPremium || isSuperPremium) return `${heroHand}: Always raise ${handDesc} vs a limper. Punish passive play and build the pot with a premium.`;
                    if (isAx && isSuited) return `${heroHand}: Pure raise vs ${vs}'s limp. ${handDesc} plays well as a value-iso — charge weaker hands to see a flop.`;
                    return `${heroHand}: Raise vs the limp. ${handDesc} is strong enough to iso-raise and take the initiative.`;
                }
                const checkFreq = (handActions['x'] || handActions['c'] || 0) * 100;
                if (checkFreq > 10) {
                    return `${heroHand}: Raise ${freqPct}%, check ${checkFreq.toFixed(0)}% from BB. ${handDesc} — sometimes iso-raising, sometimes trapping in the big blind.`;
                }
                return `${heroHand}: Raise ${freqPct}% from BB. ${handDesc} at the boundary of the iso-raise range.`;
            }
            // Checking the BB option
            if (freq >= 0.95) {
                if (handDesc.includes('air') || handDesc.includes('offsuit')) {
                    return `${heroHand}: Check from BB vs limp. ${handDesc} — see a free flop with a marginal hand.`;
                }
                return `${heroHand}: Check from BB. ${handDesc} prefers to see a flop in position rather than bloating the pot.`;
            }
            return `${heroHand}: Check ${freqPct}% from BB. ${handDesc} — mixed between trapping and raising.`;
        }

        // Fallback
        return `${heroHand} (${handDesc}): ${label} ${freqPct}% from ${posName}.`;
    }

    /**
     * Phase 101-105 integration: Append preflop context notes to any preflop explanation.
     * Gathers relevant preflop theory notes and appends the top 1-2 to the base explanation.
     */
    _appendPreflopContext(baseExplanation, heroHand, heroPosition, villainPosition, optimalAction, nodeType, potType) {
        const notes = [];
        try {
            // Phase 101: Open range context (for preflop_open)
            if (nodeType === 'preflop_open') {
                const openCtx = this._getOpenRangeContext(heroPosition, heroHand);
                if (openCtx) notes.push(openCtx);
            }
            // Phase 102: 3-bet range context (for facing raise)
            if (nodeType === 'preflop_facing_raise') {
                const threeBetCtx = this._get3BetRangeContext(heroHand, heroPosition, villainPosition);
                if (threeBetCtx) notes.push(threeBetCtx);
            }
            // Phase 103: Squeeze context
            const squeezeCtx = this._getSqueezeContext(heroHand, heroPosition, nodeType, potType);
            if (squeezeCtx) notes.push(squeezeCtx);
            // Phase 104: Blind defense context
            if (nodeType === 'preflop_facing_raise' || nodeType === 'preflop_bb_option') {
                const blindCtx = this._getBlindDefenseContext(heroPosition, optimalAction, heroHand, villainPosition);
                if (blindCtx) notes.push(blindCtx);
            }
            // Phase 105: Position EV context
            const posEVCtx = this._getPositionEVContext(heroPosition);
            if (posEVCtx) notes.push(posEVCtx);
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

        if (notes.length === 0) return baseExplanation;
        // Apply depth mode — pick top 1-2 notes
        const depth = this._getExplanationDepth ? this._getExplanationDepth('preflop', null, optimalAction, nodeType, null) : 'standard';
        const maxNotes = depth === 'verbose' ? 3 : depth === 'concise' ? 0 : 2;
        if (maxNotes === 0) return baseExplanation;
        const selected = notes.slice(0, maxNotes);
        return `${baseExplanation} ${selected.join(' ')}`;
    }

    /**
     * Phase 26: Position-specific opening context.
     */
    _positionOpenContext(position) {
        switch (position) {
            case 'UTG': return 'UTG opens ~12-15% of hands (pairs 22+, ATo+, ATs+, KQo, KJs+, suited connectors 78s+). Many players behind means tight range.';
            case 'UTG+1': return 'UTG+1 opens ~15-17% — slightly wider than UTG but still conservative with 5+ players behind.';
            case 'MP': return 'MP opens ~18-20% — adds hands like KJo, QJs, T9s, 67s to the range.';
            case 'MP+1': return 'MP+1 opens ~20-22% — wider than MP, starts including more suited connectors and one-gappers.';
            case 'HJ': return 'HJ opens ~22-26% — the range expands to include A8o+, K9s+, suited one-gappers, and more offsuit broadways.';
            case 'CO': return 'CO opens ~27-32% — wide range with only BTN and blinds behind. Includes most suited hands, A2o+, and weak broadways.';
            case 'BTN': return 'BTN opens ~40-50% — the widest RFI range. Nearly all suited hands, most offsuit broadways, all pairs. Guaranteed position postflop.';
            case 'SB': return 'SB opens ~35-45% into only the BB — wide range for stealing but plays OOP postflop. Include more hands but size up (3x+).';
            case 'BB': return 'BB checking option — you already have money invested and close the action.';
            default: return '';
        }
    }

    buildChartExplanation(heroHand, chart, yesFreq, correctAction, isCallNode = false) {
        const pct = (yesFreq * 100).toFixed(0);
        const pos = chart.hero_position || chart.position || 'BTN';
        const stack = chart.stack_depth || 15;

        // Hand type reasoning
        const r1 = heroHand[0], r2 = heroHand[1];
        const isPair = r1 === r2;
        const isSuited = heroHand.length >= 3 && heroHand[2] === 's';
        const isHighCard = ['A', 'K', 'Q'].includes(r1);

        // ── Call node (BB defending vs an SB shove) — no fold equity exists,
        // so the shove-flavoured reasons below would be nonsense here.
        if (isCallNode) {
            if (correctAction === 'call') {
                let reason = '';
                if (isPair) reason = 'Pocket pairs realise their full equity all-in — no reverse implied odds.';
                else if (isHighCard) reason = 'High-card hands dominate enough of the shoving range to call profitably.';
                else if (isSuited) reason = 'The pot odds an all-in lays make this suited hand a profitable call.';
                else reason = 'Against a wide shoving range, the price makes this call profitable.';
                return `ICM: ${heroHand} is a ${pct}% call from ${pos} at ${stack}BB facing the shove. ${reason}`;
            }
            return `ICM: ${heroHand} is only a ${pct}% call from ${pos} at ${stack}BB facing the shove. `
                + `You have no fold equity when calling — the hand must win at showdown often enough, and this one doesn't.`;
        }

        if (correctAction === 'push') {
            let reason = '';
            if (isPair) reason = 'Pocket pairs have strong all-in equity against calling ranges.';
            else if (isHighCard && isSuited) reason = 'Suited broadway hands combine card removal, equity, and playability.';
            else if (isHighCard) reason = 'High card strength plus fold equity makes this a profitable shove.';
            else if (isSuited) reason = 'Suitedness adds ~3% equity, pushing this hand into shoving range.';
            else reason = 'Fold equity at this stack depth compensates for marginal hand strength.';

            if (stack <= 8) reason += ` At ${stack}BB, push-or-fold is optimal — no room for post-flop play.`;
            else if (stack <= 12) reason += ` At ${stack}BB, shoving preserves fold equity before the blinds eat further into your stack.`;

            return `ICM: ${heroHand} is a ${pct}% push from ${pos} at ${stack}BB. ${reason}`;
        }

        let foldReason = '';
        if (stack > 15) foldReason = `At ${stack}BB you have enough chips to wait for a better spot.`;
        else foldReason = `Even at ${stack}BB, this hand doesn't have enough equity against calling ranges to justify the risk.`;

        return `ICM: ${heroHand} is only a ${pct}% push from ${pos} at ${stack}BB. ${foldReason}`;
    }

    /**
     * Categorize hand strength relative to board (deterministic, no AI).
     * Phase 31: GTO Wizard-level precision — kicker quality, nut draw detection,
     * backdoor draws, board-relative strength labels.
     *
     * Detects: quads, full houses, flushes, straights, sets, trips, two pair,
     * overpairs, top pair (with kicker quality), second/bottom pair, underpairs,
     * nut/non-nut flush draws, OESD, gutshots, backdoor draws, overcards, air.
     */
    categorizeHand(heroHand, board) {
        if (!heroHand || heroHand.length < 2) return 'a hand';
        if (!board || board.length === 0) return 'a preflop hand';
        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);
        if (validBoard.length === 0) return 'a preflop hand';

        const r1 = heroHand[0].toUpperCase();
        const r2 = heroHand[1].toUpperCase();
        const isSuited = heroHand.length >= 3 && heroHand[2] === 's';
        const isPair = r1 === r2;
        const boardRanks = validBoard.map(c => c[0].toUpperCase());
        const boardSuits = validBoard.map(c => c[1]?.toLowerCase());

        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const RANK_DISPLAY = { 0:'2', 1:'3', 2:'4', 3:'5', 4:'6', 5:'7', 6:'8', 7:'9', 8:'T', 9:'J', 10:'Q', 11:'K', 12:'A' };
        const v1 = rankVal(r1);
        const v2 = rankVal(r2);
        const heroHigh = Math.max(v1, v2);
        const heroLow = Math.min(v1, v2);
        const boardVals = boardRanks.map(r => rankVal(r));
        const highestBoardVal = Math.max(...boardVals);
        const secondHighestBoardVal = [...boardVals].sort((a, b) => b - a)[1] ?? -1;
        const sortedBoardVals = [...boardVals].sort((a, b) => a - b);

        // ═══ FLUSH / FLUSH DRAW DETECTION ═══
        let hasFlushDraw = false;
        let hasFlush = false;
        let isNutFlushDraw = false;
        let hasBackdoorFlush = false;

        if (isSuited) {
            const suitCounts = {};
            boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
            const maxBoardSuit = Object.entries(suitCounts || {}).sort((a, b) => b[1] - a[1])[0];
            if (maxBoardSuit) {
                if (maxBoardSuit[1] >= 3) hasFlush = true;
                else if (maxBoardSuit[1] >= 2) hasFlushDraw = true;
                else if (maxBoardSuit[1] === 1 && validBoard.length === 3) hasBackdoorFlush = true;
            }
            // Nut flush draw: hero has the ace of the flush suit
            if (hasFlushDraw && (r1 === 'A' || r2 === 'A')) {
                isNutFlushDraw = true;
            }
        }

        // ═══ STRAIGHT DRAW DETECTION ═══
        const allValsSet = new Set([v1, v2, ...boardVals]);
        let straightOuts = 0;
        let hasMadeStraight = false;
        let isNutStraight = false;
        let hasOESD = false;
        let hasGutshot = false;
        let hasBackdoorStraight = false;

        // Check standard windows — track missing cards for double gutshot detection
        let bestStraightTop = -1;
        const straightMissingCards = []; // Track which cards complete each 4-of-5 window
        for (let start = 0; start <= 8; start++) {
            const window = [start, start + 1, start + 2, start + 3, start + 4];
            const have = window.filter(v => allValsSet.has(v)).length;
            const heroContributes = window.includes(v1) || window.includes(v2);
            if (have === 5 && heroContributes) {
                hasMadeStraight = true;
                if (start + 4 > bestStraightTop) bestStraightTop = start + 4;
            } else if (have === 4 && heroContributes) {
                straightOuts++;
                const missing = window.find(v => !allValsSet.has(v));
                if (missing !== undefined) straightMissingCards.push(missing);
            } else if (have === 3 && heroContributes && validBoard.length === 3 && !hasMadeStraight) {
                hasBackdoorStraight = true;
            }
        }

        // Wheel check
        const wheelRanks = [12, 0, 1, 2, 3];
        const wheelHave = wheelRanks.filter(v => allValsSet.has(v)).length;
        const wheelHeroContributes = wheelRanks.includes(v1) || wheelRanks.includes(v2);
        if (wheelHave === 5 && wheelHeroContributes) {
            hasMadeStraight = true;
            if (3 > bestStraightTop) bestStraightTop = 3; // 5-high straight
        } else if (wheelHave === 4 && wheelHeroContributes && !hasMadeStraight) {
            straightOuts++;
            const missing = wheelRanks.find(v => !allValsSet.has(v));
            if (missing !== undefined) straightMissingCards.push(missing);
        }

        // Double gutshot: 2+ straight windows but needing DIFFERENT cards (8 outs like OESD)
        let hasDoubleGutshot = false;
        if (!hasMadeStraight) {
            const uniqueMissing = new Set(straightMissingCards);
            if (straightOuts >= 2 && uniqueMissing.size >= 2) {
                // Two different cards complete straights = double gutshot or OESD
                // True OESD = consecutive cards needed; double gutshot = non-adjacent
                const sortedMissing = [...uniqueMissing].sort((a, b) => a - b);
                const isConsecutive = sortedMissing.length === 2 && Math.abs(sortedMissing[0] - sortedMissing[1]) === 1;
                if (!isConsecutive && uniqueMissing.size >= 2) {
                    hasDoubleGutshot = true;
                    hasOESD = false; // Double gutshot, not OESD
                } else {
                    hasOESD = true;
                }
            } else if (straightOuts >= 2) {
                hasOESD = true;
            } else if (straightOuts === 1) {
                hasGutshot = true;
            }
        }

        // Check if it's the nut straight (highest possible straight using the board)
        if (hasMadeStraight && bestStraightTop === 12) isNutStraight = true;

        // ═══ MADE HAND CLASSIFICATION ═══
        let madeHand = '';
        const r1BoardCount = boardRanks.filter(r => r === r1).length;
        const r2BoardCount = boardRanks.filter(r => r === r2).length;
        const boardRankCounts = {};
        boardRanks.forEach(r => { boardRankCounts[r] = (boardRankCounts[r] || 0) + 1; });

        // Phase 74: Board-paired flush vulnerability
        const boardPaired = Object.values(boardRankCounts || {}).some(c => c >= 2);

        // Flush first (beats straight in display priority for made hands)
        if (hasFlush) {
            // Check if it's the nut flush
            if (r1 === 'A' || r2 === 'A') {
                madeHand = boardPaired ? 'the nut flush (board paired — full house possible)' : 'the nut flush';
            } else if (heroHigh >= 11) {
                madeHand = boardPaired ? 'a strong flush (board paired — vulnerable)' : 'a strong flush';
            } else {
                madeHand = boardPaired ? 'a weak flush (board paired — vulnerable)' : 'a flush';
            }
        }
        // Straight — Phase 74: quality tiers
        else if (hasMadeStraight) {
            if (isNutStraight) {
                madeHand = boardPaired ? 'the nut straight (board paired — full house beats you)' : 'the nut straight';
            } else if (bestStraightTop <= 5) {
                madeHand = 'a baby straight (vulnerable to higher straights)';
            } else if (heroLow === Math.min(...boardVals) || heroHigh === Math.min(...boardVals)) {
                madeHand = 'the bottom-end straight (higher straights possible)';
            } else {
                madeHand = boardPaired ? 'a straight (board paired — full house beats you)' : 'a straight';
            }
        }
        // Pair-based hands
        else if (isPair) {
            if (boardRanks.includes(r1)) {
                if (r1BoardCount >= 2) madeHand = 'quads';
                else {
                    const boardHasOtherPair = Object.entries(boardRankCounts || {})
                        .some(([r, c]) => r !== r1 && c >= 2);
                    madeHand = boardHasOtherPair ? 'a full house' : 'a set';
                }
            } else {
                const boardHasTrips = Object.values(boardRankCounts || {}).some(c => c >= 3);
                if (boardHasTrips) {
                    madeHand = 'a full house';
                } else if (v1 > highestBoardVal) {
                    // Overpair quality
                    if (v1 >= 12) madeHand = 'aces (overpair)';
                    else if (v1 >= 11) madeHand = 'kings (overpair)';
                    else madeHand = 'an overpair';
                } else if (v1 >= highestBoardVal - 1) {
                    madeHand = 'second pair (pocket)';
                } else {
                    madeHand = 'an underpair';
                }
            }
        } else {
            // Non-pair hands
            const r1OnBoard = r1BoardCount > 0;
            const r2OnBoard = r2BoardCount > 0;

            if (r1OnBoard && r2OnBoard && (r1BoardCount >= 2 || r2BoardCount >= 2)) {
                madeHand = 'a full house';
            } else if (r1OnBoard && r1BoardCount >= 2) {
                madeHand = v2 >= 12 ? 'trips, top kicker' : 'trips';
            } else if (r2OnBoard && r2BoardCount >= 2) {
                madeHand = v1 >= 12 ? 'trips, top kicker' : 'trips';
            } else if (r1OnBoard && r2OnBoard) {
                // Two pair — specify which
                if (v1 === highestBoardVal || v2 === highestBoardVal) {
                    madeHand = 'top two pair';
                } else {
                    madeHand = 'two pair';
                }
            } else if (r1OnBoard) {
                // r1 hit the board — kicker is r2
                if (v1 === highestBoardVal) {
                    // Top pair — kicker quality matters
                    if (v2 >= 12) madeHand = 'top pair, top kicker';
                    else if (v2 >= 10) madeHand = 'top pair, strong kicker';
                    else if (v2 >= 7) madeHand = 'top pair, medium kicker';
                    else madeHand = 'top pair, weak kicker';
                } else if (v1 === secondHighestBoardVal) {
                    madeHand = v2 >= 12 ? 'second pair, top kicker' : 'second pair';
                } else {
                    madeHand = 'bottom pair';
                }
            } else if (r2OnBoard) {
                // r2 hit the board — kicker is r1
                if (v2 === highestBoardVal) {
                    if (v1 >= 12) madeHand = 'top pair, top kicker';
                    else if (v1 >= 10) madeHand = 'top pair, strong kicker';
                    else if (v1 >= 7) madeHand = 'top pair, medium kicker';
                    else madeHand = 'top pair, weak kicker';
                } else if (v2 === secondHighestBoardVal) {
                    madeHand = v1 >= 12 ? 'second pair, top kicker' : 'second pair';
                } else {
                    madeHand = 'bottom pair';
                }
            }
        }

        // ═══ FULL HOUSE DRAW DETECTION ═══
        let hasFHDraw = false;
        let fhDrawType = '';
        if (!hasFlush && !hasMadeStraight) {
            // Set with no full house yet → board pairing gives FH
            if (madeHand === 'a set' && validBoard.length >= 3) {
                hasFHDraw = true;
                fhDrawType = 'full house redraw';
            }
            // Two pair → any of our paired ranks gives FH
            if (madeHand && madeHand.includes('two pair') && validBoard.length >= 3) {
                hasFHDraw = true;
                fhDrawType = 'full house draw';
            }
            // Trips on board + our pair = already FH (handled above), but trips + unpaired hero card → FH draw
            if (madeHand === 'trips' || madeHand === 'trips, top kicker') {
                hasFHDraw = true;
                fhDrawType = 'full house draw';
            }
        }

        // ═══ COMBINE: Made hand + draw equity ═══
        const draws = [];
        if (hasFlush) {
            // Already classified as flush in madeHand — skip flush draw
        } else if (isNutFlushDraw) {
            draws.push('nut flush draw');
        } else if (hasFlushDraw) {
            // Phase 74: Flush draw quality tiers
            if (heroHigh >= 11) draws.push('strong flush draw (K-high)');
            else if (heroHigh >= 8) draws.push('flush draw');
            else draws.push('weak flush draw');
        }

        if (hasMadeStraight) {
            // Already classified
        } else if (hasDoubleGutshot) {
            draws.push('double gutshot (8 outs)');
        } else if (hasOESD) {
            // Phase 74: OESD quality — nut OESD vs non-nut
            // Nut OESD: completing the straight gives the highest possible straight
            const maxMissing = straightMissingCards.length > 0 ? Math.max(...straightMissingCards) : 0;
            const completesNuts = maxMissing >= 10; // completing with T+ gives strong straights
            if (completesNuts) draws.push('nut OESD');
            else draws.push('OESD');
        } else if (hasGutshot) {
            // Phase 74: Gutshot quality — top-end vs bottom-end
            if (straightMissingCards.length > 0) {
                const missingCard = straightMissingCards[0];
                const wouldBeTopEnd = missingCard > highestBoardVal;
                if (wouldBeTopEnd) draws.push('gutshot (top-end)');
                else if (missingCard <= sortedBoardVals[0]) draws.push('gutshot (bottom-end)');
                else draws.push('gutshot');
            } else {
                draws.push('gutshot');
            }
        }

        // Add FH draw for made hands with redraw equity
        if (hasFHDraw && madeHand) {
            draws.push(fhDrawType);
        }

        // Backdoor draws on flop — now shown with made hands too for playability context
        const bdDraws = [];
        if (validBoard.length === 3) {
            if (hasBackdoorFlush) bdDraws.push('backdoor flush');
            if (hasBackdoorStraight) bdDraws.push('backdoor straight');
        }

        // Overcard context for draws (OESD + two overcards = 14+ outs)
        const hasTwoOvers = heroHigh > highestBoardVal && heroLow > highestBoardVal;
        const hasOneOver = !hasTwoOvers && heroHigh > highestBoardVal;

        if (!madeHand && draws.length === 0 && bdDraws.length > 0) {
            // Pure backdoor equity — show with overcard context
            if (hasTwoOvers) return `two overcards + ${bdDraws.join(' + ')}`;
            if (hasOneOver) return `one overcard + ${bdDraws.join(' + ')}`;
            return bdDraws.join(' + ');
        }

        if (madeHand && draws.length > 0) {
            // Made hand + draws — add backdoor context on flop if present
            const allDraws = [...draws, ...bdDraws];
            return `${madeHand} + ${allDraws.join(' + ')}`;
        }
        if (madeHand) {
            // Made hand with only backdoor equity
            if (bdDraws.length > 0) return `${madeHand} + ${bdDraws.join(' + ')}`;
            return madeHand;
        }
        if (draws.length > 0) {
            // Draw-only hands — add overcard context and tier the combo draw label
            const overStr = hasTwoOvers ? ' + two overcards' : (hasOneOver ? ' + overcard' : '');
            const allDraws = [...draws, ...bdDraws];
            if (allDraws.length >= 2 || (allDraws.length === 1 && overStr)) {
                // Estimate outs for monster draw label
                let estOuts = 0;
                if (draws.some(d => d.includes('flush draw'))) estOuts += 9;
                if (draws.some(d => d === 'OESD' || d.includes('double gutshot'))) estOuts += 8;
                else if (draws.some(d => d === 'gutshot')) estOuts += 4;
                if (hasTwoOvers) estOuts += 6;
                else if (hasOneOver) estOuts += 3;

                if (estOuts >= 15) return `monster draw (${allDraws.join(' + ')}${overStr})`;
                if (allDraws.length >= 2) return `combo draw (${allDraws.join(' + ')}${overStr})`;
                return `${allDraws[0]}${overStr}`;
            }
            return allDraws[0];
        }

        // No made hand, no draw
        if (hasTwoOvers) return 'two overcards';
        if (hasOneOver) return 'one overcard';
        return heroHigh >= 9 ? 'high cards, no pair' : 'air';
    }

    /**
     * Phase 75: Adaptive difficulty — tracks session performance to adjust question difficulty.
     * Called during batch generation when difficulty='adaptive'.
     * Uses a simple sliding window of recent accuracy to decide difficulty tier.
     */
    _getAdaptiveDifficulty(questionsAnswered) {
        // Use session tracking data if available
        const stats = this._sessionStats || { correct: 0, total: 0, recentWindow: [] };
        this._sessionStats = stats;

        if (stats.total < 5) return 'standard'; // Not enough data yet

        // Calculate recent accuracy (last 10 questions)
        const recent = stats.recentWindow.slice(-10);
        const recentAcc = recent.length > 0 ? recent.filter(Boolean).length / recent.length : 0.5;
        const overallAcc = stats.total > 0 ? stats.correct / stats.total : 0.5;

        // Adaptive thresholds
        if (recentAcc >= 0.85) return 'expert';     // Crushing it — give harder spots
        if (recentAcc <= 0.35) return 'beginner';   // Struggling — ease up
        return 'standard';                            // In the zone — standard mix
    }

    /**
     * Phase 75: Update session stats after a question is answered.
     * Called externally by the training arena.
     */
    updateSessionDifficulty(isCorrect) {
        if (!this._sessionStats) {
            this._sessionStats = { correct: 0, total: 0, recentWindow: [] };
        }
        this._sessionStats.total++;
        if (isCorrect) this._sessionStats.correct++;
        this._sessionStats.recentWindow.push(isCorrect);
        // Keep window at max 20 entries
        if (this._sessionStats.recentWindow.length > 20) {
            this._sessionStats.recentWindow.shift();
        }
    }

    resetSessionDifficulty() {
        this._sessionStats = { correct: 0, total: 0, recentWindow: [] };
    }

    getStreetForLevel(level) {
        // All levels get all streets — no content gating by level
        // The solver pool contains flop, turn, and river spots for all levels
        return null; // null = all streets
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 76: DYNAMIC EXPLANATION DEPTH — MISTAKE-HISTORY-AWARE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 76: Record a mistake pattern for explanation depth tracking.
     * Called externally after each answered question with spot metadata.
     *
     * Tracks mistakes by 5 dimensions:
     *   - street (flop/turn/river)
     *   - handCategory (top pair, flush draw, air, etc.)
     *   - actionType (bet/check/fold/raise/call)
     *   - spotType (facing_cbet, 3bet_defense, etc.)
     *   - nodeType (hero_bets_or_checks, hero_faces_bet, hero_faces_raise)
     *
     * @param {Object} params
     * @param {boolean} params.isCorrect - Whether the answer was correct
     * @param {string} params.street - flop/turn/river
     * @param {string} params.handCategory - categorizeHand() output
     * @param {string} params.correctAction - The GTO correct action
     * @param {string} params.chosenAction - The player's chosen action
     * @param {string} params.spotType - Spot type from deriveSpotType
     * @param {string} params.nodeType - hero_bets_or_checks / hero_faces_bet / hero_faces_raise
     * @param {string} params.classification - BEST/CORRECT/INACCURACY/WRONG/BLUNDER
     */
    recordMistakePattern({ isCorrect, street, handCategory, correctAction, chosenAction, spotType, nodeType, classification }) {
        if (!this._mistakeTracker) {
            this._mistakeTracker = {};
        }

        // Normalize hand category into a bucket for tracking
        const handBucket = this._getHandBucket(handCategory);
        // Normalize action into a bucket
        const actionBucket = this._getActionBucket(correctAction);

        // Track along each dimension
        const dimensions = [
            `street:${street || 'unknown'}`,
            `hand:${handBucket}`,
            `action:${actionBucket}`,
            `spot:${spotType || 'general'}`,
            `node:${nodeType || 'unknown'}`,
            // Compound keys for fine-grained tracking
            `${street || 'unknown'}:${handBucket}`,
            `${street || 'unknown'}:${actionBucket}`,
            `${handBucket}:${actionBucket}`,
        ];

        const isMistake = ['INACCURACY', 'WRONG', 'BLUNDER'].includes(classification);

        for (const dim of dimensions) {
            if (!this._mistakeTracker[dim]) {
                this._mistakeTracker[dim] = { total: 0, mistakes: 0 };
            }
            this._mistakeTracker[dim].total++;
            if (isMistake) {
                this._mistakeTracker[dim].mistakes++;
            }
        }
    }

    /**
     * Phase 76: Normalize hand category into a tracking bucket.
     * Groups similar hand strengths together for meaningful sample sizes.
     */
    _getHandBucket(handCategory) {
        if (!handCategory) return 'unknown';
        const hc = handCategory.toLowerCase();

        // Made hands
        if (hc.includes('full house') || hc.includes('quads') || hc.includes('straight flush')) return 'nuts';
        if (hc.includes('flush') && !hc.includes('draw')) return 'flush';
        if (hc.includes('straight') && !hc.includes('draw')) return 'straight';
        if (hc.includes('trips') || hc.includes('three of a kind') || hc.includes('set')) return 'trips_set';
        if (hc.includes('two pair')) return 'two_pair';
        if (hc.includes('overpair')) return 'overpair';
        if (hc.includes('top pair')) return 'top_pair';
        if (hc.includes('middle pair') || hc.includes('second pair')) return 'middle_pair';
        if (hc.includes('bottom pair') || hc.includes('low pair') || hc.includes('weak pair')) return 'bottom_pair';

        // Draws
        if (hc.includes('combo draw') || hc.includes('monster draw')) return 'combo_draw';
        if (hc.includes('flush draw')) return 'flush_draw';
        if (hc.includes('oesd') || hc.includes('open-ended') || hc.includes('straight draw')) return 'straight_draw';
        if (hc.includes('gutshot')) return 'gutshot';

        // Weak / air
        if (hc.includes('overcard')) return 'overcards';
        if (hc.includes('air') || hc.includes('no pair')) return 'air';

        return 'other';
    }

    /**
     * Phase 76: Normalize action into a tracking bucket.
     */
    _getActionBucket(action) {
        if (!action) return 'unknown';
        const a = action.toLowerCase();
        if (a === 'f') return 'fold';
        if (a === 'c' || a === 'x') return 'check';
        if (a === 'call') return 'call';
        if (a.startsWith('b')) return 'bet';
        if (a.startsWith('r')) return 'raise';
        if (a === 'allin') return 'allin';
        return 'other';
    }

    /**
     * Phase 76: Determine explanation depth for the current spot.
     * Returns 'verbose' | 'standard' | 'concise' based on the player's
     * mistake history in spots similar to this one.
     *
     * Logic:
     *   - If player has ≥3 samples in this spot type and mistake rate ≥50%: verbose
     *   - If player has ≥5 samples and mistake rate ≤15%: concise (they've mastered it)
     *   - Otherwise: standard
     *
     * Checks multiple dimensions and picks the most informative signal.
     */
    _getExplanationDepth(street, handCategory, correctAction, nodeType, spotType) {
        if (!this._mistakeTracker) return 'standard';

        const handBucket = this._getHandBucket(handCategory);
        const actionBucket = this._getActionBucket(correctAction);

        // Check compound keys first (more specific), then single dimensions
        const keysToCheck = [
            `${street || 'unknown'}:${handBucket}`,        // e.g., "river:flush_draw"
            `${street || 'unknown'}:${actionBucket}`,      // e.g., "turn:fold"
            `${handBucket}:${actionBucket}`,               // e.g., "top_pair:bet"
            `street:${street || 'unknown'}`,
            `hand:${handBucket}`,
            `action:${actionBucket}`,
            `node:${nodeType || 'unknown'}`,
            `spot:${spotType || 'general'}`,
        ];

        let bestSignal = null;
        let bestSampleSize = 0;

        for (const key of keysToCheck) {
            const tracker = this._mistakeTracker[key];
            if (!tracker || tracker.total < 3) continue;

            const mistakeRate = tracker.mistakes / tracker.total;
            // Prefer compound keys (listed first) and larger sample sizes
            if (tracker.total > bestSampleSize) {
                bestSampleSize = tracker.total;
                bestSignal = { mistakeRate, total: tracker.total, key };
            }
        }

        if (!bestSignal) return 'standard';

        // High mistake rate → verbose explanations to help the player learn
        if (bestSignal.mistakeRate >= 0.50 && bestSignal.total >= 3) return 'verbose';
        // Very high mistake rate with large sample → definitely verbose
        if (bestSignal.mistakeRate >= 0.40 && bestSignal.total >= 6) return 'verbose';
        // Low mistake rate with good sample → concise (player has mastered this)
        if (bestSignal.mistakeRate <= 0.15 && bestSignal.total >= 5) return 'concise';

        return 'standard';
    }

    /**
     * Phase 76: Get a depth-aware coaching preamble for weak spots.
     * When verbose, adds a targeted coaching tip based on the specific weakness.
     */
    _getDepthCoachingNote(depth, street, handCategory, correctAction) {
        if (depth !== 'verbose') return '';

        const handBucket = this._getHandBucket(handCategory);
        const actionBucket = this._getActionBucket(correctAction);

        // Street + action coaching tips
        if (street === 'river' && actionBucket === 'fold') {
            return '▲ You tend to over-fold rivers — remember that bluff-catchers need to call enough to keep villain honest.';
        }
        if (street === 'river' && actionBucket === 'bet') {
            return '▲ River betting is a common leak area for you — focus on whether your hand is polarized (value or bluff) vs. a check-back.';
        }
        if (street === 'turn' && actionBucket === 'check') {
            return '▲ Turn checking decisions have been tricky — consider whether you\'re pot-controlling with medium strength or giving up too cheaply.';
        }
        if (street === 'flop' && actionBucket === 'bet') {
            return '▲ Flop bet sizing has been a pattern — focus on whether the board favors range bets (small) or polarized bets (large).';
        }

        // Hand category coaching tips
        if (handBucket === 'flush_draw' || handBucket === 'straight_draw') {
            return '▲ Draw decisions are a leak area — evaluate pot odds, implied odds, and whether you have fold equity with a semi-bluff.';
        }
        if (handBucket === 'top_pair' || handBucket === 'overpair') {
            return '▲ Playing strong-but-vulnerable hands is tricky for you — think about protection vs. pot control based on board texture.';
        }
        if (handBucket === 'air' || handBucket === 'overcards') {
            return '▲ Bluffing spots have been challenging — look for hands with blockers and backdoor equity rather than pure air.';
        }
        if (handBucket === 'middle_pair' || handBucket === 'bottom_pair') {
            return '▲ Medium-strength hand decisions are a weak spot — these are often check-call candidates, not bets.';
        }

        return '▲ This is a spot type where you\'ve been making frequent mistakes — pay close attention to the reasoning below.';
    }

    /**
     * Phase 76: Reset mistake tracker (e.g., on new session).
     */
    resetMistakeTracker() {
        this._mistakeTracker = {};
    }

    /**
     * Phase 76: Get current mistake tracker data for UI consumption.
     */
    getMistakeTrackerData() {
        if (!this._mistakeTracker) return {};
        const result = {};
        for (const [key, val] of Object.entries(this._mistakeTracker || {})) {
            if (val.total >= 2) {
                result[key] = {
                    ...val,
                    mistakeRate: Math.round((val.mistakes / val.total) * 100),
                };
            }
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 77: BOARD RUNOUT IMPACT PREDICTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 77: Predict which turn/river cards would significantly change the situation.
     * Identifies key cards that:
     *   - Complete draws (flush, straight)
     *   - Pair the board (reducing flush/straight value, enabling full houses)
     *   - Bring overcards that shift range advantage
     *   - Are blanks that change nothing
     *
     * @param {string[]} board - Current board cards
     * @param {string} heroHand - Hero's hand notation (e.g., "AKs")
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street (flop/turn)
     * @param {Object} texture - _analyzeTexture() output
     * @returns {string} Runout impact note for explanation
     */
    _getRunoutImpact(board, heroHand, handStrength, street, texture) {
        // Only relevant on flop and turn (river has no runout)
        if (!board || board.length < 3 || street === 'river' || street === 'preflop') return '';
        if (!heroHand || heroHand.length < 2) return '';

        const boardRanks = board.map(c => c[0].toUpperCase());
        const boardSuits = board.map(c => c[1]?.toLowerCase());
        const boardVals = boardRanks.map(r => '23456789TJQKA'.indexOf(r));
        const heroR1 = heroHand[0].toUpperCase();
        const heroR2 = heroHand[1].toUpperCase();
        const heroV1 = '23456789TJQKA'.indexOf(heroR1);
        const heroV2 = '23456789TJQKA'.indexOf(heroR2);
        const isSuited = heroHand.length >= 3 && heroHand[2] === 's';
        const hc = handStrength.toLowerCase();

        const scaryCards = [];
        const goodCards = [];
        const blanks = [];

        // ─── FLUSH COMPLETING CARDS ───
        const suitCounts = {};
        boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const flushDrawSuit = Object.entries(suitCounts || {}).find(([_, c]) => c === 2)?.[0];
        const threeFlushSuit = Object.entries(suitCounts || {}).find(([_, c]) => c >= 3)?.[0];

        if (flushDrawSuit && !threeFlushSuit) {
            // Two-flush on board — a third of that suit completes flush draws
            const heroHasFlushDraw = isSuited && (hc.includes('flush draw'));
            if (heroHasFlushDraw) {
                goodCards.push(`a ${flushDrawSuit === 'h' ? '♥' : flushDrawSuit === 'd' ? '♦' : flushDrawSuit === 'c' ? '♣' : '♠'} completes your flush draw`);
            } else if (!hc.includes('flush')) {
                scaryCards.push('third flush card');
            }
        }
        if (threeFlushSuit && street === 'turn') {
            // Three-flush already — fourth completes backdoor or makes board 4-flush
            if (!hc.includes('flush')) {
                scaryCards.push('fourth flush card (4-flush board)');
            }
        }

        // ─── STRAIGHT COMPLETING CARDS ───
        const sortedUnique = [...new Set(boardVals)].sort((a, b) => a - b);
        if (texture.connectedness === 'high' || texture.straightDrawHeavy) {
            if (hc.includes('straight draw') || hc.includes('oesd') || hc.includes('gutshot')) {
                goodCards.push('straight-completing card');
            } else if (!hc.includes('straight') || hc.includes('bottom-end')) {
                scaryCards.push('straight-completing card');
            }
        }

        // ─── BOARD PAIRING CARDS ───
        if (!texture.paired) {
            // An unpatched board pairing helps sets/two-pair and hurts flushes/straights
            if (hc.includes('set') || hc.includes('trips') || hc.includes('two pair')) {
                goodCards.push('board pairs (full house potential)');
            } else if (hc.includes('flush') || hc.includes('straight')) {
                scaryCards.push('board pairs (full house beats you)');
            }
        }

        // ─── OVERCARD ARRIVALS ───
        const highestBoard = Math.max(...boardVals);
        if (hc.includes('top pair') || hc.includes('overpair')) {
            // Cards above the current board could create overcards that shift equity
            if (highestBoard < 12) { // Not ace-high board
                const overcardRanks = [];
                if (highestBoard < 12) overcardRanks.push('A');
                if (highestBoard < 11) overcardRanks.push('K');
                if (overcardRanks.length > 0 && !boardRanks.includes('A') && !boardRanks.includes('K')) {
                    // Only scary if we don't hold these overcards
                    const heroHoldsOvercard = heroV1 >= highestBoard + 1 || heroV2 >= highestBoard + 1;
                    if (!heroHoldsOvercard) {
                        scaryCards.push(`overcard (${overcardRanks.join('/')}) shifts range advantage`);
                    }
                }
            }
        }

        // ─── HERO'S DRAW COMPLETION ───
        if (hc.includes('overcards') || hc.includes('overcard')) {
            // Hero would love to hit a pair
            const heroRanks = [heroR1, heroR2].filter(r => !boardRanks.includes(r));
            if (heroRanks.length > 0) {
                goodCards.push(`hitting ${heroRanks.join('/')} gives you top pair`);
            }
        }

        // ─── BLANKS ───
        // Low cards that don't complete any draws are blanks
        if (sortedUnique[0] >= 4 && !texture.wheelDraw) {
            blanks.push('low cards (2-4) are blanks');
        }

        // Build the runout note
        if (scaryCards.length === 0 && goodCards.length === 0) return '';

        const parts = [];
        if (street === 'flop') {
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
// @@PUB_REGION_16@@
