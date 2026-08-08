// @@PUB_REGION_01@@
        // IMP-1 FIX: Filter out scenarios that generated questions the user already saw
        const safeSeenIds = Array.isArray(seenIds) ? seenIds : [];
        let pool = scenarios;

        if (safeSeenIds.length > 0) {
            const unseenScenarios = scenarios.filter(s => {
                const possibleId = `pio_${s.id}`;
                return !safeSeenIds.some(id => id.startsWith(possibleId));
            });
            // Use unseen pool if available, otherwise fall back to full pool
            if (unseenScenarios.length > 0) pool = unseenScenarios;
        }

        const scenario = pool[Math.floor(Math.random() * pool.length)];
        return this.buildQuestionFromScenario(scenario, gameConfig, level, 0);
    }

    async fetchSolverPool(gameConfig, level, limit = 25, targetStreet = null, routingParams = {}) {
        try {
            // ═══ PHASE 15: Allow street override for targeted practice ═══
            const street = targetStreet || this.getStreetForLevel(level);

            // ═══ SOLVER SCENARIO MAP: Use stackDepths from GameScenarioMap if provided ═══
            const { stackDepths, spotTypes } = routingParams;
            const effectiveStackDepths = (stackDepths && stackDepths.length > 0)
                ? stackDepths
                : [gameConfig.pioStackDepth];

            // ═══ PHASE 21: Randomized pool fetch for varied training spots ═══
            // Fetch a larger pool then shuffle client-side to avoid repetitive scenarios.
            // Supabase doesn't support ORDER BY random(), so we over-fetch and shuffle.
            const fetchLimit = Math.min(limit * 4, 500);

            // Query across all effective stack depths (multi-depth for MTT games)
            let allData = [];
            for (const depth of effectiveStackDepths) {
                let query = this.db
                    .from('solved_spots_gold')
                    .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
                    .eq('game_type', gameConfig.pioGameType)
                    .eq('stack_depth', depth);
                // Only filter by street when one is specified (null = all streets)
                if (street) {
                    query = query.eq('street', street);
                }
                const { data, error } = await query
                    .limit(Math.ceil(fetchLimit / effectiveStackDepths.length));

                if (!error && data && data.length > 0) {
                    allData = allData.concat(data);
                }
            }

            if (allData.length === 0) {
                console.debug(`[DeterministicEngine] No solved spots for ${gameConfig.pioGameType} ${street} depths=[${effectiveStackDepths.join(',')}]bb`);
                return null;
            }

            // ═══ SOLVER SCENARIO MAP: Filter by spotTypes if provided ═══
            // SpotTypes map to scenario_hash patterns (e.g., 'rfi' matches scenarios with RFI action)
            if (spotTypes && spotTypes.length > 0) {
                // Underscore-delimited hashes: \b never matches inside snake_case,
                // so anchor tokens with (^|_) ... (_|$) instead.
                const spotTypePatterns = {
                    'rfi': /(^|_)(rfi|open|raise_first)(_|$)/i,
                    'vs3bet': /(^|_)(vs_?3bet|facing_?3bet|3bet_def|3b)(_|$)/i,
                    'bb_defense': /(^|_)(bb_def|bb_vs|big_blind)(_|$)/i,
                    'cold_call': /(^|_)(cold_call|flat|overcall)(_|$)/i,
                    '4bet': /(^|_)(4bet|four_bet|4b)(_|$)/i,
                    'squeeze': /(^|_)(squeeze|sqz)(_|$)/i,
                    'cbet': /(^|_)(cbet|c_?bet|flop_bet)(_|$)/i,
                    'turn_barrel': /(^|_)(barrel|turn_bet|double_barrel)(_|$)/i,
                    'river_bluff': /(^|_)(river|bluff|triple_barrel)(_|$)/i,
                    'check_raise': /(^|_)(check_?raise|xr)(_|$)/i,
                    'turn_probe': /(^|_)(probe|turn_lead)(_|$)/i,
                    'river_value': /(^|_)(river_value|thin_value|value_bet)(_|$)/i,
                };
                const patterns = spotTypes
                    .map(st => spotTypePatterns[st])
                    .filter(Boolean);

                if (patterns.length > 0) {
                    const filtered = allData.filter(row => {
                        const hash = (row.scenario_hash || '').toLowerCase();
                        return patterns.some(p => p.test(hash));
                    });
                    // Only apply filter if it returns results; otherwise fall through with full pool
                    if (filtered.length > 0) {
                        allData = filtered;
                        console.debug(`[DeterministicEngine] SpotType filter: ${spotTypes.join(',')} → ${filtered.length} scenarios`);
                    } else {
                        console.debug(`[DeterministicEngine] SpotType filter: ${spotTypes.join(',')} matched 0 scenarios, falling through with full pool`);
                    }
                }
            }

            // Fisher-Yates shuffle for true randomization of training spots
            const shuffled = [...allData];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Return only the requested number of scenarios
            return shuffled.slice(0, limit);
        } catch (err) {
            console.warn('[DeterministicEngine] fetchSolverPool error:', err.message);
            return null;
        }
    }

    buildQuestionFromScenario(scenario, gameConfig, level, questionIndex) {
        const strategyMatrix = scenario.strategy_matrix || {};
        const actions = strategyMatrix.actions || [];
        const frequencies = strategyMatrix.frequencies || {};
        const handEVs = strategyMatrix.hand_evs || {};

        if (actions.length === 0) return null;

        // ═══ SELECT A HERO HAND ═══
        // Pick from the frequency data — these are the hands the solver analyzed
        const sampleAction = actions.find(a => frequencies[a]) || actions[0];
        const handFreqs = frequencies[sampleAction] || {};
        let allHands = Object.keys(handFreqs || {}).filter(h => h && h.length >= 2);

        // ═══ APPLY HAND CLASS FILTER ═══
        if (gameConfig.handClass && gameConfig.handClass !== 'all') {
            const filteredHands = allHands.filter(h => matchesHandClass(h, gameConfig.handClass));
            if (filteredHands.length > 0) {
                allHands = filteredHands;
            } else {
                // Return null to force custom-train.js to skip this scenario
                return null;
            }
        }

        if (allHands.length === 0) return null;

        // Use questionIndex to pick different hands from same scenario
        const seed = hashSeed(scenario.scenario_hash + '_' + questionIndex);
        const heroHand = allHands[seed % allHands.length];

        // ═══ COMPUTE PER-ACTION FREQUENCIES FOR THIS HAND ═══
        const handActions = {};
        let validActions = [];
        let optimalAction = null;
        let maxFreq = -1;

        actions.forEach(action => {
            const freq = frequencies[action]?.[heroHand];
            if (freq !== undefined && freq >= 0 && freq <= 1) {
                handActions[action] = freq;
                validActions.push(action);
                if (freq > maxFreq) {
                    maxFreq = freq;
                    optimalAction = action;
                }
            }
        });

        // ═══ FREQUENCY CLAMPING PROTOCOL (Ghost Hand Bug Fix) ═══
        // Filter out actions with < 1% frequency, unless doing so removes all options.
        const clampedActions = validActions.filter(action => handActions[action] >= 0.01);
        if (clampedActions.length > 0) {
            validActions = clampedActions;
            // Re-evaluate optimal action among clamped
            maxFreq = -1;
            validActions.forEach(action => {
                const freq = handActions[action];
                if (freq > maxFreq) {
                    maxFreq = freq;
                    optimalAction = action;
                }
            });
        }

        if (!optimalAction || validActions.length === 0) return null;

        // ═══ EXTRACT BOARD & POSITION DATA (needed for node type detection) ═══
        const board = parseBoardFromHash(scenario.scenario_hash);
        const heroPosition = extractPositionFromHash(scenario.scenario_hash);
        const villainPosition = VILLAIN_MAP[heroPosition] || 'BB';
        const estimatedPot = strategyMatrix.pot || POT_BY_STREET[scenario.street] || 6;

        // ═══ PHASE 22: CONTEXT-AWARE ACTION FILTERING — GTO WIZARD PARITY ═══
        // GTO Wizard NEVER shows Fold when hero is not facing a bet.
        // GTO Wizard NEVER shows Check/Bet when hero IS facing a bet.
        // This is fundamental poker logic that must be enforced regardless of solver data.
        const nodeType = this.detectNodeType(validActions, scenario.street);

        if (scenario.street !== 'preflop') {
            const preFilterCount = validActions.length;
            if (nodeType === 'hero_bets_or_checks') {
                // Hero acts first or IP after check: only Check and Bet sizes are valid
                // Remove: Fold, Call, Raise (these require facing a bet)
                validActions = validActions.filter(a => {
                    const al = a.toLowerCase();
                    if (al === 'f') return false;                    // Fold — invalid
                    if (al === 'call') return false;                  // Call — invalid
                    if (al.startsWith('r') && al !== 'r') return false; // Raise sizes — invalid
                    if (al === 'r') return false;                     // Generic raise — invalid
                    return true; // Keep: check (c/x), bet sizes (b33, b66, etc.), allin
                });
            } else if (nodeType === 'hero_faces_bet') {
                // Hero faces a bet: only Fold, Call, Raise are valid
                // IMPORTANT: In PioSolver, 'c' = "call" when facing a bet (not check!)
                // We remap 'c' → 'call' and remove actual check/bet actions.
                validActions = validActions.map(a => {
                    const al = a.toLowerCase();
                    // Remap 'c' to 'call' in facing-bet context (PIO uses 'c' for both)
                    if (al === 'c') return 'call';
                    return a;
                }).filter(a => {
                    const al = a.toLowerCase();
                    if (al === 'x') return false;                     // Check — invalid when facing bet
                    if (al.startsWith('b')) return false;              // Bet sizes — invalid when facing a bet
                    return true; // Keep: fold (f), call, raise sizes (r50, r100, etc.), allin
                });

                // Also remap handActions keys so frequencies carry over
                if (handActions['c'] !== undefined && handActions['call'] === undefined) {
                    handActions['call'] = handActions['c'];
                }
                // Remap optimal action if needed
                if (optimalAction === 'c') optimalAction = 'call';
            }

            // If filtering removed ALL actions, restore original (defensive fallback)
            if (validActions.length === 0) {
                console.warn(`[DeterministicEngine] Context filter removed all actions for ${scenario.scenario_hash} nodeType=${nodeType}, restoring originals`);
                validActions = clampedActions.length > 0 ? clampedActions : actions.filter(a => handActions[a] !== undefined);
            }

            // Re-evaluate optimal action after filtering
            if (!validActions.includes(optimalAction)) {
                maxFreq = -1;
                optimalAction = null;
                validActions.forEach(action => {
                    const freq = handActions[action] || 0;
                    if (freq > maxFreq) {
                        maxFreq = freq;
                        optimalAction = action;
                    }
                });
            }

            if (preFilterCount !== validActions.length) {
                console.debug(`[DeterministicEngine] Context filter: ${preFilterCount} → ${validActions.length} actions (nodeType=${nodeType}) for ${scenario.scenario_hash}`);
            }
        }

        // ═══ PREFLOP: 'c' always means CALL (never check) ═══
        if (scenario.street === 'preflop') {
            const hasCAction = validActions.includes('c');
            if (hasCAction) {
                validActions = validActions.map(a => a === 'c' ? 'call' : a);
                if (handActions['c'] !== undefined && handActions['call'] === undefined) {
                    handActions['call'] = handActions['c'];
                }
                if (optimalAction === 'c') optimalAction = 'call';
            }
            // Also remap 'r' to specific raise sizes for cleaner labels
            // PIO uses 'r' generically for open-raise preflop
        }

        // ═══ BUILD GTO FREQUENCIES (0-100 scale) ═══
        const gtoFrequencies = {};
        validActions.forEach(action => {
            gtoFrequencies[action] = Math.round((handActions[action] || 0) * 100);
        });

        // IMP-4: Frequency normalization — ensure frequencies sum to ~100%
        const freqSum = Object.values(gtoFrequencies || {}).reduce((s, v) => s + v, 0);
        if (freqSum > 0 && Math.abs(freqSum - 100) > 1) {
            const factor = 100 / freqSum;
            validActions.forEach(action => {
                gtoFrequencies[action] = Math.round(gtoFrequencies[action] * factor);
            });
            // Assign rounding residual to the highest-frequency action so the sum is exactly 100
            const newSum = validActions.reduce((s, a) => s + (gtoFrequencies[a] || 0), 0);
            const residual = 100 - newSum;
            if (residual !== 0 && validActions.length > 0) {
                const topAction = validActions.reduce((best, a) =>
                    (gtoFrequencies[a] || 0) > (gtoFrequencies[best] || 0) ? a : best, validActions[0]);
                gtoFrequencies[topAction] += residual;
            }
        }

        // ═══ COMPUTE EV DATA (Real solver values + per-action approximation) ═══
        const heroHandEV = handEVs[heroHand] || 0;
        const allEVs = Object.values(handEVs || {}).filter(v => typeof v === 'number');
        const maxHandEV = allEVs.length > 0 ? Math.max(...allEVs) : heroHandEV;

        // ═══ PER-ACTION EV APPROXIMATION ═══
        // At Nash equilibrium, any action in the mixed strategy yields the same EV.
        // Actions with 0% frequency are strictly dominated (lower EV).
        // Approximate: actionEV = heroHandEV for mixed actions,
        //              actionEV = heroHandEV - penalty for 0% actions.
        const actionEVs = {};
        const heroFreqForHand = handActions; // { action: freq 0.0-1.0 }
        validActions.forEach(action => {
            const freq = heroFreqForHand[action] || 0;
            if (freq > 0) {
                // In the mix — all mixed actions yield approximately equal EV
                actionEVs[action] = Math.round(heroHandEV * 100) / 100;
            } else {
                // Not in mix — estimate penalty proportional to pot and strategy purity
                // The more "pure" the solver is (high correctFreq), the worse 0% actions are
                const penalty = estimatedPot * 0.15 * (1 + (gtoFrequencies[optimalAction] || 50) / 100);
                actionEVs[action] = Math.round((heroHandEV - penalty) * 100) / 100;
            }
        });

        // ═══ BUILD OPTIONS — GTO WIZARD PARITY ═══
        // Show ALL real solver actions (context-filtered). Exact GTOW style:
        //   Check/Bet node: Check → Bet sizes ascending
        //   Facing-bet node: Fold → Call → Raise sizes ascending
        // GTO Wizard shows ONLY what the solver has — no fillers unless absolutely needed.
        const sortedActions = this.sortActionsGTOWStyle(validActions, nodeType);
        const options = sortedActions.slice(0, 9).map(action => ({
            id: action,
            text: this.getActionLabelGTOW(action, estimatedPot),
            frequency: gtoFrequencies[action],
        }));

        // ═══ MINIMAL FILLER LOGIC (only when solver gives < 2 actions) ═══
        // GTO Wizard always shows at least 2 options for a decision.
        // If solver only has 1 action, add the most contextually natural alternative.
        if (options.length < 2) {
            const existingIds = new Set(options.map(o => o.id));
            const contextFillers = this.getContextualFillers(nodeType, existingIds, estimatedPot);

            for (const filler of contextFillers) {
                if (options.length >= 3) break;
                if (!existingIds.has(filler.id)) {
                    options.push({
                        id: filler.id,
                        text: filler.text,
                        frequency: 0,
                    });
                    gtoFrequencies[filler.id] = 0;
                    existingIds.add(filler.id);
                }
            }
        }

        // ═══ BUILD EXPLANATION (deterministic, no AI) ═══
        // Derive game category for tournament-only notes (ICM / bubble factor)
        const catSource = `${gameConfig?.gameId || gameConfig?.id || ''} ${gameConfig?.category || ''} ${gameConfig?.pioGameType || ''}`.toUpperCase();
        const gameCategory = catSource.includes('MTT') ? 'MTT'
            : catSource.includes('SPIN') ? 'SPINS'
            : catSource.includes('CASH') ? 'CASH'
            : null;

        const explanation = this.buildExplanation(heroHand, board, scenario.street,
            optimalAction, handActions, heroHandEV, validActions,
            { nodeType, heroPosition, villainPosition, estimatedPot, stackDepth: scenario.stack_depth,
              potType: extractScenarioContext(scenario.scenario_hash, scenario.street, heroPosition, villainPosition).potType,
              actionEVs, gameCategory });

        // ═══ DETERMINE MIXED STRATEGY CORRECTNESS ═══
        // In GTO, if a hand checks 62% and bets 38%, BOTH are correct
        // The "correct" answer is the highest-frequency action, but partial credit applies
        const isMixedStrategy = maxFreq < 0.95 && validActions.filter(a => handActions[a] > 0.05).length > 1;

        return {
            id: `pio_${scenario.id}_${heroHand}_${questionIndex}`,
            type: 'PIO',
            source: 'DETERMINISTIC_SOLVER',
            scenario: {
                board: board.join(' '),
                street: scenario.street,
                stackDepth: scenario.stack_depth,
                gameType: scenario.game_type,
                scenarioHash: scenario.scenario_hash,
                heroHand,
                heroPosition,
                heroStack: scenario.stack_depth || 100,
                pot: estimatedPot,
                villainPosition,
                villainStack: scenario.stack_depth || 100,
                action: this.buildActionDescription(validActions, scenario.street, heroPosition, villainPosition),
                nodeType,  // Phase 22: use already-computed node type
                context: extractScenarioContext(scenario.scenario_hash, scenario.street, heroPosition, villainPosition),
                isMixedStrategy,
            },
            heroCards: parseHandToCards(heroHand, board),
            // SYS-002 FIX: Populate boardCards array for PNG card rendering
            boardCards: board.length > 0 ? board : [],
            question: this.buildQuestionText(heroHand, board, scenario.street, heroPosition, villainPosition, validActions, estimatedPot, scenario.scenario_hash, scenario.stack_depth),
            options,
            correctAnswer: optimalAction,
            correctAnswerText: this.getActionLabel(optimalAction, estimatedPot),
            // ═══ REAL SOLVER DATA ═══
            // Phase 22: Ensure rawFrequencies keys match remapped action IDs
            // (e.g., if 'c' was remapped to 'call' in facing-bet context)
            frequencies: handActions,         // Raw 0.0-1.0 per action (remapped)
            gtoFrequencies,                   // Percentage 0-100 per action for UI
            rawFrequencies: (() => {
                // If 'c' was remapped to 'call', add 'call' key to raw frequencies too
                if (nodeType === 'hero_faces_bet' && frequencies['c'] && !frequencies['call']) {
                    return { ...frequencies, call: frequencies['c'] };
                }
                return frequencies;
            })(),       // Full per-hand matrix
            evData: {
                heroHandEV,
                optimalEV: maxHandEV,
                handEVs,
                heroHand,
                actionEVs,  // Per-action EV for GTOW-style display on buttons
            },
            explanation,
            difficulty: level,
            heroHand,
            // Consumers read these at the top level (not just nested in evData)
            actionEVs,
            estimatedPot,
            // Phase 51: Hand categorization for replay display
            handCategory: this.categorizeHand(heroHand, board),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CHART ENGINE (Push/Fold)
    // ═══════════════════════════════════════════════════════════════════════

    async generateFromCharts(gameConfig, level, seenIds) {
        try {
            const { data: charts, error } = await this.db
                .from('memory_charts_gold')
                .select('*')
                .lte('stack_depth', (gameConfig.pioStackDepth || 15) + 5)
                .gte('stack_depth', Math.max(1, (gameConfig.pioStackDepth || 15) - 5))
                .limit(20);

            if (error || !charts || charts.length === 0) return null;

            // Honor seenIds: retry up to 8 times when the built question collides
            const safeSeen = Array.isArray(seenIds) ? seenIds : [];
            let lastQuestion = null;
            for (let attempt = 0; attempt < 8; attempt++) {
                const chart = charts[Math.floor(Math.random() * charts.length)];
                const q = this.buildChartQuestion(chart, level);
                if (!q) continue;
                lastQuestion = q;
                if (!safeSeen.includes(q.id)) return q;
            }
            return lastQuestion;
        } catch (err) {
            console.warn('[DeterministicEngine] Chart query error:', err.message);
            return null;
        }
    }

    buildChartQuestion(chart, level) {
        const handMatrix = chart.hand_matrix || {};
        const hands = Object.keys(handMatrix || {});
        if (hands.length === 0) return null;

        const heroHand = hands[Math.floor(Math.random() * hands.length)];
        const handData = handMatrix[heroHand];

        // memory_charts_gold holds TWO node types, distinguishable by matrix
        // keys: open-shove charts store { push|shove, fold } and BB-defence
        // charts (villain_action 'sb_push') store { call, fold }. The old code
        // only read push/shove, so every hand in a call-node chart fell through
        // to `|| 0` and graded as a 100% fold — including AA. It then rendered
        // the node as "Push or Fold?", which is not even the decision the
        // chart answers. 2026-03 cache rows generated that way were purged by
        // migration 20260806*; do not reintroduce the bug.
        const isCallNode = (handData && handData.call !== undefined)
            || chart.villain_action === 'sb_push';
        const yesFreqRaw = isCallNode
            ? handData?.call
            : (handData?.push ?? handData?.shove);
        const yesFreq = Number(yesFreqRaw);
        // A hand whose frequency this code cannot READ is not a fold — it is
        // an unusable row. Refusing beats fabricating an answer.
        if (!Number.isFinite(yesFreq)) return null;

        const yesId = isCallNode ? 'call' : 'push';
        const yesText = isCallNode ? 'Call All-In' : 'Push All-In';
        const correctAction = yesFreq > 0.5 ? yesId : 'fold';

        const VILLAIN_ACTION_TEXT = {
            fold_to_hero: 'Folded to you',
            sb_push: 'SB shoves all-in',
        };
        const villainActionText = VILLAIN_ACTION_TEXT[chart.villain_action]
            || chart.villain_action || 'Folded to you';

        const gtoFrequencies = {
            [yesId]: Math.round(yesFreq * 100),
            fold: Math.round((1 - yesFreq) * 100),
        };

        return {
            id: `chart_${chart.id || chart.chart_id}_${heroHand}`,
            type: 'CHART',
            source: 'DETERMINISTIC_SOLVER',
            scenario: {
                stackDepth: chart.stack_depth,
                heroPosition: chart.hero_position || chart.position || 'BTN',
                heroStack: chart.stack_depth || 15,
                villainPosition: isCallNode ? 'SB' : 'BB',
                villainStack: chart.stack_depth || 15,
                pot: 1.5,
                board: '',
                action: villainActionText,
                heroHand,
                isMixedStrategy: yesFreq > 0.1 && yesFreq < 0.9,
            },
            heroCards: parseHandToCards(heroHand),
            boardCards: [],  // Push/fold games are preflop — no board
            question: `${chart.hero_position || 'BTN'} with ${heroHand} at ${chart.stack_depth}BB. ${villainActionText}. ${isCallNode ? 'Call or Fold?' : 'Push or Fold?'}`,
            options: [
                { id: yesId, text: yesText, frequency: gtoFrequencies[yesId] },
                { id: 'fold', text: 'Fold', frequency: gtoFrequencies.fold },
            ],
            correctAnswer: correctAction,
            correctAnswerText: correctAction === 'fold' ? 'Fold' : yesText,
            frequencies: { [yesId]: yesFreq, fold: 1 - yesFreq },
            gtoFrequencies,
            // Charts have no real EV data — zero out so the client falls back
            // to simulated EV loss instead of treating frequency as EV.
            evData: {
                heroHandEV: 0,
                optimalEV: 0,
                handEVs: null,
                heroHand,
            },
            explanation: this.buildChartExplanation(heroHand, chart, yesFreq, correctAction, isCallNode),
            difficulty: level,
            heroHand,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONTEXT-AWARE ACTION INTELLIGENCE — GTO Wizard Style
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Detect the decision node type from solver actions.
     * This determines what actions are valid in context.
     *
     * Node types:
     * - 'hero_bets_or_checks': Hero acts first (OOP) or IP after check.
     *    Valid: Check, Bet sizes. NOT valid: Call, Fold (no bet to face).
     * - 'hero_faces_bet': Hero is facing a bet/raise.
     *    Valid: Fold, Call, Raise sizes. NOT valid: Check, Bet.
     * - 'preflop_open': Hero has option to open-raise or fold.
     *    Valid: Fold, Raise sizes, Limp/Call.
     * - 'preflop_facing_raise': Hero faces a raise preflop.
     *    Valid: Fold, Call, 3-bet/raise sizes.
     */
    detectNodeType(solverActions, street) {
        const actionSet = new Set(solverActions.map(a => a.toLowerCase()));

        // If solver has both Check and Bet actions → hero acts first
        const hasCheck = actionSet.has('c') || actionSet.has('x');
        const hasBet = [...actionSet].some(a => a.startsWith('b') && a !== 'b'); // b + number = bet size
        const hasGenericBet = actionSet.has('b'); // Generic 'b' might be bet or might be call in some encodings
        const hasFold = actionSet.has('f');
        const hasCall = actionSet.has('call');
        const hasRaise = [...actionSet].some(a => a.startsWith('r'));
        const hasAllin = actionSet.has('allin');

        if (street === 'preflop') {
            // ═══ Phase 30: Better preflop node detection ═══
            // 'c' in preflop = call (except BB option check where 'x'/'check' is used)
            const hasCallPreflop = actionSet.has('c') || actionSet.has('call');

            // BB option check: solver gives Check + Raise (no fold) = BB facing limp/call
            // This is a special case: BB can check their option or raise
            if (hasCheck && hasRaise && !hasFold && !hasCallPreflop) {
                return 'preflop_bb_option'; // BB can check or raise
            }

            if (hasFold && hasCallPreflop && hasRaise) return 'preflop_facing_raise'; // F/C/R = facing raise
            if (hasFold && hasRaise && !hasCallPreflop) return 'preflop_open';         // F/R only = RFI
            if (hasFold && hasCallPreflop && !hasRaise) return 'preflop_facing_raise'; // F/C only = facing raise, no 3bet option
            // F/C/Allin = facing a jam
            if (hasFold && hasCallPreflop && hasAllin) return 'preflop_facing_raise';
            return 'preflop_open';
        }

        // ═══ POSTFLOP NODE DETECTION ═══
        // A fold option means hero is facing a bet — check this FIRST, since
        // 'c' means call (not check) whenever fold is present.
        if (hasFold && (hasCall || hasRaise || hasAllin)) return 'hero_faces_bet';
        if (hasFold && hasCheck && (hasBet || hasGenericBet)) return 'hero_faces_bet';

        // Check + Bet options → hero can bet or check (acting first or IP after villain checks)
        if (hasCheck && (hasBet || hasGenericBet)) return 'hero_bets_or_checks';
        if (hasCheck && !hasBet && !hasFold) return 'hero_bets_or_checks'; // Pure check node
        if (actionSet.has('x') && (hasBet || hasGenericBet)) return 'hero_bets_or_checks';

        if (hasFold && (hasBet || hasGenericBet)) return 'hero_faces_bet'; // Some solvers use 'b' for raise

        // ═══ Phase 30: Handle edge case where 'c' means call in postflop context ═══
        // If we see 'c' + fold + raise sizes, 'c' is definitely call (not check)
        if (hasFold && hasCheck && hasRaise) {
            // Ambiguous: 'c' could be call in this context since fold is present
            return 'hero_faces_bet';
        }

        // Fallback: infer from presence of check vs fold
        if (hasCheck || actionSet.has('x')) return 'hero_bets_or_checks';
        if (hasFold) return 'hero_faces_bet';

        return 'hero_bets_or_checks'; // Default assumption
    }

    /**
     * Get contextually valid filler actions based on the decision node type.
     * Only called when solver provides < 2 actions (very rare).
     *
     * GTO Wizard NEVER shows Call/Fold when hero acts first after a check.
     * GTO Wizard NEVER shows Check/Bet when hero faces a bet.
     */
    getContextualFillers(nodeType, existingIds, potSize) {
        const fillers = [];

        switch (nodeType) {
            case 'hero_bets_or_checks':
                // Hero acts first: valid actions are Check and Bet sizes
                if (!existingIds.has('c') && !existingIds.has('x')) {
                    fillers.push({ id: 'c', text: 'Check' });
                }
                if (![...existingIds].some(id => id.startsWith('b'))) {
                    fillers.push({ id: 'b33', text: 'Bet 33%' });
                    fillers.push({ id: 'b66', text: 'Bet 67%' });
                    fillers.push({ id: 'b100', text: 'Bet Pot' });
                }
                break;

            case 'hero_faces_bet':
                // Hero faces a bet: valid actions are Fold, Call, Raise sizes
                if (!existingIds.has('f')) {
                    fillers.push({ id: 'f', text: 'Fold' });
                }
                if (!existingIds.has('call')) {
                    fillers.push({ id: 'call', text: 'Call' });
                }
                if (![...existingIds].some(id => id.startsWith('r'))) {
                    fillers.push({ id: 'r', text: 'Raise' });
                }
                break;

            case 'preflop_open':
                if (!existingIds.has('f')) fillers.push({ id: 'f', text: 'Fold' });
                if (![...existingIds].some(id => id.startsWith('r'))) {
                    fillers.push({ id: 'r', text: 'Raise 2.5x' });
                }
                break;

            case 'preflop_facing_raise':
                if (!existingIds.has('f')) fillers.push({ id: 'f', text: 'Fold' });
                if (!existingIds.has('call')) fillers.push({ id: 'call', text: 'Call' });
                if (![...existingIds].some(id => id.startsWith('r'))) {
                    fillers.push({ id: 'r', text: '3-Bet' });
                }
                break;

            case 'preflop_bb_option':
                // BB option: check or raise (no fold needed — already invested)
                if (!existingIds.has('c') && !existingIds.has('x')) {
                    fillers.push({ id: 'x', text: 'Check' });
                }
                if (![...existingIds].some(id => id.startsWith('r'))) {
                    fillers.push({ id: 'r', text: 'Raise' });
                }
                break;

            default:
                // Minimal safe fillers
                if (!existingIds.has('c') && !existingIds.has('x')) {
                    fillers.push({ id: 'c', text: 'Check' });
                }
                if (!existingIds.has('f')) {
                    fillers.push({ id: 'f', text: 'Fold' });
                }
                break;
        }

        return fillers;
    }

    /**
     * Build a contextual action description based on solver data.
     * Phase 29: Richer descriptions with bet sizing context and action line awareness.
     */
    /**
     * Postflop acting order: the player closest to the button acts LAST.
     * SB acts first, BTN acts last. Hero is "in position" when hero acts after
     * villain, which is the only situation in which villain can already have
     * checked when hero is asked to decide.
     *
     * The order itself lives in src/engines/positionOrder.js so that every
     * consumer — this engine and the postflop scenario generator alike — reads
     * the same table. Unknown seats return false, keeping the old wording.
     */
    heroActsFirstPostflop(heroPosition, villainPosition) {
        return actsFirstPostflop(heroPosition, villainPosition);
    }

    buildActionDescription(solverActions, street, heroPosition, villainPosition) {
        const nodeType = this.detectNodeType(solverActions, street);

        if (street === 'preflop') {
            if (nodeType === 'preflop_open') return 'Folded to you';
            if (nodeType === 'preflop_facing_raise') return `${villainPosition} opens`;
            if (nodeType === 'preflop_bb_option') return `${villainPosition} limps — BB option`;
            return '';
        }

        // For postflop: extract what villain did from the action context
        switch (nodeType) {
            case 'hero_bets_or_checks':
                // This node means "hero may bet or check" -- which covers TWO
                // different spots: hero out of position acting FIRST, and hero
                // in position after villain checked. Reporting both as
                // "villain checks to hero" produced the impossible line
                // "BB vs BTN, villain checks" on the flop: the BTN acts LAST,
                // so a BTN villain cannot have checked before the BB decides.
                return this.heroActsFirstPostflop(heroPosition, villainPosition)
                    ? 'First to act'
                    : `${villainPosition} checks to ${heroPosition}`;
            case 'hero_faces_bet': {
                // Infer villain's bet type from what the solver offers as responses
                const raiseActions = solverActions.filter(a => a.toLowerCase().startsWith('r'));
                const hasAllin = solverActions.some(a => a.toLowerCase() === 'allin');
                const hasFold = solverActions.some(a => a.toLowerCase() === 'f');

                // If only fold/call (no raise), villain likely made a large bet
                if (raiseActions.length === 0 && hasAllin) {
                    return `${villainPosition} bets big into ${heroPosition}`;
                }
                if (raiseActions.length === 0 && !hasAllin) {
                    return `${villainPosition} jams into ${heroPosition}`;
                }
                return `${villainPosition} bets into ${heroPosition}`;
            }
            default:
                return this.heroActsFirstPostflop(heroPosition, villainPosition)
                    ? 'First to act'
                    : `${villainPosition} checks to ${heroPosition}`;
        }
    }

    /**
     * Build a rich, contextual question text — GTO Wizard style.
     * Full spot description: game format, stack depth, positions, preflop action,
     * board texture, street action, hand strength.
     */
    buildQuestionText(heroHand, board, street, heroPosition, villainPosition, solverActions, pot, scenarioHash, stackDepth) {
        const nodeType = this.detectNodeType(solverActions, street);
        const boardStr = board.length > 0 ? board.join(' ') : '';
        const context = extractScenarioContext(scenarioHash, street, heroPosition, villainPosition);
        const stackStr = stackDepth ? `${stackDepth}bb` : '';
        const formatStr = context.gameFormat ? `${context.gameFormat} ` : '';

        if (street === 'preflop') {
            // Phase 52: GTO Wizard-style preflop with pot type context
            const stackPart = stackStr ? ` ${stackStr}` : '';
            const prefix = formatStr ? `${formatStr}${stackPart} • ` : (stackPart ? `${stackPart} • ` : '');
            const potType = context.potType || '';

            if (nodeType === 'preflop_open') {
                return `${prefix}${heroPosition} — Folded to you. You hold ${heroHand}. Your action?`;
            } else if (nodeType === 'preflop_facing_raise') {
                // Differentiate facing open vs facing 3-bet vs facing 4-bet
                if (potType === '4-Bet' || potType === '4bet') {
                    return `${prefix}${heroPosition} — Facing a 4-bet from ${villainPosition}. You hold ${heroHand}. Your action?`;
                } else if (potType === '3-Bet' || potType === '3bet') {
                    return `${prefix}${heroPosition} — ${villainPosition} 3-bets. You hold ${heroHand}. Your action?`;
                }
                return `${prefix}${heroPosition} — ${villainPosition} opens. You hold ${heroHand}. Your action?`;
            } else if (nodeType === 'preflop_bb_option') {
                return `${prefix}BB — ${villainPosition} limps. You hold ${heroHand}. Check or raise?`;
            }
            return `${prefix}${heroPosition} — You hold ${heroHand}. Your action?`;
        }

        const handStrength = this.categorizeHand(heroHand, board);
        // Phase 30: Include pot type in preflop context when it's not a standard SRP
        const potTypeLabel = (context.potType && context.potType !== 'SRP') ? ` (${context.potType})` : '';
        const preflopLine = context.preflopAction ? `${context.preflopAction}${potTypeLabel}. ` : '';
        const streetLabel = street.charAt(0).toUpperCase() + street.slice(1);

        // ═══ Phase 29: Rich board texture description ═══
        const textureDesc = this.describeBoardTexture(board, street);
        const texturePart = textureDesc ? ` (${textureDesc})` : '';

        // ═══ Phase 29: Runout card with significance ═══
        let runoutPart = '';
        if (street === 'turn' && board.length >= 4) {
            const significance = this.describeRunoutSignificance(board, street);
            runoutPart = significance
                ? ` → ${board[3]} (${significance})`
                : ` → ${board[3]}`;
        } else if (street === 'river' && board.length >= 5) {
            const significance = this.describeRunoutSignificance(board, street);
            runoutPart = significance
                ? ` → ${board[4]} (${significance})`
                : ` → ${board[4]}`;
        }

        // SPR context — shows when stack-to-pot ratio is decision-critical
        let sprPart = '';
        if (stackDepth && pot) {
            const effectiveStack = stackDepth - (pot / 2);
            const spr = effectiveStack / pot;
            if (spr < 0.5) sprPart = ' [Committed — very short SPR]';
            else if (spr < 1) sprPart = ' [Short SPR]';
            else if (spr < 3 && street === 'river') sprPart = ' [Medium SPR]';
        }

        // ═══ Phase 29: Villain bet sizing context ═══
        // When facing a bet, extract what size villain might have used from solver actions
        let villainAction = '';
        if (nodeType === 'hero_faces_bet') {
            // Phase 52: Infer villain bet size from scenario hash and solver actions
            const betSizeFromHash = this._inferVillainBetSize(scenarioHash, solverActions, pot);
            villainAction = betSizeFromHash
                ? `${villainPosition} bets ${betSizeFromHash}`
                : `${villainPosition} bets`;
        } else {
            // Same conflated node as buildActionDescription: 'hero_bets_or_checks'
            // covers hero acting FIRST out of position as well as hero acting
            // after a check in position. Only the second one involves a villain
            // check. This is the sentence the player actually reads, so the
            // earlier fix to buildActionDescription alone left the impossible
            // "BTN checks to you" on screen in BB vs BTN.
            villainAction = this.heroActsFirstPostflop(heroPosition, villainPosition)
                ? 'you are first to act'
                : `${villainPosition} checks to you`;
        }

        // Phase 52: Pot size in BB for context
        let potPart = '';
        if (pot && pot > 0) {
            const potBB = typeof pot === 'number' ? pot.toFixed(1).replace(/\.0$/, '') : pot;
            potPart = ` Pot: ${potBB}bb.`;
        }

        // ═══ Phase 29: Action line context from scenario hash ═══
        const actionContext = context.actionLine ? ` [${context.actionLine} line]` : '';

        switch (nodeType) {
            case 'hero_bets_or_checks':
                return `${preflopLine}${streetLabel}: [${boardStr}]${texturePart}${runoutPart}.${actionContext} ${villainAction}.${potPart}${sprPart} You hold ${heroHand} (${handStrength}). Your action?`;
            case 'hero_faces_bet':
                return `${preflopLine}${streetLabel}: [${boardStr}]${texturePart}${runoutPart}.${actionContext} ${villainAction}.${potPart}${sprPart} You hold ${heroHand} (${handStrength}). Your action?`;
            default:
                return `${preflopLine}${streetLabel}: [${boardStr}]${texturePart}${runoutPart}.${actionContext}${potPart}${sprPart} You hold ${heroHand} (${handStrength}). Your action?`;
        }
    }

    /**
     * Phase 52: Infer villain bet size from scenario hash naming convention.
     * PIO scenario hashes often encode the bet sizes in the node path, e.g.:
     *   "BTN_vs_BB_SRP_Flop_b33_call_Turn_b66" → villain bet 66% pot on turn
     */
    _inferVillainBetSize(scenarioHash, solverActions, pot) {
        if (!scenarioHash) return null;
        const hash = scenarioHash.toLowerCase();

        // Look for the last bet size in the scenario hash path
        // Patterns: b33, b50, b66, b75, b100, b125, b150, b200, b300
        const betPatterns = hash.match(/[_.]b(\d+)/g);
        if (betPatterns && betPatterns.length > 0) {
            const lastBet = betPatterns[betPatterns.length - 1];
            const pctMatch = lastBet.match(/b(\d+)/);
            if (pctMatch) {
                const pct = parseInt(pctMatch[1]);
                // Convert percentage to BB if we have pot info
                if (pot && pot > 0) {
                    const betBB = ((pct / 100) * pot).toFixed(1).replace(/\.0$/, '');
                    return `${betBB}bb (${pct}% pot)`;
                }
                return `${pct}% pot`;
            }
        }

        // Check for all-in in hash
        if (hash.includes('allin') || hash.includes('jam') || hash.includes('shove')) {
            return 'all-in';
        }

        return null;
    }

    /**
     * Describe board texture in natural language — GTO Wizard style.
     * Returns rich descriptions like "Dry ace-high rainbow" or "Wet low monotone with straight draws"
     * instead of just tags. This reads like how a coach would describe the board.
     */
    describeBoardTexture(board, street) {
        if (!board || board.length < 3) return '';
        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);
        if (validBoard.length < 3) return '';

        const ranks = validBoard.map(c => c[0].toUpperCase());
        const suits = validBoard.map(c => c[1]?.toLowerCase());
        const rankVals = ranks.map(r => '23456789TJQKA'.indexOf(r));
        const RANK_NAMES = { 0: '2', 1: '3', 2: '4', 3: '5', 4: '6', 5: '7', 6: '8', 7: '9', 8: 'T', 9: 'J', 10: 'Q', 11: 'K', 12: 'A' };

        // ═══ SUIT ANALYSIS ═══
        const suitCounts = {};
        suits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const maxSuitCount = Math.max(...Object.values(suitCounts || {}));
        const isMonotone = maxSuitCount === validBoard.length && validBoard.length >= 3;
        const hasFlushDraw = maxSuitCount >= 2 && !isMonotone;
        const hasFlushComplete = maxSuitCount >= 3 && validBoard.length >= 4;
        const isRainbow = Object.values(suitCounts || {}).every(c => c === 1);

        // ═══ PAIRING ═══
        const rankCounts = {};
        ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
        const maxRankCount = Math.max(...Object.values(rankCounts || {}));
        const isPaired = maxRankCount === 2;
        const isTrips = maxRankCount >= 3;
        const pairedRank = isPaired ? Object.entries(rankCounts || {}).find(([r, c]) => c >= 2)?.[0] : null;

        // ═══ CONNECTIVITY ═══
        const sorted = [...new Set(rankVals)].sort((a, b) => a - b);
        let maxConnect = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
            const gap = sorted[i + 1] - sorted[i];
            if (gap <= 2) maxConnect++;
        }
        const isConnected = maxConnect >= 2; // 3+ cards within range
        const hasGutshot = maxConnect >= 1;
        const isStraightPossible = sorted.length >= 3 && (sorted[sorted.length - 1] - sorted[0]) <= 4;

        // ═══ HIGH CARD TEXTURE ═══
        const highCards = rankVals.filter(v => v >= 9).length; // T+ are high
        const highestRank = Math.max(...rankVals);
        const lowestRank = Math.min(...rankVals);
        const isAceHigh = highestRank === 12;
        const isKingHigh = highestRank === 11 && !isAceHigh;
        const isLow = highestRank <= 7; // 9-high or lower
        const isBroadwayHeavy = highCards >= 3;
        const isMidrange = !isLow && highCards <= 1;

        // ═══ WETNESS SCORE ═══
        let wetness = 0;
        if (isConnected) wetness += 2;
        else if (hasGutshot) wetness += 1;
        if (isMonotone) wetness += 3;
        else if (hasFlushDraw) wetness += 1;
        if (!isPaired && !isTrips) wetness += 0.5; // unpaired = more draws
        const isWet = wetness >= 2.5;
        const isDry = wetness <= 1;

        // ═══ BUILD NATURAL LANGUAGE ═══
        const parts = [];

        // Wetness descriptor
        if (isWet) parts.push('Wet');
        else if (isDry) parts.push('Dry');
        else parts.push('Semi-wet');

        // Height descriptor
        if (isAceHigh) parts.push('ace-high');
        else if (isKingHigh) parts.push('king-high');
        else if (isBroadwayHeavy) parts.push('broadway');
        else if (isLow) parts.push('low');
        else if (isMidrange) parts.push('mid-range');

        // Suit descriptor
        if (isMonotone) parts.push('monotone');
        else if (hasFlushComplete) parts.push('flush-completed');
        else if (isRainbow) parts.push('rainbow');
        else parts.push('two-tone');

        // Special descriptors
        const extras = [];
        if (isPaired) extras.push('paired board');
        if (isTrips) extras.push('trips on board');
        if (isConnected) extras.push('coordinated');
        if (isStraightPossible && !isConnected) extras.push('straight possible');

        let desc = parts.join(' ');
        if (extras.length > 0) desc += ` — ${extras.join(', ')}`;

        return desc;
    }

    /**
     * Phase 29: Describe significance of the turn/river card.
     * GTO Wizard contextualizes runout cards — "flush-completing river"
     * or "board pairs on the turn" changes decision-making dramatically.
     */
    describeRunoutSignificance(board, street) {
        if (!board || board.length < 4) return '';
        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);

        if (street === 'turn' && validBoard.length >= 4) {
            return this._describeCardImpact(validBoard.slice(0, 3), validBoard[3]);
        }
        if (street === 'river' && validBoard.length >= 5) {
            return this._describeCardImpact(validBoard.slice(0, 4), validBoard[4]);
        }
        return '';
    }

    /**
     * Phase 29: Analyze what a new card changes about the board.
     */
    _describeCardImpact(existingBoard, newCard) {
        if (!newCard || newCard.length < 2) return '';

        const newRank = newCard[0].toUpperCase();
        const newSuit = newCard[1]?.toLowerCase();
        const newVal = '23456789TJQKA'.indexOf(newRank);

        const existRanks = existingBoard.map(c => c[0].toUpperCase());
        const existSuits = existingBoard.map(c => c[1]?.toLowerCase());
        const existVals = existRanks.map(r => '23456789TJQKA'.indexOf(r));

        const impacts = [];

        // Check if new card pairs the board
        if (existRanks.includes(newRank)) {
            const RANK_DISPLAY = { 'T': 'ten', 'J': 'jack', 'Q': 'queen', 'K': 'king', 'A': 'ace' };
            const display = RANK_DISPLAY[newRank] || newRank;
            impacts.push(`pairs the ${display}`);
        }

        // Check if new card completes a flush
        const suitCounts = {};
        existSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const sameSuitOnBoard = suitCounts[newSuit] || 0;
        if (sameSuitOnBoard >= 2) {
            impacts.push('completes a possible flush');
        } else if (sameSuitOnBoard === 1) {
            impacts.push('adds a second flush card');
        }

        // Check if new card completes a straight
        const allVals = new Set([...existVals, newVal]);
        for (let start = 0; start <= 8; start++) {
            const window = [start, start + 1, start + 2, start + 3, start + 4];
            if (window.every(v => allVals.has(v))) {
                // Check that the new card is part of this straight
                if (window.includes(newVal)) {
                    impacts.push('completes a possible straight');
                    break;
                }
            }
        }
        // Wheel check
        const wheelVals = [12, 0, 1, 2, 3];
        if (wheelVals.every(v => allVals.has(v)) && wheelVals.includes(newVal)) {
            if (!impacts.includes('completes a possible straight')) {
                impacts.push('completes a wheel straight');
            }
        }

        // Check if it's an overcard
        const highestExist = Math.max(...existVals);
        if (newVal > highestExist) {
            const RANK_DISPLAY = { 'T': 'ten', 'J': 'jack', 'Q': 'queen', 'K': 'king', 'A': 'ace' };
            const display = RANK_DISPLAY[newRank] || newRank;
            impacts.push(`overcard (${display})`);
        }

        // Phase 57: Enhanced brick/scare card detection
        if (impacts.length === 0) {
            if (newVal <= 3) impacts.push('brick — deuce/trey changes nothing');
            else if (newVal <= 5) impacts.push('low brick — doesn\'t change the board dynamics');
            else if (newVal >= 9 && newVal <= 11) impacts.push('broadway card — could have connected with many hands');
            else impacts.push('relatively blank runout');
        }

        // Phase 57: Add strategic context based on combination of impacts
        if (impacts.length >= 2 && impacts.some(i => i.includes('flush')) && impacts.some(i => i.includes('straight'))) {
            impacts.push('double-draw completion — very dynamic card');
        }

        return impacts.join(', ');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 22: GTO WIZARD OPTION PARITY — SORTING & LABELING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Sort actions in GTO Wizard order:
     *
     * Check/Bet node:  Check → Bet sizes ascending (16%, 33%, 45%, 67%, 100%...) → All-In
     * Facing-bet node: Fold → Call → Raise sizes ascending → All-In
     * Preflop open:    Fold → Raise sizes ascending → All-In
     * Preflop facing:  Fold → Call → 3-Bet sizes ascending → All-In
     *
     * GTO Wizard always puts the passive option first, then aggressive options ascending.
     */
    sortActionsGTOWStyle(actions, nodeType) {
        const getActionSortKey = (action) => {
            const a = action.toLowerCase();
            if (a === 'c' || a === 'x') return 0;       // Check first
            if (a === 'f') return 0;                      // Fold first (facing bet)
            if (a === 'call') return 1;                   // Call second
            const betMatch = a.match(/^b(\d+)$/);
            if (betMatch) return 100 + parseInt(betMatch[1]);  // Bets ascending
            const raiseMatch = a.match(/^r(\d+)$/);
            if (raiseMatch) return 200 + parseInt(raiseMatch[1]); // Raises ascending
            if (a === 'b') return 150;
            if (a === 'r') return 250;
            if (a === 'allin') return 9999;               // All-In last
            return 500;
        };
        return [...actions].sort((a, b) => getActionSortKey(a) - getActionSortKey(b));
    }

    /**
     * GTO Wizard-style action labels — clean percentage, no BB amounts.
     *   "Check", "Bet 16%", "Bet 45%", "Bet 67%", "Bet Pot", "Overbet 150%"
     *   "Fold", "Call", "Raise 50%", "Raise Pot", "All-In"
     */
    getActionLabelGTOW(actionCode, potSize = 6) {
        const a = actionCode.toLowerCase();
        if (a === 'c' || a === 'x') return 'Check';
        if (a === 'f') return 'Fold';
        if (a === 'call') return 'Call';
        if (a === 'allin') return 'All-In';

        const betMatch = a.match(/^b(\d+)$/);
        if (betMatch) {
            const pct = parseInt(betMatch[1]);
            if (pct === 100) return 'Bet Pot';
            if (pct > 100) return `Overbet ${pct}%`;
            return `Bet ${pct}%`;
        }

        const raiseMatch = a.match(/^r(\d+)$/);
        if (raiseMatch) {
            const pct = parseInt(raiseMatch[1]);
            if (pct === 100) return 'Raise Pot';
            return `Raise ${pct}%`;
        }

        if (a === 'b') return 'Bet';
        if (a === 'r') return 'Raise';
        return actionCode.toUpperCase();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Get human-readable action label (delegates to GTOW-style)
     */
    getActionLabel(actionCode, potSize = 6) {
        return this.getActionLabelGTOW(actionCode, potSize);
    }

    /**
     * Build deterministic explanation from solver data — GTO Wizard style.
     * Phase 25: Rich strategic reasoning with sizing logic, position context,
     * board texture impact, and conceptual poker theory.
     */
    buildExplanation(heroHand, board, street, optimalAction, handActions, ev, validActions, ctx = {}) {
        if (!heroHand || !optimalAction) return '';
        const label = this.getActionLabelGTOW(optimalAction);
        const freq = handActions[optimalAction] || 0;
        const freqPct = (freq * 100).toFixed(0);
        const handStrength = this.categorizeHand(heroHand, board);
        const { nodeType, heroPosition, villainPosition, estimatedPot, stackDepth } = ctx;

        // ═══ PREFLOP-SPECIFIC EXPLANATIONS ═══
        if (street === 'preflop') {
            const baseExpl = this._buildPreflopExplanation(heroHand, optimalAction, handActions, freq, freqPct, label, validActions, nodeType, heroPosition, villainPosition, stackDepth, ctx.potType);
            // Phase 91: Append hand equity tier context
            const handTier = this._getPreflopHandTier(heroHand);
            const tierNote = handTier.equityVsRandom ? ` [~${handTier.equityVsRandom}% equity vs random — ${handTier.description}]` : '';
            return baseExpl + tierNote;
        }

        // ═══ STRATEGIC REASONING ENGINE ═══
        const a = optimalAction.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');

        // Extract bet sizing percentage
        const sizeMatch = a.match(/^[br](\d+)$/);
        const sizePct = sizeMatch ? parseInt(sizeMatch[1]) : (a === 'allin' ? 999 : 0);

        // Board texture for reasoning
        const texture = this._analyzeTexture(board);

        // ═══ SIZING REASONING — Why this specific size? ═══
        const sizingReason = this._getSizingReason(sizePct, handStrength, texture, street, isBet, isRaise);

        // ═══ STRATEGIC CONCEPT — What poker concept drives this? ═══
        const concept = this._getStrategicConcept(optimalAction, handStrength, texture, street, freq, validActions, handActions, nodeType, heroPosition, villainPosition);

        // ═══ Phase 60: BLOCKER AWARENESS ═══
        const blockerNote = this._getBlockerContext(heroHand, board, handStrength, optimalAction, street, texture);

        // ═══ Phase 61: RANGE ADVANTAGE CONTEXT ═══
        const rangeNote = this._getRangeAdvantageNote(board, street, optimalAction, texture, ctx.nodeType, ctx.heroPosition, ctx.villainPosition, handStrength);

        // ═══ Phase 62: MULTI-STREET PLANNING ═══
        const multiStreetNote = this._getMultiStreetPlan(street, optimalAction, sizePct, handStrength, texture, ctx.estimatedPot, ctx.stackDepth);

        // ═══ Phase 64: POT ODDS & EQUITY MATH ═══
        const potOddsNote = this._getPotOddsMath(optimalAction, handStrength, street, validActions, ctx.estimatedPot, ctx.nodeType);

        // ═══ Phase 69: SPR AWARENESS ═══
        const sprNote = this._getSPRContext(optimalAction, handStrength, street, ctx.estimatedPot, ctx.stackDepth);

        // ═══ Phase 73: VILLAIN TENDENCY CONTEXT ═══
        const villainNote = this._getVillainTendencyNote(optimalAction, handStrength, street, texture, ctx.nodeType, ctx.heroPosition, ctx.villainPosition, freq);

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
// @@PUB_REGION_16@@
