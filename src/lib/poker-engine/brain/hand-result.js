/**
 * brain/hand-result.js — Post-hand processing pipeline
 *
 * processHandResult() is called after every hand completes. It:
 *   1. Records opponent showdown data for profiling
 *   2. Updates collusion/chip-dumping detection
 *   3. Feeds anti-exploit threat intelligence
 *   4. Adjusts tilt, pattern profit, and showdown exposure tracking
 *   5. Evolves horse skill tier based on results
 *   6. Saves key hands for review
 *   7. Records chip leak patterns
 *
 * Dependencies:
 *   - core.js: isHorse, getAdvancedModule
 *   - anti-exploit.js: Maps (collusionTracker, tiltMap, etc.), _persistThreatIntel, recordOpponentShowdown, recordChipLeak
 *   - session-analytics.js: recordPerformanceResult, evolveHorseSkill, saveKeyHand
 */

const { isHorse, getAdvancedModule } = require('./core');
const { collusionTracker, tiltMap, showdownExposureMap, patternProfitMap,
        suspectBotMap, crossTableRadar, _persistThreatIntel,
        recordOpponentShowdown, recordChipLeak,
        // Every name below is used in this file and was never destructured, so
        // each call site threw ReferenceError. anti-exploit.js exports all of
        // them; the require list simply stopped short.
        recordOpponentAction, recordProbeBet, recordIsoSize, recordRaiseSize,
        recordSqueeze, recordColdCall, recordBarrelVsColdCall,
        recordActionTiming, recordRITResponse, recordTableImageHand,
        timeAbuseSuspicion } = require('./anti-exploit');
const { recordPerformanceResult, evolveHorseSkill, saveKeyHand,
        getPerformanceStats, saveOpponentRead } = require('./session-analytics');

