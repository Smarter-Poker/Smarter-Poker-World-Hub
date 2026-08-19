/**
 * brain/router.js — getDecision() master router
 *
 * This is the top-level entry point for all poker decisions. It:
 *   1. Extracts game state from engine format
 *   2. Applies anti-exploit module signals (Modules 5, 9, 11, 14, 15, 18-32)
 *   3. Routes PLO variants to plo-core.js makePLOFallbackDecision()
 *   4. Routes Hold'em to GTO solver → personality overlay → heuristic fallback
 *   5. Applies universal guardrails, fatigue, rivalry, tilt degradation
 *   6. Returns engine-format action + timing delay
 *
 * Dependencies: ALL brain modules (core, anti-exploit, session-analytics, holdem-brain, plo-core, plo8-brain)
 */

const { getHash, getPreflopStrength, getActionDelay, getPersonalityModule, getAdvancedModule,
        getGTOModule, getSupabase, cardsToStrings, formatHandString, mapPosition,
        chatMessages, RANK_ORDER } = require('./core');

const { selectCounterStrategy, _loadThreatIntel, isBlacklisted, getRangeRotationGear,
        isImageExposed, isMechanicalIsolator, isMinRaiser, isSqueezeOverkill,
        detectBombPotOrStraddle, detectAngleShoot, getProbeFarmScore, isColdCallTrap,
        isRITRefuser, getChipLeakBoosts, detectLimpTrap, detectSPRTrap,
        recordStreetAction, getStreetMemory, analyzeStreetNarrative,
        chaosSuppressionMap, showdownExposureMap, tiltMap,
        timeAbuseSuspicion, tableTimebankBlacklist, frequencyObfuscatorMap } = require('./anti-exploit');

// isSoftPlayAllowed and recordSoftPlay are used further down this file and were
// never destructured, so the softplay branch threw ReferenceError. Both are
// exported from session-analytics, which this line already requires.
const { recordPerformanceAction, isSoftPlayAllowed, recordSoftPlay } = require('./session-analytics');

const { makeFallbackDecision, evaluatePostflopHand, makeFlopHeuristicDecision,
        makeTurnRiverHeuristicDecision, handleDonkBet, getDrawEquity,
        getOptimalBetSize, applyTiltDegradation, setLiveReadFn } = require('./holdem-brain');

const { makePLOFallbackDecision } = require('./plo-core');

const { makePLO5Decision } = require('./plo5-brain');

const { makePLO6Decision } = require('./plo6-brain');

const { evaluatePLO8Low } = require('./plo8-brain');

const { applyTournamentAdjustments, detectTournamentStage } = require('./tournament-brain');

// Live observer is not yet extracted — stub with safe fallback
let _getLiveReadFn = null;
function setRouterLiveReadFn(fn) {
    _getLiveReadFn = fn;
    // Also wire into holdem-brain
    setLiveReadFn(fn);
}
function getLiveRead(horseId, tableId, opponentId) {
    if (_getLiveReadFn) return _getLiveReadFn(horseId, tableId, opponentId);
    return null;
}

