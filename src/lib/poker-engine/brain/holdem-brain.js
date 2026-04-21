/**
 * brain/holdem-brain.js — Hold'em decision engine
 *
 * This module owns all Texas Hold'em-specific logic:
 *   - makeFallbackDecision()  — main Hold'em heuristic decision engine
 *   - evaluatePostflopHand()  — postflop hand strength evaluator
 *   - makeFlopHeuristicDecision()  — flop-specific heuristics
 *   - makeTurnRiverHeuristicDecision()  — turn/river heuristics
 *   - Board analysis, SPR, bet sizing, exploit, tilt, etc.
 *
 * Dependencies:
 *   - core.js: getHash, getPreflopStrength, getPersonalityModule, getAdvancedModule, chatMessages, RANK_ORDER
 *   - anti-exploit.js: selectCounterStrategy, detectReverseImplied, getOpponentSessionRead,
 *                       recordStreetAction, getStreetMemory, analyzeStreetNarrative
 *   - session-analytics.js: getAdaptiveStrategy, getPerformanceStats
 *   - Legacy (live observer): getLiveRead (not yet extracted)
 *
 * Bug fixes applied: #46, #57, #77, #80, #93, #114, #124, #127, #130, #140
 */

const { getHash, getPreflopStrength, getPersonalityModule, getAdvancedModule, chatMessages, RANK_ORDER } = require('./core');
const { selectCounterStrategy, detectReverseImplied, getOpponentSessionRead, recordStreetAction, getStreetMemory, analyzeStreetNarrative } = require('./anti-exploit');
const { getAdaptiveStrategy, getPerformanceStats } = require('./session-analytics');

// Alias: monolith used RANKS, core.js exports RANK_ORDER — they are identical arrays
const RANKS = RANK_ORDER;

// Live observer is not yet extracted — stub with safe fallback
let _getLiveRead = null;
function setLiveReadFn(fn) { _getLiveRead = fn; }
function getLiveRead(horseId, tableId, opponentId) {
    if (_getLiveRead) return _getLiveRead(horseId, tableId, opponentId);
    return null; // Safe fallback — no live read available
}

// Module-scope variable aliases for personality/advanced modules
let _personalityModule = null;
try { _personalityModule = getPersonalityModule(); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
let _advancedModule = null;
try { _advancedModule = getAdvancedModule(); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

function makeFallbackDecision(profileId, gameState, legalActions, opponentAdjustment = { callMod: 0, foldMod: 0 }) {
    if (!gameState || typeof gameState !== 'object') return { type: 'fold', amount: 0 }; // Bug #46: guard null/garbage gameState
    if (!Array.isArray(legalActions) || legalActions.length === 0) return { type: 'fold', amount: 0 };
    const { position, street, potSize, toCall, stackBB, bb = 2, holeCards: hCards, board: bCards, tableId = 'unknown', primaryOppId = null } = gameState;
    const handStr = gameState.handStr || (hCards && hCards.length >= 2 ? require('./core').formatHandString(hCards[0], hCards[1]) : '');
    const hash = getHash(profileId);
    const numPlayers = gameState.numPlayers || 2;

    // ═══ ALWAYS-ON: Live observer read for preflop exploit adjustments ═══
    const preflopLiveRead = primaryOppId ? getLiveRead(profileId, tableId, primaryOppId) : null;
    const preflopLiveConf = preflopLiveRead?.confidence || 0;
    if (preflopLiveRead && preflopLiveConf >= 0.10 && street === 'preflop') {
        console.debug(`[HorseBrain]  PREFLOP LIVE: ${primaryOppId?.substring(0, 8)} 3bet=${preflopLiveRead.threeBetPct !== null ? Math.round(preflopLiveRead.threeBetPct * 100) + '%' : '?'} foldTo3b=${preflopLiveRead.foldToThreeBetPct !== null ? Math.round(preflopLiveRead.foldToThreeBetPct * 100) + '%' : '?'} pfr=${preflopLiveRead.pfrPct !== null ? Math.round(preflopLiveRead.pfrPct * 100) + '%' : '?'} foldSteal=${preflopLiveRead.foldToStealPct !== null ? Math.round(preflopLiveRead.foldToStealPct * 100) + '%' : '?'} type=${preflopLiveRead.playerType} conf=${Math.round(preflopLiveConf * 100)}%`);
    }

    // ═══ UPGRADED: Use real personality module for play style if available ═══
    // Fallback to hash-based biases only if personality module isn't loaded
    let loosenessBias = (hash % 20) - 10; // -10 to +9 (default)
    let aggressionBias = ((hash >> 4) % 20) - 10; // (default)
    try {
        if (_personalityModule) {
            const style = _personalityModule.getPlayStyle?.(profileId);
            if (style?.key) {
                // Map real play styles to concrete bias values
                const styleLooseness = {
                    TAG: -3, nit: -15, LAG: 8, maniac: 15, calling_station: 10
                };
                const styleAggression = {
                    TAG: 5, nit: -10, LAG: 12, maniac: 18, calling_station: -8
                };
                loosenessBias = styleLooseness[style.key] ?? loosenessBias;
                aggressionBias = styleAggression[style.key] ?? aggressionBias;
            }
            // Also factor in skill tier — higher skill = tighter, more accurate decisions
            const skillTier = _personalityModule.getSkillTier?.(profileId);
            if (skillTier?.level) {
                // Skill levels 1-5: fish makes more mistakes, crusher plays near-GTO
                const skillTightness = { 1: -8, 2: -4, 3: 0, 4: 3, 5: 6 };
                loosenessBias -= (skillTightness[skillTier.level] || 0);
            }
        }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    // Legal action types
    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  PREFLOP DECISION ENGINE — UPGRADED WITH POSITION-AWARE RANGES    ║
    // ║  + 3-Bet Strategy + Deep Stack + Personality-Driven Aggression    ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    if (street === 'preflop') {
        const baseStrength = getPreflopStrength(handStr);

        // ═══ UPGRADED: Position bonuses now much more differentiated ═══
        // BTN gets massive bonus (widest range), UTG gets penalty (tightest range)
        // This creates proper position-aware opening ranges
        const positionBonus = {
            BTN: 18,  // Widest opens — steal equity + IP advantage
            CO: 12,   // Wide but not as wide as BTN
            HJ: 6,    // Standard
            MP: 2,    // Tighter than HJ
            UTG: -5,  // Tightest — negative bonus = penalty for early position
            SB: 7,    // SB gets some bonus (steal blind) but OOP penalty postflop
            BB: 10    // BB gets bonus for closing action + pot odds
        };

        // ═══ UPGRADED: Different open thresholds by position ═══
        // A hand like KTo should open BTN but fold UTG
        const openThresholds = {
            BTN: 45, CO: 52, HJ: 58, MP: 62, UTG: 68, SB: 50, BB: 40
        };
        const openThreshold = openThresholds[position] || 55;

        // Deep stack adjustment (#31)
        const deepAdj = getDeepStackAdjustment(stackBB);
        const suitedBonus = handStr.endsWith('s') ? deepAdj.suitedBonus : 0;
        const impliedBonus = (baseStrength < 50 && deepAdj.widenRange) ? deepAdj.impliedOddsBonus : 0;

        // ═══ UPGRADED: Connectors get implied odds bonus in position ═══
        const isConnector = handStr.length >= 3 && Math.abs(RANKS.indexOf(handStr[0]) - RANKS.indexOf(handStr[1])) <= 2;
        const connectorBonus = isConnector && (position === 'BTN' || position === 'CO') && stackBB >= 50 ? 5 : 0;

        // Adaptive strategy adjustment (#35)
        const adaptive = getAdaptiveStrategy(profileId);

        const adjustedStrength = baseStrength + (positionBonus[position] || 0) + loosenessBias + suitedBonus + impliedBonus + connectorBonus + adaptive.rangeAdjust;

        // Push/fold mode for short stacks (now uses Nash-like thresholds)
        if (stackBB <= 12) {
            // Nash push/fold: wider in late position, tighter early
            const pushThreshold = stackBB <= 6
                ? (position === 'BTN' || position === 'SB' ? 30 : position === 'CO' ? 40 : 50)
                : (position === 'BTN' || position === 'SB' ? 40 : position === 'CO' ? 48 : 55);
            if (canRaise && adjustedStrength >= pushThreshold) return { type: 'all_in' };
            if (canCheck) return { type: 'check' };
            return { type: 'fold' };
        }

        // ═══ FACING A RAISE? 3-BET / 4-BET / FLAT / FOLD DECISION ═══
        if (toCall > bb * 2 && canRaise) {
            const raiseSize = toCall / bb; // Size of the raise in BBs

            // ═══ LIVE DATA: Opponent 3-bet tendencies for preflop adjustments ═══
            let opp3BetPctLive = null;
            let oppFoldTo3BetLive = null;
            let oppAvgPFRSizeLive = null;
            let oppPreflopExploits = [];
            if (preflopLiveRead && preflopLiveConf >= 0.10) {
                opp3BetPctLive = preflopLiveRead.threeBetPct;
                oppFoldTo3BetLive = preflopLiveRead.foldToThreeBetPct;
                oppAvgPFRSizeLive = preflopLiveRead.avgPreflopRaise;
                oppPreflopExploits = preflopLiveRead.exploits || [];
            }

            // ═══ FACING A 3-BET (raise was 8-15 BB = likely a 3-bet over our open) ═══
            if (raiseSize >= 7 && raiseSize <= 20) {

                // ═══ LIVE EXPLOIT: Adjust thresholds based on opponent's 3-bet frequency ═══
                // Over-3-bettor (>12%): widen 4-bet range, tighten flat range
                // Tight 3-bettor (<5%): respect 3-bet more, fold wider
                let fourBetThreshold = 90;     // Base: QQ+, AKs
                let fourBetBluffFloor = 40;    // Base: suited Ax, SC minimum
                let fourBetBluffFreq = 0.12 + aggressionBias / 60;
                let flatCallFloor = 75;        // Base: JJ, TT, AQs
                let foldThreshold = 75;        // Below this = fold

                if (opp3BetPctLive !== null && preflopLiveConf >= 0.15) {
                    if (opp3BetPctLive > 0.12) {
                        // Opponent over-3-bets → widen 4-bet for value + bluff
                        fourBetThreshold = 85;           // Now include JJ, AKo
                        fourBetBluffFreq += 0.08;        // 4-bet bluff more
                        fourBetBluffFloor = 35;          // Wider bluff combos
                        flatCallFloor = 70;              // Flat wider (TT, AJs)
                        foldThreshold = 70;              // Fold less
                    } else if (opp3BetPctLive > 0.09) {
                        // Slightly loose 3-bettor → minor widening
                        fourBetThreshold = 88;
                        fourBetBluffFreq += 0.04;
                        flatCallFloor = 72;
                        foldThreshold = 72;
                    } else if (opp3BetPctLive < 0.05) {
                        // Very tight 3-bettor → 3-bet = AA-QQ, AK → respect heavily
                        fourBetThreshold = 93;           // Only KK+ 4-bet
                        fourBetBluffFreq *= 0.3;         // Almost never 4-bet bluff
                        flatCallFloor = 80;              // Only flat QQ, AKo
                        foldThreshold = 80;              // Fold more — they have it
                    } else if (opp3BetPctLive < 0.07) {
                        // Tight 3-bettor → slightly more respect
                        fourBetThreshold = 91;
                        fourBetBluffFreq *= 0.6;
                        flatCallFloor = 77;
                        foldThreshold = 77;
                    }
                }

                // ═══ LIVE EXPLOIT: Sizing tell on 3-bet size ═══
                if (oppAvgPFRSizeLive && preflopLiveConf >= 0.20) {
                    // If opponent uses larger-than-normal 3-bet → they're polarized → fold marginal
                    if (raiseSize > oppAvgPFRSizeLive * 1.4) {
                        foldThreshold += 3;  // Bigger 3-bet = stronger range
                    }
                    // If opponent uses min-3-bet → they're often merged/wide → widen defense
                    else if (raiseSize < oppAvgPFRSizeLive * 0.8) {
                        foldThreshold -= 3;
                        flatCallFloor -= 3;
                    }
                }

                // ═══ LIVE POSITION STATS: Adjust based on raiser's position tendencies ═══
                if (preflopLiveRead && preflopLiveRead.positionStats && preflopLiveConf >= 0.15) {
                    const posOrder = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];
                    for (const pos of posOrder) {
                        if (pos === position) break;
                        const pd = preflopLiveRead.positionStats[pos];
                        if (pd && pd.hands >= 3) {
                            const oppPosPFR = pd.pfr / pd.hands;
                            if (oppPosPFR < 0.12) { foldThreshold += 4; flatCallFloor += 4; fourBetBluffFreq *= 0.3; }
                            else if (oppPosPFR < 0.18) { foldThreshold += 2; flatCallFloor += 2; }
                            else if (oppPosPFR > 0.35) { foldThreshold -= 4; flatCallFloor -= 4; fourBetBluffFreq += 0.06; }
                            else if (oppPosPFR > 0.25) { foldThreshold -= 2; flatCallFloor -= 2; }
                            break;
                        }
                    }
                }

                // 4-bet with premium hands
                if (adjustedStrength >= fourBetThreshold) {
                    const fourBetSize = Math.round(toCall * 2.2);
                    const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(fourBetSize, raiseAction?.maxAmount || fourBetSize));
                    return { type: raiseAction.type, amount: clamped };
                }
                // 4-bet bluff occasionally with strong suited hands
                if (adjustedStrength >= fourBetBluffFloor && adjustedStrength < 55 && handStr.endsWith('s') && stackBB >= 50) {
                    if (Math.random() < Math.min(0.30, fourBetBluffFreq)) {
                        const fourBetBluff = Math.round(toCall * 2.2);
                        const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(fourBetBluff, raiseAction?.maxAmount || fourBetBluff));
                        return { type: raiseAction.type, amount: clamped };
                    }
                }
                // Flat call with strong hands that play well postflop
                if (adjustedStrength >= flatCallFloor && adjustedStrength < fourBetThreshold && canCall) {
                    return { type: 'call' };
                }
                // Fold everything else vs 3-bet
                if (adjustedStrength < foldThreshold) {
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }

            // ═══ FACING A 4-BET / 5-BET (raise > 20 BB) ═══
            if (raiseSize > 20) {
                // Only continue with premium (KK+, AKs)
                if (adjustedStrength >= 92 && canRaise) {
                    return { type: 'all_in' }; // Jam vs 4-bet with premiums
                }
                if (adjustedStrength >= 85 && canCall) {
                    return { type: 'call' }; // Flat QQ, AKo vs 4-bet
                }
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }

            // ═══ SQUEEZE PLAY — 3-bet after raise + caller(s) ═══
            // A squeeze is a 3-bet when there's a raise and 1+ callers behind.
            // Dead money from callers makes this extremely profitable.
            // Detect callers by pot size: raise to ~3bb + callers = pot > ~8bb
            const estimatedCallers = Math.max(0, Math.round((potSize / bb - toCall / bb - 1.5) / (toCall / bb)));
            if (estimatedCallers >= 1 && raiseSize >= 2 && raiseSize <= 7) {
                // Squeeze spots: late position or blinds with wider range
                const isSqueezePosition = position === 'BTN' || position === 'CO' || position === 'SB' || position === 'BB';
                if (isSqueezePosition && stackBB >= 25) {
                    let squeezeThreshold = 55; // Base: need decent hand
                    // From blinds, squeeze tighter (we'll be OOP)
                    if (position === 'SB' || position === 'BB') squeezeThreshold = 62;
                    // With more callers, more dead money → squeeze wider
                    if (estimatedCallers >= 2) squeezeThreshold -= 5;
                    // Aggressive horses squeeze wider
                    squeezeThreshold -= aggressionBias / 3;

                    // ═══ LIVE EXPLOIT: Opponent fold-to-3-bet adjusts squeeze profitability ═══
                    if (oppFoldTo3BetLive !== null && preflopLiveConf >= 0.15) {
                        if (oppFoldTo3BetLive > 0.70) {
                            squeezeThreshold -= 8; // They fold a ton → squeeze much wider
                        } else if (oppFoldTo3BetLive > 0.60) {
                            squeezeThreshold -= 4;
                        } else if (oppFoldTo3BetLive < 0.35) {
                            squeezeThreshold += 5; // They rarely fold → squeeze tighter for value
                        }
                    }

                    if (adjustedStrength >= squeezeThreshold && canRaise) {
                        // Squeeze sizing: bigger than standard 3-bet (3.5-4.5x raise + 1x per caller)
                        let squeezeMult = 3.5;
                        // ═══ PHASE 17: LIVE-READ DRIVEN SQUEEZE SIZING ═══
                        // Against over-folders: smaller squeeze (save chips, same fold equity)
                        // Against calling stations: bigger squeeze (charge them)
                        if (oppFoldTo3BetLive !== null && preflopLiveConf >= 0.15) {
                            if (oppFoldTo3BetLive > 0.65) squeezeMult = 3.0; // Smaller — they fold anyway
                            else if (oppFoldTo3BetLive < 0.40) squeezeMult = 4.0; // Bigger — charge them
                        }
                        const squeezeBBs = (toCall / bb) * squeezeMult + estimatedCallers * (toCall / bb) * 0.5;
                        const squeezeSize = Math.round(bb * squeezeBBs);
                        const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(squeezeSize, raiseAction?.maxAmount || squeezeSize));
                        // Squeeze frequency: not every time (balance)
                        let squeezeFreq = adjustedStrength >= 80 ? 0.90 : 0.40 + aggressionBias / 30;
                        // 4-bet bluff component for aggressive horses with suited hands
                        if (adjustedStrength < squeezeThreshold + 10 && handStr.endsWith('s')) {
                            squeezeFreq = 0.25 + aggressionBias / 40;
                        }
                        // ═══ LIVE EXPLOIT: Bump squeeze freq if opponent overfolds to 3-bet ═══
                        if (oppFoldTo3BetLive !== null && oppFoldTo3BetLive > 0.65 && preflopLiveConf >= 0.15) {
                            squeezeFreq += 0.12;
                        }
                        squeezeFreq = Math.max(0.10, Math.min(0.85, squeezeFreq));
                        if (Math.random() < squeezeFreq) {
                            return { type: raiseAction.type, amount: clamped };
                        }
                    }
                }
            }

            // ═══ FACING A STANDARD RAISE (2-7 BB) ═══
            const threeBet = get3BetStrategy(position, adjustedStrength, toCall, bb, stackBB);
            let should3Bet = threeBet.should3Bet;

            // ═══ LIVE EXPLOIT: Opponent fold-to-3-bet drives 3-bet bluff frequency ═══
            if (oppFoldTo3BetLive !== null && preflopLiveConf >= 0.15) {
                if (oppFoldTo3BetLive > 0.70 && !should3Bet && adjustedStrength >= 35 && handStr.endsWith('s')) {
                    // They fold >70% to 3-bets → 3-bet bluff wider with suited hands
                    if (Math.random() < 0.30 + aggressionBias / 40) should3Bet = true;
                } else if (oppFoldTo3BetLive > 0.60 && !should3Bet && adjustedStrength >= 45) {
                    // They fold >60% → 3-bet semi-light
                    if (Math.random() < 0.18) should3Bet = true;
                }
            }

            // ═══ LIVE EXPLOIT: Opponent over-3-bets us → we flat more, 3-bet less as bluff ═══
            if (opp3BetPctLive !== null && opp3BetPctLive > 0.12 && preflopLiveConf >= 0.15) {
                // They 3-bet a lot → our 3-bets get 4-bet more → reduce light 3-bets
                if (should3Bet && adjustedStrength < 60 && Math.random() < 0.30) {
                    should3Bet = false; // Trap instead — flat and play postflop
                }
            }

            if (should3Bet) {
                let amount = Math.max(raiseAction?.minAmount || toCall * 2.5, threeBet.size3Bet);

                // ═══ PHASE 17: LIVE-READ DRIVEN 3-BET SIZING ═══
                // Adjust 3-bet size based on opponent's fold-to-3-bet and calling tendencies.
                // Core principle: size for max EV — smaller when they always fold, bigger when they call wide.
                if (preflopLiveRead && preflopLiveConf >= 0.15) {
                    if (oppFoldTo3BetLive !== null) {
                        if (oppFoldTo3BetLive > 0.70) {
                            // They fold 70%+ → use MINIMUM sizing (save chips, same fold equity)
                            amount = Math.max(raiseAction?.minAmount || toCall * 2.5, Math.round(toCall * 2.8));
                        } else if (oppFoldTo3BetLive > 0.55) {
                            // Standard fold rate → standard sizing
                            // No adjustment needed
                        } else if (oppFoldTo3BetLive < 0.40) {
                            // They rarely fold → SIZE UP for max value when we have it
                            if (!threeBet.isBluff3Bet) {
                                amount = Math.round(amount * 1.15); // 15% bigger
                            }
                            // If bluff 3-betting into a caller → save chips with smaller size
                            if (threeBet.isBluff3Bet) {
                                amount = Math.max(raiseAction?.minAmount || toCall * 2.5, Math.round(toCall * 2.7));
                            }
                        }
                    }
                    // Against frequent 4-bettors: smaller 3-bet sizing (reduces loss when they 4-bet)
                    if (opp3BetPctLive !== null && opp3BetPctLive > 0.12) {
                        amount = Math.round(amount * 0.90);
                    }
                }

                const clamped = Math.min(amount, raiseAction?.maxAmount || amount);
                return { type: raiseAction.type, amount: Math.round(clamped) };
            }
            // ═══ UPGRADED: Flat call range with implied odds hands (suited connectors, small pairs) ═══
            let flatFloor = 35;
            // ═══ LIVE EXPLOIT: vs tight raiser → tighter flat range; vs loose → wider flats ═══
            if (preflopLiveRead && preflopLiveConf >= 0.15) {
                if (preflopLiveRead.pfrPct !== null && preflopLiveRead.pfrPct < 0.10) {
                    flatFloor = 42; // Tight raiser → need stronger hand to flat
                } else if (preflopLiveRead.pfrPct !== null && preflopLiveRead.pfrPct > 0.22) {
                    flatFloor = 30; // Loose raiser → flat wider, dominate them postflop
                }
            }
            if (adjustedStrength >= flatFloor && adjustedStrength < openThreshold && stackBB >= 30) {
                const isSpeculative = handStr.endsWith('s') || RANKS.indexOf(handStr[0]) === RANKS.indexOf(handStr[1]);
                if (isSpeculative && canCall) return { type: 'call' };
            }
        }

        // ═══ LIVE EXPLOIT: Blind steal adjustments ═══
        // If opponent in blinds overfolds to steals → widen open range from late position
        if (preflopLiveRead && preflopLiveConf >= 0.15 && (position === 'BTN' || position === 'CO' || position === 'SB')) {
            if (preflopLiveRead.foldToStealPct !== null && preflopLiveRead.foldToStealPct > 0.70) {
                // They overfold blinds → steal wider (lower open threshold by 8)
                if (adjustedStrength >= openThreshold - 8 && adjustedStrength < openThreshold && canRaise && toCall <= bb) {
                    const stealSize = Math.round(bb * (position === 'SB' ? 3.0 : 2.3));
                    const clamped = Math.max(raiseAction?.minAmount || bb * 2, Math.min(stealSize, raiseAction?.maxAmount || stealSize));
                    if (Math.random() < 0.55 + aggressionBias / 40) {
                        return { type: raiseAction.type, amount: clamped };
                    }
                }
            }
            // If opponent defends blinds aggressively (low foldToSteal) → tighten steals
            if (preflopLiveRead.foldToStealPct !== null && preflopLiveRead.foldToStealPct < 0.35) {
                if (adjustedStrength >= openThreshold && adjustedStrength < openThreshold + 5 && canRaise && toCall <= bb) {
                    // Marginal opens become limps or folds vs aggressive blind defender
                    if (Math.random() < 0.35) {
                        if (canCall) return { type: 'call' };
                    }
                }
            }
        }

        // ═══ OPEN RAISE — POSITION + STACK-DEPTH AWARE SIZING ═══
        if (adjustedStrength >= 80 && canRaise) {
            // Premium: raise bigger for value, more from EP (where we have tighter range perception)
            // Also size up with limpers already in the pot
            const numLimpers = Math.max(0, Math.round((potSize / bb - 1.5) / 1)); // Approximate limper count
            const basePremiumSize = position === 'UTG' || position === 'MP' ? 3.0 : 2.5;
            const limperAdjust = numLimpers * 0.5; // +0.5 BB per limper
            const premiumBBs = basePremiumSize + limperAdjust + (Math.random() * 0.5 - 0.25); // Small noise
            const size = Math.round(bb * premiumBBs);
            const clamped = Math.max(raiseAction?.minAmount || bb * 2, Math.min(size, raiseAction?.maxAmount || size));
            return { type: raiseAction.type, amount: clamped };
        }
        if (adjustedStrength >= openThreshold) {
            const openFreq = 0.4 + aggressionBias / 30 + (position === 'BTN' ? 0.25 : position === 'CO' ? 0.15 : 0);
            if (canRaise && (toCall <= bb || Math.random() < openFreq)) {
                // ═══ POSITION-AWARE OPEN SIZING ═══
                // BTN: smaller (2.2x) because we're in position and want calls
                // SB: bigger (3.0x) because we're OOP and want folds or to build pot
                // EP: standard (2.5x) — balanced
                const numLimpers = Math.max(0, Math.round((potSize / bb - 1.5) / 1));
                const positionSize = { BTN: 2.2, CO: 2.3, HJ: 2.5, MP: 2.5, UTG: 2.5, SB: 3.0, BB: 3.0 };
                const openBBs = (positionSize[position] || 2.5) + (numLimpers * 0.5);
                const size = Math.round(bb * openBBs);
                const clamped = Math.max(raiseAction?.minAmount || bb * 2, Math.min(size, raiseAction?.maxAmount || size));
                return { type: raiseAction.type, amount: clamped };
            }
            if (canCall) return { type: 'call' };
            if (canCheck) return { type: 'check' };
        }
        // ═══ BLIND BATTLE STRATEGY — SB vs BB specialized decision tree ═══
        if ((position === 'SB' || position === 'BB') && numPlayers <= 2 && toCall <= bb * 1.5) {
            const oppRead = preflopLiveRead ? {
                foldToSteal: preflopLiveRead.foldToStealPct,
                threeBetPct: preflopLiveRead.threeBetPct,
                isPassive: preflopLiveRead.playerType === 'passive' || preflopLiveRead.playerType === 'nit',
                isAggressive: preflopLiveRead.playerType === 'LAG' || preflopLiveRead.playerType === 'maniac',
            } : null;
            const blindStrat = getBlindBattleStrategy(position, adjustedStrength, toCall, bb, stackBB, aggressionBias, oppRead);
            if ((blindStrat.action === 'raise' || blindStrat.action === '3bet' || blindStrat.action === '4bet') && canRaise) {
                const amt = Math.max(raiseAction?.minAmount || bb * 2, Math.min(Math.round(blindStrat.sizing || bb * 2.5), raiseAction?.maxAmount || blindStrat.sizing));
                return { type: raiseAction.type, amount: amt };
            }
            if (blindStrat.action === 'all-in' && canRaise) return { type: 'all_in' };
            if ((blindStrat.action === 'limp' || blindStrat.action === 'call') && canCall) return { type: 'call' };
            if (blindStrat.action === 'check' && canCheck) return { type: 'check' };
            if (blindStrat.action === 'fold') return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ═══ UPGRADED: Limp from SB with marginal hands, check BB ═══
        if (adjustedStrength >= 30 && toCall <= bb) {
            if (position === 'BB' && canCheck) return { type: 'check' };
            if (position === 'SB' && canCall && adjustedStrength >= 35) return { type: 'call' };
            if (canCheck) return { type: 'check' };
        }
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  POSTFLOP DECISION ENGINE (ALL Phase 4 features wired)            ║
    // ╚══════════════════════════════════════════════════════════════════════╝

    // Evaluate hand strength (#18)
    const handEval = evaluatePostflopHand(hCards, bCards);
    const boardWetness = evaluateBoardWetness(bCards);

    // SPR awareness (#24)
    const heroStack = stackBB * bb;
    const sprInfo = getSPRStrategy(heroStack, potSize);

    // Multiway adjustment (#25)
    // BUG #30 FIX: Was calling without opts — defaulted to BTN/flop/medium/non-aggressor
    // for ALL positions and streets. Now passes real position, street, and board wetness.
    const multiway = getMultiwayAdjustment(numPlayers, {
        position: position || 'BTN',
        street: street || 'flop',
        boardWetness: boardWetness, // Already a string: 'dry', 'medium', or 'wet'
        heroIsAggressor: toCall === 0 // If we're not facing a bet, we likely have the initiative
    });

    // Draw equity (#29)
    const drawEquity = getDrawEquity(handEval, street);

    // Adjusted strength = base + personality - multiway penalty
    const effectiveStrength = handEval.strength + aggressionBias - multiway.strengthPenalty;
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;

    // Is hero in position? (BTN, CO, HJ are generally IP postflop)
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(gameState.position);

    // ═══ ADVANCED MODULES: Range advantage + position strategy + multi-street plan ═══
    const wasPreAggressor_adv = gameState.wasAggressor || false;
    const rangeAdv = getRangeAdvantage(wasPreAggressor_adv ? 'raiser' : 'caller', bCards, street);
    const posStrat = getPositionStrategy(isIP, effectiveStrength, street, boardWetness, potSize, toCall, wasPreAggressor_adv, aggressionBias);
    const multiStreet = getMultiStreetPlan(effectiveStrength, drawEquity.outs, boardWetness, potSize, stackBB, isIP, street);

    // Short-stack postflop strategy override
    if (stackBB <= 25) {
        const shortStrat = getShortStackNLHEStrategy(stackBB, effectiveStrength, street, position, toCall, bb, potSize);
        if ((shortStrat.action === 'all-in' || shortStrat.isAllIn) && canRaise) return { type: 'all_in' };
        if (shortStrat.action === 'fold' && effectiveStrength < 35) {
            return canCheck ? { type: 'check' } : { type: 'fold' };
        }
        if (shortStrat.action === 'call' && canCall) return { type: 'call' };
    }

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  RIVER DECISION ENGINE — UPGRADED WITH BLUFF-CATCHING, THIN      ║
    // ║  VALUE, BLOCK BETS, AND OPPONENT-AWARE CALL/FOLD LOGIC           ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    if (street === 'river') {
        // ═══ Phase 39B FIX: add bluffAware adjustment (was relying on inverted callMod=5 for bluffers) ═══
        const foldThreshold = 35 + opponentAdjustment.foldMod - opponentAdjustment.callMod
            - (opponentAdjustment.bluffAware ? 5 : 0); // Call down more vs known bluffers
        const potOddsR = toCall > 0 ? toCall / (potSize + toCall) : 0;

        // ═══ ADVANCED: Blocker analysis for river decisions ═══
        const blockerInfo = getHoldemBlockerAnalysis(hCards, bCards, 'river');
        const oppReadRiver = preflopLiveRead ? {
            isAggressive: preflopLiveRead.playerType === 'LAG' || preflopLiveRead.playerType === 'maniac',
            isPassive: preflopLiveRead.playerType === 'passive' || preflopLiveRead.playerType === 'nit',
            bluffFreq: opponentAdjustment.bluffAware ? 0.40 : 0.20,
        } : null;

        // ═══ FACING A BET ON THE RIVER ═══
        if (toCall > 0) {
            // ═══ RIVER STRATEGY MODULE: Secondary opinion on facing-bet decisions ═══
            const betToPotR = toCall / Math.max(1, potSize);
            const oppTendR = opponentAdjustment.bluffAware ? 'bluffy'
                : opponentAdjustment.foldMod > 0 ? 'weak-tight'
                : opponentAdjustment.callMod > 0 ? 'calling-station' : 'balanced';
            const riverStratFacing = getRiverStrategy(effectiveStrength, potOddsR, false, true, aggressionBias, {
                boardWetness, oppTendency: oppTendR,
                oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
                hasBlockers: blockerInfo.calldownBonus >= 10,
                isIP, betToPot: betToPotR,
            });

            // ── BLUFF-CATCHING LOGIC ──
            // We need to call at the right frequency to prevent exploitation.
            // MDF (minimum defense frequency) = 1 - bet/(pot+bet) = pot/(pot+bet)
            const mdf = potSize / (potSize + toCall);
            const betToPotRatio = toCall / Math.max(1, potSize);

            // Monster hands: raise for value
            if (effectiveStrength >= 85 && canRaise) {
                const valueSizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, false, {
                    boardWetness, isInPosition: isIP, numPlayers, handStrength: effectiveStrength,
                    oppTendency: opponentAdjustment.bluffAware ? 'bluffy' : opponentAdjustment.foldMod > 0 ? 'weak-tight' : 'balanced',
                    oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
                    stackBB, isPolarized: true, liveRead: preflopLiveRead
                });
                const raiseAmt = Math.round(toCall + potSize * valueSizeFrac);
                const amt = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseAmt, raiseAction?.maxAmount || raiseAmt));
                return { type: raiseAction.type, amount: amt };
            }

            // Strong hands (top pair good kicker+): call
            if (effectiveStrength >= 55) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // ── BLUFF-CATCH with medium hands (30-55 strength) ──
            // ═══ ADVANCED: Use getBluffCatchStrategy for principled bluff-catching ═══
            if (effectiveStrength >= 30) {
                const bcStrat = getBluffCatchStrategy(effectiveStrength, potSize, toCall, 'river', numPlayers, blockerInfo, oppReadRiver);

                // Determine bluff-catch frequency based on hand strength and pot odds
                const bluffCatchEq = effectiveStrength / 100;
                const neededEquity = potOddsR;
                const oppIsBluffy = opponentAdjustment.bluffAware;

                // Bug #161: Wire MDF into bluff-catch. If we fold too much, opponent profits
                // by bluffing any two cards. Hands close to the fold threshold should
                // lean toward calling when random sample falls within MDF zone.
                const mdfCallBoost = bluffCatchEq < neededEquity && effectiveStrength >= foldThreshold - 8
                    && Math.random() < mdf * 0.15; // ~10-12% of marginal folds become calls

                // ═══ ADVANCED: Blocker-boosted calldown — if we block their value combos, call more ═══
                const blockerCallBoost = blockerInfo.calldownBonus > 0 && effectiveStrength >= foldThreshold - 3;

                // getRiverStrategy secondary opinion: if it says call, factor that in
                const riverModuleCall = riverStratFacing.action === 'call' || riverStratFacing.action === 'raise';

                // Call if: equity sufficient, MDF boost, opponent bluffy, bluff-catch module says call, blockers justify, or river module agrees
                if (bluffCatchEq >= neededEquity || mdfCallBoost || blockerCallBoost
                    || (oppIsBluffy && effectiveStrength >= foldThreshold - 5)
                    || bcStrat.shouldCall || riverModuleCall) {
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }

                // Overbet shoves = polarized → call with medium+ more often
                if (betToPotRatio >= 1.2 && effectiveStrength >= 40) {
                    // Large overbets are often polarized bluff/nuts — call wider
                    if (Math.random() < 0.40) {
                        return canCall ? { type: 'call' } : { type: 'fold' };
                    }
                }

                // Small bets = thin value or blocker bet → wider calling range
                if (betToPotRatio <= 0.35 && effectiveStrength >= 25) {
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
            }

            // Weak hands: fold
            return { type: 'fold' };
        }

        // ═══ NOT FACING A BET ON THE RIVER ═══

        // ═══ RIVER STRATEGY MODULE: Opponent-aware sizing and action framework ═══
        const oppTendencyRiver = opponentAdjustment.bluffAware ? 'bluffy'
            : opponentAdjustment.foldMod > 0 ? 'weak-tight'
            : opponentAdjustment.callMod > 0 ? 'calling-station' : 'balanced';
        const riverStrat = getRiverStrategy(effectiveStrength, potOdds, canRaise, false, aggressionBias, {
            boardWetness, oppTendency: oppTendencyRiver,
            oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
            hasBlockers: blockerInfo.bluffCandidateScore >= 25 || blockerInfo.calldownBonus >= 10,
            drawsCompleted: false, drawsBricked: false,
            isIP, betToPot: 0
        });

        // ═══ ADVANCED: Thin value + polarization strategy for river bet decisions ═══
        const thinVal = getThinValueStrategy(effectiveStrength, boardWetness, 'river', potSize, numPlayers, isIP, aggressionBias, oppReadRiver);
        const polarStrat = getPolarizationStrategy('river', effectiveStrength, boardWetness, rangeAdv.rangeAdvantage, potSize, isIP, oppReadRiver);

        // ── THIN VALUE BETTING (expanded with module) ──
        if (effectiveStrength >= 60 && canRaise) {
            // Strong hand: value bet
            const sizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, multiway.adjustSizing, {
                boardWetness, isInPosition: isIP, numPlayers, handStrength: effectiveStrength,
                oppTendency: opponentAdjustment.bluffAware ? 'bluffy' : opponentAdjustment.foldMod > 0 ? 'weak-tight' : 'balanced',
                oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
                stackBB, liveRead: preflopLiveRead
            });
            // Use polarization module to adjust sizing (polarized → bigger, merged → smaller)
            const isPolarized = polarStrat.strategy.startsWith('polarized');
            const isMerged = polarStrat.strategy.startsWith('merged');
            const polarAdj = isPolarized ? 1.15 : (isMerged ? 0.85 : 1.0);
            // Blend with getRiverStrategy sizing for opponent-aware calibration
            const riverStratSize = riverStrat.action === 'bet' && riverStrat.sizeFraction > 0 ? riverStrat.sizeFraction : sizeFrac;
            const blendedSize = (sizeFrac * 0.6 + riverStratSize * 0.4) * polarAdj;
            const betSize = Math.round(potSize * blendedSize);
            const amt = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
            return { type: raiseAction.type, amount: amt };
        }

        // ── THIN VALUE from module — bet with hands in the 45-60 range that have value vs calling range ──
        if (thinVal.shouldThinValue && effectiveStrength >= 45 && effectiveStrength < 60 && canRaise) {
            const thinSize = thinVal.betSize || Math.round(potSize * 0.40);
            const amt = Math.max(raiseAction?.minAmount || 1, Math.min(thinSize, raiseAction?.maxAmount || thinSize));
            return { type: raiseAction.type, amount: amt };
        }

        // ── BLOCK BETS with showdown-value hands ──
        if (effectiveStrength >= 40 && effectiveStrength < 60 && isIP && canRaise && Math.random() < 0.30) {
            // Block bet 25-33% pot to deny opponent a free showdown or a big bluff
            const blockSize = Math.round(potSize * (0.25 + Math.random() * 0.08));
            const amt = Math.max(raiseAction?.minAmount || 1, Math.min(blockSize, raiseAction?.maxAmount || blockSize));
            return { type: raiseAction.type, amount: amt };
        }

        // ── RIVER BLUFFS (blocker-aware) ──
        if (effectiveStrength < 20 && canRaise && aggressionBias > 5) {
            // ═══ ADVANCED: Use blocker analysis to pick best bluff candidates ═══
            let bluffFreq = 0.15 * multiway.bluffReduction;
            if (blockerInfo.bluffCandidateScore >= 30) bluffFreq += 0.10; // Blockers make bluff more profitable
            if (polarStrat.strategy.startsWith('polarized')) bluffFreq += 0.05; // Polarized strategy bluffs more
            if (Math.random() < bluffFreq) {
                // Bluff with air — larger sizing to maximize fold equity
                const bluffSize = Math.round(potSize * (polarStrat.strategy.startsWith('polarized') ? 0.75 : 0.60 + Math.random() * 0.20));
                const amt = Math.max(raiseAction?.minAmount || 1, Math.min(bluffSize, raiseAction?.maxAmount || bluffSize));
                return { type: raiseAction.type, amount: amt };
            }
        }

        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  FLOP/TURN DECISION ENGINE — UPGRADED WITH BOARD TEXTURE,         ║
    // ║  RIO GUARD, OPPONENT-AWARE C-BET, PROBE BET, DELAYED C-BET,      ║
    // ║  MULTI-STREET PLANNING, AND PROPER BARREL STRATEGY                ║
    // ╚══════════════════════════════════════════════════════════════════════╝

    // ═══ BOARD TEXTURE ANALYSIS (drives bet sizing and frequency) ═══
    const isDryBoard = boardWetness === 'dry';
    const isWetBoard = boardWetness === 'wet';
    // High cards on board reduce range advantage for PFR
    // ═══ Phase 39B FIX: was >= 10 (Q+) but comment said J+ — J is index 9, not 10 ═══
    const boardHighCards = (bCards || []).filter(c => RANKS.indexOf(c[0]) >= 9).length; // J+ = index 9+
    const boardIsPaired = bCards ? (() => {
        const br = bCards.map(c => c[0]);
        return new Set(br).size < br.length;
    })() : false;
    const boardIsMonotone = bCards ? (() => {
        const bs = bCards.map(c => c[1]);
        return new Set(bs).size === 1;
    })() : false;
    // ═══ BOARD CONNECTIVITY (new) ═══
    const boardIsConnected = bCards ? (() => {
        const br = bCards.map(c => RANKS.indexOf(c[0])).sort((a, b) => a - b);
        let connected = 0;
        for (let i = 1; i < br.length; i++) { if (br[i] - br[i - 1] <= 2) connected++; }
        return connected >= 2; // At least 2 close-rank cards = connected
    })() : false;
    // ═══ BOARD RANK PROFILE (new) ═══
    const boardIsLow = bCards ? bCards.every(c => RANKS.indexOf(c[0]) < 8) : false; // All cards below 8
    const boardIsHigh = boardHighCards >= 2; // 2+ broadway cards

    // ═══ MODULE 27: REVERSE IMPLIED ODDS GUARD (for fallback) ═══
    const fbRioGuard = drawEquity.outs > 0
        ? detectReverseImplied(drawEquity.outs, potOdds, stackBB, numPlayers, isWetBoard)
        : { shouldBlock: false };

    // ═══ OPPONENT READS FOR FLOP/TURN (reuse opponentAdjustment) ═══
    const oppOverfolds = opponentAdjustment.foldMod > 0;
    // ═══ Phase 39B FIX: was `callMod > 0 || callMod < -2` — callMod < -2 means TIGHT (doesn't call),
    //     not sticky. This made tight opponents incorrectly "sticky", preventing bluffs against them. ═══
    const oppIsSticky = opponentAdjustment.callMod > 0; // Calls too much (positive = station)
    const oppIsPassive = opponentAdjustment.callMod < 0 && opponentAdjustment.foldMod <= 0;

    // ── FLOP/TURN: NO BET TO FACE ──
    if (canCheck && toCall === 0) {
        // Check-raise strategy (#26) — OOP trapping with full board/opponent context
        const crStrat = getCheckRaiseStrategy(effectiveStrength, isIP, handEval.hasFlushDraw || handEval.hasOESD, aggressionBias, {
            street,
            boardWetness,
            boardIsPaired,
            numPlayers,
            oppTendency: opponentAdjustment.bluffAware ? 'bluffy'
                : opponentAdjustment.foldMod > 0 ? 'weak-tight'
                : opponentAdjustment.callMod > 0 ? 'calling-station'
                : 'balanced',
            oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
            oppCbetFreq: 0.60,
            handCategory: handEval.category
        });
        if (crStrat.shouldCheckRaise && Math.random() < crStrat.frequency) {
            return { type: 'check' };
        }

        // ═══ C-BET STRATEGY — WORLD-CLASS WITH OPPONENT + BOARD AWARENESS ═══
        const wasPreAggressor = gameState.wasAggressor || false;
        if (wasPreAggressor && street === 'flop') {
            const cbetStrat = getCBetStrategy(true, isIP, boardWetness, numPlayers);

            // ═══ OPPONENT-AWARE C-BET FREQUENCY ═══
            // Against over-folders: c-bet more with any two cards
            // Against calling stations: only c-bet for value
            let cbetFreqMod = 0;
            if (oppOverfolds) cbetFreqMod += 0.20; // Print money vs folders
            if (oppIsSticky) {
                // Against sticky callers, only c-bet with strong hands
                if (effectiveStrength < 50 && !handEval.hasFlushDraw && !handEval.hasOESD) {
                    return { type: 'check' }; // Don't c-bet bluff into a calling station
                }
                cbetFreqMod -= 0.10; // Less frequent, but bigger when we do
            }

            if ((cbetStrat.shouldCbet || cbetFreqMod > 0.15) && canRaise) {
                // ═══ SIZING BY BOARD TEXTURE + OPPONENT TYPE ═══
                let cbetFrac;
                if (isDryBoard) {
                    // Dry boards → small c-bet (25-33% pot) — high frequency, low cost
                    cbetFrac = boardIsPaired ? 0.25 : 0.33;
                    // Against sticky opponents on dry boards → use bigger sizing for value
                    if (oppIsSticky && effectiveStrength >= 55) cbetFrac = 0.50;
                } else if (boardIsMonotone) {
                    // Monotone: only bet strong hands, check back most draws
                    cbetFrac = effectiveStrength >= 60 ? 0.50 : 0;
                    if (cbetFrac === 0) return { type: 'check' };
                } else if (isWetBoard) {
                    // Wet boards → larger c-bet (55-75%) to deny equity
                    cbetFrac = effectiveStrength >= 55 ? 0.66 : 0.55;
                    // With strong draws on wet boards → bet bigger (we have equity even if called)
                    if (handEval.hasFlushDraw || handEval.hasOESD) cbetFrac = 0.60;
                } else {
                    cbetFrac = getOptimalBetSize(handEval.category, street, potSize, effectiveStrength < 30, {
                        boardWetness, isInPosition: isIP, numPlayers, handStrength: effectiveStrength,
                        heroIsAggressor: true, stackBB, liveRead: preflopLiveRead
                    });
                }

                // ═══ RANGE ADVANTAGE C-BET — module-driven ═══
                // Use getRangeAdvantage result to inform c-bet frequency and sizing
                if (rangeAdv.rangeAdvantage === 'hero') {
                    // Hero has range advantage → small sizing, high frequency
                    cbetFrac = Math.min(cbetFrac, 0.33);
                    cbetFreqMod += 0.15;
                } else if (rangeAdv.rangeAdvantage === 'villain') {
                    // Villain has range advantage → check more, larger sizing when we do bet
                    if (effectiveStrength < 50) {
                        return { type: 'check' };
                    }
                    cbetFrac = Math.max(cbetFrac, 0.55);
                }
                // Legacy fallback for low/unconnected boards
                if (boardIsLow && !boardIsConnected && !boardIsMonotone && rangeAdv.rangeAdvantage !== 'villain') {
                    cbetFrac = 0.25; // Tiny sizing, very high frequency
                    cbetFreqMod += 0.15;
                }
                // On high, connected boards → caller's range has equity → check more
                if (boardIsHigh && boardIsConnected) {
                    if (effectiveStrength < 50) {
                        return { type: 'check' }; // Give up c-bet on bad texture for our hand
                    }
                }

                const betSize = Math.round(potSize * cbetFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // ═══ FLOP DONK-BET (BB defense → lead into PFR) ═══
        // When we defended BB and the flop heavily favors our range, donk-bet
        // to seize initiative. This is a modern strategy used on boards like
        // 8-7-6, 5-5-3, 9-8-7 where BB's range connects heavily.
        if (!wasPreAggressor && street === 'flop' && canRaise && !isIP) {
            const shouldDonk = (
                // Strong hands on low/connected boards (our range advantage)
                (effectiveStrength >= 55 && (boardIsLow || boardIsConnected) && !boardIsHigh) ||
                // Two pair or better on any low board
                (effectiveStrength >= 65 && boardIsLow) ||
                // Strong draws on wet boards (semi-bluff donk)
                (drawEquity.outs >= 10 && isWetBoard && effectiveStrength >= 25)
            );
            if (shouldDonk) {
                let donkFreq = 0.30 + aggressionBias / 40;
                // Against frequent c-bettors, donk more (deny them c-bet equity)
                if (!oppIsPassive) donkFreq += 0.08;
                // Against tight players, donk less (they 3-bet preflop with strong hands)
                if (oppOverfolds) donkFreq -= 0.05;
                // Multiway: donk less (more players to get through)
                if (numPlayers >= 3) donkFreq *= 0.60;
                donkFreq = Math.max(0, Math.min(0.50, donkFreq));
                if (Math.random() < donkFreq) {
                    // Size: 33-50% pot depending on hand strength and board
                    let donkFrac = effectiveStrength >= 65 ? 0.50 : 0.33;
                    if (isWetBoard) donkFrac = Math.min(0.60, donkFrac + 0.08);
                    const betSize = Math.round(potSize * donkFrac);
                    const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                    console.debug(`[HorseBrain]  FLOP DONK: str=${effectiveStrength} board=${boardIsLow ? 'low' : boardIsConnected ? 'connected' : 'other'} outs=${drawEquity.outs}`);
                    return { type: raiseAction.type, amount };
                }
            }
        }

        // ═══ FLOP BET (non-aggressor): Value bet + probe on checked flop ═══
        // When opponent checks to us on flop and we're not the PFR,
        // bet for value or to deny equity with medium+ hands
        if (!wasPreAggressor && street === 'flop' && canRaise && isIP) {
            if (effectiveStrength >= 55) {
                // Value bet strong hands on checked-to flops
                let valueBetFreq = 0.60;
                if (numPlayers >= 3) valueBetFreq = 0.45;
                if (Math.random() < valueBetFreq) {
                    const sizeFrac = isDryBoard ? 0.45 : 0.55;
                    const betSize = Math.round(potSize * sizeFrac);
                    const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                    return { type: raiseAction.type, amount };
                }
            }
            // Stab at pot with marginal hands on dry boards
            if (effectiveStrength >= 30 && isDryBoard && numPlayers <= 2) {
                let stabFreq = 0.25 + aggressionBias / 40;
                if (oppOverfolds) stabFreq += 0.12;
                if (Math.random() < stabFreq) {
                    const betSize = Math.round(potSize * 0.33);
                    const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                    return { type: raiseAction.type, amount };
                }
            }
        }

        // ═══ DELAYED C-BET (new) — Bet the turn after checking the flop ═══
        // If we had initiative preflop but checked the flop, bet the turn to represent strength
        if (wasPreAggressor && street === 'turn' && !gameState.betOnFlop && canRaise) {
            // Delayed c-bet is effective because opponent expects us to give up
            // Use it with medium+ hands or when a scare card falls
            if (effectiveStrength >= 45 || (effectiveStrength >= 25 && Math.random() < 0.25 + aggressionBias / 40)) {
                const delayFrac = isDryBoard ? 0.50 : 0.60;
                const betSize = Math.round(potSize * delayFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // ═══ PROBE BET (new) — Bet when the preflop raiser checks behind ═══
        // If opponent was the preflop aggressor and checked the flop, probe bet the turn
        if (!wasPreAggressor && street === 'turn' && canRaise) {
            // Opponent checked flop = weakness. Probe bet to take it down.
            // More effective on scare cards and against tight opponents
            let probeFreq = 0.25 + aggressionBias / 40;
            if (oppOverfolds) probeFreq += 0.15;
            if (numPlayers >= 3) probeFreq *= 0.5; // Less probe multiway

            if (effectiveStrength >= 30 && Math.random() < probeFreq) {
                const probeFrac = effectiveStrength >= 55 ? 0.55 : 0.40; // Bigger with value
                const betSize = Math.round(potSize * probeFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // ═══ TURN BARREL LOGIC — UPGRADED WITH MULTI-STREET PLAN ═══
        // If we c-bet the flop (wasAggressor), consider barreling the turn
        if (wasPreAggressor && street === 'turn' && canRaise) {
            // ═══ ADVANCED: Multi-street plan drives barrel decisions ═══
            // If the plan says "barrel turn", increase barrel frequency
            const turnPlanBets = multiStreet.turnAction && multiStreet.turnAction.startsWith('bet');
            const planBarrelBoost = turnPlanBets ? 0.12 : 0;
            const planSizeMod = multiStreet.turnAction === 'bet-large' ? 0.70 : (turnPlanBets ? 0.55 : 0);

            // Turn barrel criteria:
            // 1. Strong hand (>= 65) → always barrel for value
            // 2. Good draws (>= 8 outs) → semi-bluff barrel
            // 3. Scare card that helps our range → barrel as bluff
            if (effectiveStrength >= 65) {
                let sizeFrac = isDryBoard ? 0.55 : 0.70;
                // Against callers → bigger sizing for value extraction
                if (oppIsSticky && effectiveStrength >= 70) sizeFrac = Math.min(0.80, sizeFrac + 0.10);
                // Multi-street plan may suggest geometric sizing
                if (planSizeMod > 0) sizeFrac = (sizeFrac + planSizeMod) / 2;
                const betSize = Math.round(potSize * sizeFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
            // Semi-bluff barrel with strong draws
            if (drawEquity.outs >= 8) {
                let barrelFreq = (0.45 + aggressionBias / 30 + planBarrelBoost) * multiway.bluffReduction;
                // Against over-folders, barrel more aggressively
                if (oppOverfolds) barrelFreq = Math.min(0.75, barrelFreq + 0.15);
                if (Math.random() < barrelFreq) {
                    const betSize = Math.round(potSize * (planSizeMod > 0 ? planSizeMod : 0.55));
                    const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                    return { type: raiseAction.type, amount };
                }
            }
            // ═══ BLUFF BARREL — range advantage + multi-street plan driven ═══
            if (effectiveStrength < 25 && !oppIsSticky) {
                let bluffBarrelFreq = 0.18 * multiway.bluffReduction;
                if (rangeAdv.rangeAdvantage === 'hero') bluffBarrelFreq += 0.08;
                if (turnPlanBets) bluffBarrelFreq += 0.06;
                if (Math.random() < bluffBarrelFreq) {
                    // Only bluff-barrel on good runout cards (overcards, board pairs)
                    if (boardIsLow || boardIsPaired || rangeAdv.rangeAdvantage === 'hero') {
                        const betSize = Math.round(potSize * 0.55);
                        const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                        return { type: raiseAction.type, amount };
                    }
                }
            }
        }

        // SPR-committed: go all-in with decent hands (#24)
        if (sprInfo.strategy === 'committed' && effectiveStrength >= sprInfo.commitThreshold && canRaise) {
            return { type: 'all_in' };
        }

        // Strong hands: value bet (sizing by board texture)
        if (effectiveStrength >= 70 && canRaise) {
            const sizeFrac = isDryBoard ? 0.50 : getOptimalBetSize(handEval.category, street, potSize, false, {
                boardWetness, isInPosition: isIP, numPlayers, handStrength: effectiveStrength,
                heroIsAggressor: gameState.wasAggressor || false, stackBB, liveRead: preflopLiveRead
            });
            const betSize = Math.round(potSize * sizeFrac);
            const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
            return { type: raiseAction.type, amount };
        }

        // ═══ UPGRADED: Semi-bluffs with equity + fold equity awareness ═══
        if ((handEval.hasFlushDraw || handEval.hasOESD) && drawEquity.outs >= 8) {
            // Check behind draws on monotone boards (reverse implied odds)
            if (boardIsMonotone && !handEval.hasFlushDraw) {
                return { type: 'check' }; // Don't bluff into monotone without flush draw
            }
            let semiBluffFreq = 0.45 + aggressionBias / 30;
            // Against sticky opponents, semi-bluff less (they call anyway)
            if (oppIsSticky) semiBluffFreq *= 0.70;
            if (canRaise && Math.random() < semiBluffFreq * multiway.bluffReduction) {
                // Larger semi-bluff on wet boards (deny equity), smaller on dry
                const sizeFrac = isWetBoard ? 0.66 : 0.45;
                const betSize = Math.round(potSize * sizeFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // Medium hands: bet on dry boards (range advantage)
        if (effectiveStrength >= 40 && isDryBoard && canRaise) {
            let aggressionChance = 0.35 + aggressionBias / 50;
            if (oppOverfolds) aggressionChance += 0.12; // Print money vs folders
            if (Math.random() < aggressionChance * multiway.bluffReduction) {
                const betSize = Math.round(potSize * 0.33);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // ═══ POSITION STRATEGY MODULE: IP pot control vs OOP protection ═══
        // Use getPositionStrategy to decide check-behind vs bet
        if (effectiveStrength >= 30 && effectiveStrength < 50) {
            if (posStrat.action === 'check' || (isIP && posStrat.action !== 'bet')) {
                return { type: 'check' }; // Pot control with medium hands IP
            }
        }

        return { type: 'check' };
    }

    // ═══ FACING A BET — FLOP/TURN ═══

    // SPR-committed: push all-in with decent hands (#24)
    if (sprInfo.strategy === 'committed' && effectiveStrength >= sprInfo.commitThreshold) {
        if (canRaise) return { type: 'all_in' };
        if (canCall) return { type: 'call' };
    }

    // ═══ OOP DECISION MATRIX — structured check-call/check-raise/fold framework ═══
    // When OOP facing a bet, use the principled matrix for better decision quality.
    // This replaces ad-hoc logic with a calibrated framework. IP still uses the
    // existing aggressive logic below.
    if (!isIP && toCall > 0) {
        const oopDecision = getOOPDecisionMatrix({
            handStrength: effectiveStrength,
            handCategory: handEval.category,
            hasStrongDraw: handEval.hasFlushDraw || handEval.hasOESD,
            hasWeakDraw: handEval.hasGutshot || handEval.hasBackdoorFlush,
            street,
            boardWetness,
            boardIsPaired,
            boardIsMonotone,
            numPlayers,
            aggressionBias,
            oppTendency: opponentAdjustment.bluffAware ? 'bluffy'
                : opponentAdjustment.foldMod > 0 ? 'weak-tight'
                : opponentAdjustment.callMod > 0 ? 'calling-station'
                : 'balanced',
            oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
            oppCbetFreq: 0.60, // Default, would need tracking for better data
            oppCallFreq: 0.50,
            heroIsAggressor: gameState.wasAggressor || false,
            potSize, toCall, stackBB,
            liveRead: preflopLiveRead || null  // Phase 28: pass live-read to OOP matrix
        });

        // ═══ OOP CHECK-RAISE BOOST: posFreqMod integration (main pipeline) ═══
        const mainCRFreq = oopDecision.action === 'check_raise'
            ? Math.min(0.80, oopDecision.frequency + (aggressionBias > 0 ? 0.04 : 0))
            : oopDecision.frequency;

        if (oopDecision.action === 'check_raise' && canRaise && Math.random() < mainCRFreq) {
            // Check-raise: raise the bet
            const crSize = Math.round(toCall * (oopDecision.sizeFraction || 3.0));
            const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(crSize, raiseAction?.maxAmount || crSize));
            console.debug(`[HorseBrain]  OOP MATRIX: check-raise (${oopDecision.reason}) freq=${Math.round(mainCRFreq * 100)}%`);
            return { type: raiseAction.type, amount };
        }
        if (oopDecision.action === 'check_call' && canCall) {
            console.debug(`[HorseBrain]  OOP MATRIX: check-call (${oopDecision.reason})`);
            return { type: 'call' };
        }
        if (oopDecision.action === 'lead' && canRaise) {
            const leadSize = Math.round(potSize * (oopDecision.sizeFraction || 0.50));
            const amount = Math.max(raiseAction?.minAmount || 1, Math.min(leadSize, raiseAction?.maxAmount || leadSize));
            console.debug(`[HorseBrain]  OOP MATRIX: lead bet (${oopDecision.reason})`);
            return { type: raiseAction.type, amount };
        }
        if (oopDecision.action === 'check_fold') {
            // RIO guard: still check if possible instead of fold
            if (canCheck) return { type: 'check' };
            console.debug(`[HorseBrain]  OOP MATRIX: fold (${oopDecision.reason})`);
            return { type: 'fold' };
        }
        // If matrix didn't make a decision, fall through to existing logic
    }

    // Monster hands: raise
    if (effectiveStrength >= 85 && canRaise) {
        const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, false, {
            boardWetness, isInPosition: isIP, numPlayers, handStrength: effectiveStrength,
            oppTendency: opponentAdjustment.bluffAware ? 'bluffy' : opponentAdjustment.foldMod > 0 ? 'weak-tight' : 'balanced',
            oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
            stackBB, isPolarized: true, liveRead: preflopLiveRead
        });
        const raiseSize = Math.round(toCall + potSize * sizeFrac);
        const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
        return { type: raiseAction.type, amount };
    }

    // Strong hands: call or raise (personality-driven)
    if (effectiveStrength >= 60) {
        // ═══ UPGRADED: Raise frequency driven by position and personality ═══
        const raiseFreq = isIP ? (0.25 + aggressionBias / 30) : (0.15 + aggressionBias / 40);
        if (canRaise && Math.random() < raiseFreq) {
            const raiseSize = Math.round(toCall * (2.2 + Math.random() * 0.8));
            const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            return { type: raiseAction.type, amount };
        }
        if (canCall) return { type: 'call' };
    }

    // ═══ BUG #113: MADE-BUT-VULNERABLE hands calldown ═══
    // Bottom straights (55), wheels (52), board-trips FH with weak pair (62), and low flushes
    // are MADE hands that should call reasonable bets, not fold. The gap between >= 60 (strong)
    // and >= 35 (medium with good odds < 25%) was too wide — these hands folded to half-pot bets.
    // A made straight or flush should never fold to a half-pot bet.
    if (effectiveStrength >= 48 && effectiveStrength < 60) {
        if (potOdds < 0.35 && canCall) return { type: 'call' }; // Call up to ~half-pot
        // But don't raise — these hands are vulnerable and can't stand a re-raise
    }

    // ═══ MODULE 27: RIO GUARD IN FALLBACK — block draw calls with bad RIO ═══
    // Bug #163: Only fire RIO guard on primarily-draw hands (strength < 40).
    // Made hands like TPTK (str=47), overpairs, two pair, etc. with incidental backdoor
    // draws should NOT be folded by the RIO guard. The guard is for hands RELYING on
    // draw equity (pair + gutshot, weak pair + backdoor), not strong made hands.
    if (fbRioGuard.shouldBlock && drawEquity.outs > 0 && drawEquity.outs < 12 && effectiveStrength < 40) {
        console.debug(`[HorseBrain]  MODULE 27 RIO FALLBACK: folding draw — ${fbRioGuard.reason}`);
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Drawing hands: use equity math (#29) + advanced pot/implied odds module
    const advOdds = drawEquity.outs > 0
        ? calculatePotAndImpliedOdds(drawEquity.outs * 2.2 / 100, potSize, toCall, stackBB, street, isIP, drawEquity.isNutDraw || false, numPlayers)
        : null;

    if (drawEquity.outs > 0 && (drawEquity.shouldCall(potOdds) || (advOdds && advOdds.isDirectlyProfitable))) {
        // ═══ UPGRADED: Semi-bluff raise with 12+ outs or nut draws ═══
        if (canRaise && (drawEquity.outs >= 12 || drawEquity.isNutDraw) && Math.random() < 0.35 * multiway.bluffReduction) {
            // Big draws (combo draws) should raise to deny equity + build pot
            const raiseSize = Math.round(toCall * 2.5);
            const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            return { type: raiseAction.type, amount };
        }
        if (canCall) return { type: 'call' };
    }

    // ═══ IMPLIED ODDS DRAWS — module-driven + legacy fallback ═══
    if (drawEquity.outs >= 9 && ((advOdds && advOdds.isImpliedProfitable) || (drawEquity.shouldCallWithImplied && drawEquity.shouldCallWithImplied(potOdds, stackBB)))) {
        if (canCall) return { type: 'call' };
    }

    // ═══ UPGRADED: Backdoor draws + overcards with good immediate odds ═══
    if (effectiveStrength >= 25 && drawEquity.outs >= 4 && potOdds < 0.20) {
        if (canCall) return { type: 'call' };
    }

    // Medium hands with good odds
    if (effectiveStrength >= 35 && potOdds < 0.25) {
        if (canCall) return { type: 'call' };
    }

    // ═══ UPGRADED: Float in position with marginal equity ═══
    // IP floating is a valid strategy — call flop bets light to take away turn/river
    if (isIP && street === 'flop' && effectiveStrength >= 20 && potOdds < 0.22 && numPlayers <= 3) {
        let floatFreq = 0.25 + aggressionBias / 50;
        // Float more against passive opponents who give up on the turn
        if (oppIsPassive) floatFreq += 0.12;
        if (canCall && Math.random() < floatFreq) {
            return { type: 'call' }; // Float flop IP
        }
    }

    // Bug #162: MDF-based defense vs all-in / large bets on flop/turn
    // When facing a shove or large overbet, hands with decent equity should call
    // at a rate that prevents the opponent from profiting by jamming any two cards.
    // MDF = pot / (pot + bet). If we fold more than (1 - MDF), opponent prints money.
    // NOTE: effectiveStrength is a HEURISTIC RANK (0-100), NOT equity. TPTK=47, sets=80, etc.
    // On flop/turn, a hand with strength >= 35 (second pair+) is often a call vs all-in.
    if (toCall > 0 && canCall && effectiveStrength >= 30) {
        const flopTurnMDF = potSize / (potSize + toCall);
        const betRelPot = toCall / Math.max(1, potSize);

        // Only kicks in for large bets (>50% pot) — small bets are handled above
        if (betRelPot >= 0.50) {
            // Heuristic: top pair+ (strength >= 40) should always call flop/turn all-ins
            // because TPTK has 70-80% equity vs random ranges even though its strength score is ~47.
            // Medium pairs (30-39) call at MDF frequency to prevent exploitation.
            const mdfMarginCall = effectiveStrength >= 40
                || (effectiveStrength >= 30 && Math.random() < flopTurnMDF * 0.25);

            if (mdfMarginCall) {
                console.debug(`[HorseBrain]  MDF DEFENSE: calling large bet (${Math.round(betRelPot * 100)}% pot) str=${effectiveStrength} MDF=${Math.round(flopTurnMDF * 100)}%`);
                return { type: 'call' };
            }
        }
    }

    // Weak: fold
    return canCheck ? { type: 'check' } : { type: 'fold' };
}

// ═══════════════════════════════════════════════════════════════════════════
// POSTFLOP HAND EVALUATOR (#18)
// Basic made-hand + draw detection when solver data is unavailable
// ═══════════════════════════════════════════════════════════════════════════

function evaluatePostflopHand(holeCards, board) {
    if (!holeCards || holeCards.length < 2 || !board || board.length < 3) {
        return { strength: 20, category: 'unknown', hasFlushDraw: false, hasOESD: false, hasGutshot: false, hasBackdoorFlush: false };
    }

    const allCards = [...holeCards, ...board];
    const ranks = allCards.map(c => RANKS.indexOf(c[0]));
    const suits = allCards.map(c => c[1]);
    const heroRanks = holeCards.map(c => RANKS.indexOf(c[0]));
    const heroSuits = holeCards.map(c => c[1]);
    const boardRanks = board.map(c => RANKS.indexOf(c[0]));
    const boardSuits = board.map(c => c[1]);

    // Count ranks and suits
    const rankCounts = {};
    ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });

    // Board-only rank counts (needed for distinguishing hero-made vs board-made hands)
    const boardRankCounts = {};
    boardRanks.forEach(r => { boardRankCounts[r] = (boardRankCounts[r] || 0) + 1; });

    // --- Made hand detection ---
    let strength = 10;
    let category = 'high_card';

    // ═══ STRAIGHT FLUSH ═══ (new — was completely missing!)
    // Check before quads since straight flush beats quads
    {
        const flushSuit = Object.keys(suitCounts || {}).find(s => suitCounts[s] >= 5);
        if (flushSuit && heroSuits.includes(flushSuit)) {
            const flushCards = allCards.filter(c => c[1] === flushSuit).map(c => RANKS.indexOf(c[0]));
            const uniqueFlush = [...new Set(flushCards)].sort((a, b) => a - b);
            // Check for 5 consecutive flush cards
            for (let i = uniqueFlush.length - 1; i >= 4; i--) {
                if (uniqueFlush[i] - uniqueFlush[i - 4] === 4) {
                    const sfRanks = uniqueFlush.slice(i - 4, i + 1);
                    // ═══ Phase 44 FIX: was using heroRanks.indexOf(r) which always returns first index
                // — with pocket pairs of different suits, this checks the wrong suit card. Use (r, i) indexed callback. ═══
                if (heroRanks.some((r, i) => sfRanks.includes(r) && heroSuits[i] === flushSuit)) {
                        strength = 99; category = 'straight_flush';
                        if (sfRanks[4] === 12) { strength = 100; category = 'royal_flush'; } // Royal!
                    }
                    break;
                }
            }
            // Wheel straight flush (A-2-3-4-5 of same suit)
            if (category === 'high_card' && uniqueFlush.includes(12) && uniqueFlush.includes(0) &&
                uniqueFlush.includes(1) && uniqueFlush.includes(2) && uniqueFlush.includes(3)) {
                // ═══ Phase 44 FIX: same indexOf bug as above — use indexed callback ═══
                if (heroRanks.some((r, i) => [12, 0, 1, 2, 3].includes(r) && heroSuits[i] === flushSuit)) {
                    strength = 98; category = 'straight_flush';
                }
            }
        }
    }

    // Quads
    if (category === 'high_card') {
        const quadRank = Object.keys(rankCounts || {}).find(r => rankCounts[r] === 4);
        if (quadRank && heroRanks.includes(Number(quadRank))) {
            strength = 97; category = 'quads';
            // ═══ KICKER MATTERS FOR QUADS ═══ (e.g., quad 2s with Ace kicker > quad 2s with 5 kicker)
            const kicker = Math.max(...heroRanks.filter(r => r !== Number(quadRank)));
            if (kicker >= 12) strength = 97.5; // Ace kicker on quads
        }
    }

    // Full house (check before flush/straight)
    if (category === 'high_card') {
        const trips = Object.keys(rankCounts || {}).filter(r => rankCounts[r] >= 3).map(Number);
        const pairs = Object.keys(rankCounts || {}).filter(r => rankCounts[r] >= 2).map(Number);
        if (trips.length >= 1 && pairs.length >= 2) {
            if (heroRanks.some(r => rankCounts[r] >= 2)) {
                // ═══ BUG #112: NUT-VS-NON-NUT FULL HOUSE (Hold'em) ═══
                // A full house's value depends heavily on WHERE it ranks among possible full houses.
                // Top full house (nut) is a monster; bottom full house is a TRAP hand that loses the max.
                //
                // WHAT BEATS A NON-NUT FULL HOUSE:
                //   - Quads (any quad beats any full house)
                //   - Higher full house (higher trips rank, or same trips with higher pair)
                //   - Straight flush (rare but devastating)
                //
                // VULNERABILITY CALCULATION:
                //   Count how many HIGHER full houses are possible given the board.
                //   Board [K,7,7]: KKK77 is nut FH. 777KK is 2nd. 777AA would need AA in hand.
                //   Board [K,K,7]: KKK77 nut FH. KKK-AA needs A on board or in hand.

                const bestTrip = Math.max(...trips.filter(t => heroRanks.includes(t) || boardRankCounts[t] >= 3));
                const bestPair = Math.max(...pairs.filter(p => p !== bestTrip));
                category = 'full_house';

                // Count how many higher full houses are possible
                // CRITICAL distinction:
                //   "criticalHigher" = board has 2+ of a rank above our trips → opponent needs just 1 card
                //                      to make higher trips. This is VERY likely and VERY dangerous.
                //   "moderateHigher" = board has 1 of a rank above our trips → opponent needs pocket pair
                //                      of that rank. Less common but still possible.
                //   "sameTripsHigherPair" = if board provides our trips, opponent's pair rank matters.
                let criticalHigher = 0;
                let moderateHigher = 0;
                const allRanks = [0,1,2,3,4,5,6,7,8,9,10,11,12];

                for (const r of allRanks) {
                    if (r <= bestTrip) continue;
                    const boardCount = boardRankCounts[r] || 0;
                    if (boardCount >= 2) criticalHigher++; // Opponent with 1 card makes higher trips
                    else if (boardCount >= 1) moderateHigher++; // Opponent needs pocket pair
                }

                // Same-trips scenario: board has 3 of bestTrip → everyone has trips, pair decides
                let sameTripsHigherPair = 0;
                if ((boardRankCounts[bestTrip] || 0) >= 3) {
                    for (const r of allRanks) {
                        if (r > bestPair && r !== bestTrip) sameTripsHigherPair++;
                    }
                }

                // Assign strength based on vulnerability
                if (criticalHigher === 0 && moderateHigher === 0 && sameTripsHigherPair === 0) {
                    strength = 93; // Nut full house — no higher FH possible
                } else if (criticalHigher === 0 && moderateHigher <= 2 && sameTripsHigherPair === 0) {
                    strength = 90; // Near-nut — only pocket pairs above beat us (rare)
                } else if (criticalHigher <= 1 && sameTripsHigherPair <= 3) {
                    strength = 78; // Middle FH — one critical or a few same-trips above
                } else {
                    strength = 68; // Bottom FH — TRAP hand, many better FHs very likely
                }

                // Hero has pocket pair that makes the trips part → more disguised and stronger
                if (heroRanks[0] === heroRanks[1] && heroRanks.includes(bestTrip)) strength += 2;

                // Board trips scenario: everyone has trips, only pocket pair differentiates
                if ((boardRankCounts[bestTrip] || 0) >= 3) {
                    // Board has trips — hero's pair determines FH rank
                    if (bestPair >= 12) strength = Math.max(strength, 88); // Aces full via board trips
                    else if (bestPair >= 10) strength = Math.max(strength, 78); // JJ+ full via board trips
                    else if (bestPair >= 7) strength = Math.max(strength, 70); // Medium pair
                    else strength = Math.max(strength, 62); // Low pair — weakest FH
                }
            }
        }
    }

    // Flush
    if (category === 'high_card') {
        const flushSuit = Object.keys(suitCounts || {}).find(s => suitCounts[s] >= 5);
        if (flushSuit && heroSuits.includes(flushSuit)) {
            const flushCards = allCards.filter(c => c[1] === flushSuit).map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);
            const heroFlushCards = heroRanks.filter((r, i) => heroSuits[i] === flushSuit);
            const maxHeroFlush = Math.max(...heroFlushCards);
            category = 'flush';

            // ═══ BUG #112: NUT-VS-NON-NUT FLUSH (Hold'em) ═══
            // A flush's value is determined by the HIGHEST card in the flush.
            // The nut flush (Ace-high) is a monster. A low flush is a TRAP hand.
            //
            // WHAT BEATS A NON-NUT FLUSH:
            //   - Any higher flush (opponent has a higher card of the same suit)
            //   - Full house, quads, straight flush
            //
            // VULNERABILITY: Count how many cards of the flush suit are HIGHER than
            // our best flush card AND not already on the board or in our hand.
            // Each such card = one possible higher flush an opponent could hold.

            const boardFlushCards = boardRanks.filter((r, i) => boardSuits[i] === flushSuit);
            const knownFlushCards = [...new Set([...boardFlushCards, ...heroFlushCards])];
            let higherFlushCount = 0;
            for (let r = maxHeroFlush + 1; r <= 12; r++) {
                if (!knownFlushCards.includes(r)) higherFlushCount++;
            }

            if (higherFlushCount === 0) {
                strength = 90; // Nut flush — no higher flush possible
            } else if (higherFlushCount === 1) {
                strength = 82; // 2nd nut flush (K-high when Ace not accounted for)
            } else if (higherFlushCount === 2) {
                strength = 74; // Q-high flush — two higher flushes possible
            } else {
                strength = 60 + maxHeroFlush; // Lower flushes: base + rank bonus
                // J-high = 70, T-high = 69, 9-high = 68, etc.
            }

            // ═══ BOARD FLUSH WARNING ═══
            // If 4+ flush cards are on the board, our flush is MUCH less valuable
            // because anyone with a SINGLE card of that suit also has a flush
            const boardFlushCount = boardSuits.filter(s => s === flushSuit).length;
            if (boardFlushCount >= 4) strength -= 8; // One-card flush = very common for opponents
        }
    }

    // Straight
    if (category === 'high_card') {
        const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
        let foundStraight = false;
        let bestStraightHigh = -1;

        // First, find the BEST straight hero is part of
        for (let i = uniqueRanks.length - 1; i >= 4; i--) {
            if (uniqueRanks[i] - uniqueRanks[i - 4] === 4) {
                const straightRanks = uniqueRanks.slice(i - 4, i + 1);
                if (heroRanks.some(r => straightRanks.includes(r))) {
                    bestStraightHigh = straightRanks[4]; // Top card of our best straight
                    foundStraight = true;
                    break;
                }
            }
        }
        // Check wheel straight (A-2-3-4-5)
        if (!foundStraight && uniqueRanks.includes(12) && uniqueRanks.includes(0) && uniqueRanks.includes(1) && uniqueRanks.includes(2) && uniqueRanks.includes(3)) {
            if (heroRanks.some(r => [12, 0, 1, 2, 3].includes(r))) {
                bestStraightHigh = 3; // Wheel tops out at 5 (rank 3)
                foundStraight = true;
            }
        }

        if (foundStraight) {
            category = 'straight';

            // ═══ BUG #112: NUT-VS-NON-NUT STRAIGHT (Hold'em) ═══
            // A straight's value depends on whether it's the NUT straight (highest possible)
            // or if higher straights exist that DESTROY us.
            //
            // WHAT BEATS A NON-NUT STRAIGHT:
            //   - Any higher straight (opponent holds cards making a higher 5-card run)
            //   - Flush (any flush beats any straight)
            //   - Full house, quads, straight flush
            //
            // VULNERABILITY: Compute the NUT straight high on this board, then measure
            // how far below it our straight is.

            // Compute nut straight: the highest possible straight using these board cards
            const boardUniqueRanks = [...new Set(boardRanks)].sort((a, b) => a - b);
            let nutStraightHigh = -1;

            // Check all possible straights (high card from 4 to 12)
            for (let high = 12; high >= 4; high--) {
                const needed = [high, high-1, high-2, high-3, high-4];
                const boardHas = needed.filter(r => boardUniqueRanks.includes(r)).length;
                // In Hold'em, a straight needs at least 3 board cards (hero has 2 hole cards max)
                if (boardHas >= 3) {
                    nutStraightHigh = high;
                    break;
                }
            }
            // Check wheel as nut (only if no higher straight found)
            if (nutStraightHigh === -1) {
                const wheelRanks = [12, 0, 1, 2, 3];
                const boardWheelCount = wheelRanks.filter(r => boardUniqueRanks.includes(r)).length;
                if (boardWheelCount >= 3) nutStraightHigh = 3;
            }

            const vulnerability = nutStraightHigh - bestStraightHigh;

            if (vulnerability === 0) {
                strength = 85; // Nut straight — highest possible
            } else if (vulnerability === 1) {
                strength = 74; // 2nd nut straight — one higher exists
            } else if (vulnerability === 2) {
                strength = 66; // 3rd nut straight
            } else {
                strength = 55; // Idiot end / bottom straight — TRAP hand
            }

            // Wheel is always capped — lowest possible straight
            if (bestStraightHigh === 3) {
                strength = Math.min(strength, 52); // Wheel cap
            }

            // ═══ BOARD STRAIGHT WARNING ═══
            // If 4 of the 5 straight cards are on the board, anyone with 1 card has the straight
            const bestStraightRanks = bestStraightHigh === 3
                ? [12, 0, 1, 2, 3]
                : [bestStraightHigh, bestStraightHigh-1, bestStraightHigh-2, bestStraightHigh-3, bestStraightHigh-4];
            const boardStraightCards = bestStraightRanks.filter(r => boardRanks.includes(r));
            if (boardStraightCards.length >= 4) strength -= 5; // One-card straight = very common
        }
    }

    // Three of a kind
    if (category === 'high_card') {
        const tripRank = Object.keys(rankCounts || {}).find(r => rankCounts[r] === 3);
        if (tripRank && heroRanks.includes(Number(tripRank))) {
            const boardHasTrip = boardRanks.filter(r => r === Number(tripRank)).length >= 2;
            if (boardHasTrip) {
                // Trips (board pair + one in hand) — weaker because opponent can also have trips
                strength = 55; category = 'trips';
                // ═══ KICKER MATTERS for trips ═══
                const kicker = Math.max(...heroRanks.filter(r => r !== Number(tripRank)));
                if (kicker >= 12) strength += 4; // Ace kicker
                else if (kicker >= 10) strength += 2; // Jack+ kicker
            } else {
                // Set (pocket pair + one on board) — very disguised and strong
                strength = 80; category = 'set';
                // ═══ SET RANKING ═══ Higher set = better
                if (Number(tripRank) >= 10) strength = 83; // Set of Jacks or better
                if (Number(tripRank) === Math.max(...boardRanks)) strength += 2; // Top set
            }
        }
    }

    // Two pair
    if (category === 'high_card') {
        const pairRanks = Object.keys(rankCounts || {}).filter(r => rankCounts[r] >= 2).map(Number);
        if (pairRanks.length >= 2) {
            const heroPairs = pairRanks.filter(r => heroRanks.includes(r));
            if (heroPairs.length >= 2) {
                // ═══ TWO PAIR RANKING ═══
                // Top two pair (both using top board cards) is very different from bottom two pair
                const sortedHeroPairs = heroPairs.sort((a, b) => b - a);
                const topBoardRank = Math.max(...boardRanks);
                const secondBoardRank = boardRanks.sort((a, b) => b - a)[1] ?? 0;
                strength = 58; category = 'two_pair';

                // Top two pair: both pairs use the two highest board cards
                if (sortedHeroPairs[0] >= topBoardRank && sortedHeroPairs[1] >= secondBoardRank) {
                    strength = 62; // Top two pair — strong
                }
                // Bottom two pair: both pairs use lower board cards
                if (sortedHeroPairs[0] < topBoardRank) {
                    strength = 52; // Bottom two — vulnerable to higher two pair
                }
                // ═══ KICKER AWARENESS ═══
                // With two pair, kicker doesn't matter as much, but board texture does
            } else if (heroPairs.length === 1) {
                // One pair from hero, one(+) from board pairing
                // BUG #31 FIX: Was using === which missed overpairs (hero pair > top board card).
                // BUG #32 FIX: Three-pairs scenario — when board has 2 pairs and hero has a pocket pair,
                // there are 3 pairs total. The best 5-card hand uses the TOP 2 pairs.
                // QQ on K-K-5-5-8 = KKQQ8 (drop the 55) = very strong two pair.
                // We need to check if hero's pair ranks among the top 2 of all 3 pairs.
                const allPairsSorted = pairRanks.sort((a, b) => b - a);
                const topTwoPairs = allPairsSorted.slice(0, 2);
                const heroPairRank = heroPairs[0];
                const topBoardForTP = Math.max(...boardRanks);

                if (topTwoPairs.includes(heroPairRank) && pairRanks.length >= 3) {
                    // Hero's pair is one of the top 2 pairs in a 3+ pair scenario.
                    // BUT: when the board has 2 pairs, BOTH of those ranks make full houses
                    // for anyone holding them. That's a huge % of played ranges.
                    // E.g., KK558: any K = KKK55 full house, any 5 = 555KK full house.
                    // So QQ on KK558 = KKQQ two pair = bluff-catcher, NOT a strong hand.
                    //
                    // Count how many board pairs exist — more board pairs = more full houses out there.
                    const numBoardPairs = Object.values(boardRankCounts || {}).filter(c => c >= 2).length;
                    if (numBoardPairs >= 2) {
                        // Board has 2+ pairs — full houses are EVERYWHERE
                        // Hero's pocket pair is just a better bluff-catcher than having high cards
                        category = 'two_pair_weak';
                        if (heroPairRank >= 12) strength = 42; // AA on KK558 = best bluff-catcher but still vulnerable
                        else if (heroPairRank >= 10) strength = 40; // QQ/JJ on KK558
                        else if (heroPairRank >= 8) strength = 38; // TT/99
                        else strength = 35; // Low pair — barely better than board two pair
                    } else {
                        // Only 1 board pair + hero pair + another pair = 3 pairs but only 1 board pair
                        // Less full house risk — hero's two pair is more meaningful
                        category = 'two_pair';
                        strength = 55;
                        if (heroPairRank >= 10) strength = 58;
                    }
                } else {
                    // Hero pair is NOT in the top 2 pairs — weakest position
                    const numBoardPairsGeneric = Object.values(boardRankCounts || {}).filter(c => c >= 2).length;
                    const boardPairRanksArr = Object.keys(boardRankCounts || {}).filter(r => boardRankCounts[r] >= 2).map(Number);
                    const allBoardPairsHigher = boardPairRanksArr.length >= 2 && boardPairRanksArr.every(r => r > heroPairRank);

                    if (numBoardPairsGeneric >= 2 && allBoardPairsHigher) {
                        // COUNTERFEITED: hero's pair is below BOTH board pairs.
                        // 33 on KK558 = playing the board KK558. Hero's 33 contributes nothing.
                        // Treat as board_two_pair (hero doesn't contribute to hand).
                        category = 'board_two_pair';
                        const bestKicker = Math.max(...heroRanks);
                        if (bestKicker >= 12) strength = 35;
                        else if (bestKicker >= 11) strength = 32;
                        else if (bestKicker >= 9) strength = 28;
                        else strength = 20; // Low kicker on counterfeited hand
                    } else if (numBoardPairsGeneric >= 2) {
                        // Board has 2+ pairs, hero's pair is between the board pairs
                        // (e.g., 77 on KK338). Not counterfeited but still weak.
                        category = 'two_pair_weak';
                        strength = 34; // Slightly better than counterfeited but still very weak
                    } else if (heroPairRank > topBoardForTP) {
                        category = 'two_pair_weak';
                        strength = 56; // Overpair + single board pair — strongest two_pair_weak
                    } else if (heroPairRank === topBoardForTP) {
                        category = 'two_pair_weak';
                        strength = 53; // Top pair + single board pair — decent
                    } else {
                        category = 'two_pair_weak';
                        strength = 50; // Under pair + single board pair — standard
                    }
                }
            }
        }
    }

    // One pair
    if (category === 'high_card') {
        const pairRanks = Object.keys(rankCounts || {}).filter(r => rankCounts[r] >= 2).map(Number);
        if (pairRanks.length >= 1) {
            const heroPair = pairRanks.find(r => heroRanks.includes(r));
            if (heroPair !== undefined) {
                const sortedBoardRanks = [...boardRanks].sort((a, b) => b - a);
                const topBoardRank = sortedBoardRanks[0];
                const secondBoardRank = sortedBoardRanks[1] ?? 0;
                const thirdBoardRank = sortedBoardRanks[2] ?? 0;
                if (heroPair > topBoardRank) {
                    strength = 55; category = 'overpair';
                    // ═══ OVERPAIR RANKING ═══ Much more granular
                    if (heroPair >= 12) strength = 63; // AA overpair
                    else if (heroPair >= 11) strength = 60; // KK overpair
                    else if (heroPair >= 10) strength = 58; // QQ/JJ overpair
                    else if (heroPair >= 8) strength = 55; // TT/99 overpair
                    else strength = 52; // Low overpair (88-77)
                } else if (heroPair === topBoardRank) {
                    strength = 42; category = 'top_pair';
                    // ═══ KICKER GRANULARITY ═══ Much more important than before
                    const kicker = Math.max(...heroRanks.filter(r => r !== heroPair));
                    if (kicker >= 12) strength = 48; // TPAK (top pair ace kicker) — best top pair
                    else if (kicker >= 11) strength = 47; // TPKK (top pair king kicker)
                    else if (kicker >= 10) strength = 46; // Top pair queen/jack kicker
                    else if (kicker >= 8) strength = 44; // Top pair decent kicker
                    else strength = 41; // Top pair weak kicker — very vulnerable
                } else if (heroPair === secondBoardRank) {
                    // ═══ SECOND PAIR (new — was lumped with underpair) ═══
                    strength = 35; category = 'second_pair';
                    const kicker = Math.max(...heroRanks.filter(r => r !== heroPair));
                    if (kicker >= 12) strength = 38; // Second pair ace kicker
                    else if (kicker >= 10) strength = 37; // Second pair good kicker
                } else if (heroPair === thirdBoardRank) {
                    // ═══ THIRD PAIR (new) ═══
                    strength = 28; category = 'third_pair';
                } else if (heroPair < thirdBoardRank) {
                    // ═══ UNDERPAIR ═══
                    strength = 25; category = 'underpair';
                    // Higher underpairs are slightly better
                    if (heroPair >= 8) strength = 28;
                } else {
                    strength = 30; category = 'underpair';
                }
            } else {
                // Board paired, no hero pair
                // BUG #28 FIX: topBoardRank was out of scope here (defined in heroPair branch)
                const topBR = Math.max(...boardRanks);
                strength = 18; category = 'no_pair';
                // But if hero has overcards to the board, slightly better
                if (heroRanks.some(r => r > topBR)) strength = 20;
            }
        }
    }

    // ═══ BUG #28 FIX: BOARD-MADE HANDS — hero doesn't contribute but inherits board hand ═══
    // When board has trips or two-pair and hero doesn't hold any of those ranks,
    // the hero still "has" the board hand — kicker determines relative strength.
    // Previously these fell through to strength 18-20, causing hero to fold.
    //
    // CRITICAL STRENGTH CONTEXT (don't overvalue these hands!):
    //   Board trips (555K2): ANY pocket pair = full house, any 5 = quads.
    //     → In a typical played range, 15-25% of opponents have a pocket pair.
    //     → If they're betting into trip board, full house frequency is even higher.
    //     → Ace kicker = best NON-full-house hand, but that's a bluff-catcher, not a value hand.
    //   Board two-pair (KK552): Anyone with K or 5 = full house. That's a LOT of combos.
    //     → K and 5 are common in played ranges. Full houses are very frequent here.
    //   Board single pair (5582K): Anyone with a 5 has trips. Pairs make two-pair.
    //     → Hero is only better than worse unpaired hands.
    if (category === 'high_card' || category === 'no_pair') {
        const boardTripRanks = Object.keys(boardRankCounts || {}).filter(r => boardRankCounts[r] >= 3).map(Number);
        const boardPairRanks = Object.keys(boardRankCounts || {}).filter(r => boardRankCounts[r] >= 2).map(Number);
        const bestKicker = Math.max(...heroRanks);
        const secondKicker = Math.min(...heroRanks);

        if (boardTripRanks.length >= 1) {
            // Board trips (e.g., 5-5-5-K-2) — everyone has trips, kicker matters but...
            // ANY pocket pair = full house (beats us). Any matching rank = quads.
            // Ace kicker is the best NON-full-house, but it's essentially a bluff-catcher.
            // Against an actual betting range, we're behind a significant % of the time.
            category = 'board_trips';
            if (bestKicker >= 12) strength = 38; // Ace kicker — best bluff-catcher, not a value hand
            else if (bestKicker >= 11) strength = 34; // King kicker
            else if (bestKicker >= 9) strength = 30; // Jack/Ten kicker
            else strength = 22; // Low kicker — nearly any played hand beats us
            // Second kicker is marginal (only matters in chop scenarios like A9 vs A8)
            if (secondKicker >= 10) strength += 1;
        } else if (boardPairRanks.length >= 2) {
            // Board two-pair (e.g., K-K-5-5-2) — everyone has two-pair, kicker decides but...
            // Anyone with K = kings full. Anyone with 5 = fives full.
            // K and 5 are VERY common in played ranges. Full houses dominate.
            category = 'board_two_pair';
            if (bestKicker >= 12) strength = 35; // Ace kicker — best non-boat, still a bluff-catcher
            else if (bestKicker >= 11) strength = 32; // King kicker
            else if (bestKicker >= 9) strength = 28; // Jack/Ten kicker
            else strength = 20; // Low kicker — behind almost everything in a betting range
        } else if (boardPairRanks.length === 1) {
            // Board single pair (e.g., 5-5-K-8-2), hero doesn't pair — kicker-dependent
            // Anyone with a 5 has trips. Anyone with KK, 88, etc has two-pair.
            // Hero only beats other unpaired hands with worse kickers.
            category = 'board_pair';
            if (bestKicker >= 12) strength = 25; // Ace high on paired board — marginal
            else if (bestKicker >= 11) strength = 23; // King high
            else if (bestKicker >= 9) strength = 20; // Decent high card
            else strength = 15; // Low kicker — virtually no showdown value
        }
    }

    // ═══ BUG #39 FIX: BOARD-MADE STRAIGHT — hero doesn't contribute but still has the straight ═══
    // When the board itself forms a straight and hero's cards don't participate,
    // hero still plays the board straight. Without this check, strength stays at ~13
    // (high_card), causing the Brain to fold a guaranteed chop.
    if (category === 'high_card' || category === 'no_pair' || category === 'board_pair' || category === 'board_trips' || category === 'board_two_pair') {
        const boardUnique = [...new Set(boardRanks)].sort((a, b) => a - b);
        let boardHasStraight = false;
        // Check for regular straights on board
        for (let i = boardUnique.length - 1; i >= 4; i--) {
            if (boardUnique[i] - boardUnique[i - 4] === 4) {
                boardHasStraight = true;
                break;
            }
        }
        // Check for wheel straight on board (A-2-3-4-5)
        if (!boardHasStraight && boardUnique.includes(12) && boardUnique.includes(0) &&
            boardUnique.includes(1) && boardUnique.includes(2) && boardUnique.includes(3)) {
            boardHasStraight = true;
        }
        if (boardHasStraight && (category === 'high_card' || category === 'no_pair')) {
            // Board straight — everyone has it, hero chops with anyone who doesn't improve.
            // Anyone with a higher straight, flush, full house, etc. beats us.
            // Treat as a board-made hand: a bluff-catcher that should check/call, not fold.
            category = 'board_straight';
            const bestKicker = Math.max(...heroRanks);
            // Hero can only improve if they extend the straight or have a higher hand.
            // Base strength ~40 — it's a made hand (straight) but shared with everyone.
            if (bestKicker >= 12) strength = 45; // Ace kicker might make higher straight
            else if (bestKicker >= 10) strength = 43;
            else strength = 40; // Pure board straight, no kicker improvement
        }
    }

    // ═══ BUG #39 FIX: BOARD-MADE FLUSH — hero doesn't have the suit ═══
    // When board has 5 of a suit and hero has NO card of that suit,
    // hero plays the board flush (weakest possible flush). Anyone with ANY card of that suit beats us.
    if (category === 'high_card' || category === 'no_pair' || category === 'board_straight') {
        if (board.length === 5) {
            const boardSuitCounts = {};
            boardSuits.forEach(s => { boardSuitCounts[s] = (boardSuitCounts[s] || 0) + 1; });
            const boardFlushSuit = Object.keys(boardSuitCounts || {}).find(s => boardSuitCounts[s] >= 5);
            if (boardFlushSuit && !heroSuits.includes(boardFlushSuit)) {
                // Board has a 5-card flush and hero has no matching suit.
                // Hero plays the board flush but loses to ANYONE with a card of that suit.
                // This is even weaker than board_trips since flush is more easily beaten.
                category = 'board_flush';
                strength = 30; // Very weak — almost any opponent beats this
                const bestKicker = Math.max(...heroRanks);
                if (bestKicker >= 12) strength = 32; // Ace doesn't help suit-wise but tiny edge
            }
        }
    }

    // High card only (no board-made hands either)
    if (category === 'high_card') {
        const highCard = Math.max(...heroRanks);
        const secondCard = Math.min(...heroRanks);
        // ═══ HIGH CARD RANKING ═══ More granular
        strength = 8 + Math.min(12, highCard);
        // Two high cards is better than one
        if (secondCard >= 10) strength += 2;
        // Ace high is notably better than other high cards
        if (highCard >= 12) strength += 2;
    }

    // --- Draw detection ---
    let hasFlushDraw = false;
    let hasOESD = false;
    let hasGutshot = false;
    let hasBackdoorFlush = false; // New

    // Flush draw
    for (const suit of heroSuits) {
        const suitCount = suitCounts[suit] || 0;
        if (suitCount === 4) {
            hasFlushDraw = true;
            // ═══ NUT FLUSH DRAW BONUS ═══
            // ═══ Phase 38A FIX: Use MAX hero rank in flush suit (indexOf got the LOWER card for suited hands) ═══
            const heroFlushRank = Math.max(...heroRanks.filter((r, idx) => heroSuits[idx] === suit));
            if (heroFlushRank >= 12) {
                // Nut flush draw — worth more than non-nut
                if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 36);
            } else {
                if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 32);
            }
        }
        // ═══ BACKDOOR FLUSH DRAW ═══ (3 to a flush on flop — adds ~3-4% equity)
        if (suitCount === 3 && board.length === 3) {
            hasBackdoorFlush = true;
            strength += 2; // Small bonus
        }
    }

    // ═══ Phase 38A FIX: Straight draw detection was SWAPPED — spread===3 was gutshot (should be OESD),
    //     spread===4 was OESD (should be gutshot). Also added wheel draw detection. ═══
    const uniqueSorted = [...new Set(ranks)].sort((a, b) => a - b);
    for (let i = 0; i <= uniqueSorted.length - 4; i++) {
        const window = uniqueSorted.slice(i, i + 4);
        const spread = window[3] - window[0];

        if (spread === 3 && heroRanks.some(r => window.includes(r))) {
            // 4 CONSECUTIVE ranks (e.g., 5-6-7-8) — need 1 card on either end to complete straight
            const lowEnd = window[0] - 1;
            const highEnd = window[3] + 1;
            if (lowEnd >= 0 && highEnd <= 12) {
                hasOESD = true; // Both ends open = OESD (8 outs)
                if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 30);
            } else {
                hasGutshot = true; // At rank boundary (A-high or 2-low) = only 1 end open
                if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 25);
            }
        }
        if (spread === 4 && heroRanks.some(r => window.includes(r))) {
            // 4 ranks spanning 5 with 1 internal gap (e.g., 5-6-8-9) — gutshot (4 outs)
            hasGutshot = true;
            if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 25);
        }
    }

    // ═══ Phase 38A: WHEEL STRAIGHT DRAW detection (A-low wraps missed by numeric sort) ═══
    if (!hasOESD && !hasGutshot) {
        const hasAce = ranks.includes(12);
        if (hasAce) {
            // Check for A-2-3-4 draw (need 5 to complete wheel) — gutshot
            const wheelRanks = [0, 1, 2]; // 2, 3, 4
            const wheelCount = wheelRanks.filter(r => ranks.includes(r)).length;
            const heroInWheel = heroRanks.includes(12) || heroRanks.some(r => wheelRanks.includes(r));
            if (wheelCount >= 3 && heroInWheel) {
                // A-2-3-4 present — need 5 (rank 3) = gutshot
                if (!ranks.includes(3)) {
                    hasGutshot = true;
                    if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 25);
                }
            } else if (wheelCount === 2 && heroInWheel && ranks.includes(3)) {
                // A-x-x-4-5 pattern — check if we have 3 of A,2,3,4,5
                const fullWheelRanks = [12, 0, 1, 2, 3]; // A,2,3,4,5
                const fullWheelCount = fullWheelRanks.filter(r => ranks.includes(r)).length;
                if (fullWheelCount >= 4) {
                    hasGutshot = true;
                    if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 25);
                }
            }
        }
    }

    // ═══ DOUBLE GUTSHOT detection (new) ═══
    // Example: Hero has 79, board is 5-8-T → both 6 and J complete a straight = 8 outs like OESD
    // Count all cards that would complete a straight
    let straightCompletions = 0;
    for (let checkRank = 0; checkRank <= 12; checkRank++) {
        if (ranks.includes(checkRank)) continue; // Card already exists
        const testRanks = [...new Set([...ranks, checkRank])].sort((a, b) => a - b);
        // Check if adding this rank creates a straight involving at least one hero card
        for (let j = testRanks.length - 1; j >= 4; j--) {
            if (testRanks[j] - testRanks[j - 4] === 4) {
                const straightCards = testRanks.slice(j - 4, j + 1);
                if (heroRanks.some(r => straightCards.includes(r))) {
                    straightCompletions++;
                    break;
                }
            }
        }
    }
    // If we have 8+ straight completions and haven't already marked OESD, we have a double gutter
    if (straightCompletions >= 8 && !hasOESD) {
        hasOESD = true; // Double gutter is as good as OESD
        if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 30);
    }

    // Combo draw bonus
    if (hasFlushDraw && (hasOESD || hasGutshot)) {
        strength = Math.max(strength, 50); // Combo draws are very strong
    }

    // ═══ PAIR + DRAW BONUS ═══ (new — pair + flush draw is stronger than either alone)
    if (hasFlushDraw && (category === 'top_pair' || category === 'second_pair' || category === 'overpair')) {
        strength += 5; // Pair + flush draw
    }
    if ((hasOESD || hasGutshot) && (category === 'top_pair' || category === 'second_pair')) {
        strength += 3; // Pair + straight draw
    }

    // BUG #17 FIX: Track nut flush draw status for downstream equity calculations
    let isNutFlushDraw = false;
    if (hasFlushDraw) {
        for (const suit of heroSuits) {
            if ((suitCounts[suit] || 0) === 4) {
                const heroFlushRank = Math.max(...heroRanks.filter((r, idx) => heroSuits[idx] === suit));
                // Check if hero has the ace of the flush suit — no higher card possible
                if (heroFlushRank >= 12) isNutFlushDraw = true;
                // Also check if ace of that suit is on the board — then king-high is nut draw
                const aceOnBoard = board.some(c => RANKS.indexOf(c[0]) === 12 && c[1] === suit);
                if (!isNutFlushDraw && aceOnBoard && heroFlushRank >= 11) isNutFlushDraw = true;
            }
        }
    }

    return { strength: Math.min(100, strength), category, hasFlushDraw, hasOESD, hasGutshot, hasBackdoorFlush, isNutFlushDraw };
}

/**
 * Evaluate board wetness (dry/medium/wet) (#3 Board Texture)
 */
// ═══════════════════════════════════════════════════════════════════════════
// TURN/RIVER HEURISTIC ENGINE — WORLD-CLASS FALLBACK
// ═══════════════════════════════════════════════════════════════════════════
// PioSolver data in Supabase is richest for preflop + flop. Turn and river
// solved spots are sparser. This engine fills the gap so horses play turn
// and river at the same level as preflop and flop. It's used by getDecision()
// when the GTO module returns null for turn/river spots.
//
// Core concepts:
//   1. Equity realization: Turn/river equity is more concrete than flop
//   2. Polarization: River bets should be polarized (nuts or bluffs)
//   3. Board runout: New cards dramatically shift equity distributions
//   4. SPR dynamics: Commitment decisions crystallize on turn
//   5. Blocker effects: Key cards that block opponent's value/bluffs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * WORLD-CLASS Turn/River Heuristic Decision Engine
 * ═══════════════════════════════════════════════════════════════════
 * Called from getDecision() when PioSolver lacks turn/river data.
 *
 * This engine handles THE most important decisions in poker:
 * - Turn commitment (do we put in the 3rd barrel?)
 * - River value extraction (how thin can we value bet?)
 * - Bluff-catching (calling at the right frequency)
 * - Blocker-based bluffs (turning missed draws into profitable bluffs)
 * - Check-raise traps (OOP trapping on runouts that favor us)
 * - Equity change analysis (did this card help or hurt us?)
 * - Nut advantage awareness (who owns the nuts on this board?)
 * - Polarized sizing (river bets should be big or block)
 * - SPR commitment math (pot-committed = can't fold)
 * - Multiway tightening (fewer bluffs, more value)
 * - Personality integration (LAGs barrel more, nits check more)
 *
 * @param {Object} params
 * @returns {Object|null} { type, amount? } or null
 */
function makeTurnRiverHeuristicDecision(params) {
    if (!params || typeof params !== 'object') return { action: 'check', amount: 0, reason: 'invalid_params' }; // Bug #48: guard null params
    const {
        street, holeCards, board, handStr, position, stackBB, potSize,
        toCall, bb, numPlayers, legalActions, profileId, aggressionBias = 0,
        loosenessBias = 0, opponentAdjustment = { callMod: 0, foldMod: 0 },
        // ═══ ENRICHED DATA (new) ═══
        enrichedOpponentRead = null,     // Full read from HorsePokerAdvanced.getOpponentRead()
        oppStreetAggression = 'unknown', // very_heavy/heavy/moderate/light
        heroIsAggressor = false,         // Was hero the preflop raiser?
        counterStrategyMode = 'standard', // From selectCounterStrategy()
        streetNarrative = null,          // Multi-street action memory
        // ═══ ALWAYS-ON LIVE OBSERVER DATA ═══
        tableId = 'unknown',
        primaryOppId = null,
    } = params;

    if (street !== 'turn' && street !== 'river') return null;
    if (!holeCards || holeCards.length < 2 || !board || board.length < 4) return null;

    // ── Core evaluations ──
    const handEval = evaluatePostflopHand(holeCards, board);
    const drawEq = getDrawEquity(handEval, street);
    const boardWet = evaluateBoardWetness(board);
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;
    const facingBet = toCall > 0;
    const heroStack = stackBB * bb;
    const spr = heroStack / Math.max(1, potSize);
    const betToPot = facingBet ? toCall / Math.max(1, potSize) : 0;

    // Also evaluate the FLOP hand to compute equity delta
    const flopBoard = board.slice(0, 3);
    const flopEval = evaluatePostflopHand(holeCards, flopBoard);
    const equityDelta = handEval.strength - flopEval.strength; // Positive = improved

    // ═══ BOARD TEXTURE EVOLUTION ═══
    // Track how the board changed from flop to current street.
    // This drives range advantage shifts and bluff credibility.
    const boardEvolution = analyzeBoardEvolution(board, street);
    // boardEvolution.pfrImpact: positive = runout favors PFR
    // boardEvolution.callerImpact: positive = runout favors caller
    // boardEvolution.drawsCompleted: ['flush', 'straight'] etc.
    // boardEvolution.drawsBricked: ['flush'] etc.
    // boardEvolution.evolution: 'pfr_favorable' | 'caller_favorable' | 'dynamic' | 'static_brick' | 'neutral'

    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);
    const multiway = numPlayers >= 3;

    // ═══ UPGRADED MULTIWAY ADJUSTMENTS ═══
    // Position-aware, street-aware, texture-aware multiway framework
    const mwAdj = multiway ? getMultiwayAdjustment(numPlayers, {
        position, street, boardWetness: boardWet, heroIsAggressor
    }) : { strengthPenalty: 0, bluffReduction: 1.0, valueBetThreshold: 0, cbetFreqMod: 0, callWidthMod: 0, adjustSizing: 0 };

    // ── BOARD RUNOUT ANALYSIS ──
    const newCard = board[board.length - 1];
    const newRank = RANKS.indexOf(newCard[0]);
    const newSuit = newCard[1];
    const boardSuits = board.map(c => c[1]);
    const boardRanks = board.map(c => RANKS.indexOf(c[0]));
    const heroSuits = holeCards.map(c => c[1]);
    const heroRanks = holeCards.map(c => RANKS.indexOf(c[0]));

    // Suit analysis
    const suitCounts = {};
    boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuitCount = Math.max(...Object.values(suitCounts || {}));
    const flushPossible = maxSuitCount >= 3;
    const flushCompleted = maxSuitCount >= 3 && board.length >= 5;
    const flushDrew = maxSuitCount >= 3 && board.length === 4;
    const flushSuit = Object.entries(suitCounts || {}).find(([s, c]) => c >= 3)?.[0];

    // Straight analysis
    const uniqueRanks = [...new Set(boardRanks)].sort((a, b) => a - b);
    let maxRun = 1, curRun = 1;
    for (let i = 1; i < uniqueRanks.length; i++) {
        if (uniqueRanks[i] - uniqueRanks[i - 1] <= 2) { curRun++; maxRun = Math.max(maxRun, curRun); }
        else curRun = 1;
    }
    const straightScary = maxRun >= 4;

    // Board pairing
    const boardPaired = new Set(boardRanks).size < boardRanks.length;
    const newCardPairedBoard = boardRanks.filter(r => r === newRank).length >= 2;
    const overcard = newRank >= 10;

    // Bug #172: Wire newSuit — detect if the NEW card specifically brought the flush threat
    const newCardBroughtFlushDraw = flushDrew && newSuit === flushSuit;
    const newCardCompletedFlush = flushCompleted && newSuit === flushSuit;

    // ── SCARE CARD CLASSIFICATION ──
    // Level 0 = blank, 1 = minor, 2 = moderate, 3 = critical
    let scareLevel = 0;
    if (flushCompleted && !handEval.category?.includes('flush')) scareLevel = 3;
    // Bug #172: NEW card completed the flush = even scarier (action card just hit)
    if (newCardCompletedFlush && !handEval.category?.includes('flush')) scareLevel = 3;
    else if (straightScary && handEval.strength < 75) scareLevel = 2;
    // Bug #172: NEW card brought the flush draw = scarier than pre-existing draw
    else if (newCardBroughtFlushDraw && !heroSuits.includes(flushSuit)) scareLevel = 2;
    else if (flushDrew && !heroSuits.includes(flushSuit)) scareLevel = 2;
    else if (overcard && handEval.strength < 55) scareLevel = 1;
    else if (newCardPairedBoard && handEval.strength < 60) scareLevel = 1;

    // ── BLOCKER ANALYSIS ──
    const blocksNutFlush = flushSuit && heroSuits.includes(flushSuit) && heroRanks.includes(12);
    const blocksSecondNutFlush = flushSuit && heroSuits.includes(flushSuit) && heroRanks.includes(11);
    const blocksTopSet = heroRanks.includes(Math.max(...boardRanks));
    const blocksOverpair = heroRanks.some(r => r >= 10 && !boardRanks.includes(r));
    const hasAnyBlocker = blocksNutFlush || blocksSecondNutFlush || blocksTopSet;

    // ── STRAIGHT BLOCKER ANALYSIS (new) ──
    // Check if hero blocks key straight combinations
    const blocksStraight = straightScary && heroRanks.some(r => {
        const withinBoard = uniqueRanks.filter(br => Math.abs(br - r) <= 4);
        return withinBoard.length >= 3; // Hero card is in the middle of a connected board
    });

    // ═══ PHASE 36A: GRANULAR BLOCKER SCORING ═══
    // Beyond binary blocker detection: rank-weighted scoring system.
    // Ace-high flush blocker > King-high (removes more nut combos).
    // Unblock analysis: do we hold cards that DON'T block opponent's bluffing range?
    // Best hero call spot: block their value + unblock their bluffs.
    const blockerScore = (() => {
        let score = 0;
        // Rank-weighted flush blocker: Ace=0.25, King=0.18, Queen=0.12, Jack=0.08
        if (flushSuit) {
            for (const [i, suit] of heroSuits.entries()) {
                if (suit === flushSuit) {
                    const rank = heroRanks[i];
                    if (rank === 12) score += 0.25;       // Ace of flush suit
                    else if (rank === 11) score += 0.18;   // King of flush suit
                    else if (rank === 10) score += 0.12;   // Queen of flush suit
                    else if (rank === 9) score += 0.08;    // Jack of flush suit
                    else score += 0.03;                     // Low flush card
                }
            }
        }
        // Set/top pair blockers
        const maxBoardRank = Math.max(...boardRanks);
        if (heroRanks.includes(maxBoardRank)) score += 0.10;
        // Second-highest board card blocker
        const sortedBoardRanks = [...new Set(boardRanks)].sort((a, b) => b - a);
        if (sortedBoardRanks.length >= 2 && heroRanks.includes(sortedBoardRanks[1])) score += 0.06;
        // Overpair blockers
        if (heroRanks.some(r => r >= 11 && r > maxBoardRank)) score += 0.06;
        // Straight blockers
        if (blocksStraight) score += 0.08;
        return score;
    })();

    // ═══ PHASE 36A: UNBLOCK ANALYSIS ═══
    // For hero calls: we WANT to NOT block opponent's missed draws (their bluffing range).
    const unblocksBluffs = (() => {
        let unblockScore = 0;
        // If flush draw exists but we DON'T hold the flush suit → opponent has all missed flush combos
        if (flushSuit && !heroSuits.includes(flushSuit)) {
            unblockScore += 0.08;
        }
        // If straight draws exist but our ranks don't connect to board
        if (straightScary) {
            const heroConnects = heroRanks.some(r => {
                const nearby = uniqueRanks.filter(br => Math.abs(br - r) <= 2);
                return nearby.length >= 2;
            });
            if (!heroConnects) unblockScore += 0.06;
        }
        // Low disconnected cards = ideal unblock hand
        const heroMaxRank = Math.max(...heroRanks);
        if (heroMaxRank <= 7 && !heroSuits.includes(flushSuit || '')) {
            unblockScore += 0.04;
        }
        return unblockScore;
    })();

    // Combined hero call blocker quality: blocking value + unblocking bluffs
    const heroCallBlockerQuality = blockerScore + unblocksBluffs;

    // ── NUT ADVANTAGE ──
    // Does the board favor the caller's range or the bettor's range?
    // Low, unpaired, rainbow boards favor the PFR (preflop raiser) = nut advantage
    // High, connected, flushy boards favor the caller's range
    const avgBoardRank = boardRanks.reduce((a, b) => a + b, 0) / boardRanks.length;
    const boardFavorsPFR = avgBoardRank <= 6 && !flushPossible && !boardPaired;
    const boardFavorsCaller = avgBoardRank >= 8 || flushPossible || straightScary;

    // ═══ NUT ADVANTAGE REFINED BY AGGRESSOR STATUS + BOARD EVOLUTION ═══
    // If hero raised preflop, hero has the nut advantage on low boards.
    // If hero flat-called, hero's range is capped on many textures.
    // Board evolution shifts range advantage across streets.
    let heroHasNutAdvantage = heroIsAggressor ? boardFavorsPFR : boardFavorsCaller;
    let heroRangeCapped = !heroIsAggressor && boardFavorsPFR;

    // Board evolution can shift nut advantage on turn/river
    if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
        heroHasNutAdvantage = true;  // Runout helped PFR range
        heroRangeCapped = false;
    } else if (boardEvolution.evolution === 'caller_favorable' && !heroIsAggressor) {
        heroHasNutAdvantage = true;  // Runout helped our calling range
        heroRangeCapped = false;
    } else if (boardEvolution.evolution === 'caller_favorable' && heroIsAggressor) {
        heroHasNutAdvantage = false; // Runout helped opponent
        heroRangeCapped = true;      // Our range is now weaker relative to board
    } else if (boardEvolution.evolution === 'static_brick') {
        // Bricked runout = status quo maintained, PFR keeps advantage if they had it
        if (heroIsAggressor && boardFavorsPFR) heroHasNutAdvantage = true;
    }

    // ═══ OPPONENT PROFILE SYNTHESIS ═══
    // Merge enrichedOpponentRead (from Advanced module) + opponentAdjustment (from Supabase)
    // into a unified opponent model for this decision.
    let oppBluffFreq = 0.25; // Default: balanced opponent bluffs 25% of the time
    let oppCallFreq = 0.50;  // Default: calls 50% of bets
    let oppFoldFreq = 0.35;  // Default: folds 35%
    let oppTendency = 'balanced';
    let oppConfidence = 0; // How confident we are in our read (0-1)

    if (enrichedOpponentRead && enrichedOpponentRead.handsObserved >= 5) {
        oppBluffFreq = enrichedOpponentRead.bluffFrequency ?? oppBluffFreq;
        oppCallFreq = enrichedOpponentRead.callFrequency ?? oppCallFreq;
        oppFoldFreq = enrichedOpponentRead.foldFrequency ?? oppFoldFreq;
        oppTendency = enrichedOpponentRead.tendency ?? oppTendency;
        // Confidence scales with hands observed: 10 hands = 0.3, 30 = 0.6, 50+ = 0.85
        oppConfidence = Math.min(0.85, enrichedOpponentRead.handsObserved / 60);
    }

    // ═══ SESSION MODEL OVERLAY ═══
    // Real-time session reads can override or refine long-term Supabase reads.
    // Session data is fresher — if someone is tilting or playing differently today,
    // the session model catches it faster than the long-term model.
    // ═══ BUG FIX: Was passing hero's profileId — now passes primaryOppId (the actual opponent) ═══
    const sessionRead = primaryOppId ? getOpponentSessionRead(primaryOppId) : null;
    if (sessionRead && sessionRead.confidence >= 0.15) {
        const sw = Math.min(0.60, sessionRead.confidence);
        const lw = 1.0 - sw;
        oppFoldFreq = lw * oppFoldFreq + sw * sessionRead.foldFreq;
        oppCallFreq = lw * oppCallFreq + sw * sessionRead.callFreq;
        if (sessionRead.bluffRate !== null) {
            oppBluffFreq = lw * oppBluffFreq + sw * sessionRead.bluffRate;
        }
        if (sessionRead.confidence >= 0.30 && sessionRead.sessionTendency !== 'balanced') {
            oppTendency = sessionRead.sessionTendency;
        }
        oppConfidence = Math.min(0.90, oppConfidence + sessionRead.confidence * 0.3);
    }

    // ═══ ALWAYS-ON LIVE OBSERVER OVERLAY ═══
    // The live observer tracks every single action in real-time across all hands.
    // This is the freshest, most detailed data available — includes timing tells,
    // position-aware stats, 3-bet frequencies, c-bet/fold-to-cbet, in-hand actions.
    const liveRead = primaryOppId ? getLiveRead(profileId, tableId, primaryOppId) : null;
    let oppCBetFreqLive = null;
    let oppFoldToCBetLive = null;
    let oppThreeBetPctLive = null;
    let oppTimingTell = null;
    let oppExploits = [];
    let oppInHandActions = null;
    // Phase 46 FIX: moved declarations OUTSIDE the liveRead block so they're accessible
    // throughout the entire function (was causing ReferenceError when no live read)
    let currentActionTimingTell = 'unknown';
    let currentActionTimingMs = null;
    // Phase 47 FIX: liveCRBoost and liveCRSizeMod must be function-scoped because
    // they're used in BOTH turn AND river check-raise logic. Previously declared
    // inside the turn CR block (line ~3718), causing ReferenceError on river hands.
    let liveCRBoost = 0;
    let liveCRSizeMod = 1.0;

    if (liveRead && liveRead.confidence >= 0.10) {
        // ═══ LIVE-READ NaN/INTEGRITY GUARD (Phase 32) ═══
        // Protect against corrupted live data — NaN values would poison all downstream math
        const safeNum = (v, fallback = 0) => (typeof v === 'number' && !isNaN(v) && isFinite(v)) ? v : fallback;
        const safeFoldFreq = safeNum(liveRead.foldFreq, oppFoldFreq);
        const safeCallFreq = safeNum(liveRead.callFreq, oppCallFreq);
        const safeBluffRate = liveRead.bluffRate !== null ? safeNum(liveRead.bluffRate, null) : null;
        const safeConfidence = safeNum(liveRead.confidence, 0);

        // ═══ CONFIDENCE DECAY: Stale live data degrades over time (Phase 32/34) ═══
        // Time-based: if no new data for 2+ minutes, start decaying. Halved by ~12 min.
        const msSinceUpdate = liveRead.lastSeen ? (Date.now() - liveRead.lastSeen) : 0;
        const freshnessDecay = msSinceUpdate > 120000 ? Math.max(0.50, 1.0 - (msSinceUpdate - 120000) / 600000) : 1.0;
        const adjustedConfidence = Math.min(0.70, safeConfidence * freshnessDecay);

        // Live data gets highest priority — it's the most current
        const livew = adjustedConfidence; // Up to 70% weight, decayed by freshness
        const prevw = 1.0 - livew;

        // Override core frequencies with live data
        oppFoldFreq = prevw * oppFoldFreq + livew * safeFoldFreq;
        oppCallFreq = prevw * oppCallFreq + livew * safeCallFreq;
        oppBluffFreq = safeBluffRate !== null
            ? prevw * oppBluffFreq + livew * safeBluffRate
            : oppBluffFreq;

        // ═══ FREQUENCY SANITY CLAMP (Phase 32) ═══
        // After blending, ensure frequencies stay in valid range [0, 1]
        oppFoldFreq = Math.max(0, Math.min(1, oppFoldFreq));
        oppCallFreq = Math.max(0, Math.min(1, oppCallFreq));
        oppBluffFreq = Math.max(0, Math.min(1, oppBluffFreq));

        // Player type override — live is most accurate for session behavior
        if (safeConfidence >= 0.25 && liveRead.playerType !== 'unknown') {
            oppTendency = liveRead.playerType;
        }

        // Boost confidence with live data
        oppConfidence = Math.min(0.95, oppConfidence + safeConfidence * 0.4);

        // ═══ EXTRACT ADVANCED LIVE STATS ═══
        oppCBetFreqLive = liveRead.cBetPct;
        oppFoldToCBetLive = liveRead.foldToCBetPct;
        oppThreeBetPctLive = liveRead.threeBetPct;
        oppExploits = liveRead.exploits || [];
        oppInHandActions = liveRead.inHandActions;

        // ═══ TIMING TELL INTEGRATION ═══
        // Two layers: (1) overall pattern and (2) THIS specific action's timing.
        if (liveRead.snapFreq !== null && liveRead.longTankFreq !== null) {
            if (liveRead.snapFreq > 0.50) oppTimingTell = 'fast_player';
            else if (liveRead.longTankFreq > 0.25) oppTimingTell = 'slow_player';
        }

        // ═══ PHASE 15: CURRENT ACTION TIMING TELL ═══
        // Compare opponent's decision time on THIS action vs their personal baseline.
        // Deviation from baseline is the real tell:
        //   snap_call on river → very strong (or auto-fold-if-raised)
        //   tank_aggression → marginal value or considering bluff
        //   tank_call → drawing hand or marginal made hand
        //   snap_aggression → polarized (nuts or auto-bluff)
        // Phase 46 FIX: changed from let→assignment (outer let is in function scope now)
        currentActionTimingTell = 'unknown';
        currentActionTimingMs = null;
        if (liveRead.inHandActions && liveRead.inHandActions.lastAction) {
            const lastAct = liveRead.inHandActions.lastAction;
            currentActionTimingMs = lastAct.timing || null;

            if (currentActionTimingMs !== null && liveRead.timingProfile) {
                const streetAvg = liveRead.timingProfile[street]?.avgMs || liveRead.avgDecisionMs;
                if (streetAvg && streetAvg > 0) {
                    const ratio = currentActionTimingMs / streetAvg;
                    if (ratio < 0.40) {
                        currentActionTimingTell = lastAct.action === 'call' ? 'snap_call'
                            : (lastAct.action === 'raise' || lastAct.action === 'bet') ? 'snap_aggression'
                            : 'snap_action';
                    } else if (ratio > 2.0) {
                        currentActionTimingTell = lastAct.action === 'call' ? 'tank_call'
                            : (lastAct.action === 'raise' || lastAct.action === 'bet') ? 'tank_aggression'
                            : 'tank_action';
                    } else if (ratio > 1.5) {
                        currentActionTimingTell = 'deliberate';
                    }
                } else if (currentActionTimingMs < 3000) {
                    currentActionTimingTell = 'snap_action';
                } else if (currentActionTimingMs > 15000) {
                    currentActionTimingTell = 'tank_action';
                }
            }
        }

        // ═══ EXPLOIT PATTERN APPLICATION ═══
        // Auto-adjust strategy based on detected exploitable patterns
        if (oppExploits.includes('overfolds_to_cbet')) {
            // They fold to c-bets too much → c-bet wider, barrel more
            oppFoldFreq = Math.max(oppFoldFreq, 0.55);
        }
        if (oppExploits.includes('overcbets')) {
            // They c-bet too much → check-raise more, float wider
            oppCallFreq = Math.min(oppCallFreq, 0.40); // Don't call too much — raise instead
        }
        if (oppExploits.includes('one_and_done')) {
            // They c-bet but give up on turn → call flop c-bet wider, take pot on turn
            oppFoldFreq = Math.max(oppFoldFreq, 0.50);
        }
        if (oppExploits.includes('station_to_showdown')) {
            // They go to showdown too much → value bet thinner, don't bluff
            oppCallFreq = Math.max(oppCallFreq, 0.65);
            oppBluffFreq = Math.min(oppBluffFreq, 0.10);
        }
        if (oppExploits.includes('gives_up_easily')) {
            // They don't go to showdown → bluff more, bet wider
            oppFoldFreq = Math.max(oppFoldFreq, 0.55);
        }
        if (oppExploits.includes('frequent_check_raiser')) {
            // They check-raise a lot → bet smaller for protection, check behind more
            oppBluffFreq = Math.max(oppBluffFreq, 0.30);
        }

        console.debug(`[HorseBrain]  LIVE READ: ${primaryOppId?.substring(0, 8)} type=${liveRead.playerType} hands=${liveRead.handsObserved} conf=${Math.round(liveRead.confidence * 100)}% exploits=[${oppExploits.join(',')}]`);
    }

    // ═══ LIVE BET-SIZING TELL ANALYSIS ═══
    // Compare opponent's CURRENT bet size against their HISTORICAL average.
    // Deviations from baseline reveal hand strength:
    //   - BIGGER than usual → polarized (nuts or air)
    //   - SMALLER than usual → thin value or blocking bet
    let liveSizingTell = 'unknown';
    let liveSizingDeviation = 0;
    if (liveRead && facingBet && liveRead.confidence >= 0.20) {
        const avgBetForStreet = street === 'turn' ? liveRead.avgTurnBet
            : street === 'river' ? liveRead.avgRiverBet : liveRead.avgFlopBet;
        if (avgBetForStreet !== null && avgBetForStreet > 0) {
            liveSizingDeviation = (betToPot - avgBetForStreet) / Math.max(0.10, avgBetForStreet);
            liveSizingDeviation = Math.max(-1.0, Math.min(1.0, liveSizingDeviation));
            if (liveSizingDeviation > 0.30) liveSizingTell = 'larger_than_usual';
            else if (liveSizingDeviation < -0.30) liveSizingTell = 'smaller_than_usual';
            else liveSizingTell = 'at_baseline';
        }
        if (betToPot > 1.0 && liveRead.overbetFreq !== null && liveRead.overbetFreq < 0.08) {
            liveSizingTell = 'rare_overbet';
        }
    }

    // ═══ STREET ACTION INFERENCE ═══
    // What does the pot size tell us about opponent's range?
    // A massive pot by the turn = opponent's range is polarized (strong value or big draws)
    // A small pot = lots of checking through, ranges are wide and weak
    let oppRangeStrength = 'unknown'; // weak / medium / strong / polarized
    if (oppStreetAggression === 'very_heavy') {
        oppRangeStrength = 'polarized'; // Opponent either has the nuts or is on a big bluff
    } else if (oppStreetAggression === 'heavy') {
        oppRangeStrength = 'strong'; // Opponent likely has a real hand
    } else if (oppStreetAggression === 'moderate') {
        oppRangeStrength = 'medium'; // Standard play, mixed range
    } else if (oppStreetAggression === 'light') {
        oppRangeStrength = 'weak'; // Lots of checking, ranges are wide
    }

    // ── PERSONALITY-DRIVEN PARAMETERS ──
    const isAggressive = aggressionBias > 5;
    const isPassive = aggressionBias < -5;
    const isTight = loosenessBias < -5;
    const isLoose = loosenessBias > 5;

    // Aggression frequency for betting/raising
    const aggrFreq = Math.max(0.10, Math.min(0.90, 0.50 + aggressionBias / 40));
    // Calling frequency (passive players call more, aggressive players raise more)
    const callFreq = isPassive ? 0.70 : isAggressive ? 0.45 : 0.55;

    // ═══ POSITION-AWARE FREQUENCY MODIFIERS ═══
    // GTO solvers show massive frequency differences between IP and OOP.
    // IP: bets more often, bluffs more, thin values more, checks back less
    // OOP: checks more, check-raises more, block-bets more, folds to bets more
    const posFreqMod = {
        // IP modifiers (applied when isIP is true)
        ipValueBetBoost: isIP ? 0.08 : 0,        // IP values thinner (position guarantees showdown)
        ipBluffBoost: isIP ? 0.06 : 0,            // IP bluffs more (can realize equity on later streets)
        ipThinValueBoost: isIP ? 0.10 : 0,        // IP thin values way more (worst case checks back river)
        ipCallWidth: isIP ? 0.05 : 0,             // IP calls wider (can outplay later streets)
        // OOP modifiers (applied when !isIP)
        oopCheckFreqBoost: !isIP ? 0.10 : 0,      // OOP checks more (trapping + pot control)
        oopBlockBetBoost: !isIP ? 0.08 : 0,       // OOP block-bets more (deny big bets from IP)
        oopCheckRaiseBoost: !isIP ? 0.06 : 0,     // OOP check-raises more (only way to get value vs IP)
        oopFoldMoreVsBig: !isIP ? 0.05 : 0,       // OOP folds more to large bets (can't see free cards)
        // Street adjustments
        riverBluffIPBoost: isIP && street === 'river' ? 0.05 : 0, // River bluffs IP = last chance
        turnBarrelOOPPenalty: !isIP && street === 'turn' ? -0.06 : 0, // OOP barreling turn = risky
    };

    // ── SPR COMMITMENT ──
    const isPotCommitted = spr < 3;
    const isDeep = spr > 8;

    // ═══ SPR-DRIVEN STRATEGY FRAMEWORK ═══
    // Stack-to-pot ratio fundamentally changes correct strategy.
    // Low SPR: commit with top pair+, shove draws, no bluffs
    // Medium SPR: standard sizing, geometric planning, balanced bluffs
    // High SPR: smaller bets, more speculation, set-mining, deep implied odds
    const sprStrategy = {
        // Sizing adjustments (multiply against base sizing)
        sizeMult: spr < 3 ? 1.5 : spr < 6 ? 1.15 : spr < 12 ? 1.0 : 0.85,
        // Value bet threshold (lower SPR = commit with weaker hands)
        valueThreshold: spr < 3 ? 40 : spr < 6 ? 50 : spr < 12 ? 55 : 60,
        // Bluff reduction at low SPR (bluffs are too expensive relative to pot)
        bluffMult: spr < 3 ? 0.20 : spr < 6 ? 0.65 : spr < 12 ? 1.0 : 1.10,
        // Call width (low SPR = call wider, we're committed)
        callWidthBonus: spr < 3 ? 0.15 : spr < 6 ? 0.08 : 0,
        // Draw chase threshold (high SPR = implied odds justify chasing)
        drawOddsBonus: spr > 12 ? 0.08 : spr > 8 ? 0.04 : 0,
        // Thin value willingness (medium SPR is sweet spot)
        thinValueMult: spr < 3 ? 0.50 : spr < 6 ? 0.80 : spr < 12 ? 1.0 : 0.90,
        // Overbet willingness (low-medium SPR: overbet to jam, high SPR: no)
        overbetMult: spr < 3 ? 1.5 : spr < 6 ? 1.2 : spr < 12 ? 1.0 : 0.70,
    };

    // ═══ EDGE CASE: LIMPED POT DETECTION ═══
    // In limped pots: nobody has range advantage, ranges are wide, no c-bet dynamics.
    // Everyone connected somewhere — be more cautious with bluffs, tighter with value.
    const isLimpedPot = !heroIsAggressor && oppStreetAggression === 'light' && potSize / bb <= numPlayers * 2.5;
    if (isLimpedPot) {
        // Limped pot adjustments — applied to sprStrategy and posFreqMod
        sprStrategy.bluffMult *= 0.50;         // Halve bluff frequency (ranges are wide, someone has it)
        sprStrategy.thinValueMult *= 0.75;     // Thin value is riskier (opponents have weird hands)
        sprStrategy.sizeMult *= 0.85;          // Bet smaller (pot is small, don't build it unnecessarily)
    }

    // ═══ 3-BET POT DETECTION (TURN/RIVER) ═══
    // 3-bet pots have SPR ~3-6 on the flop → by the turn SPR is often 1-4.
    // Ranges are narrow: both players have strong holdings from preflop.
    // Key differences from single-raised pots:
    //   - Continuation barrel (turn) should be smaller in sizing (~50-60% vs 66-75%)
    //   - Bluffs should be very selective (opponent has good hands)
    //   - Value bets can be thinner (opponent is more likely to have a pair+)
    //   - Check-raises are MORE polarized (opponent's c-bet range is stronger)
    const expectedSRPSize = numPlayers * 2 * bb;
    const is3BetPot = heroIsAggressor && !isLimpedPot && potSize > expectedSRPSize * 3.5 && spr < 8;
    const is4BetPot = heroIsAggressor && !isLimpedPot && potSize > expectedSRPSize * 8.0 && spr < 4;

    if (is4BetPot) {
        // 4-bet pots on turn/river: commit with any decent hand, no bluffs
        sprStrategy.valueThreshold = Math.max(30, sprStrategy.valueThreshold - 15);
        sprStrategy.bluffMult *= 0.15;         // Almost no bluffs
        sprStrategy.sizeMult = Math.max(1.0, sprStrategy.sizeMult); // Don't undersize when committed
        sprStrategy.thinValueMult *= 1.20;     // Thin value is profitable (their range is capped)
    } else if (is3BetPot) {
        // 3-bet pots: moderate adjustments
        sprStrategy.valueThreshold = Math.max(35, sprStrategy.valueThreshold - 8);
        sprStrategy.bluffMult *= 0.55;         // Cut bluffs nearly in half
        sprStrategy.sizeMult *= 0.90;          // Slightly smaller sizing
        sprStrategy.thinValueMult *= 1.10;     // Thin value is slightly more profitable
        sprStrategy.callWidthBonus += 0.05;    // Call wider (opponent bluffs less but we have a strong range too)
    }

    // ═══ EDGE CASE: VERY SHORT STACK (< 15BB) ═══
    // Push/fold mode: no postflop fancy play, just shove strong hands and fold weak ones.
    if (stackBB < 15 && !facingBet && canRaise && street !== 'river') {
        // Short stack not facing a bet: shove any hand worth playing
        if (handEval.strength >= sprStrategy.valueThreshold - 10) {
            return { type: 'all_in' };
        }
        // Semi-bluff shoves with strong draws
        if (drawEq.outs >= 12 && Math.random() < 0.60) {
            return { type: 'all_in' };
        }
    }
    if (stackBB < 15 && facingBet) {
        // Short stack facing a bet: call/fold only, no raising (unless nuts)
        if (handEval.strength >= 70 && canRaise) {
            return { type: 'all_in' }; // Jam with strong hands
        }
        if (handEval.strength >= sprStrategy.valueThreshold - 5 && canCall) {
            return { type: 'call' }; // Call with decent hands
        }
        // Strong draws facing reasonable bet: call for implied odds
        if (drawEq.outs >= 10 && betToPot <= 0.60 && canCall) {
            return { type: 'call' };
        }
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ═══ EDGE CASE: VERY DEEP STACKS (> 200BB) ═══
    // Deep stack play: speculative hands gain value, avoid bloating pots without nuts.
    // Implied odds are massive — set-mining and draw-chasing become highly profitable.
    if (stackBB > 200) {
        // Deep stack: increase draw chasing willingness
        sprStrategy.drawOddsBonus += 0.06;
        // Deep stack: reduce thin value betting (opponent can outplay us)
        sprStrategy.thinValueMult *= 0.85;
        // Deep stack: reduce overbet willingness (too much at risk)
        sprStrategy.overbetMult *= 0.60;
    }

    // ═══ MULTI-STREET COMMITMENT TRACKER ═══
    // Tracks how committed hero is to the pot based on prior street investments.
    // Prevents illogical plays like folding the river after investing heavily on flop+turn.
    //
    // Commitment level drives: minimum call frequency, fold reluctance, bluff persistence.
    //
    // committedFraction = fraction of starting stack already in the pot
    // The higher this is, the more "priced in" we are to continue.
    const startingStack = stackBB * bb + (potSize - toCall); // Approximate starting stack
    const investedInPot = startingStack - heroStack; // How much hero has put in
    const committedFraction = investedInPot / Math.max(1, startingStack);
    const isHeavilyCommitted = committedFraction >= 0.35; // 35%+ of starting stack in pot
    const isModeratelyCommitted = committedFraction >= 0.20;

    // Commitment adjustments to sprStrategy
    if (isHeavilyCommitted && !isPotCommitted) {
        // We've put in 35%+ of our stack — don't fold easily
        sprStrategy.callWidthBonus = Math.max(sprStrategy.callWidthBonus, 0.10);
        sprStrategy.valueThreshold = Math.max(30, sprStrategy.valueThreshold - 5);
    }
    if (isModeratelyCommitted && facingBet) {
        // 20%+ invested — slight call width boost
        sprStrategy.callWidthBonus = Math.max(sprStrategy.callWidthBonus, 0.05);
    }

    // Helper to clamp bet/raise amounts
    // Phase 46 FIX: Moved BEFORE exploit intensifier (was used before definition → ReferenceError)
    const clampAmt = (amt) => {
        if (isNaN(amt) || !isFinite(amt)) amt = raiseAction?.minAmount || potSize || 1; // NaN guard
        if (!raiseAction) return amt;
        return Math.max(raiseAction.minAmount || 1, Math.min(amt, raiseAction.maxAmount || amt));
    };

    // ═══ EXPLOIT-LOOP INTENSIFIER ═══
    // When high-confidence reads exist, try to exploit BEFORE the standard decision tree.
    // This maximizes EV vs identified weak players.
    if (oppConfidence >= 0.50 && !multiway) {
        const exploitResult = applyExploitIntensifier({
            currentAction: null, currentAmount: null,
            handStrength: handEval.strength, handCategory: handEval.category,
            street, potSize, toCall, bb,
            canRaise, canCall,
            raiseAction,
            oppTendency, oppConfidence, oppBluffFreq, oppCallFreq, oppFoldFreq,
            isIP, heroIsAggressor,
            boardWetness: boardWet,
            drawOuts: drawEq.outs,
            numPlayers,
            liveRead  // Phase 28: pass live-read to exploit intensifier
        });
        if (exploitResult.exploiting && exploitResult.action) {
            console.debug(`[HorseBrain]  EXPLOIT INTENSIFIER: ${exploitResult.exploit} → ${exploitResult.action}`);
            if (exploitResult.action === 'check') return canCheck ? { type: 'check' } : null;
            // BUG #29 FIX: Never fold when check is available — strict dominance
            if (exploitResult.action === 'fold') return canCheck ? { type: 'check' } : { type: 'fold' };
            if (exploitResult.action === 'call') return canCall ? { type: 'call' } : null;
            if (raiseAction && (exploitResult.action === raiseAction.type || exploitResult.action === 'bet' || exploitResult.action === 'raise')) {
                const amt = exploitResult.amount ? clampAmt(exploitResult.amount) : null;
                return { type: raiseAction.type, amount: amt };
            }
        }
    }

    // ═══ ANTI-EXPLOIT INTEGRATION ═══
    // In counter-exploit modes, adjust strategy to be less readable
    const inStealthMode = counterStrategyMode === 'stealth' || counterStrategyMode === 'anti_bot_stealth';
    const inAntiBot = counterStrategyMode === 'anti_bot' || counterStrategyMode === 'anti_bot_stealth';

    // ═══ MULTI-STREET NARRATIVE ADJUSTMENTS ═══
    // Use our prior street actions to keep our betting line believable.
    // A horse that bet flop and checked turn shouldn't barrel the river with air.
    // A horse that checked flop and bet turn IS telling a delayed value story.
    const narrative = streetNarrative || {
        heroBetFlop: false, heroCheckedFlop: false, heroBetTurn: false,
        heroCheckedTurn: false, heroRaisedPreflop: false, barrelsInARow: 0,
        checkBehindCount: 0, storyIsConsistent: true, suggestedLine: 'balanced'
    };

    // Narrative-based aggression modifier
    // +: more likely to barrel  -: less likely to barrel
    let narrativeAggrMod = 0;
    if (narrative.suggestedLine === 'barrel' && narrative.storyIsConsistent) {
        narrativeAggrMod = 5; // Continue the story — barrel is credible
    }
    if (narrative.suggestedLine === 'check-back') {
        narrativeAggrMod = -8; // Haven't shown aggression — bluffs are less credible
    }
    if (narrative.suggestedLine === 'trap' && street === 'river') {
        narrativeAggrMod = 3; // Check-turn, bet-river = credible value/trap line
    }
    if (!narrative.storyIsConsistent && handEval.strength < 50) {
        narrativeAggrMod -= 5; // Our line doesn't make sense — don't bluff
    }
    // Triple barrel = high commitment — only do with strong hands or committed bluffs
    if (narrative.barrelsInARow >= 2 && street === 'river') {
        if (handEval.strength < 30 && !hasAnyBlocker) {
            narrativeAggrMod -= 10; // Don't triple-barrel air without blockers
        } else if (handEval.strength >= 60) {
            narrativeAggrMod += 5; // Strong hand + two prior barrels = go for it
        }
    }

    // Bug #160: Wire inAntiBot — widen bluffing range and add unpredictability vs solvers
    if (inAntiBot) {
        narrativeAggrMod += 3; // More aggressive narrative (solvers exploit predictable passivity)
    }

    // Bug #160: Wire isTight — tight personality plays more cautiously on turn/river
    if (isTight && handEval.strength < 45 && drawEq.outs < 8) {
        narrativeAggrMod -= 4; // Tight horses barrel less with marginal hands
    }

    // ════════════════════════════════════════════════════════════════
    //  T U R N
    // ════════════════════════════════════════════════════════════════
    if (street === 'turn') {

        // ═══ NOT FACING A BET ═══
        if (!facingBet) {

            // ── POT COMMITTED: Jam with decent hands ──
            if (isPotCommitted && handEval.strength >= 45 && canRaise) {
                return { type: 'all_in' };
            }

            // ── DELAYED C-BET: Checked flop as PFR, now bet turn ──
            // This is a powerful line: checking flop shows "weakness" (trapping or giving up),
            // then betting turn represents strength. Works especially well on turn cards that
            // change the board texture (overcards, flush completions, board pairs).
            if (heroIsAggressor && narrative.heroCheckedFlop && canRaise && !multiway) {
                let delayedCbetFreq = 0;

                // With strong hands: delayed c-bet for value (disguised line)
                if (handEval.strength >= 55) {
                    delayedCbetFreq = 0.65; // Strong hands should bet most of the time
                }
                // With medium hands: delayed c-bet to define hand + deny equity
                else if (handEval.strength >= 35) {
                    delayedCbetFreq = 0.35;
                    // Turn overcard hit → we can represent it
                    if (overcard && scareLevel >= 1) delayedCbetFreq += 0.12;
                }
                // With air: delayed c-bet bluff (works well on scare cards)
                else if (handEval.strength < 20) {
                    delayedCbetFreq = 0.20 + aggressionBias / 50;
                    // Turn scare card → more credible bluff
                    if (scareLevel >= 2) delayedCbetFreq += 0.12;
                    if (overcard) delayedCbetFreq += 0.08;
                    // Board paired → we can represent trips/full house
                    if (newCardPairedBoard) delayedCbetFreq += 0.08;
                    // Against over-folders, bluff more
                    if (oppFoldFreq > 0.50 && oppConfidence > 0.25) delayedCbetFreq += 0.10;
                    // Against callers, don't bluff
                    if (oppCallFreq > 0.60 && oppConfidence > 0.3) delayedCbetFreq = 0;
                }

                // ═══ BOARD EVOLUTION-DRIVEN DELAYED C-BET ═══
                // Runout that favors our range = more credible delayed c-bet
                if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                    delayedCbetFreq += 0.12; // Turn helped our range — very credible
                } else if (boardEvolution.evolution === 'caller_favorable' && heroIsAggressor) {
                    delayedCbetFreq -= 0.10; // Turn helped their range — less credible
                }
                // Completed draws: represent them if aggressor, fear them if not
                if (boardEvolution.drawsCompleted.length > 0 && heroIsAggressor) {
                    delayedCbetFreq += 0.08; // We can represent the completed draw
                }
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0 && heroIsAggressor) {
                    delayedCbetFreq += 0.06; // Draws bricked = opponent's semi-bluffs missed
                }
                // Static brick = status quo, good for delayed c-bet
                if (boardEvolution.evolution === 'static_brick') {
                    delayedCbetFreq += 0.05;
                }

                // Narrative boost
                delayedCbetFreq += narrativeAggrMod / 40;

                // ═══ LIVE-READ DELAYED C-BET (Phase 21) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // High fold freq → delayed c-bet bluffs are very profitable
                    if (liveRead.foldFreq > 0.50) delayedCbetFreq += 0.08;
                    // Low WTSD → they give up easily → delayed c-bet prints
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) delayedCbetFreq += 0.06;
                    // Calling station → only delayed c-bet with value hands
                    if (liveRead.callFreq > 0.60 && handEval.strength < 35) delayedCbetFreq -= 0.12;
                    if (liveRead.callFreq > 0.60 && handEval.strength >= 55) delayedCbetFreq += 0.06;
                    // They checked behind on flop too → if they have high c-bet%, range is CAPPED
                    if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) delayedCbetFreq += 0.08;
                }

                delayedCbetFreq = Math.max(0, Math.min(0.80, delayedCbetFreq));

                if (delayedCbetFreq > 0.05 && Math.random() < delayedCbetFreq) {
                    let sizeFrac = handEval.strength >= 55 ? 0.60 : 0.50;
                    if (boardWet === 'wet') sizeFrac += 0.08;
                    // Live sizing: smaller vs folders, bigger vs stations
                    if (liveRead && liveRead.confidence >= 0.20) {
                        if (liveRead.foldFreq > 0.50 && handEval.strength < 35) sizeFrac = Math.max(0.38, sizeFrac - 0.08);
                        if (liveRead.callFreq > 0.55 && handEval.strength >= 45) sizeFrac = Math.min(0.70, sizeFrac + 0.06);
                    }
                    console.debug(`[HorseBrain]  DELAYED C-BET: str=${handEval.strength} scare=${scareLevel} live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }

            // ── MONSTERS (set+, two pair on safe board) → Value bet ──
            if (handEval.strength >= 75 && canRaise) {
                // Slowplay traps: sometimes check monsters OOP to induce bluffs
                let trapFreq = (oppTendency === 'bluffy' && oppConfidence > 0.3) ? 0.40 : 0.25;
                // ═══ LIVE-READ TURN TRAP (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Aggressive opponents: trap MORE (they bet into us)
                    if (liveRead.aggFreq > 0.45) trapFreq += 0.10;
                    if (liveRead.aggFreq > 0.55) trapFreq += 0.06;
                    // Passive opponents: trap LESS (they check behind, no value)
                    if (liveRead.aggFreq < 0.20) trapFreq -= 0.12;
                    // High c-bet: they'll fire again, trap is profitable
                    if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) trapFreq += 0.08;
                    // High second barrel: they'll keep going
                    if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct > 0.50) trapFreq += 0.06;
                    // Timing: snap aggression = auto-bet, they'll fire if we check
                    if (currentActionTimingTell === 'snap_aggression') trapFreq += 0.08;
                }
                trapFreq = Math.max(0.05, Math.min(0.60, trapFreq));
                if (!isIP && scareLevel === 0 && Math.random() < trapFreq && !multiway) {
                    return { type: 'check' }; // Check-raise trap
                }

                // ═══ GEOMETRIC SIZING: Plan to get stacks in by river ═══
                // With monsters on the turn, we want to build the pot optimally
                // so that our river bet naturally gets us all-in.
                const streetsLeft = 2; // turn + river
                const geoSizing = getGeometricSizing(potSize, heroStack, streetsLeft, true);

                let sizeFrac;
                if (geoSizing.isJammable && spr >= 3) {
                    // Use geometric sizing to get stacks in by river
                    sizeFrac = geoSizing.sizeFraction;
                } else if (spr < 5) {
                    sizeFrac = 0.75; // Shallow: bigger to set up jam
                } else {
                    sizeFrac = geoSizing.sizeFraction; // Deep: use computed geometric
                }

                // Against calling stations, go bigger (they call anyway)
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) {
                    sizeFrac = Math.min(1.0, sizeFrac * 1.15);
                }
                // Against nits, go slightly smaller to keep them in
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3) {
                    sizeFrac = Math.max(0.45, sizeFrac * 0.85);
                }
                // ═══ LIVE-READ TURN MONSTER SIZING (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Live station overrides static reads — go even bigger
                    if (liveRead.callFreq > 0.60) sizeFrac = Math.min(1.05, sizeFrac + 0.10);
                    // Live folder — keep sizing down to prevent folds
                    if (liveRead.foldFreq > 0.55) sizeFrac = Math.max(0.40, sizeFrac - 0.08);
                    // High WTSD: they'll call big — maximize value
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) sizeFrac = Math.min(1.0, sizeFrac + 0.06);
                }

                return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
            }

            // ── STRONG HANDS (top pair+, overpair) → Continue betting on safe runouts ──
            if (handEval.strength >= 55 && scareLevel <= 1 && canRaise) {
                // Double barrel: size for protection on wet boards, thinner on dry
                // SPR-adjusted: low SPR = bigger (commit), high SPR = smaller (pot control)
                let sizeFrac = (boardWet === 'dry' ? 0.45 : boardWet === 'wet' ? 0.66 : 0.55) * sprStrategy.sizeMult;
                let betFreq = multiway ? Math.max(0.40, 0.60 + mwAdj.cbetFreqMod) : aggrFreq;

                // ═══ 3-BET POT TURN BARREL ADJUSTMENTS ═══
                // In 3-bet pots, ranges are narrow → barrel MORE for value (opponent has a pair),
                // but use SMALLER sizing (ranges are condensed, 50% pot is standard).
                if (is3BetPot) {
                    betFreq = Math.min(0.85, betFreq + 0.10); // Barrel more often (ranges are strong)
                    sizeFrac = Math.max(0.35, sizeFrac * 0.85); // Smaller sizing in 3-bet pots
                }
                if (is4BetPot && spr <= 3 && handEval.strength >= 55) {
                    return { type: 'all_in' }; // 4-bet pot + low SPR = just jam
                }

                // ═══ POSITION-AWARE BARREL FREQUENCY ═══
                betFreq += posFreqMod.ipValueBetBoost; // IP bets more for thin value
                betFreq += posFreqMod.turnBarrelOOPPenalty; // OOP barrel penalty

                // ═══ BOARD EVOLUTION-DRIVEN BARREL SIZING ═══
                // Dynamic boards = charge more (opponent's range is more uncertain)
                if (boardEvolution.evolution === 'dynamic') {
                    sizeFrac = Math.min(0.80, sizeFrac + 0.10); // Dynamic runout = bigger sizing
                }
                // Draws completed on turn = we need to bet bigger to charge
                if (boardEvolution.drawsCompleted.length > 0) {
                    sizeFrac = Math.min(0.80, sizeFrac + 0.08);
                }
                // Board got wetter = increase protection sizing
                if (boardEvolution.boardGotWetter) {
                    sizeFrac = Math.min(0.80, sizeFrac + 0.06);
                }
                // Board got drier (brick) = can bet smaller for thin value
                if (boardEvolution.boardGotDrier) {
                    sizeFrac = Math.max(0.35, sizeFrac - 0.08);
                }

                // ═══ NARRATIVE-DRIVEN BARREL ═══
                // If we bet the flop, continue the story (double barrel is credible)
                if (narrative.heroBetFlop) {
                    betFreq += 0.08; // Continuation story bonus
                }
                // If we checked flop, betting turn = delayed c-bet (also credible, but different line)
                if (narrative.heroCheckedFlop && heroIsAggressor) {
                    betFreq += 0.05; // Delayed c-bet line is strong
                    sizeFrac = Math.max(sizeFrac, 0.55); // Delayed c-bet should be decent sized
                }
                // Apply narrative aggression modifier
                betFreq += narrativeAggrMod / 30;

                // ═══ NUT ADVANTAGE ADJUSTMENT ═══
                if (heroHasNutAdvantage && heroIsAggressor) {
                    betFreq = Math.min(0.85, betFreq + 0.15);
                }
                if (heroRangeCapped) {
                    betFreq = Math.max(0.30, betFreq - 0.15);
                }

                // ═══ OPPONENT-AWARE BARREL FREQUENCY ═══
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3) {
                    betFreq = Math.min(0.80, betFreq + 0.12);
                }
                if (oppCallFreq > 0.65 && oppConfidence > 0.3) {
                    if (handEval.strength < 60) betFreq = Math.max(0.25, betFreq - 0.20);
                }

                // ═══ IN-HAND SEQUENCE → TURN BARREL ADJUSTMENT ═══
                if (oppInHandActions) {
                    const inHandActs = oppInHandActions.actions || [];
                    const oppFlopAct = inHandActs.find(a => a.street === 'flop');
                    const oppPreflopAct = inHandActs.find(a => a.street === 'preflop');
                    // Cold-called preflop + called flop = capped range → barrel wider
                    if (oppPreflopAct && oppPreflopAct.action === 'call' && oppFlopAct && oppFlopAct.action === 'call') {
                        betFreq += 0.08;
                        if (handEval.strength < 30 && scareLevel >= 2) betFreq += 0.06;
                    }
                    // 3-bet preflop + called flop = strong range → careful
                    if (oppPreflopAct && oppPreflopAct.action === 'raise' && (oppPreflopAct.facingRaiseCount || 0) >= 1
                        && oppFlopAct && oppFlopAct.action === 'call') {
                        if (handEval.strength < 55) betFreq -= 0.10;
                        sizeFrac = Math.max(0.35, sizeFrac - 0.05);
                    }
                    // Limped preflop → very wide → barrel aggressively
                    if (oppPreflopAct && oppPreflopAct.action === 'call' && oppPreflopAct.isOpenAction) {
                        betFreq += 0.10;
                    }
                }

                // ═══ PHASE 16: LIVE-READ DRIVEN TURN SIZING ═══
                // Dynamically adjust bet size based on what we know about THIS opponent.
                // Core principle: size for max EV — bigger when they call too wide, smaller when they fold too much.
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Against calling stations: SIZE UP value bets — they call too wide
                    if (liveRead.callFreq > 0.55) {
                        sizeFrac = Math.min(0.85, sizeFrac + 0.08);
                    }
                    // Against folders: SIZE DOWN to keep them in range
                    if (liveRead.foldFreq > 0.50) {
                        sizeFrac = Math.max(0.33, sizeFrac - 0.08);
                    }
                    // Against frequent check-raisers: SIZE DOWN to reduce risk (they punish big bets)
                    if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct > 0.10 && !isIP) {
                        sizeFrac = Math.max(0.35, sizeFrac - 0.06);
                    }
                    // Against overbetters: they're polarized → size normally, they'll call or fold either way
                    // Against slow players (long tanks): they think more = can extract more
                    if (currentActionTimingTell === 'tank_call') {
                        sizeFrac = Math.min(0.80, sizeFrac + 0.05); // They tanked and called = marginal → size up next street
                    }
                }

                betFreq = Math.max(0.10, Math.min(0.90, betFreq));
                if (Math.random() < betFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }

            // ── EQUITY IMPROVED: We picked up equity → barrel ──
            // BUG #25 FIX: Was barreling at strength >= 45 which is marginal and can't stand a raise.
            // A hand that improved from 30→45 is still weak — only barrel when we're genuinely strong (55+)
            // OR when the improvement was massive (25+ delta) and we have some showdown value.
            if (equityDelta >= 15 && canRaise) {
                const shouldBarrelImprovement = handEval.strength >= 55 || (equityDelta >= 25 && handEval.strength >= 45);
                if (shouldBarrelImprovement) {
                    // Board improved us (e.g., hit two pair, set, flush draw completed)
                    const sizeFrac = handEval.strength >= 65 ? 0.66 : 0.50; // Stronger hand = bigger bet
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }

            // ── STRONG DRAWS: Semi-bluff the turn ──
            if (drawEq.outs >= 9 && canRaise) {
                let semiFreq = Math.min(0.65, 0.40 + aggressionBias / 30);
                // Against opponents who over-fold, semi-bluff more
                if (oppFoldFreq > 0.50 && oppConfidence > 0.25) {
                    semiFreq = Math.min(0.75, semiFreq + 0.12);
                }
                // ═══ LIVE-READ TURN SEMI-BLUFF DRAW (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Folders: semi-bluff aggressively
                    if (liveRead.foldFreq > 0.50) semiFreq += 0.10;
                    // Fold-to-raise: direct semi-bluff profitability
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.50) semiFreq += 0.08;
                    // Calling stations: check more (realize equity, no fold equity)
                    if (liveRead.callFreq > 0.60) semiFreq -= 0.15;
                    // Low WTSD: they give up — barrel draws for fold equity
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) semiFreq += 0.08;
                }
                // In stealth mode, randomize sizing more to avoid patterns
                if (Math.random() < semiFreq * (multiway ? mwAdj.bluffReduction : 1.0)) {
                    let sizeFrac = drawEq.outs >= 14 ? 0.65 : 0.50; // Bigger with combo draws
                    if (inStealthMode) sizeFrac += (Math.random() * 0.10 - 0.05); // +/- 5% noise
                    if (inAntiBot) sizeFrac += (Math.random() * 0.12 - 0.06); // Bug #160: ±6% noise vs bots
                    // Live-read sizing: smaller vs folders (saves chips when called)
                    if (liveRead && liveRead.confidence >= 0.20 && liveRead.foldFreq > 0.55) {
                        sizeFrac = Math.max(0.38, sizeFrac - 0.08);
                    }
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }

            // ── SCARE CARD: Slow down with non-nuts ──
            if (scareLevel >= 2 && handEval.strength < 65) {
                // But if opponent is weak-tight, they're scared too — bet sometimes to steal
                let scareStealFreq = 0.25;
                // ═══ LIVE-READ SCARE CARD EXPLOIT (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Live folders: barrel scare cards more
                    if (liveRead.foldFreq > 0.50) scareStealFreq += 0.12;
                    // Live WTSD low: they shut down on scary runouts
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) scareStealFreq += 0.08;
                    // Stations: don't bluff scare cards
                    if (liveRead.callFreq > 0.55) scareStealFreq -= 0.15;
                }
                if ((oppTendency === 'weak-tight' && oppConfidence > 0.3) || scareStealFreq > 0.30) {
                    if (canRaise && Math.random() < scareStealFreq) {
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.50)) };
                    }
                }
                return { type: 'check' };
            }

            // ── MEDIUM HANDS IP: Showdown Value + Pot Control Framework ──
            if (isIP && handEval.strength >= 30 && handEval.strength < 55) {

                // ═══ SHOWDOWN VALUE ASSESSMENT ═══
                // Medium hands IP have real showdown value — the question is whether
                // betting gains more EV than checking to showdown.
                const hasShowdownValue = handEval.strength >= 35;
                const isVulnerable = boardWet === 'wet' || drawEq.outs >= 4; // Can be outdrawn
                const isProtected = boardWet === 'dry' && scareLevel === 0; // Safe to check

                // ═══ LIVE-READ MEDIUM HAND POT CONTROL (Phase 22) ═══
                let liveCallStationMod = 0;
                let liveFolderMod = 0;
                let liveCheckRaiseThreat = false;
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Stations: bet thinner for value, they call with worse
                    if (liveRead.callFreq > 0.55) liveCallStationMod = 0.12;
                    if (liveRead.callFreq > 0.65) liveCallStationMod = 0.18;
                    // Folders: don't bother betting medium hands
                    if (liveRead.foldFreq > 0.55) liveFolderMod = -0.10;
                    // Check-raise threats: be careful betting medium IP
                    if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct > 0.12) {
                        liveCheckRaiseThreat = true;
                    }
                    // Aggressive opponents: check back more for pot control
                    if (liveRead.aggFreq > 0.45 && handEval.strength < 42) liveFolderMod -= 0.08;
                }

                // ═══ BET vs CHECK DECISION TREE ═══

                // 1. Against weak ranges: thin value bet (they call with worse)
                if (oppRangeStrength === 'weak' && handEval.strength >= 40 && canRaise) {
                    let thinBetFreq = 0.35;
                    if (oppCallFreq > 0.55 && oppConfidence > 0.3) thinBetFreq = 0.50;
                    // Narrative: if we bet flop, continued story makes this credible
                    if (narrative.heroBetFlop) thinBetFreq += 0.06;
                    // Live-read: stations = bet more, check-raise threat = bet less
                    thinBetFreq += liveCallStationMod;
                    thinBetFreq += liveFolderMod;
                    if (liveCheckRaiseThreat && handEval.strength < 42) thinBetFreq -= 0.12;
                    let thinBetSizing = 0.40;
                    if (liveRead && liveRead.confidence >= 0.20 && liveRead.callFreq > 0.60) thinBetSizing = 0.48;
                    if (Math.random() < thinBetFreq) {
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * thinBetSizing)) };
                    }
                }

                // 2. Vulnerable medium hands on wet boards: bet for protection
                if (isVulnerable && handEval.strength >= 40 && canRaise && !multiway) {
                    let protectFreq = 0.30;
                    if (boardWet === 'wet' && drawEq.outs >= 6) protectFreq = 0.40;
                    // If we've been barreling, continue (credible)
                    if (narrative.heroBetFlop && narrative.storyIsConsistent) protectFreq += 0.08;
                    // Live-read: bet more for protection vs stations, less vs check-raisers
                    protectFreq += liveCallStationMod * 0.5;
                    if (liveCheckRaiseThreat) protectFreq -= 0.10;
                    let protectSizing = 0.45;
                    if (liveRead && liveRead.confidence >= 0.20 && liveRead.callFreq > 0.55) protectSizing = 0.52;
                    if (Math.random() < protectFreq) {
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * protectSizing)) };
                    }
                }

                // 3. Protected medium hands on dry boards: check for pot control
                if (isProtected && hasShowdownValue) {
                    // Live-read override: vs extreme stations, bet even on dry boards
                    if (liveCallStationMod >= 0.18 && handEval.strength >= 42 && canRaise) {
                        if (Math.random() < 0.30) {
                            return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.35)) };
                        }
                    }
                    // Check back is optimal — our hand plays well at showdown
                    // and opponent's calling range beats us
                    return { type: 'check' };
                }

                // 4. Medium-weak hands: always check for pot control
                return { type: 'check' };
            }

            // ═══ TURN PROBE BET FRAMEWORK (Non-Aggressor IP) ═══
            // When we're the caller and IP, opponent checked to us on the turn.
            // A probe bet takes advantage of our position to:
            // 1. Steal the pot with weak hands on favorable cards
            // 2. Extract thin value from opponent's capped checking range
            // 3. Deny free cards to opponent's draws
            if (!heroIsAggressor && isIP && canRaise && !multiway) {
                let probeFreq = 0;
                let probeSizing = 0.50; // Default probe = half pot

                // ═══ SCARE CARD PROBE ═══
                // Turn card that scares opponent (overcard, flush card, board pair)
                // → probe to represent the scare card
                if (scareLevel >= 1 && handEval.strength >= 20) {
                    probeFreq = 0.30 + aggressionBias / 40;
                    if (scareLevel >= 2) probeFreq += 0.10;
                    // Board evolution: if runout favors our perceived range, probe more
                    if (boardEvolution.evolution === 'caller_favorable') probeFreq += 0.08;
                    probeSizing = scareLevel >= 2 ? 0.55 : 0.45;
                }

                // ═══ OPPONENT WEAKNESS PROBE ═══
                // Opponent checked to us after they were the aggressor → sign of weakness
                if (heroIsAggressor === false && oppStreetAggression !== 'very_heavy') {
                    if (handEval.strength >= 30 && handEval.strength < 55) {
                        probeFreq = Math.max(probeFreq, 0.25);
                        // Against weak-tight, probe with anything
                        if (oppTendency === 'weak-tight' && oppConfidence > 0.3) {
                            probeFreq = Math.max(probeFreq, 0.40);
                        }
                        probeSizing = 0.40; // Smaller probe for thin value
                    }
                }

                // ═══ DRAW DENIAL PROBE ═══
                // On wet boards, probe to charge opponent's draws
                if (boardWet === 'wet' && handEval.strength >= 35 && handEval.strength < 65) {
                    probeFreq = Math.max(probeFreq, 0.35);
                    probeSizing = Math.max(probeSizing, 0.55); // Bigger to charge
                }

                // ═══ BOARD EVOLUTION PROBE ═══
                // Bricked draws on turn → opponent's semi-bluffs missed → probe to take pot
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    probeFreq += 0.08;
                }

                // Against callers, probe less (they call everything)
                if (oppCallFreq > 0.65 && oppConfidence > 0.3 && handEval.strength < 45) {
                    probeFreq = 0; // Don't probe into a calling station with air
                }
                // ═══ 3-BET POT: Probe less in 3-bet pots (opponent's checking range is stronger) ═══
                if (is3BetPot) {
                    probeFreq *= 0.65; // 35% reduction (opponent checked with a strong range)
                    probeSizing = Math.max(0.33, probeSizing - 0.08); // Smaller probes
                }

                // ═══ LIVE-READ PROBE BET ADJUSTMENTS (Phase 18) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Opponent's check-behind frequency: if they c-bet a lot but checked → very capped
                    if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) {
                        probeFreq += 0.10; // They usually c-bet → check = weakness → probe more
                    }
                    // Opponent's fold-to-probe/bet: high folders = probe paradise
                    if (liveRead.foldFreq > 0.50) {
                        probeFreq += 0.08;
                        probeSizing = Math.max(0.33, probeSizing - 0.05); // Smaller probe saves chips
                    }
                    // Opponent who calls a lot: probe less with air, more with value
                    if (liveRead.callFreq > 0.55 && handEval.strength < 40) {
                        probeFreq -= 0.10; // Don't probe stations with weak hands
                    } else if (liveRead.callFreq > 0.55 && handEval.strength >= 45) {
                        probeFreq += 0.06; // Probe for value vs stations
                        probeSizing = Math.min(0.65, probeSizing + 0.08); // Bigger for value
                    }
                    // WTSD: low WTSD = they give up easily → probe more aggressively
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) {
                        probeFreq += 0.08;
                    }
                    // Timing tell: if opponent snap-checked to us → weakness tell → probe
                    if (currentActionTimingTell === 'snap_call' || currentActionTimingTell === 'deliberate') {
                        // No adjustment for non-check timing tells
                    }
                    if (liveRead.inHandActions && liveRead.inHandActions.lastAction) {
                        const la = liveRead.inHandActions.lastAction;
                        if (la.action === 'check' && la.timing) {
                            const avg = liveRead.timingProfile?.turn?.avgMs || liveRead.avgDecisionMs;
                            if (avg && avg > 0 && la.timing / avg < 0.40) {
                                probeFreq += 0.08; // Snap check = no interest in pot
                                probeSizing = Math.max(0.33, probeSizing - 0.03);
                            } else if (avg && avg > 0 && la.timing / avg > 1.8) {
                                probeFreq -= 0.06; // Tank check = trapping?
                            }
                        }
                    }
                }

                probeFreq = Math.max(0, Math.min(0.55, probeFreq));
                if (probeFreq > 0.05 && Math.random() < probeFreq) {
                    console.debug(`[HorseBrain]  TURN PROBE: str=${handEval.strength} scare=${scareLevel} opp=${oppTendency} size=${Math.round(probeSizing * 100)}% live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * probeSizing)) };
                }
            }

            // ═══ OOP TURN LEAD (Non-Aggressor OOP — Delayed Donk) ═══
            // When we're the caller OOP and the PFR checked back flop (showing weakness),
            // we should lead the turn with a wider range than normal.
            // GTO principle: when PFR gives up c-bet, their range is capped → we can attack.
            if (!heroIsAggressor && !isIP && canRaise && !multiway) {
                const pfrCheckedFlop = narrative.heroCheckedFlop && !narrative.heroBetFlop;
                if (pfrCheckedFlop) {
                    // ── VALUE LEAD: Strong hands that benefit from building pot ──
                    if (handEval.strength >= 55) {
                        let oopLeadFreq = 0.45;
                        let valuLeadSize = boardWet === 'wet' ? 0.60 : 0.50;
                        // Wet board = lead for protection
                        if (boardWet === 'wet') oopLeadFreq += 0.10;
                        // Scare card = credible lead
                        if (scareLevel >= 1) oopLeadFreq += 0.08;
                        // Board evolution: runout favors our range
                        if (boardEvolution.evolution === 'caller_favorable') oopLeadFreq += 0.10;
                        if (boardEvolution.evolution === 'pfr_favorable') oopLeadFreq -= 0.10;

                        // ═══ LIVE-READ OOP VALUE LEAD (Phase 19) ═══
                        if (liveRead && liveRead.confidence >= 0.20) {
                            // They checked back flop (high c-bet player) → capped → lead more
                            if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) oopLeadFreq += 0.08;
                            // Calling station → lead for value with bigger sizing
                            if (liveRead.callFreq > 0.55) {
                                oopLeadFreq += 0.06;
                                valuLeadSize = Math.min(0.70, valuLeadSize + 0.08);
                            }
                            // High fold freq → smaller lead to save chips when folding to raise
                            if (liveRead.foldFreq > 0.50) valuLeadSize = Math.max(0.40, valuLeadSize - 0.06);
                        }

                        oopLeadFreq = Math.max(0.20, Math.min(0.75, oopLeadFreq));
                        if (Math.random() < oopLeadFreq) {
                            console.debug(`[HorseBrain]  OOP TURN LEAD (value): str=${handEval.strength} scare=${scareLevel} live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                            return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * valuLeadSize)) };
                        }
                    }
                    // ── PROTECTION LEAD: Medium hands on wet boards ──
                    if (handEval.strength >= 35 && handEval.strength < 55 && boardWet === 'wet') {
                        let protectLeadFreq = 0.25;
                        let protectSize = 0.45;
                        if (drawEq.outs >= 4) protectLeadFreq += 0.08; // We're vulnerable
                        if (oppTendency === 'weak-tight' && oppConfidence > 0.3) protectLeadFreq += 0.10;

                        // ═══ LIVE-READ OOP PROTECTION LEAD (Phase 19) ═══
                        if (liveRead && liveRead.confidence >= 0.20) {
                            // Against players with many draws (check-behind on wet = drawing)
                            if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.60) {
                                protectLeadFreq += 0.08; // They checked = weak → protect + charge
                            }
                            // Against stations: lead bigger for value/protection
                            if (liveRead.callFreq > 0.55) protectSize = Math.min(0.55, protectSize + 0.06);
                        }

                        protectLeadFreq = Math.max(0, Math.min(0.45, protectLeadFreq));
                        if (Math.random() < protectLeadFreq) {
                            console.debug(`[HorseBrain]  OOP TURN LEAD (protect): str=${handEval.strength} live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                            return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * protectSize)) };
                        }
                    }
                    // ── BLUFF LEAD: Air + blockers on favorable runout ──
                    if (handEval.strength < 20 && aggressionBias > 0) {
                        let bluffLeadFreq = 0.12 + aggressionBias / 60;
                        let bluffLeadSize = 0.55;
                        if (scareLevel >= 2) bluffLeadFreq += 0.10;
                        if (boardEvolution.evolution === 'caller_favorable') bluffLeadFreq += 0.06;
                        if (oppFoldFreq > 0.45 && oppConfidence > 0.3) bluffLeadFreq += 0.08;
                        if (oppCallFreq > 0.60 && oppConfidence > 0.3) bluffLeadFreq = 0;

                        // ═══ LIVE-READ OOP BLUFF LEAD (Phase 19) ═══
                        if (liveRead && liveRead.confidence >= 0.20) {
                            // They checked back flop → if high c-bet% player, range is VERY weak
                            if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) {
                                bluffLeadFreq += 0.10; // They always c-bet → check = nothing
                            }
                            // High fold frequency → bluff lead is very profitable
                            if (liveRead.foldFreq > 0.50) {
                                bluffLeadFreq += 0.06;
                                bluffLeadSize = Math.max(0.40, bluffLeadSize - 0.08); // Smaller saves chips
                            }
                            // Low WTSD → they give up easily
                            if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) bluffLeadFreq += 0.06;
                            // Calling station → NEVER bluff lead
                            if (liveRead.callFreq > 0.60) bluffLeadFreq = 0;
                        }

                        bluffLeadFreq = Math.max(0, Math.min(0.30, bluffLeadFreq));
                        if (Math.random() < bluffLeadFreq) {
                            console.debug(`[HorseBrain]  OOP TURN LEAD (bluff): str=${handEval.strength} scare=${scareLevel} live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                            return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * bluffLeadSize)) };
                        }
                    }
                }
            }

            // ── BLUFF: Bet missed draws on favorable boards to represent improvement ──
            if (handEval.strength < 20 && canRaise && !multiway) {
                let bluffFreq = 0.18 + aggressionBias / 50 + posFreqMod.ipBluffBoost + posFreqMod.turnBarrelOOPPenalty;

                // ═══ BLOCKER-BASED TURN BLUFF WEIGHTING ═══
                // Turn bluffs with blockers are far more profitable — opponent has fewer
                // value combos so they fold at higher frequency and we risk less.
                if (blocksNutFlush) bluffFreq += 0.12;
                if (blocksSecondNutFlush) bluffFreq += 0.08;
                if (blocksTopSet) bluffFreq += 0.06;
                if (blocksOverpair) bluffFreq += 0.05;
                if (blocksStraight) bluffFreq += 0.06;

                // Blocker combo bonus (same as river logic)
                const turnBluffBlockerCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
                if (turnBluffBlockerCount >= 2) bluffFreq += 0.06;

                // ═══ NARRATIVE-DRIVEN BLUFF CREDIBILITY ═══
                // If we c-bet flop, turn barrel bluff is a continuation of our story
                if (narrative.heroBetFlop && narrative.storyIsConsistent) {
                    bluffFreq += 0.08; // Our story says "I have it" — keep selling
                }
                // If we checked flop, a turn bet with air is a delayed c-bet bluff
                if (narrative.heroCheckedFlop && heroIsAggressor) {
                    bluffFreq += 0.05; // Delayed c-bet bluff — credible but weaker
                }
                // If we haven't shown aggression at all, bluffing now looks suspicious
                if (!narrative.heroBetFlop && !heroIsAggressor) {
                    bluffFreq -= 0.06; // No story to tell
                }
                // No blockers + no story = terrible bluff candidate
                if (turnBluffBlockerCount === 0 && !narrative.storyIsConsistent) {
                    bluffFreq -= 0.08;
                }
                bluffFreq += narrativeAggrMod / 50;

                // ═══ BOARD + AGGRESSOR STATUS ═══
                if (heroIsAggressor && boardFavorsPFR) bluffFreq += 0.10;
                // Scare card on turn = great bluff opportunity
                if (scareLevel >= 1 && turnBluffBlockerCount >= 1) bluffFreq += 0.06;
                // Board paired on turn — represent trips
                if (newCardPairedBoard) bluffFreq += 0.05;

                // ═══ PHASE 36C: BOARD EVOLUTION-DRIVEN TURN BLUFF (merged — was duplicated) ═══
                // The turn card's impact on the board drives bluff credibility.
                // Draw completing = aggressor can rep it. Bricked draws = mixed effect.
                if (boardEvolution.drawsCompleted.length > 0 && heroIsAggressor) {
                    bluffFreq += 0.10; // Turn completed a draw — we rep having it
                }
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    // Two competing effects:
                    // (1) Opponent's semi-bluffs are now air → their overall range is weaker
                    // (2) Their CALLING range has more showdown value → they're stickier
                    // Net: slight negative unless we have blockers to their value hands
                    if (turnBluffBlockerCount >= 2) {
                        bluffFreq += 0.02; // Blockers + bricked draws = still profitable
                    } else {
                        bluffFreq -= 0.03; // Stickier calling range outweighs weaker overall range
                    }
                }
                if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                    bluffFreq += 0.06; // Runout favors our perceived range → credible barrel
                }
                if (boardEvolution.evolution === 'caller_favorable' && heroIsAggressor) {
                    bluffFreq -= 0.10; // Runout helped their range → bad bluff spot
                }
                if (boardEvolution.evolution === 'static_brick') {
                    if (heroIsAggressor) {
                        bluffFreq += 0.04; // Brick = safe to continue barreling
                    } else {
                        bluffFreq -= 0.06; // Blank card, non-aggressor bluff is uncredible
                    }
                }

                // Against over-folders, bluff more
                if (oppFoldFreq > 0.50 && oppConfidence > 0.25) bluffFreq += 0.08;
                // Against calling stations, don't bluff
                if (oppCallFreq > 0.65 && oppConfidence > 0.3) bluffFreq = 0;

                // ═══ PHASE 15: CURRENT-ACTION TIMING TELL → BLUFF ADJUSTMENT ═══
                // Opponent's timing on THIS action tells us how they feel about their hand.
                if (currentActionTimingTell !== 'unknown' && oppConfidence >= 0.20) {
                    if (currentActionTimingTell === 'tank_call') {
                        // Tank-call on prior street = marginal hand → barrel them off
                        bluffFreq += 0.08;
                    } else if (currentActionTimingTell === 'snap_call') {
                        // Snap-call = committed/strong → reduce bluffing
                        bluffFreq -= 0.06;
                    } else if (currentActionTimingTell === 'deliberate') {
                        // Took a bit long = not auto-strength → slight barrel boost
                        bluffFreq += 0.03;
                    }
                }

                // ═══ SPR-DRIVEN BLUFF ADJUSTMENT ═══
                // Low SPR = bluffs are too expensive (committing chips with air)
                // High SPR = bluffs have better risk:reward (small bet relative to stacks)
                bluffFreq *= sprStrategy.bluffMult;

                // ═══ COMMITMENT-DRIVEN BLUFF ADJUSTMENT ═══
                // If we're already heavily invested, bluffing the turn is LESS valuable:
                // - We've already spent chips, so folding loses our investment
                // - But bluffing ADDS more investment with no equity
                // - Better to check and see a free river (if IP) or fold to pressure
                // Exception: if our story demands a barrel, bluff to maintain credibility
                if (isHeavilyCommitted && narrative.barrelsInARow < 1) {
                    bluffFreq *= 0.50; // Heavily committed with no story → don't bluff
                }
                if (isModeratelyCommitted && turnBluffBlockerCount === 0) {
                    bluffFreq *= 0.70; // Moderate investment + no blockers → reduce bluffs
                }

                // ═══ 3-BET POT TURN BLUFF ═══
                // 3-bet pots: opponent has a strong range → bluffs succeed less often
                if (is3BetPot) bluffFreq *= 0.45; // Nearly halve bluffs
                if (is4BetPot) bluffFreq = 0; // Never bluff on turn in 4-bet pots

                // ═══ LIVE-READ TURN BLUFF FREQUENCY (Phase 21) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    if (liveRead.foldFreq > 0.55) bluffFreq += 0.06;
                    if (liveRead.foldFreq < 0.30) bluffFreq -= 0.08;
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) bluffFreq += 0.06;
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) bluffFreq += 0.05;
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.35) bluffFreq -= 0.06;
                    if (liveRead.callFreq > 0.60) bluffFreq = Math.min(bluffFreq, 0.05);
                }

                // GTO cap: turn bluffs should not exceed ~40% even with max blockers + favorable reads
                bluffFreq = Math.max(0, Math.min(0.40, bluffFreq));

                if (Math.random() < bluffFreq) {
                    // ═══ BLOCKER-AWARE TURN BLUFF SIZING ═══
                    let turnBluffFrac = 0.55 * sprStrategy.sizeMult; // SPR-adjusted
                    // With premium blockers, can go bigger (opponent folds more)
                    if (turnBluffBlockerCount >= 2 && oppFoldFreq > 0.40) {
                        turnBluffFrac = 0.66 + Math.random() * 0.14; // 66-80% pot
                    }
                    // Against weak-tight, overbet to max fold equity
                    if (oppTendency === 'weak-tight' && oppConfidence > 0.3 && turnBluffBlockerCount >= 1) {
                        turnBluffFrac = 0.75 + Math.random() * 0.25; // 75-100% pot
                    }
                    // ═══ PHASE 36C: BOARD EVOLUTION-DRIVEN TURN BLUFF SIZING ═══
                    // When repping a completed draw, size bigger (our "value" range would overbet)
                    if (boardEvolution.drawsCompleted.length > 0 && heroIsAggressor) {
                        turnBluffFrac = Math.min(0.85, turnBluffFrac + 0.10);
                    }
                    // PFR-favorable runout + aggressor = size up for credibility
                    if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                        turnBluffFrac = Math.min(0.80, turnBluffFrac + 0.06);
                    }

                    // ═══ PHASE 16: LIVE-READ DRIVEN BLUFF SIZING ═══
                    // Size bluffs for MAXIMUM fold equity based on what we know about opponent.
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Against folders: size UP → maximize fold equity
                        if (liveRead.foldFreq > 0.50) {
                            turnBluffFrac = Math.min(0.90, turnBluffFrac + 0.12);
                        }
                        // Against stations: size DOWN → minimize loss when caught
                        if (liveRead.callFreq > 0.55) {
                            turnBluffFrac = Math.max(0.40, turnBluffFrac - 0.10);
                        }
                        // Opponent folds to raises a lot → go bigger
                        if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) {
                            turnBluffFrac = Math.min(0.95, turnBluffFrac + 0.10);
                        }
                        // Tank-call from opponent on prior street → they're marginal → size up
                        if (currentActionTimingTell === 'tank_call') {
                            turnBluffFrac = Math.min(0.85, turnBluffFrac + 0.08);
                        }
                    }

                    console.debug(`[HorseBrain]  TURN BLUFF: ${handStr} blockers=${turnBluffBlockerCount} story=${narrative.suggestedLine} opp=${oppTendency} — ${Math.round(turnBluffFrac * 100)}% pot`);
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * turnBluffFrac)) };
                }
            }

            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ═══ FACING A BET ON TURN ═══

        // ═══ FACING A RAISE ON TURN (Hero bet, got raised) ═══
        // When hero already bet this street and opponent raises, the dynamic changes:
        // - Opponent's raising range is very strong (they raised a bet, not just bet into a check)
        // - Our range is ALSO strong (we already bet, showing strength)
        // - Key decision: commit with value, call with draws/sets, fold overvalued hands
        // Detection: narrative shows we bet turn AND we're now facing a call amount
        const heroAlreadyBetTurn = narrative.heroBetTurn && facingBet;
        const facingTurnRaise = heroAlreadyBetTurn && betToPot >= 0.45;
        if (facingTurnRaise) {
            // ═══ LIVE-READ FACING TURN RAISE (Phase 22) ═══
            // Opponent raised our turn bet — their range is polarized (nuts or bluff).
            // Live data tells us HOW OFTEN they raise (check-raise frequency) to calibrate.
            let turnRaiseLiveAdj = 0; // Positive = call wider, negative = fold more
            if (liveRead && liveRead.confidence >= 0.20) {
                // High check-raise % → they raise a lot → range is wider → call wider
                if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct > 0.12) turnRaiseLiveAdj += 6;
                // Low check-raise % → rare raiser → they have it → fold more
                if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct < 0.05) turnRaiseLiveAdj -= 8;
                // High aggression → they raise wide → call wider
                if (liveRead.aggFreq > 0.45) turnRaiseLiveAdj += 4;
                // Low aggression → passive player raising = real → fold more
                if (liveRead.aggFreq < 0.20) turnRaiseLiveAdj -= 6;
                // Timing: snap-raise = polarized (auto-bluff or nuts)
                if (currentActionTimingTell === 'snap_aggression' && blocksNutFlush) turnRaiseLiveAdj += 5;
                if (currentActionTimingTell === 'snap_aggression' && !blocksNutFlush) turnRaiseLiveAdj -= 2;
                // Tank-raise = usually very strong (deliberated then committed)
                if (currentActionTimingTell === 'tank_aggression') turnRaiseLiveAdj -= 5;
            }

            // ── NUTS: Re-raise (4-bet the turn) ──
            if (handEval.strength >= 85 && canRaise) {
                const potAfterCall = potSize + toCall * 2;
                const geoJam = getGeometricSizing(potAfterCall, heroStack - toCall, 1, true);
                if (geoJam.isJammable && spr <= 4) {
                    return { type: 'all_in' };
                }
                let reRaiseMult = 2.5 + Math.random() * 0.5;
                // Live: against stations, size up
                if (liveRead && liveRead.callFreq > 0.55) reRaiseMult = Math.min(3.5, reRaiseMult * 1.10);
                return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * reRaiseMult)) };
            }
            // ── STRONG HANDS (sets, two pair, overpair): Call and re-evaluate river ──
            if (handEval.strength >= (60 - turnRaiseLiveAdj)) {
                // Against weak-tight raisers: lean fold (they have the nuts)
                if (oppTendency === 'weak-tight' && oppConfidence > 0.4 && handEval.strength < (75 - turnRaiseLiveAdj)) {
                    console.debug(`[HorseBrain]  TURN vs RAISE FOLD: opp=weak-tight raiser, str=${handEval.strength} liveAdj=${turnRaiseLiveAdj}`);
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
                // Draws completed → be cautious
                if (boardEvolution.drawsCompleted.length > 0 && handEval.strength < 70) {
                    const weHaveDraw = handEval.category?.includes('flush') || handEval.category?.includes('straight');
                    if (!weHaveDraw) {
                        return canCheck ? { type: 'check' } : { type: 'fold' };
                    }
                }
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
            // ── DRAWS: Call with massive draws (14+ outs), fold the rest ──
            if (drawEq.outs >= 14 && canCall) {
                return { type: 'call' }; // Combo draw vs raise — implied odds massive
            }
            if (drawEq.outs >= 10 && canCall && betToPot <= 0.60) {
                return { type: 'call' }; // Strong draw + reasonable odds
            }
            // ── MEDIUM/WEAK: Fold (raise over our bet = strong range) ──
            if (handEval.strength >= 45 && betToPot <= 0.45 && canCall) {
                return { type: 'call' }; // Min-raise → call wider
            }
            console.debug(`[HorseBrain]  TURN vs RAISE FOLD: str=${handEval.strength} outs=${drawEq.outs} betToPot=${Math.round(betToPot * 100)}%`);
            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ── POT COMMITTED: Jam ──
        if (isPotCommitted && handEval.strength >= 45) {
            if (canRaise) return { type: 'all_in' };
            if (canCall) return { type: 'call' };
        }

        // ── OOP MATRIX: structured check-call/check-raise for OOP turn decisions ──
        if (!isIP && oppConfidence >= 0.25) {
            const turnOopDecision = getOOPDecisionMatrix({
                handStrength: handEval.strength,
                handCategory: handEval.category,
                hasStrongDraw: handEval.hasFlushDraw || handEval.hasOESD,
                hasWeakDraw: handEval.hasGutshot || handEval.hasBackdoorFlush,
                street: 'turn',
                boardWetness: boardWet,
                boardIsPaired: boardPaired,
                boardIsMonotone: maxSuitCount >= 3,
                numPlayers,
                aggressionBias: aggressionBias + narrativeAggrMod,
                oppTendency, oppConfidence, oppCallFreq,
                oppCbetFreq: 0.60,
                heroIsAggressor,
                potSize, toCall, stackBB,
                liveRead  // Phase 28: pass live-read to OOP matrix
            });

            // ═══ OOP CHECK-RAISE BOOST: posFreqMod integration ═══
            // OOP check-raises more than IP by design — apply the systematic boost
            const turnCRFreq = turnOopDecision.action === 'check_raise'
                ? Math.min(0.80, turnOopDecision.frequency + posFreqMod.oopCheckRaiseBoost)
                : turnOopDecision.frequency;

            if (turnOopDecision.action === 'check_raise' && canRaise && Math.random() < turnCRFreq) {
                const crSize = Math.round(toCall * (turnOopDecision.sizeFraction || 3.0));
                console.debug(`[HorseBrain]  TR-OOP MATRIX: turn check-raise (${turnOopDecision.reason}) freq=${Math.round(turnCRFreq * 100)}%`);
                return { type: raiseAction.type, amount: clampAmt(crSize) };
            }
            if (turnOopDecision.action === 'check_fold') {
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }
            // check_call and lead fall through to the existing turn logic below
        }

        // ── MONSTERS: Raise for value (geometric sizing to set up river jam) ──
        if (handEval.strength >= 80 && canRaise) {
            // Use geometric sizing: calculate raise that sets up a natural river all-in
            const afterCallStack = heroStack - toCall;
            const potAfterCall = potSize + toCall * 2;
            const geoRiver = getGeometricSizing(potAfterCall, afterCallStack, 1, true);

            // The raise should make the pot such that river jam is natural
            let raiseMult = 2.5 + Math.random() * 0.5;

            // If geometric sizing suggests we can jam river after a specific raise
            if (spr >= 3 && spr <= 15) {
                // Calculate: we raise to X, opponent calls, pot = potAfterCall + 2*(X-toCall)
                // Then river: geoRiver.sizeFraction * newPot should ≈ remaining stack
                // Solve backwards: pick raise size that creates right river SPR
                const targetRiverSPR = 1.5; // Want ~1.5 SPR going into river for easy jam
                const idealRaise = (heroStack / (1 + targetRiverSPR * 2) - potSize) / 2 + toCall;
                if (idealRaise > toCall * 2) {
                    raiseMult = idealRaise / toCall;
                }
            }

            // Against calling stations, raise bigger
            if (oppCallFreq > 0.60 && oppConfidence > 0.3) raiseMult = Math.min(4.0, raiseMult * 1.15);
            // Against nits, smaller raise to keep them in
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) raiseMult = Math.max(2.2, raiseMult * 0.85);

            // ═══ LIVE-READ TURN RAISE SIZING (Phase 30) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // Station → bigger raise to extract max value
                if (liveRead.callFreq > 0.60) raiseMult = Math.min(4.0, raiseMult * 1.10);
                // Folder → smaller raise to keep them in
                if (liveRead.foldFreq > 0.55) raiseMult = Math.max(2.2, raiseMult * 0.88);
                // High WTSD → they go to showdown, can size up
                if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) raiseMult = Math.min(3.8, raiseMult * 1.06);
                // Snap-call timing → committed, size up
                if (currentActionTimingTell === 'snap_call') raiseMult = Math.min(4.0, raiseMult * 1.08);
                // Tank-call → marginal, standard sizing fine
                if (currentActionTimingTell === 'tank_call') raiseMult = Math.max(2.3, raiseMult * 0.95);
            }

            // When toCall=0 (we're first to act / betting), use pot-fraction sizing instead
            const raiseSize = toCall > 0
                ? Math.round(toCall * raiseMult)
                : Math.round(potSize * (0.66 + Math.random() * 0.17)); // 66-83% pot bet
            return { type: raiseAction.type, amount: clampAmt(raiseSize) };
        }

        // ── STRONG HANDS: Call (sometimes raise with sets+) ──
        // ═══ 3-BET POT: Lower the strong hand threshold (top pair is premium in 3-bet pots) ═══
        const turnStrongThreshold = is3BetPot ? 48 : is4BetPot ? 40 : 55;
        if (handEval.strength >= turnStrongThreshold) {
            // Raise for protection on wet boards with vulnerable hands
            if (canRaise && boardWet === 'wet' && handEval.strength >= 65 && Math.random() < 0.30) {
                const raiseSize = Math.round(toCall * 2.5);
                return { type: raiseAction.type, amount: clampAmt(raiseSize) };
            }
            // ═══ 3-BET POT: Commit faster with strong hands (low SPR) ═══
            if ((is3BetPot || is4BetPot) && canRaise && handEval.strength >= 60 && spr <= 4) {
                return { type: 'all_in' }; // Low SPR in 3-bet/4-bet pot → jam
            }
            // ═══ OPPONENT-AWARE: Fold strong-ish hands vs very tight opponents in heavy pots ═══
            // If opponent has been building a huge pot and their range is strong, re-evaluate
            const liveNitTurnLaydown = liveRead && liveRead.confidence >= 0.30 &&
                liveRead.aggFreq < 0.18 && liveRead.foldFreq > 0.50;
            if (oppRangeStrength === 'polarized' && (oppTendency === 'weak-tight' || liveNitTurnLaydown) && handEval.strength < 65) {
                // Weak-tight player in a massive pot = they have it
                // But in 3-bet pots, their range is already strong so this is less reliable
                // ═══ LIVE-READ TURN LAYDOWN OVERRIDE (Phase 30) ═══
                // If live-read shows they're actually aggressive, DON'T auto-laydown
                const liveAggroOverride = liveRead && liveRead.confidence >= 0.25 && liveRead.aggFreq > 0.35;
                if ((oppConfidence > 0.4 || liveNitTurnLaydown) && betToPot >= 0.60 && !is3BetPot && !liveAggroOverride) {
                    console.debug(`[HorseBrain]  TURN LAYDOWN: strong hand (${handEval.strength}) but opp is weak-tight in polarized pot liveNit=${liveNitTurnLaydown}`);
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }

            // ═══ BOARD EVOLUTION-DRIVEN TURN CALL/FOLD ═══
            // The runout character should heavily influence our call/fold decisions
            if (boardEvolution.drawsCompleted.length > 0 && handEval.strength < 70) {
                // A draw completed on the turn — opponent could have it
                // If we don't have the completed draw ourselves, lean toward folding
                const weHaveCompletedDraw = handEval.category?.includes('flush') || handEval.category?.includes('straight');
                if (!weHaveCompletedDraw && betToPot >= 0.60) {
                    // Big bet on draw-completing turn = fold marginal hands
                    if (handEval.strength < 60 && !blocksNutFlush) {
                        console.debug(`[HorseBrain]  TURN FOLD: draw completed, no blockers, str=${handEval.strength}`);
                        return canCheck ? { type: 'check' } : { type: 'fold' };
                    }
                }
            }
            // Bricked draws = opponent's semi-bluffs missed → be stickier
            if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0 && handEval.strength >= 40) {
                // Opponent bet but draws bricked — their semi-bluffs are now pure bluffs
                // We should call wider here as bluff-catcher
                // (no action needed — just don't fold; the fold logic below handles it)
            }

            // ═══ NARRATIVE-DRIVEN TURN CALL/FOLD ADJUSTMENTS ═══
            // Opponent barrel-barrel = polarized range → use hand strength + blockers
            if (narrative.barrelsInARow >= 2 && handEval.strength < 65) {
                // Opponent has double-barreled, their range is strong or bluff
                // With blockers to their value range, lean toward calling
                const hasBlockers = blocksTopSet || blocksOverpair || blocksNutFlush;
                if (!hasBlockers && oppTendency !== 'bluffy') {
                    // No blockers + opponent isn't known bluffer → fold marginal strong hands
                    if (betToPot >= 0.60 && oppConfidence > 0.3) {
                        console.debug(`[HorseBrain]  TURN NARRATIVE FOLD: double-barrel, no blockers, str=${handEval.strength}`);
                        return canCheck ? { type: 'check' } : { type: 'fold' };
                    }
                }
            }
            // Hero was aggressive earlier → calling feels natural (continuing hand defense)
            // No adjustment needed — just call
            return canCall ? { type: 'call' } : { type: 'fold' };
        }

        // ── DRAWING HANDS: Equity math + implied odds ──
        if (drawEq.outs >= 6) {
            const drawEquityPct = Math.min(drawEq.outs * 2.2, 45) / 100;
            const rioCheck = detectReverseImplied(drawEq.outs, potOdds, stackBB, numPlayers, boardWet === 'wet');

            // RIO guard: don't chase non-nut draws on scary boards
            if (rioCheck.shouldBlock && !handEval.hasFlushDraw) {
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }

            // Direct odds: call if equity exceeds pot odds
            // SPR bonus: deep stacks = implied odds make marginal draws profitable
            const sprDrawBonus = sprStrategy.drawOddsBonus;
            if (drawEquityPct >= potOdds - 0.05 - sprDrawBonus) {
                // Semi-bluff raise with massive combo draws (14+ outs)
                if (canRaise && drawEq.outs >= 14 && Math.random() < 0.40 * (multiway ? mwAdj.bluffReduction : 1.0)) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * 2.5)) };
                }
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // Implied odds: call with strong draws if deep stacked
            // Against calling stations, implied odds are HIGHER (they pay off when we hit)
            let impliedOddsThreshold = 0.50;
            if (oppCallFreq > 0.55 && oppConfidence > 0.25) impliedOddsThreshold = 0.60;
            // ═══ LIVE-READ TURN IMPLIED ODDS (Phase 28) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // Stations: better implied odds
                if (liveRead.callFreq > 0.55) impliedOddsThreshold += 0.08;
                // High WTSD: they go to showdown → great implied odds
                if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) impliedOddsThreshold += 0.06;
                // Folders: worse implied (they fold when board completes)
                if (liveRead.foldFreq > 0.55) impliedOddsThreshold -= 0.08;
            }
            if (isDeep && drawEq.outs >= 9 && (handEval.hasFlushDraw || drawEq.outs >= 12)) {
                if (canCall && betToPot < impliedOddsThreshold) return { type: 'call' };
            }
        }

        // ── CHECK-RAISE on turn (OOP trap — upgraded with narrative + blockers) ──
        // This handles the case where we checked, opponent bet, and we want to raise.
        // Three check-raise types: value (monsters), semi-bluff (draws), and bluff (air + blockers).
        if (!isIP && canRaise) {

            // ═══ PHASE 16: LIVE-READ DRIVEN CHECK-RAISE STRATEGY ═══
            // Pre-compute live exploits for all check-raise types
            // (liveCRBoost and liveCRSizeMod declared at function scope for
            //  turn + river access — see Phase 47 FIX above)
            liveCRBoost = 0;   // Reset for this street
            liveCRSizeMod = 1.0;
            if (liveRead && liveRead.confidence >= 0.20) {
                // Opponent c-bets too much → check-raise MORE (they bet wide, so CR prints money)
                if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.70) {
                    liveCRBoost += 0.10;
                }
                // Opponent c-bets rarely → they only bet strong → CR less
                if (liveRead.cBetPct !== null && liveRead.cBetPct < 0.40) {
                    liveCRBoost -= 0.08;
                }
                // Opponent folds to raises often → CR bluff more
                if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) {
                    liveCRBoost += 0.08;
                }
                // Opponent double-barrels rarely (one-and-done) → don't CR, just call and take it away on river
                if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.30) {
                    liveCRBoost -= 0.06; // Float is better than CR vs one-and-done
                }
                // Sizing: against stations, CR bigger. Against folders, CR standard.
                if (liveRead.callFreq > 0.55) liveCRSizeMod = 1.12;
                if (liveRead.foldFreq > 0.50) liveCRSizeMod = 0.92;
                // Timing: opponent snap-bet → they're on autopilot → CR is very profitable
                if (currentActionTimingTell === 'snap_aggression') {
                    liveCRBoost += 0.08;
                }
                // Timing: opponent tanked and bet → they're considering fold → CR folds them out
                if (currentActionTimingTell === 'tank_aggression') {
                    liveCRBoost += 0.06;
                }
            }

            // VALUE CHECK-RAISE: Monsters (sets+, strong two pair)
            if (handEval.strength >= 70) {
                let crFreq = 0.35;
                // ═══ OOP CHECK-RAISE BOOST: systematic position adjustment ═══
                crFreq += posFreqMod.oopCheckRaiseBoost; // OOP check-raises more by design
                // Against bluffy opponents, check-raise more often (they bet wide, so we trap wide)
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) crFreq = 0.50;
                // Against calling stations, check-raise bigger (they call raises too)
                if (oppCallFreq > 0.55 && oppConfidence > 0.3) crFreq = 0.45;
                // ═══ LIVE-READ TURN VALUE CR (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Aggro opponents bet wide — CR traps print
                    if (liveRead.aggFreq > 0.45) crFreq += 0.08;
                    // High c-bet rate: they'll fire, perfect for CR
                    if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.60) crFreq += 0.06;
                    // Passive opponents rarely bet — CR is less valuable
                    if (liveRead.aggFreq < 0.20) crFreq -= 0.10;
                    // Timing: snap bet = auto-cbet, easy CR target
                    if (currentActionTimingTell === 'snap_aggression') crFreq += 0.06;
                }
                // Narrative: if we checked flop and now check-raise turn = classic trap line
                if (narrative.heroCheckedFlop) crFreq += 0.08;
                // Narrative: if we've been passive, sudden aggression gets paid
                if (narrative.checkBehindCount >= 1) crFreq += 0.06;
                // Board texture: on wet boards, check-raise for protection + value
                if (boardWet === 'wet') crFreq += 0.05;
                // Dry boards: can slow-play more, less urgency to check-raise
                if (boardWet === 'dry' && scareLevel === 0) crFreq -= 0.05;
                // ═══ 3-BET POT: Check-raise more for value (opponent's range connects often) ═══
                if (is3BetPot) crFreq += 0.08;
                // ═══ COMMITMENT: If heavily invested, check-raise to protect investment ═══
                if (isHeavilyCommitted) crFreq += 0.05;

                crFreq += liveCRBoost; // PHASE 16: Live-read CR boost
                crFreq = Math.max(0.15, Math.min(0.65, crFreq));
                if (Math.random() < crFreq) {
                    // Geometric sizing: check-raise size that sets up river jam
                    const potAfterCR = potSize + toCall * 2; // pot after we call + their bet
                    const geoSize = getGeometricSizing(potAfterCR, heroStack - toCall, 1, true);
                    let crMult = 2.8;
                    if (geoSize.isJammable && spr >= 3 && spr <= 10) {
                        // Size the check-raise so river jam is natural
                        crMult = Math.max(2.2, Math.min(4.0, geoSize.sizeFraction * 5));
                    }
                    // Against calling stations, raise bigger
                    if (oppCallFreq > 0.55 && oppConfidence > 0.3) crMult = Math.min(4.0, crMult * 1.10);
                    crMult *= liveCRSizeMod; // PHASE 16: Live-driven size adjustment
                    const crSize = Math.round(toCall * crMult);
                    console.debug(`[HorseBrain]  TURN CHECK-RAISE VALUE: str=${handEval.strength} crMult=${crMult.toFixed(1)}x narrative=${narrative.suggestedLine}`);
                    return { type: raiseAction.type, amount: clampAmt(crSize) };
                }
            }

            // SEMI-BLUFF CHECK-RAISE: Strong draws (12+ outs, nut draws)
            if (drawEq.outs >= 12 && handEval.strength < 55) {
                let semiCRFreq = 0.25 + aggressionBias / 40;
                semiCRFreq += posFreqMod.oopCheckRaiseBoost; // OOP systematic boost
                // Nut draws: check-raise more aggressively
                if (handEval.hasFlushDraw && blocksNutFlush) semiCRFreq += 0.10; // We have NFD
                if (handEval.hasOESD && drawEq.outs >= 14) semiCRFreq += 0.08; // Combo draw
                // Against over-folders, semi-bluff CR is very profitable
                if (oppFoldFreq > 0.45 && oppConfidence > 0.3) semiCRFreq += 0.10;
                // Against calling stations, don't semi-bluff CR (they call)
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) semiCRFreq = 0;
                // ═══ LIVE-READ TURN SEMI-BLUFF CR (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Live fold-to-raise: semi-bluff CR is very profitable
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.50) semiCRFreq += 0.10;
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct < 0.25) semiCRFreq -= 0.12;
                    // Live calling station: hard block on semi-bluff CR
                    if (liveRead.callFreq > 0.65) semiCRFreq = Math.min(semiCRFreq, 0.05);
                    // Timing: snap bet = weak auto-cbet, prime target
                    if (currentActionTimingTell === 'snap_aggression') semiCRFreq += 0.06;
                }
                // Narrative: if we've been passive, CR is unexpected = more fold equity
                if (narrative.heroCheckedFlop && !narrative.heroBetFlop) semiCRFreq += 0.06;
                // ═══ 3-BET POT: Less semi-bluff CR (opponent's range is strong, less fold equity) ═══
                if (is3BetPot) semiCRFreq *= 0.60;
                semiCRFreq += liveCRBoost * 0.8; // PHASE 16: Live boost (slightly less than value CR)
                semiCRFreq = Math.max(0, Math.min(0.50, semiCRFreq));

                if (Math.random() < semiCRFreq) {
                    let crSize = Math.round(toCall * (2.5 + Math.random() * 0.5) * liveCRSizeMod);
                    console.debug(`[HorseBrain]  TURN SEMI-BLUFF CR: outs=${drawEq.outs} str=${handEval.strength}`);
                    return { type: raiseAction.type, amount: clampAmt(crSize) };
                }
            }

            // BLUFF CHECK-RAISE: Air with blockers (skilled aggressive horses only)
            if (handEval.strength < 15 && aggressionBias > 3 && !multiway) {
                const crBlockerCount = [blocksNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
                if (crBlockerCount >= 1) {
                    let bluffCRFreq = 0.08 + aggressionBias / 60 + posFreqMod.oopCheckRaiseBoost * 0.5;
                    // Need blockers to value range
                    if (crBlockerCount >= 2) bluffCRFreq += 0.08;
                    // Against over-folders, bluff CR is profitable
                    if (oppFoldFreq > 0.50 && oppConfidence > 0.3) bluffCRFreq += 0.10;
                    // Against calling stations, never bluff CR
                    if (oppCallFreq > 0.55 && oppConfidence > 0.3) bluffCRFreq = 0;
                    // ═══ LIVE-READ TURN BLUFF CR (Phase 23) ═══
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Live fold-to-raise is THE stat for bluff CRs
                        if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) bluffCRFreq += 0.10;
                        if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct < 0.30) bluffCRFreq = Math.min(bluffCRFreq, 0.02);
                        // Live station auto-block
                        if (liveRead.callFreq > 0.60) bluffCRFreq = 0;
                        // WTSD: low = they fold a lot on later streets
                        if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) bluffCRFreq += 0.06;
                        if (liveRead.wtsd !== null && liveRead.wtsd > 0.35) bluffCRFreq = Math.min(bluffCRFreq, 0.03);
                    }
                    // Narrative: credible line helps
                    if (narrative.heroCheckedFlop && heroIsAggressor) bluffCRFreq += 0.04; // Delayed trap line
                    // Scare card on turn helps
                    if (scareLevel >= 1) bluffCRFreq += 0.05;
                    bluffCRFreq += liveCRBoost; // PHASE 16: Live-driven bluff CR boost
                    bluffCRFreq = Math.max(0, Math.min(0.25, bluffCRFreq));

                    if (Math.random() < bluffCRFreq) {
                        const crSize = Math.round(toCall * (2.8 + Math.random() * 0.4) * liveCRSizeMod);
                        console.debug(`[HorseBrain]  TURN BLUFF CR: blockers=${crBlockerCount} opp=${oppTendency} scare=${scareLevel}`);
                        return { type: raiseAction.type, amount: clampAmt(crSize) };
                    }
                }
            }
        }

        // ── BUG #114: MADE-BUT-VULNERABLE calldown (PLO turn) ──
        // Bottom straights (52), wheels (50), low flushes (55-65) are still MADE hands.
        // They should call reasonable bets, not fold. The gap between >= 55 (strong) and
        // >= 35 (medium with pot odds < 25%) was too wide — these hands folded to half-pot.
        if (handEval.strength >= 48 && handEval.strength < turnStrongThreshold && handEval.isMade) {
            if (betToPot <= 0.50 && canCall) return { type: 'call' }; // Call up to half-pot
            // Against bigger bets: only call if we're getting good odds or have blockers
            if (betToPot <= 0.75 && canCall && handEval.strength >= 52) return { type: 'call' };
        }

        // ── MEDIUM HANDS: Call with good odds ──
        // ═══ 3-BET POT: Medium hands are more valuable (ranges are narrow) ═══
        const turnMediumThreshold = is3BetPot ? 30 : 35;
        if (handEval.strength >= turnMediumThreshold && potOdds < 0.25) {
            // Tighter multiway
            if (multiway && handEval.strength < 45) return canCheck ? { type: 'check' } : { type: 'fold' };

            // ═══ NARRATIVE-DRIVEN MEDIUM HAND ADJUSTMENTS ═══
            // Opponent barrel-barrel with a medium hand and no blockers → lean fold
            if (narrative.barrelsInARow >= 2 && handEval.strength < 45 && oppConfidence > 0.3) {
                const hasBlockers = blocksTopSet || blocksOverpair || blocksNutFlush;
                if (!hasBlockers && oppTendency !== 'bluffy') {
                    // ═══ LIVE-READ TURN MEDIUM HAND FOLD (Phase 23) ═══
                    // Override: if opponent is a known bluffer, don't fold medium hands
                    if (liveRead && liveRead.confidence >= 0.20) {
                        if (liveRead.aggFreq > 0.45 || (liveRead.bluffRate !== null && liveRead.bluffRate > 0.30)) {
                            // Don't auto-fold vs aggro player — peel with medium hands
                            return canCall ? { type: 'call' } : { type: 'fold' };
                        }
                        // Very tight player double-barreling = strong — fold even wider
                        if (liveRead.aggFreq < 0.20 && handEval.strength < 42) {
                            return canCheck ? { type: 'check' } : { type: 'fold' };
                        }
                    }
                    console.debug(`[HorseBrain]  TURN MEDIUM FOLD: double-barrel, medium hand (${handEval.strength}), no blockers`);
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }
            // ═══ LIVE-READ TURN MEDIUM CALL ADJUSTMENT (Phase 23) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // Against one-and-done players: call more (they'll check river)
                if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.30) {
                    // Always peel vs one-and-done with any medium hand
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
                // Against aggressive barrelors: tighten up
                if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct > 0.60 && handEval.strength < 42) {
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }
            // If opponent only bet once (single barrel), medium hands are fine to peel
            return canCall ? { type: 'call' } : { type: 'fold' };
        }

        // ── FLOAT in position (skilled aggressive horses) ──
        if (isIP && handEval.strength >= 20 && betToPot <= 0.50 && !multiway && isAggressive) {
            let floatFreq = 0.22;
            // Float more against weak-tight players (they give up on river often)
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) floatFreq = 0.35;
            // Float less in heavy pots (opponent more committed)
            if (oppStreetAggression === 'very_heavy') floatFreq = 0.08;

            // ═══ NARRATIVE-DRIVEN FLOAT ═══
            // Opponent bet flop and turn → they're committed, floating is riskier
            if (narrative.barrelsInARow >= 2) floatFreq = Math.max(0.05, floatFreq - 0.12);
            // Opponent only bet turn after checking flop → weaker range, float more
            if (!narrative.heroBetFlop && narrative.checkBehindCount >= 1) floatFreq += 0.08;

            // ═══ PHASE 16: LIVE-READ DRIVEN FLOAT STRATEGY ═══
            // Float is extremely profitable against "one-and-done" players
            // who c-bet flop but check turn. We call their c-bet, then take the pot.
            if (liveRead && liveRead.confidence >= 0.20) {
                // ONE-AND-DONE: c-bets a lot but rarely double-barrels → FLOAT HEAVILY
                if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.60 &&
                    liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.35) {
                    floatFreq = Math.min(0.55, floatFreq + 0.18); // Massive float boost
                }
                // Opponent gives up easily (low WTSD) → float more
                if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) {
                    floatFreq = Math.min(0.50, floatFreq + 0.12);
                }
                // Opponent goes to showdown a lot → don't float (they'll call us down)
                if (liveRead.wtsd !== null && liveRead.wtsd > 0.35) {
                    floatFreq = Math.max(0.05, floatFreq - 0.10);
                }
                // Tank-bet from opponent → unsure → float more (they'll check next street)
                if (currentActionTimingTell === 'tank_aggression') {
                    floatFreq = Math.min(0.50, floatFreq + 0.10);
                }
                // Snap-bet → confident/auto-play → float less (they might barrel again)
                if (currentActionTimingTell === 'snap_aggression') {
                    floatFreq = Math.max(0.10, floatFreq - 0.06);
                }
            }

            floatFreq = Math.max(0, Math.min(0.55, floatFreq));
            if (Math.random() < floatFreq) return canCall ? { type: 'call' } : { type: 'fold' };
        }

        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ════════════════════════════════════════════════════════════════
    //  R I V E R  (where the money is)
    // ════════════════════════════════════════════════════════════════
    if (street === 'river') {
        const oppFoldMod = opponentAdjustment.foldMod || 0;
        const oppCallMod = opponentAdjustment.callMod || 0;
        // ═══ Phase 39B FIX: oppCallMod > 0 now means station (not bluffer), remove from bluffy check ═══
        const oppBluffy = opponentAdjustment.bluffAware || oppTendency === 'bluffy';
        // ═══ Phase 39B FIX: add bluffAware to fold threshold (was relying on inverted callMod) ═══
        const foldThreshold = 30 + oppFoldMod - (opponentAdjustment.bluffAware ? 5 : 0);

        // ═══ COMPUTE TURN-TO-RIVER EQUITY DELTA ═══
        // On river we have both turn and flop evals for comparison
        const turnBoard = board.slice(0, 4);
        const turnEval = evaluatePostflopHand(holeCards, turnBoard);
        const turnToRiverDelta = handEval.strength - turnEval.strength; // Did river help or hurt?

        // ═══ RIVER RANGE POLARIZATION ENGINE ═══
        // GTO principle: on the river, betting ranges should be either POLARIZED or MERGED.
        // POLARIZED: Bet with nuts + bluffs, check everything in between.
        //   → Correct sizing: large (66%+ pot), overbets with nuts.
        //   → When: IP, deep SPR, dry board, opponent has capped range.
        // MERGED: Bet with a wide range of medium+ hands for thin value.
        //   → Correct sizing: small (25-50% pot).
        //   → When: Shallow SPR, opponent weak range, multiway.
        const riverRangeType = (() => {
            // Strong polarization signals
            if (spr <= 3) return 'merged'; // Low SPR: merged (no room for polarized)
            if (isIP && heroHasNutAdvantage && !multiway) return 'polarized';
            if (boardEvolution.drawsCompleted.length > 0 && heroIsAggressor) return 'polarized';
            if (narrative.barrelsInARow >= 2 && narrative.storyIsConsistent) return 'polarized';
            // Merged signals
            if (multiway) return 'merged';
            if (isLimpedPot) return 'merged';
            if (!heroIsAggressor && heroRangeCapped) return 'merged';
            if (oppRangeStrength === 'weak') return 'merged';
            // Default: polarized IP, merged OOP
            return isIP ? 'polarized' : 'merged';
        })();

        // Polarization-driven sizing modifier
        const polarSizeMod = riverRangeType === 'polarized' ? 1.15 : 0.80;
        // Polarization-driven bluff frequency (polarized = more bluffs in range)
        const polarBluffMod = riverRangeType === 'polarized' ? 1.15 : 0.60;

        // ═══ NOT FACING A BET ═══
        if (!facingBet) {

            // ── POT COMMITTED: Shove decent hands ──
            if (isPotCommitted && handEval.strength >= 40 && canRaise) {
                return { type: 'all_in' };
            }

            // ── NUTS: OVERBET for maximum value ──
            if (handEval.strength >= 90 && canRaise) {
                // Nut hands should overbet (100-150% pot) to extract max value
                // Against calling stations, overbet BIGGER (they pay off)
                let overbetMax = 0.50 * sprStrategy.overbetMult; // SPR-adjusted: low SPR = bigger overbets
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) overbetMax = 0.80; // Up to 180% pot

                // ═══ NARRATIVE-DRIVEN OVERBET SIZING ═══
                // A consistent aggressive story makes overbets more believable
                if (narrative.barrelsInARow >= 2 && narrative.storyIsConsistent) {
                    overbetMax += 0.15; // Triple barrel into overbet = polarized + credible
                }
                // Slow-played line (checked earlier streets) → smaller bet, they're suspicious
                if (narrative.checkBehindCount >= 1 && !heroIsAggressor) {
                    overbetMax = Math.max(0.20, overbetMax - 0.20);
                }
                // River improved us (turnToRiverDelta big) → careful not to scare with overbet
                if (turnToRiverDelta > 20) {
                    overbetMax = Math.max(0.30, overbetMax - 0.10); // We hit on river, size down slightly
                }

                // ═══ BOARD EVOLUTION-DRIVEN OVERBET SIZING ═══
                // River completed draws = opponent will pay off if they have second-best
                if (boardEvolution.drawsCompleted.length > 0) {
                    overbetMax += 0.10; // Completed draws = more nutted combos to rep
                }
                // Static brick river = opponent expects value, smaller overbet is correct
                if (boardEvolution.evolution === 'static_brick') {
                    overbetMax = Math.max(0.20, overbetMax - 0.08);
                }
                // PFR-favorable river = aggressor range is strong → overbet with confidence
                if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                    overbetMax += 0.10;
                }

                // ═══ 3-BET POT OVERBET ADJUSTMENT ═══
                // In 3-bet pots, the pot is already large → overbets are less necessary
                // and opponent's range is narrower → they're less likely to have a hand
                // that can call a massive overbet. Use standard value sizing instead.
                if (is3BetPot) {
                    overbetMax = Math.max(0.15, overbetMax * 0.60); // Reduce overbet sizing
                }
                if (is4BetPot) {
                    // In 4-bet pots, just jam (SPR is tiny)
                    if (spr <= 3) return { type: 'all_in' };
                    overbetMax = Math.max(0.10, overbetMax * 0.40);
                }

                // ═══ COMMITMENT-DRIVEN OVERBET ═══
                // If we're heavily committed, an overbet completes the investment.
                // Opponent also reads us as committed → they expect a big bet → overbet is natural.
                if (isHeavilyCommitted && narrative.barrelsInARow >= 1) {
                    overbetMax += 0.08; // Our investment demands follow-through
                }

                // ═══ POLARIZATION OVERBET ═══
                // Polarized range → bigger overbets (we're either nutted or bluffing)
                // Merged range → smaller overbets (our range is condensed)
                overbetMax *= (riverRangeType === 'polarized' ? 1.10 : 0.75);

                // ═══ PHASE 16: LIVE-READ DRIVEN OVERBET SIZING ═══
                // Use live data to fine-tune the overbet — this is where EV lives
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Against calling stations: MAX SIZE overbets — they pay off
                    if (liveRead.callFreq > 0.60) {
                        overbetMax = Math.min(1.0, overbetMax + 0.15);
                    }
                    // Against opponents who fold to overbets (rare overbet scare):
                    // size down to get called, or overbet as bluff only
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) {
                        overbetMax = Math.max(0.10, overbetMax - 0.15); // Don't overbet — they'll fold
                    }
                    // Timing tell: if they snap-called the turn, they're committed → overbet more
                    if (currentActionTimingTell === 'snap_call') {
                        overbetMax = Math.min(1.0, overbetMax + 0.10);
                    }
                    // Timing tell: if they tank-called turn, they're marginal → standard size
                    if (currentActionTimingTell === 'tank_call') {
                        overbetMax = Math.max(0.15, overbetMax - 0.08);
                    }
                }

                const overbetFrac = 1.0 + Math.random() * overbetMax;
                // Against nits, use smaller sizing (they fold to overbets)
                // ═══ LIVE-READ NIT OVERBET SIZING (Phase 29) ═══
                const liveNitOverbet = liveRead && liveRead.confidence >= 0.25 &&
                    liveRead.aggFreq < 0.18 && liveRead.foldFreq > 0.50;
                if ((oppTendency === 'weak-tight' && oppConfidence > 0.3) || liveNitOverbet) {
                    let nitFrac = 0.66 + Math.random() * 0.14; // 66-80% to get called
                    // ═══ LIVE-READ NIT SIZING REFINEMENT (Phase 29) ═══
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Extreme folder → even smaller to get the call
                        if (liveRead.foldFreq > 0.60) nitFrac = Math.max(0.55, nitFrac - 0.10);
                        // If they have high WTSD despite being nitty, they'll call → size up
                        if (liveRead.wtsd !== null && liveRead.wtsd > 0.28) nitFrac = Math.min(0.85, nitFrac + 0.06);
                        // Snap-call timing = committed → size up
                        if (currentActionTimingTell === 'snap_call') nitFrac = Math.min(0.90, nitFrac + 0.08);
                    }
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * nitFrac)) };
                }
                console.debug(`[HorseBrain]  RIVER OVERBET: str=${handEval.strength} max=${Math.round(overbetMax * 100)}% polar=${riverRangeType} 3bet=${is3BetPot}`);
                return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * overbetFrac)) };
            }

            // ── MONSTERS (non-nut): Standard value bet 66-80% pot ──
            if (handEval.strength >= 75 && canRaise) {
                let sizeFrac = (multiway ? Math.max(0.50, 0.60 + mwAdj.adjustSizing * 0.01) : 0.72) * polarSizeMod;
                // Multiway: tighter value range means we can size up more
                if (multiway && mwAdj.valueBetThreshold > 0) {
                    sizeFrac = Math.min(0.80, sizeFrac + 0.08); // Multiway value = bigger sizing
                }
                // Against calling stations, size up
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) sizeFrac = Math.min(0.85, sizeFrac + 0.10);

                // ═══ LIVE-READ MONSTER SIZING (Phase 29) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Calling station → size UP for max value extraction
                    if (liveRead.callFreq > 0.55) sizeFrac = Math.min(0.88, sizeFrac + 0.08);
                    if (liveRead.callFreq > 0.65) sizeFrac = Math.min(0.92, sizeFrac + 0.05);
                    // Folder → size DOWN to get the call
                    if (liveRead.foldFreq > 0.55) sizeFrac = Math.max(0.50, sizeFrac - 0.10);
                    // High WTSD → they go to showdown, size up
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) sizeFrac = Math.min(0.88, sizeFrac + 0.06);
                    // Aggressive opp → check to induce raise, then re-raise
                    if (liveRead.aggFreq > 0.50 && !isIP && handEval.strength >= 80) {
                        // Consider trapping instead of value betting
                        if (Math.random() < 0.35 && canCheck) return { type: 'check' }; // Trap — NEVER fold a monster
                    }
                    // Snap-call timing = committed → bigger sizing
                    if (currentActionTimingTell === 'snap_call') sizeFrac = Math.min(0.90, sizeFrac + 0.06);
                    // Tank-call timing = marginal → standard sizing is fine
                    if (currentActionTimingTell === 'tank_call') sizeFrac = Math.max(0.55, sizeFrac - 0.04);
                }

                // ═══ NARRATIVE-DRIVEN MONSTER SIZING ═══
                // Consistent aggression story → can size up (opponent expects continuation)
                if (narrative.barrelsInARow >= 1 && narrative.storyIsConsistent) {
                    sizeFrac = Math.min(0.90, sizeFrac + 0.06);
                }
                // Trapping line (checked earlier) → smaller bet, opponent suspects trap if too big
                if (narrative.checkBehindCount >= 1) {
                    sizeFrac = Math.max(0.55, sizeFrac - 0.08);
                }
                // River card helped us a lot → size down to avoid folding out worse
                if (turnToRiverDelta > 15) {
                    sizeFrac = Math.max(0.55, sizeFrac - 0.05);
                }
                // Use geometric sizing for stack management
                const geoRiver = getGeometricSizing(potSize, heroStack, 1, true);
                if (geoRiver.isJammable && spr <= 3) {
                    return { type: 'all_in' }; // Just jam, SPR is low enough
                }

                return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
            }

            // ── THIN VALUE: Bet 50-60% pot with strong top pair / good two pair ──
            if (handEval.strength >= 55 && canRaise) {
                // Don't thin value bet on boards that completed obvious draws
                if (scareLevel >= 3) return canCheck ? { type: 'check' } : { type: 'fold' };
                // Thin value frequency: higher IP, lower multiway
                let thinValueFreq = multiway ? Math.max(0.30, 0.50 + mwAdj.cbetFreqMod) : (isIP ? 0.72 : 0.60);
                thinValueFreq += posFreqMod.ipThinValueBoost; // IP thin values significantly more
                thinValueFreq *= sprStrategy.thinValueMult; // SPR: low = less thin value (committed), high = cautious

                // ═══ OPPONENT-AWARE THIN VALUE ═══
                // Against calling stations, thin value bet MORE (they call too light)
                if (oppCallFreq > 0.55 && oppConfidence > 0.3) {
                    thinValueFreq = Math.min(0.85, thinValueFreq + 0.12);
                }
                // Against aggressive players, check to induce bluff
                if (oppTendency === 'bluffy' && oppConfidence > 0.3 && !isIP) {
                    thinValueFreq = Math.max(0.25, thinValueFreq - 0.20); // Check more, let them bluff
                }

                // ═══ NARRATIVE-DRIVEN THIN VALUE ═══
                // Consistent betting story makes thin value credible
                if (narrative.barrelsInARow >= 1 && narrative.storyIsConsistent) {
                    thinValueFreq = Math.min(0.85, thinValueFreq + 0.08);
                }
                // Checked earlier streets → opponent may expect weakness, thin value catches them
                if (narrative.heroCheckedFlop && heroIsAggressor) {
                    // Delayed aggression = trap line, thin value is strong here
                    thinValueFreq = Math.min(0.80, thinValueFreq + 0.06);
                }
                // If we checked turn, betting river is suspicious — lower freq with marginal hands
                if (narrative.heroCheckedTurn && !narrative.heroBetFlop) {
                    thinValueFreq = Math.max(0.30, thinValueFreq - 0.10);
                }
                // River hurt us (equity dropped) → check more, our hand got worse
                if (turnToRiverDelta < -10) {
                    thinValueFreq = Math.max(0.25, thinValueFreq - 0.12);
                }
                // River helped us → value bet more aggressively
                if (turnToRiverDelta > 10) {
                    thinValueFreq = Math.min(0.85, thinValueFreq + 0.08);
                }

                // ═══ BOARD EVOLUTION-DRIVEN THIN VALUE ═══
                // Runout character affects thin value bet safety
                if (boardEvolution.drawsCompleted.length > 0) {
                    thinValueFreq -= 0.12; // Draw completed = risky to thin value
                }
                if (boardEvolution.evolution === 'static_brick') {
                    thinValueFreq += 0.06; // Blank river = safe to thin value
                }
                if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                    thinValueFreq += 0.08; // River helped our range = bet more
                }
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    thinValueFreq += 0.06; // Opponent's draws missed = can thin value safely
                }

                // ═══ 3-BET POT THIN VALUE ═══
                // In 3-bet pots, thin value is MORE profitable:
                // - Opponent's range is narrow → they have a pair more often → they call thin value
                // - SPR is low → smaller bets commit them
                if (is3BetPot) {
                    thinValueFreq = Math.min(0.85, thinValueFreq + 0.10);
                }

                // ═══ COMMITMENT-DRIVEN THIN VALUE ═══
                if (isHeavilyCommitted && narrative.barrelsInARow >= 1) {
                    thinValueFreq = Math.min(0.85, thinValueFreq + 0.08);
                }

                // ═══ LIVE-READ THIN VALUE FREQUENCY (Phase 20) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Calling station → thin value ALL DAY (they pay off everything)
                    if (liveRead.callFreq > 0.55) thinValueFreq = Math.min(0.88, thinValueFreq + 0.10);
                    // Tight folder → thin value less (they fold marginals, only call with better)
                    if (liveRead.foldFreq > 0.55 && handEval.strength < 65) {
                        thinValueFreq = Math.max(0.30, thinValueFreq - 0.10);
                    }
                    // High check-raise % → check instead to induce (risky to thin value into CR)
                    if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct > 0.12 && !isIP) {
                        thinValueFreq = Math.max(0.25, thinValueFreq - 0.10);
                    }
                    // Low WTSD → they give up without showdown → our thin value gets folds (good)
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) {
                        thinValueFreq += 0.05; // More folds = more profitable thin value
                    }
                    // Timing: snap-call previous street = committed → thin value is risky
                    if (currentActionTimingTell === 'snap_call' && handEval.strength < 62) {
                        thinValueFreq = Math.max(0.30, thinValueFreq - 0.08);
                    }
                }

                thinValueFreq = Math.max(0.10, Math.min(0.88, thinValueFreq));

                if (Math.random() < thinValueFreq) {
                    let sizeFrac = multiway ? Math.max(0.35, 0.45 + mwAdj.adjustSizing * 0.01) : 0.55;
                    // Smaller sizing vs tight opponents to get called
                    if (oppFoldFreq > 0.50 && oppConfidence > 0.3) sizeFrac = Math.max(0.35, sizeFrac - 0.12);
                    // Narrative: consistent barrels → can size up thin value
                    if (narrative.storyIsConsistent && narrative.barrelsInARow >= 1) {
                        sizeFrac = Math.min(0.70, sizeFrac + 0.06);
                    }
                    // Board got drier = smaller sizing is fine for thin value
                    if (boardEvolution.boardGotDrier) {
                        sizeFrac = Math.max(0.35, sizeFrac - 0.06);
                    }
                    // Board got wetter = bigger to charge (or check instead)
                    if (boardEvolution.boardGotWetter) {
                        sizeFrac = Math.min(0.70, sizeFrac + 0.06);
                    }

                    // ═══ PHASE 16: LIVE-READ DRIVEN THIN VALUE SIZING ═══
                    // Thin value is all about extracting that last bet — sizing is EVERYTHING.
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Calling stations pay off at any size → go bigger
                        if (liveRead.callFreq > 0.55) {
                            sizeFrac = Math.min(0.75, sizeFrac + 0.10);
                        }
                        // Opponents who fold a lot → smaller to get called by worse
                        if (liveRead.foldFreq > 0.50) {
                            sizeFrac = Math.max(0.30, sizeFrac - 0.10);
                        }
                        // If they have a high fold-to-raise, even small bets get folds
                        // → tiny sizing extracts value from their middle range
                        if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) {
                            sizeFrac = Math.max(0.28, sizeFrac - 0.08);
                        }
                        // Tank-called turn = marginal → extract with standard sizing
                        if (currentActionTimingTell === 'tank_call') {
                            sizeFrac = Math.min(0.65, sizeFrac + 0.05);
                        }
                        // Snap-called turn = strong, might raise us → be careful with thin value
                        if (currentActionTimingTell === 'snap_call' && handEval.strength < 65) {
                            sizeFrac = Math.max(0.30, sizeFrac - 0.08);
                        }
                    }

                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }

            // ── BLOCK BET: 25-33% pot with showdown value ──
            // Purpose: deny opponent a big bluff opportunity (IP) or probe for information (OOP)
            // GTO: OOP also block-bets to deny IP a free bluff opportunity
            if (handEval.strength >= 35 && handEval.strength < 55 && canRaise && !multiway) {
                let blockFreq = isIP ? 0.28 : (0.20 + posFreqMod.oopBlockBetBoost);
                // Block bet more against aggressive opponents (deny them a big bluff)
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) blockFreq = 0.45;

                // ═══ NARRATIVE-DRIVEN BLOCK BET ═══
                // If we've been checking/calling, a small river bet is a credible block line
                if (narrative.checkBehindCount >= 1 || narrative.heroCheckedTurn) {
                    blockFreq += 0.08; // Pot-control line → block bet is natural continuation
                }
                // If we've been barreling, a sudden small bet is suspicious — avoid
                if (narrative.barrelsInARow >= 2) {
                    blockFreq = Math.max(0.10, blockFreq - 0.15); // Triple barrel then block? Doesn't make sense
                }
                // River weakened our hand → block bet to control pot
                if (turnToRiverDelta < -5) {
                    blockFreq += 0.06; // Hand got worse, block for cheap showdown
                }
                // Single barrel then check → block river is natural conclusion
                if (narrative.barrelsInARow === 1 && narrative.heroCheckedTurn) {
                    blockFreq += 0.06; // Bet-check-block is a coherent pot-control line
                }

                // ═══ 3-BET POT BLOCK BET ═══
                // In 3-bet pots, block bets are LESS useful (pot is big, block bet doesn't deny much).
                // Better to check or value bet. Block bets in 3-bet pots look weak.
                if (is3BetPot) blockFreq *= 0.50;
                if (is4BetPot) blockFreq = 0; // Never block bet in 4-bet pots

                // ═══ COMMITMENT-DRIVEN BLOCK BET ═══
                if (isHeavilyCommitted && !is3BetPot) {
                    blockFreq += 0.06;
                }

                // ═══ LIVE-READ BLOCK BET (Phase 20) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Aggressive opponent → block bet MORE to deny their big bluffs
                    if (liveRead.aggFreq > 0.40) blockFreq += 0.10;
                    // Passive opponent → block less (they won't bluff, just check back)
                    if (liveRead.aggFreq < 0.20) blockFreq -= 0.06;
                    // High overbet frequency → block bet denies overbet opportunity
                    if (liveRead.overbetPct !== null && liveRead.overbetPct > 0.10) blockFreq += 0.08;
                    // Calling station → block bet IS a thin value bet → they call anything
                    if (liveRead.callFreq > 0.55) blockFreq += 0.06;
                }

                blockFreq = Math.max(0, Math.min(0.55, blockFreq));
                if (Math.random() < blockFreq) {
                    let blockFrac = 0.25 + Math.random() * 0.08;
                    // Against very aggressive opponents, slightly bigger block to commit them
                    if (oppTendency === 'bluffy' && oppConfidence > 0.3) {
                        blockFrac = Math.min(0.40, blockFrac + 0.05);
                    }
                    // ═══ LIVE-READ BLOCK SIZING (Phase 20) ═══
                    if (liveRead && liveRead.confidence >= 0.20) {
                        if (liveRead.callFreq > 0.55) blockFrac = Math.min(0.38, blockFrac + 0.04);
                        if (liveRead.foldFreq > 0.50) blockFrac = Math.max(0.20, blockFrac - 0.04);
                    }
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * blockFrac)) };
                }
            }

            // ── RIVER PROBE BET: OOP initiative when opponent checked back turn ──
            // When OOP and opponent checked turn (showing weakness), probe the river.
            // This exploits opponents who give up on turns with marginal holdings.
            if (!isIP && canRaise && !multiway && narrative.heroCheckedTurn) {
                // If opponent also checked turn (we're now betting into checked pot)
                // This is NOT a bluff per se — it's a thin value / denial bet
                if (handEval.strength >= 35 && handEval.strength < 55) {
                    let probeFreq = 0.30 + aggressionBias / 50 + narrativeAggrMod / 40;
                    // Against passive opponents who check back weak ranges → probe more
                    if (oppTendency === 'weak-tight' && oppConfidence > 0.3) probeFreq += 0.12;
                    if (oppTendency === 'balanced') probeFreq += 0.05;
                    // Against aggressive opponents, they would have bet if strong → probe valuable
                    if (oppTendency === 'bluffy' && oppConfidence > 0.3) probeFreq += 0.08;

                    // ═══ LIVE-READ RIVER PROBE ADJUSTMENTS (Phase 18) ═══
                    let probeFrac = 0.40 + Math.random() * 0.15; // 40-55% pot default
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // They checked back turn → if they're an aggressive player, their range is VERY capped
                        if (liveRead.aggFreq > 0.40) probeFreq += 0.10; // Aggressive player checked = weakness
                        // High fold frequency → probe with wider range
                        if (liveRead.foldFreq > 0.50) {
                            probeFreq += 0.06;
                            probeFrac = Math.max(0.33, probeFrac - 0.05); // Smaller is enough
                        }
                        // Low WTSD → they give up easily on river → probe
                        if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) probeFreq += 0.06;
                        // Calling station → only probe for value
                        if (liveRead.callFreq > 0.60 && handEval.strength < 42) probeFreq -= 0.12;
                        if (liveRead.callFreq > 0.60 && handEval.strength >= 45) {
                            probeFreq += 0.06;
                            probeFrac = Math.min(0.60, probeFrac + 0.05); // Size up for value
                        }
                    }

                    probeFreq = Math.max(0, Math.min(0.55, probeFreq));
                    if (Math.random() < probeFreq) {
                        console.debug(`[HorseBrain]  RIVER PROBE: str=${handEval.strength} OOP after checked turn — ${Math.round(probeFrac * 100)}% pot live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * probeFrac)) };
                    }
                }
            }

            // ── RIVER BLUFF: Polarized bluff with blockers ──
            // This is where the real skill shows — turning missed draws into profitable bluffs
            // GTO PRINCIPLE: Bluff:Value ratio should match bet sizing to make opponent indifferent.
            // For b% pot bet: bluff frequency = b/(1+b) of betting range.
            // 66% pot → ~40% bluffs in betting range. 100% pot → 50%. 150% pot → 60%.
            if (handEval.strength < 15 && canRaise && !multiway) {
                // ═══ POSITION-AWARE RIVER BLUFF BASE ═══
                // IP starts with a slight bluff bonus (information advantage, guaranteed showdown)
                // OOP bluffs are riskier (opponent can raise us off our bluff)
                let bluffProbability = posFreqMod.ipBluffBoost + posFreqMod.riverBluffIPBoost;

                // ═══ BLOCKER-BASED BLUFF WEIGHTING ═══
                // Each blocker type has a different EV impact on bluffing.
                // Nut flush blocker is the best because it removes the most combos of nuts.
                if (blocksNutFlush) bluffProbability += 0.25;
                if (blocksSecondNutFlush) bluffProbability += 0.15;
                if (blocksTopSet) bluffProbability += 0.12;
                if (blocksOverpair) bluffProbability += 0.08;
                if (blocksStraight) bluffProbability += 0.10;

                // ═══ BLOCKER COMBO BONUS ═══
                // Multiple blockers compound in value — opponent's value range is severely reduced
                const blockerCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
                if (blockerCount >= 2) bluffProbability += 0.08; // Combo blocker bonus
                if (blockerCount >= 3) bluffProbability += 0.05; // Triple blocker — very strong bluff candidate

                // ═══ NARRATIVE-DRIVEN BLUFF CREDIBILITY ═══
                // Only bluff when our prior street actions tell a believable story
                bluffProbability += narrativeAggrMod / 50;
                // Triple barrel bluff: requires blockers + consistent story
                if (narrative.barrelsInARow >= 2) {
                    if (blockerCount >= 1 && narrative.storyIsConsistent) {
                        bluffProbability += 0.06; // Committed bluff with story + blockers
                    } else if (blockerCount === 0) {
                        bluffProbability -= 0.10; // Triple barrel without blockers = bad idea
                    }
                }
                // Delayed barrel bluff: checked flop, bet turn, bet river — credible
                if (narrative.suggestedLine === 'delayed-barrel' && narrative.heroCheckedFlop) {
                    bluffProbability += 0.05;
                }

                // Personality: aggressive horses bluff more
                bluffProbability += aggressionBias / 80;

                // ═══ OPPONENT-AWARE BLUFF FREQUENCY ═══
                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) bluffProbability += 0.15;
                if (oppCallFreq > 0.65 && oppConfidence > 0.3) bluffProbability = 0;
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3) bluffProbability += 0.10;

                // ═══ AGGRESSOR RANGE ADVANTAGE ═══
                if (heroIsAggressor && !boardFavorsCaller) bluffProbability += 0.08;
                if (!heroIsAggressor && boardFavorsPFR) bluffProbability -= 0.08;

                // Board that missed draws → opponent has showdown value
                if (scareLevel === 0 && equityDelta < -10) bluffProbability += 0.08;

                // ═══ BOARD EVOLUTION-DRIVEN RIVER BLUFF ═══
                // The runout character defines bluff credibility on the river
                if (boardEvolution.drawsCompleted.length > 0 && heroIsAggressor) {
                    bluffProbability += 0.10; // Completed draws = we can rep the nuts
                }
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    // Draws bricked = opponent knows we missed → less fold equity for bluffs
                    // UNLESS we barrel representing value (not a draw)
                    if (narrative.barrelsInARow >= 2 && narrative.storyIsConsistent) {
                        bluffProbability += 0.04; // Our barrel story still credible
                    } else {
                        bluffProbability -= 0.08; // We look like a missed draw
                    }
                }
                if (boardEvolution.evolution === 'static_brick' && heroIsAggressor) {
                    bluffProbability += 0.06; // Brick river = good for PFR to triple barrel
                }
                if (boardEvolution.evolution === 'caller_favorable' && heroIsAggressor) {
                    bluffProbability -= 0.10; // River helped their range — terrible bluff spot
                }
                if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                    bluffProbability += 0.08; // River helped our range — credible
                }

                // ═══ HEAVY POT CAUTION ═══
                if (oppStreetAggression === 'very_heavy') bluffProbability -= 0.10;

                // ═══ PHASE 15: CURRENT-ACTION TIMING TELL → RIVER BLUFF ═══
                if (currentActionTimingTell !== 'unknown' && oppConfidence >= 0.20) {
                    if (currentActionTimingTell === 'tank_call') {
                        // Tank-called the turn = marginal hand, likely folds to river pressure
                        bluffProbability += 0.10;
                    } else if (currentActionTimingTell === 'snap_call') {
                        // Snap-called = strong hand, not folding to river bluff
                        bluffProbability -= 0.08;
                    } else if (currentActionTimingTell === 'tank_aggression') {
                        // Tank-bet the turn = unsure, might fold to check-raise or river pressure
                        bluffProbability += 0.05;
                    } else if (currentActionTimingTell === 'deliberate') {
                        bluffProbability += 0.03;
                    }
                }

                // ═══ SPR + POLARIZATION BLUFF ADJUSTMENT (RIVER) ═══
                bluffProbability *= sprStrategy.bluffMult * polarBluffMod;

                // ═══ LIVE-READ RIVER BLUFF FREQUENCY (Phase 21) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    if (liveRead.foldFreq > 0.55) bluffProbability += 0.08;
                    if (liveRead.foldFreq < 0.30) bluffProbability -= 0.08;
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) bluffProbability += 0.06;
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) bluffProbability += 0.05;
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.35) bluffProbability -= 0.06;
                    if (liveRead.callFreq > 0.60) bluffProbability = Math.min(bluffProbability, 0.05);
                }

                // GTO cap: river bluffs should not exceed ~38% even with max blockers + reads
                bluffProbability = Math.max(0, Math.min(0.38, bluffProbability));

                if (Math.random() < bluffProbability) {
                    // Polarized range: use larger bluff sizing (mirrors our value bets)
                    // Merged range: smaller bluffs (consistent with thin value sizing)
                    let bluffFrac = riverRangeType === 'polarized'
                        ? (0.70 + Math.random() * 0.20) // 70-90% for polarized
                        : (0.40 + Math.random() * 0.15); // 40-55% for merged
                    if (oppTendency === 'weak-tight' && oppConfidence > 0.35) {
                        bluffFrac = 0.90 + Math.random() * 0.30;
                    }
                    // ═══ BLOCKER-AWARE BLUFF SIZING ═══
                    // With premium blockers, can go bigger (opponent is less likely to have nuts)
                    if (blockerCount >= 2 && oppFoldFreq > 0.40) {
                        bluffFrac = Math.max(bluffFrac, 0.80 + Math.random() * 0.40); // 80-120% pot
                    }
                    // ═══ PHASE 36A: GRANULAR BLOCKER SCORE → BLUFF SIZING ═══
                    // High blockerScore = we remove more of their value range →
                    // bigger bluffs are more profitable (they can't have nuts as often)
                    if (blockerScore >= 0.30) {
                        bluffFrac = Math.max(bluffFrac, 0.75 + Math.random() * 0.35); // 75-110% pot
                    }

                    // ═══ PHASE 16: LIVE-READ DRIVEN RIVER BLUFF SIZING ═══
                    // The river is where sizing MATTERS MOST — wrong size = burning money.
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Against folders: SIZE UP for max fold equity
                        if (liveRead.foldFreq > 0.50) {
                            bluffFrac = Math.min(1.30, bluffFrac + 0.15);
                        }
                        // Against stations: SIZE DOWN to lose less when called
                        if (liveRead.callFreq > 0.55) {
                            bluffFrac = Math.max(0.35, bluffFrac - 0.15);
                        }
                        // Opponent has high fold-to-raise → overbet bluffs are profitable
                        if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) {
                            bluffFrac = Math.min(1.50, bluffFrac + 0.20);
                        }
                        // Tank-called turn = marginal → big river bluff folds them out
                        if (currentActionTimingTell === 'tank_call') {
                            bluffFrac = Math.min(1.20, bluffFrac + 0.15);
                        }
                        // Snap-called turn = strong → smaller bluff (or don't bluff, already freq-capped)
                        if (currentActionTimingTell === 'snap_call') {
                            bluffFrac = Math.max(0.45, bluffFrac - 0.10);
                        }
                        // Live nit detection: passive + foldy → overbet bluff for max fold equity
                        if (liveRead.aggFreq < 0.18 && liveRead.foldFreq > 0.50) {
                            bluffFrac = Math.min(1.40, bluffFrac + 0.20);
                        }
                    }

                    console.debug(`[HorseBrain]  RIVER BLUFF: ${handStr} blockers=[NFD=${blocksNutFlush},TopSet=${blocksTopSet},Str=${blocksStraight}] count=${blockerCount} story=${narrative.suggestedLine} opp=${oppTendency} — ${Math.round(bluffFrac * 100)}% pot`);
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * bluffFrac)) };
                }
            }

            // ── RIVER SHOWDOWN VALUE CHECK-BACK FRAMEWORK ──
            // If we reach here, we've declined to bet. But there's still a decision:
            // some medium hands OOP should consider leading small vs checking to showdown.

            // OOP medium hands: consider a small donk/lead if checked to us and opponent is passive
            if (!isIP && handEval.strength >= 30 && handEval.strength < 55 && canRaise && !multiway) {
                // Only lead if opponent has been passive (checking through)
                if (narrative.heroCheckedTurn || narrative.checkBehindCount >= 1) {
                    // Opponent showed weakness by checking — lead for thin value/denial
                    let leadFreq = 0.15;
                    let leadFrac = 0.30 + Math.random() * 0.10; // 30-40% pot
                    if (oppTendency === 'weak-tight' && oppConfidence > 0.3) leadFreq = 0.25;
                    if (turnToRiverDelta > 5) leadFreq += 0.06; // River helped us
                    if (turnToRiverDelta < -5) leadFreq -= 0.06; // River hurt us

                    // ═══ LIVE-READ RIVER OOP LEAD (Phase 29) ═══
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Passive opp checked back = very weak range → lead more
                        if (liveRead.aggFreq < 0.25) leadFreq += 0.12;
                        // Aggressive opp checked back = EXTREMELY weak → lead even more
                        if (liveRead.aggFreq > 0.40) leadFreq += 0.15;
                        // High fold freq → lead for denial, smaller sizing
                        if (liveRead.foldFreq > 0.50) {
                            leadFreq += 0.08;
                            leadFrac = Math.max(0.25, leadFrac - 0.05);
                        }
                        // Calling station → only lead for value (str >= 42)
                        if (liveRead.callFreq > 0.60 && handEval.strength < 42) {
                            leadFreq = Math.max(0.05, leadFreq - 0.12);
                        }
                        if (liveRead.callFreq > 0.55 && handEval.strength >= 42) {
                            leadFreq += 0.08;
                            leadFrac = Math.min(0.45, leadFrac + 0.05); // Size up for value
                        }
                        // Low WTSD = gives up easily → lead to take the pot
                        if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) leadFreq += 0.08;
                        // High WTSD = sticky → only lead strong medium+
                        if (liveRead.wtsd !== null && liveRead.wtsd > 0.32 && handEval.strength < 42) {
                            leadFreq = Math.max(0.05, leadFreq - 0.08);
                        }
                        // One-and-done detection: high cBet but low secondBarrel → they gave up, take pot
                        if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.60 &&
                            liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.30) {
                            leadFreq += 0.10; // They checked turn = gave up, river lead prints money
                        }
                        // Check-raise threat: if they might CR us, be careful
                        if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct > 0.12) {
                            leadFreq = Math.max(0.08, leadFreq - 0.06);
                            leadFrac = Math.max(0.25, leadFrac - 0.04); // Smaller to lose less if raised
                        }
                    }

                    leadFreq = Math.max(0, Math.min(0.50, leadFreq));
                    if (Math.random() < leadFreq) {
                        console.debug(`[HorseBrain]  RIVER OOP LEAD: str=${handEval.strength} freq=${Math.round(leadFreq * 100)}% size=${Math.round(leadFrac * 100)}% live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * leadFrac)) };
                    }
                }
            }

            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ═══ FACING A BET ON RIVER ═══
        // This is THE most important decision in poker.

        // ═══ RIVER POLARIZATION-AWARE FACING-BET FRAMEWORK ═══
        // MUST be computed BEFORE facingRiverRaise block which uses polarCallMod.
        const oppRangeIsPolarized = (() => {
            if (betToPot >= 0.80) return true;
            if (betToPot >= 1.2) return true;
            if (oppTendency === 'bluffy' && oppConfidence > 0.3) return true;
            if (boardEvolution.drawsCompleted.length > 0) return true;
            if (oppStreetAggression === 'very_heavy') return true;
            if (liveRead && liveRead.confidence >= 0.20) {
                if (liveRead.aggFreq > 0.50 && liveRead.overbetPct !== null && liveRead.overbetPct > 0.10) return true;
                if (liveRead.bluffRate !== null && liveRead.bluffRate > 0.35) return true;
            }
            return false;
        })();

        const liveNitMerged = liveRead && liveRead.confidence >= 0.25 &&
            liveRead.aggFreq < 0.20 && liveRead.foldFreq > 0.45;
        const oppRangeIsMerged = !oppRangeIsPolarized && (
            betToPot <= 0.45 ||
            (oppTendency === 'weak-tight' && oppConfidence > 0.3) ||
            liveNitMerged ||
            boardEvolution.evolution === 'static_brick' ||
            oppStreetAggression === 'light'
        );

        const polarCallMod = oppRangeIsPolarized ? 0.08 : oppRangeIsMerged ? -0.06 : 0;
        const polarRaiseMod = oppRangeIsPolarized ? -0.08 : oppRangeIsMerged ? 0.08 : 0;

        // ═══ FACING A RAISE ON RIVER (Hero bet, got raised) ═══
        // The most polarized spot in poker. Opponent raises our river bet = the NUTS or a bluff.
        // Our response depends on: hand strength, blockers, opponent profile, board texture.
        const heroAlreadyBetRiver = narrative.barrelsInARow >= 1 && facingBet && street === 'river';
        const facingRiverRaise = heroAlreadyBetRiver && betToPot >= 0.50;
        if (facingRiverRaise) {
            // ── STONE COLD NUTS: Re-raise for max value ──
            if (handEval.strength >= 90 && canRaise) {
                // On the river, raising a raise with the nuts = all-in
                return { type: 'all_in' };
            }
            // ── VERY STRONG: Call (we're near the top of our range but not the nuts) ──
            if (handEval.strength >= 75) {
                // Against polarized range: call (they're either nutted or bluffing)
                // Only re-raise with actual nuts (handled above)
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
            // ── BLUFF-CATCHER ZONE (55-74): Blockers + reads matter enormously ──
            if (handEval.strength >= 55) {
                let riverRaiseCallFreq = 0.25; // Base: call ~25% of the time in this range
                // ═══ BLOCKER-BASED CALL vs RIVER RAISE ═══
                const bcBlockerCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
                if (bcBlockerCount >= 2) riverRaiseCallFreq += 0.20;
                else if (bcBlockerCount >= 1) riverRaiseCallFreq += 0.10;
                // ═══ OPPONENT READ-BASED ═══
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) riverRaiseCallFreq += 0.15;
                if (oppBluffFreq > 0.40 && oppConfidence > 0.4) riverRaiseCallFreq += 0.10;
                if (oppTendency === 'weak-tight' && oppConfidence > 0.4) riverRaiseCallFreq = 0.05; // They NEVER bluff-raise river
                // ═══ BOARD EVOLUTION ═══
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    riverRaiseCallFreq += 0.08; // Missed draws → more bluff raises
                }
                if (boardEvolution.drawsCompleted.length > 0 && !handEval.category?.includes('flush') && !handEval.category?.includes('straight')) {
                    riverRaiseCallFreq -= 0.12; // Draws got there → they probably have it
                }
                // ═══ POLARIZATION CONTEXT ═══
                riverRaiseCallFreq += polarCallMod * 0.5; // Half the normal polarization effect
                // ═══ SIZE TELLS ═══
                if (betToPot >= 2.0) riverRaiseCallFreq -= 0.05; // Massive overbet raise = usually nuts
                if (betToPot <= 0.70) riverRaiseCallFreq += 0.08; // Small raise = often thin/bluff

                // ═══ LIVE-READ RIVER FACING-RAISE (Phase 22) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Aggressive opponents bluff-raise rivers more
                    if (liveRead.aggFreq > 0.45) riverRaiseCallFreq += 0.08;
                    if (liveRead.aggFreq > 0.55) riverRaiseCallFreq += 0.05;
                    if (liveRead.aggFreq < 0.20) riverRaiseCallFreq -= 0.10;
                    // High bluff rate = call more vs river raise
                    if (liveRead.bluffRate !== null && liveRead.bluffRate > 0.30) riverRaiseCallFreq += 0.10;
                    if (liveRead.bluffRate !== null && liveRead.bluffRate < 0.10) riverRaiseCallFreq -= 0.08;
                    // WTSD: low = they only get here with the goods
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) riverRaiseCallFreq -= 0.08;
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.32) riverRaiseCallFreq += 0.06;
                    // Fold-to-raise: if they rarely fold to raises they're value-heavy
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct < 0.25) riverRaiseCallFreq -= 0.06;
                    // Timing tells: snap aggression on river = polarized (strong or pure bluff)
                    if (currentActionTimingTell === 'snap_aggression') {
                        if (bcBlockerCount >= 2) riverRaiseCallFreq += 0.10;
                        else riverRaiseCallFreq -= 0.04;
                    }
                    if (currentActionTimingTell === 'tank_aggression') riverRaiseCallFreq += 0.06;
                }

                riverRaiseCallFreq = Math.max(0.02, Math.min(0.55, riverRaiseCallFreq));
                if (Math.random() < riverRaiseCallFreq) {
                    console.debug(`[HorseBrain]  RIVER vs RAISE CALL: str=${handEval.strength} blockers=${bcBlockerCount} freq=${Math.round(riverRaiseCallFreq * 100)}%`);
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
                console.debug(`[HorseBrain]  RIVER vs RAISE FOLD: str=${handEval.strength} blockers=${bcBlockerCount}`);
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }
            // ── DRAWS / WEAK HANDS: Almost always fold to river raise ──
            // River raises are incredibly strong — folding weak hands is correct
            const weakBlockerCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
            let weakHeroCallFreq = 0.10;
            if (oppTendency === 'bluffy') weakHeroCallFreq = 0.15;
            // ═══ LIVE-READ WEAK HAND vs RIVER RAISE (Phase 22) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                if (liveRead.aggFreq > 0.50) weakHeroCallFreq += 0.06;
                if (liveRead.bluffRate !== null && liveRead.bluffRate > 0.35) weakHeroCallFreq += 0.08;
                if (liveRead.aggFreq < 0.20) weakHeroCallFreq = 0.02;
            }
            if (handEval.strength >= 40 && weakBlockerCount >= 2) {
                // Hero-call raise with premium blockers vs known/live-read bluffer
                if (Math.random() < weakHeroCallFreq) return canCall ? { type: 'call' } : { type: 'fold' };
            }
            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ── POT COMMITTED: Call or jam ──
        if (isPotCommitted && handEval.strength >= 35) {
            if (canRaise && handEval.strength >= 75) return { type: 'all_in' };
            return canCall ? { type: 'call' } : { type: 'fold' };
        }

        // ── OOP MATRIX: structured river facing-bet decisions ──
        if (!isIP && oppConfidence >= 0.25) {
            const riverOopDecision = getOOPDecisionMatrix({
                handStrength: handEval.strength,
                handCategory: handEval.category,
                hasStrongDraw: false, // River: no more draws
                hasWeakDraw: false,
                street: 'river',
                boardWetness: boardWet,
                boardIsPaired: boardPaired,
                boardIsMonotone: maxSuitCount >= 3,
                numPlayers,
                aggressionBias: aggressionBias + narrativeAggrMod,
                oppTendency, oppConfidence, oppCallFreq,
                oppCbetFreq: 0.60,
                heroIsAggressor,
                potSize, toCall, stackBB,
                liveRead  // Phase 28: pass live-read to OOP matrix
            });

            // ═══ OOP CHECK-RAISE BOOST: posFreqMod integration (river) ═══
            const riverCRFreq = riverOopDecision.action === 'check_raise'
                ? Math.min(0.85, riverOopDecision.frequency + posFreqMod.oopCheckRaiseBoost)
                : riverOopDecision.frequency;

            if (riverOopDecision.action === 'check_raise' && canRaise && Math.random() < riverCRFreq) {
                const crSize = Math.round(toCall * (riverOopDecision.sizeFraction || 3.0));
                console.debug(`[HorseBrain]  TR-OOP MATRIX: river check-raise (${riverOopDecision.reason}) freq=${Math.round(riverCRFreq * 100)}%`);
                return { type: raiseAction.type, amount: clampAmt(crSize) };
            }
            if (riverOopDecision.action === 'check_fold' && handEval.strength < 40) {
                // Only respect check_fold if we're not being offered great pot odds
                if (potOdds > 0.25) {
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }
            // check_call falls through to existing river logic
        }

        // (polarCallMod, polarRaiseMod, oppRangeIsPolarized, oppRangeIsMerged
        //  are defined above the facingRiverRaise block — Phase 35 fix)

        // ── MONSTERS: Raise for value ──
        if (handEval.strength >= 85 && canRaise) {
            // Against calling stations, raise HUGE
            let valueMult = 0.80;
            if (oppCallFreq > 0.60 && oppConfidence > 0.3) valueMult = 1.10;
            // ═══ POLARIZATION: vs merged, raise bigger (they can't fold medium hands) ═══
            if (oppRangeIsMerged) valueMult = Math.min(1.30, valueMult + 0.15);
            // ═══ POLARIZATION: vs polarized, smaller raise (they're snap-folding bluffs anyway) ═══
            if (oppRangeIsPolarized) valueMult = Math.max(0.65, valueMult - 0.10);
            // ═══ LIVE-READ RIVER MONSTER SIZING (Phase 24) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                if (liveRead.callFreq > 0.60) valueMult = Math.min(1.40, valueMult + 0.15);
                if (liveRead.foldFreq > 0.55) valueMult = Math.max(0.55, valueMult - 0.12);
                if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) valueMult = Math.min(1.35, valueMult + 0.10);
            }
            const raiseSize = Math.round(toCall + potSize * valueMult);
            return { type: raiseAction.type, amount: clampAmt(raiseSize) };
        }

        // ── STRONG HANDS: Raise small bets for value OR call ──
        // ═══ 3-BET POT: Top pair is premium on the river in 3-bet pots ═══
        const riverStrongThreshold = is3BetPot ? 48 : is4BetPot ? 40 : 55;
        if (handEval.strength >= riverStrongThreshold) {
            // ═══ OPPONENT-AWARE STRONG HAND LAYDOWN ═══
            // If a known weak-tight player is betting big on the river in a heavy pot, RESPECT IT
            if (oppTendency === 'weak-tight' && oppConfidence > 0.4 &&
                betToPot >= 0.75 && oppRangeStrength === 'polarized' && handEval.strength < 70 && !is3BetPot) {
                // ═══ LIVE-READ RIVER LAYDOWN OVERRIDE (Phase 24) ═══
                // If live data says they're actually aggressive, don't auto-fold
                if (liveRead && liveRead.confidence >= 0.25 && liveRead.aggFreq > 0.40) {
                    // Override: aggro player, don't fold strong hands
                } else {
                    console.debug(`[HorseBrain]  RIVER LAYDOWN: opp=weak-tight, big bet in heavy pot, strength=${handEval.strength}`);
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }
            // ═══ LIVE-READ RIVER TIGHT PLAYER LAYDOWN (Phase 24) ═══
            // New: live data can INDEPENDENTLY trigger a laydown even without static weak-tight tag
            if (liveRead && liveRead.confidence >= 0.30 && liveRead.aggFreq < 0.15 &&
                betToPot >= 0.80 && handEval.strength < 68 && !is3BetPot) {
                console.debug(`[HorseBrain]  RIVER LIVE LAYDOWN: opp aggFreq=${liveRead.aggFreq.toFixed(2)}, big bet, str=${handEval.strength}`);
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }

            // ═══ RAISE-FOR-VALUE vs SMALL BETS (geometric sizing) ═══
            // When opponent makes a small bet (block/probe) with strong hands (65+),
            // we should raise for value — their bet looks weak/blocking.
            // Use geometric sizing to plan optimal raise for stack-off.
            if (canRaise && handEval.strength >= 65 && betToPot <= 0.45 && !multiway) {
                let raiseFreq = 0.35;
                // Against calling stations, raise for value more (they call raises too)
                if (oppCallFreq > 0.55 && oppConfidence > 0.3) raiseFreq = 0.50;
                // Against aggressive opponents, raise less (they might be trapping)
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) raiseFreq = 0.25;
                // Narrative: we've been passive → raise is unexpected = gets paid
                if (narrative.checkBehindCount >= 1) raiseFreq += 0.08;
                // Narrative: we've been barreling → raise is credible continuation
                if (narrative.barrelsInARow >= 1 && narrative.storyIsConsistent) raiseFreq += 0.06;
                // ═══ LIVE-READ RIVER VALUE RAISE (Phase 24) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Stations = raise more (they call raises with worse)
                    if (liveRead.callFreq > 0.55) raiseFreq += 0.10;
                    // High WTSD = they go to showdown → raise for value
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) raiseFreq += 0.06;
                    // Aggressive opponents may 3-bet — be cautious
                    if (liveRead.aggFreq > 0.50) raiseFreq -= 0.08;
                    // Fold-to-raise: low = they call a lot of raises
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct < 0.30) raiseFreq += 0.08;
                }
                // ═══ POLARIZATION: raise more vs merged (they fold too much to raises) ═══
                raiseFreq += polarRaiseMod;
                raiseFreq = Math.max(0.10, Math.min(0.55, raiseFreq));

                if (Math.random() < raiseFreq) {
                    // Geometric sizing: what raise gets us to a natural stack-off?
                    const potAfterCall = potSize + toCall * 2;
                    const geoRaise = getGeometricSizing(potAfterCall, heroStack - toCall, 1, true);

                    let raiseMult;
                    if (geoRaise.isJammable && spr <= 3) {
                        // Low SPR: just jam
                        return { type: 'all_in' };
                    } else if (spr <= 6) {
                        // Medium SPR: raise big for max value
                        raiseMult = 3.0 + Math.random() * 0.5;
                    } else {
                        // Deep: standard value raise
                        raiseMult = 2.5 + Math.random() * 0.5;
                    }
                    // Against calling stations, go bigger
                    if (oppCallFreq > 0.55 && oppConfidence > 0.3) raiseMult = Math.min(4.0, raiseMult * 1.15);
                    const raiseSize = Math.round(toCall * raiseMult);
                    console.debug(`[HorseBrain]  RIVER VALUE RAISE: str=${handEval.strength} betToPot=${Math.round(betToPot * 100)}% raise=${raiseMult.toFixed(1)}x`);
                    return { type: raiseAction.type, amount: clampAmt(raiseSize) };
                }
            }

            return canCall ? { type: 'call' } : { type: 'fold' };
        }

        // ════════════════════════════════════════
        //  BLUFF-CATCHING ENGINE (UPGRADED)
        //  The science of calling at the right frequency
        // ════════════════════════════════════════

        // MDF = Minimum Defense Frequency = pot / (pot + bet)
        // If we fold more than (1-MDF), opponent profits from bluffing any two cards
        const mdf = potSize / (potSize + toCall);
        const handEquityFrac = handEval.strength / 100;

        // ═══ DYNAMIC FOLD THRESHOLD ═══
        // Adjust fold threshold based on enriched opponent data
        let dynFoldThreshold = foldThreshold;
        // If we KNOW opponent bluffs a lot (from Advanced module), lower threshold
        if (oppBluffFreq > 0.35 && oppConfidence > 0.3) {
            dynFoldThreshold = Math.max(18, dynFoldThreshold - Math.round(oppConfidence * 10));
        }
        // If opponent rarely bluffs, raise threshold (fold more marginal hands)
        if (oppBluffFreq < 0.15 && oppConfidence > 0.3) {
            dynFoldThreshold = Math.min(45, dynFoldThreshold + Math.round(oppConfidence * 8));
        }
        // ═══ LIVE-READ DYNAMIC FOLD THRESHOLD (Phase 24) ═══
        if (liveRead && liveRead.confidence >= 0.20) {
            // Live bluff rate overrides static — direct fold threshold adjustment
            if (liveRead.bluffRate !== null && liveRead.bluffRate > 0.35) {
                dynFoldThreshold = Math.max(15, dynFoldThreshold - 6);
            }
            if (liveRead.bluffRate !== null && liveRead.bluffRate < 0.12) {
                dynFoldThreshold = Math.min(48, dynFoldThreshold + 6);
            }
            // Live aggFreq: very aggressive = lower threshold (they barrel too much)
            if (liveRead.aggFreq > 0.50) dynFoldThreshold = Math.max(15, dynFoldThreshold - 4);
            // Live passivity: very passive river bet = strong → raise threshold
            if (liveRead.aggFreq < 0.18) dynFoldThreshold = Math.min(50, dynFoldThreshold + 5);
            // WTSD: low = they rarely bluff river → fold more
            if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) dynFoldThreshold = Math.min(48, dynFoldThreshold + 4);
            if (liveRead.wtsd !== null && liveRead.wtsd > 0.35) dynFoldThreshold = Math.max(18, dynFoldThreshold - 4);
        }
        // ═══ SPR-DRIVEN FOLD THRESHOLD ═══
        // Low SPR: call wider (we're pot-committed, folding loses too much equity)
        // High SPR: fold threshold stays normal (plenty of room to maneuver)
        dynFoldThreshold = Math.max(15, dynFoldThreshold - Math.round(sprStrategy.callWidthBonus * 30));

        // ═══ POLARIZATION-DRIVEN FOLD THRESHOLD ═══
        // Vs polarized opponent: call wider (their range includes bluffs → our bluff-catchers are profitable)
        // Vs merged opponent: fold tighter (they rarely bluff → our marginals are behind)
        if (oppRangeIsPolarized) {
            dynFoldThreshold = Math.max(15, dynFoldThreshold - 4); // Call wider
        }
        if (oppRangeIsMerged) {
            dynFoldThreshold = Math.min(50, dynFoldThreshold + 3); // Fold tighter
        }

        // ═══ COMMITMENT-DRIVEN FOLD THRESHOLD ═══
        // If we've invested heavily in the pot, don't fold easily on the river.
        // The math: if we've put in 40% of our stack, folding loses that investment.
        if (isHeavilyCommitted) {
            dynFoldThreshold = Math.max(15, dynFoldThreshold - 5); // Much wider calling
        } else if (isModeratelyCommitted) {
            dynFoldThreshold = Math.max(18, dynFoldThreshold - 2); // Slightly wider
        }

        // ═══ TIMING TELL — FOLD THRESHOLD ADJUSTMENT ═══
        // Live observer tracks how fast opponents make decisions.
        // SNAP-BET: When opponent bets/raises very quickly (<3s), it often means:
        //   - Auto-pilot (weak recreational) → call wider
        //   - Pre-planned bluff (programmed action) → call wider
        //   - Very strong hand (instajam) → context-dependent
        // LONG-TANK then BET: Took 15+ seconds → often means:
        //   - Marginal decision → thin value or thin bluff → slightly wider calling
        //   - BUT long-tank then RAISE = usually very strong (deliberated then committed)
        if (oppTimingTell === 'fast_player' && oppConfidence > 0.2) {
            // Fast players tend to play less optimally → call slightly wider
            dynFoldThreshold = Math.max(15, dynFoldThreshold - 2);
        }

        // ═══ PHASE 15: CURRENT ACTION TIMING TELL — FOLD THRESHOLD ═══
        // This is the timing of THIS SPECIFIC action, compared to their baseline.
        // Much more powerful than overall player speed — reveals hand-specific tells.
        if (currentActionTimingTell !== 'unknown' && oppConfidence >= 0.20) {
            if (currentActionTimingTell === 'snap_call') {
                // Snap-call on turn/river = strong made hand or committed draw
                // Don't try to bluff them off → raise threshold for value-only
                dynFoldThreshold = Math.max(15, dynFoldThreshold - 1);
            } else if (currentActionTimingTell === 'snap_aggression') {
                // Snap-bet or snap-raise = polarized (auto-bluff or nut hand)
                // With blockers → call wider. Without → fold tighter.
                if (hasAnyBlocker) {
                    dynFoldThreshold = Math.max(15, dynFoldThreshold - 4);
                } else {
                    dynFoldThreshold = Math.min(50, dynFoldThreshold + 1);
                }
            } else if (currentActionTimingTell === 'tank_aggression') {
                // Long tank then bet/raise = marginal value or thin bluff
                // They were UNSURE → call wider, their range is weak
                dynFoldThreshold = Math.max(15, dynFoldThreshold - 3);
            } else if (currentActionTimingTell === 'tank_call') {
                // Long tank then call = drawing or marginal
                // If we can barrel again, their range is capped
                dynFoldThreshold = Math.max(18, dynFoldThreshold - 1);
            } else if (currentActionTimingTell === 'deliberate') {
                // Slightly longer than average = genuine decision
                // Slight fold threshold reduction (they're not super strong)
                dynFoldThreshold = Math.max(18, dynFoldThreshold - 1);
            }
        }

        // ═══ IN-HAND ACTION SEQUENCE — FOLD THRESHOLD ═══
        // Use the current hand's action history to adjust fold threshold.
        // Opponent's prior street actions tell us a LOT about their range.
        if (oppInHandActions) {
            const inHandActs = oppInHandActions.actions || [];
            const oppFlopAction = inHandActs.find(a => a.street === 'flop');
            const oppTurnAction = inHandActs.find(a => a.street === 'turn');

            if (street === 'river') {
                // Check-check flop → bet turn → bet river = often thin value or draw that got there
                if (oppFlopAction && oppFlopAction.action === 'check' && oppTurnAction && oppTurnAction.action === 'bet') {
                    dynFoldThreshold = Math.max(18, dynFoldThreshold - 3); // Delayed aggression = wider range
                }
                // Bet-bet-bet (triple barrel) from a one_and_done player = VERY strong (they never do this)
                if (oppExploits.includes('one_and_done') && inHandActs.filter(a => ['bet', 'raise'].includes(a.action)).length >= 3) {
                    dynFoldThreshold = Math.min(55, dynFoldThreshold + 8); // Massive fold adjustment
                }
                // Check-raise on earlier street then bets river = polarized strength
                const hadCheckRaise = inHandActs.some(a => a.action === 'raise' && a.street !== 'preflop');
                if (hadCheckRaise && oppInHandActions.streetAggression[street]) {
                    dynFoldThreshold = Math.min(50, dynFoldThreshold + 3);
                }
            }
            if (street === 'turn') {
                // Opponent c-bet flop then bets turn = continuation, check live barrel rate
                if (oppFlopAction && ['bet', 'raise'].includes(oppFlopAction.action) && oppInHandActions.isAggressor) {
                    // Live second barrel% tells us how often they actually follow through
                    if (liveRead && liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.35) {
                        // They rarely double-barrel — this is strong → fold tighter
                        dynFoldThreshold = Math.min(50, dynFoldThreshold + 4);
                    } else if (liveRead && liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct > 0.70) {
                        // They always barrel — this is often air → call wider
                        dynFoldThreshold = Math.max(18, dynFoldThreshold - 3);
                    }
                }
            }
        }

        // ═══ LIVE BET-SIZING TELL — FOLD THRESHOLD ═══
        if (liveSizingTell !== 'unknown' && oppConfidence >= 0.20) {
            if (liveSizingTell === 'larger_than_usual') {
                if (street === 'river' && hasAnyBlocker) {
                    dynFoldThreshold = Math.max(18, dynFoldThreshold - 3);
                } else {
                    dynFoldThreshold = Math.min(50, dynFoldThreshold + 2);
                }
            } else if (liveSizingTell === 'smaller_than_usual') {
                dynFoldThreshold = Math.max(15, dynFoldThreshold - 3);
            } else if (liveSizingTell === 'rare_overbet') {
                if (hasAnyBlocker || blocksOverpair) {
                    dynFoldThreshold = Math.max(20, dynFoldThreshold - 2);
                } else {
                    dynFoldThreshold = Math.min(55, dynFoldThreshold + 5);
                }
            }
        }

        if (handEval.strength >= dynFoldThreshold) {
            // FACTOR 1: Direct equity vs pot odds
            if (handEquityFrac >= potOdds) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // FACTOR 2: Known bluffer → widen calling range
            if (oppBluffy && handEval.strength >= dynFoldThreshold - 8) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // FACTOR 3: Small bet sizing → very wide calling range
            // 25-33% pot bets need to be called with almost any pair
            if (betToPot <= 0.35 && handEval.strength >= 25) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // FACTOR 4: Overbet (>pot) → POLARIZED → call wider with medium hands
            // Overbets are either the nuts or a bluff — our medium hands are bluff-catchers
            if (betToPot >= 1.0 && handEval.strength >= 38) {
                // Against known bluffers, call overbets MORE
                let overbetCallFreq = 0.40;
                if (oppBluffy && oppConfidence > 0.3) overbetCallFreq = 0.55;
                // ═══ POLARIZATION: overbets confirm polarized range → call wider ═══
                overbetCallFreq += polarCallMod;
                if (Math.random() < overbetCallFreq) {
                    console.debug(`[HorseBrain]  BLUFF-CATCH: overbet (${Math.round(betToPot * 100)}% pot) str=${handEval.strength} opp=${oppTendency}`);
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
            }

            // FACTOR 5: Board missed draws → opponent more likely bluffing
            // If flush/straight draws bricked and opponent bets big = likely bluff
            if (scareLevel === 0 && betToPot >= 0.60 && handEval.strength >= 30) {
                // ═══ DRAW BRICKED DETECTION (BOARD EVOLUTION ENHANCED) ═══
                // River completed nothing — opponent's turn draws missed
                let brickCallFreq = 0.35;
                if (turnToRiverDelta <= -5) brickCallFreq += 0.10; // River hurt our hand too = both have air
                if (oppBluffFreq > 0.30 && oppConfidence > 0.25) brickCallFreq += 0.10;
                // ═══ BOARD EVOLUTION: Bricked draws = more bluffs in opponent range ═══
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    brickCallFreq += 0.08 * boardEvolution.drawsBricked.length; // Each bricked draw = more air
                }
                if (boardEvolution.evolution === 'static_brick') {
                    brickCallFreq += 0.06; // Total brick = high bluff frequency
                }
                // But if draws completed, opponent is less likely bluffing
                if (boardEvolution.drawsCompleted.length > 0) {
                    brickCallFreq -= 0.10; // They could have it
                }
                brickCallFreq = Math.max(0.10, Math.min(0.60, brickCallFreq));
                if (Math.random() < brickCallFreq) {
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
            }

            // FACTOR 6: Personality-driven call frequency
            // Loose players call more, tight players fold more
            if (isLoose && handEval.strength >= dynFoldThreshold - 5 && Math.random() < callFreq) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // FACTOR 7 (NEW): Light pot = wide ranges = call lighter
            // If the pot was built with little aggression, opponent's range is wide
            if (oppRangeStrength === 'weak' && handEval.strength >= 25 && betToPot <= 0.60) {
                if (Math.random() < 0.40) {
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
            }
        }

        // ════════════════════════════════════════════════════
        //  HERO CALL ENGINE (WORLD-CLASS)
        //  The hardest decision in poker — calling with marginal
        //  hands when you think opponent is bluffing.
        //  Uses: MDF math, blockers, reads, narrative, board texture
        // ════════════════════════════════════════════════════

        // Hero calls happen BELOW the dynamic fold threshold — these are hands
        // that "shouldn't" call by default but have strong reasons to.
        if (handEval.strength >= 18 && handEval.strength < dynFoldThreshold && canCall) {

            // ── BASE HERO CALL PROBABILITY ──
            // Start from MDF: we NEED to call some % to prevent exploitation
            // MDF tells us how often we need to defend to make opponent's bluffs breakeven
            // Bug #161: Wire mdf into hero call base — higher MDF = more incentive to hero call
            let heroCallProb = (mdf - 0.50) * 0.15; // At MDF=0.67 → +2.5%, at MDF=0.50 → 0%

            // ═══ POSITION-AWARE HERO CALL BASE ═══
            // IP hero calls wider (already closed action, no position disadvantage)
            // OOP hero calls tighter (especially vs large bets — can't see free cards)
            heroCallProb += posFreqMod.ipCallWidth;
            if (!isIP && betToPot >= 0.75) heroCallProb -= posFreqMod.oopFoldMoreVsBig;

            // ═══ POLARIZATION-DRIVEN HERO CALL ═══
            // Vs polarized: their range includes bluffs → hero calls are more profitable
            // Vs merged: they have value → hero calls burn money
            heroCallProb += polarCallMod;

            // If we're under-defending (folding more than 1-MDF), bump up calling
            const targetDefenseFreq = mdf; // e.g., 0.60 for 66% pot bet
            // We want ~targetDefenseFreq of our range to call. But we're at the bottom.
            // Give these bottom-of-range hands a base call freq proportional to MDF.
            heroCallProb = targetDefenseFreq * 0.25; // Start at 25% of MDF

            // ── BLOCKER-BASED HERO CALL ──
            // If we block opponent's value range, their bet is more likely a bluff
            if (blocksNutFlush) heroCallProb += 0.12; // We block their nut flush → more bluffs
            if (blocksSecondNutFlush) heroCallProb += 0.08;
            if (blocksTopSet) heroCallProb += 0.08; // We block their top set
            if (blocksOverpair) heroCallProb += 0.05; // We block AA/KK
            if (blocksStraight) heroCallProb += 0.06;

            // Combo blocker bonus
            const heroBlockerCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
            if (heroBlockerCount >= 2) heroCallProb += 0.10; // Multiple blockers = strong call candidate

            // ═══ PHASE 36A: GRANULAR BLOCKER QUALITY → HERO CALL ═══
            // heroCallBlockerQuality combines rank-weighted value blocking + unblock analysis.
            // Captures: Ace-high blocker > King-high, and unblocking opponent's missed draws.
            if (heroCallBlockerQuality >= 0.25) {
                heroCallProb += 0.12; // Premium: blocks value + unblocks bluffs
            } else if (heroCallBlockerQuality >= 0.15) {
                heroCallProb += 0.06; // Good: meaningful blocker impact
            } else if (heroCallBlockerQuality < 0.05) {
                heroCallProb -= 0.04; // Poor: no blocker value, bad hero call candidate
            }

            // ── READ-BASED HERO CALL ──
            if (oppBluffFreq > 0.35 && oppConfidence > 0.3) {
                heroCallProb += 0.12; // Known bluffer: call wider
            }
            if (oppBluffFreq > 0.50 && oppConfidence > 0.4) {
                heroCallProb += 0.08; // Prolific bluffer: call even wider
            }
            if (oppTendency === 'bluffy') {
                heroCallProb += 0.06;
            }
            // Against known value-heavy players, fold more
            if (oppBluffFreq < 0.15 && oppConfidence > 0.4) {
                heroCallProb -= 0.15; // They rarely bluff → respect the bet
            }

            // ── TIMING TELL HERO CALL ADJUSTMENT ──
            // Opponent's decision speed on THIS bet gives real-time information
            if (oppInHandActions && oppInHandActions.lastAction) {
                const lastTiming = oppInHandActions.lastAction.timing || 0;
                if (lastTiming > 0 && lastTiming < 3000) {
                    // SNAP-BET: Quick decision → less deliberation → more likely auto-pilot or bluff
                    heroCallProb += 0.06;
                } else if (lastTiming > 15000) {
                    // LONG TANK then BET: Deliberated → more likely thin value (had to think about it)
                    // BUT: long tank then RAISE = usually strong (they tank-called their decision)
                    if (oppInHandActions.lastAction.action === 'bet') {
                        heroCallProb += 0.03; // Thin value → marginal call is OK
                    } else if (oppInHandActions.lastAction.action === 'raise') {
                        heroCallProb -= 0.06; // Tank-raise = usually real strength
                    }
                }
            }

            // ── IN-HAND SEQUENCE HERO CALL ──
            // Use the opponent's prior street actions in THIS hand to refine hero call
            if (oppInHandActions) {
                const inActs = oppInHandActions.actions || [];
                const wasPassiveEarlier = inActs.some(a => a.street !== street && a.action === 'check');
                const wasAggressiveEarlier = inActs.filter(a => a.street !== street && ['bet', 'raise'].includes(a.action)).length;

                // Passive earlier → now betting = could be trap or sudden strength
                if (wasPassiveEarlier && wasAggressiveEarlier === 0) {
                    heroCallProb -= 0.04; // Checked earlier, now betting = more likely value
                }
                // Consistently aggressive = wider range → hero call more
                if (wasAggressiveEarlier >= 2) {
                    heroCallProb += 0.05; // Triple barrel = polarized, bluff catchers are profitable
                }
            }

            // ── LIVE EXPLOIT HERO CALL ──
            // Specific exploit patterns directly impact hero calling profitability
            if (oppExploits.includes('frequent_overbetter') && betToPot >= 0.90) {
                heroCallProb += 0.10; // Known overbetter → their overbets include bluffs
            }
            if (oppExploits.includes('gives_up_easily') && street === 'river') {
                heroCallProb -= 0.06; // If they usually give up but bet river, it's more real
            }
            if (oppExploits.includes('one_and_done') && street === 'river') {
                heroCallProb -= 0.10; // They never barrel river unless it's value
            }

            // ── NARRATIVE-BASED HERO CALL ──
            // If opponent has been passive all hand but suddenly bets river → suspicious
            if (oppStreetAggression === 'light' && betToPot >= 0.60) {
                heroCallProb += 0.08; // Sudden aggression after passive line = often bluff
            }
            // If opponent bet every street (triple barrel) with a big final bet
            if (oppStreetAggression === 'very_heavy' && betToPot >= 0.75) {
                // Could be value OR committed bluff — use blockers to decide
                if (heroBlockerCount >= 1) heroCallProb += 0.06;
                else heroCallProb -= 0.05;
            }

            // ── BOARD TEXTURE HERO CALL ──
            // Board that bricked all draws → opponent's draws missed → more bluffs
            if (scareLevel === 0 && turnToRiverDelta <= -5) {
                heroCallProb += 0.08; // Draws missed: opponent more likely bluffing
            }
            // Board completed obvious draws but we still have showdown value
            if (scareLevel >= 2 && handEval.strength >= 30) {
                heroCallProb -= 0.06; // Draw completed → opponent more likely to have it
            }

            // ═══ BOARD EVOLUTION-DRIVEN HERO CALL ═══
            // The runout story tells us how likely opponent is bluffing
            if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                // Draws bricked on river = opponent's semi-bluffs are now air
                // This is the #1 hero call scenario — their draws missed
                heroCallProb += 0.10 * boardEvolution.drawsBricked.length; // More bricked draws = more bluffs
                heroCallProb = Math.min(heroCallProb, 0.70); // Soft cap
            }
            if (boardEvolution.drawsCompleted.length > 0 && !handEval.category?.includes('flush') && !handEval.category?.includes('straight')) {
                // Draws completed and we don't have the draw = fold more
                heroCallProb -= 0.08 * boardEvolution.drawsCompleted.length;
                // But if we block the completed draw, still hero call
                if (blocksNutFlush && boardEvolution.drawsCompleted.includes('flush')) {
                    heroCallProb += 0.12; // We block their flush = more likely bluff
                }
            }
            if (boardEvolution.evolution === 'static_brick') {
                // River was a complete blank — opponent is more likely to be bluffing
                heroCallProb += 0.06;
            }
            if (boardEvolution.evolution === 'caller_favorable' && heroIsAggressor) {
                // River helped their range — their bets are more credible
                heroCallProb -= 0.06;
            }

            // ── BET SIZE ADJUSTMENT ──
            // Small bets = more likely thin value or blocker → can call wider
            if (betToPot <= 0.40) heroCallProb += 0.10;
            // Medium bets = standard — use base probability
            // Large bets = polarized → blockers matter more
            if (betToPot >= 0.80) {
                // Large bet is polarized: either nuts or bluff
                // Without blockers, fold more. With blockers, call more.
                if (heroBlockerCount === 0) heroCallProb -= 0.10;
                if (heroBlockerCount >= 2) heroCallProb += 0.05;
            }
            // Overbets are extremely polarized
            if (betToPot >= 1.2) {
                if (heroBlockerCount >= 1) heroCallProb += 0.05;
                else heroCallProb -= 0.08;
            }

            // ── PERSONALITY ADJUSTMENT ──
            heroCallProb += aggressionBias / 80; // Aggressive horses hero call more

            // ═══ EXPLOIT INTENSIFIER INTEGRATION ═══
            // When we have high-confidence reads, the exploit engine can override
            // the base hero call math with exploit-specific adjustments.
            if (oppConfidence >= 0.50) {
                // EXPLOIT: Prolific bluffer → dramatically widen hero calling range
                if (oppBluffFreq > 0.40) {
                    const blufferBoost = 0.15 + (oppBluffFreq - 0.40) * 1.5; // 15-30%+ boost
                    heroCallProb += Math.min(0.30, blufferBoost);
                    // With blockers + known bluffer = snap call
                    if (heroBlockerCount >= 2) heroCallProb += 0.10;
                }
                // EXPLOIT: Nit betting big → auto-fold (they have it)
                if (oppTendency === 'weak-tight' && betToPot >= 0.60 && oppConfidence >= 0.55) {
                    heroCallProb = Math.max(0, heroCallProb - 0.25);
                    // Only hero call nits with premium blockers
                    if (heroBlockerCount < 2) heroCallProb = 0;
                }
                // EXPLOIT: Calling station suddenly betting big → respect (they finally have it)
                if (oppCallFreq > 0.60 && oppBluffFreq < 0.20 && betToPot >= 0.75) {
                    heroCallProb = Math.max(0, heroCallProb - 0.15);
                }
            }

            // ═══ LIVE-READ HERO CALL ADJUSTMENTS (Phase 21) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // High aggression frequency → they bet a LOT → more bluffs in range → call wider
                if (liveRead.aggFreq > 0.45) heroCallProb += 0.08;
                if (liveRead.aggFreq > 0.55) heroCallProb += 0.05; // Ultra aggressive
                // Low aggression → they rarely bet → when they do, it's real → fold more
                if (liveRead.aggFreq < 0.20) heroCallProb -= 0.08;
                // High WTSD → they go to showdown with wide range → our bluff catcher is better
                if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) heroCallProb += 0.06;
                // Low WTSD → they give up without showdown → if they bet river, it's real
                if (liveRead.wtsd !== null && liveRead.wtsd < 0.22 && street === 'river') heroCallProb -= 0.06;
                // Live bluff rate (showdown bluffs) → direct hero call indicator
                if (liveRead.bluffRate !== null && liveRead.bluffRate > 0.30) {
                    heroCallProb += 0.10; // Known live bluffer → call wider
                }
                if (liveRead.bluffRate !== null && liveRead.bluffRate < 0.10) {
                    heroCallProb -= 0.08; // Never bluffs → fold marginals
                }
                // Timing tell on THIS action
                if (currentActionTimingTell === 'snap_aggression') {
                    // Snap bet/raise = polarized (auto-bluff or nuts)
                    if (heroBlockerCount >= 1) heroCallProb += 0.08;
                    else heroCallProb -= 0.03;
                }
                if (currentActionTimingTell === 'tank_aggression') {
                    // Long tank then bet = marginal/thin value → hero call is profitable
                    heroCallProb += 0.06;
                }
                if (currentActionTimingTell === 'deliberate') {
                    heroCallProb += 0.03; // Standard decision → slight call
                }
                // One-and-done live detection: low second barrel + betting now = real
                if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.30 && street === 'river') {
                    heroCallProb -= 0.08; // They rarely barrel → river bet is value
                }
            }

            // Clamp
            heroCallProb = Math.max(0, Math.min(0.65, heroCallProb));

            if (heroCallProb > 0.05 && Math.random() < heroCallProb) {
                console.debug(`[HorseBrain]  HERO CALL: str=${handEval.strength} blockers=${heroBlockerCount} bq=${heroCallBlockerQuality.toFixed(2)} oppBluff=${(oppBluffFreq * 100).toFixed(0)}% bet=${Math.round(betToPot * 100)}%pot prob=${Math.round(heroCallProb * 100)}% live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
        }

        // ════════════════════════════════════════════════════
        //  RIVER CHECK-RAISE (OOP) — WORLD-CLASS
        //  The most polarized action in poker: check-raise river
        //  = absolute nuts or pure bluff with blockers.
        //  This section covers BOTH value and bluff check-raises.
        // ════════════════════════════════════════════════════
        if (!isIP && canRaise) {

            // ── VALUE CHECK-RAISE: Nuts (80+) ──
            // The classic trap: check, let opponent bet, then raise huge
            if (handEval.strength >= 80) {
                let valueCRFreq = 0.55;
                // Against bluffy opponents: ALWAYS check-raise (they bet wide)
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) valueCRFreq = 0.75;
                // Against callers: check-raise bigger (they call raises too)
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) valueCRFreq = 0.65;
                // Against passive opponents who bet rare → they have it too, check-raise smaller
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3 && betToPot >= 0.60) {
                    valueCRFreq = 0.80; // They bet = they have value → we have MORE value
                }
                // Narrative: if we've been passive all hand, check-raise is very unexpected
                if (narrative.checkBehindCount >= 2 || (narrative.heroCheckedFlop && narrative.heroCheckedTurn)) {
                    valueCRFreq += 0.10; // Passive line → surprise check-raise gets max value
                }
                // Polarization: check-raise bigger with polarized range
                const crPolarMod = riverRangeType === 'polarized' ? 1.15 : 0.90;

                // ═══ LIVE-READ RIVER VALUE CR ADJUSTMENTS ═══
                valueCRFreq += liveCRBoost; // Pre-computed from c-bet %, fold-to-raise, timing tells
                // River-specific: snap-call on river = they auto-called turn = may be on autopilot
                if (currentActionTimingTell === 'snap_call') valueCRFreq += 0.06;
                // Tank-call on river = they're agonizing = strong hand or hero call → be careful
                if (currentActionTimingTell === 'tank_call') valueCRFreq -= 0.04;
                // Live fold-to-raise data: high folders get check-raised more
                if (liveRead && liveRead.confidence >= 0.20 && liveRead.foldToRaisePct !== null) {
                    if (liveRead.foldToRaisePct > 0.55) valueCRFreq += 0.06;
                    if (liveRead.foldToRaisePct < 0.25) valueCRFreq -= 0.05;
                }

                valueCRFreq = Math.max(0.30, Math.min(0.85, valueCRFreq));

                if (Math.random() < valueCRFreq) {
                    // Sizing: want to set up an all-in if possible
                    let crMult = 2.8;
                    if (spr <= 3) return { type: 'all_in' }; // Low SPR: just jam
                    if (spr <= 6) crMult = 3.2 * crPolarMod; // Medium: bigger to commit
                    else crMult = 2.5 * crPolarMod; // Deep: standard
                    // Against callers, size up
                    if (oppCallFreq > 0.60 && oppConfidence > 0.3) crMult = Math.min(4.0, crMult * 1.15);
                    // Live-read sizing: adjust based on opponent tendencies
                    crMult *= liveCRSizeMod; // Pre-computed: 1.12 vs callers, 0.92 vs folders
                    crMult = Math.max(2.0, Math.min(4.5, crMult));
                    const crSize = Math.round(toCall * crMult);
                    console.debug(`[HorseBrain]  RIVER VALUE CR: str=${handEval.strength} mult=${crMult.toFixed(1)}x polar=${riverRangeType} liveCR=${liveCRBoost.toFixed(2)}`);
                    return { type: raiseAction.type, amount: clampAmt(crSize) };
                }
                // If not check-raising, just call (we have the nuts)
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // ── BLUFF CHECK-RAISE: Air with premium blockers ──
            // The highest-level bluff in poker: check-raise river as a bluff.
            // Requirements: (1) premium blockers to value range, (2) opponent bets wide,
            // (3) credible story (or at least opponent can't know our story).
            // GTO: ~10-20% of river check-raises should be bluffs for balance.
            if (handEval.strength < 20 && !multiway) {
                const crBlkCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;

                if (crBlkCount >= 1) {
                    let bluffCRFreq = 0.05 + aggressionBias / 80;

                    // ═══ BLOCKER QUALITY ═══
                    if (blocksNutFlush) bluffCRFreq += 0.10; // Best blocker for bluff c/r
                    if (crBlkCount >= 2) bluffCRFreq += 0.08; // Multiple blockers
                    if (crBlkCount >= 3) bluffCRFreq += 0.05; // Elite blocker hand

                    // ═══ OPPONENT PROFILE ═══
                    if (oppFoldFreq > 0.50 && oppConfidence > 0.3) bluffCRFreq += 0.08;
                    if (oppTendency === 'weak-tight' && oppConfidence > 0.3) bluffCRFreq += 0.06;
                    // NEVER bluff check-raise calling stations
                    if (oppCallFreq > 0.60 && oppConfidence > 0.3) bluffCRFreq = 0;
                    // Against known bluffers: they'll bet with air, but also call raises → careful
                    if (oppTendency === 'bluffy' && oppConfidence > 0.3) bluffCRFreq *= 0.50;

                    // ═══ BOARD EVOLUTION ═══
                    // Completed draws on river = very credible bluff check-raise (rep the draw)
                    if (boardEvolution.drawsCompleted.length > 0) bluffCRFreq += 0.06;
                    // Bricked draws = less credible (opponent knows draws missed)
                    if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) bluffCRFreq -= 0.04;
                    // PFR-favorable river = credible for aggressor
                    if (boardEvolution.evolution === 'pfr_favorable' && !heroIsAggressor) bluffCRFreq += 0.04;

                    // ═══ NARRATIVE ═══
                    // Passive line → sudden check-raise = polarized = credible
                    if (narrative.heroCheckedFlop || narrative.checkBehindCount >= 1) bluffCRFreq += 0.04;
                    // Triple check → bet-raise is unexpected but very polarized
                    if (narrative.checkBehindCount >= 2) bluffCRFreq += 0.03;

                    // ═══ BET SIZE TELLS ═══
                    // Small bet from opponent = they have thin value → bluff c/r is very effective
                    if (betToPot <= 0.40) bluffCRFreq += 0.06;
                    // Large bet = they're committed → bluff c/r is risky
                    if (betToPot >= 0.75) bluffCRFreq -= 0.04;

                    // ═══ LIVE-READ RIVER BLUFF CR ADJUSTMENTS ═══
                    bluffCRFreq += liveCRBoost * 0.60; // Bluff CR uses dampened boost (60% of value)
                    // Timing tells: snap-aggression from opp = they're confident → don't bluff
                    if (currentActionTimingTell === 'snap_aggression') bluffCRFreq -= 0.06;
                    // Tank bet from opponent = they agonized over betting → often thin value → bluff CR works
                    if (currentActionTimingTell === 'deliberate') bluffCRFreq += 0.05;
                    // Live fold-to-raise: high folders are prime bluff CR targets
                    if (liveRead && liveRead.confidence >= 0.20 && liveRead.foldToRaisePct !== null) {
                        if (liveRead.foldToRaisePct > 0.60) bluffCRFreq += 0.08;
                        if (liveRead.foldToRaisePct < 0.30) bluffCRFreq -= 0.06;
                    }
                    // Live WTSD: players who rarely go to showdown fold to big river action
                    if (liveRead && liveRead.confidence >= 0.20 && liveRead.wtsd !== null) {
                        if (liveRead.wtsd < 0.22) bluffCRFreq += 0.05;
                        if (liveRead.wtsd > 0.38) bluffCRFreq -= 0.06;
                    }

                    // ═══ 3-BET POT: No bluff check-raises (ranges too strong) ═══
                    if (is3BetPot) bluffCRFreq *= 0.30;
                    if (is4BetPot) bluffCRFreq = 0;

                    bluffCRFreq = Math.max(0, Math.min(0.22, bluffCRFreq)); // Hard cap at 22%

                    if (Math.random() < bluffCRFreq) {
                        // Bluff c/r sizing should mirror value c/r sizing (opponent can't distinguish)
                        let crMult = spr <= 5 ? 3.2 : 2.8;
                        // With nut flush blocker, can go bigger (opponent is less likely to have it)
                        if (blocksNutFlush) crMult = Math.min(4.0, crMult + 0.5);
                        // Live-read bluff sizing: mirror value sizing for balance
                        crMult *= liveCRSizeMod;
                        // Against high fold-to-raise: smaller bluff CR saves chips (they fold anyway)
                        if (liveRead && liveRead.confidence >= 0.20 && liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.60) {
                            crMult = Math.max(2.2, crMult * 0.90); // Efficient bluff
                        }
                        crMult = Math.max(2.0, Math.min(4.5, crMult));
                        const crSize = Math.round(toCall * crMult);
                        console.debug(`[HorseBrain]  RIVER BLUFF CR: blockers=${crBlkCount} oppFold=${Math.round(oppFoldFreq * 100)}% freq=${Math.round(bluffCRFreq * 100)}% liveCR=${liveCRBoost.toFixed(2)}`);
                        return { type: raiseAction.type, amount: clampAmt(crSize) };
                    }
                }
            }
        }

        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOP HEURISTIC ENGINE — DEDICATED WORLD-CLASS FLOP DECISION MAKER
// ═══════════════════════════════════════════════════════════════════════════
//
// Called from getDecision() when PioSolver lacks flop data.
// The flop is the foundation — every decision here shapes the turn and river.
//
// Key principles:
// 1. C-BET: frequency and sizing driven by board texture, position, and opponent type
// 2. DONK DEFENSE: when BB connects with board, lead into PFR
// 3. CHECK-RAISE: trapping and semi-bluffing OOP with board awareness
// 4. RANGE ADVANTAGE: who benefits most from this board texture?
// 5. DRAW MANAGEMENT: semi-bluff, protect, or realize equity
// 6. POT CONTROL: showdown-value hands don't need to build the pot
//
function makeFlopHeuristicDecision(params) {
    if (!params || typeof params !== 'object') return { action: 'check', amount: 0, reason: 'invalid_params' }; // Bug #47: guard null params
    const {
        holeCards, board, handStr, position, stackBB, potSize,
        toCall, bb, numPlayers, legalActions, profileId,
        aggressionBias = 0, loosenessBias = 0,
        opponentAdjustment = { callMod: 0, foldMod: 0 },
        enrichedOpponentRead = null,
        heroIsAggressor = false,
        counterStrategyMode = 'standard',
        // ═══ ALWAYS-ON LIVE OBSERVER DATA ═══
        tableId = 'unknown',
        primaryOppId = null,
    } = params;

    if (!holeCards || holeCards.length < 2 || !board || board.length < 3) return null;

    // ── Core evaluations ──
    const handEval = evaluatePostflopHand(holeCards, board);
    const drawEq = getDrawEquity(handEval, 'flop');
    const boardWet = evaluateBoardWetness(board);
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;
    const facingBet = toCall > 0;
    const heroStack = stackBB * bb;
    const spr = heroStack / Math.max(1, potSize);
    const betToPot = facingBet ? toCall / Math.max(1, potSize) : 0;

    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);
    const multiway = numPlayers >= 3;

    // Clamp helper
    const clampAmt = (amt) => {
        if (!raiseAction) return amt;
        return Math.max(raiseAction.minAmount || amt, Math.min(amt, raiseAction.maxAmount || amt));
    };

    // Bug #158: Wire counterStrategyMode into flop heuristic (was destructured but never read)
    const flopInStealthMode = counterStrategyMode === 'stealth' || counterStrategyMode === 'anti_bot_stealth';
    const flopInAntiBot = counterStrategyMode === 'anti_bot' || counterStrategyMode === 'anti_bot_stealth';
    // Stealth: add ±5% noise to all sizing to foil pattern recognition
    // Anti-bot: slightly increase c-bet frequency (exploiters fold to aggression)
    const stealthSizeNoise = flopInStealthMode ? (Math.random() * 0.10 - 0.05) : 0;
    const antiBotCBetBoost = flopInAntiBot ? 0.06 : 0;

    // ── BOARD TEXTURE ANALYSIS ──
    const boardRanks = board.map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);
    const boardSuits = board.map(c => c[1]);
    const suitCounts = {};
    boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuitCount = Math.max(...Object.values(suitCounts || {}));
    const boardIsMonotone = maxSuitCount === 3;
    const boardHasFlushDraw = maxSuitCount >= 2;

    // ═══ UPGRADED MULTIWAY ADJUSTMENTS (FLOP) ═══
    // Phase 48e FIX #7: was 'semi_wet' — not a recognized value anywhere in the system.
    // Standard vocabulary: 'dry', 'medium', 'wet'. Flush-draw boards are 'medium' (consistent with evaluateBoardWetness).
    const boardWetness = boardIsMonotone ? 'wet' : boardHasFlushDraw ? 'medium' : 'dry';
    const mwAdj = multiway ? getMultiwayAdjustment(numPlayers, {
        position, street: 'flop', boardWetness, heroIsAggressor
    }) : { strengthPenalty: 0, bluffReduction: 1.0, valueBetThreshold: 0, cbetFreqMod: 0, callWidthMod: 0, adjustSizing: 0 };
    const boardIsPaired = new Set(board.map(c => c[0])).size < 3;
    const boardIsTrips = new Set(board.map(c => c[0])).size === 1;
    const boardHighCards = board.filter(c => RANKS.indexOf(c[0]) >= 9).length; // J+ = index 9 (T is index 8)
    const boardIsHigh = boardHighCards >= 2; // Broadway-heavy
    const boardIsLow = board.every(c => RANKS.indexOf(c[0]) < 8); // All below 9
    const boardIsMedium = !boardIsHigh && !boardIsLow;

    // Connectivity
    const sortedRanks = [...boardRanks].sort((a, b) => a - b);
    let connectivity = 0;
    for (let i = 1; i < sortedRanks.length; i++) {
        if (sortedRanks[i] - sortedRanks[i - 1] <= 2) connectivity++;
    }
    const boardIsConnected = connectivity >= 2;
    const boardHasStraightDraw = connectivity >= 1;

    // ── OPPONENT READS ──
    let oppTendency = 'balanced', oppConfidence = 0, oppCallFreq = 0.50;
    let oppFoldFreq = 0.50, oppBluffFreq = 0.30, oppCbetFreq = 0.60;
    if (enrichedOpponentRead) {
        oppTendency = enrichedOpponentRead.tendency || 'balanced';
        oppConfidence = enrichedOpponentRead.confidence || 0;
        oppCallFreq = enrichedOpponentRead.callFrequency ?? 0.50;
        oppFoldFreq = enrichedOpponentRead.foldFrequency ?? 0.50;
        oppBluffFreq = enrichedOpponentRead.bluffFrequency ?? 0.30;
    } else {
        if (opponentAdjustment.foldMod > 0) { oppTendency = 'weak-tight'; oppFoldFreq = 0.55 + opponentAdjustment.foldMod / 20; }
        if (opponentAdjustment.callMod > 0) { oppCallFreq = 0.55 + opponentAdjustment.callMod / 20; }
        oppConfidence = Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.35 : 0;
    }

    // ═══ SESSION MODEL OVERLAY (FLOP) ═══
    // Blend real-time session reads into flop opponent profile
    // ═══ BUG FIX: Was passing hero's profileId — now passes primaryOppId ═══
    const flopSessionRead = primaryOppId ? getOpponentSessionRead(primaryOppId) : null;
    if (flopSessionRead && flopSessionRead.confidence >= 0.15) {
        const sw = Math.min(0.60, flopSessionRead.confidence);
        const lw = 1.0 - sw;
        oppFoldFreq = lw * oppFoldFreq + sw * flopSessionRead.foldFreq;
        oppCallFreq = lw * oppCallFreq + sw * flopSessionRead.callFreq;
        if (flopSessionRead.bluffRate !== null) {
            oppBluffFreq = lw * oppBluffFreq + sw * flopSessionRead.bluffRate;
        }
        if (flopSessionRead.cbetRate !== null) {
            oppCbetFreq = lw * oppCbetFreq + sw * flopSessionRead.cbetRate;
        }
        if (flopSessionRead.confidence >= 0.30 && flopSessionRead.sessionTendency !== 'balanced') {
            oppTendency = flopSessionRead.sessionTendency;
        }
        oppConfidence = Math.min(0.90, oppConfidence + flopSessionRead.confidence * 0.3);
    }

    // ═══ ALWAYS-ON LIVE OBSERVER OVERLAY (FLOP) ═══
    // The live observer has real-time data from every action this opponent has taken.
    // Higher priority than session model because it includes timing tells + in-hand actions.
    const flopLiveRead = primaryOppId ? getLiveRead(profileId, tableId, primaryOppId) : null;
    if (flopLiveRead && flopLiveRead.confidence >= 0.10) {
        const livew = Math.min(0.70, flopLiveRead.confidence);
        const prevw = 1.0 - livew;

        // ═══ NaN/INTEGRITY GUARD FOR FLOP LIVE DATA (Phase 32) ═══
        const fSafe = (v, fb) => (typeof v === 'number' && !isNaN(v) && isFinite(v)) ? v : fb;
        oppFoldFreq = prevw * oppFoldFreq + livew * fSafe(flopLiveRead.foldFreq, oppFoldFreq);
        oppCallFreq = prevw * oppCallFreq + livew * fSafe(flopLiveRead.callFreq, oppCallFreq);
        if (flopLiveRead.bluffRate !== null && !isNaN(flopLiveRead.bluffRate)) {
            oppBluffFreq = prevw * oppBluffFreq + livew * flopLiveRead.bluffRate;
        }
        if (flopLiveRead.cBetPct !== null && !isNaN(flopLiveRead.cBetPct)) {
            oppCbetFreq = prevw * oppCbetFreq + livew * flopLiveRead.cBetPct;
        }

        // ═══ FREQUENCY SANITY CLAMP (Phase 32) ═══
        oppFoldFreq = Math.max(0, Math.min(1, oppFoldFreq));
        oppCallFreq = Math.max(0, Math.min(1, oppCallFreq));
        oppBluffFreq = Math.max(0, Math.min(1, oppBluffFreq));
        oppCbetFreq = Math.max(0, Math.min(1, oppCbetFreq));

        // Player type from live observation
        if (flopLiveRead.confidence >= 0.25 && flopLiveRead.playerType !== 'unknown') {
            oppTendency = flopLiveRead.playerType;
        }
        oppConfidence = Math.min(0.95, oppConfidence + flopLiveRead.confidence * 0.4);

        // ═══ LIVE EXPLOIT DETECTION (FLOP) ═══
        const flopExploits = flopLiveRead.exploits || [];
        if (flopExploits.includes('overfolds_to_cbet')) {
            oppFoldFreq = Math.max(oppFoldFreq, 0.55);
        }
        if (flopExploits.includes('overcbets')) {
            oppCbetFreq = Math.max(oppCbetFreq, 0.72);
        }
        if (flopExploits.includes('one_and_done')) {
            // They c-bet but give up on turn → call flop wider, plan to take over on turn
            oppFoldFreq = Math.max(oppFoldFreq, 0.50);
        }
        if (flopExploits.includes('station_to_showdown')) {
            oppCallFreq = Math.max(oppCallFreq, 0.65);
            oppBluffFreq = Math.min(oppBluffFreq, 0.10);
        }
        if (flopExploits.includes('frequent_check_raiser')) {
            // Be careful about small c-bets — they'll check-raise us
            oppBluffFreq = Math.max(oppBluffFreq, 0.28);
        }
        if (flopExploits.includes('overfolds_to_3bet')) {
            // Useful context — they fold too much to 3-bets preflop
            // (May carry over into postflop: passive tendencies)
            oppFoldFreq = Math.max(oppFoldFreq, 0.48);
        }

        console.debug(`[HorseBrain]  FLOP LIVE: ${primaryOppId?.substring(0, 8)} type=${flopLiveRead.playerType} cbet=${flopLiveRead.cBetPct !== null ? Math.round(flopLiveRead.cBetPct * 100) + '%' : '?'} foldCB=${flopLiveRead.foldToCBetPct !== null ? Math.round(flopLiveRead.foldToCBetPct * 100) + '%' : '?'} exploits=[${flopExploits.join(',')}]`);
    }

    // ═══ IN-HAND ACTION SEQUENCE → C-BET MODIFIERS ═══
    // Opponent's PREFLOP action in THIS hand narrows their range → adjust c-bet.
    // Limper: very wide, passive → c-bet aggressively
    // Cold caller: suited connectors, small pairs → c-bet more
    // 3-bettor: strong range → c-bet less, smaller sizing
    let inHandCBetMod = 0;
    let inHandCBetSizeMod = 0;
    if (flopLiveRead && flopLiveRead.inHandActions) {
        const inHandActs = flopLiveRead.inHandActions.actions || [];
        const oppPreflopAct = inHandActs.find(a => a.street === 'preflop');
        if (oppPreflopAct) {
            if (oppPreflopAct.action === 'call' && oppPreflopAct.isOpenAction) {
                inHandCBetMod = 0.12; inHandCBetSizeMod = -0.04; // Limper = very wide
            } else if (oppPreflopAct.action === 'call') {
                inHandCBetMod = 0.06; // Cold caller = capped range
            } else if (oppPreflopAct.action === 'raise' && oppPreflopAct.facingRaiseCount >= 2) {
                inHandCBetMod = -0.20; inHandCBetSizeMod = -0.10; // 4-bet caller = monsters
            } else if (oppPreflopAct.action === 'raise' && oppPreflopAct.facingRaiseCount >= 1) {
                inHandCBetMod = -0.10; inHandCBetSizeMod = -0.06; // 3-bettor = strong
            }
        }
    }

    // ── RANGE ADVANTAGE ASSESSMENT ──
    // PFR has range advantage on high boards (broadway cards favor premium hands)
    // Caller has range advantage on low, connected boards (suited connectors, small pairs)
    let rangeAdvantage = 'neutral'; // 'pfr', 'caller', or 'neutral'
    if (heroIsAggressor) {
        if (boardIsHigh && !boardIsConnected) rangeAdvantage = 'pfr';
        else if (boardIsLow && boardIsConnected) rangeAdvantage = 'caller';
        else if (boardIsPaired && boardIsHigh) rangeAdvantage = 'pfr';
        else if (boardIsMonotone) rangeAdvantage = 'caller'; // Flushes favor wide calling ranges
    } else {
        // We're the caller — flip the assessment
        if (boardIsHigh && !boardIsConnected) rangeAdvantage = 'caller'; // PFR has it, bad for us
        else if (boardIsLow && boardIsConnected) rangeAdvantage = 'pfr'; // We connect, good
        else if (boardIsMonotone) rangeAdvantage = 'pfr'; // We have suited hands more often
    }

    const isPotCommitted = spr <= 2;

    // ═══ LIMPED POT DETECTION (FLOP) ═══
    // If nobody raised preflop and pot is small, ranges are wide — adjust strategy.
    const flopIsLimpedPot = !heroIsAggressor && potSize / bb <= numPlayers * 2.5;

    // ═══ 3-BET POT DETECTION (FLOP) ═══
    // 3-bet pots have fundamentally different dynamics:
    // - SPR is typically 3-6 (vs 8-15 in single-raised pots)
    // - Ranges are much narrower (both players have strong holdings)
    // - C-bet frequencies should be LOWER (opponent's range is stronger)
    // - Sizing should be SMALLER (ranges are condensed, small bets are effective)
    // - Board coverage: high boards favor both ranges, low boards still favor PFR
    // Detection heuristic: hero raised preflop AND pot is large relative to blinds for heads-up
    const expectedSRPSize = numPlayers * 2 * bb; // Single-raised pot size estimate
    const is3BetPot = heroIsAggressor && !flopIsLimpedPot && potSize > expectedSRPSize * 2.2 && numPlayers <= 3;
    const is4BetPot = heroIsAggressor && !flopIsLimpedPot && potSize > expectedSRPSize * 5.0 && numPlayers <= 2;

    // 3-bet pot strategy adjustments
    let threeBetCbetMod = 0;      // Frequency modifier for c-bets in 3-bet pots
    let threeBetSizeMod = 0;      // Sizing modifier (negative = smaller)
    let threeBetValueThreshold = 0; // Lower value threshold (ranges are narrower)
    if (is4BetPot) {
        // 4-bet pots: SPR is tiny (~2-3), just jam with any equity
        threeBetCbetMod = 0.20;          // C-bet very frequently (we have massive range advantage)
        threeBetSizeMod = -0.15;         // Small sizing (33% is standard in 4-bet pots)
        threeBetValueThreshold = -15;    // Much lower value threshold
    } else if (is3BetPot) {
        // 3-bet pots: c-bet less often but with purpose
        if (rangeAdvantage === 'pfr') {
            threeBetCbetMod = 0.05;      // Slight boost on PFR-favorable boards
            threeBetSizeMod = -0.12;     // 33% pot standard
        } else if (rangeAdvantage === 'caller') {
            threeBetCbetMod = -0.15;     // Much less c-betting on caller-favorable boards
            threeBetSizeMod = -0.08;     // Slightly smaller
        } else {
            threeBetCbetMod = -0.05;     // Slight reduction on neutral boards
            threeBetSizeMod = -0.10;     // Standard small sizing
        }
        threeBetValueThreshold = -8;     // Ranges are stronger → commit with slightly less
    }

    // ═══ RANGE ADVANTAGE → C-BET MODIFIER ═══
    // rangeAdvantage is computed but was never wired into decisions — fix that now.
    let rangeAdvCbetMod = 0;
    let rangeAdvSizeMod = 0;
    if (heroIsAggressor) {
        if (rangeAdvantage === 'pfr') {
            rangeAdvCbetMod = 0.10;      // PFR range advantage → c-bet more freely
            rangeAdvSizeMod = -0.05;     // Can use smaller sizing (range advantage does the work)
        } else if (rangeAdvantage === 'caller') {
            rangeAdvCbetMod = -0.12;     // Caller range advantage → c-bet less
            rangeAdvSizeMod = 0.05;      // When we do bet, go bigger (need protection)
        }
    }

    // ═══ LIVE FOLD-TO-CBET MODIFIER ═══
    // The live observer tells us EXACTLY how often this opponent folds to c-bets.
    // This is arguably the single most exploitable stat in poker.
    // High fold-to-cbet → print money by c-betting wider
    // Low fold-to-cbet → only c-bet for value (they're calling/raising everything)
    let liveCBetMod = 0;
    let liveCBetSizeMod = 0;
    if (flopLiveRead) {
        if (flopLiveRead.foldToCBetPct !== null && flopLiveRead.confidence >= 0.20) {
            if (flopLiveRead.foldToCBetPct > 0.65) {
                // They fold to c-bets way too much → c-bet everything, go small
                liveCBetMod = 0.15;
                liveCBetSizeMod = -0.08; // Smaller — they'll fold to any size
            } else if (flopLiveRead.foldToCBetPct > 0.55) {
                // Above average fold rate → c-bet a bit wider
                liveCBetMod = 0.08;
                liveCBetSizeMod = -0.04;
            } else if (flopLiveRead.foldToCBetPct < 0.35) {
                // They almost never fold to c-bets → only bet for value
                liveCBetMod = -0.15;
                liveCBetSizeMod = 0.06; // Bigger when we do bet (for value)
            } else if (flopLiveRead.foldToCBetPct < 0.42) {
                // Below average fold rate → tighten c-bet range
                liveCBetMod = -0.08;
                liveCBetSizeMod = 0.03;
            }
        }

        // ═══ LIVE SECOND BARREL TENDENCY ═══
        // If opponent folds to barrels (turn after calling flop c-bet), c-bet more
        // because even if they call flop, we can take it on turn
        if (flopLiveRead.secondBarrelPct !== null && flopLiveRead.confidence >= 0.25) {
            // Their barrel rate tells us how THEY play turn — but we care about fold-to-barrel
            // Proxy: if they rarely barrel themselves, they often give up → we can barrel more
        }

        // ═══ PHASE 17: CHECK-RAISE AWARE C-BET SIZING ═══
        // If opponent check-raises frequently, we need to SIZE DOWN our c-bets
        // to reduce our loss when they pop us. This is a critical exploit-defense.
        if (flopLiveRead.checkRaisePct !== null && flopLiveRead.confidence >= 0.20) {
            if (flopLiveRead.checkRaisePct > 0.12) {
                // Frequent check-raiser → size down c-bets significantly
                liveCBetSizeMod -= 0.06;
                // Also c-bet less with air (they punish light c-bets)
                if (handEval.strength < 30) liveCBetMod -= 0.10;
            } else if (flopLiveRead.checkRaisePct < 0.04) {
                // Rarely check-raises → we can c-bet fearlessly, even size up
                liveCBetSizeMod += 0.04;
                liveCBetMod += 0.05;
            }
        }

        // ═══ PHASE 17: FLOP CURRENT-ACTION TIMING TELL ═══
        // If opponent checked slowly (long-tanked before checking), they considered betting
        // → they have something but are trying to trap. Be cautious with light c-bets.
        let flopTimingTell = 'unknown';
        if (flopLiveRead.inHandActions && flopLiveRead.inHandActions.lastAction) {
            const lastAct = flopLiveRead.inHandActions.lastAction;
            if (lastAct.timing && lastAct.street === 'flop') {
                const streetAvg = flopLiveRead.timingProfile?.flop?.avgMs || flopLiveRead.avgDecisionMs;
                if (streetAvg && streetAvg > 0) {
                    const ratio = lastAct.timing / streetAvg;
                    if (ratio < 0.40 && lastAct.action === 'check') {
                        flopTimingTell = 'snap_check'; // Quick check = weak, c-bet freely
                        liveCBetMod += 0.06;
                    } else if (ratio > 1.8 && lastAct.action === 'check') {
                        flopTimingTell = 'tank_check'; // Slow check = trapping or strong draw
                        liveCBetMod -= 0.08;
                        liveCBetSizeMod -= 0.04; // Smaller if we do bet
                    }
                }
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  NOT FACING A BET
    // ══════════════════════════════════════════════════════════
    if (!facingBet) {

        // ── POT COMMITTED: Jam with decent+ hands ──
        if (isPotCommitted && handEval.strength >= 40 && canRaise) {
            return { type: 'all_in' };
        }

        // ═══ LIMPED POT FLOP STRATEGY ═══
        // In limped pots, nobody has range advantage. Bet for value with strong hands,
        // check medium hands (showdown value in a small pot), and rarely bluff.
        if (flopIsLimpedPot && !isPotCommitted) {
            // Strong hands: bet for value (others limped wide, they'll pay off)
            if (handEval.strength >= 65 && canRaise) {
                const limpValueFrac = boardWetness === 'wet' ? 0.60 : 0.45;
                return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * limpValueFrac)) };
            }
            // Medium hands: mostly check (pot is small, showdown value is fine)
            if (handEval.strength >= 35 && handEval.strength < 65) {
                // Only bet on wet boards for protection
                if (boardWetness === 'wet' && handEval.strength >= 50 && canRaise && Math.random() < 0.30) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.50)) };
                }
                return { type: 'check' };
            }
            // Strong draws: semi-bluff at reduced frequency
            if (drawEq.outs >= 10 && canRaise && Math.random() < 0.25) {
                return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.50)) };
            }
            // Weak hands: check (don't bluff into a multi-way limped pot)
            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ════════════════════════════════════════
        //  C-BET STRATEGY (when hero was PFR)
        // ════════════════════════════════════════
        if (heroIsAggressor && canRaise) {

            // ═══ BOARD-TEXTURE-DRIVEN C-BET STRATEGY ═══

            // Bug #159: TRIPS BOARD → Almost never c-bet (board is 3-of-a-kind, nobody connects)
            // Only bet with a pocket pair (full house) or the case card (quads)
            if (boardIsTrips) {
                if (handEval.strength >= 80) {
                    // We have a full house or quads — slow-play most of the time
                    if (Math.random() < 0.25) {
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.33)) };
                    }
                    return { type: 'check' };
                }
                // Everybody has trips — pot control, check it down
                return { type: 'check' };
            }

            // Bug #159: MEDIUM BOARDS (neither high nor low) → use polarized sizing
            // These are the most ambiguous textures (e.g., 9-7-3 rainbow).
            // Neither player has a clear range advantage — bet less but size up.
            const mediumBoardSizeMod = boardIsMedium ? 0.04 : 0;

            // Bug #159: STRAIGHT-DRAW BOARDS → size up for protection
            // When the board has straight draw connectivity, draws are more likely.
            // Bigger bets deny equity and charge draws appropriately.
            const straightDrawSizeMod = boardHasStraightDraw ? 0.05 : 0;

            // STRATEGY 1: HIGH DRY BOARDS → Small c-bet, very high frequency
            // PFR has massive range advantage (Ax, broadway). Bet small, bet often.
            if (boardIsHigh && !boardIsConnected && !boardIsMonotone && boardWet === 'dry') {
                let cbetFreq = 0.80; // Near-100% c-bet range
                let cbetFrac = boardIsPaired ? 0.25 : 0.33; // Tiny sizing

                // ═══ RANGE ADVANTAGE + 3-BET POT + COUNTER-STRATEGY + BOARD WIRING ═══
                cbetFreq += rangeAdvCbetMod + threeBetCbetMod + liveCBetMod + inHandCBetMod + antiBotCBetBoost;
                cbetFrac = Math.max(0.20, cbetFrac + rangeAdvSizeMod + threeBetSizeMod + liveCBetSizeMod + inHandCBetSizeMod + stealthSizeNoise + mediumBoardSizeMod + straightDrawSizeMod);

                if (multiway) cbetFreq = Math.max(0.30, 0.55 + mwAdj.cbetFreqMod); // Tighten multiway (position/texture aware)
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) {
                    // Against callers: only c-bet with equity
                    if (handEval.strength < 35 && drawEq.outs < 6) cbetFreq = 0.30;
                    else cbetFrac = 0.50; // Bigger for value
                }
                if (oppFoldFreq > 0.55 && oppConfidence > 0.3) cbetFreq = 0.90; // Print money

                // ═══ LIVE-READ HIGH DRY C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Extreme folder on dry boards = print money with any two
                    if (flopLiveRead.foldFreq > 0.60) cbetFreq = Math.min(0.95, cbetFreq + 0.10);
                    // Station on dry board = only value c-bet, size up
                    if (flopLiveRead.callFreq > 0.60) {
                        if (handEval.strength < 30 && drawEq.outs < 6) cbetFreq = Math.max(0.15, cbetFreq - 0.20);
                        else cbetFrac = Math.min(0.55, cbetFrac + 0.10);
                    }
                    // Check-raise threat on dry board = reduce with air
                    if (flopLiveRead.checkRaisePct !== null && flopLiveRead.checkRaisePct > 0.12 && handEval.strength < 35) {
                        cbetFreq = Math.max(0.25, cbetFreq - 0.15);
                    }
                }

                cbetFreq = Math.max(0.10, Math.min(0.95, cbetFreq));
                if (Math.random() < cbetFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * cbetFrac)) };
                }
                return { type: 'check' };
            }

            // STRATEGY 2: LOW CONNECTED BOARDS → Polarized c-bet (strong or nothing)
            // Caller's range connects heavily. Only c-bet with strong hands or nut draws.
            if (boardIsLow && boardIsConnected) {
                let cbetFreq = 0;
                let cbetFrac = 0.50;

                if (handEval.strength >= 65) { cbetFreq = 0.75; cbetFrac = 0.55; } // Value
                else if (handEval.strength >= 50) { cbetFreq = 0.45; cbetFrac = 0.45; } // Thin value
                else if (drawEq.outs >= 10) { cbetFreq = 0.50; cbetFrac = 0.50; } // Strong draw semi-bluff
                else if (handEval.strength < 20) { cbetFreq = 0.15; cbetFrac = 0.33; } // Rare bluff
                // Nut advantage: if PFR has overpairs → can still c-bet
                if (handEval.category === 'overpair') { cbetFreq = 0.70; cbetFrac = 0.55; }

                // ═══ RANGE ADVANTAGE + 3-BET POT WIRING ═══
                cbetFreq += rangeAdvCbetMod + threeBetCbetMod + liveCBetMod + inHandCBetMod + antiBotCBetBoost;
                cbetFrac = Math.max(0.25, cbetFrac + rangeAdvSizeMod + threeBetSizeMod + liveCBetSizeMod + inHandCBetSizeMod + stealthSizeNoise + mediumBoardSizeMod + straightDrawSizeMod);

                if (multiway) cbetFreq = Math.max(0.15, cbetFreq * (0.60 + mwAdj.cbetFreqMod));
                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) cbetFreq += 0.10;

                // ═══ LIVE-READ LOW CONNECTED C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Folder → can c-bet wider on connected boards (they give up sets/two-pair)
                    if (flopLiveRead.foldFreq > 0.55) cbetFreq += 0.08;
                    // Station → only value bet, never bluff connected boards vs callers
                    if (flopLiveRead.callFreq > 0.55 && handEval.strength < 45 && drawEq.outs < 9) {
                        cbetFreq = Math.max(0.05, cbetFreq - 0.15);
                    }
                    // Aggressive opp on connected board = check-raise risk → tighten bluffs
                    if (flopLiveRead.aggFreq > 0.45 && handEval.strength < 40) {
                        cbetFreq = Math.max(0.10, cbetFreq - 0.10);
                    }
                    // High WTSD → they're sticky, size up for value, down for bluffs
                    if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd > 0.30 && handEval.strength >= 50) {
                        cbetFrac = Math.min(0.65, cbetFrac + 0.06);
                    }
                }

                cbetFreq = Math.max(0, Math.min(0.80, cbetFreq));

                if (Math.random() < cbetFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * cbetFrac)) };
                }
                return { type: 'check' };
            }

            // STRATEGY 3: MONOTONE BOARDS → Check most, bet only nut flush draws or monsters
            if (boardIsMonotone) {
                const heroHasFlushDraw = holeCards.some(c => c[1] === boardSuits[0]);
                const heroHasNutFD = heroHasFlushDraw && holeCards.some(c => c[1] === boardSuits[0] && RANKS.indexOf(c[0]) >= 12);

                let monoSizeFrac = handEval.strength >= 75 ? 0.50 : 0.40;
                let monoBetGate = handEval.strength >= 75 || (heroHasNutFD && handEval.strength >= 30);

                // ═══ LIVE-READ MONOTONE C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Extreme folder on monotone = can c-bet wider (they don't have flush)
                    if (flopLiveRead.foldFreq > 0.55 && handEval.strength >= 40) {
                        monoBetGate = true; // Open the gate for medium+ hands vs folders
                        monoSizeFrac = 0.33; // Small probe bet
                    }
                    // Station on monotone = DON'T bluff, size up value bets
                    if (flopLiveRead.callFreq > 0.55) {
                        if (handEval.strength >= 75) monoSizeFrac = Math.min(0.60, monoSizeFrac + 0.08);
                        if (handEval.strength < 75 && !heroHasNutFD) monoBetGate = false; // Close gate for non-monsters vs stations
                    }
                    // Aggressive opponent on monotone = they'll raise → only bet the nuts
                    if (flopLiveRead.aggFreq > 0.45 && handEval.strength < 75 && !heroHasNutFD) {
                        monoBetGate = false;
                    }
                    // If opp doesn't have flush themselves (low WTSD + high fold) → exploit with stab
                    if (flopLiveRead.foldFreq > 0.50 && flopLiveRead.wtsd !== null && flopLiveRead.wtsd < 0.25) {
                        if (handEval.strength >= 35 && Math.random() < 0.30) {
                            monoBetGate = true;
                            monoSizeFrac = 0.30; // Small probe
                        }
                    }
                }

                if (monoBetGate) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * monoSizeFrac)) };
                }
                // Everything else: check (reverse implied odds, opponent has flush too often)
                return { type: 'check' };
            }

            // STRATEGY 4: PAIRED BOARDS → Small c-bet, high frequency (we represent trips)
            if (boardIsPaired && !boardIsConnected) {
                let cbetFreq = 0.70;
                let cbetFrac = 0.25; // Very small — we "always have it" on paired boards

                // ═══ RANGE ADVANTAGE + 3-BET POT + COUNTER-STRATEGY + BOARD WIRING ═══
                cbetFreq += rangeAdvCbetMod + threeBetCbetMod + liveCBetMod + inHandCBetMod + antiBotCBetBoost;
                cbetFrac = Math.max(0.20, cbetFrac + rangeAdvSizeMod + threeBetSizeMod + liveCBetSizeMod + inHandCBetSizeMod + stealthSizeNoise + mediumBoardSizeMod + straightDrawSizeMod);

                if (handEval.strength >= 75) { cbetFrac = 0.40; } // Bigger with actual trips+
                if (multiway) cbetFreq = Math.max(0.25, 0.45 + mwAdj.cbetFreqMod);
                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) cbetFreq = 0.85;

                // ═══ LIVE-READ PAIRED BOARD C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Folder on paired board = we always "have it", c-bet near 100%
                    if (flopLiveRead.foldFreq > 0.55) cbetFreq = Math.min(0.92, cbetFreq + 0.08);
                    // Station on paired board = they call with any pair, tighten range
                    if (flopLiveRead.callFreq > 0.55 && handEval.strength < 40) {
                        cbetFreq = Math.max(0.20, cbetFreq - 0.15);
                    }
                    // Station with trips+ = size up for value
                    if (flopLiveRead.callFreq > 0.55 && handEval.strength >= 65) {
                        cbetFrac = Math.min(0.50, cbetFrac + 0.10);
                    }
                    // Check-raise risk on paired boards (tricky opponents)
                    if (flopLiveRead.checkRaisePct !== null && flopLiveRead.checkRaisePct > 0.15 && handEval.strength < 50) {
                        cbetFreq = Math.max(0.20, cbetFreq - 0.12);
                    }
                }

                cbetFreq = Math.max(0.10, Math.min(0.90, cbetFreq));

                if (Math.random() < cbetFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * cbetFrac)) };
                }
                return { type: 'check' };
            }

            // STRATEGY 5: WET BOARDS (flush draw + connected) → Larger c-bet, protect equity
            if (boardWet === 'wet') {
                let cbetFreq = 0.55;
                let cbetFrac = 0.60; // Bigger to charge draws

                if (handEval.strength >= 65) { cbetFreq = 0.80; cbetFrac = 0.66; } // Value + protection
                else if (handEval.strength >= 45) { cbetFreq = 0.55; cbetFrac = 0.55; } // Medium — bet to deny equity
                else if (drawEq.outs >= 9) { cbetFreq = 0.55; cbetFrac = 0.55; } // Semi-bluff
                else if (handEval.strength < 20) { cbetFreq = 0.20; cbetFrac = 0.50; } // Bluff
                else { cbetFreq = 0.30; cbetFrac = 0.45; } // Marginal — sometimes bet to take down

                // ═══ RANGE ADVANTAGE + 3-BET POT WIRING ═══
                cbetFreq += rangeAdvCbetMod + threeBetCbetMod + liveCBetMod + inHandCBetMod + antiBotCBetBoost;
                cbetFrac = Math.max(0.30, cbetFrac + rangeAdvSizeMod + threeBetSizeMod + liveCBetSizeMod + inHandCBetSizeMod + stealthSizeNoise + mediumBoardSizeMod + straightDrawSizeMod);

                // Against callers on wet boards: tighter c-bet range but bigger sizing
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) {
                    if (handEval.strength < 45 && drawEq.outs < 8) cbetFreq = 0.10; // Don't bluff callers
                    else cbetFrac = Math.min(0.75, cbetFrac + 0.08);
                }

                // ═══ LIVE-READ WET BOARD C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Station on wet board = NEVER bluff, only value + semi-bluff
                    if (flopLiveRead.callFreq > 0.55 && handEval.strength < 40 && drawEq.outs < 8) {
                        cbetFreq = Math.max(0.05, cbetFreq - 0.20);
                    }
                    // Station + strong hand = size up to charge draws
                    if (flopLiveRead.callFreq > 0.55 && handEval.strength >= 55) {
                        cbetFrac = Math.min(0.75, cbetFrac + 0.06);
                    }
                    // Folder on wet board = bigger size (they fold even good draws)
                    if (flopLiveRead.foldFreq > 0.50) {
                        cbetFreq += 0.08;
                        cbetFrac = Math.min(0.72, cbetFrac + 0.04); // Slightly bigger to maximize fold eq
                    }
                    // Aggressive opp on wet board = check-raise city → be careful with mediocre hands
                    if (flopLiveRead.aggFreq > 0.45 && handEval.strength >= 35 && handEval.strength < 55) {
                        cbetFreq = Math.max(0.15, cbetFreq - 0.10);
                    }
                    // High WTSD on wet board = they're chasing draws → size up for protection
                    if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd > 0.30 && handEval.strength >= 50) {
                        cbetFrac = Math.min(0.75, cbetFrac + 0.06);
                    }
                }

                if (multiway) { cbetFreq = Math.max(0.10, cbetFreq * (0.55 + mwAdj.cbetFreqMod)); cbetFrac = Math.min(0.75, cbetFrac + 0.05); }
                cbetFreq = Math.max(0.05, Math.min(0.85, cbetFreq));

                if (Math.random() < cbetFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * cbetFrac)) };
                }
                return { type: 'check' };
            }

            // STRATEGY 6: DEFAULT (medium texture) → Standard c-bet
            {
                let cbetFreq = isIP ? 0.65 : 0.50; // IP c-bets more
                let cbetFrac = 0.50;

                if (handEval.strength >= 65) cbetFreq = 0.80;
                else if (handEval.strength >= 40) cbetFreq = isIP ? 0.60 : 0.45;
                else if (drawEq.outs >= 8) cbetFreq = 0.50;
                else if (handEval.strength < 20) cbetFreq = 0.22;
                else cbetFreq = 0.30;

                // ═══ RANGE ADVANTAGE + 3-BET POT WIRING ═══
                cbetFreq += rangeAdvCbetMod + threeBetCbetMod + liveCBetMod + inHandCBetMod + antiBotCBetBoost;
                cbetFrac = Math.max(0.25, cbetFrac + rangeAdvSizeMod + threeBetSizeMod + liveCBetSizeMod + inHandCBetSizeMod + stealthSizeNoise + mediumBoardSizeMod + straightDrawSizeMod);

                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) cbetFreq += 0.12;
                if (oppCallFreq > 0.60 && oppConfidence > 0.3 && handEval.strength < 40) cbetFreq -= 0.15;

                // ═══ LIVE-READ DEFAULT C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Folder → c-bet wider, slightly smaller sizing
                    if (flopLiveRead.foldFreq > 0.55) {
                        cbetFreq += 0.08;
                        cbetFrac = Math.max(0.33, cbetFrac - 0.06);
                    }
                    // Station → tighten bluffs, size up value
                    if (flopLiveRead.callFreq > 0.55) {
                        if (handEval.strength < 35 && drawEq.outs < 8) cbetFreq = Math.max(0.10, cbetFreq - 0.15);
                        if (handEval.strength >= 50) cbetFrac = Math.min(0.65, cbetFrac + 0.06);
                    }
                    // Aggro opp → check-raise threat with weak hands
                    if (flopLiveRead.aggFreq > 0.45 && handEval.strength < 35 && drawEq.outs < 6) {
                        cbetFreq = Math.max(0.08, cbetFreq - 0.10);
                    }
                    // Check-raise threat → reduce bluff c-bets, keep value
                    if (flopLiveRead.checkRaisePct !== null && flopLiveRead.checkRaisePct > 0.12 && handEval.strength < 45) {
                        cbetFreq = Math.max(0.10, cbetFreq - 0.10);
                    }
                }

                if (multiway) cbetFreq = Math.max(0.10, cbetFreq * (0.60 + mwAdj.cbetFreqMod));
                cbetFreq = Math.max(0.05, Math.min(0.80, cbetFreq));

                if (Math.random() < cbetFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * cbetFrac)) };
                }
                return { type: 'check' };
            }
        }

        // ════════════════════════════════════════
        //  NON-AGGRESSOR (caller) NOT FACING BET
        //  Checked to us, or we're first to act
        // ════════════════════════════════════════

        // ── POT COMMITTED ──
        if (isPotCommitted && handEval.strength >= 40 && canRaise) {
            return { type: 'all_in' };
        }

        // ── BB DONK-BET: Lead into PFR on range-favoring boards ──
        // ═══ 3-BET POT AWARENESS: Donk less in 3-bet pots (PFR's range is much stronger)
        // ═══ RANGE ADVANTAGE: Donk more when board favors caller's range
        if (!isIP && canRaise && !multiway) {

            // ── 3-bet/4-bet pot donk modifiers ──
            // In 3-bet pots, PFR has a capped but strong range — donk less frequently
            // In 4-bet pots, never donk (PFR has premiums, just check-raise or check-call)
            let donkPotMod = 0;
            let donkSizeMod = 0;
            if (is4BetPot) {
                donkPotMod = -1.0; // Effectively kills all donking
            } else if (is3BetPot) {
                donkPotMod = -0.15; // Reduce donk frequency
                donkSizeMod = -0.08; // Smaller sizes (SPR is lower)
            }

            // ── Range advantage donk modifiers ──
            // When board favors caller's range (low, connected), donk MORE
            // When board favors PFR's range (high, broadway-heavy), donk LESS
            let donkRangeMod = 0;
            if (rangeAdvantage === 'caller') {
                donkRangeMod = 0.12; // Board hits our range — lead out
            } else if (rangeAdvantage === 'pfr') {
                donkRangeMod = -0.10; // Board hits their range — check to them
            }

            // Two pair+ on low/connected boards → donk for value
            if (handEval.strength >= 65 && (boardIsLow || boardIsConnected) && !boardIsHigh) {
                let donkFreq = 0.40 + donkPotMod + donkRangeMod;
                if (oppCbetFreq > 0.70 && oppConfidence > 0.3) donkFreq += 0.15; // Deny their c-bet equity
                // ═══ LIVE-READ FLOP VALUE DONK (Phase 25) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // High c-bet: donk to deny (they'll bet anyway, but we control sizing)
                    if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct > 0.65) donkFreq += 0.10;
                    // Passive: donk more (they won't bet if we check)
                    if (flopLiveRead.aggFreq < 0.25) donkFreq += 0.08;
                    // Stations: donk bigger for value
                    if (flopLiveRead.callFreq > 0.55) donkFreq += 0.06;
                }
                // In 3-bet pots with caller range advantage, still donk strong hands
                if (is3BetPot && rangeAdvantage === 'caller' && handEval.strength >= 75) {
                    donkFreq = Math.max(donkFreq, 0.35); // Floor: don't let modifiers kill value donks
                }
                donkFreq = Math.max(0, Math.min(0.70, donkFreq));
                if (Math.random() < donkFreq) {
                    let sizeFrac = 0.50 + (boardWet === 'wet' ? 0.08 : 0) + donkSizeMod;
                    // Range advantage caller → slightly larger (they'll discount our range)
                    if (rangeAdvantage === 'caller') sizeFrac += 0.05;
                    sizeFrac = Math.max(0.33, Math.min(0.65, sizeFrac));
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }
            // Strong draws on wet boards → donk as semi-bluff
            if (drawEq.outs >= 10 && boardWet === 'wet' && handEval.strength >= 20) {
                let semiDonkFreq = 0.25 + aggressionBias / 40 + donkPotMod + donkRangeMod;
                if (oppFoldFreq > 0.45 && oppConfidence > 0.3) semiDonkFreq += 0.10;
                // ═══ LIVE-READ FLOP SEMI-BLUFF DONK (Phase 25) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    if (flopLiveRead.foldFreq > 0.45) semiDonkFreq += 0.08;
                    if (flopLiveRead.callFreq > 0.60) semiDonkFreq -= 0.10;
                    if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct > 0.50) semiDonkFreq += 0.06;
                }
                // In 3-bet pots with big draws (14+ outs), still semi-donk occasionally
                if (is3BetPot && drawEq.outs >= 14) {
                    semiDonkFreq = Math.max(semiDonkFreq, 0.18);
                }
                semiDonkFreq = Math.max(0, Math.min(0.50, semiDonkFreq));
                if (Math.random() < semiDonkFreq) {
                    let semiDonkSize = 0.55 + donkSizeMod;
                    // Range advantage caller with draws → bigger to deny equity + fold equity
                    if (rangeAdvantage === 'caller' && drawEq.outs >= 12) semiDonkSize += 0.05;
                    semiDonkSize = Math.max(0.35, Math.min(0.65, semiDonkSize));
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * semiDonkSize)) };
                }
            }
            // ── Protection donk: medium hands on scary boards (NEW) ──
            // When we have top pair on a board that favors our range, lead to protect
            // Only in single-raised pots or 3-bet pots where we have range advantage
            if (handEval.strength >= 45 && handEval.strength < 65 && boardWet === 'wet' && rangeAdvantage === 'caller' && !is3BetPot) {
                let protDonkFreq = 0.15 + aggressionBias / 60;
                if (oppCbetFreq > 0.65 && oppConfidence > 0.3) protDonkFreq += 0.08;
                protDonkFreq = Math.max(0, Math.min(0.35, protDonkFreq));
                if (Math.random() < protDonkFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.40)) };
                }
            }
        }

        // ── IP VALUE BET: Bet strong hands when checked to ──
        // ═══ UPGRADED: 3-bet pot, range advantage, opponent reads, geometric sizing ═══
        if (isIP && canRaise) {
            if (handEval.strength >= 60) {
                let valueBetFreq = 0.65;
                if (multiway) valueBetFreq = 0.50;

                // ── Opponent reads ──
                if (oppCallFreq > 0.55 && oppConfidence > 0.3) valueBetFreq = 0.75; // They call light → bet more
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3) valueBetFreq = 0.80; // They fold to aggression
                if (oppTendency === 'bluffy' && oppConfidence > 0.3 && handEval.strength >= 75) {
                    valueBetFreq = 0.55; // Against aggro, consider checking to induce
                }
                // ═══ LIVE-READ FLOP IP VALUE BET (Phase 25) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Stations: bet more (they call with worse)
                    if (flopLiveRead.callFreq > 0.55) valueBetFreq = Math.min(0.85, valueBetFreq + 0.08);
                    // Aggressive: check monsters to induce
                    if (flopLiveRead.aggFreq > 0.45 && handEval.strength >= 75) valueBetFreq -= 0.12;
                    // Check-raise threats: bet smaller or check strong hands to trap
                    if (flopLiveRead.checkRaisePct !== null && flopLiveRead.checkRaisePct > 0.12 && handEval.strength >= 75) {
                        valueBetFreq -= 0.10; // Check to induce CR
                    }
                    // Folders: bet wide (they give up)
                    if (flopLiveRead.foldFreq > 0.50) valueBetFreq = Math.min(0.88, valueBetFreq + 0.06);
                }

                // ── 3-bet pot IP value bet: higher freq (ranges are narrow, top pair is premium) ──
                if (is3BetPot) {
                    valueBetFreq = Math.min(0.85, valueBetFreq + 0.10);
                    if (is4BetPot && spr <= 3 && handEval.strength >= 65) {
                        return { type: 'all_in' }; // 4-bet pot, low SPR, strong hand → jam
                    }
                }

                // ── Range advantage: bet more when board favors PFR's range (we're PFR IP) ──
                if (rangeAdvantage === 'pfr') valueBetFreq += 0.06;
                if (rangeAdvantage === 'caller') valueBetFreq -= 0.06;

                valueBetFreq = Math.max(0.30, Math.min(0.90, valueBetFreq));
                if (Math.random() < valueBetFreq) {
                    // ── Dynamic sizing based on board texture + SPR + range ──
                    let sizeFrac;
                    if (boardWet === 'wet') {
                        sizeFrac = 0.60 + (handEval.strength >= 80 ? 0.08 : 0); // Bigger with monsters on wet
                    } else if (boardWet === 'dry') {
                        sizeFrac = 0.40 + (handEval.strength >= 80 ? 0.05 : 0); // Smaller on dry
                    } else {
                        sizeFrac = 0.50;
                    }
                    // 3-bet pot sizing: smaller (SPR is lower, build geometrically)
                    if (is3BetPot) sizeFrac = Math.max(0.33, sizeFrac - 0.08);
                    // Range advantage: can go bigger when board favors us (less likely to get raised)
                    if (rangeAdvantage === 'pfr') sizeFrac += 0.04;
                    if (rangeAdvantage === 'caller') sizeFrac -= 0.04;
                    // Against callers, size up for value
                    if (oppCallFreq > 0.55 && oppConfidence > 0.3) sizeFrac = Math.min(0.75, sizeFrac + 0.08);
                    // ═══ LIVE-READ FLOP IP VALUE SIZING (Phase 25) ═══
                    if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                        if (flopLiveRead.callFreq > 0.60) sizeFrac = Math.min(0.80, sizeFrac + 0.08);
                        if (flopLiveRead.foldFreq > 0.55 && handEval.strength < 70) sizeFrac = Math.max(0.30, sizeFrac - 0.08);
                    }
                    // Geometric sizing: plan multi-street value
                    // Phase 46 FIX: 'street' was undeclared — this function is always flop, so streetsLeft=2
                    const geoIP = getGeometricSizing(potSize, heroStack, 2, true);
                    if (geoIP.isJammable && handEval.strength >= 75 && spr >= 3) {
                        sizeFrac = Math.max(sizeFrac, geoIP.sizeFraction);
                    }
                    sizeFrac = Math.max(0.25, Math.min(0.80, sizeFrac));
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }

            // ── IP STAB: Marginal hands on boards where opponent likely missed ──
            // ═══ UPGRADED: Board texture, 3-bet pot, range advantage, opponent session reads ═══
            if (handEval.strength >= 20 && handEval.strength < 55 && !multiway) {
                let stabFreq = 0;
                let stabSize = 0.33;

                if (boardWet === 'dry') {
                    // Dry board: standard stab — opponent missed most of the time
                    stabFreq = 0.28 + aggressionBias / 40;
                    stabSize = 0.33;
                } else if (boardWet === 'medium') {
                    // Medium texture: stab less, but still profitable with some equity
                    stabFreq = handEval.strength >= 35 ? (0.20 + aggressionBias / 50) : 0.10;
                    stabSize = 0.40;
                } else {
                    // Wet board: only stab with some equity (draws, pairs)
                    stabFreq = handEval.strength >= 40 ? (0.15 + aggressionBias / 60) : 0;
                    stabSize = 0.45;
                }

                // ── Opponent reads for stabbing ──
                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) stabFreq += 0.12;
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3) stabFreq += 0.08;
                if (oppCallFreq > 0.65 && oppConfidence > 0.3) stabFreq -= 0.10; // Don't stab into calling stations
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) stabFreq -= 0.06; // They'll check-raise
                // ── Range advantage stab modifier ──
                if (rangeAdvantage === 'pfr') stabFreq += 0.08; // Board favors us → stab wider
                if (rangeAdvantage === 'caller') stabFreq -= 0.06; // Board favors them → don't stab air

                // ── 3-bet pot: stab less (opponent has stronger range, but we have range advantage) ──
                if (is3BetPot) {
                    stabFreq *= 0.65;
                    stabSize = Math.max(0.28, stabSize - 0.05);
                    if (rangeAdvantage === 'pfr' && handEval.strength >= 35) {
                        stabFreq = Math.max(stabFreq, 0.20);
                    }
                }
                if (is4BetPot) stabFreq = 0;

                // ═══ LIVE-READ IP FLOP STAB (Phase 20) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Opponent folds a lot → stab wider + smaller (efficient)
                    if (flopLiveRead.foldFreq > 0.50) {
                        stabFreq += 0.10;
                        stabSize = Math.max(0.25, stabSize - 0.05);
                    }
                    // Opponent calls a lot → only stab with equity
                    if (flopLiveRead.callFreq > 0.60) {
                        stabFreq -= 0.08;
                        if (handEval.strength < 35) stabFreq -= 0.10; // Definitely don't stab air
                    }
                    // Opponent check-raises a lot → stab less with air, more with value
                    if (flopLiveRead.checkRaisePct !== null && flopLiveRead.checkRaisePct > 0.12) {
                        if (handEval.strength < 30) stabFreq -= 0.10; // Air gets punished
                        if (handEval.strength >= 45) stabFreq += 0.05; // They CR into our value
                        stabSize = Math.max(0.25, stabSize - 0.04); // Smaller to control loss if CR'd
                    }
                    // Low WTSD → they give up → stab more
                    if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd < 0.22) stabFreq += 0.06;
                    // Timing: opponent snap-checked to us → weakness → stab more
                    if (flopLiveRead.inHandActions?.lastAction?.action === 'check') {
                        const la = flopLiveRead.inHandActions.lastAction;
                        if (la.timing && la.street === 'flop') {
                            const avg = flopLiveRead.timingProfile?.flop?.avgMs || flopLiveRead.avgDecisionMs;
                            if (avg && avg > 0 && la.timing / avg < 0.40) stabFreq += 0.08;
                            if (avg && avg > 0 && la.timing / avg > 1.8) stabFreq -= 0.06;
                        }
                    }
                }

                stabFreq = Math.max(0, Math.min(0.50, stabFreq));
                if (Math.random() < stabFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * stabSize)) };
                }
            }
        }

        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ══════════════════════════════════════════════════════════
    //  FACING A BET ON THE FLOP
    // ══════════════════════════════════════════════════════════

    // ── POT COMMITTED ──
    if (isPotCommitted && handEval.strength >= 35) {
        if (canRaise && handEval.strength >= 70) return { type: 'all_in' };
        return canCall ? { type: 'call' } : { type: 'fold' };
    }

    // ═══ LIMPED POT FACING BET (FLOP) ═══
    // In limped pots, a bet means someone hit something. Ranges are wide,
    // so the bettor could have anything from bottom pair to a monster.
    // Defense strategy: tighter (no c-bet dynamics to exploit), value-heavy.
    if (flopIsLimpedPot && facingBet) {
        // Strong hands: raise for value (their range is wide, they'll pay off)
        if (handEval.strength >= 70 && canRaise) {
            return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * 2.5)) };
        }
        // Medium-strong: call (pot is small, don't inflate without the nuts)
        if (handEval.strength >= 45 && canCall) {
            return { type: 'call' };
        }
        // Draws: call if cheap
        if (drawEq.outs >= 8 && betToPot <= 0.50 && canCall) {
            return { type: 'call' };
        }
        // Weak: fold (don't fight for a small limped pot with nothing)
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ── MONSTERS: Raise for value (slow-play option) ──
    if (handEval.strength >= 80 && canRaise) {
        // Slow-play on dry boards (opponent will keep bluffing)
        // ═══ 3-BET POT: Never slow-play in 3-bet pots (SPR is low, need to build pot NOW) ═══
        let flopTrapFreq = 0.40;
        // ═══ LIVE-READ FLOP MONSTER TRAP (Phase 26) ═══
        if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
            // Aggressive: trap more (they barrel wide)
            if (flopLiveRead.aggFreq > 0.45) flopTrapFreq += 0.12;
            // High c-bet + second barrel: they'll keep firing
            if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct > 0.65 &&
                flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct > 0.45) flopTrapFreq += 0.10;
            // Passive: don't trap (they check behind)
            if (flopLiveRead.aggFreq < 0.20) flopTrapFreq -= 0.20;
        }
        flopTrapFreq = Math.max(0.10, Math.min(0.60, flopTrapFreq));
        if (boardWet === 'dry' && !multiway && (oppTendency === 'bluffy' || (flopLiveRead?.aggFreq > 0.40)) && !is3BetPot) {
            if (Math.random() < flopTrapFreq) {
                return canCall ? { type: 'call' } : { type: 'fold' }; // Trap
            }
        }
        // Raise for value — size to build pot for turn/river
        let raiseMult = 2.8 + Math.random() * 0.4;
        // ═══ 3-BET POT: Smaller raises work (ranges are narrow, opponent is committed) ═══
        if (is3BetPot) raiseMult = Math.max(2.2, raiseMult * 0.85);
        if (is4BetPot && spr <= 3) return { type: 'all_in' }; // 4-bet pot → just jam
        // Against callers, raise bigger
        if (oppCallFreq > 0.55 && oppConfidence > 0.3) raiseMult = Math.min(3.5, raiseMult * 1.10);
        // ═══ LIVE-READ FLOP MONSTER SIZING (Phase 26) ═══
        if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
            if (flopLiveRead.callFreq > 0.55) raiseMult = Math.min(3.8, raiseMult * 1.12);
            if (flopLiveRead.foldFreq > 0.50) raiseMult = Math.max(2.2, raiseMult * 0.88);
        }
        // Geometric: plan for 3 streets of value
        const geoFlop = getGeometricSizing(potSize + toCall * 2, heroStack - toCall, 2, true);
        if (geoFlop.isJammable && spr >= 3) {
            raiseMult = Math.max(raiseMult, geoFlop.sizeFraction * 4);
        }
        return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * raiseMult)) };
    }

    // ── STRONG HANDS: Call or raise for protection ──
    if (handEval.strength >= 55) {
        // ═══ 3-BET POT: Top pair+ is a premium hand in 3-bet pots — raise for value more ═══
        if (is3BetPot && canRaise && handEval.strength >= 60 && !multiway) {
            let threeBetRaiseFreq = 0.35;
            if (spr <= 4) threeBetRaiseFreq = 0.50; // Low SPR = commit with strong hands
            if (oppCallFreq > 0.55 && oppConfidence > 0.3) threeBetRaiseFreq += 0.10;
            if (Math.random() < threeBetRaiseFreq) {
                const threeBetRaiseMult = spr <= 3 ? -1 : 2.5; // -1 = all-in
                if (threeBetRaiseMult === -1) return { type: 'all_in' };
                return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * threeBetRaiseMult)) };
            }
        }
        // On wet boards, consider raising for protection
        if (canRaise && boardWet === 'wet' && handEval.strength >= 65 && !multiway) {
            let protectRaiseFreq = 0.30;
            if (drawEq.outs >= 4) protectRaiseFreq += 0.10; // We're vulnerable
            if (oppTendency === 'bluffy' && oppConfidence > 0.3) protectRaiseFreq += 0.10;
            // ═══ LIVE-READ FLOP PROTECTION RAISE (Phase 26) ═══
            if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                // Stations: raise bigger for protection (they call with draws)
                if (flopLiveRead.callFreq > 0.55) protectRaiseFreq += 0.08;
                // Aggressive: raise to deny free cards they'd take
                if (flopLiveRead.aggFreq > 0.40) protectRaiseFreq += 0.06;
                // Passive nit: don't raise, they might fold (lost value)
                if (flopLiveRead.aggFreq < 0.20 && handEval.strength >= 70) protectRaiseFreq -= 0.08;
            }
            if (Math.random() < protectRaiseFreq) {
                let protRaiseMult = 2.8;
                if (flopLiveRead && flopLiveRead.confidence >= 0.20 && flopLiveRead.callFreq > 0.60) protRaiseMult = 3.2;
                return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * protRaiseMult)) };
            }
        }
        // Against known nits betting big on the flop → respect
        if (oppTendency === 'weak-tight' && oppConfidence > 0.4 && betToPot >= 0.75 && handEval.strength < 70) {
            // ═══ LIVE-READ FLOP NIT LAYDOWN OVERRIDE (Phase 26) ═══
            if (flopLiveRead && flopLiveRead.confidence >= 0.25 && flopLiveRead.aggFreq > 0.35) {
                // Live data says not actually a nit — don't fold
            } else {
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }
        }
        return canCall ? { type: 'call' } : { type: 'fold' };
    }

    // ── CHECK-RAISE: OOP trapping or semi-bluffing ──
    if (!isIP && canRaise && !multiway) {
        // Semi-bluff check-raise with strong draws
        if (drawEq.outs >= 10 && handEval.strength >= 15) {
            let semiCRFreq = 0.25 + aggressionBias / 40;
            let flopCRMult = is3BetPot ? (2.2 + Math.random() * 0.3) : (2.5 + Math.random() * 0.5);
            if (oppCbetFreq > 0.65 && oppConfidence > 0.3) semiCRFreq += 0.10; // They c-bet wide
            if (oppFoldFreq > 0.45 && oppConfidence > 0.3) semiCRFreq += 0.08;
            // ═══ RANGE ADVANTAGE: check-raise more on boards that favor our range ═══
            if (rangeAdvantage === 'pfr' && !heroIsAggressor) semiCRFreq += 0.06;
            // ═══ 3-BET POT CHECK-RAISE: narrower ranges → check-raise less as a bluff ═══
            if (is3BetPot) semiCRFreq -= 0.08;
            if (is4BetPot) semiCRFreq -= 0.15;

            // ═══ LIVE-READ FLOP SEMI-BLUFF CHECK-RAISE (Phase 19) ═══
            if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                // High c-bet% → their range is wide → check-raise more
                if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct > 0.70) semiCRFreq += 0.08;
                // Low c-bet% → they have it when they bet → check-raise less
                if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct < 0.40) semiCRFreq -= 0.08;
                // High fold-to-raise → check-raise more as semi-bluff (fold equity)
                if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct > 0.55) {
                    semiCRFreq += 0.10;
                    flopCRMult = Math.max(2.0, flopCRMult * 0.92); // Smaller → efficient
                }
                // Low fold-to-raise → they call/re-raise → check-raise only with equity
                if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct < 0.30) {
                    semiCRFreq -= 0.08;
                }
                // Timing: snap c-bet = auto-pilot = weaker range → check-raise more
                if (flopLiveRead.inHandActions?.lastAction?.timing && flopLiveRead.inHandActions.lastAction.street === 'flop') {
                    const la = flopLiveRead.inHandActions.lastAction;
                    const avg = flopLiveRead.timingProfile?.flop?.avgMs || flopLiveRead.avgDecisionMs;
                    if (avg && avg > 0) {
                        if (la.timing / avg < 0.40) semiCRFreq += 0.06; // Snap c-bet = weak
                        if (la.timing / avg > 2.0) semiCRFreq -= 0.06; // Tank c-bet = strong
                    }
                }
            }

            semiCRFreq = Math.max(0, Math.min(0.50, semiCRFreq));
            if (Math.random() < semiCRFreq) {
                return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * flopCRMult)) };
            }
        }
        // Bluff check-raise on dry boards when opponent c-bets wide
        if (handEval.strength < 15 && boardWet === 'dry') {
            // Use live data for c-bet frequency if available, fall back to static reads
            const effectiveCBetFreq = (flopLiveRead && flopLiveRead.confidence >= 0.20 && flopLiveRead.cBetPct !== null)
                ? flopLiveRead.cBetPct
                : (oppCbetFreq > 0 && oppConfidence > 0.3 ? oppCbetFreq : 0);

            if (effectiveCBetFreq > 0.55) {
                let bluffCRFreq = 0.10 + aggressionBias / 50;
                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) bluffCRFreq += 0.08;
                // ═══ LIVE-READ FLOP BLUFF CHECK-RAISE (Phase 19) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct > 0.60) {
                        bluffCRFreq += 0.10; // They fold to raises a lot → bluff CR is printing
                    }
                    if (flopLiveRead.callFreq > 0.60) bluffCRFreq = 0; // Never bluff stations
                }
                // No bluff check-raises in 3-bet/4-bet pots
                if (is3BetPot) bluffCRFreq *= 0.40;
                if (is4BetPot) bluffCRFreq = 0;
                bluffCRFreq = Math.max(0, Math.min(0.25, bluffCRFreq));
                if (Math.random() < bluffCRFreq) {
                    // Sizing: smaller vs folders, standard otherwise
                    const bluffCRMult = (flopLiveRead?.foldToRaisePct > 0.55) ? 2.5 : 3.0;
                    return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * bluffCRMult)) };
                }
            }
        }
    }

    // ═══ OOP FLOAT DEFENSE SYSTEM ═══
    // When OOP facing a c-bet, we need to defend enough to prevent exploitation.
    // GTO says we should defend ~60-65% of our range vs a 66% pot c-bet.
    // Our defense range = check-calls + check-raises.
    // Key principle: defend with (1) made hands, (2) draws, (3) some backdoor equity.
    if (!isIP && !multiway) {
        const flopMDF = potSize / (potSize + toCall); // Minimum defense frequency
        const flopDefenseTarget = flopMDF * 0.75; // We aim to defend ~75% of MDF

        // ═══ FLOAT DEFENSE: Peel with backdoor equity + overcards ═══
        // ═══ UPGRADED: 3-bet pot, range advantage, scare card awareness ═══
        // These hands have no immediate equity but can improve on turn/river.
        // GTO defends with: BDFD + overcard, gutshot + overcard, low pair + BDFD
        if (handEval.strength >= 15 && handEval.strength < 30) {
            const hasBackdoorEquity = handEval.hasBackdoorFlush || handEval.hasGutshot;
            const hasOvercards = holeCards.some(c => RANKS.indexOf(c[0]) > Math.max(...board.map(b => RANKS.indexOf(b[0]))));

            if (hasBackdoorEquity || hasOvercards) {
                // Bug #173: Wire flopDefenseTarget into float defense base frequency
                // Instead of hardcoded 0.30, scale to 75% of MDF (adapts to bet sizing)
                let floatDefenseFreq = Math.max(0.20, Math.min(0.45, flopDefenseTarget));
                // Small c-bet = defend wider
                if (betToPot <= 0.33) floatDefenseFreq += 0.15;
                else if (betToPot <= 0.50) floatDefenseFreq += 0.08;
                // Large c-bet = defend tighter
                if (betToPot >= 0.75) floatDefenseFreq -= 0.12;
                // Against heavy c-bettors = defend wider (they're bluffing more)
                if (oppCbetFreq > 0.70 && oppConfidence > 0.3) floatDefenseFreq += 0.10;
                // Board texture: wet = more profitable to defend (draws available)
                if (boardWet === 'wet') floatDefenseFreq += 0.06;

                // ── 3-bet pot OOP float defense ──
                // In 3-bet pots, opponent's c-bet range is stronger → defend tighter
                // But: we still need to defend some to prevent exploitation
                if (is3BetPot) {
                    floatDefenseFreq *= 0.60; // Significant reduction — their range crushes backdoors
                    // Exception: if board favors our range, defend more
                    if (rangeAdvantage === 'caller') floatDefenseFreq += 0.08;
                }
                if (is4BetPot) {
                    floatDefenseFreq = 0; // Never float with backdoors in 4-bet pots
                }

                // ── Range advantage defense modifier ──
                // When board favors our calling range, defend wider (we have equity advantage)
                if (rangeAdvantage === 'caller' && !is3BetPot) floatDefenseFreq += 0.06;
                if (rangeAdvantage === 'pfr' && !heroIsAggressor) floatDefenseFreq -= 0.05;

                // ── Board scare factor ──
                // Connected boards give backdoor draws more value → defend wider
                if (boardIsConnected && hasBackdoorEquity) floatDefenseFreq += 0.04;

                // ═══ LIVE-READ FLOP DEFENSE ADJUSTMENTS (Phase 18) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Opponent c-bets too much → they're bluffing → defend wider
                    if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct > 0.70) {
                        floatDefenseFreq += 0.10; // High c-bet freq = wide range = defend more
                    } else if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct < 0.40) {
                        floatDefenseFreq -= 0.08; // Low c-bet freq = they have it when they bet
                    }
                    // Opponent gives up on turn a lot (low second barrel) → float = very profitable
                    if (flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct < 0.35) {
                        floatDefenseFreq += 0.10; // ONE-AND-DONE pattern → float profitably
                    }
                    // Opponent folds to check-raise → we can raise with our defense range
                    if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct > 0.55) {
                        floatDefenseFreq += 0.05; // Can always escalate if they fold
                    }
                    // Timing tell: snap c-bet = auto-pilot = wider range = defend more
                    if (flopTimingTell === 'snap_check') {
                        // snap_check doesn't apply here (they bet, not checked)
                    }
                    if (flopLiveRead.inHandActions && flopLiveRead.inHandActions.lastAction) {
                        const la = flopLiveRead.inHandActions.lastAction;
                        if (la.action === 'bet' && la.timing && la.street === 'flop') {
                            const avg = flopLiveRead.timingProfile?.flop?.avgMs || flopLiveRead.avgDecisionMs;
                            if (avg && avg > 0) {
                                if (la.timing / avg < 0.40) floatDefenseFreq += 0.06; // Snap c-bet = weak
                                if (la.timing / avg > 2.0) floatDefenseFreq -= 0.06; // Tank c-bet = strong
                            }
                        }
                    }
                }

                floatDefenseFreq = Math.max(0, Math.min(0.55, floatDefenseFreq));
                if (Math.random() < floatDefenseFreq && canCall) {
                    return { type: 'call' }; // Float defense with backdoor equity
                }
            }
        }
    }

    // ── DRAWING HANDS: Equity math + implied odds ──
    // ═══ UPGRADED: 3-bet pot implied odds reduction, range advantage draw calls ═══
    if (drawEq.outs >= 6) {
        const drawEquityPct = Math.min(drawEq.outs * 2.2, 45) / 100;

        // Direct odds: call if equity exceeds pot odds
        if (drawEquityPct >= potOdds - 0.03) {
            // Semi-bluff raise with massive combo draws
            if (canRaise && drawEq.outs >= 13 && !multiway) {
                let semiBluffRaiseFreq = 0.35;
                let semiRaiseMult = is3BetPot ? 2.2 : 2.5;
                // ── 3-bet pot: semi-bluff raise less (opponent won't fold strong range) ──
                if (is3BetPot) semiBluffRaiseFreq *= 0.55;
                if (is4BetPot) semiBluffRaiseFreq = 0; // Never semi-bluff raise in 4-bet pots
                // Range advantage: raise more when board favors us
                if (rangeAdvantage === 'caller' && !heroIsAggressor) semiBluffRaiseFreq += 0.08;

                // ═══ LIVE-READ SEMI-BLUFF RAISE ADJUSTMENTS (Phase 18) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Opponent folds to raises → semi-bluff more (fold equity is massive)
                    if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct > 0.55) {
                        semiBluffRaiseFreq += 0.12;
                        semiRaiseMult = Math.max(2.0, semiRaiseMult * 0.90); // Smaller raise = efficient
                    }
                    // Opponent calls raises frequently → semi-bluff less (need equity realization)
                    if (flopLiveRead.callFreq > 0.60) {
                        semiBluffRaiseFreq -= 0.08;
                        semiRaiseMult = Math.min(3.0, semiRaiseMult * 1.10); // Bigger when we do raise
                    }
                    // Opponent is ONE-AND-DONE c-bettor → just flat and stab turn instead
                    if (flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct < 0.30) {
                        semiBluffRaiseFreq -= 0.10; // Don't raise — just call and take turn
                    }
                }
                semiBluffRaiseFreq = Math.max(0, Math.min(0.60, semiBluffRaiseFreq));

                if (Math.random() < semiBluffRaiseFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * semiRaiseMult)) };
                }
            }
            return canCall ? { type: 'call' } : { type: 'fold' };
        }

        // Implied odds: call with strong draws when deep
        // ── 3-bet pot implied odds: worse (shallower stacks, less to win) ──
        if (drawEq.outs >= 9 && (handEval.hasFlushDraw || handEval.hasOESD)) {
            let impliedThreshold = 0.50;
            if (oppCallFreq > 0.55 && oppConfidence > 0.3) impliedThreshold = 0.60; // Better implied odds vs callers
            // ═══ LIVE-READ FLOP IMPLIED ODDS (Phase 26) ═══
            if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                // Stations: better implied odds (they pay off when we hit)
                if (flopLiveRead.callFreq > 0.55) impliedThreshold += 0.08;
                // High WTSD: they go to showdown → great implied odds
                if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd > 0.30) impliedThreshold += 0.06;
                // Folders: worse implied (they fold when board completes)
                if (flopLiveRead.foldFreq > 0.55) impliedThreshold -= 0.08;
            }
            // 3-bet pot: need better odds (stacks are shallower, implied odds worse)
            if (is3BetPot) impliedThreshold -= 0.08; // Tighter threshold
            if (is4BetPot) impliedThreshold -= 0.15; // Much tighter
            // Deep stacks improve implied odds
            if (stackBB >= 80) impliedThreshold += 0.08;
            else if (stackBB >= 50) impliedThreshold += 0.04;
            // Must be deep enough for implied odds to matter
            if (spr >= 2 && betToPot < impliedThreshold) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
        }

        // Backdoor draws: very cheap calls only (never in 3-bet+ pots)
        if (drawEq.outs >= 4 && drawEq.outs < 6 && betToPot <= 0.33 && !is3BetPot && !is4BetPot) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
    }

    // ── BUG #113b: MADE-BUT-VULNERABLE calldown (flop) ──
    // Bottom straights (55), wheels (52) are still MADE hands that should call flop bets.
    // They miss the >= 55 strong threshold but should not fold to standard c-bets.
    if (handEval.strength >= 48 && handEval.strength < 55) {
        if (betToPot <= 0.66 && canCall) return { type: 'call' }; // Call up to 2/3 pot on flop
    }

    // ── MEDIUM HANDS: Call or fold based on pot odds + opponent ──
    // ═══ UPGRADED: 3-bet pot threshold adjustment, range advantage, opponent reads ═══
    if (handEval.strength >= 30) {
        // ── 3-bet pot medium hand thresholds ──
        // In 3-bet pots, medium hands are actually decent (ranges are narrow)
        // Second pair in a 3-bet pot = roughly like top pair in a SRP
        const medCallThreshold = is3BetPot ? 25 : is4BetPot ? 20 : 30;
        const medSmallBetThreshold = is3BetPot ? 28 : 35;

        // Good pot odds → call
        if (potOdds < 0.25) {
            if (multiway && handEval.strength < 40) return canCheck ? { type: 'check' } : { type: 'fold' };
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
        // Small bet → call with most medium hands
        if (betToPot <= 0.40 && handEval.strength >= medSmallBetThreshold) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
        // Against known bluffers, call wider
        if (oppBluffFreq > 0.35 && oppConfidence > 0.3) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
        // ═══ LIVE-READ FLOP MEDIUM HAND CALL (Phase 27) ═══
        if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
            // Live bluffer: call with medium hands
            if (flopLiveRead.bluffRate !== null && flopLiveRead.bluffRate > 0.30) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
            // Live passive player big betting: fold more medium hands
            if (flopLiveRead.aggFreq < 0.18 && betToPot >= 0.60 && handEval.strength < 40) {
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }
            // One-and-done: call to steal turn
            if (flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct < 0.30 && handEval.strength >= 25) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
        }
        // ── Range advantage call modifier ──
        // When board favors our range, medium hands have more showdown value
        if (rangeAdvantage === 'caller' && !heroIsAggressor && handEval.strength >= 32 && betToPot <= 0.55) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
        // ── 3-bet pot: call slightly wider with medium hands (opponent c-bets range) ──
        if (is3BetPot && handEval.strength >= medCallThreshold && betToPot <= 0.50) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
    }

    // ── FLOAT in position (call with nothing, plan to take away later) ──
    // ═══ UPGRADED: 3-bet pot, board texture, opponent session reads, range advantage ═══
    // IP float = calling with weak hands planning to steal on later streets.
    // Only profitable with position + reads + appropriate board textures.
    if (isIP && handEval.strength >= 12 && betToPot <= 0.55 && !multiway && aggressionBias > 0) {
        let floatFreq = 0.18 + aggressionBias / 40;

        // ── Opponent reads for floating ──
        if (oppTendency === 'weak-tight' && oppConfidence > 0.3) floatFreq = 0.30; // They give up easily
        if (oppCbetFreq > 0.65 && oppConfidence > 0.3) floatFreq += 0.08; // Wide c-bets = float more
        if (oppTendency === 'bluffy' && oppConfidence > 0.3) floatFreq -= 0.06; // They'll double barrel
        if (oppCallFreq > 0.60 && oppConfidence > 0.3) floatFreq -= 0.04; // Sticky opponents
        // ═══ LIVE-READ FLOP FLOAT (Phase 27) ═══
        if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
            // ONE-AND-DONE: c-bets lot but rarely double barrels → FLOAT HEAVEN
            if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct > 0.60 &&
                flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct < 0.35) {
                floatFreq += 0.15;
            }
            // Low WTSD: they give up easily → float profitably
            if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd < 0.22) floatFreq += 0.08;
            // High WTSD: they don't fold → don't float
            if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd > 0.35) floatFreq -= 0.08;
            // High second barrel: they keep firing → float less
            if (flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct > 0.55) floatFreq -= 0.08;
        }

        // ── Board texture for floating ──
        // Dry boards: float more (turn cards are more likely to be scare cards we can bluff)
        if (boardWet === 'dry') floatFreq += 0.05;
        // Wet boards with backdoor equity: slightly better float (we have outs)
        if (boardWet === 'wet' && (handEval.hasBackdoorFlush || handEval.hasGutshot)) floatFreq += 0.04;
        // High boards favor PFR → good float spot if we're not the aggressor (scare cards help us less)
        if (boardIsHigh && heroIsAggressor) floatFreq += 0.04;

        // ── Range advantage float modifier ──
        if (rangeAdvantage === 'pfr' && heroIsAggressor) floatFreq += 0.04; // Board favors us
        if (rangeAdvantage === 'caller' && heroIsAggressor) floatFreq -= 0.04; // Board favors them

        // ── 3-bet pot: float much less (opponent's range is strong, we need real hands) ──
        if (is3BetPot) {
            floatFreq *= 0.35; // Severe reduction — their range is narrow and strong
            // Only float with some equity in 3-bet pots
            if (handEval.strength < 20 && !handEval.hasBackdoorFlush && !handEval.hasGutshot) {
                floatFreq = 0; // No floating pure air in 3-bet pots
            }
        }
        if (is4BetPot) floatFreq = 0; // Never float in 4-bet pots

        // ── Bet size tells ──
        if (betToPot <= 0.33) floatFreq += 0.06; // Tiny bet = weaker range → float more
        if (betToPot >= 0.50) floatFreq -= 0.04; // Larger bet = more committed

        floatFreq = Math.max(0, Math.min(0.40, floatFreq));
        if (Math.random() < floatFreq) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
    }

    return canCheck ? { type: 'check' } : { type: 'fold' };
}

function evaluateBoardWetness(board) {
    if (!Array.isArray(board) || board.length < 3) return 'medium'; // Bug #49: guard non-array board

    const suits = board.map(c => c[1]);
    const ranks = board.map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);

    // Suit analysis
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuit = Math.max(...Object.values(suitCounts || {}));

    // Connectedness
    const gaps = [];
    for (let i = 0; i < ranks.length - 1; i++) {
        gaps.push(ranks[i] - ranks[i + 1]);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    if (maxSuit >= 3 || (maxSuit >= 2 && avgGap <= 2)) return 'wet';
    if (maxSuit <= 1 && avgGap >= 4) return 'dry';
    return 'medium';
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: ADVANCED INTELLIGENCE FEATURES
// ═══════════════════════════════════════════════════════════════════════════

// --- #24: SPR (Stack-to-Pot Ratio) Awareness ---
/**
 * Calculate SPR and return commitment/strategy guidance.
 * Low SPR (<4): Committed — go all-in with top pair+
 * Medium SPR (4-10): Standard play
 * High SPR (>10): Deep — can fold more, speculate more
 * @param {number} effectiveStack - Hero's stack
 * @param {number} potSize - Current pot
 * @returns {{ spr: number, strategy: string, commitThreshold: number }}
 */
function getSPRStrategy(effectiveStack, potSize) {
    if (potSize <= 0) return { spr: 999, strategy: 'deep', commitThreshold: 85 };
    const spr = effectiveStack / potSize;

    if (spr < 4) return { spr, strategy: 'committed', commitThreshold: 40 }; // Top pair = pot committed
    if (spr < 7) return { spr, strategy: 'medium-low', commitThreshold: 55 };
    if (spr < 13) return { spr, strategy: 'standard', commitThreshold: 65 };
    return { spr, strategy: 'deep', commitThreshold: 75 }; // Need stronger hands deep
}

// --- #25: Multiway Pot Adjustments ---
/**
 * Adjust hand strength requirements when multiway (3+ active players).
 * Multiway pots require stronger hands to continue.
 * @param {number} numPlayers - Active (non-folded) players
 * @returns {{ strengthPenalty: number, bluffReduction: number }}
 */
function getMultiwayAdjustment(numPlayers, opts = {}) {
    const safeOpts = (opts && typeof opts === 'object') ? opts : {}; // Bug #52: guard null/non-object opts
    const {
        position = 'BTN',
        street = 'flop',
        boardWetness = 'medium',
        heroIsAggressor = false
    } = safeOpts;

    if (numPlayers <= 2) return {
        strengthPenalty: 0, bluffReduction: 1.0, valueBetThreshold: 55,
        cbetFreqMod: 0, callWidthMod: 0, adjustSizing: false
    };

    const isIP = new Set(['BTN', 'CO', 'HJ']).has(position);

    // ═══ BASE MULTIWAY ADJUSTMENTS ═══
    let strengthPenalty, bluffReduction, valueBetThreshold, cbetFreqMod, callWidthMod;

    if (numPlayers === 3) {
        strengthPenalty = 8;
        bluffReduction = 0.55;
        valueBetThreshold = 60;
        cbetFreqMod = -0.15;    // c-bet 15% less often 3-way
        callWidthMod = -5;       // Need 5 more strength to call
    } else if (numPlayers === 4) {
        strengthPenalty = 15;
        bluffReduction = 0.25;
        valueBetThreshold = 65;
        cbetFreqMod = -0.30;
        callWidthMod = -10;
    } else {
        strengthPenalty = 22;
        bluffReduction = 0.10;
        valueBetThreshold = 72;
        cbetFreqMod = -0.45;    // Almost never c-bet 5-way
        callWidthMod = -15;
    }

    // ═══ POSITION ADJUSTMENTS ═══
    // IP in multiway: can still bluff more than OOP (last to act = information advantage)
    if (isIP) {
        bluffReduction = Math.min(1.0, bluffReduction * 1.25);
        strengthPenalty = Math.max(0, strengthPenalty - 2);
    }
    // OOP in multiway: play even tighter (sandwich risk)
    if (!isIP && numPlayers >= 3) {
        strengthPenalty += 3;
        bluffReduction *= 0.80;
    }

    // ═══ STREET ADJUSTMENTS ═══
    // Turn/river multiway: if still multiway, ranges are VERY strong → tighten more
    if (street === 'turn') {
        strengthPenalty += 2;
        bluffReduction *= 0.85;
    }
    if (street === 'river') {
        strengthPenalty += 3;
        bluffReduction *= 0.75;
    }

    // ═══ BOARD TEXTURE ═══
    // Wet boards multiway: even less bluffing (someone has it)
    if (boardWetness === 'wet' && numPlayers >= 3) {
        bluffReduction *= 0.75;
        cbetFreqMod -= 0.10;
    }
    // Dry boards multiway: can still c-bet small at decent frequency
    if (boardWetness === 'dry' && heroIsAggressor) {
        cbetFreqMod += 0.08;
    }

    // ═══ SIZING ADJUSTMENT ═══
    // Multiway pots need BIGGER sizing (more players to charge, more equity to deny)
    const adjustSizing = numPlayers >= 3;

    return {
        strengthPenalty: Math.round(strengthPenalty),
        bluffReduction: Math.max(0.05, Math.min(1.0, bluffReduction)),
        valueBetThreshold,
        cbetFreqMod,
        callWidthMod,
        adjustSizing
    };
}

// --- #26: Check-Raise Strategy ---
/**
 * Determine if the horse should check-raise instead of donk-betting.
 * @param {number} handStrength - 0-100 hand strength
 * @param {boolean} isInPosition - Whether hero is IP
 * @param {boolean} hasStrongDraw - Has flush draw or OESD
 * @param {number} aggressionBias - Personality aggression bias
 * @returns {{ shouldCheckRaise: boolean, frequency: number }}
 */
function getCheckRaiseStrategy(handStrength, isInPosition, hasStrongDraw, aggressionBias, opts = {}) {
    const {
        street = 'flop',
        boardWetness = 'medium',   // 'dry', 'medium', 'wet'
        boardIsPaired = false,
        numPlayers = 2,
        oppTendency = 'balanced',  // 'bluffy', 'weak-tight', 'balanced', 'calling-station'
        oppConfidence = 0,
        oppCbetFreq = 0.60,        // How often opponent c-bets (higher = more check-raise value)
        handCategory = 'unknown'
    } = opts;

    const multiway = numPlayers >= 3;
    const result = { shouldCheckRaise: false, frequency: 0, sizeFraction: 3.0 }; // Default 3x raise

    // ═══ OOP CHECK-RAISE (where most check-raises happen) ═══
    if (!isInPosition) {
        // --- VALUE CHECK-RAISES ---
        // Monsters: sets, two pair+, straights, flushes
        if (handStrength >= 65) {
            let freq = 0.55 + aggressionBias / 50;

            // Board texture adjustments
            if (boardWetness === 'wet') {
                // Wet boards: check-raise MORE for protection (don't let draws see free cards)
                freq += 0.10;
                result.sizeFraction = 3.5; // Bigger to price out draws
            } else if (boardWetness === 'dry') {
                // Dry boards: can afford to slowplay more (less draw risk)
                freq -= 0.10;
                result.sizeFraction = 2.5; // Smaller — they have less to call with
            }

            // Paired boards with trips/full house: slowplay more (disguise strength)
            if (boardIsPaired && handStrength >= 80) freq -= 0.15;

            // Street adjustments
            if (street === 'turn') freq += 0.05; // Turn check-raises are more credible
            if (street === 'river') freq += 0.10; // River check-raises are premium value

            // Opponent adjustments
            if (oppTendency === 'bluffy' && oppConfidence > 0.3) {
                // Let bluffers bluff — slowplay more, then raise
                freq -= 0.10;
            }
            if (oppCbetFreq > 0.70 && oppConfidence > 0.3) {
                // Heavy c-bettor: check-raise more (they're betting wide)
                freq += 0.10;
            }
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) {
                // Weak-tight will fold to check-raise — bluff more but value less
                freq -= 0.05; // They fold too much for value
            }

            // Multiway: check-raise less (more risk of big hands behind)
            if (multiway) freq *= 0.60;

            result.shouldCheckRaise = true;
            result.frequency = Math.max(0.10, Math.min(0.85, freq));
            return result;
        }

        // --- SEMI-BLUFF CHECK-RAISES ---
        // Strong draws: flush draws, OESDs, combo draws
        if (hasStrongDraw && handStrength >= 25) {
            let freq = 0.30 + aggressionBias / 40;

            // Wet boards: more semi-bluff value (more draws complete)
            if (boardWetness === 'wet') freq += 0.08;
            // Dry boards: semi-bluffs look more suspicious
            if (boardWetness === 'dry') freq -= 0.10;

            // Only semi-bluff on flop/turn (river draws are dead)
            if (street === 'river') return result;

            // Against callers: don't semi-bluff as much (they call too wide)
            if (oppTendency === 'calling-station' && oppConfidence > 0.3) freq -= 0.15;
            // Against weak-tight: semi-bluff MORE (they fold)
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) freq += 0.12;

            // Heavy c-bettor: check-raise bluff their wide range
            if (oppCbetFreq > 0.70 && oppConfidence > 0.3) freq += 0.08;

            // Multiway: don't semi-bluff check-raise (too risky)
            if (multiway) freq *= 0.30;

            result.shouldCheckRaise = true;
            result.frequency = Math.max(0.05, Math.min(0.55, freq));
            result.sizeFraction = boardWetness === 'wet' ? 3.5 : 3.0;
            return result;
        }

        // --- PURE BLUFF CHECK-RAISES ---
        // With nothing, check-raise bluff at low frequency on specific boards
        if (handStrength < 20 && !multiway && street !== 'river') {
            let bluffFreq = 0.08 + aggressionBias / 60;

            // Only bluff on good boards for it
            if (boardWetness === 'dry' && !boardIsPaired) bluffFreq += 0.06; // Credible on dry boards
            // Against heavy c-bettors: bluff check-raise their air
            if (oppCbetFreq > 0.75 && oppConfidence > 0.3) bluffFreq += 0.08;
            // Against weak-tight: they fold to aggression
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) bluffFreq += 0.06;
            // Against callers: never bluff check-raise
            if (oppTendency === 'calling-station' && oppConfidence > 0.3) bluffFreq = 0;

            if (bluffFreq > 0.05) {
                result.shouldCheckRaise = true;
                result.frequency = Math.min(0.25, bluffFreq);
                result.sizeFraction = 3.0;
                return result;
            }
        }

        return result; // No check-raise
    }

    // ═══ IP CHECK-RAISE (rare — usually trapping) ═══
    // IP check-raises are unconventional and only done with near-nuts to trap
    if (handStrength >= 85) {
        let freq = 0.20;
        // Paired board with full house: trap more
        if (boardIsPaired && handStrength >= 90) freq = 0.30;
        // Against bluffy opponents: let them bet again
        if (oppTendency === 'bluffy' && oppConfidence > 0.3) freq += 0.10;
        result.shouldCheckRaise = true;
        result.frequency = freq;
        result.sizeFraction = 2.5; // Smaller IP (they think we're trapping)
        return result;
    }

    return result;
}

// --- #26b: OOP Check-Call vs Check-Raise vs Lead Decision Matrix ---
// ═══════════════════════════════════════════════════════════════════
// When OOP and facing a bet, this structured matrix determines
// whether to check-call, check-raise, or lead (donk/probe).
// Replaces ad-hoc OOP decisions with a principled framework.
// ═══════════════════════════════════════════════════════════════════

/**
 * OOP action matrix: given we're OOP and facing (or anticipating) a bet,
 * decide check-call, check-raise, lead bet, or check-fold.
 *
 * @param {Object} params
 * @returns {{ action: string, frequency: number, sizeFraction: number, reason: string }}
 *   action: 'check_call', 'check_raise', 'lead', 'check_fold'
 */
function getOOPDecisionMatrix(params) {
    const {
        handStrength = 50,
        handCategory = 'unknown',
        hasStrongDraw = false,
        hasWeakDraw = false,
        street = 'flop',
        boardWetness = 'medium',
        boardIsPaired = false,
        boardIsMonotone = false,
        numPlayers = 2,
        aggressionBias = 0,
        oppTendency = 'balanced',
        oppConfidence = 0,
        oppCbetFreq = 0.60,
        oppCallFreq = 0.50,
        heroIsAggressor = false,
        potSize = 0,
        toCall = 0,
        stackBB = 100,
        liveRead = null  // Phase 28: direct live-read access
    } = params;

    const multiway = numPlayers >= 3;
    const facingSmallBet = toCall > 0 && (toCall / Math.max(1, potSize)) < 0.40;
    const facingBigBet = toCall > 0 && (toCall / Math.max(1, potSize)) >= 0.75;
    const isDeep = stackBB >= 80;

    // ═══ TIER 1: NUTTED HANDS (strength >= 75) ═══
    // Check-raise for max value, or slowplay vs aggressive opponents
    if (handStrength >= 75) {
        // ═══ LIVE-READ OOP NUTTED HANDS (Phase 28) ═══
        let liveSlowplayBoost = 0;
        let liveCRBoost = 0;
        let liveSizeMod = 1.0;
        if (liveRead && liveRead.confidence >= 0.20) {
            // Aggressive: slowplay more (they'll bet into us)
            if (liveRead.aggFreq > 0.45) liveSlowplayBoost += 0.12;
            if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) liveSlowplayBoost += 0.08;
            // Second barrel high: they keep firing → trap is profitable
            if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct > 0.50) liveSlowplayBoost += 0.08;
            // Passive: don't slowplay (they check behind)
            if (liveRead.aggFreq < 0.20) { liveSlowplayBoost -= 0.15; liveCRBoost += 0.10; }
            // Stations: CR bigger
            if (liveRead.callFreq > 0.55) liveSizeMod = 1.15;
            // Folders: CR smaller
            if (liveRead.foldFreq > 0.55) liveSizeMod = 0.88;
        }

        // Against bluffy/aggro opponents: check-call to let them barrel
        let slowplayFreq = 0.60 + liveSlowplayBoost;
        if (oppTendency === 'bluffy' && oppConfidence > 0.3 && street !== 'river') {
            if (Math.random() < Math.min(0.80, slowplayFreq)) {
                return {
                    action: 'check_call', frequency: slowplayFreq,
                    sizeFraction: 0, reason: 'slowplay_vs_bluffy'
                };
            }
        }
        // River with nuts: check-raise always
        if (street === 'river') {
            let crFreq = 0.70 + aggressionBias / 50 + liveCRBoost;
            return {
                action: 'check_raise', frequency: Math.min(0.90, crFreq),
                sizeFraction: 3.0 * liveSizeMod, reason: 'river_value_checkraise'
            };
        }
        // Wet board: check-raise for protection
        if (boardWetness === 'wet') {
            return {
                action: 'check_raise', frequency: 0.65 + liveCRBoost,
                sizeFraction: 3.5 * liveSizeMod, reason: 'protect_nuts_on_wet'
            };
        }
        // Dry board: mix check-call and check-raise (deception)
        let dryCRFreq = 0.45 + liveCRBoost;
        return {
            action: Math.random() < dryCRFreq ? 'check_raise' : 'check_call',
            frequency: 0.55 + liveCRBoost,
            sizeFraction: 2.8 * liveSizeMod, reason: 'mix_nutted_on_dry'
        };
    }

    // ═══ TIER 2: STRONG HANDS (55-74) — two pair, overpair, top pair good kicker ═══
    if (handStrength >= 55) {
        // ═══ LIVE-READ OOP STRONG HANDS (Phase 28) ═══
        let liveStrongCRMod = 0;
        if (liveRead && liveRead.confidence >= 0.20) {
            // High c-bet: CR more to deny bluffs
            if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) liveStrongCRMod += 0.08;
            // High fold-to-raise: CR more (fold equity + value)
            if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.50) liveStrongCRMod += 0.06;
            // Station: don't CR with just strong (they call, we might be behind)
            if (liveRead.callFreq > 0.60 && handStrength < 65) liveStrongCRMod -= 0.08;
        }
        // Against heavy c-bettors: check-raise to deny their bluffs
        if ((oppCbetFreq > 0.70 && oppConfidence > 0.3) ||
            (liveRead && liveRead.confidence >= 0.20 && liveRead.cBetPct !== null && liveRead.cBetPct > 0.70)) {
            if (!multiway) {
                return {
                    action: 'check_raise', frequency: Math.min(0.65, 0.40 + aggressionBias / 50 + liveStrongCRMod),
                    sizeFraction: 3.0, reason: 'checkraise_heavy_cbettor'
                };
            }
        }
        // Multiway: just check-call (too many hands behind)
        if (multiway) {
            return {
                action: 'check_call', frequency: 0.85,
                sizeFraction: 0, reason: 'checkcall_multiway_strong'
            };
        }
        // Facing big bet with strong hand: check-call (don't bloat pot unless nuts)
        if (facingBigBet) {
            return {
                action: 'check_call', frequency: 0.80,
                sizeFraction: 0, reason: 'checkcall_big_bet'
            };
        }
        // Default: mostly check-call, sometimes check-raise
        // Bug #191: Wire isDeep — deep stacks favor check-call (implied odds) over check-raise
        const crFreq = isDeep ? 0.18 + aggressionBias / 50 : 0.30 + aggressionBias / 40;
        return {
            action: Math.random() < crFreq ? 'check_raise' : 'check_call',
            frequency: 0.75,
            sizeFraction: isDeep ? 3.5 : 2.8, reason: isDeep ? 'strong_deep_mix' : 'strong_default_mix'
        };
    }

    // ═══ TIER 3: MEDIUM HANDS (35-54) — second pair, weak top pair ═══
    if (handStrength >= 35) {
        // Draws + pair: check-call comfortably
        if (hasStrongDraw || hasWeakDraw) {
            return {
                action: 'check_call', frequency: 0.80,
                sizeFraction: 0, reason: 'medium_plus_draw'
            };
        }
        // Facing small bet: check-call (getting good odds with showdown value)
        if (facingSmallBet) {
            return {
                action: 'check_call', frequency: 0.75,
                sizeFraction: 0, reason: 'checkcall_small_bet'
            };
        }
        // Facing big bet with just a medium hand: lean fold unless pot odds are great
        if (facingBigBet && handStrength < 45) {
            return {
                action: 'check_fold', frequency: 0.55,
                sizeFraction: 0, reason: 'fold_medium_vs_big_bet'
            };
        }
        // Against weak-tight: lead bet (they check back too much)
        // ═══ LIVE-READ OOP MEDIUM LEAD (Phase 28) ═══
        let leadFreqBoost = 0;
        if (liveRead && liveRead.confidence >= 0.20) {
            // Passive: they check back → lead to build pot
            if (liveRead.aggFreq < 0.25) leadFreqBoost += 0.10;
            // Low c-bet: they won't bet → we must lead for value
            if (liveRead.cBetPct !== null && liveRead.cBetPct < 0.40) leadFreqBoost += 0.08;
        }
        if ((oppTendency === 'weak-tight' && oppConfidence > 0.3) || leadFreqBoost >= 0.10) {
            if (!multiway && toCall === 0) {
                return {
                    action: 'lead', frequency: Math.min(0.55, 0.35 + aggressionBias / 50 + leadFreqBoost),
                    sizeFraction: 0.50, reason: 'lead_vs_passive'
                };
            }
        }
        // Default: check-call
        return {
            action: 'check_call', frequency: 0.65,
            sizeFraction: 0, reason: 'medium_default_checkcall'
        };
    }

    // ═══ TIER 4: DRAWS WITHOUT MADE HAND (15-34 strength) ═══
    if (hasStrongDraw) {
        // Strong draw (flush draw, OESD): check-raise semi-bluff or check-call
        if (!multiway && street !== 'river') {
            // Bug #191b: Wire isDeep into draw CR — deep stacks = lower CR freq (implied odds favor calling)
            let crFreq = isDeep ? 0.22 + aggressionBias / 50 : 0.35 + aggressionBias / 35;
            // Against weak-tight: check-raise more (they fold)
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) crFreq += 0.12;
            // ═══ LIVE-READ OOP DRAW CR (Phase 28) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // High fold-to-raise: semi-bluff CR is printing
                if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.50) crFreq += 0.10;
                // Station: don't semi-bluff CR (no fold equity)
                if (liveRead.callFreq > 0.60) crFreq = Math.min(crFreq, 0.08);
                // Low WTSD: they fold later streets → prefer flat to realize equity
                if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) crFreq -= 0.06;
            }
            crFreq = Math.max(0, Math.min(0.55, crFreq));
            if (Math.random() < crFreq) {
                let sizeFrac = 3.2;
                // Live fold-to-raise: smaller CR (efficient)
                if (liveRead && liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) sizeFrac = 2.6;
                return {
                    action: 'check_raise', frequency: crFreq,
                    sizeFraction: sizeFrac, reason: 'semi_bluff_checkraise'
                };
            }
        }
        // Check-call with draw equity
        return {
            action: 'check_call', frequency: 0.75,
            sizeFraction: 0, reason: 'checkcall_strong_draw'
        };
    }

    if (hasWeakDraw) {
        // Weak draws (gutshot, backdoor): check-call only if pot odds work
        if (facingSmallBet) {
            return {
                action: 'check_call', frequency: 0.55,
                sizeFraction: 0, reason: 'checkcall_weak_draw_small'
            };
        }
        return {
            action: 'check_fold', frequency: 0.60,
            sizeFraction: 0, reason: 'fold_weak_draw_big_bet'
        };
    }

    // ═══ TIER 5: AIR / GARBAGE (< 25 strength, no draws) ═══
    // Check-fold most of the time, occasionally check-raise bluff
    // Bug #193: Was < 15 — hands with 15-24 strength and no draws (bottom pair, Ace high)
    // are NOT calling hands facing bets. aggressionBias can push 13→17, dodging the air tier.
    // Expanded to < 25 so true garbage doesn't leak chips calling with nothing.
    if (handStrength < 25) {
        // Check-raise bluff at low frequency on good boards
        if (!multiway && street !== 'river' && boardWetness === 'dry') {
            let bluffCRFreq = 0.08 + aggressionBias / 60;
            if (oppCbetFreq > 0.75 && oppConfidence > 0.3) bluffCRFreq += 0.06;
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) bluffCRFreq += 0.05;
            // ═══ LIVE-READ OOP BLUFF CR (Phase 28) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // High fold-to-raise: bluff CR is profitable
                if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) bluffCRFreq += 0.08;
                // High c-bet: their range is wide → bluff CR more
                if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.70) bluffCRFreq += 0.05;
                // Station: never bluff CR
                if (liveRead.callFreq > 0.55) bluffCRFreq = 0;
            }
            if (bluffCRFreq > 0.05 && Math.random() < bluffCRFreq) {
                return {
                    action: 'check_raise', frequency: bluffCRFreq,
                    sizeFraction: 3.0, reason: 'pure_bluff_checkraise'
                };
            }
        }
        return {
            action: 'check_fold', frequency: 0.85,
            sizeFraction: 0, reason: 'air_default_fold'
        };
    }

    // Default fallthrough — Bug #193: was check_call, letting garbage hands call bets.
    // Any hand that falls through ALL tiers without a draw is not worth calling.
    // Fold facing bets; if somehow checked to, check back.
    return {
        action: 'check_fold', frequency: 0.75,
        sizeFraction: 0, reason: 'default_fallthrough_fold'
    };
}

// --- #27: Continuation Bet Strategy ---
/**
 * Determine c-bet frequency and sizing based on position and board.
 * @param {boolean} wasPreAggressor - Did hero raise preflop?
 * @param {boolean} isInPosition - IP or OOP?
 * @param {string} boardWetness - 'dry', 'medium', 'wet'
 * @param {number} numPlayers - Active players
 * @returns {{ shouldCbet: boolean, frequency: number, sizeFraction: number }}
 */
function getCBetStrategy(wasPreAggressor, isInPosition, boardWetness, numPlayers) {
    if (!wasPreAggressor) return { shouldCbet: false, frequency: 0, sizeFraction: 0 };

    // Base frequencies
    let freq, size;
    if (isInPosition) {
        // IP c-bet = higher frequency
        freq = boardWetness === 'dry' ? 0.75 : boardWetness === 'wet' ? 0.50 : 0.65;
        size = boardWetness === 'dry' ? 0.33 : boardWetness === 'wet' ? 0.66 : 0.50;
    } else {
        // OOP c-bet = lower frequency, bigger size
        freq = boardWetness === 'dry' ? 0.60 : boardWetness === 'wet' ? 0.35 : 0.50;
        size = boardWetness === 'dry' ? 0.50 : boardWetness === 'wet' ? 0.75 : 0.66;
    }

    // Reduce c-bet frequency multiway
    if (numPlayers >= 3) freq *= 0.5;
    if (numPlayers >= 4) freq *= 0.3;

    return { shouldCbet: Math.random() < freq, frequency: freq, sizeFraction: size };
}

// --- #28: 3-Bet/4-Bet Preflop Dynamics ---
/**
 * Get proper 3-bet range and frequency based on position.
 * @param {string} position - Hero position
 * @param {number} handStrength - Preflop strength 0-100
 * @param {number} facingRaise - Amount of raise being faced
 * @param {number} bb - Big blind amount
 * @param {number} stackBB - Stack in BB
 * @returns {{ should3Bet: boolean, size3Bet: number, isBluff3Bet: boolean }}
 */
function get3BetStrategy(position, handStrength, facingRaise, bb, stackBB) {
    // 3-bet value range (premium hands) — tighter in EP, wider in LP
    const value3BetThreshold = { BTN: 78, CO: 80, HJ: 84, MP: 87, UTG: 90, SB: 76, BB: 74 };
    const bluff3BetThreshold = { BTN: 35, CO: 40, HJ: 45, MP: 50, UTG: 55, SB: 38, BB: 35 };

    const valueThreshold = value3BetThreshold[position] || 85;
    const bluffFloor = bluff3BetThreshold[position] || 45;

    // ═══ 3-BET SIZING — IP vs OOP ═══
    // In position: 3-bet to ~3x the raise (smaller, keeps pot manageable)
    // Out of position: 3-bet to ~3.5x-4x (larger, compensate for OOP disadvantage)
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);
    const baseMult = isIP ? 3.0 : 3.5;

    // ═══ SHORT-STACK 3-BET JAM ═══
    // With <25 BB, 3-bet should be all-in (no point making it small)
    if (stackBB <= 25 && handStrength >= valueThreshold) {
        return { should3Bet: true, size3Bet: stackBB * bb, isBluff3Bet: false, isJam: true };
    }

    // Value 3-bet
    if (handStrength >= valueThreshold) {
        const size = Math.round(facingRaise * (baseMult + Math.random() * 0.3)); // +/- 0.3x noise
        return { should3Bet: true, size3Bet: size, isBluff3Bet: false };
    }

    // ═══ LIGHT 3-BET (bluff) — fold equity play ═══
    // Hands just below calling range that have good blocker/equity properties
    if (handStrength >= bluffFloor - 10 && handStrength < bluffFloor) {
        // Only bluff 3-bet with enough stack and not too deep (keeps SPR manageable)
        if (stackBB >= 35 && stackBB <= 120) {
            // Higher frequency from BTN/SB (these positions face wider opens)
            const bluff3BetFreq = isIP ? 0.20 : (position === 'SB' ? 0.28 : 0.15);
            if (Math.random() < bluff3BetFreq) {
                const size = Math.round(facingRaise * baseMult);
                return { should3Bet: true, size3Bet: size, isBluff3Bet: true };
            }
        }
    }

    return { should3Bet: false, size3Bet: 0, isBluff3Bet: false };
}

// --- #29: Draw Equity Calculator ---
/**
 * Calculate drawing equity (pot odds vs actual outs).
 * @param {Object} handEval - From evaluatePostflopHand()
 * @param {string} street - 'flop', 'turn', 'river'
 * @returns {{ equity: number, outs: number, shouldCall: Function }}
 */
function getDrawEquity(handEval, street) {
    if (!handEval || typeof handEval !== 'object') return { equity: 0, outs: 0, shouldCall: () => false }; // Bug #53: guard null handEval
    let outs = 0;

    if (handEval.hasFlushDraw) outs += 9;  // 9 outs for flush draw
    if (handEval.hasOESD) outs += 8;        // 8 outs for OESD
    if (handEval.hasGutshot && !handEval.hasOESD) outs += 4;  // 4 outs for gutshot (only if not already OESD)
    // Reduce for overlap (flush draw + OESD share some outs — ~2 cards can complete both)
    if (handEval.hasFlushDraw && handEval.hasOESD) outs -= 2;
    if (handEval.hasFlushDraw && handEval.hasGutshot && !handEval.hasOESD) outs -= 1;

    // ═══ BACKDOOR DRAW OUTS (new) ═══
    // Backdoor flush draw on flop = ~1.5 effective outs (3 runner-runner combos)
    // Only count on flop since backdoors need 2 cards
    if (handEval.hasBackdoorFlush && street === 'flop' && !handEval.hasFlushDraw) {
        outs += 1.5; // ~4.2% additional equity
    }

    // ═══ MADE HAND + DRAW: Add improvement outs ═══
    // Top pair can improve to two pair (3 outs) or trips (2 outs)
    if (handEval.category === 'top_pair' || handEval.category === 'overpair') {
        outs += 2; // Improvement outs (set or better)
    }
    // Second/third pair can improve to two pair or trips
    if (handEval.category === 'second_pair' || handEval.category === 'third_pair') {
        outs += 2;
    }

    // Approximate equity: outs × multiplier
    // Flop (2 cards to come): outs × 4 - (outs - 8) = rough %
    // Turn (1 card to come): outs × 2 + 1 = rough %
    let equity;
    if (street === 'flop') {
        equity = Math.min(65, outs * 4 - Math.max(0, outs - 8)); // Rule of 4
    } else if (street === 'turn') {
        equity = Math.min(45, outs * 2 + 1); // Rule of 2+1
    } else {
        equity = 0; // No more cards — no draw equity
    }

    // ═══ NUT DRAW PREMIUM ═══
    // Nut flush draws and nut straight draws are worth more because they win bigger pots
    // BUG #17 FIX: Was treating ALL flush draws as nut draws. Must check for ace-high flush draw
    // specifically — a 7-high flush draw is NOT a nut draw and has reverse implied odds.
    const isNutDraw = handEval.hasFlushDraw && handEval.category !== 'flush' && handEval.isNutFlushDraw === true;
    const nutPremium = isNutDraw ? 0.03 : 0; // ~3% implied odds premium for nut draws
    // Reverse implied odds penalty for non-nut flush draws (they make 2nd best flushes)
    const reverseImpliedPenalty = (handEval.hasFlushDraw && !isNutDraw && handEval.category !== 'flush') ? -0.02 : 0;

    return {
        equity: Math.min(0.65, Math.max(0, equity / 100 + nutPremium + reverseImpliedPenalty)),
        outs: Math.round(outs * 10) / 10, // Round to 1 decimal
        isNutDraw,
        shouldCall: (potOdds) => (equity / 100 + nutPremium + reverseImpliedPenalty) >= potOdds,
        // ═══ IMPLIED ODDS ADJUSTED CALL (new) ═══
        // For nut draws and big draws, calling is profitable even when direct odds are short
        shouldCallWithImplied: (potOdds, stackBB) => {
            const directOK = (equity / 100 + nutPremium) >= potOdds;
            if (directOK) return true;
            // Implied odds: if we're deep enough and the draw is strong, we get paid on later streets
            if (stackBB >= 40 && outs >= 9) {
                const impliedMultiplier = isNutDraw ? 1.35 : 1.20; // Nut draws get bigger implied odds
                return (equity / 100 * impliedMultiplier + nutPremium) >= potOdds;
            }
            return false;
        }
    };
}

// --- #30: River Intelligence ---
/**
 * Make river-specific decisions: thin value, bluff-catch, or give up.
 * @param {number} handStrength - 0-100
 * @param {number} potOdds - Current pot odds (0-1)
 * @param {boolean} canBet - Can we bet?
 * @param {boolean} facingBet - Are we facing a bet?
 * @param {number} aggressionBias - Personality
 * @returns {{ action: string, sizeFraction: number }}
 */
function getRiverStrategy(handStrength, potOdds, canBet, facingBet, aggressionBias, opts = {}) {
    const {
        boardWetness = 'medium',
        oppTendency = 'balanced',
        oppConfidence = 0,
        hasBlockers = false,
        drawsCompleted = false,
        drawsBricked = false,
        isIP = true,
        betToPot = 0.66
    } = opts;

    // ═══ PHASE 36B: OPPONENT-AWARE ADJUSTMENTS ═══
    const oppIsPassive = oppTendency === 'weak-tight' && oppConfidence > 0.3;
    const oppIsBluffy = oppTendency === 'bluffy' && oppConfidence > 0.3;
    const oppIsStation = oppTendency === 'calling-station' && oppConfidence > 0.3;

    if (!facingBet && canBet) {
        // ── NUTS: Overbet for max value ──
        if (handStrength >= 90) {
            let sizeFrac = 0.85;
            if (oppIsStation) sizeFrac = 1.10;
            if (drawsCompleted) sizeFrac = Math.min(1.30, sizeFrac + 0.15);
            if (oppIsPassive && boardWetness === 'dry') sizeFrac = 0.65;
            return { action: 'bet', sizeFraction: sizeFrac };
        }
        // ── Strong value (75-90) ──
        if (handStrength >= 75) {
            let sizeFrac = 0.66;
            if (oppIsStation) sizeFrac = 0.80;
            if (boardWetness === 'wet' && drawsCompleted) sizeFrac = 0.75;
            return { action: 'bet', sizeFraction: sizeFrac };
        }
        // ── Thin value (50-75): context-dependent ──
        if (handStrength >= 50 && handStrength < 75) {
            const strengthBonus = (handStrength - 50) / 100;
            let betFreq = 0.65 + strengthBonus + aggressionBias / 40;
            let sizeFrac = 0.33;
            if (boardWetness === 'dry') { betFreq += 0.08; sizeFrac = 0.28; }
            if (boardWetness === 'wet' && drawsCompleted) betFreq -= 0.10;
            if (oppIsStation) { betFreq += 0.10; sizeFrac = 0.40; }
            if (oppIsPassive) betFreq += 0.06;
            if (oppIsBluffy) betFreq -= 0.08;
            if (isIP) betFreq += 0.05;
            if (Math.random() < betFreq) return { action: 'bet', sizeFraction: sizeFrac };
            return { action: 'check', sizeFraction: 0 };
        }
        // ── Bluff with nothing ──
        if (handStrength < 20) {
            let bluffFreq = 0.12 + aggressionBias / 60;
            let bluffSize = 0.66;
            if (hasBlockers) { bluffFreq += 0.12; bluffSize = 0.75; }
            if (drawsBricked) bluffFreq -= 0.06;
            if (drawsCompleted) bluffFreq += 0.08;
            if (oppIsPassive) bluffFreq += 0.10;
            if (oppIsStation) bluffFreq = Math.max(0, bluffFreq - 0.10);
            bluffFreq = Math.max(0, Math.min(0.35, bluffFreq));
            if (Math.random() < bluffFreq) return { action: 'bet', sizeFraction: bluffSize };
        }
        return { action: 'check', sizeFraction: 0 };
    }

    if (facingBet) {
        // ── Monsters: Raise for value ──
        if (handStrength >= 85) {
            let raiseMult = 2.5;
            if (oppIsStation) raiseMult = 3.0;
            if (oppIsPassive) raiseMult = 2.2;
            return { action: 'raise', sizeFraction: raiseMult };
        }
        // ── Strong: call (or raise small bets) ──
        if (handStrength >= 65) {
            if (betToPot <= 0.40 && Math.random() < 0.30) {
                return { action: 'raise', sizeFraction: 2.8 };
            }
            return { action: 'call', sizeFraction: 0 };
        }
        // ── Bluff-catching (45-65): opponent-aware ──
        if (handStrength >= 45) {
            let callFreq = 0.60;
            if (potOdds < 0.35) callFreq += 0.10;
            if (oppIsBluffy) callFreq += 0.15;
            if (oppIsPassive && betToPot >= 0.60) callFreq -= 0.20;
            if (hasBlockers) callFreq += 0.08;
            if (drawsBricked) callFreq += 0.08;
            callFreq = Math.max(0.15, Math.min(0.85, callFreq));
            if (Math.random() < callFreq) return { action: 'call', sizeFraction: 0 };
            return { action: 'fold', sizeFraction: 0 };
        }
        // ── Marginal (30-45): tight calling ──
        if (handStrength >= 30 && potOdds < 0.25) {
            let margCallFreq = 0.30;
            if (oppIsBluffy) margCallFreq = 0.45;
            if (oppIsPassive) margCallFreq = 0.10;
            if (hasBlockers && drawsBricked) margCallFreq += 0.12;
            if (betToPot >= 0.80) margCallFreq -= 0.10;
            margCallFreq = Math.max(0.05, Math.min(0.55, margCallFreq));
            return Math.random() < margCallFreq
                ? { action: 'call', sizeFraction: 0 }
                : { action: 'fold', sizeFraction: 0 };
        }
        return { action: 'fold', sizeFraction: 0 };
    }

    return { action: 'check', sizeFraction: 0 };
}

// --- #31: Deep Stack Adjustments ---
/**
 * Adjust preflop strategy for deep stacks (200BB+).
 * @param {number} stackBB - Stack in big blinds
 * @param {string} handStr - Hand string (e.g., 'AKs')
 * @returns {{ widentRange: boolean, impliedOddsBonus: number, suitedBonus: number }}
 */
function getDeepStackAdjustment(stackBB) {
    if (stackBB < 150) return { widenRange: false, impliedOddsBonus: 0, suitedBonus: 0 };

    // Deep stack: speculative hands (suited connectors, small pairs) gain value
    const depth = Math.min(300, stackBB);
    const bonus = Math.round((depth - 150) / 15); // 0 to 10

    return {
        widenRange: true,
        impliedOddsBonus: bonus,     // Added to preflop strength for speculative hands
        suitedBonus: Math.round(bonus * 0.7)  // Extra value for suited hands
    };
}

// --- #32: Bet Sizing Trees ---
/**
 * Get optimal bet sizing based on hand category and street.
 * Small for bluffs/thin value, big for value, overbet for nutted.
 * @param {string} handCategory - From evaluatePostflopHand
 * @param {string} street - Current street
 * @param {number} potSize - Current pot
 * @param {boolean} isBluff - Is this a bluff?
 * @returns {number} Bet size as fraction of pot
 */
function getOptimalBetSize(handCategory, street, potSize, isBluff, opts = {}) {
    if (!opts || typeof opts !== 'object') opts = {}; // Bug #75: null opts crashes destructuring
    const {
        boardWetness = 'medium',     // 'dry', 'medium', 'wet'
        isInPosition = true,
        numPlayers = 2,
        oppTendency = 'balanced',    // 'bluffy', 'weak-tight', 'balanced', 'calling-station'
        oppConfidence = 0,
        oppCallFreq = 0.50,
        handStrength = 50,           // 0-100 for polarization decisions
        heroIsAggressor = false,
        stackBB = 100,
        isPolarized = false          // Force polarized sizing
    } = opts;

    const multiway = numPlayers >= 3;

    // ═══ SIZING STRATEGY: POLARIZED vs MERGED ═══
    // Polarized: bet big with nutted hands AND bluffs (no medium)
    // Merged: bet small-medium with a wide range including medium hands
    //
    // Polarized is better: deep-stacked, IP, dry boards, river, heads-up
    // Merged is better: shallow, OOP, wet boards, multiway, flop

    let usePolarized = isPolarized;
    if (!usePolarized) {
        // Auto-detect polarization from context
        if (street === 'river') usePolarized = true; // River is almost always polarized
        if (handStrength >= 70 || handStrength <= 20) usePolarized = true; // Nut or air = polarized
        if (boardWetness === 'dry' && isInPosition && !multiway) usePolarized = true;
    }

    // ═══ BLUFF SIZING ═══
    if (isBluff) {
        if (usePolarized) {
            // Polarized bluffs: same size as value (opponent indifferent)
            const bluffSizes = { flop: 0.66, turn: 0.75, river: 0.75 };
            let sz = bluffSizes[street] || 0.50;

            // Overbet bluff on river when polarized (1.0-1.5x pot)
            if (street === 'river' && stackBB >= 60) sz = 1.0 + Math.random() * 0.25;

            // Against weak-tight: bigger bluffs (they fold more)
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) sz *= 1.20;
            // Against callers: smaller bluffs (better risk/reward since they call)
            if (oppTendency === 'calling-station' && oppConfidence > 0.3) sz *= 0.70;
            // Multiway: don't bluff big
            if (multiway) sz *= 0.70;

            // ═══ LIVE-READ BLUFF SIZING (Phase 31) ═══
            const lr2 = opts.liveRead;
            if (lr2 && lr2.confidence >= 0.25) {
                if (lr2.foldFreq > 0.55) sz *= 1.15; // Folder → bigger bluffs for max fold eq
                if (lr2.callFreq > 0.55) sz *= 0.75; // Station → minimize loss
                if (lr2.foldToRaisePct !== null && lr2.foldToRaisePct > 0.55) sz *= 1.12;
            }

            return Math.min(2.0, sz);
        } else {
            // Merged bluffs: small sizing (risk less with air in a merged range)
            return street === 'river' ? 0.40 : 0.25;
        }
    }

    // ═══ VALUE SIZING ═══
    // Base sizing by hand category
    const sizingMap = {
        // Nutted hands: overbet territory
        royal_flush: 1.50, straight_flush: 1.50,
        quads: 1.50, full_house: 1.25, flush: 0.90,
        // Strong: big bet
        straight: 0.80, set: 0.80, trips: 0.75,
        // Medium-strong: standard
        two_pair: 0.66, overpair: 0.60, top_pair: 0.50,
        // Medium: block/thin value
        second_pair: 0.33, third_pair: 0.30, underpair: 0.33,
        // Thin value
        two_pair_weak: 0.45, bottom_pair: 0.25,
        // Board-made hands (BUG #28): hero doesn't contribute — these are bluff-catchers
        board_trips: 0.30, board_two_pair: 0.28, board_pair: 0.25,
        // Draws (semi-bluff sizing)
        no_pair: 0.33, high_card: 0.33, unknown: 0.40
    };

    let baseSizing = sizingMap[handCategory] || 0.50;

    // ═══ BOARD TEXTURE ADJUSTMENTS ═══
    if (boardWetness === 'wet') {
        // Wet boards: bet bigger for protection (don't let draws see cheap cards)
        if (handStrength >= 40) baseSizing *= 1.15; // Value hands size up
        // Nutted hands on wet boards: they have draws → get max value
        if (handStrength >= 70) baseSizing *= 1.10;
    } else if (boardWetness === 'dry') {
        // Dry boards: bet smaller (merged strategy, high c-bet frequency)
        baseSizing *= 0.80;
        // But nutted hands can still go big on dry boards (trapping won't work as well)
        if (handStrength >= 75) baseSizing *= 1.15;
    }

    // ═══ DOUBLE-PAIRED BOARD: SMALL BALL OVERRIDE ═══
    // When board has 2+ pairs (e.g., KK558), full houses are everywhere.
    // Anyone matching a board pair rank has a full house. Non-full-house hands
    // should use small ball sizing — bet small to control the pot and minimize losses
    // when called by better hands. This applies to ALL non-nutted categories.
    const boardMadeCategories = new Set(['board_trips', 'board_two_pair', 'board_pair', 'two_pair_weak']);
    if (boardMadeCategories.has(handCategory) && handStrength < 70) {
        baseSizing = Math.min(baseSizing, 0.30); // Cap at 30% pot — small ball
    }

    // ═══ POSITION ADJUSTMENTS ═══
    if (!isInPosition) {
        // OOP: bet slightly bigger (we need to charge draws more since we act first)
        baseSizing *= 1.08;
    }

    // ═══ MULTIWAY ADJUSTMENTS ═══
    if (multiway) {
        // Multiway: bet bigger with strong hands (more callers = more value)
        if (handStrength >= 55) baseSizing *= 1.10;
        // But thin value: bet smaller (more chance someone has us beat)
        if (handStrength < 50 && handStrength >= 30) baseSizing *= 0.80;
    }

    // ═══ POLARIZED VS MERGED SIZING ═══
    if (usePolarized) {
        // Polarized: size up to build the pot (opponent has to call or fold with bluff catcher)
        if (handStrength >= 65) baseSizing = Math.max(baseSizing, 0.75);
        // River polarized: go big or go home
        if (street === 'river' && handStrength >= 70) baseSizing = Math.max(baseSizing, 0.85);
        // Overbet with absolute nuts
        if (handStrength >= 85 && stackBB >= 60) baseSizing = Math.max(baseSizing, 1.20);
    } else {
        // Merged: keep sizing smaller to use wider range
        baseSizing = Math.min(baseSizing, 0.66);
    }

    // ═══ OPPONENT-AWARE SIZING ═══
    if (oppConfidence > 0.25) {
        // Against calling stations: size UP for value (they call everything)
        if (oppTendency === 'calling-station' || oppCallFreq > 0.60) {
            if (handStrength >= 45) baseSizing *= 1.15; // More value from callers
        }
        // Against weak-tight: size DOWN (keep them in the pot, they fold to big bets)
        if (oppTendency === 'weak-tight') {
            if (handStrength >= 45 && handStrength < 80) baseSizing *= 0.80; // Thin value: bet small
            // But nutted hands vs nits: go normal/big (they pay off top of range)
        }
        // Against bluffy opponents: don't overbet (they might re-bluff raise us)
        if (oppTendency === 'bluffy' && handStrength >= 60 && handStrength < 80) {
            baseSizing *= 0.90; // Induce the re-bluff by betting smaller
        }
    }

    // ═══ LIVE-READ BET SIZING OVERRIDE (Phase 30) ═══
    // Direct live-read data takes priority for sizing when available
    const lr = opts.liveRead;
    if (lr && lr.confidence >= 0.25) {
        // Station: size up value bets
        if (lr.callFreq > 0.55 && handStrength >= 45) baseSizing *= 1.10;
        if (lr.callFreq > 0.65 && handStrength >= 55) baseSizing *= 1.06;
        // Folder: size down to get the call
        if (lr.foldFreq > 0.55 && handStrength >= 45 && handStrength < 80) baseSizing *= 0.85;
        // Aggro: smaller sizing to induce re-raise
        if (lr.aggFreq > 0.45 && handStrength >= 65) baseSizing *= 0.92;
        // High WTSD: they go to showdown, size up
        if (lr.wtsd !== null && lr.wtsd > 0.30 && handStrength >= 50) baseSizing *= 1.06;
    }

    // ═══ STREET ESCALATION ═══
    // Later streets = bigger sizing (pot is bigger, stacks are shorter relative to pot)
    if (street === 'turn') baseSizing *= 1.10;
    if (street === 'river') baseSizing *= 1.20;

    // ═══ STACK DEPTH ═══
    // Short-stacked: size down to keep pot manageable (or jam)
    if (stackBB <= 30 && baseSizing > 0.66) {
        baseSizing = Math.min(baseSizing, 0.66); // Don't overbet when short
    }

    // Clamp to reasonable range: 20% to 200% pot
    return Math.max(0.20, Math.min(2.00, baseSizing));
}

// ═══════════════════════════════════════════════════════════════════════════
// GEOMETRIC BET SIZING PLANNER
// ═══════════════════════════════════════════════════════════════════════════
// Plans bet sizing across remaining streets to get all the money in by river.
// Given: current pot, hero stack, streets remaining, and target (jam or not).
// Returns: optimal sizing fraction for THIS street that sets up future streets.
//
// Example: 100bb stack, 10bb pot on flop.
// Geometric growth: bet 75% pot each street → pot grows ~3x each street.
// Flop: 10bb pot → bet 7.5 → pot becomes 25bb. Turn: 25bb → bet 18.75 → pot 62.5bb.
// River: 62.5bb → bet 47 → pot 157bb. Stack used: ~73bb of 100bb.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// BOARD TEXTURE EVOLUTION TRACKER
// ═══════════════════════════════════════════════════════════════════════════
// Tracks how the board changes from flop→turn→river and who benefits.
// This is critical for understanding range advantage shifts.

/**
 * Analyze how the board evolved from the flop to the current street.
 * @param {Array} board - Current board cards (3-5 cards)
 * @param {string} street - 'flop', 'turn', or 'river'
 * @returns {Object} Board evolution analysis
 */
function analyzeBoardEvolution(board, street) {
    if (!Array.isArray(board) || board.length < 3) { // Bug #50: guard non-array board
        return { evolution: 'unknown', pfrImpact: 0, callerImpact: 0, scareCards: [], drawsCompleted: [] };
    }

    const flopBoard = board.slice(0, 3);
    const flopRanks = flopBoard.map(c => RANKS.indexOf(c[0]));
    const flopSuits = flopBoard.map(c => c[1]);
    const flopSuitCounts = {};
    flopSuits.forEach(s => { flopSuitCounts[s] = (flopSuitCounts[s] || 0) + 1; });
    const flopMaxSuit = Math.max(...Object.values(flopSuitCounts || {}));
    const flopFlushDrawSuit = Object.entries(flopSuitCounts || {}).find(([s, c]) => c >= 2)?.[0];

    const result = {
        evolution: 'neutral',
        pfrImpact: 0,         // Positive = good for PFR, negative = bad
        callerImpact: 0,      // Positive = good for caller, negative = bad
        scareCards: [],        // Cards that changed the dynamic
        drawsCompleted: [],    // What draws got there
        drawsBricked: [],      // What draws missed
        boardPaired: false,    // Did the board pair on a later street?
        overcard: false,       // Did an overcard fall?
        flushCompleted: false,
        straightCompleted: false,
        boardGotWetter: false,
        boardGotDrier: false
    };

    if (street === 'flop') return result; // No evolution on flop

    // ═══ TURN CARD ANALYSIS ═══
    if (board.length >= 4) {
        const turnCard = board[3];
        const turnRank = RANKS.indexOf(turnCard[0]);
        const turnSuit = turnCard[1];

        // Overcard detection: turn card higher than all flop cards
        if (turnRank > Math.max(...flopRanks)) {
            result.overcard = true;
            result.scareCards.push(turnCard);
            result.pfrImpact += 3; // Overcards favor PFR (AK, AQ hit)
            result.callerImpact -= 2;
        }

        // Board pairing
        if (flopRanks.includes(turnRank)) {
            result.boardPaired = true;
            result.scareCards.push(turnCard);
            result.pfrImpact += 1; // Paired board slightly favors PFR (full houses)
        }

        // Flush draw created or completed
        const turnSuitCounts = { ...flopSuitCounts };
        turnSuitCounts[turnSuit] = (turnSuitCounts[turnSuit] || 0) + 1;
        const turnMaxSuit = Math.max(...Object.values(turnSuitCounts || {}));
        if (flopMaxSuit < 3 && turnMaxSuit >= 3) {
            result.drawsCompleted.push('flush');
            result.flushCompleted = true;
            result.callerImpact += 4; // Flush completions favor caller (suited hands)
            result.pfrImpact -= 3;
            result.scareCards.push(turnCard);
        } else if (flopMaxSuit < 2 && turnMaxSuit >= 2) {
            result.boardGotWetter = true;
            result.callerImpact += 1;
        }

        // Bug #192: Wire flopFlushDrawSuit — track if turn card hits the SPECIFIC flop draw suit
        // Turn card matching the flop's 2-suit = flush draw got stronger (3-flush board)
        // Turn card in a DIFFERENT suit = flop flush draw got no help (board got drier for that draw)
        if (flopFlushDrawSuit && turnSuit === flopFlushDrawSuit && turnMaxSuit < 3) {
            // 3-flush on board now but didn't complete — draw improved, board much wetter
            result.boardGotWetter = true;
            result.callerImpact += 2; // Callers with flush draws picked up 3rd suited card
            result.pfrImpact -= 1;
        } else if (flopFlushDrawSuit && turnSuit !== flopFlushDrawSuit && flopMaxSuit >= 2) {
            // Flop had flush draw but turn missed it — slightly drier for flush drawers
            result.callerImpact -= 1;
        }

        // Straight completion check (simplified)
        const allRanks = [...flopRanks, turnRank].sort((a, b) => a - b);
        let maxRun = 1, curRun = 1;
        for (let i = 1; i < allRanks.length; i++) {
            if (allRanks[i] - allRanks[i - 1] === 1) { curRun++; maxRun = Math.max(maxRun, curRun); }
            else if (allRanks[i] !== allRanks[i - 1]) curRun = 1;
        }
        // Check for A-low straight (A2345)
        if (allRanks.includes(12) && allRanks.includes(0) && allRanks.includes(1)) maxRun = Math.max(maxRun, 3);
        if (maxRun >= 4) {
            result.drawsCompleted.push('straight');
            result.straightCompleted = true;
            result.callerImpact += 3;
            result.pfrImpact -= 2;
            result.scareCards.push(turnCard);
        }

        // Low card on high flop = blank (good for PFR)
        if (turnRank < 6 && Math.min(...flopRanks) >= 8) {
            result.boardGotDrier = true;
            result.pfrImpact += 2;
            result.callerImpact -= 1;
        }
    }

    // ═══ RIVER CARD ANALYSIS ═══
    if (board.length >= 5) {
        const riverCard = board[4];
        const riverRank = RANKS.indexOf(riverCard[0]);
        const riverSuit = riverCard[1];
        const turnBoard = board.slice(0, 4);
        const turnRanks = turnBoard.map(c => RANKS.indexOf(c[0]));
        const turnSuits = turnBoard.map(c => c[1]);
        const turnSuitCounts2 = {};
        turnSuits.forEach(s => { turnSuitCounts2[s] = (turnSuitCounts2[s] || 0) + 1; });
        const turnMaxSuit2 = Math.max(...Object.values(turnSuitCounts2 || {}));

        // River overcard
        if (riverRank > Math.max(...turnRanks)) {
            result.overcard = true;
            result.scareCards.push(riverCard);
            result.pfrImpact += 2;
        }

        // Board pairing on river
        if (turnRanks.includes(riverRank)) {
            result.boardPaired = true;
            result.pfrImpact += 1;
        }

        // Flush completed on river
        const riverSuitCounts = { ...turnSuitCounts2 };
        riverSuitCounts[riverSuit] = (riverSuitCounts[riverSuit] || 0) + 1;
        const riverMaxSuit = Math.max(...Object.values(riverSuitCounts || {}));
        if (turnMaxSuit2 < 3 && riverMaxSuit >= 3) {
            result.drawsCompleted.push('flush');
            result.flushCompleted = true;
            result.callerImpact += 4;
            result.pfrImpact -= 3;
        }
        // Flush draw BRICKED on river
        if (turnMaxSuit2 >= 2 && turnMaxSuit2 < 3 && riverMaxSuit < 3) {
            result.drawsBricked.push('flush');
            result.pfrImpact += 2; // Bricked draws favor PFR (bluff-catchers win)
            result.callerImpact -= 2;
        }

        // Straight completed on river
        const allRanksR = [...turnRanks, riverRank].sort((a, b) => a - b);
        let maxRunR = 1, curRunR = 1;
        for (let i = 1; i < allRanksR.length; i++) {
            if (allRanksR[i] - allRanksR[i - 1] === 1) { curRunR++; maxRunR = Math.max(maxRunR, curRunR); }
            else if (allRanksR[i] !== allRanksR[i - 1]) curRunR = 1;
        }
        if (allRanksR.includes(12) && allRanksR.includes(0) && allRanksR.includes(1)) maxRunR = Math.max(maxRunR, 3);
        if (maxRunR >= 4) {
            result.drawsCompleted.push('straight_completed');
            result.straightCompleted = true;
            result.callerImpact += 3;
            result.pfrImpact -= 2;
        }
        // Straight draw BRICKED
        if (maxRunR < 4 && board.length === 5) {
            // Check if turn had 3-in-a-row (open-ended) that didn't get there
            const turnAllRanks = turnRanks.sort((a, b) => a - b);
            let turnMaxRun = 1, turnCurRun = 1;
            for (let i = 1; i < turnAllRanks.length; i++) {
                if (turnAllRanks[i] - turnAllRanks[i - 1] === 1) { turnCurRun++; turnMaxRun = Math.max(turnMaxRun, turnCurRun); }
                else if (turnAllRanks[i] !== turnAllRanks[i - 1]) turnCurRun = 1;
            }
            if (turnMaxRun >= 3 && maxRunR < 4) {
                result.drawsBricked.push('straight');
                result.pfrImpact += 1;
            }
        }

        // Blank river (low card, no draws complete)
        if (riverRank < 6 && result.drawsCompleted.length === 0 && !result.boardPaired) {
            result.boardGotDrier = true;
            result.pfrImpact += 1;
        }
    }

    // ═══ OVERALL EVOLUTION CLASSIFICATION ═══
    if (result.pfrImpact >= 3) result.evolution = 'pfr_favorable';
    else if (result.pfrImpact <= -3) result.evolution = 'caller_favorable';
    else if (result.drawsCompleted.length > 0) result.evolution = 'dynamic';
    else if (result.drawsBricked.length > 0) result.evolution = 'static_brick';
    else result.evolution = 'neutral';

    return result;
}

/**
 * Calculate the geometric bet sizing fraction that gets stacks in by a target street.
 * @param {number} potSize - Current pot in chips
 * @param {number} heroStack - Hero's remaining stack in chips
 * @param {number} streetsRemaining - Number of betting streets left (including current)
 * @param {boolean} targetAllIn - Whether we want to be all-in by the last street
 * @returns {{ sizeFraction: number, projectedPotByStreet: number[], isJammable: boolean }}
 */
function getGeometricSizing(potSize, heroStack, streetsRemaining, targetAllIn = true) {
    if (streetsRemaining <= 0 || potSize <= 0) {
        return { sizeFraction: 0.66, projectedPotByStreet: [], isJammable: false };
    }

    // SPR = Stack-to-Pot Ratio
    const spr = heroStack / Math.max(1, potSize);

    // If already pot committed (SPR < 2), just jam
    if (spr < 2) {
        return { sizeFraction: 999, projectedPotByStreet: [heroStack + potSize], isJammable: true };
    }

    // If we DON'T want to get all-in (pot control), return standard sizing
    if (!targetAllIn) {
        return {
            sizeFraction: streetsRemaining === 1 ? 0.66 : 0.50,
            projectedPotByStreet: [],
            isJammable: false
        };
    }

    // ═══ GEOMETRIC SIZING CALCULATION ═══
    // We want: after N streets of betting fraction f, the pot = 2 * heroStack
    // (i.e., hero puts in all remaining chips across N streets).
    //
    // At each street: newPot = pot * (1 + 2*f) [we bet f*pot, opponent calls f*pot]
    // After N streets: finalPot = pot * (1+2f)^N
    // We want: sum of our bets ≈ heroStack
    // Our total bet = f*pot + f*pot*(1+2f) + f*pot*(1+2f)^2 + ...
    // = f*pot * [(1+2f)^N - 1] / (2f)
    // Set equal to heroStack and solve for f.
    //
    // Simpler approach: binary search for f that gets us approximately all-in.

    let lo = 0.20, hi = 2.00;
    for (let iter = 0; iter < 20; iter++) {
        const mid = (lo + hi) / 2;
        let totalBet = 0;
        let currentPot = potSize;
        for (let s = 0; s < streetsRemaining; s++) {
            const betAmt = currentPot * mid;
            totalBet += betAmt;
            currentPot = currentPot + betAmt * 2; // both players put in betAmt
        }
        if (totalBet < heroStack) lo = mid;
        else hi = mid;
    }

    const optimalFrac = (lo + hi) / 2;

    // Project pot sizes for each street
    const projectedPotByStreet = [];
    let currentPot = potSize;
    for (let s = 0; s < streetsRemaining; s++) {
        const betAmt = currentPot * optimalFrac;
        currentPot = currentPot + betAmt * 2;
        projectedPotByStreet.push(Math.round(currentPot));
    }

    // Check if this actually gets us close to all-in
    let totalBet = 0;
    let cp = potSize;
    for (let s = 0; s < streetsRemaining; s++) {
        totalBet += cp * optimalFrac;
        cp = cp + cp * optimalFrac * 2;
    }
    const isJammable = totalBet >= heroStack * 0.85; // Within 85% of stack = will jam

    return {
        sizeFraction: Math.max(0.25, Math.min(1.50, optimalFrac)),
        projectedPotByStreet,
        isJammable
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPLOIT-LOOP INTENSIFIER
// ═══════════════════════════════════════════════════════════════════════════
// When we have high-confidence reads on a specific opponent's leak,
// amplify the exploit. This is the "maximize EV vs known fish" module.
// With enough observed hands and clear tendencies, shift from GTO
// adjustments to pure exploitation mode.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Intensify exploitative adjustments when confidence is high.
 * @param {Object} params
 * @returns {{ action: string|null, amount: number|null, exploiting: boolean, exploit: string }}
 */
function applyExploitIntensifier(params) {
    const {
        currentAction, currentAmount, handStrength, handCategory,
        street, potSize, toCall, bb, canRaise, canCall, raiseAction,
        oppTendency, oppConfidence, oppBluffFreq, oppCallFreq, oppFoldFreq,
        isIP, heroIsAggressor, boardWetness, drawOuts, numPlayers,
        liveRead = null  // Phase 28: direct live-read access
    } = params;

    // Only engage when we have HIGH confidence reads (40+ hands observed)
    // ═══ LIVE-READ EXPLOIT GATE (Phase 28) ═══
    // With live-read, we can exploit EARLIER (lower confidence threshold)
    const liveConfident = liveRead && liveRead.confidence >= 0.30;
    const effectiveConfidence = liveConfident ? Math.max(oppConfidence, 0.50) : oppConfidence;
    if (effectiveConfidence < 0.50) return { action: null, exploiting: false, exploit: 'none' };

    const facingBet = toCall > 0;
    const multiway = numPlayers >= 3;

    // ═══ EXPLOIT 1: OVER-FOLDER ═══
    // Opponent folds > 55% → print money by betting any two cards
    // ═══ LIVE-READ OVER-FOLDER (Phase 28) ═══
    const effectiveFoldFreq = (liveConfident && liveRead.foldFreq > oppFoldFreq) ? liveRead.foldFreq : oppFoldFreq;
    if (effectiveFoldFreq > 0.55 && effectiveConfidence >= 0.55) {
        // Bluff more on every street when not facing a bet
        if (!facingBet && handStrength < 25 && canRaise && !multiway) {
            const exploitBluffFreq = 0.40 + (effectiveFoldFreq - 0.55) * 2.0; // Scales up to ~70%
            if (Math.random() < Math.min(0.70, exploitBluffFreq)) {
                // Live-read sizing: SMALLER vs folders (save chips, same fold equity)
                let sizeFrac = 0.50 + Math.random() * 0.15; // 50-65% pot
                if (liveConfident && liveRead.foldFreq > 0.60) sizeFrac = 0.38 + Math.random() * 0.10; // 38-48% pot
                console.debug(`[HorseBrain]  EXPLOIT-INTENSIFIER: over-folder bluff (foldFreq=${(oppFoldFreq * 100).toFixed(0)}%)`);
                return {
                    action: raiseAction.type,
                    amount: Math.round(potSize * sizeFrac),
                    exploiting: true, exploit: 'over_folder_bluff'
                };
            }
        }
        // Facing a bet: opponent is betting into us but usually folds → raise to test
        if (facingBet && handStrength >= 25 && handStrength < 50 && canRaise && !multiway) {
            if (Math.random() < 0.30) {
                console.debug(`[HorseBrain]  EXPLOIT-INTENSIFIER: raise vs over-folder`);
                return {
                    action: raiseAction.type,
                    amount: Math.round(toCall * 2.5),
                    exploiting: true, exploit: 'over_folder_raise'
                };
            }
        }
    }

    // ═══ EXPLOIT 2: CALLING STATION ═══
    // Opponent calls > 60% → maximize value, never bluff
    // ═══ LIVE-READ CALLING STATION (Phase 28) ═══
    const effectiveCallFreq = (liveConfident && liveRead.callFreq > oppCallFreq) ? liveRead.callFreq : oppCallFreq;
    if (effectiveCallFreq > 0.60 && effectiveConfidence >= 0.50) {
        // Value bet thinner — they call with garbage
        if (!facingBet && handStrength >= 35 && handStrength < 55 && canRaise && !multiway) {
            // ═══ Phase 42 FIX: was using raw oppCallFreq — use effectiveCallFreq so live-read data intensifies the exploit ═══
            const thinValueFreq = 0.55 + (effectiveCallFreq - 0.60) * 1.5;
            if (Math.random() < Math.min(0.80, thinValueFreq)) {
                // Size UP — they're calling anyway
                const sizeFrac = 0.65 + Math.random() * 0.20; // 65-85% pot
                console.debug(`[HorseBrain]  EXPLOIT-INTENSIFIER: thin value vs calling station (callFreq=${(oppCallFreq * 100).toFixed(0)}%)`);
                return {
                    action: raiseAction.type,
                    amount: Math.round(potSize * sizeFrac),
                    exploiting: true, exploit: 'calling_station_value'
                };
            }
        }
        // Strong hands: overbet for value
        if (!facingBet && handStrength >= 70 && canRaise) {
            const overbetFrac = 1.0 + Math.random() * 0.50; // 100-150% pot
            console.debug(`[HorseBrain]  EXPLOIT-INTENSIFIER: overbet value vs calling station`);
            return {
                action: raiseAction.type,
                amount: Math.round(potSize * overbetFrac),
                exploiting: true, exploit: 'calling_station_overbet'
            };
        }
        // NEVER bluff calling stations — check instead of betting weak hands
        // ═══ Phase 42 FIX: was checking `currentAction === 'bet' || 'raise'` but currentAction is ALWAYS null ═══
        // The exploit runs BEFORE the main decision, so we proactively return check for weak hands
        if (!facingBet && handStrength < 20 && canRaise) {
            return {
                action: 'check', amount: null,
                exploiting: true, exploit: 'calling_station_no_bluff'
            };
        }
    }

    // ═══ EXPLOIT 3: PROLIFIC BLUFFER ═══
    // Opponent bluffs > 40% → call them down light, let them hang themselves
    // ═══ LIVE-READ BLUFFER (Phase 28) ═══
    const effectiveBluffFreq = (liveConfident && liveRead.bluffRate !== null && liveRead.bluffRate > oppBluffFreq)
        ? liveRead.bluffRate : oppBluffFreq;
    if (effectiveBluffFreq > 0.40 && effectiveConfidence >= 0.50) {
        // Widen calling range dramatically
        if (facingBet && handStrength >= 20 && handStrength < 50 && canCall) {
            // ═══ Phase 42 FIX: was using raw oppBluffFreq — use effectiveBluffFreq so live-read data intensifies the exploit ═══
            const exploitCallFreq = 0.50 + (effectiveBluffFreq - 0.40) * 2.0;
            if (Math.random() < Math.min(0.75, exploitCallFreq)) {
                console.debug(`[HorseBrain]  EXPLOIT-INTENSIFIER: call down bluffer (bluffFreq=${(oppBluffFreq * 100).toFixed(0)}%)`);
                return {
                    action: 'call', amount: null,
                    exploiting: true, exploit: 'bluffer_calldown'
                };
            }
        }
        // Check-raise their bluffs with strong hands (trap)
        if (!facingBet && handStrength >= 65 && !isIP && !multiway) {
            if (Math.random() < 0.50) {
                return {
                    action: 'check', amount: null,
                    exploiting: true, exploit: 'bluffer_trap'
                };
            }
        }
    }

    // ═══ EXPLOIT 4: WEAK-TIGHT / NIT ═══
    // Opponent is weak-tight → steal everything, respect their bets
    // ═══ LIVE-READ NIT DETECTION (Phase 28) ═══
    const liveNit = liveConfident && liveRead.aggFreq < 0.18 && liveRead.foldFreq > 0.50;
    if ((oppTendency === 'weak-tight' && oppConfidence >= 0.55) || liveNit) {
        // Steal pots relentlessly
        if (!facingBet && handStrength < 30 && canRaise && !multiway) {
            let nitStealFreq = 0.45;
            // Live-read: smaller sizing vs extreme folders
            let sizeFrac = 0.55 + Math.random() * 0.15;
            if (liveConfident && liveRead.foldFreq > 0.60) {
                nitStealFreq = 0.55; // Steal even more
                sizeFrac = 0.40 + Math.random() * 0.10; // Cheaper steals
            }
            if (Math.random() < nitStealFreq) {
                console.debug(`[HorseBrain]  EXPLOIT-INTENSIFIER: steal vs nit`);
                return {
                    action: raiseAction.type,
                    amount: Math.round(potSize * sizeFrac),
                    exploiting: true, exploit: 'nit_steal'
                };
            }
        }
        // When they bet, RESPECT it (nits only bet with strong hands)
        const nitBetToPot = toCall / Math.max(1, potSize);
        // ═══ Phase 42 FIX: removed redundant inner if (was identical to outer condition) ═══
        if (facingBet && handStrength < 60 && nitBetToPot >= 0.50) {
            return {
                action: 'fold', amount: null,
                exploiting: true, exploit: 'nit_respect'
            };
        }
    }

    // ═══ EXPLOIT 5: ONE-AND-DONE (Live-Read Exclusive) ═══
    // Opponent c-bets high but rarely double-barrels → call flop, steal turn
    if (liveConfident && liveRead.cBetPct !== null && liveRead.cBetPct > 0.60 &&
        liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.30) {
        // On the flop facing a c-bet: always call with anything (they'll give up on turn)
        if (facingBet && street === 'flop' && handStrength >= 10 && canCall && !multiway) {
            if (Math.random() < 0.65) {
                console.debug(`[HorseBrain]  EXPLOIT-INTENSIFIER: one-and-done float (cbet=${(liveRead.cBetPct * 100).toFixed(0)}% barrel=${(liveRead.secondBarrelPct * 100).toFixed(0)}%)`);
                return {
                    action: 'call', amount: null,
                    exploiting: true, exploit: 'one_and_done_float'
                };
            }
        }
        // On the turn when they checked: stab to take the pot
        if (!facingBet && street === 'turn' && canRaise && !multiway && handStrength < 40) {
            if (Math.random() < 0.55) {
                const sizeFrac = 0.45 + Math.random() * 0.10;
                console.debug(`[HorseBrain]  EXPLOIT-INTENSIFIER: one-and-done stab (cbet=${(liveRead.cBetPct * 100).toFixed(0)}% barrel=${(liveRead.secondBarrelPct * 100).toFixed(0)}%)`);
                return {
                    action: raiseAction.type,
                    amount: Math.round(potSize * sizeFrac),
                    exploiting: true, exploit: 'one_and_done_stab'
                };
            }
        }
    }

    return { action: null, exploiting: false, exploit: 'none' };
}

// ═══════════════════════════════════════════════════════════════════════════
// DONK BET DETECTION & EXPLOITATION
// ═══════════════════════════════════════════════════════════════════════════
// A "donk bet" is when a player bets into the preflop aggressor (PFA) on
// the flop. This is typically a weak/unbalanced play by recreational players.
// The PFA should exploit this by:
//   1. Raising with strong hands (punish the imbalanced range)
//   2. Calling with draws + medium hands (they're usually weak)
//   3. Folding garbage (donk bets still have some equity)
// At higher levels, donk bets can be balanced — calibrate by opponent reads.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect and respond to a donk bet scenario.
 * @param {Object} params
 * @returns {Object|null} { type, amount? } or null if not a donk bet
 */
function handleDonkBet(params) {
    if (!params || typeof params !== 'object') return null; // Bug #76: null params crashes destructuring
    const {
        heroIsAggressor, street, facingBet, handStrength, handCategory,
        drawOuts, position, potSize, toCall, bb, canRaise, canCall,
        raiseAction, aggressionBias, oppTendency, oppConfidence,
        oppCallFreq, boardWetness, numPlayers,
        // ═══ LIVE-READ DATA (Phase 17) ═══
        liveRead, tableId, primaryOppId
    } = params;

    // Only applies when: hero was PFA, we're on flop/turn, and opponent bet into us
    if (!heroIsAggressor || !facingBet || street === 'preflop' || street === 'river') return null;

    const betToPot = toCall / Math.max(1, potSize);
    const isIP = new Set(['BTN', 'CO', 'HJ']).has(position);
    const multiway = numPlayers >= 3;

    // ═══ LIVE-READ DONK BET PROFILING ═══
    // Extract live donk-bet frequency and opponent tendencies
    let liveDonkFreq = null;    // How often this opponent donk bets (null = unknown)
    let liveFoldToRaise = null; // How often they fold when raised
    let liveCallFreq = null;    // Live call frequency
    let liveDonkConf = 0;       // Confidence in live data
    let donkTimingTell = 'unknown';

    if (liveRead && liveRead.confidence >= 0.15) {
        liveDonkConf = liveRead.confidence;
        liveDonkFreq = liveRead.donkBetPct ?? null;
        liveFoldToRaise = liveRead.foldToRaisePct ?? null;
        liveCallFreq = liveRead.callFreq ?? null;

        // Timing tell on the donk bet itself
        if (liveRead.inHandActions && liveRead.inHandActions.lastAction) {
            const lastAct = liveRead.inHandActions.lastAction;
            if (lastAct.timing && lastAct.action === 'bet') {
                const streetAvg = liveRead.timingProfile?.[street]?.avgMs || liveRead.avgDecisionMs;
                if (streetAvg && streetAvg > 0) {
                    const ratio = lastAct.timing / streetAvg;
                    if (ratio < 0.40) donkTimingTell = 'snap_donk';       // Snap donk = usually weak/automatic
                    else if (ratio > 2.0) donkTimingTell = 'tank_donk';   // Tank donk = strong or tough spot
                    else if (ratio > 1.3) donkTimingTell = 'deliberate_donk'; // Thought about it = balanced
                }
            }
        }
    }

    // ═══ DONK FREQUENCY EXPLOITATION ═══
    // Players who donk frequently have weak, unbalanced ranges → raise more
    // Players who donk rarely have strong, value-heavy ranges → respect it more
    let liveRaiseBoost = 0;
    let liveSizeMod = 1.0;

    if (liveDonkFreq !== null && liveDonkConf >= 0.20) {
        if (liveDonkFreq > 0.30) {
            liveRaiseBoost += 0.12;  // Frequent donk bettor = weak range → raise more
            liveSizeMod = 1.10;      // Size up slightly
        } else if (liveDonkFreq > 0.20) {
            liveRaiseBoost += 0.06;  // Moderate donk frequency
        } else if (liveDonkFreq < 0.08) {
            liveRaiseBoost -= 0.10;  // Rare donk bettor = they have it → respect
            liveSizeMod = 0.90;
        }
    }

    // Fold-to-raise exploitation
    if (liveFoldToRaise !== null && liveDonkConf >= 0.20) {
        if (liveFoldToRaise > 0.60) liveRaiseBoost += 0.10;  // They donk-fold often → bluff raise more
        if (liveFoldToRaise < 0.25) liveRaiseBoost -= 0.08;  // They donk-call/raise → respect
    }

    // Timing tell exploitation
    if (donkTimingTell === 'snap_donk') {
        liveRaiseBoost += 0.08;  // Snap donk = weak/automatic → raise more
        liveSizeMod *= 1.05;
    } else if (donkTimingTell === 'tank_donk') {
        liveRaiseBoost -= 0.06;  // Tank donk = they thought hard → may be strong
    }

    // ═══ VS DONK BET STRATEGY ═══

    // RAISE: Strong hands — punish the donk bet range (they're usually weak)
    if (handStrength >= 70 && canRaise) {
        let raiseFreq = 0.65;
        // Raise more in position (we have info advantage)
        if (isIP) raiseFreq += 0.10;
        // Live-read frequency boost
        raiseFreq += liveRaiseBoost;
        raiseFreq = Math.max(0.40, Math.min(0.90, raiseFreq));
        // Against weak-tight opponents, raise bigger (they fold)
        let raiseMult = (oppTendency === 'weak-tight' && oppConfidence > 0.3) ? 3.0 : 2.5;
        raiseMult *= liveSizeMod;
        // Live call freq: size up vs stations
        if (liveCallFreq !== null && liveCallFreq > 0.55) raiseMult = Math.min(3.5, raiseMult * 1.10);
        raiseMult = Math.max(2.0, Math.min(4.0, raiseMult));
        if (Math.random() < raiseFreq) {
            const raiseSize = Math.round(toCall * raiseMult);
            const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            console.debug(`[HorseBrain]  DONK BET RAISE: str=${handStrength} liveBoost=${liveRaiseBoost.toFixed(2)} timing=${donkTimingTell}`);
            return { type: raiseAction.type, amount: clamped };
        }
        // Slowplay some monsters by just calling
        return { type: 'call' };
    }

    // RAISE: Strong draws — semi-bluff raise the donk (fold equity + equity)
    if (drawOuts >= 9 && canRaise && !multiway) {
        let semiFreq = 0.35 + aggressionBias / 40;
        semiFreq += liveRaiseBoost * 0.70; // Dampened for semi-bluffs
        semiFreq = Math.max(0.10, Math.min(0.65, semiFreq));
        if (Math.random() < semiFreq) {
            let raiseSize = Math.round(toCall * 2.5 * liveSizeMod);
            const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            console.debug(`[HorseBrain]  DONK BET SEMI-BLUFF RAISE: ${drawOuts} outs liveBoost=${liveRaiseBoost.toFixed(2)}`);
            return { type: raiseAction.type, amount: clamped };
        }
    }

    // RAISE: Bluff raise small donk bets (< 35% pot) — they're often weak probes
    if (betToPot <= 0.35 && handStrength >= 25 && canRaise && !multiway) {
        let bluffRaiseFreq = 0.22 + aggressionBias / 50;
        // Bluff raise more against known weak donk bettors
        if (oppTendency === 'weak-tight' && oppConfidence > 0.3) bluffRaiseFreq += 0.12;
        if (oppCallFreq > 0.60 && oppConfidence > 0.3) bluffRaiseFreq = 0; // Don't bluff callers
        // Live-read bluff raise adjustments
        bluffRaiseFreq += liveRaiseBoost * 0.80; // Dampened for bluffs
        // Live data override: if they donk-fold a lot, bluff raise even medium donks
        if (liveFoldToRaise !== null && liveFoldToRaise > 0.60 && liveDonkConf >= 0.25) {
            bluffRaiseFreq += 0.10; // They donk-fold = free money
        }
        // Snap donk + high fold-to-raise = prime bluff raise spot
        if (donkTimingTell === 'snap_donk' && liveFoldToRaise !== null && liveFoldToRaise > 0.50) {
            bluffRaiseFreq += 0.08;
        }
        // But NEVER bluff callers even with live data
        if (liveCallFreq !== null && liveCallFreq > 0.60) bluffRaiseFreq = 0;
        bluffRaiseFreq = Math.max(0, Math.min(0.45, bluffRaiseFreq));
        if (Math.random() < bluffRaiseFreq) {
            const raiseSize = Math.round(toCall * 2.8 * liveSizeMod);
            const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            console.debug(`[HorseBrain]  DONK BET BLUFF RAISE: ${Math.round(betToPot * 100)}%pot liveFTR=${liveFoldToRaise?.toFixed(2) ?? '?'} timing=${donkTimingTell}`);
            return { type: raiseAction.type, amount: clamped };
        }
    }

    // CALL: Medium hands — donk bets are usually weak, our medium hands have showdown value
    if (handStrength >= 30 && canCall) {
        // ═══ Phase 39C FIX: both branches returned null (dead code). Now differentiated: ═══
        // Against large donk bets (>75% pot), only call with stronger hands
        if (betToPot >= 0.75 && handStrength < 50) {
            // Live data: rare donk bettor using large sizing → they REALLY have it → defer (likely fold)
            if (liveDonkFreq !== null && liveDonkFreq < 0.10 && liveDonkConf >= 0.20) return null;
            // Non-rare donk bettor: large donks are often weak stabs → still call with 40+
            if (handStrength >= 40) return { type: 'call' };
            return null; // Below 40 with large donk → defer to main logic
        }
        // Tank donk + rare donk bettor = strong → be cautious with marginal hands
        if (donkTimingTell === 'tank_donk' && handStrength < 45 && liveDonkFreq !== null && liveDonkFreq < 0.15) {
            return null; // Let normal logic handle (may fold)
        }
        return { type: 'call' };
    }

    // Draws with pot odds
    if (drawOuts >= 5 && canCall) {
        const drawEquity = drawOuts * (street === 'flop' ? 4 : 2) / 100;
        const potOdds = toCall / (potSize + toCall);
        // Live data: if they donk-fold often, implied odds increase (we can raise later)
        const impliedOddsBonus = (liveFoldToRaise !== null && liveFoldToRaise > 0.50) ? 0.03 : 0;
        if (drawEquity >= potOdds - 0.05 - impliedOddsBonus) return { type: 'call' };
    }

    return null; // Fall through to normal logic
}

// ═══════════════════════════════════════════════════════════════════════════
// TILT-DRIVEN DECISION QUALITY DEGRADATION
// ═══════════════════════════════════════════════════════════════════════════
// Tilted horses should make measurable mistakes proportional to their tilt
// level. This makes them more realistic and exploitable by skilled humans.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply tilt-induced decision errors.
 * @param {string} action - Current best action
 * @param {number|null} amount - Current bet/raise amount
 * @param {number} tiltLevel - 0-10 scale (0=calm, 10=max tilt)
 * @param {number} handStrength - 0-100
 * @param {Object} legalActions - Available actions
 * @param {number} potSize - Current pot
 * @param {number} aggressionBias - Personality aggression
 * @returns {{ action: string, amount: number|null, wasTilted: boolean }}
 */
function applyTiltDegradation(action, amount, tiltLevel, handStrength, legalActions, potSize, aggressionBias) {
    if (!Array.isArray(legalActions)) legalActions = []; // Bug #54: guard non-array legalActions
    if (tiltLevel < 2) return { action, amount, wasTilted: false }; // Calm — no errors

    const tiltFrac = Math.min(1.0, tiltLevel / 10); // 0-1 scale
    const errorChance = tiltFrac * 0.40; // Max 40% chance of error at max tilt

    if (Math.random() > errorChance) return { action, amount, wasTilted: false }; // No error this hand

    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const canCall = legalActions.some(a => a.type === 'call');
    const canCheck = legalActions.some(a => a.type === 'check');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');

    // ═══ TILT ERROR TYPES (weighted by tilt level) ═══

    // ERROR 1: Overcalling — call when should fold (most common tilt mistake)
    // "I'm not folding, I'm getting my money back"
    if (action === 'fold' && tiltLevel >= 3) {
        if (canCall && Math.random() < 0.50) {
            console.debug(`[HorseBrain]  TILT OVERCALL: should fold but calling (tilt=${tiltLevel.toFixed(1)})`);
            return { action: 'call', amount: null, wasTilted: true };
        }
    }

    // ERROR 2: Spew raise — raise when should call or check (aggression leak)
    // "I'll just raise and take it down"
    if ((action === 'call' || action === 'check') && tiltLevel >= 4 && canRaise && raiseAction) {
        if (Math.random() < 0.35) {
            const spewSize = Math.round(potSize * (0.60 + Math.random() * 0.40)); // 60-100% pot
            const clamped = Math.max(raiseAction.minAmount || 1, Math.min(spewSize, raiseAction.maxAmount || spewSize));
            console.debug(`[HorseBrain]  TILT SPEW: raising ${clamped} instead of ${action} (tilt=${tiltLevel.toFixed(1)})`);
            return { action: raiseAction.type, amount: clamped, wasTilted: true };
        }
    }

    // ERROR 3: Overbet jam — go all-in with mediocre hands (desperation)
    // "Screw it, all in"
    if (tiltLevel >= 7 && handStrength >= 30 && handStrength < 60 && canRaise) {
        if (Math.random() < 0.20) {
            console.debug(`[HorseBrain]  TILT JAM: all-in with str=${handStrength} (tilt=${tiltLevel.toFixed(1)})`);
            return { action: 'all_in', amount: null, wasTilted: true };
        }
    }

    // ERROR 4: Oversizing — bet too big for the situation
    // "I want to punish them"
    if ((action === 'raise' || action === 'bet') && amount && tiltLevel >= 3) {
        const tiltSizeMultiplier = 1.0 + tiltFrac * 0.60; // Up to 1.6x the normal size
        const tiltedAmount = Math.round(amount * tiltSizeMultiplier);
        if (raiseAction) {
            const clamped = Math.min(tiltedAmount, raiseAction.maxAmount || tiltedAmount);
            console.debug(`[HorseBrain]  TILT OVERSIZE: ${amount}→${clamped} (tilt=${tiltLevel.toFixed(1)})`);
            return { action, amount: clamped, wasTilted: true };
        }
    }

    // ERROR 5: Give up too easily — fold when should fight (after big loss)
    // "I can't win anything today"
    if (action === 'call' && tiltLevel >= 5 && handStrength < 40 && aggressionBias < 0) {
        if (Math.random() < 0.25) {
            console.debug(`[HorseBrain]  TILT GIVE-UP: folding marginal (tilt=${tiltLevel.toFixed(1)})`);
            return { action: canCheck ? 'check' : 'fold', amount: null, wasTilted: true };
        }
    }

    return { action, amount, wasTilted: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6: ADVANCED NLHE STRATEGY EXPANSION
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// BLIND vs BLIND BATTLE STRATEGY
// ─────────────────────────────────────────────────────────────────────────

/**
 * SB vs BB blind battle strategy — the MOST common heads-up confrontation.
 *
 * Blind battles are fundamentally different from other preflop spots:
 *   - SB has position advantage preflop (acts last in blinds) but OOP postflop
 *   - Ranges are MUCH wider (both players have already invested dead money)
 *   - SB should open 60-80% of hands depending on opponent's defend frequency
 *   - BB should defend 50-65% of hands to prevent SB from printing money
 *   - 3-bets from BB are primarily for VALUE in blind battles (not as bluffs)
 *   - Limp strategy: SB limping is valid in blind battles (mixed strategy)
 *
 * Key concept: Blind battles are a SEPARATE game from regular play.
 * The Horse must understand that hand values shift dramatically when only
 * two players are contesting the pot with wide ranges.
 *
 * CRITICAL FOR HORSES: Top pair with a good kicker is a STRONG hand in
 * blind battles. Don't overfold — your opponent is also playing wide.
 *
 * @param {string} position - 'SB' or 'BB'
 * @param {number} handStrength - Adjusted hand strength (0-100)
 * @param {number} toCall - Amount to call
 * @param {number} bb - Big blind size
 * @param {number} stackBB - Stack in big blinds
 * @param {number} aggressionBias - Horse personality aggression (-10 to +18)
 * @param {Object} oppRead - Optional opponent tendencies { foldToStealPct, threeBetPct, bbDefendPct }
 * @returns {{ action: string, sizing: number, reasoning: string, frequency: number }}
 */
function getBlindBattleStrategy(position, handStrength, toCall, bb, stackBB, aggressionBias, oppRead) {
    const result = { action: 'fold', sizing: 0, reasoning: '', frequency: 1.0 };
    const opp = oppRead || {};

    if (position === 'SB') {
        // ── SB STRATEGY: Open-raise vs Limp vs Fold ──

        // Short stack SB: push/fold
        if (stackBB <= 10) {
            if (handStrength >= 30) {
                result.action = 'all-in';
                result.reasoning = 'sb-short-stack-shove';
                return result;
            }
            result.reasoning = 'sb-short-stack-fold';
            return result;
        }

        // SB open-raise threshold: very wide by default (60-80%)
        let openThreshold = 35; // ~65% of hands
        // Against tight BB defenders, steal even wider
        if (opp.bbDefendPct !== undefined && opp.bbDefendPct < 0.40) {
            openThreshold -= 8; // They fold too much — steal the blind
        }
        // Against aggressive 3-bet BB, tighten up
        if (opp.threeBetPct !== undefined && opp.threeBetPct > 0.14) {
            openThreshold += 10; // They 3-bet a lot — fold weak opens
        }
        // Aggressive horses open wider
        openThreshold -= aggressionBias / 3;
        openThreshold = Math.max(15, Math.min(65, openThreshold));

        if (handStrength >= 80) {
            // Premium: raise for value
            result.action = 'raise';
            result.sizing = Math.round(bb * 2.5);
            result.reasoning = 'sb-premium-open';
            return result;
        }
        if (handStrength >= openThreshold) {
            // Standard open: 2.5x is standard SB open size
            // SB limp strategy: limp 20-30% of opening range with medium hands
            const limpFreq = handStrength < openThreshold + 15 ? 0.30 : 0.0;
            if (Math.random() < limpFreq) {
                result.action = 'limp';
                result.sizing = bb;
                result.reasoning = 'sb-limp-balanced';
                result.frequency = limpFreq;
                return result;
            }
            result.action = 'raise';
            result.sizing = Math.round(bb * 2.5);
            result.reasoning = 'sb-standard-open';
            return result;
        }
        result.reasoning = 'sb-trash-fold';
        return result;
    }

    // ── BB STRATEGY: Defend vs 3-bet vs Fold ──

    if (position === 'BB') {
        // BB is already invested 1 BB — need to defend wide to prevent exploitation

        // Facing a raise (standard 2-3x from SB)
        const raiseSize = toCall / bb;

        if (raiseSize <= 3) {
            // Standard SB open: defend WIDE (50-65% of hands)
            let defendThreshold = 32; // ~68% defend

            // Against frequent SB stealers, defend even wider
            if (opp.foldToStealPct !== undefined) {
                // foldToStealPct here means their OPEN frequency (higher = more steals)
                if (opp.foldToStealPct < 0.30) {
                    // SB is very aggressive, but foldToStealPct < 0.30 means they fold often...
                    // Actually this should be their SB open frequency, not fold-to-steal
                    defendThreshold -= 3;
                }
            }

            // 3-bet from BB: primarily for value but some bluffs
            let threeBetThreshold = 72; // Top 28% of hands
            // Against tight SB opener, 3-bet less (they have it)
            // Against wide SB opener, 3-bet more (punish them)

            if (handStrength >= threeBetThreshold) {
                result.action = '3bet';
                result.sizing = Math.round(toCall * 3.2);
                result.reasoning = 'bb-3bet-value';
                return result;
            }
            // 3-bet bluff with suited connectors occasionally
            if (handStrength >= 35 && handStrength < 50 && Math.random() < 0.15 + aggressionBias / 50) {
                result.action = '3bet';
                result.sizing = Math.round(toCall * 3.2);
                result.reasoning = 'bb-3bet-bluff';
                result.frequency = 0.15;
                return result;
            }
            if (handStrength >= defendThreshold) {
                result.action = 'call';
                result.reasoning = 'bb-defend';
                return result;
            }
            result.reasoning = 'bb-fold-to-steal';
            return result;
        }

        // Facing a 3-bet or larger raise
        if (raiseSize > 3 && raiseSize <= 10) {
            if (handStrength >= 85) {
                result.action = '4bet';
                result.sizing = Math.round(toCall * 2.5);
                result.reasoning = 'bb-4bet-premium';
                return result;
            }
            if (handStrength >= 65) {
                result.action = 'call';
                result.reasoning = 'bb-call-3bet';
                return result;
            }
            result.reasoning = 'bb-fold-to-3bet';
            return result;
        }

        // Facing 4-bet+
        if (handStrength >= 90) {
            result.action = 'all-in';
            result.reasoning = 'bb-jam-vs-4bet';
            return result;
        }
        result.reasoning = 'bb-fold-to-4bet';
        return result;
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────
// BLOCKER AWARENESS (HOLD'EM SPECIFIC)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Evaluate blocker effects for NLHE.
 *
 * Blockers in Hold'em are subtler than in PLO but still CRITICAL:
 *
 *   - Holding an Ace blocks AA, AK, AQ (opponent has fewer premiums)
 *   - Holding a King blocks KK, AK
 *   - Holding a card of the board's flush suit blocks flush completions
 *   - Holding a card that completes a straight blocks opponent's straights
 *
 * WHEN BLOCKERS MATTER MOST:
 *   1. River bluffs: Having the Ace of the flush suit when a flush completed
 *      means opponent is LESS likely to have a flush — great bluff candidate
 *   2. 3-bet/4-bet bluffs: Holding an Ace blocks AA, AK — makes bluffs
 *      more profitable since opponent folds AK more often
 *   3. Calling river bets: Holding a card that blocks the nuts means
 *      opponent's range shifts toward bluffs — better calling spot
 *
 * WHEN BLOCKERS DON'T MATTER:
 *   - On the flop with many cards to come (too many possibilities)
 *   - In multiway pots (too many opponents to block effectively)
 *   - When the board is very dry (few combinatoric effects)
 *
 * @param {string[]} holeCards - 2 hole cards ['Ah', 'Kd']
 * @param {string[]} boardCards - Community cards
 * @param {string} street - 'flop', 'turn', 'river'
 * @returns {Object} Blocker analysis
 */
function getHoldemBlockerAnalysis(holeCards, boardCards, street) {
    const result = {
        blocksNutFlush: false,
        blocksSecondNutFlush: false,
        blocksNutStraight: false,
        blocksTopSet: false,
        blocksOverpair: false,
        bluffCandidateScore: 0,   // 0-100: how good for bluffing
        calldownBonus: 0,         // 0-30: how much to boost call threshold
        reasoning: [],
    };

    if (!holeCards || holeCards.length < 2 || !boardCards || boardCards.length < 3) return result;

    const hRanks = holeCards.map(c => RANKS.indexOf(c[0]));
    const hSuits = holeCards.map(c => c[1]);
    const bRanks = boardCards.map(c => RANKS.indexOf(c[0]));
    const bSuits = boardCards.map(c => c[1]);

    // ── Flush blocker analysis ──
    const suitCounts = {};
    bSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const flushSuit = Object.entries(suitCounts || {}).find(([, c]) => c >= 3);

    if (flushSuit) {
        const [suit] = flushSuit;
        // Do we hold the Ace of the flush suit?
        const hasAceOfSuit = holeCards.some(c => c[0] === 'A' && c[1] === suit);
        const hasKingOfSuit = holeCards.some(c => c[0] === 'K' && c[1] === suit);

        if (hasAceOfSuit) {
            result.blocksNutFlush = true;
            result.bluffCandidateScore += 35;
            result.calldownBonus += 12;
            result.reasoning.push('blocks-nut-flush');
        }
        if (hasKingOfSuit) {
            result.blocksSecondNutFlush = true;
            result.bluffCandidateScore += 15;
            result.calldownBonus += 6;
            result.reasoning.push('blocks-2nd-nut-flush');
        }
    }

    // ── Straight blocker analysis ──
    // Check if holding cards that complete the nut straight on this board
    const sortedBoard = [...bRanks].sort((a, b) => b - a);
    // Find what ranks would make a straight on this board
    for (let high = 12; high >= 4; high--) {
        const needed = [high, high - 1, high - 2, high - 3, high - 4];
        const boardHas = needed.filter(r => bRanks.includes(r));
        const holeHas = needed.filter(r => hRanks.includes(r));
        if (boardHas.length >= 3 && holeHas.length >= 1) {
            // We hold a card that could complete this straight
            // That means opponents are LESS likely to have it
            result.blocksNutStraight = true;
            result.bluffCandidateScore += 10;
            result.calldownBonus += 4;
            result.reasoning.push('blocks-straight');
            break;
        }
    }

    // ── Top set / overpair blocker analysis ──
    const topBoardRank = Math.max(...bRanks);
    if (hRanks.includes(topBoardRank)) {
        result.blocksTopSet = true;
        result.calldownBonus += 8;
        result.reasoning.push('blocks-top-set');
    }
    // Holding a high pocket pair blocks opponent's overpairs
    if (hRanks[0] === hRanks[1] || (hRanks[0] > topBoardRank && hRanks[1] > topBoardRank)) {
        result.blocksOverpair = true;
        result.calldownBonus += 5;
        result.reasoning.push('blocks-overpair');
    }

    // ── River-specific bluff scoring boost ──
    if (street === 'river') {
        result.bluffCandidateScore = Math.round(result.bluffCandidateScore * 1.5);
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────
// THIN VALUE BETTING & BLUFF CATCHING
// ─────────────────────────────────────────────────────────────────────────

/**
 * Thin value betting strategy — extracting value from marginal hands.
 *
 * This is THE skill that separates winning players from losing players.
 * The concept: bet a hand that is ahead of MORE THAN HALF of your opponent's
 * calling range. If you bet and get called by worse hands more than 50% of
 * the time, it's a profitable thin value bet.
 *
 * KEY NLHE THIN VALUE SPOTS:
 *   - Top pair good kicker on a dry board (bet 50-60% pot)
 *   - Two pair on a board with few draws (bet 55-70% pot)
 *   - Overpair on a low board (bet 60-75% pot)
 *   - Second pair with top kicker on a very dry board (bet 35-45% pot)
 *
 * WHEN NOT TO THIN VALUE BET:
 *   - Wet boards where opponent's calling range is draw-heavy
 *   - Against aggressive opponents who will raise your thin value
 *   - Multiway pots (someone likely has you beat)
 *   - When your hand blocks opponent's calling range (reduces value)
 *
 * @param {number} handStrength - 0-100 hand strength
 * @param {string} boardWetness - 'dry', 'medium', 'wet'
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {number} potSize - Current pot
 * @param {number} numPlayers - Active players
 * @param {boolean} isIP - In position?
 * @param {number} aggressionBias - Horse personality
 * @param {Object} oppRead - Optional { isStation, isAggressive, foldToCBet }
 * @returns {{ shouldThinValue: boolean, betSize: number, reasoning: string }}
 */
function getThinValueStrategy(handStrength, boardWetness, street, potSize, numPlayers, isIP, aggressionBias, oppRead) {
    const opp = oppRead || {};

    // Can't thin value multiway (too many hands out there)
    if (numPlayers > 2) {
        if (handStrength < 72) {
            return { shouldThinValue: false, betSize: 0, reasoning: 'multiway-too-risky' };
        }
        // Even multiway, nut hands should value bet
        return {
            shouldThinValue: true,
            betSize: Math.round(potSize * 0.55),
            reasoning: 'multiway-strong-value'
        };
    }

    // ── RIVER thin value (most critical spot) ──
    if (street === 'river') {
        // Dry board: thin value wider (opponent has fewer strong hands)
        if (boardWetness === 'dry') {
            if (handStrength >= 50 && isIP) {
                let sizeFraction = 0.50;
                if (handStrength >= 70) sizeFraction = 0.65;
                if (handStrength >= 85) sizeFraction = 0.80;
                // Against calling stations: bet larger (they call with worse)
                if (opp.isStation) sizeFraction += 0.10;
                return {
                    shouldThinValue: true,
                    betSize: Math.round(potSize * sizeFraction),
                    reasoning: 'river-dry-thin-value'
                };
            }
            if (handStrength >= 55) {
                // OOP thin value — smaller (risk of raise)
                return {
                    shouldThinValue: true,
                    betSize: Math.round(potSize * 0.40),
                    reasoning: 'river-dry-oop-thin-value'
                };
            }
        }
        // Wet board: need stronger hand to thin value
        if (boardWetness === 'wet') {
            if (handStrength >= 68 && isIP) {
                return {
                    shouldThinValue: true,
                    betSize: Math.round(potSize * 0.55),
                    reasoning: 'river-wet-value'
                };
            }
            return { shouldThinValue: false, betSize: 0, reasoning: 'river-wet-check-back' };
        }
        // Medium board
        if (handStrength >= 58 && isIP) {
            return {
                shouldThinValue: true,
                betSize: Math.round(potSize * 0.50),
                reasoning: 'river-medium-thin-value'
            };
        }
        return { shouldThinValue: false, betSize: 0, reasoning: 'river-default-check' };
    }

    // ── TURN thin value ──
    if (street === 'turn') {
        if (handStrength >= 55 && boardWetness !== 'wet') {
            let sizeFraction = handStrength >= 75 ? 0.65 : 0.50;
            if (opp.isStation) sizeFraction += 0.08;
            return {
                shouldThinValue: true,
                betSize: Math.round(potSize * sizeFraction),
                reasoning: 'turn-thin-value'
            };
        }
        if (handStrength >= 62) {
            return {
                shouldThinValue: true,
                betSize: Math.round(potSize * 0.50),
                reasoning: 'turn-standard-value'
            };
        }
        return { shouldThinValue: false, betSize: 0, reasoning: 'turn-check' };
    }

    // ── FLOP thin value ──
    if (handStrength >= 52) {
        let sizeFraction = boardWetness === 'dry' ? 0.40 : 0.55;
        if (handStrength >= 75) sizeFraction += 0.10;
        return {
            shouldThinValue: true,
            betSize: Math.round(potSize * sizeFraction),
            reasoning: 'flop-value'
        };
    }
    return { shouldThinValue: false, betSize: 0, reasoning: 'flop-check' };
}

/**
 * Bluff catching strategy — when to call down with marginal hands.
 *
 * Bluff catching is the DEFENSIVE counterpart to thin value betting.
 * The concept: call with a hand that beats bluffs but loses to value.
 *
 * WHEN TO BLUFF CATCH:
 *   - You have a hand that beats bluffs (second pair+, Ace-high on some boards)
 *   - The pot odds justify a call given opponent's bluff frequency
 *   - You have good blockers (reduce opponent's value combos)
 *   - Board favors your range (you'd have strong hands in this spot)
 *
 * WHEN NOT TO BLUFF CATCH:
 *   - You have no showdown value (fold and save chips)
 *   - Opponent is a nit/tight player (rarely bluffs — just fold)
 *   - Multiway (at least one person has a real hand)
 *   - Board is monotone/four-to-a-straight and you don't block the nuts
 *
 * THE GOLDEN RULE: You need to catch bluffs with the right FREQUENCY,
 * not just the right hands. If opponent bets 75% pot, you need to call
 * ~36% of your range. If you only call with the nuts, opponent exploits
 * you by bluffing every time.
 *
 * @param {number} handStrength - 0-100
 * @param {number} potSize - Current pot
 * @param {number} facingBet - Size of bet to call
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {number} numPlayers - Active players
 * @param {Object} blockerInfo - From getHoldemBlockerAnalysis
 * @param {Object} oppRead - { isAggressive, bluffFrequency, isNit }
 * @returns {{ shouldCall: boolean, reasoning: string, neededBluffFreq: number }}
 */
function getBluffCatchStrategy(handStrength, potSize, facingBet, street, numPlayers, blockerInfo, oppRead) {
    const opp = oppRead || {};
    const blocker = blockerInfo || { calldownBonus: 0, bluffCandidateScore: 0 };

    // Never bluff catch multiway (someone has it)
    if (numPlayers > 2) {
        if (handStrength >= 72) return { shouldCall: true, reasoning: 'multiway-strong-call', neededBluffFreq: 0 };
        return { shouldCall: false, reasoning: 'multiway-fold', neededBluffFreq: 0 };
    }

    // Calculate pot odds
    const potOdds = facingBet / (potSize + facingBet);
    const neededBluffFreq = potOdds; // Opponent must bluff this often for call to break even

    // Against nits: they rarely bluff — don't call light
    if (opp.isNit) {
        if (handStrength >= 75 + blocker.calldownBonus) {
            return { shouldCall: true, reasoning: 'call-vs-nit-strong', neededBluffFreq };
        }
        return { shouldCall: false, reasoning: 'fold-vs-nit', neededBluffFreq };
    }

    // River bluff catching (most important spot)
    if (street === 'river') {
        const adjustedStrength = handStrength + blocker.calldownBonus;

        // Small bet (<40% pot): call wider (getting great odds)
        if (facingBet <= potSize * 0.40) {
            if (adjustedStrength >= 35) {
                return { shouldCall: true, reasoning: 'river-small-bet-bluff-catch', neededBluffFreq };
            }
        }
        // Medium bet (40-70% pot): need decent hand
        if (facingBet <= potSize * 0.70) {
            if (adjustedStrength >= 45) {
                return { shouldCall: true, reasoning: 'river-medium-bet-bluff-catch', neededBluffFreq };
            }
        }
        // Large bet (70-100% pot): need solid hand or great blockers
        if (facingBet <= potSize) {
            if (adjustedStrength >= 55) {
                return { shouldCall: true, reasoning: 'river-large-bet-call', neededBluffFreq };
            }
            if (blocker.calldownBonus >= 15 && adjustedStrength >= 40) {
                return { shouldCall: true, reasoning: 'river-blocker-bluff-catch', neededBluffFreq };
            }
        }
        // Overbet (>pot): only call with strong hands
        if (adjustedStrength >= 65) {
            return { shouldCall: true, reasoning: 'river-overbet-call', neededBluffFreq };
        }
        return { shouldCall: false, reasoning: 'river-fold', neededBluffFreq };
    }

    // Turn/flop bluff catching: more lenient (cards still to come)
    const adjustedStrength = handStrength + blocker.calldownBonus;
    if (facingBet <= potSize * 0.50 && adjustedStrength >= 38) {
        return { shouldCall: true, reasoning: `${street}-cheap-bluff-catch`, neededBluffFreq };
    }
    if (adjustedStrength >= 50) {
        return { shouldCall: true, reasoning: `${street}-standard-call`, neededBluffFreq };
    }
    return { shouldCall: false, reasoning: `${street}-fold`, neededBluffFreq };
}

// ─────────────────────────────────────────────────────────────────────────
// POT ODDS & IMPLIED ODDS CALCULATOR
// ─────────────────────────────────────────────────────────────────────────

/**
 * Complete pot odds and implied odds analysis.
 *
 * POT ODDS: The ratio of what you need to call vs what's in the pot.
 * If pot is 100 and bet is 50, you need 50/(100+50) = 33% equity to call.
 *
 * IMPLIED ODDS: Additional money you expect to win on later streets.
 * A flush draw with 9 outs has ~36% equity on the flop (2 cards to come).
 * If you're getting 25% pot odds but expect to win 2x pot when you hit,
 * implied odds make this a profitable call.
 *
 * REVERSE IMPLIED ODDS: Money you'll LOSE when you make your hand but
 * opponent has a better hand. Making a non-nut flush is dangerous if
 * opponent has the nut flush draw — you'll lose a big pot.
 *
 * CRITICAL FOR HORSES: Implied odds are BIGGER with:
 *   - Deeper stacks (more money behind to win)
 *   - Position (can control pot size on later streets)
 *   - Hidden hands (opponent won't see your flush coming)
 *   - Aggressive opponents (they'll put money in when you hit)
 *
 * Implied odds are SMALLER with:
 *   - Short stacks (not much more to win)
 *   - Obvious draws (opponent won't pay off a 4-flush board)
 *   - Passive opponents (they won't bet when you hit)
 *   - Multiway pots (someone else may have a better draw)
 *
 * @param {number} equity - Raw equity as decimal (0-1)
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call
 * @param {number} stackBB - Effective stack in BBs
 * @param {string} street - 'flop', 'turn'
 * @param {boolean} isIP - In position?
 * @param {boolean} isNutDraw - Is this a draw to the nuts?
 * @param {number} numPlayers - Active players
 * @returns {Object} Complete odds analysis
 */
function calculatePotAndImpliedOdds(equity, potSize, toCall, stackBB, street, isIP, isNutDraw, numPlayers) {
    if (toCall <= 0) {
        return {
            potOdds: 0, impliedOdds: 0, totalOdds: 0,
            isDirectlyProfitable: true, isImpliedProfitable: true,
            reverseImpliedRisk: 0, recommendation: 'free-check',
        };
    }

    // Direct pot odds
    const potOdds = toCall / (potSize + toCall);
    const isDirectlyProfitable = equity >= potOdds;

    // Implied odds calculation
    let impliedMultiplier = 1.0;

    // Stack depth: deeper stacks = more implied odds
    if (stackBB >= 100) impliedMultiplier += 0.35;
    else if (stackBB >= 50) impliedMultiplier += 0.20;
    else if (stackBB >= 25) impliedMultiplier += 0.08;
    // Short stacks: minimal implied odds
    else impliedMultiplier -= 0.10;

    // Position: IP gets more implied odds (control)
    if (isIP) impliedMultiplier += 0.12;
    else impliedMultiplier -= 0.05;

    // Nut draws get massive implied odds (opponent pays off)
    if (isNutDraw) impliedMultiplier += 0.25;

    // Street: flop has more implied (2 streets left), turn has less
    if (street === 'flop') impliedMultiplier += 0.15;

    // Multiway: slightly more implied (more players to pay off)
    if (numPlayers >= 3) impliedMultiplier += 0.05;

    // Calculate implied pot (how much we expect to win total)
    const impliedPot = potSize * impliedMultiplier;
    const impliedOdds = toCall / (impliedPot + toCall);
    const isImpliedProfitable = equity >= impliedOdds;

    // Reverse implied odds: penalty for non-nut draws
    let reverseImpliedRisk = 0;
    if (!isNutDraw) {
        reverseImpliedRisk = 0.15; // Non-nut draws face reverse implied odds
        if (numPlayers >= 3) reverseImpliedRisk += 0.08; // Worse multiway
    }

    // Final recommendation
    let recommendation = 'fold';
    if (isDirectlyProfitable) recommendation = 'call-direct-odds';
    else if (isImpliedProfitable && reverseImpliedRisk < 0.15) recommendation = 'call-implied-odds';
    else if (equity >= potOdds * 0.85 && isNutDraw) recommendation = 'call-borderline-nut-draw';

    return {
        potOdds: Math.round(potOdds * 1000) / 1000,
        impliedOdds: Math.round(impliedOdds * 1000) / 1000,
        totalOdds: impliedOdds,
        isDirectlyProfitable,
        isImpliedProfitable,
        reverseImpliedRisk,
        recommendation,
    };
}

// ─────────────────────────────────────────────────────────────────────────
// RANGE ADVANTAGE & BOARD TEXTURE INTERACTION
// ─────────────────────────────────────────────────────────────────────────

/**
 * Determine who has the range advantage on this board texture.
 *
 * Range advantage = whose preflop range connects better with this flop/turn/river.
 * This is one of THE most important concepts in modern NLHE:
 *
 * PREFLOP RAISER typically has range advantage on:
 *   - High boards (A-K-x, K-Q-x) — hits their opening range
 *   - Dry boards (no draws) — opponents called with speculative hands
 *   - Paired boards (less likely anyone flopped trips)
 *
 * CALLER typically has range advantage on:
 *   - Low connected boards (7-6-5, 8-7-6) — suited connectors hit these
 *   - Two-tone boards (caller has more suited hands proportionally)
 *   - Boards with middle pairs (caller's set-mining range hits)
 *
 * WHY IT MATTERS:
 *   - Player with range advantage should C-BET MORE (even with air)
 *   - Player WITHOUT range advantage should check more
 *   - Range advantage shifts on turn/river (new cards change texture)
 *
 * @param {string} wasPreAggressor - 'raiser' or 'caller'
 * @param {string[]} boardCards - Community cards
 * @param {string} street - 'flop', 'turn', 'river'
 * @returns {{ rangeAdvantage: string, advantageStrength: number, cbetModifier: number, reasoning: string }}
 */
function getRangeAdvantage(wasPreAggressor, boardCards, street) {
    if (!boardCards || boardCards.length < 3) {
        return { rangeAdvantage: 'neutral', advantageStrength: 50, cbetModifier: 0, reasoning: 'no-board' };
    }

    const ranks = boardCards.map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);
    const suits = boardCards.map(c => c[1]);
    const highCard = ranks[0];

    // Suit analysis
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuitCount = Math.max(...Object.values(suitCounts || {}));
    const isMonotone = maxSuitCount >= 3;
    const isTwoTone = maxSuitCount === 2;

    // Connectedness
    const gaps = [];
    for (let i = 0; i < Math.min(3, ranks.length) - 1; i++) {
        gaps.push(ranks[i] - ranks[i + 1]);
    }
    const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 5;
    const isConnected = avgGap <= 2;

    // Paired board
    const rankCounts = {};
    ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const isPaired = Object.values(rankCounts || {}).some(c => c >= 2);

    let raiserAdvantage = 50; // Start neutral

    // ── High cards favor the raiser ──
    if (highCard >= 10) raiserAdvantage += 12; // A, K, Q, J
    else if (highCard >= 7) raiserAdvantage -= 2; // Medium cards slightly favor caller
    else raiserAdvantage -= 10; // Low boards favor caller's range

    // ── Connectedness favors the caller ──
    if (isConnected) raiserAdvantage -= 10;
    if (avgGap <= 1.5) raiserAdvantage -= 5; // Very connected

    // ── Monotone/two-tone favors the caller ──
    if (isMonotone) raiserAdvantage -= 12;
    if (isTwoTone) raiserAdvantage -= 5;

    // ── Paired board favors the raiser (less interaction) ──
    if (isPaired) raiserAdvantage += 8;

    // ── Dry rainbow board favors the raiser ──
    if (maxSuitCount === 1 && avgGap >= 4) raiserAdvantage += 8;

    raiserAdvantage = Math.max(15, Math.min(85, raiserAdvantage));

    // Determine advantage
    let rangeAdvantage = 'neutral';
    if (raiserAdvantage >= 60) rangeAdvantage = wasPreAggressor === 'raiser' ? 'hero' : 'villain';
    else if (raiserAdvantage <= 40) rangeAdvantage = wasPreAggressor === 'raiser' ? 'villain' : 'hero';

    // C-bet modifier: positive means bet more, negative means check more
    let cbetModifier = 0;
    if (rangeAdvantage === 'hero') cbetModifier = 10 + Math.round((raiserAdvantage - 50) / 3);
    else if (rangeAdvantage === 'villain') cbetModifier = -10 - Math.round((50 - raiserAdvantage) / 3);

    return {
        rangeAdvantage,
        advantageStrength: raiserAdvantage,
        cbetModifier,
        reasoning: `high=${highCard} conn=${isConnected} suited=${maxSuitCount} paired=${isPaired}`,
    };
}

// ─────────────────────────────────────────────────────────────────────────
// POLARIZATION & BET SIZING STRATEGY
// ─────────────────────────────────────────────────────────────────────────

/**
 * Polarized vs merged range betting strategy.
 *
 * POLARIZED RANGE: Your betting range contains ONLY very strong hands
 * and bluffs — nothing in between. This is the optimal river strategy
 * in game theory. You bet big because you either have the nuts or nothing.
 *
 * MERGED RANGE: Your betting range contains strong AND medium-strength
 * hands. You bet smaller because you want calls from worse hands.
 * This works best on early streets or against opponents who call too much.
 *
 * WHEN TO POLARIZE (bet big):
 *   - River: always polarize (no more cards to come)
 *   - Board is static (few draws, unlikely to change)
 *   - Opponent's range is capped (they would have raised with strong hands)
 *   - You have a nut advantage (your range includes more very strong hands)
 *
 * WHEN TO MERGE (bet small):
 *   - Flop: ranges are wide, many possibilities
 *   - Board is dynamic (draws everywhere, likely to change)
 *   - Both ranges are uncapped (anyone could have anything)
 *   - Against calling stations (they don't fold anyway, so extract max thin value)
 *
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {number} handStrength - 0-100
 * @param {string} boardWetness - 'dry', 'medium', 'wet'
 * @param {string} rangeAdvantage - 'hero', 'villain', 'neutral'
 * @param {number} potSize - Current pot
 * @param {boolean} isIP - In position?
 * @param {Object} oppRead - { isStation, isAggressive }
 * @returns {{ strategy: string, betSizeFraction: number, reasoning: string }}
 */
function getPolarizationStrategy(street, handStrength, boardWetness, rangeAdvantage, potSize, isIP, oppRead) {
    const opp = oppRead || {};

    // ── RIVER: Always polarize ──
    if (street === 'river') {
        // Very strong hand: big bet (value portion of polarized range)
        if (handStrength >= 78) {
            let sizing = 0.75;
            if (handStrength >= 90) sizing = 1.0; // Pot-sized
            if (opp.isStation) sizing += 0.15; // Bigger vs stations
            return {
                strategy: 'polarized-value',
                betSizeFraction: Math.min(1.5, sizing),
                reasoning: 'river-polarized-value-bet'
            };
        }
        // Complete air with good blockers: bluff portion of polarized range
        if (handStrength < 25) {
            let sizing = 0.70;
            if (boardWetness === 'wet') sizing = 0.60; // Smaller bluff on scary board
            return {
                strategy: 'polarized-bluff',
                betSizeFraction: sizing,
                reasoning: 'river-polarized-bluff'
            };
        }
        // Medium hand: check (don't belong in polarized betting range)
        return {
            strategy: 'check-showdown',
            betSizeFraction: 0,
            reasoning: 'river-medium-check-down'
        };
    }

    // ── TURN: Mix of polarized and merged ──
    if (street === 'turn') {
        if (handStrength >= 72) {
            let sizing = boardWetness === 'wet' ? 0.70 : 0.60;
            return {
                strategy: 'merged-value',
                betSizeFraction: sizing,
                reasoning: 'turn-value-bet'
            };
        }
        if (handStrength >= 50 && isIP && boardWetness !== 'wet') {
            return {
                strategy: 'merged-thin-value',
                betSizeFraction: 0.45,
                reasoning: 'turn-thin-value'
            };
        }
        if (handStrength < 20 && isIP && rangeAdvantage === 'hero') {
            return {
                strategy: 'semi-polar-bluff',
                betSizeFraction: 0.55,
                reasoning: 'turn-barrel-bluff'
            };
        }
        return {
            strategy: 'check',
            betSizeFraction: 0,
            reasoning: 'turn-pot-control'
        };
    }

    // ── FLOP: Mostly merged (wide ranges, many cards to come) ──
    if (rangeAdvantage === 'hero') {
        // Range advantage: bet frequently with smaller sizing
        if (handStrength >= 40 || (isIP && handStrength >= 25)) {
            let sizing = boardWetness === 'dry' ? 0.33 : 0.50;
            if (opp.isStation && handStrength >= 55) sizing += 0.10;
            return {
                strategy: 'merged-range-bet',
                betSizeFraction: sizing,
                reasoning: 'flop-range-advantage-cbet'
            };
        }
    }
    if (handStrength >= 60) {
        let sizing = boardWetness === 'wet' ? 0.60 : 0.50;
        return {
            strategy: 'merged-value',
            betSizeFraction: sizing,
            reasoning: 'flop-value-bet'
        };
    }
    return {
        strategy: 'check',
        betSizeFraction: 0,
        reasoning: 'flop-check'
    };
}

// ─────────────────────────────────────────────────────────────────────────
// POSITION EXPLOITATION (IP vs OOP FRAMEWORK)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Position-based postflop strategy framework.
 *
 * Position is THE most important factor in NLHE postflop play:
 *
 * IN POSITION (IP) ADVANTAGES:
 *   - See opponent's action BEFORE deciding (information)
 *   - Can control pot size (check back weak hands, bet strong ones)
 *   - Bluffs are more effective (opponent can't check-raise us)
 *   - Implied odds are higher (can extract on later streets)
 *   - Can take free cards (check turn, bet river)
 *
 * OUT OF POSITION (OOP) DISADVANTAGES:
 *   - Act first with incomplete information
 *   - Check-raise is the main weapon (but it's risky)
 *   - Must bet/fold or check/call — can't check/bet later
 *   - Harder to realize equity (opponent pressures you)
 *   - Bluffs are less effective (opponent can call in position)
 *
 * OOP STRATEGY:
 *   - Check-raise strong hands (deceptive, builds pot)
 *   - Donk bet rarely (only on boards that strongly favor your range)
 *   - Check-call drawing hands (realize equity cheaply)
 *   - Check-fold weak hands (don't invest more OOP)
 *   - Lead on turn/river when board changes to favor your range
 *
 * IP STRATEGY:
 *   - Bet frequently (punish OOP's checking range)
 *   - Size down on static boards (opponent can't improve much)
 *   - Size up on dynamic boards (charge draws, deny equity)
 *   - Check back medium hands (pot control, free showdown)
 *   - Delayed C-bet on turn when flop checked through
 *
 * @param {boolean} isIP - In position?
 * @param {number} handStrength - 0-100
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {string} boardWetness - 'dry', 'medium', 'wet'
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call (0 if checked to)
 * @param {boolean} wasPreAggressor - Were we the preflop raiser?
 * @param {number} aggressionBias - Horse personality
 * @returns {{ action: string, sizing: number, reasoning: string }}
 */
function getPositionStrategy(isIP, handStrength, street, boardWetness, potSize, toCall, wasPreAggressor, aggressionBias) {

    if (isIP) {
        // ── IN POSITION STRATEGY ──

        if (toCall > 0) {
            // Facing a bet in position: call, raise, or fold
            if (handStrength >= 80) {
                // Strong hand: raise for value (or slow-play occasionally)
                if (Math.random() < 0.25 && street !== 'river') {
                    return { action: 'call', sizing: 0, reasoning: 'ip-slow-play' };
                }
                return { action: 'raise', sizing: Math.round(toCall * 2.5 + potSize * 0.3), reasoning: 'ip-value-raise' };
            }
            if (handStrength >= 45) {
                return { action: 'call', sizing: 0, reasoning: 'ip-call-medium' };
            }
            if (handStrength >= 30 && toCall <= potSize * 0.35) {
                return { action: 'call', sizing: 0, reasoning: 'ip-cheap-call' };
            }
            return { action: 'fold', sizing: 0, reasoning: 'ip-fold-weak' };
        }

        // Checked to in position: bet or check
        if (handStrength >= 70) {
            let sizeFraction = boardWetness === 'wet' ? 0.65 : 0.50;
            return { action: 'bet', sizing: Math.round(potSize * sizeFraction), reasoning: 'ip-value-bet' };
        }
        if (wasPreAggressor && street === 'flop' && handStrength >= 30) {
            // C-bet in position
            let cbetSize = boardWetness === 'dry' ? 0.33 : 0.55;
            return { action: 'bet', sizing: Math.round(potSize * cbetSize), reasoning: 'ip-cbet' };
        }
        if (handStrength >= 45 && handStrength < 65) {
            // Medium hand: pot control (check back)
            return { action: 'check', sizing: 0, reasoning: 'ip-pot-control' };
        }
        // Weak hand: check back (free card)
        if (handStrength < 30) {
            return { action: 'check', sizing: 0, reasoning: 'ip-free-card' };
        }
        // Default: small bet
        return { action: 'bet', sizing: Math.round(potSize * 0.40), reasoning: 'ip-default-bet' };
    }

    // ── OUT OF POSITION STRATEGY ──

    if (toCall > 0) {
        // Facing a bet out of position: call, check-raise, or fold
        if (handStrength >= 82) {
            // Check-raise with strong hands OOP
            return { action: 'raise', sizing: Math.round(toCall * 3.0), reasoning: 'oop-check-raise-value' };
        }
        if (handStrength >= 50) {
            return { action: 'call', sizing: 0, reasoning: 'oop-call-medium' };
        }
        if (handStrength >= 35 && toCall <= potSize * 0.30) {
            return { action: 'call', sizing: 0, reasoning: 'oop-cheap-call' };
        }
        return { action: 'fold', sizing: 0, reasoning: 'oop-fold' };
    }

    // First to act (checked to nobody):
    if (handStrength >= 75) {
        // Lead out with strong hands (donk bet on favorable boards)
        if (boardWetness === 'wet' || !wasPreAggressor) {
            return { action: 'bet', sizing: Math.round(potSize * 0.55), reasoning: 'oop-lead-strong' };
        }
    }
    // OOP default: check to the raiser
    return { action: 'check', sizing: 0, reasoning: 'oop-check-to-raiser' };
}

// ─────────────────────────────────────────────────────────────────────────
// MULTI-STREET PLANNING (TURN & RIVER AHEAD)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Plan the betting line across multiple streets.
 *
 * Professional poker is about PLANNING, not just reacting.
 * Before you bet the flop, you should already know:
 *   - What turn cards will you barrel on?
 *   - What turn cards will you check on?
 *   - What is your river plan if called on the turn?
 *   - How much money will be in the pot by showdown?
 *
 * ONE-AND-DONE: Bet flop, check turn, check river
 *   - Good for: Medium hands that can't handle multiple streets
 *   - Example: Second pair on a wet board
 *
 * TWO BARRELS: Bet flop, bet turn, check river
 *   - Good for: Strong made hands, semi-bluffs with draws
 *   - Example: Top pair good kicker, nut flush draw
 *
 * THREE BARRELS: Bet flop, bet turn, bet river
 *   - Good for: The nuts, or a pure bluff that tells a credible story
 *   - Example: Nut flush, or a bricked draw that represents the flush
 *
 * CHECK-CALL LINE: Check and call bets
 *   - Good for: Trapping with strong hands, protecting marginal hands
 *   - Example: Slow-playing a set, calling with second pair
 *
 * @param {number} handStrength - 0-100
 * @param {number} drawOuts - Number of outs if drawing (0 for made hands)
 * @param {string} boardWetness - 'dry', 'medium', 'wet'
 * @param {number} potSize - Current pot
 * @param {number} stackBB - Effective stack in BBs
 * @param {boolean} isIP - In position?
 * @param {string} street - 'flop', 'turn'
 * @returns {{ plan: string, flopAction: string, turnAction: string, riverAction: string, reasoning: string }}
 */
function getMultiStreetPlan(handStrength, drawOuts, boardWetness, potSize, stackBB, isIP, street) {
    const result = {
        plan: 'one-and-done',
        flopAction: 'check',
        turnAction: 'check',
        riverAction: 'check',
        reasoning: '',
    };

    // ── THE NUTS: Three barrel for max value ──
    if (handStrength >= 85) {
        result.plan = 'three-barrels';
        result.flopAction = 'bet-medium';
        result.turnAction = 'bet-large';
        result.riverAction = 'bet-large';
        result.reasoning = 'nut-hand-extract-max-value';
        return result;
    }

    // ── STRONG DRAW (12+ outs): Semi-bluff multiple streets ──
    if (drawOuts >= 12 && street !== 'river') {
        result.plan = 'two-barrels-draw';
        result.flopAction = 'bet-medium';
        result.turnAction = drawOuts >= 15 ? 'bet-medium' : 'check-call';
        result.riverAction = 'give-up-or-value'; // Hit = value, miss = give up
        result.reasoning = 'strong-draw-semi-bluff-line';
        return result;
    }

    // ── STRONG MADE HAND (70-84): Two barrels ──
    if (handStrength >= 70) {
        result.plan = 'two-barrels';
        result.flopAction = 'bet-medium';
        result.turnAction = boardWetness === 'wet' ? 'bet-large' : 'bet-medium';
        result.riverAction = handStrength >= 78 ? 'bet-thin-value' : 'check-showdown';
        result.reasoning = 'strong-hand-two-street-value';
        return result;
    }

    // ── MEDIUM DRAW (6-11 outs): Bet flop, reassess turn ──
    if (drawOuts >= 6 && drawOuts < 12 && street === 'flop') {
        result.plan = 'one-and-reassess';
        result.flopAction = isIP ? 'bet-small' : 'check-call';
        result.turnAction = 'reassess'; // Hit = value, brick = check/fold
        result.riverAction = 'depends-on-turn';
        result.reasoning = 'medium-draw-one-and-reassess';
        return result;
    }

    // ── MEDIUM MADE HAND (50-69): One street of value ──
    if (handStrength >= 50 && handStrength < 70) {
        result.plan = 'one-and-done';
        result.flopAction = 'bet-small';
        result.turnAction = isIP ? 'check-back' : 'check-call-small';
        result.riverAction = 'check-showdown';
        result.reasoning = 'medium-hand-one-street-value';
        return result;
    }

    // ── WEAK/MARGINAL HAND: Check-call or fold ──
    if (handStrength >= 35) {
        result.plan = 'check-call';
        result.flopAction = 'check-call-small';
        result.turnAction = 'check-fold';
        result.riverAction = 'check-fold';
        result.reasoning = 'marginal-hand-minimal-investment';
        return result;
    }

    // ── AIR: Bluff or give up ──
    if (isIP && boardWetness === 'dry') {
        // On dry boards in position, can fire a delayed bluff
        result.plan = 'delayed-bluff';
        result.flopAction = 'check-back';
        result.turnAction = 'bet-medium'; // Delayed c-bet
        result.riverAction = 'give-up';
        result.reasoning = 'delayed-bluff-line-ip-dry';
        return result;
    }

    result.plan = 'give-up';
    result.flopAction = 'check-fold';
    result.turnAction = 'check-fold';
    result.riverAction = 'check-fold';
    result.reasoning = 'no-equity-no-plan';
    return result;
}

// ─────────────────────────────────────────────────────────────────────────
// SHORT STACK STRATEGY (15-25 BB)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Short stack NLHE strategy (15-25 BB).
 *
 * Short stack poker is a DIFFERENT GAME than deep stack poker:
 *
 * PREFLOP:
 *   - Open-raise to 2x (smaller sizing preserves fold equity)
 *   - 3-bet = all-in (no room for 3-bet/fold)
 *   - Flat calling is ALMOST ALWAYS WRONG (no postflop maneuverability)
 *   - Position matters LESS (you're committed preflop)
 *
 * POSTFLOP:
 *   - SPR is always low (1-3) — you're committed with top pair
 *   - Don't slow-play (no room for traps)
 *   - Don't draw (not enough implied odds)
 *   - Bet/fold doesn't exist — it's bet/call-shove
 *
 * CRITICAL SHORT STACK RULES:
 *   1. Top pair or better = get it all in
 *   2. Draws = fold (no implied odds)
 *   3. Position = less important (SPR is too low)
 *   4. 3-bet = always all-in
 *   5. Never flat a raise (3-bet all-in or fold)
 *
 * @param {number} stackBB - Stack in big blinds (15-25)
 * @param {number} handStrength - 0-100
 * @param {string} street - 'preflop', 'flop', 'turn', 'river'
 * @param {string} position - Player position
 * @param {number} toCall - Amount to call
 * @param {number} bb - Big blind
 * @param {number} potSize - Current pot
 * @returns {{ action: string, sizing: number, reasoning: string, isAllIn: boolean }}
 */
function getShortStackNLHEStrategy(stackBB, handStrength, street, position, toCall, bb, potSize) {
    const stackChips = stackBB * bb;

    // ── PREFLOP SHORT STACK ──
    if (street === 'preflop') {
        // Facing a raise: 3-bet all-in or fold (NEVER flat)
        if (toCall > bb * 2) {
            // Need at least 30% equity vs a raising range to shove
            const shovedThreshold = position === 'BTN' || position === 'CO' ? 55 : 62;
            if (handStrength >= shovedThreshold) {
                return { action: 'all-in', sizing: stackChips, reasoning: 'short-stack-3bet-shove', isAllIn: true };
            }
            return { action: 'fold', sizing: 0, reasoning: 'short-stack-fold-to-raise', isAllIn: false };
        }

        // Unopened: open-raise 2x (smaller sizing)
        if (toCall <= bb) {
            const openThreshold = {
                BTN: 35, CO: 42, HJ: 50, MP: 55, UTG: 62, SB: 40, BB: 25,
            };
            const threshold = openThreshold[position] || 50;
            if (handStrength >= threshold) {
                const openSize = Math.round(bb * 2);
                return { action: 'raise', sizing: openSize, reasoning: 'short-stack-open-2x', isAllIn: false };
            }
            return { action: 'fold', sizing: 0, reasoning: 'short-stack-preflop-fold', isAllIn: false };
        }
    }

    // ── POSTFLOP SHORT STACK ──
    // SPR is always low — simplified decision tree
    const spr = stackChips / Math.max(potSize, 1);

    // SPR < 2: Committed. Top pair or better = shove.
    if (spr < 2) {
        if (handStrength >= 45) {
            return { action: 'all-in', sizing: stackChips, reasoning: 'short-stack-committed-shove', isAllIn: true };
        }
        if (toCall <= potSize * 0.30 && handStrength >= 30) {
            return { action: 'call', sizing: 0, reasoning: 'short-stack-pot-committed-call', isAllIn: false };
        }
        return { action: 'fold', sizing: 0, reasoning: 'short-stack-give-up', isAllIn: false };
    }

    // SPR 2-4: Medium commitment. Strong top pair+ = shove.
    if (spr < 4) {
        if (handStrength >= 55) {
            return { action: 'all-in', sizing: stackChips, reasoning: 'short-stack-low-spr-shove', isAllIn: true };
        }
        if (toCall === 0 && handStrength >= 35) {
            // Bet to get stacks in
            return { action: 'bet', sizing: Math.round(potSize * 0.65), reasoning: 'short-stack-build-pot', isAllIn: false };
        }
        if (toCall > 0 && handStrength >= 40) {
            return { action: 'call', sizing: 0, reasoning: 'short-stack-spr-call', isAllIn: false };
        }
        return { action: 'fold', sizing: 0, reasoning: 'short-stack-fold-no-equity', isAllIn: false };
    }

    // SPR 4+: Rare at short stack. Play more cautiously.
    if (handStrength >= 60) {
        return { action: 'bet', sizing: Math.round(potSize * 0.55), reasoning: 'short-stack-value', isAllIn: false };
    }
    if (toCall === 0) {
        return { action: 'check', sizing: 0, reasoning: 'short-stack-check', isAllIn: false };
    }
    if (handStrength >= 40 && toCall <= potSize * 0.35) {
        return { action: 'call', sizing: 0, reasoning: 'short-stack-cheap-call', isAllIn: false };
    }
    return { action: 'fold', sizing: 0, reasoning: 'short-stack-fold', isAllIn: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    // Main decision engine
    makeFallbackDecision,

    // Postflop evaluation
    evaluatePostflopHand,

    // Street-specific heuristics
    makeFlopHeuristicDecision,
    makeTurnRiverHeuristicDecision,

    // Board analysis
    evaluateBoardWetness,
    analyzeBoardEvolution,

    // Strategy utilities
    getSPRStrategy,
    getMultiwayAdjustment,
    getCheckRaiseStrategy,
    getOOPDecisionMatrix,
    getCBetStrategy,
    get3BetStrategy,
    getDrawEquity,
    getRiverStrategy,
    getDeepStackAdjustment,
    getOptimalBetSize,
    getGeometricSizing,

    // Exploit & adjustment
    applyExploitIntensifier,
    handleDonkBet,
    applyTiltDegradation,

    // Dependency injection for live observer
    setLiveReadFn,

    // Advanced NLHE strategy (Phase 5 expansion)
    getBlindBattleStrategy,
    getHoldemBlockerAnalysis,
    getThinValueStrategy,
    getBluffCatchStrategy,
    calculatePotAndImpliedOdds,
    getRangeAdvantage,
    getPolarizationStrategy,
    getPositionStrategy,
    getMultiStreetPlan,
    getShortStackNLHEStrategy,
};