async function processHandResult(handData, bb = 2) {
    if (!handData?.result) return;

    const adv = await getAdvancedModule();

    const winners = handData.result.winners || [];
    const players = handData.result.players || handData.players || [];

    for (const player of players) {
        const pid = String(player.id || player.playerId);
        const isAI = await isHorse(pid);
        if (!isAI) continue;

        const won = winners.some(w => String(w.playerId) === pid);
        const chipDelta = player.chipDelta || 0;

        // ─── AUDIT 14: COLLUSION / CHIP DUMPING GUARD ───
        // If the horse lost a huge pot (>40BB), track who won it.
        // If the SAME human stacks them 3 times, the horse flees the table.
        if (!won && chipDelta < -(bb * 40)) {
            const opps = winners.map(w => String(w.playerId));
            if (!collusionTracker.has(pid)) collusionTracker.set(pid, new Map());
            const horseTracker = collusionTracker.get(pid);

            for (const oppId of opps) {
                const isOppAI = await isHorse(oppId);
                if (!isOppAI) { // Only track humans farming the horse
                    const count = (horseTracker.get(oppId) || 0) + 1;
                    horseTracker.set(oppId, count);

                    if (count >= 3) {
                        console.warn(`[HorseBrain]  ANTI-COLLUSION TRIGGERED: ${pid} has been stacked 3x by ${oppId}! Fleeing table.`);
                        // Spike tilt to 1.0 — evaluateSessions will immediately detect this and stand them up
                        if (!tiltMap.has(pid)) tiltMap.set(pid, {});
                        const state = tiltMap.get(pid);
                        state.multiplier = 1.0;
                        state.reason = `Farm protection vs ${oppId}`;
                    }
                }
            }
        }

        if (adv) {
            // --- Record wins for consecutive loss reset (#6) ---
            if (won && adv.recordWin) {
                adv.recordWin(pid);
            }

            // --- Record bad beats for tilt system ---
            if (!won && chipDelta < 0 && adv.recordBadBeat) {
                const bbLost = Math.abs(chipDelta) / bb;
                const wasBadBeat = bbLost >= 20;
                adv.recordBadBeat(pid, bbLost, wasBadBeat);
            }

            // --- Record showdowns for table image tracking ---
            if (player.showedCards && adv.recordShowdown) {
                const wasBetting = player.lastAction === 'raise' || player.lastAction === 'bet';
                adv.recordShowdown(pid, won, wasBetting);
            }

            // --- BUG #37 FIX: Record hand history for Advanced opponent reads ---
            // recordHandHistory was NEVER called, so getOpponentRead always returned null.
            // This made the entire exploit pipeline (identifyLeak, getExploitAdjustedAction)
            // and opponent-aware bet sizing dead code. Now each hand records what each opponent
            // did (bluff, value bet, or fold) so opponent profiles build over time.
            if (adv.recordHandHistory) {
                const opponentsForHistory = (handData.players || []).filter(op =>
                    String(op.id || op.playerId) !== pid
                );
                for (const opp of opponentsForHistory) {
                    const oppId = String(opp.id || opp.playerId);
                    const oppWasBetting = opp.lastAction === 'raise' || opp.lastAction === 'bet';
                    const oppWon = winners.some(w => String(w.playerId) === oppId);
                    adv.recordHandHistory(pid, oppId, {
                        wasBluff: oppWasBetting && !oppWon,
                        wasValue: oppWasBetting && oppWon,
                        folded: opp.folded === true
                    });
                }
            }
        }

        // --- BUG #37b FIX: Record grudges for rivalry dynamics ---
        // recordGrudge was never called, so grudge-based targeting was dead code.
        // When a horse loses a big pot (20+ BB), record a grudge against the winner.
        if (!won && chipDelta < 0 && adv?.recordGrudge) {
            const bbLostForGrudge = Math.abs(chipDelta) / bb;
            for (const w of winners) {
                adv.recordGrudge(pid, String(w.playerId), bbLostForGrudge);
            }
        }

        // --- Record performance result (#34) ---
        recordPerformanceResult(pid, won, chipDelta / bb);

        // --- Save key hands (#41) ---
        if (Math.abs(chipDelta) > bb * 10) {
            saveKeyHand(handData, bb).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }

        // --- Evolve horse skill (#42) ---
        const stats = getPerformanceStats(pid);
        if (stats.handsPlayed > 0 && stats.handsPlayed % 50 === 0) {
            evolveHorseSkill(pid, stats.winRate * 100);
        }

        // --- Save opponent reads (#40) ---
        if (adv && adv.getOpponentRead) {
            const opponents = (handData.players || []).filter(op => String(op.id) !== pid && !op.folded);
            for (const opp of opponents.slice(0, 2)) {
                const read = adv.getOpponentRead(pid, String(opp.id));
                if (read && read.handsObserved >= 10) {
                    saveOpponentRead(pid, String(opp.id), read).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                }
            }
        }

        // ═══ OPPONENT SESSION MODEL — Record all opponent actions from this hand ═══
        // This feeds the real-time session reads used in turn/river heuristic decisions.
        const allOpponents = (handData.players || []).filter(op => String(op.id || op.playerId) !== pid);
        for (const opp of allOpponents) {
            const oppId = String(opp.id || opp.playerId);

            // Record their last known action on each street
            if (opp.actions && Array.isArray(opp.actions)) {
                for (const act of opp.actions) {
                    recordOpponentAction(oppId, act.street || 'unknown', act.type || act.action || 'unknown', {
                        betToPot: act.amount && act.potSize ? act.amount / Math.max(1, act.potSize) : undefined,
                        handStrength: act.handStrength || undefined,
                        position: opp.position || undefined,
                    });
                }
            } else if (opp.lastAction) {
                // Fallback: record at least the final action
                recordOpponentAction(oppId, handData.lastStreet || 'river', opp.lastAction, {
                    betToPot: opp.lastBetSize && handData.potSize ? opp.lastBetSize / Math.max(1, handData.potSize) : undefined,
                    position: opp.position || undefined,
                });
            }

            // Record showdown if opponent showed cards
            if (opp.showedCards || opp.handStrength !== undefined) {
                const oppWon = winners.some(w => String(w.playerId) === oppId);
                const oppStr = opp.handStrength || 0;
                const wasBluff = oppStr < 30 && (opp.lastAction === 'raise' || opp.lastAction === 'bet' || opp.lastAction === 'all_in');
                recordOpponentShowdown(oppId, oppWon, oppStr, wasBluff);
            }
        }

        // ─── AUDIT 14: CHAT STEALTH MODE ───
        // Horses must never type in chat to prevent prompt injections,
        // harassment, and breaking the illusion.
        // Disabled `personality.getTableChat` entirely.

        // ─── MODULE 3: SHOWDOWN EXPOSURE TRACKER ───
        // Increment the per-table showdown count so the Counter-Exploit Profiler
        // can escalate obfuscation intensity as hand ranges become more readable.
        if (player.showedCards) {
            const tableIdHR = handData.tableId || 'unknown';
            if (!showdownExposureMap.has(pid)) showdownExposureMap.set(pid, new Map());
            const horseExp = showdownExposureMap.get(pid);
            if (!horseExp.has(tableIdHR)) horseExp.set(tableIdHR, { showdowns: 0, handsPlayed: 0 });
            horseExp.get(tableIdHR).showdowns++;
            const { showdowns, handsPlayed } = horseExp.get(tableIdHR);
            console.debug(`[HorseBrain]  MODULE 3 EXPOSURE: ${pid.substring(0, 8)} has shown down ${showdowns}/${handsPlayed} hands at table ${tableIdHR.substring(0, 8)}`);
        }

        // ─── MODULE 4: PATTERN EXPLOITATION DETECTOR ───
        // Tracks profit attributed to specific patterns each opponent uses against this horse.
        // When a human is consistently exploiting one pattern (cbet, float, bluff), we counter.
        const humanOpponents = (handData.players || []).filter(op => String(op.id) !== pid && !op.folded);
        for (const opp of humanOpponents.slice(0, 2)) {
            const oppId = String(opp.id);
            const isOppAI = await isHorse(oppId);
            if (isOppAI) continue; // Only track human exploiters

            if (!patternProfitMap.has(pid)) patternProfitMap.set(pid, new Map());
            const horsePatterns = patternProfitMap.get(pid);
            if (!horsePatterns.has(oppId)) horsePatterns.set(oppId, { cbet: 0, check_raise: 0, float: 0, bluff: 0, totalProfit: 0 });
            const pat = horsePatterns.get(oppId);

            // Attribute profit to patterns based on action sequence
            const oppLastAction = opp.lastAction || '';
            const oppChipDelta = opp.chipDelta || 0;
            if (oppChipDelta > 0) {
                // Human won chips — attribute to what they did
                const bbWon = oppChipDelta / bb;
                if (oppLastAction === 'bet' && opp.hadInitiative === false) { pat.float += bbWon; } // Float play
                else if (oppLastAction === 'raise' && opp.actedAfterCheck === true) { pat.check_raise += bbWon; } // Check-raise
                else if (oppLastAction === 'raise' && !won) { pat.bluff += bbWon; } // Could be bluff
                else if (oppLastAction === 'bet' && opp.hadInitiative === true) { pat.cbet += bbWon; } // C-bet
                pat.totalProfit += bbWon;

                // Alert when a human has found a pattern worth 5+ BB
                if (pat.totalProfit >= 5) {
                    const highest = Object.entries({ cbet: pat.cbet, check_raise: pat.check_raise, float: pat.float, bluff: pat.bluff }).sort((a, b) => b[1] - a[1])[0];
                    console.warn(`[HorseBrain]  MODULE 4 PATTERN: ${oppId.substring(0, 8)} exploiting ${pid.substring(0, 8)} via '${highest[0]}' (+${pat.totalProfit.toFixed(1)}BB total)`);
                }
            }
        }

        // ─── MODULE 7: BOT/SOLVER OPPONENT DETECTOR ───
        // Scores each opponent on suspiciously perfect play. High score = likely solver user.
        // Metrics: folding exactly at pot-odds break-even, GTO-fractional bet sizing, zero 'human' errors.
        for (const opp of humanOpponents.slice(0, 2)) {
            const oppId = String(opp.id);
            const isOppAI = await isHorse(oppId);
            if (isOppAI) continue;

            if (!suspectBotMap.has(oppId)) suspectBotMap.set(oppId, { perfectFolds: 0, gtoSizes: 0, humanErrors: 0, handsObserved: 0, suspectScore: 0 });
            const botData = suspectBotMap.get(oppId);
            botData.handsObserved++;

            // Perfect fold: opponent folded facing a bet and was getting good pot odds (solver discipline)
            const potTotal = handData.potSize || handData.result?.potTotal || 0;
            const facingBet = handData.result?.lastBet || 0;
            if (opp.lastAction === 'fold' && potTotal > 0 && facingBet > 0) {
                const impliedPotOdds = facingBet / (potTotal + facingBet);
                // >35% pot odds and still folded = extremely disciplined / solver-like
                if (impliedPotOdds > 0.35) botData.perfectFolds++;
            }

            // GTO sizing tell: bet amount is very close to a standard fraction (33%, 50%, 75%, pot)
            const oppBetAmt = opp.betAmount || 0;
            if (oppBetAmt > 0 && potTotal > 0) {
                const fraction = oppBetAmt / potTotal;
                const gtoFractions = [0.33, 0.5, 0.66, 0.75, 1.0];
                const isGTOSize = gtoFractions.some(f => Math.abs(fraction - f) < 0.04); // Within 4%
                if (isGTOSize) botData.gtoSizes++; else botData.humanErrors++;
            }

            // Recalculate suspect score
            const obsCount = Math.max(1, botData.handsObserved);
            const gtoFoldRate = botData.perfectFolds / obsCount;
            const gtoSizeRate = botData.gtoSizes / Math.max(1, botData.gtoSizes + botData.humanErrors);
            botData.suspectScore = Math.min(100, Math.round((gtoFoldRate * 50) + (gtoSizeRate * 50)));

            if (botData.suspectScore >= 65 && botData.handsObserved >= 10) {
                console.warn(`[HorseBrain]  MODULE 7 BOT DETECTED: ${oppId.substring(0, 8)} suspect score = ${botData.suspectScore}/100 (${botData.handsObserved} hands)`);
            }

            // ─── MODULE 10: CROSS-TABLE COLLUSION RADAR ───
            // Track how many horse tables this human is simultaneously farming.
            const tableHR = handData.tableId || 'unknown';
            if (!crossTableRadar.has(oppId)) crossTableRadar.set(oppId, new Set());
            crossTableRadar.get(oppId).add(tableHR);
            const tablesCount = crossTableRadar.get(oppId).size;
            if (tablesCount >= 3) {
                console.warn(`[HorseBrain]  MODULE 10 CROSS-TABLE: ${oppId.substring(0, 8)} at ${tablesCount} horse tables simultaneously!`);
            }

            // ─── MODULE 15: TIMEBANK ABUSE DETECTOR ───
            // Track per-human average action time. >22s average = stall tactic.
            const oppActionMs = opp.lastActionDurationMs || opp.actionTimeMs || 0;
            if (oppActionMs > 0) {
                if (!timeAbuseSuspicion.has(oppId)) timeAbuseSuspicion.set(oppId, { actionTimes: [], suspicionScore: 0 });
                const tbTrack = timeAbuseSuspicion.get(oppId);
                tbTrack.actionTimes.push(oppActionMs);
                // Keep only last 10 action times for a rolling average
                if (tbTrack.actionTimes.length > 10) tbTrack.actionTimes.shift();
                const avgMs = tbTrack.actionTimes.reduce((s, t) => s + t, 0) / tbTrack.actionTimes.length;
                // Stall threshold: avg > 22000ms (22 seconds)
                if (avgMs > 22000) {
                    tbTrack.suspicionScore = Math.min(100, tbTrack.suspicionScore + 5);
                    if (tbTrack.suspicionScore >= 70) {
                        console.warn(`[HorseBrain] ⏱ MODULE 15 STALL: ${oppId.substring(0, 8)} avg=${(avgMs / 1000).toFixed(1)}s, suspicion=${tbTrack.suspicionScore}/100`);
                    }
                } else {
                    // Decay suspicion for legitimate players
                    tbTrack.suspicionScore = Math.max(0, tbTrack.suspicionScore - 2);
                }
            }

            // ─── MODULE 9: PERSIST THREAT INTEL (Debounced — 5s) ───
            // Trigger a debounced Supabase upsert of all accumulated threat signals.
            _persistThreatIntel(oppId);

            // ─── MODULE 19: PROBE-BET FREQUENCY HARVESTER ───
            // Record if opponent made a probe bet this hand (< 35% pot)
            const oppBet = opp.betAmount || 0;
            const handPotSize = handData.potSize || handData.result?.totalPot || 0;
            if (oppBet > 0 && handPotSize > 0) {
                const betFrac = oppBet / handPotSize;
                const oppWon = (handData.result?.winners || []).some(w => String(w.playerId) === oppId);
                recordProbeBet(oppId, betFrac, oppWon, opp.chipDelta || 0);
            }

            // ─── MODULE 22: ISO SIZING TELL TRACKER ───
            // Record isolation raise sizes if opponent raised preflop vs limpers
            if (opp.lastAction === 'raise' && (handData.street === 'preflop' || !handData.street)) {
                const handBB = handData.bigBlind || 2;
                const isoSizeBB = oppBet / handBB;
                if (isoSizeBB > 0) recordIsoSize(oppId, isoSizeBB);
            }

            // ─── MODULE 25: MIN-RAISE HARASSMENT DETECTOR ───
            if (opp.lastAction === 'raise') {
                const isWinner = (handData.result?.winners || []).some(w => String(w.playerId) === oppId);
                recordRaiseSize(oppId, oppBet, handData.prevBet || 0, isWinner);
            }

            // ─── MODULE 26: SQUEEZE OVERKILL DETECTOR ───
            if (opp.lastAction === 'raise' && (handData.actionCount || 0) >= 3) {
                recordSqueeze(oppId, oppBet, handData.potSize || 0);
            }

            // ─── MODULE 28: COLD-CALL TRAP DETECTOR — preflop cold-calls ───
            if (opp.lastAction === 'call' && (handData.street === 'preflop' || !handData.street)) {
                recordColdCall(oppId);
            }
            // ─── MODULE 28: COLD-CALL TRAP DETECTOR — postflop barrels ───
            // Phase 47 FIX: Was checking opp.lastAction === 'bet' (opponent's bets) but should
            // track when the HORSE barrels against a cold-caller and whether the cold-caller folded.
            // Old code made every active cold-caller always flagged as a trap (oppFolded always false
            // because the opponent just bet, so winRate=0 < 0.35 → isTrap always true).
            if (handData.street && handData.street !== 'preflop') {
                const heroBet = player.lastAction === 'bet' || player.lastAction === 'raise';
                if (heroBet) {
                    recordBarrelVsColdCall(oppId, opp.folded || false);
                }
            }

            // ─── MODULE 30: ANGLE-SHOOT TIMING DETECTOR ───
            if (opp.actionTimeMs) {
                recordActionTiming(oppId, opp.actionTimeMs);
            }

            // ─── MODULE 31: RIT REFUSAL TRACKER ───
            if (handData.ritOffered && opp.ritResponse !== undefined) {
                recordRITResponse(oppId, opp.ritResponse);
            }
        }
    }

    // ─── MODULE 20: TABLE IMAGE EXPOSURE MONITOR ───
    // Track showdown counts for every horse at this table
    for (const p of (handData.players || handData.result?.players || [])) {
        const pid = String(p.id || p.playerId || '');
        if (!pid || !(await isHorse(pid))) continue;
        const showedCards = p.showedCards === true || p.showdown === true;
        recordTableImageHand(pid, handData.tableId, showedCards);

        // ─── MODULE 32: PER-SESSION CHIP-LEAK FORENSICS ───
        if (p.chipDelta < 0 && handData.tableId) {
            const absLossBB = Math.abs(p.chipDelta) / (handData.bigBlind || 2);
            // Classify leak pattern
            let pattern = 'general_loss';
            if ((handData.numPlayers || 2) >= 4 && p.invested > 0) pattern = 'multiway_topset';
            else if (handData.street === 'flop' && !p.hasInitiative && p.invested > 0) pattern = 'oop_check_call';
            else if (handData.street === 'river' && p.invested > 0) pattern = 'river_call_loss';

            recordChipLeak(pid, handData.tableId, pattern, absLossBB);
        }
    }
}  // ← end processHandResult

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    processHandResult,
};
