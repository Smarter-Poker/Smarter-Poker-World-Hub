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

    /**
     * Phase 232: Recommend optimal sizing based on hand strength and context.
     */
    recommendBetSizing(handStrength, street, texture, estimatedPot, stackDepth) {
        const handToken = this._getHandToken(handStrength);
        if (!estimatedPot) return null;
        const isWet = texture && (texture.wet || texture.flushy || texture.monotone);
        const isNuts = ['nuts', 'second_nuts', 'full_house'].includes(handToken);
        const isStrong = ['flush', 'straight', 'set', 'two_pair', 'overpair'].includes(handToken);
        const isMedium = ['top_pair_top_kicker', 'top_pair'].includes(handToken);
        const isBluff = ['high_card', 'ace_high', 'missed_draw'].includes(handToken);

        let sizePct, reasoning;

        if (street === 'flop') {
            if (isWet && isStrong) { sizePct = 66; reasoning = 'Wet board + strong hand: size up to deny draw equity.'; }
            else if (!isWet && isStrong) { sizePct = 33; reasoning = 'Dry board + strong hand: small bet to keep villain in. No draws to charge.'; }
            else if (isMedium) { sizePct = 33; reasoning = 'Medium hand: small sizing for thin value and pot control.'; }
            else if (isBluff) { sizePct = 33; reasoning = 'Bluff: use the same small sizing as your value bets for balance.'; }
            else { sizePct = 50; reasoning = 'Standard sizing — balanced between value and protection.'; }
        } else if (street === 'turn') {
            if (isNuts) { sizePct = 75; reasoning = 'Nutted hand on turn: size up to build the pot for a big river bet.'; }
            else if (isStrong) { sizePct = 66; reasoning = 'Strong hand: maintain pressure and charge draws for one more card.'; }
            else { sizePct = 50; reasoning = 'Standard turn sizing — pot is growing, keep it manageable.'; }
        } else {
            if (isNuts) { sizePct = stackDepth && estimatedPot && stackDepth > estimatedPot * 1.5 ? 125 : 80; reasoning = isNuts ? 'Max value: size to get called by the widest range of worse hands.' : 'Value bet'; }
            else if (isBluff) { sizePct = 75; reasoning = 'Bluff: size to make villain fold their bluff-catchers. ~75% pot gives you good fold equity.'; }
            else { sizePct = 50; reasoning = 'Thin value: smaller size to get called by worse hands.'; }
        }

        return { recommendedSize: sizePct + '% pot', bbAmount: ((sizePct / 100) * estimatedPot).toFixed(1) + 'bb', reasoning };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 233: RANGE ADVANTAGE QUANTIFIER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 233: Numerical range advantage score.
     */
    _getRangeAdvantageScore(heroPosition, villainPosition, texture, nodeType, street) {
        if (street === 'preflop' || !texture) return '';
        let score = 50; // Neutral baseline

        const isPFR = nodeType === 'hero_bets_or_checks';
        // texture.highCard is a boolean — derive the actual high rank from lowestRank + spread
        const highCard = (typeof texture.lowestRank === 'number' && typeof texture.spread === 'number')
            ? texture.lowestRank + texture.spread
            : (texture.highCard ? 11 : 0);
        const isMonotone = texture.monotone;
        const isPaired = texture.paired;

        // PFR advantages
        if (isPFR) {
            if (highCard >= 11) score += 15; // A/K high boards favor PFR
            if (highCard >= 9 && highCard <= 10) score += 5; // T/J high slight PFR edge
            if (isPaired) score += 10; // Paired boards favor PFR
        } else {
            if (highCard <= 7) score += 15; // Low boards favor caller
            if (isMonotone) score += 10; // Monotone boards favor caller
        }

        // Position adjustment
        const isIP = this._isInPosition(heroPosition, villainPosition);
        if (isIP) score += 5;

        score = Math.min(85, Math.max(15, score));

        if (score >= 65) return `Range advantage: ${score}/100 — your range significantly outperforms villain's on this board. Bet at higher frequency.`;
        if (score >= 55) return `Range advantage: ${score}/100 — slight edge. Standard betting frequency applies.`;
        if (score <= 35) return `Range advantage: ${score}/100 — villain's range hits this board better. Check more frequently and be cautious.`;
        if (score <= 45) return `Range advantage: ${score}/100 — slight disadvantage. Mix checks and small bets.`;
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 234: VILLAIN RANGE NARROWING TRACKER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 234: Track how villain's range narrows across the hand.
     */
    _getVillainRangeNarrowNote(street, nodeType, optimalAction) {
        if (street === 'preflop') return '';
        const node = (nodeType || '').toLowerCase();

        const rangeNotes = {
            'flop:cbet': 'Villain c-bet: range is still wide (~60-80% of preflop range). They c-bet with value, draws, and air.',
            'flop:check': 'Villain checked flop: range is CAPPED — no strong overpairs or top pair. Weighted toward medium hands and gives up.',
            'flop:raise': 'Villain raised flop: range is POLARIZED — strong value (sets, two pair) or semi-bluffs (draws). Medium hands just call.',
            'turn:bet': 'Villain bet turn: range narrowed significantly. They continued with real equity — value hands and committed draws. Bluffs have mostly given up.',
            'turn:check': 'Villain checked turn after flop bet: major weakness signal. Range is capped — strong hands almost always continue. Exploit with bets.',
            'river:bet': 'Villain bet all three streets: MAXIMALLY POLARIZED — either the nuts or a bluff. Very few medium hands take this line.',
            'river:check': 'Villain checked river: giving up on bluffs or has medium showdown value. Consider a thin value bet.',
        };

        for (const [key, note] of Object.entries(rangeNotes || {})) {
            const [s, action] = key.split(':');
            if (s === street && node.includes(action)) return note;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 235: HAND EQUITY VS RANGE ESTIMATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 235: Quick equity estimate for hero's hand vs estimated villain range.
     */
    _getEquityEstimateNote(handStrength, street, nodeType, optimalAction) {
        const eq = this.estimateEquityVsRange(handStrength, street, nodeType || '');
        if (!eq) return '';
        const equity = parseInt(eq.equity);
        const a = (optimalAction || '').toLowerCase();

        if (a.startsWith('r') && equity < 40) {
            return `Equity estimate: ~${equity}% vs villain's range. You're an underdog, but betting works as a bluff — fold equity + hand equity combined make this profitable.`;
        }
        if (a === 'call' && equity >= 30 && equity <= 50) {
            return `Equity estimate: ~${equity}% vs villain's range. Borderline spot — pot odds determine if calling is correct. Getting ~${equity}% is close to breakeven.`;
        }
        if (a.startsWith('r') && equity >= 60) {
            return `Equity estimate: ~${equity}% vs villain's range. Solid favorite — bet for value to extract chips from weaker holdings.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 236: DRAW EQUITY CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 236: Calculate draw equity with detailed outs counting.
     */
    calculateDrawEquity(handStrength, street) {
        const drawData = {
            'combo_draw': { outs: 15, name: 'Combo draw (flush + straight)', note: 'Monster draw — often a favorite vs one pair.' },
            'flush_draw': { outs: 9, name: 'Flush draw', note: '9 clean outs to the flush.' },
            'oesd': { outs: 8, name: 'Open-ended straight draw', note: '8 outs to the straight.' },
            'gutshot': { outs: 4, name: 'Gutshot straight draw', note: '4 outs — need good implied odds.' },
            'backdoor_flush_draw': { outs: 1.5, name: 'Backdoor flush draw', note: '~1.5 effective outs (need runner-runner).' },
        };

        const data = drawData[handStrength];
        if (!data) return null;

        const streetsRemaining = street === 'flop' ? 2 : 1;
        const equity = streetsRemaining === 2 ? Math.min(data.outs * 4, 90) : Math.min(data.outs * 2, 45);

        return {
            outs: data.outs,
            name: data.name,
            equity: equity + '%',
            method: streetsRemaining === 2 ? `Rule of 4: ${data.outs} × 4 = ${data.outs * 4}%` : `Rule of 2: ${data.outs} × 2 = ${data.outs * 2}%`,
            note: data.note,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 237: FOLD EQUITY CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 237: Calculate fold equity and breakeven bluffing frequency.
     */
    calculateFoldEquity(betSize, potSize) {
        if (!betSize || !potSize) return null;
        const risk = betSize;
        const reward = potSize;
        const breakeven = (risk / (risk + reward) * 100).toFixed(1);

        return {
            breakeven: breakeven + '%',
            risk: betSize.toFixed(1) + 'bb',
            reward: potSize.toFixed(1) + 'bb',
            message: `Your bluff needs to work ${breakeven}% of the time to break even. If villain folds more than ${breakeven}%, bluffing is profitable regardless of your hand.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 238: EXPECTED VALUE CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 238: Calculate EV for a specific action.
     */
    calculateActionEV(action, equity, potSize, betSize, foldEquity) {
        if (equity == null || !potSize) return null;

        const eq = equity / 100;
        if (action === 'call') {
            const ev = eq * (potSize + betSize) - (1 - eq) * betSize;
            return { ev: ev.toFixed(2) + 'bb', profitable: ev > 0, breakdown: `EV = ${(eq * 100).toFixed(0)}% × ${(potSize + betSize).toFixed(0)}bb - ${((1 - eq) * 100).toFixed(0)}% × ${betSize.toFixed(0)}bb = ${ev.toFixed(2)}bb` };
        }
        if (action === 'bet' || action === 'raise') {
            const fe = (foldEquity || 30) / 100;
            const ev = fe * potSize + (1 - fe) * (eq * (potSize + 2 * betSize) - betSize);
            return { ev: ev.toFixed(2) + 'bb', profitable: ev > 0, breakdown: `EV = ${(fe * 100).toFixed(0)}% fold × ${potSize.toFixed(0)}bb + ${((1 - fe) * 100).toFixed(0)}% called × equity calc = ${ev.toFixed(2)}bb` };
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 239: BLUFF-TO-VALUE RATIO CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 239: Calculate optimal bluff-to-value ratio for a given bet size.
     * GTO: bluffs/(value + bluffs) = betSize/(pot + betSize).
     */
    calculateOptimalBluffRatio(betSizePctPot) {
        if (!betSizePctPot) return null;
        // Bluff fraction = b / (pot + 2b): the caller risks b to win pot + b
        const ratio = betSizePctPot / (100 + 2 * betSizePctPot);
        const bluffPct = (ratio * 100).toFixed(0);
        const valuePct = (100 - ratio * 100).toFixed(0);

        return {
            bluffFrequency: bluffPct + '%',
            valueFrequency: valuePct + '%',
            ratio: `${valuePct}:${bluffPct} (value:bluff)`,
            betSize: betSizePctPot + '% pot',
            message: `At ${betSizePctPot}% pot, the GTO bluff frequency is ${bluffPct}%. For every ${valuePct} value combos, include ${bluffPct} bluff combos. Villain should then be indifferent to calling.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 240: SESSION LEADERBOARD DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 240: Generate leaderboard data for session tracking.
     */
    getLeaderboardEntry() {
        if (!this._sessionStats || this._sessionStats.total < 10) return null;
        const accuracy = (this._sessionStats.correct / this._sessionStats.total * 100).toFixed(1);
        const streak = this._sessionBests?.streak || 0;
        const challengeScore = this._challengeMode?.score || 0;

        return {
            accuracy: accuracy + '%',
            totalQuestions: this._sessionStats.total,
            bestStreak: streak,
            challengeScore,
            eloEstimate: Math.round(1200 + (parseFloat(accuracy) - 50) * 20 + streak * 5),
            timestamp: Date.now(),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 241: TRAINING CALENDAR/STREAK DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 241: Track daily training for calendar view.
     */
    recordDailyTraining() {
        if (!this._trainingCalendar) this._trainingCalendar = {};
        const today = new Date().toISOString().split('T')[0];
        if (!this._trainingCalendar[today]) {
            this._trainingCalendar[today] = { questions: 0, accuracy: 0, sessions: 0 };
        }
        this._trainingCalendar[today].questions = this._sessionStats?.total || 0;
        this._trainingCalendar[today].accuracy = this._sessionStats?.total > 0
            ? ((this._sessionStats.correct / this._sessionStats.total) * 100).toFixed(1)
            : '0';
        this._trainingCalendar[today].sessions++;
    }

    getTrainingCalendar() {
        return this._trainingCalendar || {};
    }

    getTrainingStreak() {
        const calendar = this._trainingCalendar || {};
        const dates = Object.keys(calendar || {}).sort().reverse();
        if (dates.length === 0) return 0;

        let streak = 0;
        const today = new Date().toISOString().split('T')[0];
        let checkDate = new Date(today);

        while (true) {
            const dateStr = checkDate.toISOString().split('T')[0];
            if (calendar[dateStr]) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        return streak;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 242: CONCEPT FLASHCARD GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 242: Generate flashcards for GTO concepts.
     */
    generateFlashcards(category) {
        const allCards = {
            pot_odds: [
                { front: 'What are pot odds?', back: 'The ratio of the current pot to the cost of calling. If pot is $10 and you must call $5, pot odds are 10:5 or 2:1 (33%).' },
                { front: 'How to calculate pot odds %?', back: 'Call amount / (pot + call amount). For a $5 call into a $15 pot: 5/20 = 25%.' },
                { front: 'When should you call with a draw?', back: 'When your draw equity exceeds the pot odds. If you need 25% and have 32% equity, call.' },
                { front: 'What are implied odds?', back: 'The additional money you expect to win on future streets if you hit your draw. They justify calling even when pot odds are slightly against you.' },
                { front: 'Pot odds vs a half-pot bet?', back: 'You need 25% equity to call a half-pot bet. The pot is 1.5x the bet, so you risk 1 to win 2.5 total (1/3.5 = ~28.6%, but accounting for the dead pot: 1/(1+1.5+1) = 25%).' },
                { front: 'Pot odds vs a pot-sized bet?', back: 'You need 33% equity. Risk 1 to win 3 total (pot + villain bet + your call). So 1/3 = 33%.' },
                { front: 'What is break-even %?', back: 'The minimum fold frequency needed for a bluff to be profitable: Bet size / (Bet + Pot). A pot-sized bluff needs to work 50% of the time.' },
                { front: 'What are reverse implied odds?', back: 'When hitting your draw still loses to a better hand. Example: calling with a small flush draw when a bigger flush draw is possible.' },
                { front: 'Pot odds vs 2x pot overbet?', back: 'You need 40% equity to call a 2x pot bet. Risk 2 to win 5 total (1 pot + 2 bet + 2 call). 2/5 = 40%.' },
                { front: 'How do pot odds change multiway?', back: 'Pot odds improve (need less equity) because there is more dead money, but your hand needs to beat multiple opponents so actual equity decreases.' },
            ],
            position: [
                { front: 'Why is position important?', back: 'Acting last gives you information about opponents\' actions before you decide. IP players win more money long-term.' },
                { front: 'Which position is most profitable?', back: 'The Button (BTN) — always acts last postflop, averages +10bb/100 in 6-max.' },
                { front: 'Why is SB the worst position?', back: 'SB is always OOP postflop (except vs BB) and must invest 0.5bb before seeing cards. Averages -7bb/100.' },
                { front: '6-max positions in order?', back: 'UTG (Under the Gun), HJ (Hijack/MP), CO (Cutoff), BTN (Button), SB (Small Blind), BB (Big Blind). BTN is most profitable, SB is least.' },
                { front: 'What is a steal attempt?', back: 'Opening (raising first) from late position (CO, BTN, SB) to win the blinds. GTO open ranges from BTN are ~45-50% of hands.' },
                { front: 'Why open tighter from UTG?', back: 'UTG has 5 players left to act who could wake up with a strong hand. You also play the entire hand OOP except against the blinds.' },
                { front: 'What is positional advantage postflop?', back: 'Being IP lets you: control pot size, realize equity more efficiently, bluff more effectively, and value bet thinner because you see opponent actions first.' },
                { front: 'CO vs BTN opening range?', back: 'CO opens ~27-30% of hands, BTN opens ~45-50%. BTN gets to open wider because only 2 players remain (SB/BB) and they always have position.' },
                { front: 'What is the blinds\' disadvantage?', back: 'Blinds post forced bets, act first postflop (OOP), and defend wide ranges. BB loses -20 to -30bb/100, SB loses -40 to -70bb/100 at equilibrium.' },
                { front: 'What is a squeeze play?', back: 'A 3-bet from the blinds (or late position) after an open and one or more calls. Squeezes are powerful because callers have capped ranges.' },
            ],
            betting: [
                { front: 'What is a polarized range?', back: 'A range consisting of very strong hands (value) and very weak hands (bluffs), with no medium-strength hands.' },
                { front: 'What is a merged/linear range?', back: 'A range that includes all hand strengths — strong, medium, and weak. Used with small bet sizes.' },
                { front: 'What is MDF (Minimum Defense Frequency)?', back: 'MDF = 1 - bet/(pot+bet). Tells you how often to defend vs a bet to prevent villain from profiting with any two cards.' },
                { front: 'When to use small bet sizes?', back: 'On dry/static boards where you have a range advantage. Small bets let you bet with a wide, merged range (value + medium hands).' },
                { front: 'When to use large bet sizes?', back: 'On dynamic boards or when your range is polarized (nuts or air). Large bets maximize value from strong hands and maximize fold equity with bluffs.' },
                { front: 'What is a blocker?', back: 'A card in your hand that reduces the number of combos an opponent can have. Example: having A♠ blocks opponent from having AA and some AK combos.' },
                { front: 'What is an overbet?', back: 'Betting more than the pot size. Used with extremely polarized ranges on later streets. GTO uses overbets of 125-200% pot on rivers with nutted hands.' },
                { front: 'Value-to-bluff ratio for pot bet?', back: 'For a pot-sized bet, optimal bluff frequency is 33% bluffs, 67% value (a 2:1 value-to-bluff ratio). This makes opponent indifferent to calling.' },
                { front: 'What is a donk bet?', back: 'Betting into the previous street\'s aggressor (out of position, before they can continuation bet). GTO uses donk bets ~5-10% on specific board textures.' },
                { front: 'Why does solver use multiple bet sizes?', back: 'Different hand strengths prefer different bet sizes. Thin value hands prefer smaller bets, nutted hands prefer larger bets, and each size creates a different bluff-to-value ratio.' },
            ],
            draws: [
                { front: 'Rule of 4 and 2?', back: 'Multiply outs by 4 on the flop (2 cards to come) or by 2 on the turn (1 card to come) to estimate equity %.' },
                { front: 'How many outs does a flush draw have?', back: '9 outs — 13 cards of the suit minus 4 you can see (2 in hand, 2 on board).' },
                { front: 'What is a combo draw?', back: 'A draw with both flush and straight potential — typically 12-15 outs, often a favorite vs one pair.' },
                { front: 'Open-ended straight draw outs?', back: '8 outs — 4 cards on each end complete the straight. Example: 89 on a 67x board has 8 outs (four 5s + four Ts).' },
                { front: 'Gutshot straight draw outs?', back: '4 outs — only one rank completes the straight. Example: 89 on a 6Tx board needs a 7 (four 7s in deck).' },
                { front: 'When are draws playable OOP?', back: 'When you have good implied odds, the draw is to the nuts (not 2nd best), and you can semi-bluff effectively by representing a made hand.' },
                { front: 'What is a semi-bluff?', back: 'Betting or raising with a draw that can improve on later streets. It wins if opponent folds now OR if the draw hits. Combines fold equity + draw equity.' },
                { front: 'Flush draw equity vs top pair?', back: 'A flush draw has ~35% equity vs top pair on the flop (9 outs x 4 = 36% minus slight overcount). On the turn it drops to ~18% (9 outs x 2).' },
                { front: 'What is a backdoor draw?', back: 'A draw needing two cards to complete (e.g., two more suited cards for a flush). Adds ~4% equity. Backdoor flush + backdoor straight adds ~8%.' },
                { front: 'How to play a made hand vs a draw?', back: 'Bet large enough to deny correct odds. If opponent has 35% equity (flush draw), bet at least 75% pot to make calling -EV.' },
            ],
            preflop: [
                { front: 'What is a 3-bet?', back: 'The third raise preflop. First raise = open, second raise = 3-bet. In position, 3-bet to ~3x the open. Out of position, 3-bet to ~3.5-4x.' },
                { front: 'What hands should you 3-bet for value?', back: 'QQ+, AKs, AKo are almost always 3-bet for value. KK and AA never flat. JJ and TT are sometimes 3-bet, sometimes called depending on position.' },
                { front: 'What is a 3-bet bluff?', back: 'A 3-bet with a hand too weak to call but with some playability/blockers. Good candidates: A5s, A4s (blocks AA/AK), suited connectors, small pairs.' },
                { front: 'Standard open raise size?', back: '2.0-2.5x BB from most positions. Some players use 3x from early position. Online tends to be 2.0-2.3x, live is often 3x+.' },
                { front: 'What is a cold call?', back: 'Calling a raise (or 3-bet) without having put any money in the pot yet. Avoid cold-calling 3-bets without strong hands or being IP.' },
                { front: 'Why do we raise preflop?', back: 'Raising isolates opponents (play vs fewer players), builds the pot with strong hands, denies equity to weak hands, and establishes initiative.' },
                { front: 'When to limp preflop?', back: 'Almost never in a competitive game. Exception: SB completing vs BB in certain structures. Open-limping is a significant leak because it forfeits initiative.' },
                { front: 'How to handle a 4-bet?', back: 'Fold most of your 3-bet bluffs. 5-bet jam with QQ+, AKs. Call some 4-bets IP with hands like JJ, TT, AQs, AKo depending on stack depth.' },
                { front: 'What is SPR (Stack-to-Pot Ratio)?', back: 'Effective stack / pot after preflop. SPR < 4 favors big hands (top pair+). SPR > 10 favors speculative hands (suited connectors, small pairs).' },
                { front: 'Preflop hand categories?', back: 'Premium: AA-QQ, AKs. Strong: JJ-TT, AKo, AQs. Playable: 99-22, suited connectors, suited aces, broadways. Marginal: offsuit connectors, weak aces.' },
            ],
            board_texture: [
                { front: 'What is a dry board?', back: 'A board with no flush/straight draws and disconnected ranks. Example: K72 rainbow. Ranges are less likely to connect, favoring c-bets with wide ranges.' },
                { front: 'What is a wet/dynamic board?', back: 'A board with many draws possible (flush draws, straight draws, or both). Example: Jh Th 8c. Ranges connect heavily, requiring larger bets for protection.' },
                { front: 'What is a monotone board?', back: 'All three flop cards are the same suit (e.g., Ah 8h 3h). Strongly favors the caller because they have more suited hands that connected.' },
                { front: 'Range advantage vs nut advantage?', back: 'Range advantage: your overall range has more equity. Nut advantage: you have more of the strongest possible hands. You can have one without the other.' },
                { front: 'Who has range advantage on A-high flops?', back: 'The preflop raiser has more Ax hands in range. They should c-bet frequently with small sizes since their whole range benefits.' },
                { front: 'Who has range advantage on low boards?', back: 'On boards like 6-4-2, the caller often has more two-pair/set combos. The raiser should check more frequently and use polar bet sizes when betting.' },
                { front: 'How does a paired board affect strategy?', back: 'Paired boards reduce the number of possible made hands. The PFR usually has range advantage and can c-bet with high frequency at small sizes.' },
                { front: 'What is a connected board?', back: 'A board where cards are close in rank (e.g., 9-8-6). Creates many straight draws. Both players connect, so bet sizing tends to be larger (protection).' },
                { front: 'How do turns change board texture?', back: 'Turns that complete draws (flush cards, straight cards) shift advantage. An offsuit low card on a dry flop changes little. A third suited card changes everything.' },
                { front: 'What is board coverage?', back: 'Having hands that interact with every type of board texture. GTO ranges are constructed so you can credibly represent strength on any flop.' },
            ],
            river_play: [
                { front: 'Why is river play the most important street?', back: 'The pot is largest on the river, so mistakes are most expensive. EV loss from a single bad river call can exceed all other street mistakes combined.' },
                { front: 'What is a bluff-catcher?', back: 'A hand that beats all bluffs but loses to all value bets. On the river, you must decide if opponent is value-betting or bluffing.' },
                { front: 'How often should you bluff-catch?', back: 'Based on MDF. Vs a pot-sized bet, defend ~50% of your range. Vs half-pot, defend ~67%. This prevents opponent from profiting with pure bluffs.' },
                { front: 'What is a thin value bet?', back: 'Betting a hand that is only slightly ahead of opponent\'s calling range. If you expect to be called by worse >50% of the time, it is a value bet.' },
                { front: 'River check-raise frequency?', back: 'GTO check-raises rivers rarely (~5-10%) but with extreme polarity — the nuts or bluffs with zero showdown value. Never check-raise medium hands.' },
                { front: 'When to give up on a river bluff?', back: 'When your bluff candidate has showdown value (can win at showdown), when opponent\'s range is very strong (4-bet pot), or when you have no blockers to opponent\'s folds.' },
                { front: 'What are good river bluff candidates?', back: 'Hands that: (1) block opponent\'s value range, (2) unblock their folding range, (3) have zero showdown value, (4) are busted draws that bricked.' },
                { front: 'River probe bet strategy?', back: 'When the PFR checks back the turn, OOP player can probe (donk-bet) the river with a polar range. Good spots: scare cards, completed draws, or when PFR capped their range by checking.' },
            ],
            gto_theory: [
                { front: 'What is Nash Equilibrium?', back: 'A strategy pair where neither player can improve their EV by unilaterally changing strategy. GTO poker seeks this equilibrium — unexploitable play.' },
                { front: 'What is a mixed strategy?', back: 'When GTO says to take different actions with the same hand at certain frequencies. Example: check AQ 60%, bet 33% 30%, bet 75% 10%.' },
                { front: 'Why use mixed strategies?', back: 'To remain unpredictable (balanced). If you always bet strong hands and check weak ones, opponents can exploit your pattern. Mixing prevents this.' },
                { front: 'What is EV (Expected Value)?', back: 'The average profit/loss of a decision over infinite repetitions. A call is +EV if you win more than you lose over time. GTO maximizes EV vs perfect opponents.' },
                { front: 'GTO vs Exploitative play?', back: 'GTO: unexploitable, best vs strong opponents. Exploitative: deviates from GTO to target opponent leaks, more profitable vs weak opponents but vulnerable to counter-exploitation.' },
                { front: 'What is indifference?', back: 'When GTO makes an opponent indifferent between calling and folding with their bluff-catchers. If you bluff at exactly the right frequency, calling and folding have equal EV for them.' },
                { front: 'What is range vs range equity?', back: 'How one player\'s entire range performs against another player\'s entire range. The PFR has ~53-55% range equity on most flops, which is why c-betting is profitable.' },
                { front: 'What is a capped range?', back: 'A range that does not contain very strong hands. Example: after checking back the flop, your range is capped (you would have bet nutted hands).' },
                { front: 'What is equity denial?', back: 'Betting to prevent opponent from realizing their equity for free. A hand with 30% equity that gets to see free cards will eventually win 30% of the pot.' },
                { front: 'What is ICM?', back: 'Independent Chip Model — converts tournament chips to monetary value. Near the bubble, chip survival matters more than chip accumulation, changing optimal strategy significantly.' },
            ],
        };

        if (category && allCards[category]) return allCards[category];
        // Return random category
        const categories = Object.keys(allCards || {});
        const randomCat = categories[Math.floor(Math.random() * categories.length)];
        return { category: randomCat, cards: allCards[randomCat] };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 243: QUICK-FIRE DRILL MODE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 243: Rapid yes/no decision drill data.
     * Simplified questions for fast pattern recognition training.
     */
    generateQuickFireQuestion(scenario, heroHand, correctAction) {
        const a = (correctAction || '').toLowerCase();
        const street = scenario.street || 'flop';
        const heroPos = scenario.heroPosition || 'BTN';
        const villPos = scenario.villainPosition || 'BB';
        const nodeType = scenario.nodeType || '';
        const board = scenario.board || '';

        // Build diverse question pool, then pick randomly
        const questions = [];

        if (street === 'preflop') {
            const shouldPlay = a.startsWith('r') || a === 'call';
            questions.push({ q: `Should you open ${heroHand} from ${heroPos}?`, a: shouldPlay ? 'YES' : 'NO' });
            questions.push({ q: `Is ${heroHand} a fold from ${heroPos}?`, a: shouldPlay ? 'NO' : 'YES' });
            if (nodeType.includes('3bet') || nodeType.includes('vs_raise')) {
                questions.push({ q: `Should you 3-bet ${heroHand} here?`, a: a.startsWith('r') ? 'YES' : 'NO' });
                questions.push({ q: `Is ${heroHand} a call vs the raise from ${heroPos}?`, a: a === 'call' || a === 'c' ? 'YES' : 'NO' });
            }
            if (heroPos === 'SB' || heroPos === 'BB') {
                questions.push({ q: `Should you defend ${heroHand} from the ${heroPos}?`, a: shouldPlay ? 'YES' : 'NO' });
            }
        } else {
            // Postflop — many question templates
            const isBet = a.startsWith('b') || a.startsWith('r') || a === 'allin';
            const isFold = a === 'f' || a === 'simple_fold';
            const isCheck = a === 'c' || a === 'x' || a === 'check';

            // Core decision questions
            if (isBet) {
                questions.push({ q: `Should you bet ${heroHand} on this ${street}?`, a: 'YES' });
                questions.push({ q: `Is checking better than betting here with ${heroHand}?`, a: 'NO' });
            }
            if (isFold) {
                questions.push({ q: `Should you continue with ${heroHand} here?`, a: 'NO' });
                questions.push({ q: `Is folding ${heroHand} correct on this ${street}?`, a: 'YES' });
            }
            if (isCheck) {
                questions.push({ q: `Is this a checking spot with ${heroHand}?`, a: 'YES' });
                questions.push({ q: `Should you bet for value with ${heroHand} here?`, a: 'NO' });
            }

            // Bet sizing questions
            const betMatch = a.match(/^b(\d+)$/);
            if (betMatch) {
                const pct = parseInt(betMatch[1]);
                questions.push({ q: `Is a ${pct <= 40 ? 'small' : pct <= 75 ? 'medium' : 'large'} bet correct with ${heroHand}?`, a: 'YES' });
                if (pct <= 40) questions.push({ q: `Should you use a large bet (75%+) here?`, a: 'NO' });
                if (pct >= 75) questions.push({ q: `Is a small bet (33%) sufficient here?`, a: 'NO' });
            }

            // Position awareness
            if (heroPos === 'BTN' || heroPos === 'CO') {
                questions.push({ q: `Does your position favor aggression with ${heroHand}?`, a: isBet ? 'YES' : 'NO' });
            }

            // Street-specific questions
            if (street === 'river') {
                if (isBet) questions.push({ q: `Is ${heroHand} a value bet on this river?`, a: 'YES' });
                if (isFold) questions.push({ q: `Should you bluff-catch with ${heroHand}?`, a: 'NO' });
            }
            if (street === 'turn') {
                if (isBet) questions.push({ q: `Should you barrel the turn with ${heroHand}?`, a: 'YES' });
            }
        }

        // Standalone concept questions (no scenario needed)
        const conceptQs = [
            { q: 'Is position more important than card strength?', a: 'YES' },
            { q: 'Should you always c-bet the flop as PFR?', a: 'NO' },
            { q: 'Is a pot-sized bet ever used in GTO?', a: 'YES' },
            { q: 'Should you limp-call preflop with small pairs?', a: 'NO' },
            { q: 'Does checking always mean weakness?', a: 'NO' },
            { q: 'Is defending your blind with any two cards correct?', a: 'NO' },
            { q: 'Should you 3-bet light more from the BTN?', a: 'YES' },
            { q: 'Is slow-playing always best with the nuts?', a: 'NO' },
            { q: 'Can a fold ever be the highest-EV play?', a: 'YES' },
            { q: 'Should you always bet when you have the nut advantage?', a: 'NO' },
        ];

        // Add some concept questions to the pool
        const conceptSample = conceptQs[Math.floor(Math.random() * conceptQs.length)];
        questions.push(conceptSample);

        // Return a random question from the pool
        return questions[Math.floor(Math.random() * questions.length)] || null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 244: BOARD TEXTURE CLASSIFICATION (12 TYPES)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 244: Classify board texture into one of 12 strategic categories.
     */
    classifyBoardTexture(board) {
        if (!board || board.length < 3) return null;
        const texture = this._analyzeTexture ? this._analyzeTexture(board) : null;
        const boardRanks = board.map(c => '23456789TJQKA'.indexOf(c[0]));
        const boardSuits = board.map(c => c[1]);
        const maxRank = Math.max(...boardRanks);
        const minRank = Math.min(...boardRanks);
        const spread = maxRank - minRank;
        const uniqueSuits = new Set(boardSuits).size;
        const isPaired = new Set(boardRanks).size < boardRanks.length;

        // Classify
        if (uniqueSuits === 1) return { type: 'MONOTONE', desc: 'All one suit — flush is already possible', strategy: 'Favor the caller. PFR should check more. Only bet with a flush or strong draw.' };
        if (isPaired && maxRank >= 11) return { type: 'PAIRED_HIGH', desc: 'Paired board with high cards', strategy: 'Favors PFR — more trips/full house combos. Bet frequently with small sizing.' };
        if (isPaired && maxRank <= 8) return { type: 'PAIRED_LOW', desc: 'Paired board with low cards', strategy: 'Split advantage — PFR has overpairs, caller may have trips. Proceed cautiously.' };
        if (maxRank >= 12 && spread <= 4) return { type: 'ACE_HIGH_CONNECTED', desc: 'Ace-high connected board', strategy: 'Strongly favors PFR range. C-bet at high frequency with small sizing.' };
        if (maxRank >= 12 && spread > 6) return { type: 'ACE_HIGH_RAINBOW_DRY', desc: 'Ace-high dry rainbow', strategy: 'PFR has big range advantage. Can range bet 33% pot at very high frequency.' };
        if (maxRank >= 9 && maxRank <= 11 && spread <= 3) return { type: 'BROADWAY_WET', desc: 'Broadway-connected wet board', strategy: 'Both ranges hit well. Mixed strategy — check and bet at moderate frequency.' };
        if (maxRank <= 8 && spread <= 3) return { type: 'LOW_CONNECTED', desc: 'Low connected board', strategy: 'Favors caller heavily — more two-pairs, sets, straights. PFR should check frequently.' };
        if (maxRank <= 8 && spread > 5) return { type: 'LOW_DISCONNECTED', desc: 'Low disconnected dry board', strategy: 'Slightly favors PFR (overpairs), but caller has set potential. Standard c-bet with medium sizing.' };
        if (uniqueSuits === 2 && spread <= 4) return { type: 'TWO_TONE_CONNECTED', desc: 'Two-tone connected — many draws', strategy: 'Very wet board. Bet larger to charge draws. Both ranges have many possibilities.' };
        if (uniqueSuits === 2 && spread > 5) return { type: 'TWO_TONE_DISCONNECTED', desc: 'Two-tone but disconnected', strategy: 'Flush draws present but fewer straight draws. Medium wetness — standard sizing.' };
        if (uniqueSuits === 3 && spread > 6) return { type: 'RAINBOW_DRY', desc: 'Rainbow dry board', strategy: 'No flush draws, few straight draws. PFR can c-bet at high frequency with small sizing.' };
        return { type: 'STANDARD', desc: 'Standard mixed texture', strategy: 'Balanced approach — use position and hand strength to guide decisions.' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 245: ACTION TREE VISUALIZATION DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 245: Generate action tree data for visualization.
     */
    generateActionTree(handActions, heroHand) {
        if (!handActions) return null;
        const tree = { hand: heroHand, children: [] };

        for (const [action, freq] of Object.entries(handActions || {})) {
            if (freq < 0.01) continue;
            tree.children.push({
                action: this._actionLabel(action),
                rawAction: action,
                frequency: (freq * 100).toFixed(1) + '%',
                freqValue: freq,
                isOptimal: freq === Math.max(...Object.values(handActions || {})),
                color: action.startsWith('r') || action === 'allin' ? '#ef4444' : action === 'call' ? '#22c55e' : action === 'f' ? '#6b7280' : '#3b82f6',
            });
        }

        tree.children.sort((a, b) => b.freqValue - a.freqValue);
        return tree;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 246: RANGE VS RANGE EQUITY MATCHUP
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 246: Pre-computed range vs range equities for common matchups.
     */
    getRangeVsRangeEquity(heroRangeType, villainRangeType, boardType) {
        // Approximate range vs range equities
        const matchups = {
            'pfr_vs_caller:high_board': { pfr: 55, caller: 45, note: 'PFR has slight equity edge on high boards.' },
            'pfr_vs_caller:low_board': { pfr: 45, caller: 55, note: 'Caller has equity edge on low boards.' },
            'pfr_vs_caller:medium_board': { pfr: 50, caller: 50, note: 'Roughly even equity on medium boards.' },
            'pfr_vs_3bettor:any': { pfr: 45, caller: 55, note: '3-bettor has tighter, stronger range.' },
            'btn_vs_bb:dry': { pfr: 55, caller: 45, note: 'BTN range advantage on dry boards.' },
            'btn_vs_bb:wet': { pfr: 48, caller: 52, note: 'BB closes the equity gap on wet boards.' },
        };

        const key = `${heroRangeType}_vs_${villainRangeType}:${boardType}`;
        return matchups[key] || null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 247: TOURNAMENT VS CASH GAME ADJUSTMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 247: Note differences between tournament and cash game strategy.
     */
    _getTournamentAdjustmentNote(stackDepth) {
        if (!this._sessionStats || this._sessionStats.total % 30 !== 0) return '';
        if (this._sessionStats.total < 30) return '';

        if (stackDepth && stackDepth <= 30) {
            return 'Tournament adjustment: at short stacks in tournaments, ICM makes survival more important than chip accumulation. Fold more marginal spots, especially near pay jumps. Push/fold charts become essential under 15BB.';
        }
        return 'Tournament vs cash: key differences — (1) ICM pressure means chips lost > chips won, (2) No rebuying means survival matters, (3) Antes increase steal profitability, (4) Bubble dynamics create exploitable spots against medium stacks.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 248: MULTI-TABLE CONSIDERATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 248: Tips for multi-tabling and volume play.
     */
    getMultiTableTips() {
        if (!this._sessionStats || this._sessionStats.total % 40 !== 0) return null;
        if (this._sessionStats.total < 40) return null;

        const accuracy = this._sessionStats.correct / this._sessionStats.total;
        if (accuracy >= 0.7) {
            return 'Multi-table ready: your accuracy is strong enough to consider playing multiple tables. Start with 2 tables and add more as your speed improves. Focus on making quick, correct decisions rather than perfect ones.';
        }
        return 'Multi-table advice: focus on single-tabling until your accuracy reaches 70%+. Quality decisions at one table build better habits than hasty decisions at many.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 249: TILT DETECTION AND INTERVENTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 249: Detect tilt patterns and intervene with coaching.
     */
    detectTilt() {
        if (!this._recentResults || this._recentResults.length < 8) return null;
        const last8 = this._recentResults.slice(-8);
        const wrongCount = last8.filter(r => !r).length;

        // Pattern detection: sudden accuracy drop
        const first4 = last8.slice(0, 4).filter(r => r).length;
        const last4 = last8.slice(4).filter(r => r).length;
        const suddenDrop = first4 >= 3 && last4 <= 1;

        if (wrongCount >= 7) {
            return {
                level: 'SEVERE',
                message: 'Tilt alert: 7+ wrong in the last 8 questions. Your decision-making may be compromised. Take a 5-minute break, breathe deeply, and reset. Coming back fresh will save you EV.',
                action: 'SUGGEST_BREAK',
            };
        }
        if (wrongCount >= 5 || suddenDrop) {
            return {
                level: 'MODERATE',
                message: '▲ Tilt warning: accuracy dropping. You may be rushing or letting frustration guide decisions. Slow down — take an extra 5 seconds per question.',
                action: 'SUGGEST_SLOWDOWN',
            };
        }
        if (wrongCount >= 4) {
            return {
                level: 'MILD',
                message: 'Rough patch — 4+ wrong in the last 8. Stay process-oriented: focus on HOW you decide, not the results.',
                action: 'COACH',
            };
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 251: STRUCTURED EXPLANATION OBJECTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 251: Generate a structured explanation object instead of a flat string.
     * Returns sections that the UI can render with visual hierarchy.
     * @param {string} selectedAction - Action the user chose
     * @param {string} correctAction - GTO-optimal action
     * @param {Object} frequencies - Action frequency map
     * @param {string} handCategory - Hand classification (e.g., 'top pair')
     * @param {string} street - Current street
     * @param {string} nodeType - Node type context
     * @param {Object} scenario - Full scenario data
     * @param {string} baseExplanation - Engine-generated base explanation
     * @returns {Object} Structured explanation with labeled sections
     */
    generateStructuredExplanation(selectedAction, correctAction, frequencies, handCategory, street, nodeType, scenario, baseExplanation) {
        const isCorrect = selectedAction === correctAction;
        const selectedFreq = frequencies?.[selectedAction] || 0;
        const correctFreq = frequencies?.[correctAction] || 0;

        // Derive concept tag
        const concept = this.deriveConceptFromContext(nodeType || '', street || 'flop', correctAction, handCategory || '');

        // Key takeaway — one sentence the player should remember
        const takeaway = this._generateKeyTakeaway(selectedAction, correctAction, frequencies, handCategory, street, nodeType, isCorrect);

        // Mistake classification for wrong answers
        let mistakeType = null;
        if (!isCorrect) {
            mistakeType = this._classifyMistakeType(selectedAction, correctAction, frequencies, street, nodeType, handCategory);
        }

        // Pattern match — connect to previous mistakes
        const patternMatch = this._findMistakePattern(street, nodeType, selectedAction, correctAction);

        // Actionable fix — specific drill or focus area
        const actionableFix = !isCorrect ? this._generateActionableFix(mistakeType, street, nodeType, handCategory) : null;

        return {
            // Primary feedback line (already computed by UI)
            primary: baseExplanation || '',
            // Concept being tested (e.g., 'C-Bet Frequency', 'River Bluff Catching')
            concept: concept || 'General Strategy',
            // One-sentence key takeaway
            takeaway: takeaway,
            // Mistake classification (null if correct)
            mistakeType: mistakeType,
            // Pattern detection result
            pattern: patternMatch,
            // Actionable fix instruction
            fix: actionableFix,
            // Whether this was correct
            isCorrect: isCorrect,
            // Frequencies for context
            selectedFreq: Math.round(selectedFreq * (selectedFreq <= 1 ? 100 : 1)),
            correctFreq: Math.round(correctFreq * (correctFreq <= 1 ? 100 : 1)),
            // Street and spot type
            street: street,
            spotType: nodeType || 'general',
        };
    }

    /**
     * Phase 251: Generate a single-sentence key takeaway.
     */
    _generateKeyTakeaway(selectedAction, correctAction, frequencies, handCategory, street, nodeType, isCorrect) {
        const correctLabel = this.getActionLabelGTOW(correctAction);
        const correctFreq = frequencies?.[correctAction] || 0;
        const freqPct = correctFreq <= 1 ? Math.round(correctFreq * 100) : Math.round(correctFreq);
        const hc = (handCategory || '').toLowerCase();

        if (isCorrect) {
            if (freqPct >= 95) return `${correctLabel} is the only play here — remember this as a pure strategy spot.`;
            if (freqPct >= 70) return `${correctLabel} is strongly preferred. In practice, always take this action with ${handCategory || 'this hand'}.`;
            return `Good read on a mixed spot — ${correctLabel} at ${freqPct}% is the solver's top choice.`;
        }

        // Wrong answer takeaways — teach the principle
        const selectedLabel = this.getActionLabelGTOW(selectedAction);
        const selFreq = frequencies?.[selectedAction] || 0;
        const selPct = selFreq <= 1 ? Math.round(selFreq * 100) : Math.round(selFreq);

        if (selPct === 0) {
            // Action not in solver strategy at all
            if (street === 'river') {
                if (selectedAction === 'f' || selectedAction === 'fold') return `On the river, ${handCategory || 'this hand'} has enough showdown value to continue. Folding here over-folds your range.`;
                if ((selectedAction || '').match(/^(b|bet|allin|r|raise)/i)) return `${handCategory || 'This hand'} doesn't have the right properties to bet/raise here. Focus on which hands in your range want to put money in.`;
            }
            if (street === 'preflop') {
                return `${handCategory || 'This hand'} isn't strong enough for ${selectedLabel} in this position. Review your preflop ranges for this spot.`;
            }
            return `${selectedLabel} is never used here by the solver. Ask yourself: what is ${selectedLabel} trying to accomplish that ${correctLabel} doesn't do better?`;
        }

        if (selPct > 0 && selPct < 15) return `${selectedLabel} is only used ${selPct}% — it's a rare mix, not a primary action. Default to ${correctLabel} (${freqPct}%).`;
        if (selPct >= 15 && selPct < correctFreq) return `Both actions are in the mix, but ${correctLabel} at ${freqPct}% is preferred over ${selectedLabel} at ${selPct}%. The EV difference matters over volume.`;

        return `${correctLabel} at ${freqPct}% is the solver's primary choice. Study what makes ${handCategory || 'this hand'} prefer ${correctLabel} over ${selectedLabel} in this spot.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 252: MISTAKE TYPE CLASSIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 252: Classify the TYPE of mistake into one of several categories.
     * This helps users understand their thinking error, not just that they were wrong.
     */
    _classifyMistakeType(selectedAction, correctAction, frequencies, street, nodeType, handCategory) {
        const sel = (selectedAction || '').toLowerCase();
        const cor = (correctAction || '').toLowerCase();
        const selFreq = frequencies?.[selectedAction] || 0;
        const selPct = selFreq <= 1 ? Math.round(selFreq * 100) : Math.round(selFreq);

        // Category 1: Playing too passively (should bet/raise, chose check/call/fold)
        const corIsAggressive = cor.match(/^(b|bet|r|raise|allin)/i);
        const selIsPassive = sel === 'x' || sel === 'c' || sel === 'check' || sel === 'call' || sel === 'f' || sel === 'fold';
        if (corIsAggressive && selIsPassive) {
            if (sel === 'f' || sel === 'fold') return { type: 'OVER_FOLD', label: 'Over-Folding', description: 'You folded a hand that has enough equity to continue. This shrinks your range too much and makes you exploitable.', severity: 'high' };
            return { type: 'TOO_PASSIVE', label: 'Too Passive', description: 'The solver wants to apply pressure here. Playing passively misses value or fails to deny equity.', severity: 'medium' };
        }

        // Category 2: Playing too aggressively (should check/call/fold, chose bet/raise)
        const selIsAggressive = sel.match(/^(b|bet|r|raise|allin)/i);
        const corIsPassive = cor === 'x' || cor === 'c' || cor === 'check' || cor === 'call' || cor === 'f' || cor === 'fold';
        if (selIsAggressive && corIsPassive) {
            if (cor === 'f' || cor === 'fold') return { type: 'HERO_CALL', label: 'Bad Bluff/Value', description: 'This hand should be given up. Betting or raising here turns a made hand into a bluff or overvalues your holding.', severity: 'high' };
            return { type: 'TOO_AGGRESSIVE', label: 'Too Aggressive', description: 'The solver prefers a more controlled approach here. Over-aggression can bloat the pot with a hand that doesn\'t benefit from it.', severity: 'medium' };
        }

        // Category 3: Right aggression, wrong sizing (both bet but different sizes)
        const selIsBet = sel.match(/^(b|bet)/i);
        const corIsBet = cor.match(/^(b|bet)/i);
        if (selIsBet && corIsBet && sel !== cor) {
            return { type: 'SIZING_ERROR', label: 'Sizing Mistake', description: 'You had the right idea to bet, but the size matters. Different sizings target different parts of villain\'s range.', severity: 'low' };
        }

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