// Module-scope personality reference
let _personalityModule = null;
try { _personalityModule = getPersonalityModule(); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

function shouldAutoSeat(tableInfo, availableHorses) {
    if (!tableInfo || !availableHorses || availableHorses.length === 0) {
        return { shouldSeat: false, horseId: null };
    }

    const currentPlayers = tableInfo.seats?.filter(s => s.player)?.length || 0;
    const minNeeded = tableInfo.minPlayers || 2;

    // Seat horses if table needs players (below min, or just 1 human waiting)
    if (currentPlayers < minNeeded) {
        // Pick a random available horse
        const idx = Math.floor(Math.random() * availableHorses.length);
        return { shouldSeat: true, horseId: availableHorses[idx] };
    }

    return { shouldSeat: false, horseId: null };
}

// MASTER DECISION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a poker decision for a horse player.
 * 
 * Pipeline:
 * 1. Extract game state from engine format
 * 2. Try GTO solver (memory_charts_gold / solved_spots_gold)
 * 3. Apply personality + tilt + table image overlays
 * 4. Fall back to heuristic if solver unavailable
 * 5. Validate against legal actions
 * 6. Return engine-format action + timing delay
 * 
 * @param {string} profileId - Horse profile UUID
 * @param {Object} engineState - From GameStateMachine.getState(profileId)
 * @param {Array} legalActions - From BettingRound.getLegalActions()
 * @param {Object} tableConfig - Table configuration (blinds, etc.)
 * @returns {Promise<{ action: Object, delayMs: number }>}
 */
async function getDecision(profileId, engineState, legalActions, tableConfig = {}) {
    if (!tableConfig || typeof tableConfig !== 'object') tableConfig = {}; // Bug #77: null tableConfig crashes on .bigBlind access
    if (!engineState || typeof engineState !== 'object') return { action: { type: 'fold' }, delayMs: 500 }; // Bug #57: guard null engineState
    if (!Array.isArray(legalActions) || legalActions.length === 0) {
        return { action: { type: 'fold' }, delayMs: 500 };
    }

    // --- 1. EXTRACT GAME STATE ---
    const heroPlayer = engineState.players?.find(p => String(p.id) === String(profileId));
    if (!heroPlayer || !heroPlayer.holeCards || heroPlayer.holeCards.length < 2) {
        // No cards — just check or fold
        const canCheck = legalActions.some(a => a.type === 'check');
        return { action: { type: canCheck ? 'check' : 'fold' }, delayMs: 500 };
    }

    const holeCardStrings = cardsToStrings(heroPlayer.holeCards);
    const boardStrings = cardsToStrings(engineState.communityCards || []);
    const handStr = formatHandString(holeCardStrings[0], holeCardStrings[1]);
    const position = mapPosition(heroPlayer.position || 'mp');
    const street = engineState.phase || 'preflop';

    const bb = tableConfig.bigBlind || 2;
    const stackBB = Math.round(heroPlayer.stack / bb);
    const potSize = engineState.potTotal || 0;
    const toCall = Math.max(0, (engineState.currentBet || 0) - (heroPlayer.invested || 0));
    const numPlayers = engineState.players?.filter(p => !p.folded).length || 2;

    // ─── MODULE 8: COUNTER-EXPLOIT PROFILER ───
    // Determine strategic posture for this hand based on all threat signals.
    const tableId = engineState.tableId || 'unknown';
    const opponents = engineState.players?.filter(p => String(p.id) !== String(profileId) && !p.folded) || [];
    const primaryOppId = opponents.length > 0 ? String(opponents[0].id) : null;
    const counterStrategy = selectCounterStrategy(profileId, primaryOppId, tableId);

    // Increment hand counter for this horse (used by chaos suppression)
    const chaosState = chaosSuppressionMap.get(profileId) || { lastChaosHand: -99, handCounter: 0 };
    chaosState.handCounter++;
    chaosSuppressionMap.set(profileId, chaosState);

    // Track showdown exposure (Module 3) — increment hands seen
    if (!showdownExposureMap.has(profileId)) showdownExposureMap.set(profileId, new Map());
    const horseExposure = showdownExposureMap.get(profileId);
    if (!horseExposure.has(tableId)) horseExposure.set(tableId, { showdowns: 0, handsPlayed: 0 });
    horseExposure.get(tableId).handsPlayed++;

    // ─── MODULE 5: STACK SANDWICH DETECTOR ───
    // Detect: 3+ players, horse is not the raiser, players on both sides = sandwich.
    let sandwichedFoldMod = 0;
    let sandwichedDrawThreshold = 0;
    if (numPlayers >= 3 && toCall > 0) {
        const heroPosition = heroPlayer.position || 'mp';
        const isRaiser = engineState.lastRaiser === profileId;
        // Count how many active opponents are behind (will act after us)
        const heroSeatIdx = engineState.players?.findIndex(p => String(p.id) === String(profileId)) ?? -1;
        const activePlayers = (engineState.players || []).filter(p => !p.folded && String(p.id) !== String(profileId));
        const behind = activePlayers.filter((p, idx) => {
            const theirIdx = engineState.players?.findIndex(pp => String(pp.id) === String(p.id)) ?? -1;
            return theirIdx > heroSeatIdx;
        }).length;
        const inFront = activePlayers.length - behind;

        // Sandwich = players on both sides AND we are not the aggressor
        // Bug #174: Wire heroPosition — OOP sandwich (UTG/EP/MP) is worse than IP (CO/BTN)
        const isOOPSandwich = ['UTG', 'UTG1', 'UTG2', 'EP', 'MP', 'LJ'].includes(heroPosition);
        if (behind >= 1 && inFront >= 1 && !isRaiser) {
            sandwichedFoldMod = isOOPSandwich ? 14 : 10;   // OOP sandwich = tighter (+14 vs +10)
            sandwichedDrawThreshold = isOOPSandwich ? 18 : 15; // OOP needs more outs to continue
            if (counterStrategy.mode === 'standard') counterStrategy.mode = 'sandwich_survival';
            console.debug(`[HorseBrain]  SANDWICH DETECTED: ${profileId.substring(0, 8)} — tightening ranges (+10 fold threshold)`);
        }
    }

    // Log counter-strategy mode if non-standard
    if (counterStrategy.mode !== 'standard') {
        console.debug(`[HorseBrain]   Counter-mode: ${counterStrategy.mode} vs ${primaryOppId?.substring(0, 8) || 'N/A'}`);
    }

    // ─── MODULE 9: THREAT INTEL LAZY-LOAD (Module 16: Threat Score Leaderboard) ───
    // On first encounter with this human, pull their cross-session threat record.
    // ═══ FIX: Previously fire-and-forget (.then) — counterStrategy was mutated AFTER
    // the decision was already made. Now we await with a 200ms timeout so intel is
    // available for the CURRENT decision, not just future ones. ═══
    if (primaryOppId) {
        try {
            const intelPromise = _loadThreatIntel(primaryOppId);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 200));
            const intel = await Promise.race([intelPromise, timeoutPromise]);
            if (intel && intel.totalScore >= 65 && counterStrategy.mode === 'standard') {
                counterStrategy.mode = intel.totalScore >= 80 ? 'anti_bot_stealth' : 'anti_bot';
                console.warn(`[HorseBrain]  MODULE 9 PRE-ARM: ${primaryOppId.substring(0, 8)} known threat=${intel.totalScore} → mode=${counterStrategy.mode}`);
            }
        } catch (err) { console.warn('[HorseBrain] Threat intel load failed:', err); }

        // Module 14: If opponent is actively blacklisted, spike horse tilt to escape table ASAP
        if (isBlacklisted(primaryOppId)) {
            console.warn(`[HorseBrain]  MODULE 14 BLACKLIST: ${primaryOppId.substring(0, 8)} is blacklisted! Spiking tilt to escape.`);
            if (!tiltMap.has(profileId)) tiltMap.set(profileId, {});
            const ts = tiltMap.get(profileId);
            ts.multiplier = 1.0;
            ts.reason = `Blacklisted opponent ${primaryOppId.substring(0, 8)} at table`;
        }
    }

    // ─── MODULE 15: TIMEBANK ABUSE CHECK ───
    // If a human has been stalling at this table (avg action > 22s), trigger delayed stand-up
    if (primaryOppId) {
        const tbData = timeAbuseSuspicion.get(primaryOppId);
        if (tbData && tbData.suspicionScore >= 70) {
            const tableBlacklistedUntil = tableTimebankBlacklist.get(tableId) || 0;
            if (Date.now() > tableBlacklistedUntil) {
                tableTimebankBlacklist.set(tableId, Date.now() + 60 * 60 * 1000); // 60 min table ban
                console.warn(`[HorseBrain] ⏱ MODULE 15 STALL: ${primaryOppId.substring(0, 8)} stall score=${tbData.suspicionScore} — blacklisting table ${tableId.substring(0, 8)} for 60min`);
                // Spike tilt to 1.0 so evaluateSessions triggers a stand-up
                if (!tiltMap.has(profileId)) tiltMap.set(profileId, {});
                tiltMap.get(profileId).multiplier = 1.0;
                tiltMap.get(profileId).reason = `Stall attacker at table`;
            }
        }
    }

    // ─── MODULE 11: PROACTIVE RANGE ROTATION ───
    // Get the current gear for this horse at this table.
    // Gear adjustments cascade into all fold/raise threshold calculations below.
    const rangeGear = getRangeRotationGear(profileId, tableId);
    // These mods are added to any existing opponentAdjustment later in the pipeline
    const gearFoldMod = rangeGear.foldMod;
    const gearRaiseMod = rangeGear.raiseMod;

    // ─── MODULE 20: TABLE IMAGE EXPOSURE MONITOR ───
    // If horse has been showing cards too much (>25% showdown rate), tighten up.
    const imageExposed = isImageExposed(profileId, tableId);
    if (imageExposed) {
        console.debug(`[HorseBrain]  MODULE 20 IMAGE EXPOSED: ${profileId.substring(0, 8)} — humans floating lighter, tightening thresholds.`);
    }

    // ─── MODULE 22: ISOLATION SIZING TELL ───
    // If primary opponent has mechanical iso sizing → widen 3-bet range vs them
    const isoTell = primaryOppId ? isMechanicalIsolator(primaryOppId) : { isMechanical: false };
    if (isoTell.isMechanical) {
        console.debug(`[HorseBrain]  MODULE 22 ISO TELL: ${primaryOppId?.substring(0, 8)} mechanical isolator (avg=${isoTell.avgSize.toFixed(1)}bb, σ=${isoTell.stdDev.toFixed(2)}) — widening 3-bet range.`);
    }

    // ─── PLO / VARIANT-AWARE ROUTING ───
    // PioSolver only has Holdem solved spots. For Omaha variants (PLO4, PLO5, PLO6, PLO8),
    // we route to a dedicated heuristic engine that understands 4-6 card hand strength
    // instead of blindly trying to use 2-card Holdem rankings on a 4-card hand.
    const variant = engineState.variant || tableConfig.variant || 'holdem';
    const isPLO = ['omaha4', 'omaha5', 'omaha6', 'omaha_hilo', 'plo', 'plo4', 'plo5', 'plo6', 'plo8'].includes(variant.toLowerCase());
    // Bug #194: 'plo8' is the standard abbreviation for PLO8-or-better (Hi-Lo).
    // Old check only matched hilo/hi_lo/hi-lo substrings — plo8 was silently treated as
    // non-Hi-Lo, skipping ALL lo8 evaluation (nut low overrides, scoop bonuses, low outs).
    const vLower = variant.toLowerCase();
    const isHiLo = vLower.includes('hilo') || vLower.includes('hi_lo') || vLower.includes('hi-lo') || vLower === 'plo8' || vLower === 'omaha8' || vLower.includes('8_or_better');

    // ─── MODULE 21: PLO LIMP-TRAP DETECTOR (preflop only) ───
    const numLimpers = engineState.numLimpers || 0;
    const ploSPR = stackBB / (potSize / bb || 1);
    const limpTrap = street === 'preflop' && isPLO
        ? detectLimpTrap(numLimpers, mapPosition(heroPlayer.position || 'mp'), ploSPR, false)
        : { isLimpTrap: false };
    if (limpTrap.isLimpTrap) {
        console.debug(`[HorseBrain]  MODULE 21 LIMP TRAP: ${numLimpers} limpers, SPR=${ploSPR.toFixed(1)} — reducing raise freq.`);
    }

    // ─── MODULE 25: MIN-RAISE HARASSMENT DETECTOR ───
    const minRaiseTell = primaryOppId ? isMinRaiser(primaryOppId) : { isMinRaiser: false, rate: 0 };
    if (minRaiseTell.isMinRaiser) {
        console.debug(`[HorseBrain]  MODULE 25 MIN-RAISE: ${primaryOppId?.substring(0, 8)} min-raises ${(minRaiseTell.rate * 100).toFixed(0)}% — 3-betting wider, not folding to min-raises.`);
    }

    // ─── MODULE 26: SQUEEZE OVERKILL DETECTOR ───
    const squeezeTell = primaryOppId ? isSqueezeOverkill(primaryOppId) : { isOverkill: false, avgMult: 0 };
    if (squeezeTell.isOverkill) {
        console.debug(`[HorseBrain]  MODULE 26 SQUEEZE: ${primaryOppId?.substring(0, 8)} over-squeezes (avg ${squeezeTell.avgMult.toFixed(1)}×pot) — folding wider vs 3rd-player squeeze.`);
    }

    // ─── MODULE 29: STRADDLE / BOMB-POT EQUITY ADJUSTER ───
    const hasStraddle = engineState.hasStraddle || false;
    const bombPotInfo = detectBombPotOrStraddle(potSize, bb, hasStraddle);
    if (bombPotInfo.equityThresholdBoost > 0) {
        console.debug(`[HorseBrain]  MODULE 29 ${bombPotInfo.label.toUpperCase()}: equity threshold +${bombPotInfo.equityThresholdBoost}% — tightening commit threshold.`);
    }

    // ─── MODULE 30: ANGLE-SHOOT TIMING DETECTOR ───
    const angleTell = primaryOppId ? detectAngleShoot(primaryOppId) : { isAngleShooting: false, extraEntropyMs: 0 };
    if (angleTell.isAngleShooting) {
        console.debug(`[HorseBrain]  MODULE 30 ANGLE-SHOOT: ${primaryOppId?.substring(0, 8)} pre-selecting actions — adding ${angleTell.extraEntropyMs}ms entropy to this decision.`);
    }

    // ─── PLO5 / PLO6 VARIANT-SPECIFIC ROUTING ───
    // PLO5 and PLO6 play FUNDAMENTALLY differently from PLO4.
    // Route to dedicated brain modules before the generic PLO fallback.
    const isPLO5 = vLower === 'plo5' || vLower === 'omaha5';
    const isPLO6 = vLower === 'plo6' || vLower === 'omaha6';

    if (isPLO5 && !isHiLo) {
        const plo5Decision = makePLO5Decision(profileId, {
            holeCards: holeCardStrings,
            board: boardStrings,
            street,
            position: mapPosition(heroPlayer.position || 'mp'),
            stackBB,
            potSize,
            toCall,
            bb,
            numPlayers,
            gameType: tableConfig.gameType || engineState.gameType || (engineState.tourneyState ? 'tournament' : 'cash'),
            tableId: tableId || 'unknown',
            primaryOppId: primaryOppId || null,
        }, legalActions);
        let plo5Action = { type: plo5Decision.type, amount: plo5Decision.amount || 0 };
        if (engineState.tourneyState || engineState.tournament) {
            plo5Action = applyTournamentAdjustments(plo5Action, {
                tourneyState: engineState.tourneyState || engineState.tournament,
                stackBB, street, potSize, toCall, bb, numPlayers,
                position: mapPosition(heroPlayer.position || 'mp'),
                _handStrength: plo5Decision._handStrength || 50,
            }, legalActions);
        }
        const validPLO5 = validateAndClamp(plo5Action.type, plo5Action.amount, legalActions);
        const delayPLO5 = getActionDelay(profileId, validPLO5.type, street === 'preflop') + angleTell.extraEntropyMs;
        recordPerformanceAction(profileId, street, validPLO5.type, validPLO5.type !== 'fold' && validPLO5.type !== 'check');
        return { action: validPLO5, delayMs: delayPLO5 };
    }

    if (isPLO6 && !isHiLo) {
        const plo6Decision = makePLO6Decision(profileId, {
            holeCards: holeCardStrings,
            board: boardStrings,
            street,
            position: mapPosition(heroPlayer.position || 'mp'),
            stackBB,
            potSize,
            toCall,
            bb,
            numPlayers,
            gameType: tableConfig.gameType || engineState.gameType || (engineState.tourneyState ? 'tournament' : 'cash'),
            tableId: tableId || 'unknown',
            primaryOppId: primaryOppId || null,
        }, legalActions);
        let plo6Action = { type: plo6Decision.type, amount: plo6Decision.amount || 0 };
        // Apply tournament adjustments if in a tournament
        if (engineState.tourneyState || engineState.tournament) {
            plo6Action = applyTournamentAdjustments(plo6Action, {
                tourneyState: engineState.tourneyState || engineState.tournament,
                stackBB, street, potSize, toCall, bb, numPlayers,
                position: mapPosition(heroPlayer.position || 'mp'),
                _handStrength: plo6Decision._handStrength || 50,
            }, legalActions);
        }
        const validPLO6 = validateAndClamp(plo6Action.type, plo6Action.amount, legalActions);
        const delayPLO6 = getActionDelay(profileId, validPLO6.type, street === 'preflop') + angleTell.extraEntropyMs;
        recordPerformanceAction(profileId, street, validPLO6.type, validPLO6.type !== 'fold' && validPLO6.type !== 'check');
        return { action: validPLO6, delayMs: delayPLO6 };
    }

    if (isPLO) {
        const ploDecision = makePLOFallbackDecision(profileId, {
            holeCards: holeCardStrings,
            board: boardStrings,
            street,
            position: mapPosition(heroPlayer.position || 'mp'),
            stackBB,
            potSize,
            toCall,
            bb,
            numPlayers,
            isHiLo,
            // Bug #116: Pass gameType so PLO tournament tightness adjustments actually fire
            // (was defaulting to 'cash' because gameType was never passed from getDecision)
            gameType: tableConfig.gameType || engineState.gameType || (engineState.tourneyState ? 'tournament' : 'cash'),
            // ─── Phase 37: Pass live-read data to PLO engine ───
            tableId: tableId || 'unknown',
            primaryOppId: primaryOppId || null,
            // ─── Phase 3 & 4 signals ───
            imageExposed,          // Module 20
            isLimpTrap: limpTrap.isLimpTrap, // Module 21
            isoTellActive: isoTell.isMechanical, // Module 22
            probeFarmScore: primaryOppId ? getProbeFarmScore(primaryOppId) : 0, // Module 19
            isMinRaiser: minRaiseTell.isMinRaiser, // Module 25
            isSqueezeOverkill: squeezeTell.isOverkill, // Module 26
            bombPotBoost: bombPotInfo.equityThresholdBoost, // Module 29
            isColdCallTrap: primaryOppId ? isColdCallTrap(primaryOppId).isTrap : false, // Module 28
            isRITRefuser: primaryOppId ? isRITRefuser(primaryOppId).isRITRefuser : false, // Module 31
            chipLeakBoosts: getChipLeakBoosts(profileId, tableId || 'default'), // Module 32
        }, legalActions);
        let ploAction = { type: ploDecision.type, amount: ploDecision.amount || 0 };
        if (engineState.tourneyState || engineState.tournament) {
            ploAction = applyTournamentAdjustments(ploAction, {
                tourneyState: engineState.tourneyState || engineState.tournament,
                stackBB, street, potSize, toCall, bb, numPlayers,
                position: mapPosition(heroPlayer.position || 'mp'),
                _handStrength: ploDecision._handStrength || 50,
            }, legalActions);
        }
        const validPLO = validateAndClamp(ploAction.type, ploAction.amount, legalActions);
        const delayPLO = getActionDelay(profileId, validPLO.type, street === 'preflop') + angleTell.extraEntropyMs;
        recordPerformanceAction(profileId, street, validPLO.type, validPLO.type !== 'fold' && validPLO.type !== 'check');
        return { action: validPLO, delayMs: delayPLO };
    }

    const adaptedState = {
        holeCards: holeCardStrings,
        board: boardStrings,
        handStr,
        street, // Keep lowercase for fallback ('preflop', 'flop', 'turn', 'river')
        position,
        stackBB,
        potSize,
        toCall,
        bb, // Big blind in chips (for BB-relative thresholds)
        // Bug #116: Was hardcoded 'Cash', making tournament ICM adjustments dead code
        gameType: tableConfig.gameType || engineState.gameType || (engineState.tourneyState ? 'Tournament' : 'Cash'),
        numPlayers,
        topology: numPlayers <= 3 ? '3-Max' : numPlayers <= 6 ? '6-Max' : '9-Max',
        mode: engineState.tourneyState ? 'ICM' : 'ChipEV',
        // ═══ ALWAYS-ON: Pass table + opponent IDs for live observation data ═══
        tableId,
        primaryOppId,
    };

    // --- 1b. LOAD OPPONENT READS (Gap 4) ---
    // Query saved opponent data to adjust decision thresholds
    let opponentAdjustment = { callMod: 0, foldMod: 0, bluffAware: false };
    try {
        const sb = getSupabase();
        if (sb && numPlayers <= 3) { // Only load reads heads-up or 3-way
            const opponents = engineState.players?.filter(p => String(p.id) !== String(profileId) && !p.folded) || [];
            if (opponents.length > 0) {
                const oppId = opponents[0].id;
                // BUG #18 FIX: Use resilient query (this is in the hot decision path)
                const { resilientQuery: rq } = require('./SupabaseResilience');
                const { data: readData } = await rq(sb, () => sb
                    .from('horse_opponent_reads')
                    .select('bluff_frequency, call_frequency, tendency')
                    .eq('horse_id', profileId)
                    .eq('opponent_id', oppId)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                );
                if (readData) {
                    // ═══ Phase 39B FIX: callMod sign convention was INVERTED ═══
                    // Old code set callMod=5 for bluffers and callMod=-3 for stations,
                    // but ALL downstream code uses callMod>0 to mean "opponent is a station".
                    // This caused bluffers to be treated as stations (no c-bet bluffs)
                    // and stations to be treated as tight (engine bluffed them MORE).
                    // Fix: bluffAware handles bluff detection, callMod only tracks station tendency.

                    // If opponent bluffs a lot → set bluffAware flag (callMod stays 0)
                    if (readData.bluff_frequency > 0.35) {
                        opponentAdjustment.bluffAware = true;
                    }
                    // If opponent rarely bluffs → fold more marginal spots
                    if (readData.bluff_frequency < 0.15) {
                        opponentAdjustment.foldMod = 5;
                    }
                    // If opponent is a calling station → positive callMod (matches downstream sign convention)
                    if (readData.call_frequency > 0.55) {
                        opponentAdjustment.callMod = 5;
                    }
                }
            }
        }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    // --- 2. TRY GTO SOLVER ---
    let gtoDecision = null;
    try {
        const gto = await getGTOModule();
        if (gto?.makeGTODecision) {
            gtoDecision = await gto.makeGTODecision(profileId, {
                ...adaptedState,
                street: street.charAt(0).toUpperCase() + street.slice(1), // Capitalize for GTO
                holeCards: holeCardStrings,
                board: boardStrings,
            });
        }
    } catch (err) {
        console.warn('[HorseBrain] GTO decision failed, using fallback:', err.message);
    }

    // --- 3. APPLY PERSONALITY + ADVANCED OVERLAYS ---
    let finalAction = null;
    let finalAmount = null;
    let handType = 'weak'; // For timing tells: 'strong', 'weak', 'bluff'

    if (gtoDecision?.action) {
        // Map GTO action names to engine format
        const actionMap = { 'Raise': 'raise', 'Call': 'call', 'Fold': 'fold', 'Check': 'check', 'Bet': 'bet' };
        finalAction = actionMap[gtoDecision.action] || gtoDecision.action.toLowerCase();

        // Calculate sizing from GTO (sizing is a pot fraction for the bet/raise SIZE)
        // Engine expects amount = total bet level (currentBet + raise increment)
        if ((finalAction === 'raise' || finalAction === 'bet') && gtoDecision.sizing) {
            const raiseSize = Math.round(potSize * gtoDecision.sizing);
            const currentBet = engineState.currentBet || 0;
            finalAmount = currentBet + raiseSize; // Total bet = currentBet + our raise
        }

        // --- PREFLOP MODULE WIRING ---
        // ═══ Apply anti-exploit modules to GTO preflop decisions ═══
        if (street === 'preflop') {
            const preflopStr = getPreflopStrength(handStr);

            // MODULE 5: Sandwich — tighten calling range when sandwiched multiway
            if (finalAction === 'call' && sandwichedFoldMod > 0 && preflopStr < (55 + sandwichedFoldMod)) {
                console.debug(`[HorseBrain]  MODULE 5 PREFLOP SANDWICH: folding ${handStr} (strength=${preflopStr} < ${55 + sandwichedFoldMod})`);
                finalAction = 'fold';
                finalAmount = null;
            }

            // MODULE 22: Iso Tell — widen 3-bet range vs mechanical isolators
            if (finalAction === 'call' && isoTell.isMechanical && preflopStr >= 45 && toCall > bb * 2) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction && Math.random() < 0.40) {
                    console.debug(`[HorseBrain]  MODULE 22 ISO EXPLOIT: 3-betting ${handStr} vs mechanical isolator`);
                    finalAction = raiseAction.type;
                    finalAmount = Math.round(toCall * 3);
                    finalAmount = Math.max(raiseAction.minAmount || finalAmount, Math.min(finalAmount, raiseAction.maxAmount || finalAmount));
                }
            }

            // MODULE 25: Min-Raise Defense — don't fold to min-raises, re-raise wider
            if (finalAction === 'fold' && minRaiseTell.isMinRaiser && preflopStr >= 35 && toCall <= bb * 3) {
                console.debug(`[HorseBrain]  MODULE 25 PREFLOP MIN-RAISE DEFENSE: calling with ${handStr} instead of folding`);
                finalAction = 'call';
                finalAmount = null;
            }

            // MODULE 29: Bomb Pot awareness — tighten commit threshold preflop
            if ((finalAction === 'raise' || finalAction === 'bet') && bombPotInfo.equityThresholdBoost > 0 && preflopStr < 60) {
                console.debug(`[HorseBrain]  MODULE 29 PREFLOP: suppressing raise in bomb-pot format (strength=${preflopStr})`);
                finalAction = toCall > 0 ? 'call' : 'check';
                finalAmount = null;
            }

            // MODULE 20: Image Exposed — tighten open range when opponents have reads
            if (imageExposed && (finalAction === 'raise' || finalAction === 'bet') && preflopStr < 55) {
                console.debug(`[HorseBrain]  MODULE 20 PREFLOP: tightening opens while image exposed (strength=${preflopStr})`);
                finalAction = toCall > 0 ? 'call' : 'check';
                finalAmount = null;
            }
        }

        // --- POSTFLOP HAND STRENGTH GUARDRAILS ---
        // GTO solver sometimes returns suboptimal actions for edge cases.
        // Apply sanity checks using the hand evaluator to override obvious mistakes.
        if (street !== 'preflop') {
            const handEval = evaluatePostflopHand(holeCardStrings, boardStrings);
            const drawEq = getDrawEquity(handEval, street);
            const facingBet = toCall > 0;

            // GUARDRAIL 1: Don't call with garbage hands facing a bet
            // Override GTO 'call' with 'fold' if hand is too weak for the price
            // BUG #21 FIX: Was only folding strength < 15. Hands with strength 15-25
            // facing a large bet (75%+ pot) are also clear folds. Threshold scales with bet size.
            if (finalAction === 'call' && facingBet && drawEq.outs === 0) {
                const potOdds = toCall / (potSize + toCall);
                const betRelPot = toCall / Math.max(1, potSize);
                // Fold threshold scales: small bet → only fold garbage, big bet → fold more
                const foldThreshold = betRelPot >= 0.75 ? 25 : betRelPot >= 0.50 ? 20 : 15;
                if (handEval.strength < foldThreshold && potOdds >= 0.20) {
                    finalAction = 'fold';
                    finalAmount = null;
                }
            }

            // GUARDRAIL 2: Bet strong hands when not facing action
            // Override GTO 'check' with 'bet' if hand strength >= 60 (strong made hand)
            // BUG #19 FIX: Also semi-bluff with strong draws (flush draws, OESDs, combo draws)
            // BUG #23 FIX: OOP semi-bluffs need more outs (10+) because we face raises
            // and must fold equity. IP can semi-bluff with 8+ outs since we close the action.
            const isIPGuardCheck = new Set(['BTN', 'CO', 'HJ']).has(position);
            const semiBluffOutsThreshold = isIPGuardCheck ? 8 : 10; // IP = 8 outs, OOP = 10 outs
            const hasStrongDraw = (drawEq.outs >= semiBluffOutsThreshold);
            const shouldBetHand = handEval.strength >= 60 || (hasStrongDraw && street !== 'river');
            if (finalAction === 'check' && !facingBet && shouldBetHand) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction) {
                    const isIPGuard = new Set(['BTN', 'CO', 'HJ']).has(position);
                    const isSemiBluff = handEval.strength < 60 && hasStrongDraw;
                    const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, isSemiBluff, {
                        isInPosition: isIPGuard, numPlayers, handStrength: handEval.strength, stackBB
                    });
                    const betSize = Math.round(potSize * sizeFrac);
                    finalAction = raiseAction.type;
                    finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                }
            }

            // GUARDRAIL 3: Value bet strong hands on the river
            // BUG #20 FIX: Was using fixed 65% frequency. Adjust based on opponent tendency:
            // - vs calling station: bet more often (they call light)
            // - vs nit/folder: bet less often (they only call with better)
            // - vs unknown: default 65%
            // BUG #22 FIX: Was firing at strength >= 50 which is bluff-catcher territory.
            // Hands with 50-59 strength are marginal — betting them on the river turns them into
            // a bluff (worse hands fold, better hands call). Raised threshold to 60 for default,
            // but vs known calling stations we CAN thin-value at 55+ (they call with worse).
            const g3StrengthThreshold = (opponentAdjustment.callMod > 0) ? 55 : 60;
            if (finalAction === 'check' && !facingBet && street === 'river' && handEval.strength >= g3StrengthThreshold) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                let riverVBetFreq = 0.65;
                if (opponentAdjustment.callMod > 0) riverVBetFreq = 0.85; // Station → bet more
                if (opponentAdjustment.foldMod > 0 && handEval.strength < 70) riverVBetFreq = 0.40; // Nit → thin value less
                if (opponentAdjustment.bluffAware) riverVBetFreq = Math.min(riverVBetFreq, 0.55); // Bluffy opp → they might check-raise bluff
                if (raiseAction && Math.random() < riverVBetFreq) {
                    const isIPGuard3 = new Set(['BTN', 'CO', 'HJ']).has(position);
                    const sizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, false, {
                        isInPosition: isIPGuard3, numPlayers, handStrength: handEval.strength, stackBB
                    });
                    const betSize = Math.round(potSize * sizeFrac);
                    finalAction = raiseAction.type;
                    finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                }
            }
        }

        // Classify hand type for timing tells
        // On postflop streets, preflop strength is less relevant, so use GTO confidence
        const preflopStrength = getPreflopStrength(handStr);
        if (street === 'preflop') {
            if (preflopStrength >= 75) handType = 'strong';
            else if ((finalAction === 'raise' || finalAction === 'bet') && preflopStrength < 40) handType = 'bluff';
        } else {
            // Postflop: classify based on action + GTO confidence
            if (gtoDecision.confidence && gtoDecision.confidence > 0.7) handType = 'strong';
            else if ((finalAction === 'raise' || finalAction === 'bet') && (!gtoDecision.confidence || gtoDecision.confidence < 0.3)) handType = 'bluff';
        }

        // Apply TABLE IMAGE overlay (Phase 3A #1)
        // BUG #35 FIX: Was gated by tiltLevel >= 3 (table image only worked when tilted) and
        // used preflopStrength on postflop streets (72o that flops full house → strength 0.15 →
        // image tighten_up converts value raise to FOLD). Now uses actual postflop hand strength
        // and runs independently of tilt (non-tilted horses should also adjust for image).
        try {
            const adv = await getAdvancedModule();
            if (adv?.getImageAdjustedAction) {
                let imageHandStrength;
                if (street === 'preflop') {
                    imageHandStrength = preflopStrength / 100; // 0-1 scale
                } else {
                    try {
                        const imgEval = evaluatePostflopHand(holeCardStrings, boardStrings);
                        imageHandStrength = imgEval.strength / 100; // 0-1 scale
                    } catch (_) {
                        imageHandStrength = preflopStrength / 100; // Fallback
                    }
                }
                const adjusted = adv.getImageAdjustedAction(profileId, finalAction, imageHandStrength);
                if (adjusted && adjusted !== finalAction) {
                    console.debug(`[HorseBrain]  Image overlay: ${finalAction} → ${adjusted} (str=${(imageHandStrength * 100).toFixed(0)})`);
                    finalAction = adjusted;
                }
            }
        } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }

        // Apply EXPLOITATIVE adjustments (Phase 3A #2)
        try {
            const adv = await getAdvancedModule();
            const personality = await getPersonalityModule();
            if (adv?.getExploitAdjustedAction && personality?.getSkillTier) {
                const skill = personality.getSkillTier(profileId);
                // Only skilled horses exploit opponents
                if (skill.level >= 3) {
                    // Try to exploit the last aggressor or the player in the pot
                    const opponents = engineState.players?.filter(p =>
                        String(p.id) !== String(profileId) && !p.folded
                    ) || [];
                    for (const opp of opponents) {
                        const result = adv.getExploitAdjustedAction(
                            profileId, String(opp.id), finalAction, skill.level
                        );
                        if (result.exploiting) {
                            console.debug(`[HorseBrain]  Exploit: ${finalAction} → ${result.action} (vs ${String(opp.id).substring(0, 8)}, leak: ${result.leak})`);
                            finalAction = result.action;
                            break; // Only exploit one opponent per decision
                        }
                    }
                }
            }
        } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }

        // Apply PERSONALITY BET SIZING (#21)
        // Each play style has a different open-raise size and postflop aggression
        if ((finalAction === 'raise' || finalAction === 'bet') && finalAmount) {
            try {
                const personality = await getPersonalityModule();
                if (personality?.getPlayStyle) {
                    const style = personality.getPlayStyle(profileId);
                    // Preflop open-raise multiplier
                    if (street === 'preflop') {
                        const styleMultipliers = {
                            TAG: 1.0,     // Standard GTO sizing
                            nit: 0.9,     // Slightly smaller (less value)
                            LAG: 1.15,    // Bigger opens
                            maniac: 1.35, // Oversize opens
                            calling_station: 0.85 // Limpy/small
                        };
                        const mult = styleMultipliers[style.key] || 1.0;
                        finalAmount = Math.round(finalAmount * mult);
                    } else {
                        // Postflop: maniacs overbet, nits underbet
                        const postflopMults = {
                            TAG: 1.0, nit: 0.80, LAG: 1.1,
                            maniac: 1.30, calling_station: 0.90
                        };
                        const mult = postflopMults[style.key] || 1.0;
                        finalAmount = Math.round(finalAmount * mult);
                    }
                }
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }

        // Apply OPPONENT-AWARE BET SIZING (#7)
        // Adjust sizing based on opponent tendencies
        if ((finalAction === 'raise' || finalAction === 'bet') && finalAmount) {
            try {
                const adv = await getAdvancedModule();
                if (adv?.getOpponentRead) {
                    const opponents = engineState.players?.filter(p =>
                        String(p.id) !== String(profileId) && !p.folded
                    ) || [];
                    if (opponents.length > 0) {
                        const mainOpp = opponents[0];
                        const read = adv.getOpponentRead(profileId, String(mainOpp.id));
                        if (read) {
                            // Calling station → bet bigger for value
                            if (read.callFrequency > 0.7) {
                                finalAmount = Math.round(finalAmount * 1.20);
                            }
                            // Nit / overfolder → bet smaller (but still bet)
                            if (read.foldFrequency > 0.6) {
                                finalAmount = Math.round(finalAmount * 0.80);
                            }
                        }
                    }
                }
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }

        // Apply TOURNAMENT ICM ADJUSTMENTS (#4)
        // Tighten ranges near the bubble, loosen when short-stacked
        if (adaptedState.gameType === 'Tournament') {
            try {
                const gto = await getGTOModule();
                if (gto?.getICMAdjustment && engineState.tourneyState) {
                    const icm = gto.getICMAdjustment(engineState.tourneyState, profileId);
                    if (icm.strategy === 'survival') {
                        // On the bubble: don't call marginal spots
                        if (finalAction === 'call' && toCall > potSize * 0.3) {
                            finalAction = 'fold';
                        }
                        // Don't bluff near the bubble
                        if (handType === 'bluff' && (finalAction === 'raise' || finalAction === 'bet')) {
                            finalAction = 'check';
                        }
                    }
                    // Adjust sizing by ICM pressure
                    if (finalAmount && icm.rangeAdjustment) {
                        finalAmount = Math.round(finalAmount * icm.rangeAdjustment);
                    }
                }
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }
    }

    // --- 4. FALLBACK IF NO GTO ---

    // ═══ DEDICATED FLOP HEURISTIC ENGINE ═══
    // When Supabase lacks flop data, use the specialized flop engine
    // with board texture, c-bet strategy, range advantage, and opponent reads.
    if (!finalAction && street === 'flop') {
        const hash = getHash(profileId);
        let flopLooseness = (hash % 20) - 10;
        let flopAggression = ((hash >> 4) % 20) - 10;
        try {
            if (_personalityModule) {
                const style = _personalityModule.getPlayStyle?.(profileId);
                if (style?.key) {
                    const sl = { TAG: -3, nit: -15, LAG: 8, maniac: 15, calling_station: 10 };
                    const sa = { TAG: 5, nit: -10, LAG: 12, maniac: 18, calling_station: -8 };
                    flopLooseness = sl[style.key] ?? flopLooseness;
                    flopAggression = sa[style.key] ?? flopAggression;
                }
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        let flopEnrichedRead = null;
        try {
            const adv = await getAdvancedModule();
            if (adv?.getOpponentRead && primaryOppId) {
                flopEnrichedRead = adv.getOpponentRead(profileId, primaryOppId);
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // ═══ PHASE 15: JOURNAL → ENRICHED FALLBACK (Flop) ═══
        if (!flopEnrichedRead && primaryOppId) {
            const flopJournalRead = getLiveRead(profileId, tableId, primaryOppId);
            if (flopJournalRead && flopJournalRead.confidence >= 0.15) {
                const jl = flopJournalRead;
                let tendency = 'balanced';
                if (jl.playerType === 'nit' || jl.playerType === 'weak-tight') tendency = 'weak-tight';
                else if (jl.playerType === 'LAG' || jl.playerType === 'maniac') tendency = 'bluffy';
                else if (jl.playerType === 'calling_station') tendency = 'calling-station';
                flopEnrichedRead = {
                    bluffFrequency: jl.bluffRate ?? (jl.aggFreq > 0.45 ? 0.35 : jl.aggFreq > 0.30 ? 0.25 : 0.15),
                    callFrequency: jl.callFreq ?? 0.50,
                    foldFrequency: jl.foldFreq ?? 0.35,
                    tendency,
                    handsObserved: jl.confidence * 100,
                    confidence: jl.confidence,
                    _source: 'journal_fallback',
                };
            }
        }

        const flopHeroIsAggressor = engineState.lastRaiser === profileId;

        const flopDecision = makeFlopHeuristicDecision({
            holeCards: holeCardStrings, board: boardStrings,
            handStr, position, stackBB, potSize, toCall, bb,
            numPlayers, legalActions, profileId,
            aggressionBias: flopAggression, loosenessBias: flopLooseness,
            opponentAdjustment,
            enrichedOpponentRead: flopEnrichedRead,
            heroIsAggressor: flopHeroIsAggressor,
            counterStrategyMode: counterStrategy.mode,
            // ═══ ALWAYS-ON: Pass table + opponent IDs for live observation data ═══
            tableId,
            primaryOppId,
        });
        if (flopDecision) {
            finalAction = flopDecision.type;
            finalAmount = flopDecision.amount;
            // ═══ Phase 38B FIX: wrap evaluatePostflopHand in try-catch to prevent crash in log ═══
            let flopLogStr = '?';
            try { flopLogStr = evaluatePostflopHand(holeCardStrings, boardStrings).strength; } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            console.debug(`[HorseBrain]  Flop heuristic: ${finalAction}${finalAmount ? ` (${finalAmount})` : ''} [str=${flopLogStr}]`);
        }
    }

    // ═══ DEDICATED TURN/RIVER HEURISTIC ENGINE ═══
    // PioSolver data in Supabase is richest for preflop + flop. Turn/river
    // spots are sparser, so this dedicated engine fills the gap with
    // board runout analysis, polarization, blocker effects, and RIO guards.
    if (!finalAction && (street === 'turn' || street === 'river')) {
        const hash = getHash(profileId);
        let fbLoosenessBias = (hash % 20) - 10;
        let fbAggressionBias = ((hash >> 4) % 20) - 10;
        try {
            if (_personalityModule) {
                const style = _personalityModule.getPlayStyle?.(profileId);
                if (style?.key) {
                    const sl = { TAG: -3, nit: -15, LAG: 8, maniac: 15, calling_station: 10 };
                    const sa = { TAG: 5, nit: -10, LAG: 12, maniac: 18, calling_station: -8 };
                    fbLoosenessBias = sl[style.key] ?? fbLoosenessBias;
                    fbAggressionBias = sa[style.key] ?? fbAggressionBias;
                }
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // ═══ ENRICHED OPPONENT READ ═══
        // Pull full opponent read from Advanced module for richer turn/river decisions.
        // This gives us bluffFrequency, valueFrequency, foldFrequency, callFrequency,
        // tendency (bluffy/weak-tight/balanced), and handsObserved.
        let enrichedOpponentRead = null;
        try {
            const adv = await getAdvancedModule();
            if (adv?.getOpponentRead && primaryOppId) {
                enrichedOpponentRead = adv.getOpponentRead(profileId, primaryOppId);
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // ═══ PHASE 15: JOURNAL → ENRICHED FALLBACK ═══
        // When the Advanced module has NO data for this opponent, synthesize
        // an enrichedOpponentRead from the live observer (which may include journal data).
        // This means turn/river decisions ALWAYS have opponent profiling available,
        // even for opponents we've never played before this session (but played in prior sessions).
        if (!enrichedOpponentRead && primaryOppId) {
            const journalLiveRead = getLiveRead(profileId, tableId, primaryOppId);
            if (journalLiveRead && journalLiveRead.confidence >= 0.15) {
                // Synthesize an enrichedOpponentRead from live/journal data
                const jl = journalLiveRead;
                let tendency = 'balanced';
                if (jl.playerType === 'nit' || jl.playerType === 'weak-tight') tendency = 'weak-tight';
                else if (jl.playerType === 'LAG' || jl.playerType === 'maniac') tendency = 'bluffy';
                else if (jl.playerType === 'calling_station') tendency = 'calling-station';
                else if (jl.playerType === 'TAG') tendency = 'balanced';

                enrichedOpponentRead = {
                    bluffFrequency: jl.bluffRate ?? (jl.aggFreq > 0.45 ? 0.35 : jl.aggFreq > 0.30 ? 0.25 : 0.15),
                    callFrequency: jl.callFreq ?? 0.50,
                    foldFrequency: jl.foldFreq ?? 0.35,
                    valueFrequency: jl.aggFreq ?? 0.33,
                    tendency,
                    handsObserved: jl.confidence * 100, // Approximate — confidence=0.60 → 60 "equivalent" hands
                    confidence: jl.confidence,
                    _source: 'journal_fallback',
                };
                console.debug(`[HorseBrain]  JOURNAL→ENRICHED FALLBACK: ${primaryOppId.substring(0, 8)} type=${jl.playerType} tendency=${tendency} conf=${Math.round(jl.confidence * 100)}%`);
            }
        }

        // ═══ MULTI-STREET ACTION INFERENCE ═══
        // Infer opponent strength from how the pot was built across streets.
        // A large pot going into turn/river = someone has been betting hard.
        // Use pot-to-starting-stack ratio as a proxy for action intensity.
        let oppStreetAggression = 'unknown';
        const potBBs = potSize / Math.max(1, bb);
        const streetNum = street === 'turn' ? 3 : 4; // preflop=1, flop=2, turn=3, river=4
        const avgPotPerStreet = potBBs / streetNum;
        // Large pots = aggressive action has occurred on prior streets
        if (avgPotPerStreet >= 12) oppStreetAggression = 'very_heavy'; // 3-bet pot + big bets
        else if (avgPotPerStreet >= 6) oppStreetAggression = 'heavy'; // raised pot + c-bet
        else if (avgPotPerStreet >= 3) oppStreetAggression = 'moderate'; // limped or small raise
        else oppStreetAggression = 'light'; // checked through mostly

        // Also check if WE are the aggressor (preflop raiser) for nut advantage
        const heroIsAggressor = engineState.lastRaiser === profileId;

        // ═══ MULTI-STREET NARRATIVE ═══
        // Read what we did on prior streets to ensure our line tells a believable story.
        const trHandId = engineState.handId || engineState.handNumber || `${tableId}_recent`;
        const trMemory = getStreetMemory(profileId, trHandId);
        const trNarrative = analyzeStreetNarrative(trMemory, street);

        const trDecision = makeTurnRiverHeuristicDecision({
            street, holeCards: holeCardStrings, board: boardStrings,
            handStr, position, stackBB, potSize, toCall, bb,
            numPlayers, legalActions, profileId,
            aggressionBias: fbAggressionBias, loosenessBias: fbLoosenessBias,
            opponentAdjustment,
            // New enriched data for turn/river decisions
            enrichedOpponentRead,
            oppStreetAggression,
            heroIsAggressor,
            counterStrategyMode: counterStrategy.mode,
            // Multi-street narrative for line consistency
            streetNarrative: trNarrative,
            // ═══ ALWAYS-ON: Pass table + opponent IDs for live observation data ═══
            tableId,
            primaryOppId,
        });
        if (trDecision) {
            finalAction = trDecision.type;
            finalAmount = trDecision.amount;
            console.debug(`[HorseBrain] 🃏 Turn/River heuristic: ${street} → ${finalAction}${finalAmount ? ` (${finalAmount})` : ''} [oppAgg=${oppStreetAggression}]`);
        }
    }

    // --- 3b. DONK BET HANDLER ---
    // When hero was the preflop aggressor and opponent donk bets into us on flop/turn,
    // use specialized donk bet response logic BEFORE falling through to generic fallback.
    if (!finalAction && toCall > 0 && (street === 'flop' || street === 'turn')) {
        const heroWasPFA = engineState.lastRaiser === profileId;
        if (heroWasPFA) {
            // Gather hand eval + opponent data for donk bet handler
            const donkHandEval = evaluatePostflopHand(holeCardStrings, boardStrings);
            const donkDrawEq = getDrawEquity(donkHandEval, street);
            const donkRaiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            const donkCanRaise = !!donkRaiseAction;
            const donkCanCall = legalActions.some(a => a.type === 'call');

            // Pull opponent tendency if we have enriched reads
            let donkOppTendency = 'balanced', donkOppConfidence = 0, donkOppCallFreq = 0.50;
            try {
                const adv = await getAdvancedModule();
                if (adv?.getOpponentRead && primaryOppId) {
                    const oppRead = adv.getOpponentRead(profileId, primaryOppId);
                    if (oppRead && oppRead.handsObserved >= 5) {
                        donkOppTendency = oppRead.tendency || 'balanced';
                        donkOppConfidence = Math.min(0.85, oppRead.handsObserved / 60);
                        donkOppCallFreq = oppRead.callFrequency ?? 0.50;
                    }
                }
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

            // Estimate board wetness quickly
            const bCards = boardStrings || [];
            let donkBoardWetness = 0;
            if (bCards.length >= 3) {
                const suits = bCards.map(c => c[c.length - 1]);
                const flushDrawPossible = suits.filter(s => suits.filter(x => x === s).length >= 2).length > 0;
                if (flushDrawPossible) donkBoardWetness += 2;
                const ranks = bCards.map(c => 'A23456789TJQKA'.indexOf(c[0]));
                ranks.sort((a, b) => a - b);
                for (let i = 0; i < ranks.length - 1; i++) {
                    if (ranks[i + 1] - ranks[i] <= 2) donkBoardWetness += 1;
                }
            }

            // Get personality aggression bias
            let donkAggrBias = 0;
            try {
                if (_personalityModule?.getPlayStyle) {
                    const style = _personalityModule.getPlayStyle(profileId);
                    const sa = { TAG: 5, nit: -10, LAG: 12, maniac: 18, calling_station: -8 };
                    donkAggrBias = sa[style?.key] ?? 0;
                }
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

            // ═══ LIVE-READ for donk bet response (Phase 17) ═══
            let donkLiveRead = null;
            if (primaryOppId && tableId) {
                try {
                    donkLiveRead = getLiveRead(profileId, tableId, primaryOppId);
                } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            }

            const donkResult = handleDonkBet({
                heroIsAggressor: true,
                street,
                facingBet: true,
                handStrength: donkHandEval.strength,
                handCategory: donkHandEval.category,
                drawOuts: donkDrawEq.outs,
                position,
                potSize, toCall, bb,
                canRaise: donkCanRaise,
                canCall: donkCanCall,
                raiseAction: donkRaiseAction,
                aggressionBias: donkAggrBias,
                oppTendency: donkOppTendency,
                oppConfidence: donkOppConfidence,
                oppCallFreq: donkOppCallFreq,
                boardWetness: donkBoardWetness,
                numPlayers,
                // ═══ LIVE-READ DATA (Phase 17) ═══
                liveRead: donkLiveRead,
                tableId,
                primaryOppId,
            });

            if (donkResult) {
                finalAction = donkResult.type;
                finalAmount = donkResult.amount || null;
                console.debug(`[HorseBrain]  DONK BET response: ${street} → ${finalAction}${finalAmount ? ` (${finalAmount})` : ''}`);
            }
        }
    }

    // Generic fallback for preflop + any street the heuristic didn't handle
    if (!finalAction) {
        const fallback = makeFallbackDecision(profileId, adaptedState, legalActions, opponentAdjustment);
        finalAction = fallback.type;
        finalAmount = fallback.amount;
    }

    // --- 4a. MODULE 18: SPR TRAP DETECTOR ---
    // Detect when an opponent's bet sizing is designed to pot-commit us with a weak hand.
    // If we're being trapped into a large pot with mediocre equity, override to fold.
    if (finalAction === 'call' && toCall > 0 && street !== 'preflop') {
        const sprTrap = detectSPRTrap(toCall, potSize, heroPlayer.stack, numPlayers, getPreflopStrength(handStr));
        if (sprTrap.isTrap) {
            const handEvalTrap = evaluatePostflopHand(holeCardStrings, boardStrings);
            if (handEvalTrap.strength < 55) {
                console.debug(`[HorseBrain]  MODULE 18 SPR TRAP: ${sprTrap.reason} — folding marginal hand (strength=${handEvalTrap.strength})`);
                finalAction = 'fold';
                finalAmount = null;
            }
        }
    }

    // --- 4b. UNIVERSAL HAND STRENGTH GUARDRAILS ---
    // These apply to BOTH GTO and fallback decisions to prevent egregious mistakes
    // ═══ WIRED: All anti-exploit module signals now feed into NL Hold'em thresholds ═══
    if (street !== 'preflop' && finalAction) {
        const handEval = evaluatePostflopHand(holeCardStrings, boardStrings);
        const drawEq = getDrawEquity(handEval, street);
        const facingBet = toCall > 0;

        // Fold garbage facing a bet (unless pot odds are amazing)
        // ═══ MODULE 5 (Sandwich) + MODULE 11 (Range Rotation) + MODULE 20 (Image Exposed) ═══
        // + MODULE 29 (Bomb Pot) all feed into the fold threshold
        const imageExposedFoldMod = imageExposed ? 5 : 0;  // Module 20: tighter when exposed
        const bombPotFoldMod = bombPotInfo.equityThresholdBoost || 0; // Module 29: tighter in bomb pots
        // ═══ Phase 39B FIX: add bluffAware (was relying on inverted callMod for bluff detection) ═══
        const foldThreshold = 15
            + opponentAdjustment.foldMod - opponentAdjustment.callMod
            - (opponentAdjustment.bluffAware ? 5 : 0)  // Call down more vs known bluffers
            + sandwichedFoldMod        // Module 5: +10 when sandwiched
            + gearFoldMod              // Module 11: range rotation fold adjustment
            + imageExposedFoldMod      // Module 20: +5 when image is exposed
            + bombPotFoldMod;          // Module 29: tighter commit in straddle/bomb pots

        if (finalAction === 'call' && facingBet && handEval.strength < foldThreshold && drawEq.outs === 0) {
            const potOdds = toCall / (potSize + toCall);
            if (potOdds >= 0.20) {
                finalAction = 'fold';
                finalAmount = null;
            }
        }

        // ═══ GUARDRAIL: NEVER FOLD THE NUTS ═══
        // Safety check: if we have a very strong hand (set+, flush+, straight+) never fold
        if (finalAction === 'fold' && handEval.strength >= 75) {
            console.debug(`[HorseBrain]  GUARDRAIL: Preventing fold with strength=${handEval.strength} (${handEval.category})`);
            finalAction = 'call';
            finalAmount = null;
        }

        // ═══ GUARDRAIL: DON'T RAISE WITH GARBAGE ═══
        // Safety check: if we have nothing and the decision says raise, don't unless it's a valid bluff
        if ((finalAction === 'raise' || finalAction === 'bet') && handEval.strength < 15 && drawEq.outs < 6) {
            // Only allow bluffs at a capped frequency — never raise junk by accident
            if (Math.random() > 0.25) { // 75% of the time, convert garbage raises to checks
                finalAction = facingBet ? 'fold' : 'check';
                finalAmount = null;
            }
        }

        // ═══ GUARDRAIL: STREET-AWARE SIZING BOUNDS ═══
        // Ensure bet/raise amounts are sane relative to the pot
        if (finalAmount && (finalAction === 'raise' || finalAction === 'bet')) {
            const guardRaiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            const minSensible = Math.round(potSize * 0.20); // Never bet less than 20% pot
            const maxSensible = Math.round(potSize * 2.50); // Never bet more than 250% pot (overbet limit)
            if (finalAmount < minSensible && guardRaiseAction) {
                finalAmount = Math.max(guardRaiseAction.minAmount || 1, minSensible);
            }
            if (finalAmount > maxSensible && guardRaiseAction) {
                finalAmount = Math.min(guardRaiseAction.maxAmount || maxSensible, maxSensible);
            }
        }

        // ═══ MODULE 5: SANDWICH DRAW THRESHOLD ═══
        // When sandwiched multiway, fold draws with fewer outs than the threshold
        if (finalAction === 'call' && facingBet && sandwichedDrawThreshold > 0 && drawEq.outs > 0 && drawEq.outs < sandwichedDrawThreshold) {
            console.debug(`[HorseBrain]  MODULE 5 SANDWICH: folding weak draw (${drawEq.outs} outs < ${sandwichedDrawThreshold} threshold)`);
            finalAction = 'fold';
            finalAmount = null;
        }

        // ═══ MODULE 22: ISO TELL → WIDEN 3-BET/RAISE THRESHOLD ═══
        // When opponent has mechanical isolation sizing, be more aggressive (lower raise threshold)
        const isoRaiseBonus = isoTell.isMechanical ? -8 : 0;
        // ═══ MODULE 25: MIN-RAISE → DON'T FOLD, RE-RAISE ═══
        const minRaiseDefense = minRaiseTell.isMinRaiser ? -5 : 0;
        // ═══ MODULE 26: SQUEEZE OVERKILL → FOLD MORE vs SQUEEZE ═══
        const squeezeFoldMod = squeezeTell.isOverkill ? 8 : 0;
        // ═══ MODULE 11: RANGE ROTATION RAISE MOD ═══
        const effectiveRaiseMod = gearRaiseMod + isoRaiseBonus + minRaiseDefense;

        // Bet strong hands when not facing action
        // Raise threshold adjusted by all module signals
        const betThreshold = 60 + effectiveRaiseMod;
        if ((finalAction === 'check') && !facingBet && handEval.strength >= betThreshold) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction && Math.random() < 0.70) {
                const isIPUniv = new Set(['BTN', 'CO', 'HJ']).has(position);
                const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, false, {
                    isInPosition: isIPUniv, numPlayers, handStrength: handEval.strength, stackBB
                });
                const betSize = Math.round(potSize * sizeFrac);
                finalAction = raiseAction.type;
                finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
            }
        }

        // ═══ MODULE 26: SQUEEZE DEFENSE — fold more marginal calls facing squeeze ═══
        if (finalAction === 'call' && facingBet && squeezeFoldMod > 0 && handEval.strength < (foldThreshold + squeezeFoldMod)) {
            console.debug(`[HorseBrain]  MODULE 26 SQUEEZE FOLD: folding marginal (strength=${handEval.strength} < ${foldThreshold + squeezeFoldMod})`);
            finalAction = 'fold';
            finalAmount = null;
        }

        // Value bet the river with medium-strong+ hands
        // BUG #34 FIX: Was using >= 50 which is bluff-catcher territory (same bug as BUG #22
        // in GUARDRAIL 3). Strength 50-59 hands lose EV when bet — worse hands fold, better call.
        // Use 55 vs calling stations (they call with worse), 60 otherwise.
        const univRiverThreshold = (opponentAdjustment.callMod > 0) ? 55 : 60;
        if (finalAction === 'check' && !facingBet && street === 'river' && handEval.strength >= univRiverThreshold) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            let univRiverVBetFreq = 0.65;
            if (opponentAdjustment.callMod > 0) univRiverVBetFreq = 0.80;  // Station → bet more
            if (opponentAdjustment.foldMod > 0 && handEval.strength < 70) univRiverVBetFreq = 0.40; // Nit → thin value less
            if (raiseAction && Math.random() < univRiverVBetFreq) {
                const isIPRiver = new Set(['BTN', 'CO', 'HJ']).has(position);
                const sizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, false, {
                    isInPosition: isIPRiver, numPlayers, handStrength: handEval.strength, stackBB
                });
                const betSize = Math.round(potSize * sizeFrac);
                finalAction = raiseAction.type;
                finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
            }
        }

        // ═══ MODULE 25: MIN-RAISE DEFENSE — re-raise instead of just calling ═══
        if (finalAction === 'call' && minRaiseTell.isMinRaiser && handEval.strength >= 40) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction && Math.random() < 0.45) {
                console.debug(`[HorseBrain]  MODULE 25 MIN-RAISE DEFENSE: re-raising vs min-raiser (strength=${handEval.strength})`);
                const reraiseSize = Math.round(potSize * 0.75);
                finalAction = raiseAction.type;
                finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(reraiseSize, raiseAction.maxAmount || reraiseSize));
            }
        }
    }

    // --- 5. APPLY FATIGUE OVERLAY (#22) ---
    if (finalAction) {
        try {
            const adv = await getAdvancedModule();
            if (adv?.getFatigueAdjustedAction) {
                const canCheck = legalActions.some(a => a.type === 'check');
                const fatigued = adv.getFatigueAdjustedAction(profileId, finalAction, canCheck);
                if (fatigued !== finalAction) {
                    console.debug(`[HorseBrain]  Fatigue: ${finalAction} → ${fatigued} (fatigue=${(adv.getFatigueLevel?.(profileId) || 0).toFixed(2)})`);
                    finalAction = fatigued;
                }
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }

    // --- 5b. APPLY RIVALRY / GRUDGE / SOFTPLAY DYNAMICS (#11) ---
    // BUG #40 FIX: Previously only used areRivals/areFriends boolean checks with flat
    // coin-flip overrides. Now wires in getRivalryAggression (scaled sizing boost),
    // getGrudgeTargeting (targeted aggression from big pot losses), and
    // getSoftplayModifier (nuanced bluff/value reduction vs friends).
    if (finalAction) {
        try {
            const adv = await getAdvancedModule();
            if (adv?.areRivals || adv?.areFriends || adv?.getGrudgeTargeting) {
                const opponents = engineState.players?.filter(p =>
                    String(p.id) !== String(profileId) && !p.folded
                ) || [];
                const oppIds = opponents.map(o => String(o.id));

                // ═══ GRUDGE TARGETING: Find if any opponent triggers grudge aggression ═══
                let grudgeTarget = null;
                let grudgeAggrMod = 1.0;
                if (adv.getGrudgeTargeting && oppIds.length > 0) {
                    const targeting = adv.getGrudgeTargeting(profileId, oppIds);
                    for (const oppId of oppIds) {
                        const t = targeting[oppId];
                        if (t && t.grudgeLevel > 1 && t.aggressionMod > grudgeAggrMod) {
                            grudgeTarget = oppId;
                            grudgeAggrMod = t.aggressionMod;
                        }
                    }
                }

                // Apply grudge aggression: boost sizing against grudge targets
                if (grudgeTarget && grudgeAggrMod > 1.0 && (finalAction === 'raise' || finalAction === 'bet') && finalAmount) {
                    const boostedAmount = Math.round(finalAmount * grudgeAggrMod);
                    const raiseAction = legalActions.find(a => a.type === finalAction);
                    if (raiseAction) {
                        finalAmount = Math.max(raiseAction.minAmount || finalAmount, Math.min(boostedAmount, raiseAction.maxAmount || boostedAmount));
                        console.debug(`[HorseBrain]  Grudge sizing boost ×${grudgeAggrMod.toFixed(2)} vs ${grudgeTarget.substring(0, 8)}`);
                    }
                }
                // Grudge can also convert call→raise (revenge play)
                if (grudgeTarget && grudgeAggrMod > 1.3 && finalAction === 'call' && Math.random() < 0.30) {
                    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                    if (raiseAction) {
                        finalAction = raiseAction.type;
                        // Grudge-fueled raise: pot-sized
                        const grudgeSize = Math.round(potSize * grudgeAggrMod * 0.75);
                        finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(grudgeSize, raiseAction.maxAmount || grudgeSize));
                        console.debug(`[HorseBrain]  Grudge revenge raise vs ${grudgeTarget.substring(0, 8)}`);
                    }
                }

                // ═══ RIVALRY: Scaled aggression (not just a coin flip) ═══
                for (const opp of opponents) {
                    const oppId = String(opp.id);
                    if (adv.areRivals && adv.areRivals(profileId, oppId)) {
                        // Use getRivalryAggression for scaled boost if available
                        let rivalryMod = 1.5; // default: 50% boost
                        if (adv.getRivalryAggression) {
                            rivalryMod = adv.getRivalryAggression(profileId, oppId, 1.0);
                        }
                        // Convert call→raise at rate proportional to rivalry (25-45%)
                        const convertRate = 0.25 + Math.min(0.20, (rivalryMod - 1.0) * 0.4);
                        if (finalAction === 'call' && legalActions.some(a => a.type === 'raise' || a.type === 'bet') && Math.random() < convertRate) {
                            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                            if (raiseAction) {
                                finalAction = raiseAction.type;
                                const rivalSize = Math.round((potSize * 0.75) * rivalryMod);
                                finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(rivalSize, raiseAction.maxAmount || rivalSize));
                                console.debug(`[HorseBrain]  Rivalry aggression ×${rivalryMod.toFixed(2)} vs ${oppId.substring(0, 8)}`);
                            }
                        }
                        // Also boost existing raise sizing against rivals
                        if ((finalAction === 'raise' || finalAction === 'bet') && finalAmount && rivalryMod > 1.0) {
                            const boosted = Math.round(finalAmount * (1 + (rivalryMod - 1.0) * 0.5)); // Half the rivalry mod as sizing boost
                            const raiseAction = legalActions.find(a => a.type === finalAction);
                            if (raiseAction) {
                                finalAmount = Math.max(raiseAction.minAmount || finalAmount, Math.min(boosted, raiseAction.maxAmount || boosted));
                            }
                        }
                        break;
                    }
                    if (adv.areFriends && adv.areFriends(profileId, oppId)) {
                        // ═══ SOFTPLAY: Use getSoftplayModifier for nuanced reduction ═══
                        let softMod = { bluffReduction: 0.5, valueReduction: 0.85, isSoftplaying: true };
                        if (adv.getSoftplayModifier) {
                            softMod = adv.getSoftplayModifier(profileId, oppId);
                        }
                        if (softMod.isSoftplaying && isSoftPlayAllowed(profileId, oppId)) {
                            if (finalAction === 'raise' || finalAction === 'bet') {
                                // Check if this is likely a bluff (weak hand) vs value (strong hand)
                                let handStrengthForSoft = 50;
                                if (street !== 'preflop') {
                                    try {
                                        const softEval = evaluatePostflopHand(holeCardStrings, boardStrings);
                                        handStrengthForSoft = softEval.strength;
                                    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                                } else {
                                    handStrengthForSoft = getPreflopStrength(handStr);
                                }

                                if (handStrengthForSoft < 40) {
                                    // Bluff territory: apply bluffReduction
                                    if (Math.random() < (1 - softMod.bluffReduction)) {
                                        // Convert bluff raise/bet → check or call
                                        if (legalActions.some(a => a.type === 'check')) {
                                            finalAction = 'check';
                                            finalAmount = null;
                                        } else if (legalActions.some(a => a.type === 'call')) {
                                            finalAction = 'call';
                                            finalAmount = null;
                                        }
                                        recordSoftPlay(profileId, oppId);
                                        console.debug(`[HorseBrain]  Softplay: bluff suppressed vs friend ${oppId.substring(0, 8)}`);
                                    }
                                } else {
                                    // Value territory: reduce sizing slightly
                                    if (finalAmount && softMod.valueReduction < 1.0) {
                                        finalAmount = Math.round(finalAmount * softMod.valueReduction);
                                        const raiseAction = legalActions.find(a => a.type === finalAction);
                                        if (raiseAction && finalAmount < (raiseAction.minAmount || 0)) {
                                            finalAmount = raiseAction.minAmount;
                                        }
                                        console.debug(`[HorseBrain]  Softplay: value bet reduced ×${softMod.valueReduction} vs friend ${oppId.substring(0, 8)}`);
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }

    // ─── 5c. APPLY TILT DEGRADATION ───
    // Phase 47 FIX: Moved OUTSIDE the raise/bet/call gate so tilt affects ALL actions
    // including check→spew-bet and fold→overcall. Previously gated behind
    // if(finalAction === raise|bet|call), meaning tilted horses played perfectly on check/fold.
    // After all overlays have refined the decision, tilt degrades it.
    // This models realistic mistakes tilted players make: overcalling, spew raises,
    // overbet jams, oversizing, and giving up. Uses the Advanced module's tilt level.
    if (finalAction) {
        try {
            const adv = await getAdvancedModule();
            if (adv?.getTiltLevel) {
                const tiltLevel = adv.getTiltLevel(profileId);
                if (tiltLevel >= 2) {
                    // Get hand eval for tilt function (needs hand strength)
                    let tiltHandStrength = 50; // Default if eval fails
                    if (street !== 'preflop') {
                        try {
                            const tiltEval = evaluatePostflopHand(holeCardStrings, boardStrings);
                            tiltHandStrength = tiltEval.strength;
                        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                    } else {
                        tiltHandStrength = getPreflopStrength(handStr);
                    }

                    // Get aggression bias from personality
                    let tiltAggrBias = 0;
                    try {
                        if (_personalityModule?.getPlayStyle) {
                            const style = _personalityModule.getPlayStyle(profileId);
                            const sa = { TAG: 5, nit: -10, LAG: 12, maniac: 18, calling_station: -8 };
                            tiltAggrBias = sa[style?.key] ?? 0;
                        }
                    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

                    const tiltResult = applyTiltDegradation(
                        finalAction, finalAmount, tiltLevel,
                        tiltHandStrength, legalActions, potSize, tiltAggrBias
                    );
                    if (tiltResult.wasTilted) {
                        finalAction = tiltResult.action;
                        finalAmount = tiltResult.amount;
                    }
                }
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // ─── MODULE 6: ENHANCED GTO CHAOS INJECTOR ───
        // Upgrades the flat 4% chaos to a multi-layered, street-aware, cooldown-suppressed system.
        // Street weights: higher on later streets (where exploiters focus).
        // Cooldown: 3-hand gap between chaos events prevents detectable chaos clustering.
        const chaosRateByStreet = { preflop: 0.02, flop: 0.04, turn: 0.05, river: 0.06 };
        const streetChaosRate = chaosRateByStreet[street] || 0.04;
        const handsSchaosState = chaosSuppressionMap.get(profileId) || { lastChaosHand: -99, handCounter: 0 };
        const handsSinceLastChaos = handsSchaosState.handCounter - handsSchaosState.lastChaosHand;
        const chaosOnCooldown = handsSinceLastChaos < 3; // Suppress for 3 hands after firing

        // Anti-bot mode fires chaos MORE (18%) to be completely unpredictable vs solvers
        const effectiveChaosRate = counterStrategy.mode === 'anti_bot' ? 0.18 : streetChaosRate;

        if (legalActions.length > 0 && !chaosOnCooldown && Math.random() < effectiveChaosRate) {
            console.debug(`[HorseBrain]  MODULE 6 CHAOS TRIGGERED! Street: ${street}, Mode: ${counterStrategy.mode}, Rate: ${(effectiveChaosRate * 100).toFixed(0)}%`);
            handsSchaosState.lastChaosHand = handsSchaosState.handCounter;
            chaosSuppressionMap.set(profileId, handsSchaosState);

            const aggroActions = legalActions.filter(a => a.type === 'raise' || a.type === 'bet' || a.type === 'all_in');

            if (aggroActions.length > 0) {
                const chaoticAction = aggroActions[Math.floor(Math.random() * aggroActions.length)];
                finalAction = chaoticAction.type;

                if (finalAction === 'raise' || finalAction === 'bet') {
                    // Bounded chaotic sizing: 33% to 150% of pot (more human-readable than min/max random)
                    const minFrac = 0.33;
                    const maxFrac = 1.50;
                    const chaosFrac = minFrac + Math.random() * (maxFrac - minFrac);
                    const chaosSize = Math.round(potSize * chaosFrac);
                    const min = chaoticAction.minAmount || bb * 2;
                    const max = chaoticAction.maxAmount || heroPlayer.stack;
                    finalAmount = Math.max(min, Math.min(max, chaosSize));
                }
            } else if (legalActions.some(a => a.type === 'call')) {
                finalAction = 'call';
            }
        }
    }

    // --- 5b. TOURNAMENT ADJUSTMENTS (Hold'em) ---
    // Apply ICM, stage, pay-jump, stack dynamics to the Hold'em decision
    if (engineState.tourneyState || engineState.tournament) {
        const tourneyAdj = applyTournamentAdjustments(
            { type: finalAction, amount: finalAmount || 0 },
            {
                tourneyState: engineState.tourneyState || engineState.tournament,
                stackBB, street, potSize, toCall, bb, numPlayers,
                position: mapPosition(heroPlayer.position || 'mp'),
                _handStrength: 50, // Will be refined by the tournament brain internally
            },
            legalActions
        );
        finalAction = tourneyAdj.type || finalAction;
        finalAmount = tourneyAdj.amount || finalAmount;
    }

    // --- 6. VALIDATE AGAINST LEGAL ACTIONS ---
    const validAction = validateAndClamp(finalAction, finalAmount, legalActions);

    // ─── MODULE 1: FREQUENCY OBFUSCATOR ───
    // Tracks each horse's action type frequencies per table. When over-exposed,
    // randomly tier-shifts 6-11% of the time so HUD tracking cannot lock down exact ranges.
    {
        if (!frequencyObfuscatorMap.has(tableId)) frequencyObfuscatorMap.set(tableId, new Map());
        const tableFreqMap = frequencyObfuscatorMap.get(tableId);
        if (!tableFreqMap.has(profileId)) tableFreqMap.set(profileId, { fold: 0, call: 0, raise: 0, lastObfuscatedHand: -99, handCount: 0 });
        const freq = tableFreqMap.get(profileId);
        freq.handCount++;
        const aType = validAction.type;
        if (aType === 'fold') freq.fold++;
        else if (aType === 'call' || aType === 'check') freq.call++;
        else if (aType === 'raise' || aType === 'bet' || aType === 'all_in') freq.raise++;

        // Obfuscation rate: 6% normally, 11% in stealth/anti_bot_stealth modes
        const obfStealth = counterStrategy.mode === 'stealth' || counterStrategy.mode === 'anti_bot_stealth';
        const obfRate = obfStealth ? 0.11 : 0.06;
        const handsSinceObf = freq.handCount - freq.lastObfuscatedHand;

        if (freq.handCount >= 5 && handsSinceObf >= 4 && Math.random() < obfRate) {
            const totalActions = Math.max(1, freq.fold + freq.call + freq.raise);
            const callFreqPct = freq.call / totalActions;
            const raiseFreqPct = freq.raise / totalActions;

            let obfType = validAction.type;
            if (callFreqPct > 0.55 && validAction.type === 'call') {
                if (legalActions.some(a => a.type === 'fold') && Math.random() < 0.5) obfType = 'fold';
                else if (legalActions.some(a => a.type === 'raise' || a.type === 'bet') && Math.random() < 0.5) obfType = 'raise';
            } else if (raiseFreqPct > 0.55 && (validAction.type === 'raise' || validAction.type === 'bet')) {
                if (legalActions.some(a => a.type === 'call') && Math.random() < 0.5) obfType = 'call';
            }

            if (obfType !== validAction.type) {
                console.debug(`[HorseBrain]  MODULE 1 OBFUSCATE: ${validAction.type}→${obfType} (mode=${counterStrategy.mode}, callFreq=${(callFreqPct * 100).toFixed(0)}%)`);
                const newValid = validateAndClamp(obfType, null, legalActions);
                validAction.type = newValid.type;
                if (newValid.amount != null) validAction.amount = newValid.amount;
                else delete validAction.amount;
                freq.lastObfuscatedHand = freq.handCount;
            }
        }
    }

    // ─── MODULE 2: BET SIZE NOISE INJECTOR ───
    // ±10% (standard) or ±15% (stealth/anti_bot) jitter on all bet/raise amounts
    // so opponents cannot reverse-engineer hand equity from recurring GTO sizing patterns.
    if ((validAction.type === 'raise' || validAction.type === 'bet') && validAction.amount != null) {
        const noiseLA = legalActions.find(a => a.type === validAction.type);
        if (noiseLA) {
            const maxJitter = (counterStrategy.mode === 'stealth' || counterStrategy.mode === 'anti_bot' || counterStrategy.mode === 'anti_bot_stealth') ? 0.15 : 0.10;
            const jitter = 1 + (Math.random() * 2 - 1) * maxJitter;
            const noisedAmt = Math.round(validAction.amount * jitter);
            const noiseMin = noiseLA.minAmount || 0;
            const noiseMax = noiseLA.maxAmount || noisedAmt;
            validAction.amount = Math.max(noiseMin, Math.min(noiseMax, noisedAmt));
        }
    }

    // --- 6. COMPUTE TIMING DELAY (Phase 3A #8 - Personality Timing Tells) ---
    let delayMs;

    let usedAdvancedTiming = false;
    try {
        const adv = await getAdvancedModule();
        if (adv?.getActionDelay) {
            // Use personality timing tells from Advanced module
            delayMs = adv.getActionDelay(profileId, handType);
            usedAdvancedTiming = true;
        } else {
            delayMs = getActionDelay(profileId, validAction.type, street === 'preflop');
        }
    } catch (_) {
        delayMs = getActionDelay(profileId, validAction.type, street === 'preflop');
    }

    // Only apply preflop speedup if we used the basic delay (Advanced module already accounts for it)
    if (!usedAdvancedTiming && street === 'preflop') delayMs *= 0.7;

    // Bug #157: Add angle-shoot entropy to Hold'em delays (was only applied to PLO at line 14953)
    delayMs += angleTell.extraEntropyMs;

    // Clamp to human-realistic range
    delayMs = Math.round(Math.max(800, Math.min(7000, delayMs)));

    // --- TIMEBANK: Horses use the VIP Timebank system like all VIP members ---
    // Horses are Lifetime VIP - they have a real timebank balance in ActionTimer.
    // The ActionTimer itself manages when to auto-activate timebank (when main time expires).
    // We do NOT inject artificial extra time here. The engine's VIP timebank does this
    // automatically when the horse legitimately runs low on its main turn clock.
    // Note: Horse VIP timebank balance is set to VIP_LIFETIME seconds at seat-in time.

    // --- GIF EMOTE for All-In moments (words only in chat) ---
    const actionAmount = validAction.amount || finalAmount || 0;
    const isAllIn = validAction.type === 'all_in' || actionAmount >= bb * 50;

    if (isAllIn && Math.random() < 0.35) { // 35% chance to react when all-in
        // Two separate channels:
        // 1. Chat: words-only encouragement/trash talk
        // 2. GIF: a table_gif event for a visual reaction
        const chatPhrases = ['GL GL', 'Good luck everyone', 'Let\'s go', 'All day baby', 'Run good', 'Praying for a good run', 'Here we go'];
        const chatMsg = chatPhrases[Math.floor(Math.random() * chatPhrases.length)];
        chatMessages.push({
            playerId: profileId,
            message: chatMsg,
            type: 'chat'
        });

        // Also queue a GIF event (50% chance when already emoting)
        if (Math.random() < 0.5) {
            const gifTags = ['poker', 'good luck', 'all in', 'nervous', 'lets go', 'chips'];
            const gifTag = gifTags[Math.floor(Math.random() * gifTags.length)];
            chatMessages.push({
                playerId: profileId,
                message: gifTag,
                type: 'gif' // GameController will broadcast this as a `table_gif` event
            });
        }
        console.debug(`[HorseBrain]  All-In emote triggered for ${profileId.substring(0, 8)}: "${chatMsg}"`);
    }

    // --- Record performance stats (#34) ---
    recordPerformanceAction(profileId, street, validAction.type, validAction.type !== 'fold' && validAction.type !== 'check');

    // --- Record multi-street action for narrative tracking ---
    const handIdForMemory = engineState.handId || engineState.handNumber || `${tableId}_${Date.now()}`;
    {
        let memStrength = 50;
        try {
            if (street !== 'preflop') {
                memStrength = evaluatePostflopHand(holeCardStrings, boardStrings).strength;
            } else {
                memStrength = getPreflopStrength(handStr);
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        recordStreetAction(profileId, handIdForMemory, street, validAction.type, validAction.amount || null, memStrength);
    }

    return { action: validAction, delayMs };
}

/**
 * Validate the chosen action against legal actions and clamp amounts.
 * @param {string} actionType - Desired action type
 * @param {number|null} amount - Desired amount
 * @param {Array} legalActions - Legal actions from engine
 * @returns {Object} Valid engine action { type, amount? }
 */
function validateAndClamp(actionType, amount, legalActions) {
    if (!Array.isArray(legalActions) || legalActions.length === 0) return { type: 'fold', amount: 0 }; // Bug #45: guard null/empty legalActions
    const actionTypes = new Set(legalActions.map(a => a.type));

    // Map 'bet' to 'raise' or vice versa if needed
    if (actionType === 'bet' && !actionTypes.has('bet') && actionTypes.has('raise')) {
        actionType = 'raise';
    }
    if (actionType === 'raise' && !actionTypes.has('raise') && actionTypes.has('bet')) {
        actionType = 'bet';
    }

    // Check/fold substitution
    // BUG #26 FIX: When the brain chose 'check', it means "don't commit chips" or "pot control".
    // If check isn't available (facing a bet), the safe default is FOLD, not call.
    // The brain should have handled the facing-bet case properly upstream — if we're here
    // it means something went wrong, and calling blind is worse than folding.
    if (actionType === 'check' && !actionTypes.has('check')) {
        actionType = 'fold';
    }
    if (actionType === 'call' && !actionTypes.has('call')) {
        actionType = actionTypes.has('check') ? 'check' : 'fold';
    }
    // BUG #29 FIX: NEVER fold when check is available. Folding for free is a strict
    // dominance violation — checking is always >= folding in EV. If the brain said 'fold'
    // but check is legal, something went wrong upstream. Safe default: check.
    if (actionType === 'fold' && actionTypes.has('check')) {
        actionType = 'check';
    }

    // Handle 'all_in' — find the engine's all_in legal action
    if (actionType === 'all_in') {
        const allInAction = legalActions.find(a => a.type === 'all_in');
        if (allInAction) {
            return { type: 'all_in', amount: allInAction.amount };
        }
        // No explicit all_in available — use max raise as all-in
        const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
        if (raiseAction && raiseAction.maxAmount) {
            return { type: raiseAction.type, amount: raiseAction.maxAmount };
        }
        // Last resort: call if possible, else fold
        if (actionTypes.has('call')) return { type: 'call' };
        return { type: actionTypes.has('check') ? 'check' : 'fold' };
    }

    // If action still not legal, pick the safest legal action
    // BUG #41 FIX: When brain wanted raise/bet but it's not available, fall back to CALL
    // before fold. The brain wanted aggression — folding is the worst fallback.
    // Old code: check → fold (skipped call entirely when raise was unavailable).
    if (!actionTypes.has(actionType)) {
        // If brain wanted aggression (raise/bet), try call first
        if ((actionType === 'raise' || actionType === 'bet') && actionTypes.has('call')) {
            return { type: 'call' };
        }
        if (actionTypes.has('check')) return { type: 'check' };
        if (actionTypes.has('call')) return { type: 'call' };
        if (actionTypes.has('fold')) return { type: 'fold' };
        // Last resort: first legal action
        return { type: legalActions[0]?.type || 'fold' };
    }

    // Clamp amount for bet/raise
    // ═══ Phase 38B FIX: NaN guard — NaN bypasses < min and > max checks, reaching the engine as NaN ═══
    if (actionType === 'raise' || actionType === 'bet') {
        const raiseAction = legalActions.find(a => a.type === actionType);
        if (raiseAction) {
            const min = raiseAction.minAmount || 0;
            const max = raiseAction.maxAmount || Infinity;

            if (amount == null || isNaN(amount) || amount < min) {
                amount = min;
            } else if (amount > max) {
                // Over max = all-in
                amount = max;
            }
            return { type: actionType, amount: Math.round(amount) };
        }
    }

    // Actions without amounts
    return { type: actionType };
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    getDecision,
    validateAndClamp,
    shouldAutoSeat,
    setRouterLiveReadFn,
};
