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

        return context;
    }

    /**
     * Phase 43: Turn-specific context enhancement.
     * Key concepts: geometric sizing (setting up river shove), turn card dynamics,
     * protection vs slowplay decisions, draw equity denial.
     */
    _getTurnContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq, sizePct) {
        if (!board || board.length < 3) return '';
        const a = optimalAction.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        // Turn card analysis
        const turnCard = board.length >= 4 ? board[3] : null;
        let turnImpact = '';
        if (turnCard && typeof turnCard === 'string' && turnCard.length >= 2) {
            const turnRank = turnCard[0].toUpperCase();
            const turnSuit = turnCard[1]?.toLowerCase();
            const rankVal = r => '23456789TJQKA'.indexOf(r);
            const tv = rankVal(turnRank);

            // Check flush draw completing on turn
            const boardSuits = board.slice(0, 4).filter(c => c && c.length >= 2).map(c => c[1]?.toLowerCase());
            const suitCounts = {};
            boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
            const threeFlush = Object.values(suitCounts || {}).some(c => c >= 3);

            if (threeFlush) {
                turnImpact = 'Turn puts three to a flush on board — flush draws now have one card to hit.';
            } else if (tv >= 12) {
                turnImpact = 'Ace on the turn shifts hand rankings — Ax hands improve significantly.';
            } else if (tv >= 10) {
                turnImpact = 'Broadway turn card — may complete straights or improve broadway draws.';
            }
        }

        let decisionContext = '';

        if (isBet) {
            const isNutted = hs.includes('straight') || hs.includes('flush') || hs.includes('full house') || hs.includes('quads') || hs.includes('set');
            const isDraw = hs.includes('draw') || hs.includes('oesd') || hs.includes('flush draw');
            const isVulnerable = hs.includes('top pair') || hs.includes('overpair');

            // Geometric sizing awareness
            if (sizePct >= 60 && sizePct <= 80 && isNutted) {
                decisionContext = 'Geometric sizing on the turn — this bet size sets up a comfortable pot-sized river shove to get all-in over two streets.';
            } else if (sizePct >= 60 && sizePct <= 80 && isDraw) {
                decisionContext = 'Large semi-bluff on the turn — one card to come, maximum fold equity now while retaining draw equity if called.';
            } else if (sizePct <= 40 && isVulnerable) {
                decisionContext = 'Small turn bet for protection — charge draws to see the river while controlling pot size with a vulnerable hand.';
            } else if (sizePct >= 100) {
                decisionContext = 'Overbet on the turn — polarizing between the nuts and bluffs. This sizing pressures the middle of villain\'s range.';
            } else if (isDraw) {
                decisionContext = 'Turn semi-bluff — with one card to come, betting applies pressure while preserving the chance to improve on the river.';
            } else if (isVulnerable && texture.wet) {
                decisionContext = 'Betting the turn for protection on a wet board — too many draws could improve to beat your hand on the river.';
            }
        } else if (isCheck) {
            const isNutted = hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush');
            if (isNutted) {
                decisionContext = 'Check-trapping the turn with a strong hand — inducing a bet on the river or setting up a check-raise.';
            } else if (hs.includes('draw')) {
                decisionContext = 'Taking a free card on the turn — preserving equity with a draw without investing more chips.';
            } else if (hs.includes('top pair') || hs.includes('overpair')) {
                decisionContext = 'Pot control on the turn — your hand has showdown value but the board is getting dangerous.';
            }
        } else if (isCall) {
            if (hs.includes('draw')) {
                decisionContext = 'Calling the turn with a draw — pot odds and implied odds on the river justify continuing.';
            } else if (hs.includes('top pair') || hs.includes('overpair')) {
                decisionContext = 'Calling the turn with a strong made hand — flatting to keep the pot controlled while villain may be semi-bluffing.';
            }
        } else if (isFold) {
            if (hs.includes('draw')) {
                decisionContext = 'Folding a draw on the turn — the bet sizing prices you out with only one card to come.';
            } else if (hs.includes('pair')) {
                decisionContext = 'Folding a marginal hand on the turn — facing too much aggression with the river still to come.';
            }
        } else if (isRaise) {
            if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush')) {
                decisionContext = 'Raising the turn for value — building a pot to set up a river shove with a strong hand.';
            } else if (hs.includes('draw')) {
                decisionContext = 'Semi-bluff raise on the turn — maximum fold equity now, plus equity to improve on the river.';
            }
        }

        const parts = [turnImpact, decisionContext].filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : '';
    }

    /**
     * Phase 42: River-specific context enhancement.
     * GTO Wizard provides detailed river reasoning about:
     * - Value vs bluff polarity
     * - Pot odds and bluff-catching math
     * - River card impact on ranges
     * - Blocker effects
     */
    _getRiverContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq) {
        if (!board || board.length < 3) return '';
        const a = optimalAction.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        // River card analysis
        const riverCard = board.length >= 5 ? board[4] : null;
        let riverImpact = '';
        if (riverCard && typeof riverCard === 'string' && riverCard.length >= 2) {
            const riverRank = riverCard[0].toUpperCase();
            const riverSuit = riverCard[1]?.toLowerCase();
            const rankVal = r => '23456789TJQKA'.indexOf(r);
            const rv = rankVal(riverRank);

            // Check if river completes flush
            const boardSuits = board.filter(c => c && c.length >= 2).map(c => c[1]?.toLowerCase());
            const suitCounts = {};
            boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
            const flushComplete = Object.values(suitCounts || {}).some(c => c >= 3);

            // Check if river pairs the board
            const boardRanks = board.filter(c => c && c.length >= 2).map(c => c[0].toUpperCase());
            const rankCounts = {};
            boardRanks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
            const riverPairsBoard = rankCounts[riverRank] >= 2;

            if (flushComplete && riverSuit) {
                riverImpact = 'The river completes a possible flush — ranges polarize heavily.';
            } else if (riverPairsBoard) {
                riverImpact = 'The river pairs the board — full houses now possible, changing the hand rankings.';
            } else if (rv >= 12) {
                riverImpact = 'Ace on the river is a significant scare card — Ax hands improved while bluffs gain credibility.';
            } else if (rv >= 10) {
                riverImpact = 'Broadway river card — may have completed straights or improved high-card hands.';
            } else if (rv <= 4) {
                riverImpact = 'Low river card — a relative brick that mostly preserves the turn dynamic.';
            }
        }

        // Decision-specific river context
        let decisionContext = '';
        if (isBet) {
            const isNutted = hs.includes('straight') || hs.includes('flush') || hs.includes('full house') || hs.includes('quads') || hs.includes('set');
            const isMissedDraw = hs.includes('no pair') || hs.includes('air') || (hs.includes('draw') && !hs.includes('pair'));
            const isThinValue = hs.includes('top pair') || hs.includes('overpair') || hs.includes('two pair');

            if (isNutted) {
                decisionContext = 'On the river, nutted hands always bet — no more cards to come means pure value extraction.';
            } else if (isMissedDraw) {
                decisionContext = 'Converting a missed draw into a bluff on the river. With no showdown value, betting is the only way to profit.';
            } else if (isThinValue) {
                decisionContext = 'Thin value bet — villain\'s calling range on the river includes enough worse hands to make this profitable.';
            }
        } else if (isCall) {
            const sizeMatch = a.match(/\d+/); // This won't match 'call', need to check what villain bet
            decisionContext = 'Bluff-catching on the river — you need to call enough to prevent villain from profiting with any two cards as a bluff.';
            if (hs.includes('top pair') || hs.includes('overpair')) {
                decisionContext = 'Your hand is strong enough to bluff-catch. On the river, calling with top pair is standard when villain could be bluffing missed draws.';
            } else if (hs.includes('second pair') || hs.includes('bottom pair')) {
                decisionContext = 'Marginal bluff-catch — your hand blocks some value combos and catches enough bluffs to justify calling.';
            }
        } else if (isFold) {
            if (hs.includes('pair')) {
                decisionContext = 'Folding a made hand on the river — facing too much aggression. Villain\'s river betting range is strong enough that your pair is losing more often than not.';
            } else if (hs.includes('draw')) {
                decisionContext = 'Draw missed on the river — no showdown value and facing a bet. Folding is the only option.';
            }
        } else if (isCheck) {
            if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush')) {
                decisionContext = 'Check-trapping on the river with a strong hand — inducing a bluff or delayed value bet from villain.';
            } else if (hs.includes('top pair') || hs.includes('overpair')) {
                decisionContext = 'Checking back on the river for pot control — your hand has showdown value but betting risks being raised off the best hand.';
            }
        } else if (isRaise) {
            if (hs.includes('straight') || hs.includes('flush') || hs.includes('full house') || hs.includes('quads')) {
                decisionContext = 'River raise for value with the nuts — villain\'s bet indicates strength, and you\'re raising to extract maximum.';
            } else if (hs.includes('air') || hs.includes('no pair')) {
                decisionContext = 'River bluff-raise — representing the nuts when you have nothing. This works because villain\'s betting range is often capped.';
            }
        }

        // Combine
        const parts = [riverImpact, decisionContext].filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : '';
    }

    /**
     * Phase 45: Enhanced mixed strategy reasoning — GTO Wizard-level depth.
     * Explains indifference points, range balance, and exploitability prevention.
     */
    /**
     * Phase 69: SPR (Stack-to-Pot Ratio) awareness — explains how the remaining
     * stack relative to the pot affects commitment thresholds.
     * SPR < 1: Committed with almost anything
     * SPR 1-3: Commit with top pair+
     * SPR 3-6: Need two pair+ to stack off
     * SPR 6+: Deep stacked, implied odds matter most
     */
    _getSPRContext(action, handStrength, street, pot, stackDepth) {
        if (!pot || !stackDepth || street === 'preflop') return '';

        const effectiveStack = stackDepth - (pot / 2);
        const spr = effectiveStack / pot;
        if (spr < 0 || spr > 20) return ''; // invalid or too deep to matter

        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        // Very low SPR (< 1) — pot-committed
        if (spr < 1) {
            if (isFold) {
                if (hs.includes('air') || hs.includes('no pair')) return `SPR is ${spr.toFixed(1)} — you're nearly committed, but with pure air, even low SPR doesn't justify putting in more chips.`;
                return `SPR is ${spr.toFixed(1)} — you're essentially pot-committed but the solver still folds this hand, indicating villain's range is extremely strong here.`;
            }
            if (isCall || isBet || isRaise) {
                return `SPR is ${spr.toFixed(1)} — you're pot-committed. With this stack-to-pot ratio, getting it in is automatic with almost any piece of the board.`;
            }
        }

        // Low SPR (1-3) — commit with strong pairs+
        if (spr < 3) {
            if (isBet || isRaise) {
                if (hs.includes('top pair') || hs.includes('overpair') || hs.includes('set') || hs.includes('two pair')) {
                    return `SPR ${spr.toFixed(1)} — low enough to commit with one pair or better. Stack-off thresholds widen at shallow SPR.`;
                }
                if (hs.includes('draw')) {
                    return `SPR ${spr.toFixed(1)} — with a short stack-to-pot ratio, semi-bluff shoving has maximum fold equity and you can't be blown off your equity.`;
                }
            }
            if (isFold && (hs.includes('top pair') || hs.includes('overpair'))) {
                return `Even at SPR ${spr.toFixed(1)}, villain's aggression indicates a range that beats top pair. Sometimes you must fold despite low SPR.`;
            }
        }

        // Medium SPR (3-6) — need two pair+ to comfortably stack off
        if (spr >= 3 && spr < 6) {
            if (a === 'allin' || isRaise) {
                if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush')) {
                    return `SPR ${spr.toFixed(1)} — medium SPR means two pair+ is needed to stack off comfortably. Your hand qualifies.`;
                }
                if (hs.includes('top pair')) {
                    return `SPR ${spr.toFixed(1)} — at medium SPR, stacking off with just top pair is marginal. The solver raises because your specific hand is strong enough.`;
                }
            }
        }

        // High SPR (6+) — deep stacked, implied odds matter
        if (spr >= 6 && street === 'flop') {
            if (isCall && (hs.includes('set') || hs.includes('flush draw'))) {
                return `SPR ${spr.toFixed(1)} — deep stack-to-pot ratio maximizes implied odds. When you hit, you can win a massive pot relative to your investment.`;
            }
            if (isFold && (hs.includes('top pair'))) {
                return `SPR ${spr.toFixed(1)} — deep SPR means one pair is vulnerable. You need to improve to stack off, and the pot-to-stack commitment isn't there yet.`;
            }
        }

        return '';
    }

    /**
     * Phase 73: Villain tendency modeling — describe what villain's range looks like
     * at this point in the hand, based on game tree node, position, and action history.
     * This helps players understand WHY the solver's response is correct.
     */
    _getVillainTendencyNote(action, handStrength, street, texture, nodeType, heroPosition, villainPosition, freq) {
        if (street === 'preflop') return '';
        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        // Villain position context
        const vPos = villainPosition || '';
        const villainIsIP = this._isInPosition(vPos, heroPosition);
        const villainIsOOP = this._isInPosition(heroPosition, vPos);
        const villainTag = vPos ? ` (${vPos})` : '';

        // ═══ FACING VILLAIN'S BET (hero_faces_bet) ═══
        if (nodeType === 'hero_faces_bet') {
            if (street === 'flop') {
                // Villain c-bet or donk-bet
                if (villainIsIP) {
                    if (isFold && (hs.includes('air') || hs.includes('no pair'))) return `Villain${villainTag} c-bets IP with a wide range (~60-70% on most textures) — but your hand has no equity to continue against even this wide range.`;
                    if (isCall && hs.includes('draw')) return `Villain${villainTag} c-bets IP with ~60-70% of their range. Your draw has enough equity to call since villain's wide c-bet range includes many weak hands.`;
                    if (isRaise) return `Villain${villainTag} c-bets IP with a wide range — check-raising exploits their many weak c-bets and puts their bluffs in a tough spot.`;
                }
                if (villainIsOOP) {
                    if (isBet || isRaise) return `Villain${villainTag} leads OOP (donk-bet) — this polarized line usually means strong made hands or draws. Villain's range is narrow but potent.`;
                    if (isCall) return `Villain${villainTag} leads OOP — a polarized action. Call to keep their bluffs in and evaluate the turn.`;
                }
                if (isCall && (hs.includes('top pair') || hs.includes('overpair'))) return `Villain's flop c-bet range is wide — your strong pair is ahead of most of it. Calling keeps their bluffs in.`;
            }

            if (street === 'turn') {
                // Turn barrel — villain's range has narrowed
                if (isFold) return `Villain barrels the turn — their range has narrowed significantly from the flop. Turn bets are more value-heavy, so folding weaker hands becomes correct.`;
                if (isCall && (hs.includes('top pair') || hs.includes('overpair'))) return `Villain's turn barrel narrows their range to strong value and committed draws. Your pair is still a bluff-catcher that must continue to prevent villain from profiting with air.`;
                if (isCall && hs.includes('draw')) return `Facing a turn barrel with a draw — villain's range is stronger than flop, but your outs are live and implied odds help when you hit the river.`;
                if (isRaise) return `Raising villain's turn barrel — a powerful line. Villain's range is face-up as value or draws. A raise puts maximum pressure on their medium-strength hands.`;
            }

            if (street === 'river') {
                // River bet — villain is polarized (nuts or air)
                if (isFold) return `Villain fires three streets — their river range is heavily polarized between the nuts and bluffs. Your hand falls below the call threshold against this polarized range.`;
                if (isCall) return `Villain's river bet is polarized between value and bluffs. You must call at the right frequency (~1-alpha) to keep villain indifferent about bluffing.`;
                if (isRaise) return `Raising the river against a polarized villain — only viable with the nuts or as a massive bluff. Villain's value range is capped by not raising earlier.`;
            }
        }

        // ═══ HERO ACTS FIRST (hero_bets_or_checks) ═══
        if (nodeType === 'hero_bets_or_checks') {
            if (street === 'flop') {
                if (isBet && texture.straightPossible) return `Villain's checking range contains straight draws and connected hands. Betting charges these draws before the turn completes them.`;
                if (isBet && texture.wet) return `Villain's checking range contains many draws that get a free card if you check. Betting charges these draws and denies their equity realization.`;
                if (isCheck && texture.dry && texture.spread > 6) return `Villain's range whiffs this spread-out dry board frequently. Checking lets them bluff the turn with hands that would fold to a flop bet.`;
                if (isCheck && texture.dry) return `Villain's range whiffs this dry board frequently. Checking lets them bluff the turn with hands that would fold to a flop bet.`;
                if (isBet && texture.dry && (hs.includes('air') || hs.includes('no pair'))) return `Villain likely missed this dry board — c-betting as a bluff targets the large portion of their range that can't continue.`;
            }
            if (street === 'turn') {
                if (isBet && (hs.includes('top pair') || hs.includes('set'))) return `After checking to hero on the turn, villain's range is capped — they would have bet strong hands. Bet to extract value from their medium-strength holdings.`;
                if (isCheck) return `Villain's turn checking range still contains traps and slow-plays. Checking back avoids walking into a check-raise with a vulnerable hand.`;
            }
            if (street === 'river') {
                if (isBet && (hs.includes('air') || hs.includes('no pair'))) return `Villain has checked to you on the river — their range is weak and capped. This is a prime spot to bluff since they can't have strong hands.`;
                if (isBet && (hs.includes('set') || hs.includes('two pair') || hs.includes('flush') || hs.includes('straight'))) return `Villain checks the river — their capped range means they can't beat your strong hand but may call with bluff-catchers. Value bet.`;
            }
        }

        // ═══ FACING RAISE (hero_faces_raise) ═══
        if (nodeType === 'hero_faces_raise') {
            if (isFold) return `Villain raises — a very strong line that narrows their range to premium hands and select bluffs. Folding is correct when your hand can't beat villain's tightened range.`;
            if (isCall) return `Villain's raise polarizes their range between monsters and bluffs. Calling traps their bluffs while keeping the pot manageable against their value.`;
        }

        return '';
    }

    /**
     * Phase 64: Pot odds and equity math — when facing a bet (call/fold decisions),
     * calculate and display the pot odds, required equity, and how they compare
     * to the hand's estimated equity.
     */
    _getPotOddsMath(action, handStrength, street, validActions, pot, nodeType) {
        const a = action.toLowerCase();
        const isCall = a === 'call';
        const isFold = a === 'f';
        if (!isCall && !isFold) return '';
        if (nodeType !== 'hero_faces_bet') return '';

        const hs = handStrength.toLowerCase();

        // Try to infer the bet size from available actions
        // If "call" is an action, there must be a bet to call
        // We can estimate bet size from the pot context
        // Common bet sizes in solver: 33%, 50%, 67%, 75%, 100%
        // Without exact bet size, we provide general pot odds guidance

        // Estimate hand equity based on hand strength category
        let estEquity = 0;
        if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush') || hs.includes('full house') || hs.includes('quads')) {
            estEquity = 75; // Monster
        } else if (hs.includes('top pair') && hs.includes('top kicker')) {
            estEquity = 60;
        } else if (hs.includes('top pair') || hs.includes('overpair')) {
            estEquity = 55;
        } else if (hs.includes('monster draw') || hs.includes('combo draw')) {
            estEquity = 45; // 15+ outs ≈ 45% with two cards, ~33% with one
            if (street === 'turn') estEquity = 33;
        } else if (hs.includes('flush draw') || hs.includes('nut flush draw')) {
            estEquity = 36; // 9 outs ≈ 36% with two cards, 19% with one
            if (street === 'turn') estEquity = 19;
        } else if (hs.includes('oesd') || hs.includes('double gutshot')) {
            estEquity = 32; // 8 outs ≈ 32% with two cards, 17% with one
            if (street === 'turn') estEquity = 17;
        } else if (hs.includes('gutshot')) {
            estEquity = 17; // 4 outs ≈ 17% with two cards, 8.5% with one
            if (street === 'turn') estEquity = 9;
        } else if (hs.includes('second pair') || hs.includes('middle pair')) {
            estEquity = 35;
        } else if (hs.includes('bottom pair')) {
            estEquity = 25;
        } else if (hs.includes('overcard') || hs.includes('high cards')) {
            estEquity = 15; // ~6 outs
        } else if (hs.includes('air') || hs.includes('no pair')) {
            estEquity = 8;
        }

        if (estEquity === 0) return '';

        // Common pot odds by bet size:
        // 33% pot bet → need 20% equity to call
        // 50% pot bet → need 25% equity to call
        // 67% pot bet → need 29% equity to call
        // 75% pot bet → need 30% equity to call
        // 100% pot bet → need 33% equity to call
        // 150% pot bet → need 38% equity to call

        if (isCall) {
            if (hs.includes('flush draw') || hs.includes('nut flush draw')) {
                if (street === 'flop') return `Pot odds math: 9 flush outs × 4 = ~36% equity (rule of 4). You need ~25-33% equity to call most bet sizes — this is a clear call.`;
                if (street === 'turn') return `Pot odds math: 9 flush outs × 2 = ~18% equity (rule of 2). Marginal on pot odds alone, but implied odds when the flush hits make this profitable.`;
            }
            if (hs.includes('oesd') || hs.includes('double gutshot')) {
                if (street === 'flop') return `Pot odds math: 8 straight outs × 4 = ~32% equity (rule of 4). Sufficient to call most standard bet sizes.`;
                if (street === 'turn') return `Pot odds math: 8 outs × 2 = ~16% equity (rule of 2). Needs implied odds to justify — when the straight completes, you should win a large pot.`;
            }
            if (hs.includes('gutshot')) {
                if (street === 'flop') return `Pot odds math: 4 gutshot outs × 4 = ~16% equity. Marginal call — needs implied odds and possibly backdoor equity to justify continuing.`;
                if (street === 'turn') return `Pot odds math: 4 outs × 2 = ~8% equity. Direct pot odds don't justify calling — but implied odds when the straight hits make this close.`;
            }
            if (hs.includes('monster draw') || hs.includes('combo draw')) {
                return `Pot odds math: 15+ outs give ${estEquity}% equity — you're essentially a coin flip. Calling is always correct, and raising is also viable.`;
            }
            if (hs.includes('top pair') || hs.includes('overpair')) {
                if (street === 'river') return `Equity estimate: ~${estEquity}% vs villain's river betting range. Against balanced opponents, you need to call enough to prevent auto-profit bluffs.`;
                return `Equity estimate: ~${estEquity}% against villain's range — comfortably above the pot odds threshold for most bet sizes.`;
            }
            if (hs.includes('second pair') || hs.includes('bottom pair')) {
                if (street === 'river') return `Equity estimate: ~${estEquity}% vs villain's river range — close to the bluff-catching threshold. Call if villain bluffs enough.`;
            }
        }

        if (isFold) {
            if (hs.includes('flush draw') && street === 'turn') {
                return `Pot odds math: 9 outs × 2 = ~18% equity. If the bet size requires more than 18% equity, folding is correct without sufficient implied odds.`;
            }
            if (hs.includes('gutshot')) {
                return `Pot odds math: 4 outs = only ~${estEquity}% equity. This is below the required equity for nearly any bet size — folding is mathematically correct.`;
            }
            if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard')) {
                return `Equity estimate: ~${estEquity}% — well below the required equity to call. No profitable continue.`;
            }
            if (hs.includes('overpair') || hs.includes('top pair')) {
                return `Despite holding a strong hand (~${estEquity}% in a vacuum), villain's aggression narrows their range to hands that beat you. Effective equity drops below the calling threshold.`;
            }
        }

        return '';
    }

    /**
     * Phase 62: Multi-street planning — explains how the current action fits
     * into a broader plan across remaining streets. Covers geometric sizing,
     * pot commitment thresholds, and value/bluff barrel plans.
     */
    _getMultiStreetPlan(street, action, sizePct, handStrength, texture, pot, stackDepth) {
        if (!street || street === 'preflop' || street === 'river') return '';

        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();
        const effectiveStack = stackDepth || 100;

        // ═══ FLOP: 2 streets remaining ═══
        if (street === 'flop') {
            if (isBet) {
                const isNutted = hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush') || hs.includes('full house');
                const hasDraw = hs.includes('draw') || hs.includes('oesd') || hs.includes('flush draw') || hs.includes('gutshot');
                const isTopPair = hs.includes('top pair') || hs.includes('overpair');

                if (sizePct >= 60 && isNutted) {
                    return 'Multi-street plan: Big flop bet → sets up a 60-75% turn barrel → pot-sized river shove. This geometric sizing path gets all the money in by the river.';
                }
                if (sizePct >= 60 && hasDraw) {
                    if (texture.connectedness === 'high') return 'Multi-street plan: Large semi-bluff on this highly connected board → many turn cards improve your hand. Barrel any card that completes a draw or scares villain.';
                    return 'Multi-street plan: Large semi-bluff now → if the draw hits, barrel for value; if it misses, you can either give up or triple-barrel bluff representing the nuts.';
                }
                if (sizePct <= 33 && isNutted) {
                    return 'Multi-street plan: Small flop bet builds the pot gradually — allows larger turn and river bets while keeping villain\'s entire range in.';
                }
                if (sizePct <= 33 && (hs.includes('air') || hs.includes('no pair'))) {
                    return 'Multi-street plan: Cheap flop c-bet → evaluate the turn card. Give up on bad runouts, barrel good turn cards that improve your equity or fold out villain\'s marginal hands.';
                }
                if (isTopPair && sizePct >= 40 && sizePct <= 70) {
                    return 'Multi-street plan: Medium flop bet with top pair → often check the turn to control the pot, then decide on the river based on villain\'s action.';
                }
            }
            if (isCheck) {
                const isStrong = hs.includes('set') || hs.includes('two pair') || hs.includes('overpair');
                if (isStrong) {
                    return 'Multi-street plan: Check the flop to trap → bet or raise the turn when villain barrels. Two remaining streets give time to build a big pot.';
                }
                if (hs.includes('draw')) {
                    return 'Multi-street plan: Check to see the turn for free → if the draw completes, start betting for value. If not, reassess with one card to come.';
                }
            }
            if (isCall) {
                if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('oesd')) {
                    return 'Multi-street plan: Call the flop with a draw → re-evaluate on the turn. If the draw completes, raise or bet for value. If not, decide based on pot odds.';
                }
                if (hs.includes('set') || hs.includes('two pair')) {
                    return 'Multi-street plan: Flatting the flop with a monster → raise the turn or river to build a big pot when villain continues barreling.';
                }
            }
        }

        // ═══ TURN: 1 street remaining ═══
        if (street === 'turn') {
            if (isBet) {
                const isNutted = hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush') || hs.includes('full house');
                const hasDraw = hs.includes('draw') || hs.includes('oesd') || hs.includes('flush draw');

                if (sizePct >= 60 && sizePct <= 75) {
                    if (isNutted) return 'Multi-street plan: 60-75% turn bet sets up a pot-sized river shove — geometric sizing to get stacks in by the river.';
                    if (hasDraw) return 'Multi-street plan: Large turn semi-bluff → if the river completes the draw, bet for value. If not, you\'ve already built fold equity for a river jam.';
                }
                if (sizePct >= 80) {
                    return 'Multi-street plan: Large turn bet commits a significant portion of your stack — be prepared to follow through with a river shove regardless of the card.';
                }
                if (sizePct <= 40) {
                    if (isNutted) return 'Multi-street plan: Small turn bet keeps villain\'s wide range in → overbet or pot-sized river bet for maximum extraction.';
                    if (hs.includes('top pair') || hs.includes('overpair')) return 'Multi-street plan: Medium turn bet for value/protection → check back or make a small river value bet depending on the runout.';
                }
                if (a === 'allin') {
                    if (hasDraw) return 'Multi-street plan: Shoving the turn as a semi-bluff — maximum fold equity with one card to come. If called, you still have draw outs.';
                    if (isNutted) return 'Going all-in on the turn for max value — the pot is large enough relative to stacks to get it in now.';
                }
            }
            if (isCheck) {
                if (hs.includes('top pair') || hs.includes('overpair')) {
                    return 'Multi-street plan: Checking the turn to control the pot → call a reasonable river bet or bet for thin value if checked to.';
                }
                if (hs.includes('set') || hs.includes('two pair')) {
                    return 'Multi-street plan: Check the turn to induce a river bluff or delayed bet — then raise for maximum value on the river.';
                }
                if (hs.includes('draw')) {
                    return 'Multi-street plan: Take a free card on the turn → if the draw completes on the river, bet for value. If not, check-fold or bluff based on runout.';
                }
            }
            if (isCall) {
                if (hs.includes('draw')) {
                    return 'Multi-street plan: Calling the turn with a draw → final card decides everything. If the draw hits, you win a big pot. If not, fold to a river bet.';
                }
                if (hs.includes('top pair') || hs.includes('overpair')) {
                    return 'Multi-street plan: Call turn → bluff-catch the river. One more bet to face — your hand should be good often enough to justify calling down.';
                }
            }
        }

        return '';
    }

    /**
     * Phase 61: Range advantage — explains which player has the range advantage
     * on this board and how it affects the optimal strategy.
     * Key concepts: nut advantage, equity advantage, IP vs OOP dynamics.
     */
    _getRangeAdvantageNote(board, street, action, texture, nodeType, heroPosition, villainPosition, handStrength) {
        if (!board || board.length < 3 || street === 'preflop') return '';

        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);
        const boardRanks = validBoard.map(c => c[0].toUpperCase());
        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const boardVals = boardRanks.map(r => rankVal(r));
        const boardHighVal = Math.max(...boardVals);
        const boardLowVal = Math.min(...boardVals);

        // Determine IP/OOP
        const posOrder = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
        const heroIdx = posOrder.indexOf(heroPosition);
        const villIdx = posOrder.indexOf(villainPosition);
        // Postflop: BTN is last to act (most IP), BB acts first (OOP)
        // SB/BB are OOP postflop; BTN/CO/HJ are IP
        const oopPositions = ['SB', 'BB'];
        const heroIsOOP = oopPositions.includes(heroPosition);
        const heroIsIP = !heroIsOOP && villainPosition && oopPositions.includes(villainPosition);

        // Board categorization for range advantage
        const isHighBoard = boardHighVal >= 10; // T+ high
        const isAceHighBoard = boardRanks.includes('A');
        const isLowBoard = boardHighVal <= 8; // 8-high or lower
        const isMidBoard = !isHighBoard && !isLowBoard;

        // Only add range advantage notes for flop (most impactful) and selectively for turn
        if (street === 'turn' || street === 'river') {
            // On later streets, only mention range advantage in specific scenarios
            if (street === 'river') return '';
            // Turn: only if it's a significant texture shift
            if (!texture.monotone && !texture.paired) return '';
        }

        // ═══ PREFLOP AGGRESSOR RANGE ADVANTAGE (c-bet spots) ═══
        if (nodeType === 'hero_bets_or_checks' && street === 'flop') {
            // Hero is the preflop aggressor (c-bet decision)
            if (isAceHighBoard) {
                if (isBet) return 'Range advantage: Ace-high boards heavily favor the preflop raiser — your range has more AA/AK/AQ combos than the caller.';
                if (isCheck) return 'Range advantage: Even though ace-high boards favor the raiser, checking balances your range and prevents being exploited by always c-betting.';
            }
            if (isHighBoard && boardRanks.includes('K')) {
                if (isBet) return 'Range advantage: King-high boards favor the preflop raiser — more KK/AK/KQ in your range than the caller\'s.';
            }
            if (texture.broadwayDraw) {
                if (isBet) return 'Range advantage: Broadway-draw board (3+ cards T-A) — the preflop raiser\'s range has more broadway combinations, giving significant range advantage.';
            }
            if (texture.highCard && !isAceHighBoard && !boardRanks.includes('K')) {
                if (isBet) return 'Range advantage: High board favors the preflop raiser — more premium hands in your range connect with these high cards.';
            }
            if (isLowBoard && texture.connected) {
                if (texture.gapSize === 'rundown') {
                    if (isCheck) return 'Range advantage: This low rundown board (3+ connected cards) massively favors the caller — they have straights, sets, two pair, and combo draws. Check frequently as the PFR.';
                    if (isBet) return 'Range note: Rundown low boards strongly favor the caller, but betting with your specific hand applies pressure to their capped portions.';
                }
                if (isCheck) return 'Range advantage: Low connected boards favor the caller\'s range — they have more sets, two pair, and straight combos. Checking is often correct as the PFR.';
                if (isBet && hs.includes('overpair')) return 'Range note: Low connected boards favor the caller, but your overpair still needs to bet for protection against the many draws and strong hands in their range.';
            }
            if (isLowBoard && !texture.connected) {
                if (isBet) return 'Range advantage: Low dry boards are close in range advantage — small c-bets with wide range work because neither player connects strongly.';
            }
            if (texture.straightDrawHeavy && !isLowBoard) {
                if (isCheck) return 'Range note: This connected board allows many straight draws — checking accounts for the caller\'s strong equity realization with connected hands.';
                if (isBet && (hs.includes('set') || hs.includes('two pair'))) return 'Range note: Connected board with many straight possibilities — bet to charge the numerous draws before the turn changes the landscape.';
            }
            if (texture.monotone) {
                if (isCheck) return 'Range note: Monotone boards reduce the preflop raiser\'s range advantage — the caller has more suited combos that hit flushes and flush draws.';
                if (isBet) return 'Range note: Despite the monotone texture reducing your range advantage, betting protects your equity and charges villain\'s draws.';
            }
            if (texture.paired) {
                if (isBet) return 'Range advantage: Paired boards strongly favor the preflop raiser — your range has more overpairs and big pairs while the caller rarely has trips.';
            }
        }

        // ═══ CALLER/OOP RANGE ADVANTAGE (facing c-bet) ═══
        if (nodeType === 'hero_faces_bet' && street === 'flop') {
            if (isLowBoard && texture.connected) {
                if (isRaise) return 'Range advantage: You (the caller) have the range advantage on this low connected board — more two pair, sets, and straights than the preflop raiser. Check-raising exploits this.';
                if (isCall) return 'Range advantage: Low connected boards favor the caller\'s range — you connect more often with sets and two pair here.';
            }
            if (isAceHighBoard && isFold) {
                return 'Range disadvantage: Ace-high boards favor the preflop raiser heavily. Without a strong hand, folding is correct because villain\'s range connects much more often here.';
            }
        }

        // ═══ IP vs OOP DYNAMICS ═══
        if (heroIsIP && isCheck && street === 'flop') {
            if (hs.includes('draw') || hs.includes('backdoor')) {
                return 'Position advantage: Being in position allows you to check back draws and realize equity freely — a key IP advantage.';
            }
        }
        if (heroIsOOP && isBet && street === 'flop') {
            if (hs.includes('air') || hs.includes('no pair')) {
                return 'Position note: Donk-betting OOP is uncommon in GTO — when the solver uses it, the board texture strongly favors the OOP player\'s range.';
            }
        }

        return '';
    }

    /**
     * Phase 60: Blocker awareness — explains how hero's hole cards block
     * or unblock villain's ranges, and why that matters for the chosen action.
     */
    _getBlockerContext(heroHand, board, handStrength, action, street, texture) {
        if (!heroHand || heroHand.length < 2 || street === 'preflop') return '';

        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isRaise = a.startsWith('r');
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isCheck = a === 'c' || a === 'x';
        const isAggressive = isBet || isRaise;
        const isPassive = isCall || isCheck;
        const hs = handStrength.toLowerCase();

        const r1 = heroHand[0], r2 = heroHand[1];
        const suffix = heroHand.length >= 3 ? heroHand[2] : '';
        const isSuited = suffix === 's';
        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const v1 = rankVal(r1), v2 = rankVal(r2);

        // Parse board
        const validBoard = (board || []).filter(c => c && typeof c === 'string' && c.length >= 2);
        const boardRanks = validBoard.map(c => c[0].toUpperCase());
        const boardSuits = validBoard.map(c => c[1]?.toLowerCase());
        const boardVals = boardRanks.map(r => rankVal(r));

        // Detect board flush potential
        const suitCounts = {};
        boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const flushSuit = Object.entries(suitCounts || {}).find(([s, c]) => c >= 3)?.[0] || null;
        const threeFlush = flushSuit && suitCounts[flushSuit] === 3;
        const fourFlush = flushSuit && suitCounts[flushSuit] >= 4;

        // Hero suit info
        const heroSuit1 = isSuited ? suffix : null; // for suited hands, both share the suit letter... but heroHand is like "AKs" not actual cards
        // We need to work with rank-level blockers since heroHand is notation (AKs) not specific cards (Ah Kh)

        const hasAce = r1 === 'A' || r2 === 'A';
        const hasKing = r1 === 'K' || r2 === 'K';
        const hasQueen = r1 === 'Q' || r2 === 'Q';
        const hasJack = r1 === 'J' || r2 === 'J';
        const hasTen = r1 === 'T' || r2 === 'T';
        const nonAceRank = r1 === 'A' ? r2 : r1;
        const isPair = r1 === r2;

        // Board top card
        const boardHighVal = Math.max(...boardVals);
        const boardHighRank = '23456789TJQKA'[boardHighVal] || '';

        // Detect straight-heavy boards
        const sortedBoardVals = [...boardVals].sort((a, b) => a - b);
        const boardSpread = sortedBoardVals.length >= 3 ? sortedBoardVals[sortedBoardVals.length - 1] - sortedBoardVals[0] : 99;
        const connectedBoard = boardSpread <= 4 && validBoard.length >= 3;

        // ═══ BLOCKER EFFECTS FOR AGGRESSIVE ACTIONS (bet/raise) ═══
        if (isAggressive) {
            // Bluffing with blockers — the most important blocker concept
            if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard') || hs.includes('busted') || hs.includes('missed')) {
                const blockers = [];

                // Ace blocks AA, AK, AQ — reduces villain's premium combos
                if (hasAce) blockers.push('Holding an A blocks villain\'s AA/AK/AQ combos');
                // King blocks KK, AK
                if (hasKing && !hasAce) blockers.push('The K blocks KK and AK combos');

                // Suited ace on flush board blocks nut flush
                if (hasAce && isSuited && (threeFlush || fourFlush)) {
                    blockers.push('Your suited A blocks villain\'s nut flush combos');
                }

                // Cards that block straights on connected boards
                if (connectedBoard || texture.straightDrawHeavy) {
                    const heroInRange = boardVals.some(bv => Math.abs(v1 - bv) <= 2 || Math.abs(v2 - bv) <= 2);
                    if (heroInRange) blockers.push('Your cards block key straight combos on this connected board');
                }

                // Broadway blockers on broadway-heavy boards
                if (texture.broadwayHeavy && (hasQueen || hasJack || hasTen)) {
                    blockers.push('Your broadway card blocks villain\'s strong broadway combos');
                }

                // Wheel blocker on low boards with wheel potential
                if (texture.wheelDraw && (v1 <= 3 || v2 <= 3)) {
                    blockers.push('Your low card blocks wheel straight combos');
                }

                if (blockers.length > 0) {
                    return `Blocker effect: ${blockers[0]}${blockers.length > 1 ? '; ' + blockers[1] : ''} — making this a premium bluff candidate.`;
                }
            }

            // Semi-bluffing with draw + blockers
            if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('oesd') || hs.includes('gutshot')) {
                if (hasAce && isSuited && (threeFlush || fourFlush)) {
                    return 'Blocker effect: Your suited ace blocks villain\'s nut flush — they\'re less likely to have the nuts, making your semi-bluff more effective.';
                }
                if (hasAce && (threeFlush || fourFlush)) {
                    return 'Blocker effect: Holding an A reduces the chance villain has the nut flush, supporting this aggression.';
                }
            }

            // Value betting — unblocking calling range is key
            if (hs.includes('set') || hs.includes('two pair') || hs.includes('full house') || hs.includes('straight') || hs.includes('flush')) {
                // Set on Axx board — you block AA but unblock AK/AQ
                if (isPair && boardRanks.includes(r1)) {
                    if (r1 === 'A') return 'Blocker note: Your set blocks AA (no combos left) but villain can still have AK/AQ — good targets for value.';
                    if (hasAce || boardRanks.includes('A')) return ''; // complex, skip
                }
                // Two pair on flushy board — no flush blocker is good
                if (hs.includes('two pair') && (threeFlush || fourFlush) && !isSuited) {
                    return 'Blocker note: Your offsuit hand doesn\'t block flush draws — villain\'s range has more missed draws that may call.';
                }
            }

            // Overbet with nut blocker
            if (isBet) {
                const sizeMatch = a.match(/^b(\d+)$/);
                const sizePct = sizeMatch ? parseInt(sizeMatch[1]) : 0;
                if (sizePct >= 125 && hasAce && (threeFlush || fourFlush)) {
                    return 'Blocker effect: Overbetting while holding the A on a flushy board — you block the nuts, making villain less likely to have a hand that can call.';
                }
            }
        }

        // ═══ BLOCKER EFFECTS FOR CALLING (bluff-catching) ═══
        if (isCall) {
            // Calling is better when you UNBLOCK bluffs and BLOCK value
            if (street === 'river') {
                const effects = [];

                // Blocking value: good for calling
                if (isPair && v1 >= 10) {
                    effects.push(`Your ${r1}${r1} blocks some of villain's value combos`);
                }
                if (hasAce && (threeFlush || fourFlush)) {
                    effects.push('Your A blocks the nut flush');
                }

                // Unblocking bluffs: also good for calling (absence of blockers to draws)
                if ((threeFlush || fourFlush) && !isSuited) {
                    effects.push('your offsuit hand doesn\'t block missed flush draws — villain has more bluff combos');
                }

                if (effects.length > 0) {
                    return `Blocker logic: ${effects.join('; ')} — supporting the call.`;
                }
            }
        }

        // ═══ BLOCKER EFFECTS FOR FOLDING ═══
        if (isFold) {
            // Folding is correct when you UNBLOCK value and BLOCK bluffs
            if (street === 'river' || street === 'turn') {
                if (isSuited && (threeFlush || fourFlush)) {
                    return 'Blocker consideration: Your suited cards block some of villain\'s missed flush draw bluffs — they have fewer bluffs, supporting the fold.';
                }
                if (connectedBoard && (Math.abs(v1 - boardVals[0]) <= 2 || Math.abs(v2 - boardVals[0]) <= 2)) {
                    return 'Your cards block some of villain\'s missed straight draws — fewer bluffs in their range supports folding.';
                }
            }
        }

        // ═══ BLOCKER EFFECTS FOR CHECKING ═══
        if (isCheck) {
            // Strong hands checking — sometimes because blockers reduce action
            if (hs.includes('top pair') || hs.includes('overpair')) {
                if (hasAce && boardRanks.includes('A')) {
                    return 'Blocker note: Holding an A on an ace-high board reduces villain\'s top pair combos — fewer hands can pay you off, supporting a check.';
                }
                if (hasKing && boardRanks.includes('K')) {
                    return 'Blocker note: Your K on a king-high board reduces villain\'s top pair combos — checking makes sense when value targets are scarce.';
                }
            }
        }

        return '';
    }

    _getMixingReason(handStrength, texture, street, validActions, handActions) {
        const sorted = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a]);

        if (sorted.length < 2) return 'Close decision — nearly pure.';

        const top = sorted[0].toLowerCase();
        const second = sorted[1].toLowerCase();
        const topFreq = (handActions[sorted[0]] * 100).toFixed(0);
        const secondFreq = (handActions[sorted[1]] * 100).toFixed(0);
        const topIsBet = top.startsWith('b') || top === 'allin';
        const topIsCheck = top === 'c' || top === 'x';
        const secondIsBet = second.startsWith('b') || second === 'allin';
        const secondIsCheck = second === 'c' || second === 'x';
        const hs = handStrength.toLowerCase();

        // Board texture tag for context
        const texTag = texture.monotone ? ' on this monotone board' : texture.straightDrawHeavy ? ' on this straight-heavy board' : texture.wet ? ' on this wet board' : texture.paired ? ' on this paired board' : texture.dry ? ' on this dry board' : '';

        // Check vs Bet mix — the most common mixed strategy
        if ((topIsCheck && secondIsBet) || (topIsBet && secondIsCheck)) {
            if (hs.includes('top pair') || hs.includes('overpair')) {
                if (texture.wet) return `This hand is at the indifference point between betting for value/protection and checking to control the pot. On a wet board, betting ${topIsBet ? topFreq : secondFreq}% protects against draws while checking preserves a balanced checking range.`;
                if (texture.dry) return `On a dry board, top pair is less vulnerable — the solver splits between betting for thin value and checking to trap. Neither line dominates.`;
                if (texture.paired) return `On a paired board, top pair is relatively strong. The solver mixes between betting thin and checking, since fewer draws exist and villain's range is more capped.`;
                return `At the boundary between value betting and pot control. If this hand always bet, the checking range would become too weak and exploitable. The solver splits to keep both ranges strong.`;
            }
            if (hs.includes('set') || hs.includes('two pair')) {
                if (texture.wet) return `Strong hand mixing bet/check on a wet board — betting protects against draws while checking traps aggressive opponents. Wet textures increase the mix frequency.`;
                if (texture.dry) return `Slow-playing a monster on a dry board — fewer draws mean less urgency to bet. Trapping is more viable when villain can't outdraw you easily.`;
                return `Strong hand that mixes between building the pot and trapping. Slow-playing some percentage disguises hand strength and protects the checking range with monsters.`;
            }
            if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('oesd')) {
                if (texture.wet) return `Draw at the indifference point on a wet board — semi-bluffing has more credibility when many draws exist, but checking also realizes equity well.`;
                return `Draw at the indifference point — sometimes semi-bluffing for fold equity, sometimes checking to realize equity freely. Both lines have approximately equal EV.`;
            }
            if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard')) {
                if (texture.dry) return `On a dry board, the solver bluffs less frequently — villain has fewer draws to fold out, so bluff profitability is lower. The mix keeps frequencies unpredictable.`;
                if (texture.wet) return `Wet board gives air more semi-bluff equity through backdoors. The solver bluffs enough to make villain indifferent between calling and folding.`;
                return `This hand sometimes bluffs and sometimes gives up. The solver bluffs just often enough to make villain indifferent between calling and folding — the foundation of GTO balance.`;
            }
            if (hs.includes('second pair') || hs.includes('bottom pair') || hs.includes('middle pair')) {
                if (texture.wet) return `Marginal hand on a wet board — betting risks getting raised, checking risks giving free cards. The solver mixes because neither option clearly dominates.`;
                return `Marginal made hand at the bet/check boundary. Betting extracts thin value from worse hands, but checking preserves the option to call a river bet with showdown value.`;
            }
            return `Indifferent between betting and checking${texTag} — at Nash equilibrium, both actions yield identical EV. The solver randomizes to prevent opponents from exploiting predictable patterns.`;
        }

        // Multiple bet sizes
        if (topIsBet && secondIsBet) {
            const topSize = parseInt(top.match(/\d+/)?.[0] || '0');
            const secSize = parseInt(second.match(/\d+/)?.[0] || '0');
            if (hs.includes('set') || hs.includes('straight') || hs.includes('flush') || hs.includes('full house')) {
                if (texture.wet) return `Multiple sizings with a strong hand on a wet board — smaller bets keep draws in, while larger bets charge them. The solver optimizes the value extraction mix.`;
                return `The solver uses multiple sizings with the nuts — smaller bets target thin calls from medium-strength hands, while larger bets maximize value from strong holdings.`;
            }
            if (hs.includes('draw')) {
                return `Different bluff sizings with a draw — smaller bets risk less when bluffing, while larger bets generate more fold equity. The solver optimizes the sizing mix${texTag}.`;
            }
            if (Math.abs(topSize - secSize) >= 40) {
                return `Wide sizing split (${topSize}% vs ${secSize}%)${texTag} — each size targets a different portion of villain's range. The larger size is polarized; the smaller is merged.`;
            }
            return `Multiple bet sizes at the indifference point. The solver splits sizings to target different parts of villain's range — each size attacks a different hand class optimally.`;
        }

        // Call vs Raise mix
        if ((top === 'call' && (second.startsWith('r') || second === 'allin')) ||
            ((top.startsWith('r') || top === 'allin') && second === 'call')) {
            if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush')) {
                if (texture.wet) return `Strong hand mixing flat/raise on a wet board — raising denies equity but narrows villain's range. Flatting keeps bluffs in and maintains pot size for river extraction.`;
                return `Strong hand that mixes flat and raise. Raising always would cap the flatting range, making it exploitable. Slow-playing some percentage keeps both ranges balanced.`;
            }
            if (hs.includes('draw')) {
                if (texture.wet) return `Semi-bluff raise vs. float on a wet board — raising maximizes fold equity against villain's many vulnerable hands. Calling preserves implied odds.`;
                return `Semi-bluff raise vs. floating call — raising applies maximum pressure, calling preserves implied odds. Both lines are approximately +EV.`;
            }
            return `Mixing call/raise at the indifference point${texTag} — flatting traps bluffs, raising builds the pot. The solver balances both to stay unexploitable.`;
        }

        // Fold vs Call mix — critical bluff-catching theory
        if ((top === 'f' && second === 'call') || (top === 'call' && second === 'f')) {
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
// @@PUB_REGION_16@@
