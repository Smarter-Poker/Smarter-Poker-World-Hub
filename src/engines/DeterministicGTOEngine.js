// @@PUB_REGION_01@@
        // IMP-1 FIX: Filter out scenarios that generated questions the user already saw
        const safeSeenIds = Array.isArray(seenIds) ? seenIds : [];
        let pool = scenarios;
// @@PUB_REGION_02@@
        // ═══ Phase 76: DYNAMIC EXPLANATION DEPTH ═══
        const explanationDepth = this._getExplanationDepth(street, handStrength, optimalAction, ctx.nodeType, ctx.spotType);
        const coachingNote = this._getDepthCoachingNote(explanationDepth, street, handStrength, optimalAction);

        // ═══ Phase 77: BOARD RUNOUT IMPACT ═══
        const runoutNote = this._getRunoutImpact(board, heroHand, handStrength, street, texture);

        // ═══ Phase 78: EQUITY REALIZATION CONTEXT ═══
        const eqRealizationNote = this._getEquityRealizationNote(optimalAction, handStrength, street, ctx.heroPosition, ctx.villainPosition, ctx.stackDepth, texture);

        // ═══ Phase 79: POSITION-AWARE STRATEGY ═══
        const positionNote = this._getPositionStrategyNote(optimalAction, handStrength, street, ctx.heroPosition, ctx.villainPosition, ctx.nodeType, texture, freq);

        // ═══ Phase 81: RANGE POLARIZATION CONTEXT ═══
        const polarizationNote = this._getRangePolarizationNote(optimalAction, handStrength, street, sizePct, ctx.nodeType, texture);

        // ═══ Phase 82: TRAP DETECTION ═══
        const trapNote = this._getTrapDetectionNote(optimalAction, handStrength, street, texture, ctx.nodeType, freq);

        // ═══ Phase 83: BOARD COVERAGE ═══
        const boardCoverageNote = this._getBoardCoverageNote(optimalAction, handStrength, street, sizePct, freq, texture, ctx.nodeType, ctx.heroPosition);

        // ═══ Phase 84: MULTI-STREET EV PROJECTION ═══
        const multiStreetEVNote = this._getMultiStreetEVNote(optimalAction, handStrength, street, sizePct, ctx.estimatedPot, ctx.stackDepth, texture);

        // ═══ Phase 85: KICKER STRENGTH ═══
        const kickerNote = this._getKickerNote(heroHand, handStrength, board, optimalAction, street);

        // ═══ Phase 86: NUT ADVANTAGE ═══
        const nutAdvNote = this._getNutAdvantageNote(board, ctx.heroPosition, ctx.villainPosition, street, texture, ctx.nodeType);

        // ═══ Phase 87: BACKDOOR EQUITY ═══
        const backdoorNote = this._getBackdoorEquityNote(heroHand, board, handStrength, street);

        // ═══ Phase 88: PROTECTION URGENCY ═══
        const protectionNote = this._getProtectionNote(optimalAction, handStrength, street, texture, ctx.heroPosition, ctx.villainPosition);

        // ═══ Phase 89: SHOWDOWN VALUE ═══
        const showdownNote = this._getShowdownValueNote(optimalAction, handStrength, street, ctx.nodeType);

        // ═══ Phase 92: EV COMPARISON ═══
        const evCompNote = this._getEVComparisonNote(optimalAction, ctx.actionEVs, ctx.estimatedPot);

        // ═══ Phase 93: CHECK-RAISE STRATEGY ═══
        const checkRaiseNote = this._getCheckRaiseNote(optimalAction, handStrength, street, ctx.nodeType, texture);

        // ═══ Phase 95: BOARD TEXTURE EVOLUTION ═══
        const textureEvoNote = this._getTextureEvolutionNote(board, street);

        // ═══ Phase 96: OVERBETTING CONTEXT ═══
        const overbetNote = this._getOverbetNote(optimalAction, handStrength, street, sizePct, texture);

        // ═══ Phase 97: THIN VALUE BET ═══
        const thinValueNote = this._getThinValueNote(optimalAction, handStrength, street, sizePct, freq);

        // ═══ Phase 98: GTO FRAMING ═══
        const gtoFrameNote = this._getGTOFramingNote(optimalAction, freq, handActions, handStrength);

        // ═══ Phases 106-123: ADVANCED THEORY NOTES ═══
        const cbetNote = this._getCBetTheory(optimalAction, handStrength, street, ctx.nodeType, texture, ctx.heroPosition, ctx.villainPosition);
        const barrelNote = this._getBarrelTheory(optimalAction, handStrength, street, texture, freq);
        const donkNote = this._getDonkBetTheory(optimalAction, handStrength, street, ctx.nodeType, texture, ctx.heroPosition, ctx.villainPosition);
        const mdfNote = this._getMDFContext(optimalAction, street, ctx.nodeType, ctx.estimatedPot);
        const probeNote = this._getProbeBetTheory(optimalAction, handStrength, street, ctx.nodeType, texture);
        const cappingNote = this._getRangeCappingNote(street, ctx.nodeType, texture);
        const reverseIONote = this._getReverseImpliedOddsNote(handStrength, street, texture);
        const cardRemovalNote = this._getCardRemovalNote(heroHand, board, handStrength, optimalAction);
        const impliedOddsNote = this._getImpliedOddsNote(handStrength, street, optimalAction, ctx.estimatedPot, ctx.stackDepth);
        const foldEquityNote = this._getFoldEquityNote(optimalAction, handStrength, street, ctx.nodeType, freq);
        const comboDrawNote = this._getCombDrawNote(handStrength);
        const boardPairNote = this._getBoardPairNote(handStrength, texture, street);
        const aceHighNote = this._getAceHighBoardNote(handStrength, texture, street, ctx.nodeType, ctx.heroPosition);
        const monotoneNote = this._getMonotoneBoardNote(handStrength, texture, street);
        const lowBoardNote = this._getLowBoardNote(handStrength, texture, street, ctx.heroPosition, ctx.nodeType);
        const riverBluffNote = this._getRiverBluffCriteria(heroHand, handStrength, board, optimalAction, street);
        const bluffCatchNote = this._getBluffCatcherNote(handStrength, optimalAction, street, ctx.nodeType);
        const rangeNarrowNote = this._getRangeNarrowingNote(street, ctx.nodeType);

        // ═══ Phase 126-133: Advanced postflop theory notes ═══
        const multiWayNote = this._getMultiWayNote(ctx.nodeType, ctx.potType, handStrength, optimalAction);
        const sizingTellNote = this._getBetSizingTellNote(ctx.nodeType, street, optimalAction);
        const checkBackNote = this._getCheckBackNote(optimalAction, handStrength, street, texture, ctx.heroPosition, ctx.villainPosition);
        const delayedCBetNote = this._getDelayedCBetNote(optimalAction, handStrength, street, ctx.nodeType, texture);
        const floatNote = this._getFloatPlayNote(optimalAction, handStrength, street, ctx.heroPosition, ctx.villainPosition);
        const raiseVsCallNote = this._getRaiseVsCallNote(optimalAction, handStrength, street, ctx.nodeType, texture);
        const turnCatNote = this._getTurnCardCategoryNote(board, street, handStrength, texture);
        const riverDecisionNote = this._getRiverDecisionNote(optimalAction, handStrength, street, ctx.nodeType);
        // Phase 134-139: SPR, stack depth, pot geometry, range/nut advantage, board interaction, equity distribution
        const sprMatrixNote = this._getSPRMatrixNote(ctx.estimatedPot, ctx.stackDepth, handStrength, street);
        const stackStratNote = this._getStackDepthStrategyNote(ctx.stackDepth, handStrength, street);
        const potGeoNote = this._getPotGeometryNote(ctx.estimatedPot, ctx.stackDepth, street, optimalAction);
        const rangeVsNutNote = this._getRangeVsNutAdvantageNote(ctx.heroPosition, ctx.villainPosition, texture, street, ctx.nodeType);
        const boardInterNote = this._getBoardInteractionNote(ctx.heroPosition, ctx.villainPosition, texture, ctx.nodeType, street);
        const eqDistNote = this._getEquityDistributionNote(handStrength, optimalAction, street, ctx.nodeType);
        const handReadNote = this._getHandReadingNote(street, ctx.nodeType, optimalAction);
        const exploitNote = this._getExploitativeSuggestion(handStrength, optimalAction, street, ctx.nodeType);

        // ═══ Phase 151-175 notes ═══
        const handRankNote = this._getHandRankingNote(handStrength, optimalAction, street);
        const nutBlockerNote = this._getNutBlockerBluffNote(heroHand, board, handStrength, optimalAction, street);
        const eqDenialNote = this._getEquityDenialNote(optimalAction, handStrength, street, texture);
        const potVsImpliedNote = this._getPotVsImpliedOddsNote(optimalAction, handStrength, street, ctx.estimatedPot, ctx.stackDepth);
        const fourBetNote = this._get4Bet5BetNote(ctx.nodeType, ctx.potType, optimalAction, handStrength, ctx.stackDepth);
        const multiBluffNote = this._getMultiStreetBluffNote(optimalAction, handStrength, street, texture);
        const xrSizingNote = this._getCheckRaiseSizingNote(optimalAction, street, ctx.nodeType, texture);
        const riverOBNote = this._getRiverOverbetNote(optimalAction, handStrength, street, ctx.stackDepth, ctx.estimatedPot);
        const valueThickNote = this._getValueThicknessNote(handStrength, optimalAction, street);
        const mergedPolarNote = this._getMergedVsPolarizedNote(optimalAction, handStrength, street, freq);
        const nodeLockNote = this._getNodeLockingNote(handStrength, optimalAction, street);
        const icmNote = this._getICMNote(ctx.stackDepth, handStrength, optimalAction, ctx.gameCategory || null);
        const blindVsBlindNote = this._getBlindVsBlindNote(ctx.heroPosition, ctx.villainPosition, ctx.nodeType, optimalAction);

        // ═══ Phase 176-200 notes ═══
        const mixedStratNote = this._getMixedStrategyNote(handActions, optimalAction, freq);
        const opponentModelNote = this._getOpponentModelNote(ctx.nodeType, street);
        const crossStreetNote = this._getCrossStreetConsistencyNote(street, ctx.nodeType, optimalAction, handStrength);
        const rangeThinkNote = this._getRangeThinkingNote(street, handStrength);
        const solverConfNote = this._getSolverApproximationNote(freq, handActions);

        // ═══ Phase 201-225 notes ═══
        const eqBucketNote = this._getEquityBucketNote(handStrength, optimalAction, handActions);
        const rangeMorphNote = this._getRangeMorphologyNote(street, ctx.nodeType, handStrength);
        const blockerMatrixNote = this._getBlockerMatrixNote(heroHand, board, handStrength, optimalAction);
        const potCommitNote = this._getPotCommitmentNote(ctx.estimatedPot, ctx.stackDepth, optimalAction);
        const checkCallFoldNote = this._getCheckCallFoldNote(optimalAction, handStrength, street, ctx.nodeType);
        const facingDonkNote = this._getFacingDonkNote(optimalAction, handStrength, street, ctx.nodeType);
        const slowPlayNote = this._getSlowPlayChecklistNote(optimalAction, handStrength, street, texture);
        const obChecklistNote = this._getOverbetChecklistNote(optimalAction, handStrength, street, texture, ctx.stackDepth, ctx.estimatedPot);
        const riverPolNote = this._getRiverPolarizationIndex(handActions, street);
        const evDecompNote = this._getEVDecompositionNote(street, optimalAction, handStrength, ctx.estimatedPot);
        const multiSizeNote = this._getMultiSizingNote(optimalAction, handActions, handStrength, street, texture);
        const solverLineNote = this._getSolverLineNote(street, optimalAction, ctx.nodeType, handStrength);

        // ═══ Phase 226-250 notes ═══
        const handCatDiveNote = this._getHandCategoryDeepDive(handStrength, street, optimalAction);
        const aggressionCoachNote = this._getAggressionCoachingNote(optimalAction, handStrength, street, ctx.nodeType, texture);
        const rangeAdvScoreNote = this._getRangeAdvantageScore(ctx.heroPosition, ctx.villainPosition, texture, ctx.nodeType, street);
        const villainNarrowNote = this._getVillainRangeNarrowNote(street, ctx.nodeType, optimalAction);
        const eqEstimateNote = this._getEquityEstimateNote(handStrength, street, ctx.nodeType, optimalAction);
        const tournamentNote = this._getTournamentAdjustmentNote(ctx.stackDepth);

        // ═══ Phase 42: RIVER-SPECIFIC ENHANCED REASONING ═══
        const riverEnhancement = (street === 'river') ? this._getRiverContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq) : '';

        // ═══ Phase 43: TURN-SPECIFIC ENHANCED REASONING ═══
        const turnEnhancement = (street === 'turn') ? this._getTurnContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq, sizePct) : '';

        // ═══ Phase 46: FLOP-SPECIFIC ENHANCED REASONING ═══
        const flopEnhancement = (street === 'flop') ? this._getFlopContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq, sizePct) : '';

        // ═══ BUILD FINAL EXPLANATION ═══
        // Street-specific enhancement
        const streetExtra = riverEnhancement || turnEnhancement || flopEnhancement;

        // Phase 76: Depth-aware extras assembly
        // Concise mode: only sizing reason + concept (skip secondary notes)
        // Verbose mode: all notes + coaching preamble (up to 5 most relevant)
        // Standard: top 3-4 most relevant notes
        // Phase 125: Relevance-scored note selection
        const allNotesRaw = [sizingReason, trapNote, checkRaiseNote, overbetNote, thinValueNote,
            cbetNote, barrelNote, donkNote, comboDrawNote, riverBluffNote, bluffCatchNote,
            blockerNote, cardRemovalNote, rangeNote, polarizationNote, nutAdvNote,
            protectionNote, showdownNote, foldEquityNote, kickerNote, backdoorNote,
            reverseIONote, impliedOddsNote, mdfNote, probeNote, cappingNote,
            boardPairNote, aceHighNote, monotoneNote, lowBoardNote,
            multiStreetNote, potOddsNote, sprNote, villainNote, runoutNote,
            eqRealizationNote, positionNote, boardCoverageNote, multiStreetEVNote,
            textureEvoNote, evCompNote, rangeNarrowNote, gtoFrameNote,
            // Phase 126-142 notes
            multiWayNote, sizingTellNote, checkBackNote, delayedCBetNote, floatNote,
            raiseVsCallNote, turnCatNote, riverDecisionNote,
            sprMatrixNote, stackStratNote, potGeoNote, rangeVsNutNote,
            boardInterNote, eqDistNote, handReadNote, exploitNote,
            // Phase 151-175 notes
            handRankNote, nutBlockerNote, eqDenialNote, potVsImpliedNote,
            fourBetNote, multiBluffNote, xrSizingNote, riverOBNote,
            valueThickNote, mergedPolarNote, nodeLockNote, icmNote, blindVsBlindNote,
            // Phase 176-200 notes
            mixedStratNote, opponentModelNote, crossStreetNote, rangeThinkNote, solverConfNote,
            // Phase 201-225 notes
            eqBucketNote, rangeMorphNote, blockerMatrixNote, potCommitNote, checkCallFoldNote,
            facingDonkNote, slowPlayNote, obChecklistNote, riverPolNote, evDecompNote,
            multiSizeNote, solverLineNote,
            // Phase 226-250 notes
            handCatDiveNote, aggressionCoachNote, rangeAdvScoreNote, villainNarrowNote,
            eqEstimateNote, tournamentNote].filter(Boolean);

        // Score and sort by relevance
        const scoredNotes = allNotesRaw.map(note => ({
            note,
            score: this._scoreNoteRelevance(note, handStrength, street, optimalAction),
        })).sort((a, b) => b.score - a.score);

        let extras;
        if (explanationDepth === 'concise') {
            extras = [sizingReason].filter(Boolean).map(s => ' ' + s).join('');
        } else if (explanationDepth === 'verbose') {
            extras = scoredNotes.slice(0, 5).map(s => ' ' + s.note).join('');
        } else {
            extras = scoredNotes.slice(0, 3).map(s => ' ' + s.note).join('');
        }

        // Phase 76: Coaching preamble for verbose mode
        const coachingPrefix = coachingNote ? coachingNote + ' ' : '';

        // Pure strategy — one dominant action
        if (freq >= 0.95) {
            return `${coachingPrefix}${heroHand} (${handStrength}): Pure ${label}. ${concept}${extras}${streetExtra ? ' ' + streetExtra : ''}`;
        }

        // Near-pure — one clear best action but some mixing
        if (freq >= 0.70) {
            const altActions = validActions
                .filter(a => a !== optimalAction && handActions[a] > 0.01)
                .sort((a, b) => handActions[b] - handActions[a])
                .slice(0, 2)
                .map(a => `${this.getActionLabelGTOW(a)} ${(handActions[a] * 100).toFixed(0)}%`);
            const mixNote = altActions.length > 0 ? ` Mixes with ${altActions.join(', ')}.` : '';
            return `${coachingPrefix}${heroHand} (${handStrength}): ${label} ${freqPct}%. ${concept}${extras}${streetExtra ? ' ' + streetExtra : ''}${mixNote}`;
        }

        // True mixed strategy — explain WHY the solver mixes
        const mixedParts = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a])
            .slice(0, 4)
            .map(a => `${this.getActionLabelGTOW(a)} ${(handActions[a] * 100).toFixed(0)}%`)
            .join(', ');

        const mixReason = this._getMixingReason(handStrength, texture, street, validActions, handActions);
        return `${coachingPrefix}${heroHand} (${handStrength}): Mixed — ${mixedParts}. ${mixReason}${extras}${streetExtra ? ' ' + streetExtra : ''}`;
    }

    /**
     * Phase 25: Analyze board texture for strategic reasoning.
     */
    _analyzeTexture(board) {
        const empty = { wet: false, highCard: false, paired: false, flushy: false, connected: false, monotone: false, straightPossible: false, straightDrawHeavy: false, connectedness: 'low', oesdCount: 0, gutshotCount: 0, threeToStraight: false, wheelDraw: false, broadwayDraw: false, gapSize: 'scattered' };
        if (!board || board.length < 3) return empty;
        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);
        if (validBoard.length < 3) return empty;

        const ranks = validBoard.map(c => c[0].toUpperCase());
        const suits = validBoard.map(c => c[1]?.toLowerCase());
        const rankVals = ranks.map(r => '23456789TJQKA'.indexOf(r));

        const suitCounts = {};
        suits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const suitVals = Object.values(suitCounts || {});
        const maxSuitCount = suitVals.length > 0 ? Math.max(...suitVals) : 0;

        const rankCounts = {};
        ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
        const rankValsArr = Object.values(rankCounts || {});
        const maxRankCount = rankValsArr.length > 0 ? Math.max(...rankValsArr) : 0;

        const sorted = [...new Set(rankVals)].sort((a, b) => a - b);
        // Phase 72: Enhanced connectivity — count adjacent pairs, gaps, and straight potential
        let adjacentPairs = 0;
        let oneGapPairs = 0;
        let twoGapPairs = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
            const gap = sorted[i + 1] - sorted[i];
            if (gap === 1) adjacentPairs++;
            else if (gap === 2) oneGapPairs++;
            else if (gap === 3) twoGapPairs++;
        }
        // Also check A-low wheel connectivity (A=12, 2=0, 3=1, 4=2, 5=3)
        const hasAce = sorted.includes(12);
        const wheelCards = sorted.filter(v => v <= 3).length; // 2,3,4,5
        const wheelDraw = hasAce && wheelCards >= 1;

        const connected = adjacentPairs > 0 || oneGapPairs > 0;

        // Connectedness level
        let connectedness = 'low';
        const totalConnections = adjacentPairs * 3 + oneGapPairs * 2 + twoGapPairs;
        if (totalConnections >= 5) connectedness = 'high';
        else if (totalConnections >= 3) connectedness = 'medium';

        // Gap characterization
        let gapSize = 'scattered';
        if (adjacentPairs >= 2) gapSize = 'rundown'; // e.g., 5-6-7
        else if (adjacentPairs === 1 && oneGapPairs >= 1) gapSize = 'gapped'; // e.g., 5-6-8
        else if (adjacentPairs === 1) gapSize = 'connected'; // e.g., 5-6-T
        else if (oneGapPairs >= 1) gapSize = 'one-gap'; // e.g., 5-7-T

        // Phase 72: Count OESD and gutshot possibilities using 5-card straight windows
        // A straight requires 5 consecutive ranks. Count how many windows the board contributes to.
        let oesdCount = 0;
        let gutshotCount = 0;
        // Check all possible 5-card straight windows (A-5 through T-A)
        const boardSet = new Set(sorted);
        // Include ace-low: window [-1,0,1,2,3] maps to [A,2,3,4,5]
        const windows = [];
        for (let low = -1; low <= 8; low++) { // -1=wheel(A2345), 0=23456, ..., 8=9TJQK, 9=TJQKA
            const w = [];
            for (let j = 0; j < 5; j++) {
                let v = low + j;
                if (v === -1) v = 12; // Ace low
                if (v === 13) v = 12; // Ace high (already 12)
                w.push(v);
            }
            if (w.every(v => v >= 0 && v <= 12)) windows.push(w);
        }
        for (const w of windows) {
            const wSet = new Set(w);
            const boardHits = sorted.filter(v => wSet.has(v)).length;
            const uniqueHits = new Set(sorted.filter(v => wSet.has(v))).size;
            if (uniqueHits >= 3) {
                const needed = 5 - uniqueHits;
                if (needed === 2) gutshotCount++; // board has 3 to a straight, 2 cards to complete
                // If uniqueHits >= 4, someone could already have a straight or OESD
            }
        }
        // OESD: 4 consecutive board+hand ranks in a window. Approximate from board connectivity.
        if (adjacentPairs >= 2) oesdCount = Math.max(2, oesdCount); // rundown boards enable many OESDs
        else if (adjacentPairs >= 1 && oneGapPairs >= 1) oesdCount = Math.max(1, oesdCount);

        const threeToStraight = gutshotCount >= 2; // multiple straight windows with 3 board cards
        const straightPossible = adjacentPairs >= 2 || (adjacentPairs >= 1 && sorted.length >= 4);
        const straightDrawHeavy = (adjacentPairs >= 2) || (threeToStraight && adjacentPairs >= 1);

        // Broadway draw detection (T,J,Q,K,A)
        const broadwayCards = sorted.filter(v => v >= 8).length; // T=8, J=9, Q=10, K=11, A=12
        const broadwayDraw = broadwayCards >= 3;

        const highCards = rankVals.filter(v => v >= 10).length;
        const highestRank = Math.max(...rankVals);
        const lowestRank = Math.min(...rankVals);
        const spread = highestRank - lowestRank;

        return {
            wet: (connected && maxSuitCount >= 2) || maxSuitCount >= 3 || straightDrawHeavy,
            dry: !connected && maxSuitCount < 2 && (maxRankCount >= 2 || spread > 6),
            highCard: highCards >= 2 || highestRank >= 12,
            lowBoard: highCards === 0,
            paired: maxRankCount >= 2,
            flushy: maxSuitCount >= 3,
            connected,
            monotone: maxSuitCount === validBoard.length && validBoard.length >= 3,
            aceHigh: highestRank === 12,
            broadwayHeavy: highCards >= 3,
            // Phase 72 new properties
            straightPossible,
            straightDrawHeavy,
            connectedness,
            oesdCount,
            gutshotCount,
            threeToStraight,
            wheelDraw,
            broadwayDraw,
            gapSize,
            spread,
            adjacentPairs,
            lowestRank,
        };
    }

    /**
     * Phase 34: Explain WHY the solver chose this specific sizing.
     * Hand-aware reasoning — references actual hand strength + board interaction.
     */
    _getSizingReason(sizePct, handStrength, texture, street, isBet, isRaise) {
        if (!isBet && !isRaise) return '';
        if (sizePct === 0) return '';
        const hs = handStrength.toLowerCase();
        const isNutted = hs.includes('set') || hs.includes('straight') || hs.includes('flush') || hs.includes('full house') || hs.includes('quads');
        const isTopPair = hs.includes('top pair');
        const isDraw = hs.includes('draw') || hs.includes('oesd') || hs.includes('gutshot');
        const isMonster = hs.includes('monster');
        const isCombo = hs.includes('combo');
        const isAir = hs.includes('air') || hs.includes('overcard') || hs.includes('no pair');
        const isOverpair = hs.includes('overpair');
        const isSecondPair = hs.includes('second pair');
        const isBottomPair = hs.includes('bottom pair');
        const isTwoPair = hs.includes('two pair');
        const isTrips = hs.includes('trips');

        // Phase 55: Raise-specific sizing reasoning
        if (isRaise) {
            if (sizePct <= 75) {
                if (isNutted || isTrips) return 'Min-raise with a monster — disguise hand strength while building the pot. Looks like a bluff.';
                if (isDraw || isMonster) return 'Small raise as a semi-bluff — building fold equity cheaply with backup equity if called.';
                return 'Small raise — polarized between value and bluffs, minimizing risk.';
            }
            if (sizePct <= 150) {
                if (isNutted) return 'Standard raise for value — building the pot while keeping villain\'s calling range wide.';
                if (isDraw) return 'Raise with a draw — leveraging fold equity plus implied odds if you hit.';
                if (isTopPair) return 'Raise for protection — charge draws and deny equity on a dynamic board.';
                return 'Standard raise size polarizes the range between value and bluffs.';
            }
            if (isNutted) return 'Large raise to extract maximum value — villain is committed with any reasonable holding.';
            if (isAir) return 'Large raise as a bluff — representing an extremely strong range with maximum pressure.';
            return 'Oversize raise applies extreme pressure — only the strongest hands can continue.';
        }

        // Small bets (16-33%) — merged/range betting strategy
        if (sizePct <= 33) {
            if (isNutted && texture.dry) return 'Small sizing with a nutted hand on a dry board — keeping villain\'s entire range in. The board runs out well for you.';
            if (isTopPair && texture.dry) return 'Small sizing with top pair on a dry board — range bet exploiting range advantage. Few draws threaten you.';
            if (isTwoPair && texture.dry) return 'Small sizing with two pair on a dry board — trapping, as villains can\'t put you on this exact hand.';
            if (isAir && street === 'flop') return 'Small c-bet bluff — range betting at minimum cost. Villain folds their weakest hands, you lose little when called.';
            if (isDraw && street === 'flop') return 'Small c-bet with a draw — cheap equity denial that sets up the turn. Low risk, high reward on favorable runouts.';
            if (texture.aceHigh) return 'Range bet sizing on ace-high board — IP player has range advantage. Small bets target the entire range.';
            if (texture.broadwayHeavy) return 'Small c-bet on a broadway-heavy board — PFR has significant range advantage with more premium broadway combos.';
            if (texture.lowBoard && !texture.connected) return 'Small sizing on a low disconnected board — neither range connects strongly, so a cheap range bet picks up dead money.';
            if (texture.dry && texture.paired) return 'Small sizing on paired dry texture — few combinations hit this board. Range bet denies equity.';
            if (street === 'flop') return 'Range c-bet sizing — on this texture, betting small with your entire range is more profitable than checking.';
            if (street === 'turn') return 'Small turn probe — testing villain\'s range after a checked flop. Minimal investment with fold equity.';
            return 'Small sizing minimizes risk while applying range-wide pressure.';
        }

        // Medium bets (40-66%) — value-heavy, protection-focused
        if (sizePct <= 66) {
            if (isNutted && texture.wet) return 'Medium sizing builds the pot with a monster while charging draws — the board is dynamic and you need to protect.';
            if (isNutted && street === 'turn') return 'Medium sizing on the turn sets up a geometric river shove — betting ~66% on turn leaves a pot-sized jam on river.';
            if (isTopPair && texture.connected) return 'Medium sizing with top pair on a connected board — charging straight and flush draws while extracting value.';
            if (isTopPair && texture.wet) return 'Medium protection bet with top pair — too many draws to give a free card. Price villain\'s draws incorrectly.';
            if (isDraw && texture.wet) return 'Semi-bluff sizing — enough fold equity to profit immediately, plus 30%+ equity when called.';
            if (isCombo || isMonster) return 'Medium sizing with a combo draw — fold equity + massive equity when called makes this highly profitable.';
            if (isOverpair) return 'Medium sizing with an overpair — extract value from top pair and worse while keeping the range balanced.';
            if (isTwoPair) return 'Medium sizing with two pair — building the pot against top pair and draws before the board changes.';
            if (isSecondPair && texture.dry) return 'Medium sizing with second pair for thin value — targeting bottom pair and ace-high hands.';
            if (street === 'turn') return 'Geometric turn sizing — 60-66% bets on turn set up a natural pot-sized river shove.';
            if (texture.wet || texture.connected) return 'Medium sizing on a coordinated board — polarized enough to deny equity, merged enough to get called.';
            return 'Medium sizing builds the pot while keeping villain\'s calling range wide.';
        }

        // Large bets (75-100%) — polarized strategy
        if (sizePct <= 100) {
            if (isNutted && street === 'river') return 'Pot-sized value bet on the river — villain\'s bluff-catchers are getting 2:1 odds. You need 33% bluffs to stay balanced.';
            if (isNutted) return 'Large sizing to build a big pot with a monster — villain is priced in with strong-but-second-best hands.';
            if (isDraw && street !== 'river') return 'Large semi-bluff — maximum fold equity with a draw. If villain calls, you still have outs to improve.';
            if (isAir && street === 'river') return 'Pot-sized river bluff — fully polarized. You\'re repping the nuts and villain must be strong to call.';
            if (isAir && street === 'turn') return 'Large turn barrel as a bluff — building a credible story. Villain must defend with strong hands.';
            if (isTopPair && texture.wet) return 'Large bet with top pair on a wet board — forced to go big for protection. Can\'t risk a cheap draw completion.';
            if (texture.flushy || texture.monotone) return 'Large sizing on a flush-possible board — polarized between flushes and bluffs. Medium hands check.';
            if (street === 'river') return 'Pot-sized river bet — polarized between value and bluffs. At this size, your range should be ~67% value, ~33% bluffs.';
            return 'Large sizing polarizes your range — only very strong hands and bluffs bet this big.';
        }

        // Overbets (125%+) / All-in
        if (sizePct >= 125 || sizePct === 999) {
            if (isNutted && street === 'river') return 'River overbet for max value — targeting villain\'s second-nut type hands that can\'t fold. This is the most +EV sizing with the nuts.';
            if (isNutted) return 'Overbet with a monster — puts villain\'s entire stack at risk. Strong hands can\'t fold, building a massive pot.';
            if (isAir && street === 'river') return 'Overbet bluff — representing a polarized nutted range. Villain needs extremely strong hands to call, creating profitable bluffs.';
            if ((isDraw || isCombo) && sizePct === 999) return 'All-in semi-bluff — maximum fold equity combined with draw equity. The math works: fold equity + equity when called = profitable.';
            if (isTopPair && sizePct === 999) return 'All-in for protection — with a short stack-to-pot ratio, shoving denies villain\'s equity realization.';
            return 'Overbet applies extreme pressure — exploiting range advantage. Only the strongest holdings continue.';
        }

        return '';
    }

    /**
     * Phase 25: Identify the core strategic concept behind the solver's action.
     */
    _getStrategicConcept(action, handStrength, texture, street, freq, validActions, handActions, nodeType, heroPosition, villainPosition) {
        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');

        // Phase 68: Position context — relative to villain, never hero's seat
        // alone. Hero is only "checking back in position" when hero actually
        // acts after THIS villain, so a CO with the BTN still to act is OOP
        // and a BB facing the SB is IP.
        const isIP = this._isInPosition(heroPosition, villainPosition);
        const isOOP = Boolean(heroPosition && villainPosition) && !isIP;
        const posTag = isIP ? ' (IP)' : isOOP ? ' (OOP)' : '';

        // ═══ CHECKING CONCEPTS (Phase 56: Enhanced depth, Phase 68: Position-aware) ═══
        if (isCheck) {
            if (handStrength.includes('top pair') && handStrength.includes('top kicker')) {
                if (isIP && texture.wet) return 'Checking back TPTK in position on a wet board — pot control while retaining the positional advantage to call or bet later streets.';
                if (isOOP && texture.wet) return 'Checking TPTK from OOP on a wet board — building a check-call or check-raise range. OOP checks carry more monsters for balance.';
                if (texture.wet) return 'Pot control with TPTK on a wet board — checking avoids getting raised off a strong but vulnerable hand. You can call bets profitably.';
                if (isIP) return 'Checking back TPTK in position — trapping with a hand that\'s strong enough to check-call or check-raise later.';
                return 'Checking back TPTK as a trap — your hand is strong enough to check-call or check-raise on later streets.';
            }
            if (handStrength.includes('top pair') || handStrength.includes('overpair')) {
                if (texture.straightDrawHeavy) return 'Checking a one-pair hand on a straight-heavy board — too many draws complete on the turn. Pot control avoids getting raised off your hand.';
                if (isIP && texture.wet) return 'Checking back in position for pot control — your pair is vulnerable but you maintain the positional advantage for future streets.';
                if (isOOP) return 'Checking OOP to build a strong check-call range — one-pair hands from OOP often check to control the pot and avoid being raised.';
                if (texture.wet) return 'Pot control — your pair is vulnerable on this wet board. Checking avoids facing a raise with a one-pair hand.';
                if (street === 'turn') return 'Checking the turn to control the pot — your hand has showdown value but doesn\'t want to face a raise.';
                return 'Pot control with a strong-but-vulnerable hand — checking keeps the pot manageable and avoids bloating it with a one-pair hand.';
            }
            if (handStrength.includes('set') || handStrength.includes('full house') || handStrength.includes('quads')) {
                if (street === 'flop') return 'Trapping with a monster — checking the flop to induce turn bets. Your hand is disguised.';
                return 'Slow-playing a monster — checking to let villain catch up or bluff into you on a later street.';
            }
            if (handStrength.includes('two pair')) {
                return 'Checking two pair as a trap — your hand is strong but disguised. Check-raising is an option if villain bets.';
            }
            if (handStrength.includes('monster draw') || handStrength.includes('combo draw')) {
                return 'Checking a big draw to realize equity cheaply — if villain bets, you can raise as a semi-bluff with massive equity.';
            }
            if (handStrength.includes('draw')) {
                if (street === 'turn') return 'Free card play on the turn — checking preserves your stack when the draw misses the river.';
                return 'Taking a free card with draw equity — checking preserves the option to realize equity without risk.';
            }
            if (handStrength.includes('air') || handStrength.includes('no pair') || handStrength.includes('overcard')) {
                if (isIP && street === 'flop') return 'Checking back air in position — preserving the option to bluff the turn if a good card comes, while taking a free card.';
                if (isOOP && street === 'flop') return 'Checking air from OOP — you lack position and equity. If villain bets, you can fold without losing more.';
                if (street === 'flop') return 'Checking back air — this hand has insufficient equity to c-bet and the board doesn\'t favor your range.';
                if (street === 'river') return 'Giving up with air on the river — no value target and villain\'s range is too strong to bluff.';
                return 'Giving up with air — no equity to bet for value and insufficient fold equity to profitably bluff.';
            }
            if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                return 'Checking a marginal made hand — your hand has showdown value but can\'t bet for value or bluff effectively. Play defense.';
            }
            return 'Checking to control the pot size and realize equity on future streets.';
        }

        // ═══ BETTING CONCEPTS (Phase 58: Enhanced board-hand interaction, Phase 68: Position-aware) ═══
        if (isBet) {
            const hs = handStrength.toLowerCase();
            // Position-specific donk bet note for OOP leading
            if (isOOP && nodeType === 'hero_bets_or_checks' && street !== 'preflop') {
                // OOP leading (donk bet) is rare in GTO — add a note when it happens
                if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard')) {
                    return 'Donk-betting OOP as a bluff — rare in GTO, but the board texture heavily favors your range over the preflop aggressor. This exploits range disadvantage.';
                }
            }
            // Nutted hands
            if (hs.includes('quads') || hs.includes('full house')) {
                if (street === 'river') return 'Value betting the nuts on the river — extracting maximum from second-best hands that can\'t fold.';
                return 'Building the pot with an unbeatable hand — bet to grow the pot for river value.';
            }
            if (hs.includes('nut flush') || hs.includes('nut straight')) {
                if (street === 'river') return 'Betting the nuts for max value — your hand is the best possible. Target strong second-best hands.';
                return 'Betting a nutted hand to build the pot — you want to get stacks in by the river.';
            }
            if (hs.includes('flush') && !hs.includes('draw')) {
                if (texture.connected) return 'Betting a flush on a connected board — protect against full house draws and extract from worse flushes.';
                return 'Betting a flush for value — target sets, two pair, and strong pairs.';
            }
            if (hs.includes('straight') && !hs.includes('draw')) {
                if (texture.flushy || texture.monotone) return 'Betting a straight on a flushy board — need to extract value before a flush card kills action.';
                if (texture.straightDrawHeavy) return 'Betting a straight on a connected board — higher straights are possible. Bet for value now before the board pairs or a higher card comes.';
                return 'Betting a straight for value — target two pair, sets, and strong one-pair hands.';
            }
            if (hs.includes('set')) {
                if (texture.straightDrawHeavy) return 'Betting a set on a straight-heavy board — multiple straight draws are out there. Charge them heavily or the board will get away from you.';
                if (texture.wet) return 'Betting a set on a wet board — charge draws heavily. Sets want big pots before the board gets scary.';
                if (texture.dry) return 'Betting a set on a dry board — slow-play is an option, but betting builds the pot for later streets.';
                return 'Value betting a set — targeting top pair and overpairs that can\'t fold.';
            }
            if (hs.includes('two pair')) {
                if (texture.straightDrawHeavy) return 'Betting two pair on a rundown board — straight draws are everywhere. Bet big to deny equity before the turn changes everything.';
                if (texture.connected) return 'Betting two pair on a connected board — charge straight draws and build the pot before the board changes.';
                return 'Betting two pair for value — strong enough to target one-pair hands and draws.';
            }
            if (hs.includes('top pair') && hs.includes('top kicker')) {
                if (texture.wet) return 'Betting TPTK for value and protection — too many draws to give free cards.';
                if (texture.dry) return 'Betting TPTK for thin value on a dry board — target weaker top pair and second pair.';
                return 'Betting top pair top kicker — the strongest one-pair hand. Extract from worse pairs.';
            }
            if (hs.includes('top pair') && hs.includes('strong kicker')) {
                return 'Betting top pair strong kicker for value — ahead of most of villain\'s calling range.';
            }
            if (hs.includes('top pair')) {
                if (texture.wet) return 'Betting for value and protection on a wet board — charge draws while your top pair is ahead.';
                if (hs.includes('weak kicker')) return 'Thin value bet with top pair weak kicker — targeting second pair and draws, but beware of domination.';
                return 'Betting top pair for value — targeting weaker pairs and high card hands.';
            }
            if (hs.includes('overpair')) {
                if (texture.wet) return 'Betting an overpair for protection on a wet board — too many draws to give a free card.';
                return 'Betting an overpair for value — stronger than any pair on the board.';
            }
            // Draw hands
            if (hs.includes('monster draw') || hs.includes('combo draw')) {
                if (street === 'river') return 'Bluffing the river with a busted monster draw — your hand has no showdown value but you can represent the nuts.';
                return 'Semi-bluffing with a monster draw — huge equity when called plus fold equity. This is one of the most +EV spots.';
            }
            if (hs.includes('nut flush draw')) {
                if (street === 'river') return 'Bluffing with a missed nut flush draw — you block the nut flush, making it harder for villain to have it.';
                return 'Semi-bluffing with the nut flush draw — 9 clean outs plus fold equity. Premium bluff candidate.';
            }
            if (hs.includes('flush draw')) {
                if (street === 'river') return 'Bluffing with a missed flush draw — converting busted equity into fold equity on the river.';
                return 'Semi-bluffing with a flush draw — betting now gives fold equity plus equity when called.';
            }
            if (hs.includes('oesd') || hs.includes('double gutshot')) {
                if (street === 'river') return 'Bluffing with a missed straight draw — converting busted equity into a river bluff.';
                if (texture.straightDrawHeavy) return 'Semi-bluffing with 8 straight outs on a rundown board — villain has draws too, so fold equity is lower but your equity is real. Bet to deny their draws.';
                return 'Semi-bluffing with 8 straight outs — enough equity to make betting very profitable.';
            }
            if (hs.includes('gutshot')) {
                if (street === 'river') return 'Bluffing the river with a busted gutshot — no showdown value, only fold equity.';
                if (texture.gapSize === 'one-gap' || texture.threeToStraight) return 'Semi-bluffing with a gutshot on a board with straight possibilities — your draw is hidden and the connected texture adds credibility to your bet.';
                return 'Semi-bluffing with a gutshot — 4 outs plus fold equity. A balanced bluff candidate.';
            }
            if (hs.includes('backdoor')) {
                return 'Betting with backdoor equity — preserving the option to hit a draw on the turn while picking up the pot now.';
            }
            // Air
            if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard') || hs.includes('high cards')) {
                if (street === 'river') return 'Pure bluff on the river — the only way to win with no made hand. You\'re repping a strong range.';
                if (street === 'flop') return 'C-bet bluff with air — attacking villain\'s capped range. Most opponents fold too much to flop c-bets.';
                return 'Bluffing as part of a balanced strategy — keeping the opponent indifferent about calling.';
            }
            // Marginal hands
            if (hs.includes('second pair')) {
                if (street === 'river') return 'Thin value bet with second pair — targeting weaker holdings, though this is close between betting and checking.';
                return 'Betting second pair for thin value and protection — charge draws and target bottom pair.';
            }
            if (hs.includes('bottom pair')) {
                return 'Thin value bet / protection bet with bottom pair — targeting ace-high and king-high hands.';
            }
            if (hs.includes('underpair')) {
                return 'Betting an underpair as a semi-bluff — some showdown value plus fold equity against overcards.';
            }
            return 'Betting for value and protection — extracting from worse hands while denying equity.';
        }

        // ═══ CALLING CONCEPTS (Phase 56: Enhanced depth, Phase 68: Position-aware) ═══
        if (isCall) {
            // Position-specific calling note
            if (isIP && street === 'river' && (handStrength.includes('second pair') || handStrength.includes('bottom pair'))) {
                return 'Bluff-catching in position on the river — being IP means you see villain\'s bet before deciding. Your positional advantage makes marginal calls more profitable.';
            }
            if (isOOP && street === 'river' && (handStrength.includes('top pair') || handStrength.includes('overpair'))) {
                return 'Calling down from OOP — strong enough to bluff-catch, but OOP calling ranges need to be tighter since you face more aggression.';
            }
            if (handStrength.includes('monster draw') || handStrength.includes('combo draw')) {
                return 'Calling with a monster draw — massive equity (15+ outs) makes this a clear continue. Raising is also viable as a semi-bluff.';
            }
            if (handStrength.includes('flush draw')) {
                if (handStrength.includes('nut')) return 'Calling with the nut flush draw — 9 clean outs plus implied odds when the flush hits.';
                return 'Calling with a flush draw — 9 outs (~19% turn equity) plus implied odds when completing.';
            }
            if (handStrength.includes('OESD') || handStrength.includes('double gutshot')) {
                return 'Calling with 8 straight outs — the pot odds are sufficient and implied odds boost the call.';
            }
            if (handStrength.includes('gutshot')) {
                if (handStrength.includes('overcard') || handStrength.includes('top pair')) return 'Calling with a gutshot plus extra equity — the additional outs make this profitable.';
                return 'Calling with a gutshot — 4 outs is marginal but implied odds and backdoor equity justify the call.';
            }
            if (handStrength.includes('draw')) {
                return 'Calling with draw equity — pot odds plus implied odds make continuing profitable.';
            }
            if (handStrength.includes('set') || handStrength.includes('two pair') || handStrength.includes('full house')) {
                return 'Flatting with a monster — keeping villain\'s bluffs and weaker value in the pot. Raising would fold out too many hands you beat.';
            }
            if (handStrength.includes('top pair') && handStrength.includes('top kicker')) {
                return 'Calling with TPTK — strong enough to continue but raising would only get action from better hands.';
            }
            if (handStrength.includes('top pair') || handStrength.includes('overpair')) {
                if (street === 'river') return 'Bluff-catching with a strong pair on the river — your hand beats all of villain\'s bluffs and some thin value.';
                return 'Calling with a strong pair — flatting keeps the pot controlled while you\'re ahead of most of villain\'s range.';
            }
            if (street === 'river') {
                if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                    return 'Bluff-catching on the river with a marginal pair — you need villain to be bluffing at the right frequency.';
                }
                return 'Bluff-catching on the river — calling at the right frequency to prevent villain from profiting with pure bluffs.';
            }
            if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                return 'Calling with a marginal made hand — your pair beats villain\'s bluffs and some of their value range.';
            }
            return 'Calling to see another card and realize equity.';
        }

        // ═══ RAISING CONCEPTS (Phase 58: Enhanced) ═══
        if (isRaise) {
            if (handStrength.includes('set')) {
                if (street === 'flop') return 'Check-raising a set on the flop — the strongest play. Build the pot and let aggressive opponents barrel into you.';
                return 'Raising a set for value — building a big pot with a hand that dominates two pair and overpairs.';
            }
            if (handStrength.includes('two pair')) {
                return 'Raising two pair for value — strong enough to raise for value against top pair and overpairs.';
            }
            if (handStrength.includes('straight') || handStrength.includes('flush') || handStrength.includes('full house')) {
                return 'Raising the nuts — building the pot with a monster hand. Get stacks in before the board changes.';
            }
            if (handStrength.includes('top pair') && handStrength.includes('top kicker')) {
                return 'Raising TPTK — in certain spots, raising for value targets worse top pair combos and avoids being outdrawn.';
            }
            if (handStrength.includes('monster draw') || handStrength.includes('combo draw')) {
                return 'Semi-bluff raise with a monster draw — huge fold equity plus 15+ outs if called. One of the best raising hands.';
            }
            if (handStrength.includes('flush draw')) {
                if (handStrength.includes('nut')) return 'Semi-bluff raise with the nut flush draw — premium bluff candidate that blocks villain\'s nutted range.';
                return 'Semi-bluff raise with a flush draw — leveraging fold equity plus 9 outs when called.';
            }
            if (handStrength.includes('OESD') || handStrength.includes('double gutshot')) {
                return 'Semi-bluff raise with 8 straight outs — enough equity to make this raise profitable even when called.';
            }
            if (handStrength.includes('gutshot')) {
                return 'Semi-bluff raise with a gutshot — 4 outs isn\'t many, but the fold equity makes this raising hand profitable.';
            }
            if (handStrength.includes('air') || handStrength.includes('overcard') || handStrength.includes('no pair')) {
                if (street === 'flop') return 'Check-raise bluff — attacking villain\'s c-bet with maximum aggression. Forces folds from better hands.';
                return 'Bluff raise — attacking villain\'s capped range with aggression. You need villain to fold frequently.';
            }
            return 'Raising to build the pot and apply pressure — balancing value raises with bluffs.';
        }

        // ═══ FOLDING CONCEPTS (Phase 56: Enhanced depth) ═══
        if (isFold) {
            if (handStrength.includes('flush draw') || handStrength.includes('nut flush draw')) {
                return 'Folding even with a flush draw — the bet size prices you out. You need ~4:1 odds for 9 outs, and the sizing is too large.';
            }
            if (handStrength.includes('OESD') || handStrength.includes('double gutshot')) {
                return 'Folding a straight draw — the bet sizing doesn\'t give you correct pot odds, and implied odds aren\'t sufficient.';
            }
            if (handStrength.includes('gutshot')) {
                return 'Folding a gutshot — only 4 outs (~8% equity) isn\'t enough against this bet size. You need ~11:1 odds to call.';
            }
            if (handStrength.includes('draw')) {
                return 'Folding a draw — the bet sizing prices out your draw. Calling would be a -EV play.';
            }
            if (handStrength.includes('top pair')) {
                return 'Folding top pair against heavy aggression — villain\'s range is polarized toward strong value hands that beat you.';
            }
            if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                if (street === 'river') return 'Folding a weak pair on the river — you\'re not getting the right price to bluff-catch against this sizing.';
                return 'Folding a marginal pair — facing too much aggression to continue. Your hand doesn\'t have enough equity vs villain\'s range.';
            }
            if (handStrength.includes('overpair')) {
                return 'Folding an overpair — even strong pairs must fold facing extreme aggression. Villain\'s range is heavily weighted toward sets and better.';
            }
            if (handStrength.includes('air') || handStrength.includes('no pair') || handStrength.includes('overcard')) {
                return 'Folding air — no made hand, insufficient draw equity. This hand is at the bottom of your range.';
            }
            return 'Folding — the hand lacks sufficient equity against villain\'s betting range to continue.';
        }

        return '';
    }

    /**
     * Phase 25: Explain WHY the solver uses a mixed strategy here.
     */
    /**
     * Phase 46: Flop-specific context enhancement.
     * Key concepts: c-bet logic, check-raise construction, range advantage,
     * board texture interaction, donk betting, backdoor equity.
     */
    _getFlopContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq, sizePct) {
        const a = optimalAction.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        let context = '';

        // C-bet reasoning (hero bets or checks on flop, typically as preflop aggressor)
        if (nodeType === 'hero_bets_or_checks') {
            if (isBet) {
                const isNutted = hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush');
                const hasDraw = hs.includes('draw') || hs.includes('backdoor');
                const isTopPair = hs.includes('top pair') || hs.includes('overpair');

                if (sizePct <= 33 && texture.dry) {
                    context = 'Small c-bet on a dry flop — range-betting strategy. On dry boards, the preflop aggressor c-bets small with most of their range because they have a range advantage.';
                } else if (sizePct <= 33 && !texture.dry) {
                    context = 'Small c-bet on a wet flop — probing for information while keeping the pot controlled. Smaller sizes risk less on coordinated boards.';
                } else if (sizePct >= 60 && isNutted) {
                    context = 'Large c-bet with a strong hand — polarizing on the flop to build the pot for later streets. This sizing allows for geometric bet-bet-shove lines.';
                } else if (sizePct >= 60 && hasDraw) {
                    context = 'Large c-bet semi-bluff — maximum fold equity with a draw. Two cards to come gives strong backup equity if called.';
                } else if (sizePct >= 60 && (hs.includes('air') || hs.includes('no pair'))) {
                    context = 'Large c-bet as a bluff on the flop — representing a strong range and putting villain in a tough spot with their entire range.';
                } else if (isTopPair && texture.wet) {
                    context = 'C-betting for value and protection — charging draws on a wet flop while your hand is currently best.';
                } else if (isTopPair && texture.dry) {
                    context = 'C-betting for thin value on a dry board — extracting from worse pairs and high-card hands.';
                }
            } else if (isCheck) {
                if (hs.includes('set') || hs.includes('two pair')) {
                    context = 'Checking back a strong hand on the flop — trapping to disguise strength and induce villain action on later streets.';
                } else if (hs.includes('draw') && hs.includes('backdoor')) {
                    context = 'Checking back with backdoor equity — preserving the option to improve on the turn without committing chips.';
                } else if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard')) {
                    context = 'Giving up the c-bet with air — the board doesn\'t favor the preflop aggressor\'s range enough to justify bluffing.';
                } else if (hs.includes('top pair') || hs.includes('overpair')) {
                    if (texture.wet) context = 'Checking back top pair on a wet board for pot control — a common GTO strategy to avoid being check-raised off a vulnerable hand.';
                    else context = 'Checking back for deception — protecting the checking range with strong hands so it isn\'t always weak.';
                }
            }
        }

        // Facing a c-bet (hero calls, raises, or folds)
        if (nodeType === 'hero_faces_bet') {
            if (isCall) {
                if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('oesd')) {
                    context = 'Floating the c-bet with a draw — calling with equity to improve on the turn. Two cards to come maximizes implied odds.';
                } else if (hs.includes('top pair') || hs.includes('overpair')) {
                    context = 'Calling the flop c-bet with a strong hand — keeping villain\'s bluffs in and not inflating the pot unnecessarily.';
                } else if (hs.includes('second pair') || hs.includes('middle pair')) {
                    context = 'Defending a medium-strength hand vs the c-bet — good enough to call but not strong enough to raise.';
                } else if (hs.includes('backdoor')) {
                    context = 'Floating with backdoor equity — calling the flop cheaply to see if the turn improves your draw potential.';
                }
            } else if (isRaise) {
                if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight')) {
                    context = 'Check-raising for value on the flop — the strongest play with a nutted hand, building a big pot early.';
                } else if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('oesd')) {
                    context = 'Check-raise semi-bluff — combining fold equity with draw equity. If called, you still have strong equity to improve.';
                } else if (hs.includes('air') || hs.includes('no pair')) {
                    context = 'Check-raise bluff on the flop — attacking the c-bettor\'s range with maximum aggression. This works because most c-bet ranges are wide and weak.';
                }
            } else if (isFold) {
                if (hs.includes('draw') && sizePct >= 60) {
                    context = 'Folding a draw to a large c-bet — the sizing prices out your draw equity. You need better pot odds to continue profitably.';
                } else if (hs.includes('no pair') || hs.includes('air')) {
                    context = 'Folding air to the c-bet — no equity and no backdoor draws make continuing unprofitable regardless of pot odds.';
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
// @@PUB_REGION_16@@
