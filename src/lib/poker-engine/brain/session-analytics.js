/**
 * brain/session-analytics.js — Performance tracking, opponent reads, journals, session management
 *
 * Extracted from HorsePokerBrain.js monolith (Phase 5: Analytics, Meta-Game & Persistence)
 *
 * Exports:
 *   - Performance: recordPerformanceAction, getPerformanceStats, recordPerformanceResult, getAdaptiveStrategy
 *   - Stake: getRecommendedStake
 *   - Session: saveSessionAnalytics, canRebuy, evaluateSessions, getDynamicRebuyStrategy
 *   - Session tracking: recordSitDown, recordRebuy, clearTableSessions, getTodayString
 *   - Soft play: isSoftPlayAllowed, recordSoftPlay
 *   - Opponent reads: saveOpponentRead, saveKeyHand
 *   - Evolution: evolveHorseSkill, getSkillDrift, getSessionReview
 *   - Multi-table: canSitAtTable, cleanupMultiTable, getChatMessages
 *   - GTO: warmGTOCache
 *   - Journals: persistOpponentJournal, loadOpponentJournal, persistTableJournals, loadTableJournals, _applyJournalToProfile
 */

const {
    getSupabase, isHorse, getAdvancedModule, getPersonalityModule, getGTOModule,
    evolutionTracker, chatMessages, multiTableTracker,
} = require('./core');
const { crossTableRadar, tableTimebankBlacklist } = require('./anti-exploit');

// Lazy-load live-observer to avoid circular dependency
let _liveObserver = null;
function _getLO() {
    if (!_liveObserver) {
        try { _liveObserver = require('./live-observer'); }
        catch (_) { _liveObserver = {}; }
    }
    return _liveObserver;
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION & BANKROLL TRACKING (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════

const sessionTracker = new Map();
const dailyPlayTracker = new Map();

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function recordSitDown(tableId, playerId, buyInAmount) {
    if (!sessionTracker.has(tableId)) {
        sessionTracker.set(tableId, new Map());
    }
    const tableSessions = sessionTracker.get(tableId);
    if (!tableSessions.has(playerId)) {
        tableSessions.set(playerId, {
            startTime: Date.now(),
            startingStack: buyInAmount,
            buyinsUsed: 1,
            lastEvalMs: Date.now()
        });
        getAdvancedModule().then(adv => {
            if (adv?.recordSessionStart) adv.recordSessionStart(playerId);
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        if (!multiTableTracker.has(playerId)) multiTableTracker.set(playerId, new Set());
        multiTableTracker.get(playerId).add(tableId);
        console.debug(`[HorseBrain] Session started for ${playerId.substring(0, 8)} at ${tableId} (Buy-in: ${buyInAmount})`);
    }
}

function recordRebuy(tableId, playerId, amount) {
    const tableSessions = sessionTracker.get(tableId);
    if (!tableSessions) return;
    const session = tableSessions.get(playerId);
    if (session) {
        session.buyinsUsed += 1;
        console.debug(`[HorseBrain] Rebuy recorded for ${playerId.substring(0, 8)} at ${tableId} (Buyins used: ${session.buyinsUsed})`);
    }
}

function clearTableSessions(tableId) {
    sessionTracker.delete(tableId);

    // Clean up cross-table radar (Module 10)
    for (const [oppId, tableSet] of crossTableRadar) {
        tableSet.delete(tableId);
        if (tableSet.size === 0) crossTableRadar.delete(oppId);
    }
    // Clean up timebank blacklist if expired
    if ((tableTimebankBlacklist.get(tableId) || 0) < Date.now()) {
        tableTimebankBlacklist.delete(tableId);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5: ANALYTICS, META-GAME & PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

const performanceStats = new Map();

function recordPerformanceAction(profileId, street, action, wasVoluntary = false) {
    if (!performanceStats.has(profileId)) {
        performanceStats.set(profileId, {
            handsPlayed: 0, vpipHands: 0, pfrHands: 0,
            raises: 0, calls: 0, folds: 0, checks: 0,
            wins: 0, losses: 0, totalWonBB: 0,
            sessionStart: Date.now()
        });
    }
    const stats = performanceStats.get(profileId);
    if (street === 'preflop') {
        stats.handsPlayed++;
        if (wasVoluntary || action === 'call' || action === 'raise' || action === 'bet') {
            stats.vpipHands++;
        }
        if (action === 'raise' || action === 'bet') {
            stats.pfrHands++;
        }
    }
    if (action === 'raise' || action === 'bet') stats.raises++;
    else if (action === 'call') stats.calls++;
    else if (action === 'fold') stats.folds++;
    else if (action === 'check') stats.checks++;
}

function getPerformanceStats(profileId) {
    const stats = performanceStats.get(profileId);
    if (!stats || stats.handsPlayed === 0) {
        return { vpip: 0, pfr: 0, af: 0, winRate: 0, handsPlayed: 0 };
    }
    return {
        vpip: Math.round((stats.vpipHands / stats.handsPlayed) * 100),
        pfr: Math.round((stats.pfrHands / stats.handsPlayed) * 100),
        af: stats.calls > 0 ? Math.round((stats.raises / stats.calls) * 10) / 10 : stats.raises,
        winRate: stats.handsPlayed > 0 ? Math.round((stats.totalWonBB / stats.handsPlayed) * 100) / 100 : 0,
        handsPlayed: stats.handsPlayed,
        wins: stats.wins,
        losses: stats.losses,
        sessionMinutes: Math.round((Date.now() - stats.sessionStart) / 60000)
    };
}

function recordPerformanceResult(profileId, won, bbWonLost) {
    const stats = performanceStats.get(profileId);
    if (!stats) return;
    if (won) stats.wins++;
    else stats.losses++;
    stats.totalWonBB += bbWonLost;
}

function getAdaptiveStrategy(profileId) {
    const stats = performanceStats.get(profileId);
    if (!stats || stats.handsPlayed < 30) {
        return { rangeAdjust: 0, aggressionAdjust: 0, reason: 'insufficient_data' };
    }
    const winRate = stats.totalWonBB / stats.handsPlayed;
    if (winRate > 0.10) return { rangeAdjust: -5, aggressionAdjust: -3, reason: 'protecting_profit' };
    if (winRate > 0.05) return { rangeAdjust: -2, aggressionAdjust: -1, reason: 'slight_lock_up' };
    if (winRate < -0.05 && winRate >= -0.10) return { rangeAdjust: 3, aggressionAdjust: 2, reason: 'finding_spots' };
    if (winRate < -0.10) return { rangeAdjust: 5, aggressionAdjust: 4, reason: 'adjusting_to_table' };
    return { rangeAdjust: 0, aggressionAdjust: 0, reason: 'balanced' };
}

function getRecommendedStake(bankroll, gameType = 'Cash') {
    if (gameType === 'Tournament') {
        const maxBuyIn = Math.floor(bankroll / 50);
        return { maxBuyIn, recommendedBlinds: null, reason: `tournament_buyIn_${maxBuyIn}` };
    }
    const maxBBBankroll = bankroll / 25;
    const maxBB = maxBBBankroll / 100;
    const stakes = [
        { sb: 0.25, bb: 0.50 }, { sb: 0.50, bb: 1 }, { sb: 1, bb: 2 },
        { sb: 2, bb: 5 }, { sb: 5, bb: 10 }, { sb: 10, bb: 25 },
        { sb: 25, bb: 50 }, { sb: 50, bb: 100 }
    ];
    let recommended = stakes[0];
    for (const stake of stakes) {
        if (stake.bb <= maxBB) recommended = stake;
        else break;
    }
    return {
        maxBuyIn: Math.round(recommended.bb * 100),
        recommendedBlinds: recommended,
        reason: `bankroll_${bankroll}_supports_${recommended.bb}bb`
    };
}

async function saveSessionAnalytics(profileId, tableId) {
    try {
        const stats = getPerformanceStats(profileId);
        if (stats.handsPlayed === 0) return false;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) return false;
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error } = await supabase.from('horse_session_stats').upsert({
            profile_id: profileId,
            table_id: tableId,
            hands_played: stats.handsPlayed,
            vpip: stats.vpip,
            pfr: stats.pfr,
            aggression_factor: stats.af,
            win_rate_bb100: stats.winRate,
            wins: stats.wins,
            losses: stats.losses,
            session_minutes: stats.sessionMinutes,
            recorded_at: new Date().toISOString()
        }, { onConflict: 'profile_id,table_id' });
        if (error) {
            console.warn(`[HorseBrain] Session save failed:`, error.message);
            return false;
        }
        console.debug(`[HorseBrain] Session analytics saved for ${profileId.substring(0, 8)}: ${stats.handsPlayed} hands, ${stats.vpip}% VPIP`);
        return true;
    } catch (err) {
        console.warn('[HorseBrain] Session analytics save error:', err.message);
        return false;
    }
}

// Anti-collusion soft play tracking
const softPlayLog = new Map();

function isSoftPlayAllowed(horse1Id, horse2Id) {
    const pairKey = [horse1Id, horse2Id].sort().join('|');
    const log = softPlayLog.get(pairKey) || [];
    const oneHourAgo = Date.now() - 3600000;
    const recent = log.filter(ts => ts > oneHourAgo);
    softPlayLog.set(pairKey, recent);
    return recent.length < 3;
}

function recordSoftPlay(horse1Id, horse2Id) {
    const pairKey = [horse1Id, horse2Id].sort().join('|');
    const log = softPlayLog.get(pairKey) || [];
    log.push(Date.now());
    softPlayLog.set(pairKey, log);
}

function getDynamicRebuyStrategy(profileId, currentStack, bb, buyInsUsed, tableAvgStack) {
    if (!bb || bb <= 0) bb = 2;
    const stackBB = currentStack / bb;
    if (buyInsUsed >= 3) {
        return { shouldRebuy: false, reason: 'max_buyins_reached', amount: 0 };
    }
    if (stackBB < 30) {
        const targetStack = Math.max(100 * bb, tableAvgStack);
        const rebuyAmount = targetStack - currentStack;
        return { shouldRebuy: true, reason: 'short_stacked', amount: Math.round(rebuyAmount) };
    }
    if (stackBB < 60 && tableAvgStack > currentStack * 1.5) {
        const rebuyAmount = tableAvgStack - currentStack;
        return { shouldRebuy: true, reason: 'below_table_average', amount: Math.round(rebuyAmount) };
    }
    return { shouldRebuy: false, reason: 'adequate_stack', amount: 0 };
}

async function saveOpponentRead(horseId, opponentId, read) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) return false;
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error } = await supabase.from('horse_opponent_reads').upsert({
            horse_id: horseId,
            opponent_id: opponentId,
            bluff_frequency: read.bluffFrequency,
            value_frequency: read.valueFrequency,
            fold_frequency: read.foldFrequency,
            call_frequency: read.callFrequency,
            hands_observed: read.handsObserved,
            tendency: read.tendency,
            updated_at: new Date().toISOString()
        }, { onConflict: 'horse_id,opponent_id' });
        if (!error) {
            console.debug(`[HorseBrain] Opponent read saved: ${horseId.substring(0, 8)} on ${opponentId.substring(0, 8)}`);
        }
        return !error;
    } catch (err) {
        return false;
    }
}

async function saveKeyHand(handData, bb = 2) {
    try {
        if (!handData?.result) return false;
        const potBB = (handData.result.pot || 0) / bb;
        if (potBB < 10) return false;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) return false;
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error } = await supabase.from('horse_hand_history').insert({
            hand_id: handData.handId || `hand_${Date.now()}`,
            table_id: handData.tableId,
            pot_size_bb: Math.round(potBB),
            players: JSON.stringify(handData.result.players?.map(p => ({
                id: p.id,
                won: handData.result.winners?.some(w => String(w.playerId) === String(p.id)),
                chipDelta: p.chipDelta
            })) || []),
            board: JSON.stringify(handData.result.board || []),
            recorded_at: new Date().toISOString()
        });
        return !error;
    } catch (err) {
        return false;
    }
}

function evolveHorseSkill(profileId, sessionWinRate) {
    const current = evolutionTracker.get(profileId) || { drift: 0, sessions: 0 };
    current.sessions++;
    if (sessionWinRate > 5) {
        current.drift = Math.min(10, current.drift + 1);
    } else if (sessionWinRate < -5) {
        current.drift = Math.max(-5, current.drift - 0.5);
    }
    evolutionTracker.set(profileId, current);
    const sb = getSupabase();
    if (sb) {
        sb.from('horse_session_stats')
            .upsert({
                profile_id: profileId,
                table_id: `evolution_${profileId}`,
                hands_played: current.sessions,
                vpip: 0, pfr: 0, aggression_factor: 0,
                win_rate_bb100: current.drift,
                wins: current.drift > 0 ? current.sessions : 0,
                losses: current.drift < 0 ? current.sessions : 0,
                session_minutes: 0,
                recorded_at: new Date().toISOString()
            }, { onConflict: 'profile_id,table_id' })
            .then(() => console.debug(`[HorseBrain] Skill drift persisted for ${profileId.substring(0, 8)}: ${current.drift > 0 ? '+' : ''}${current.drift}`))
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    }
    return {
        skillDrift: current.drift,
        direction: current.drift > 2 ? 'improving' : current.drift < -2 ? 'regressing' : 'stable'
    };
}

function getSkillDrift(profileId) {
    return (evolutionTracker.get(profileId) || { drift: 0 }).drift;
}

function getSessionReview(profileId) {
    const stats = getPerformanceStats(profileId);
    const adaptive = getAdaptiveStrategy(profileId);
    const drift = getSkillDrift(profileId);
    return {
        profileId: profileId.substring(0, 8),
        handsPlayed: stats.handsPlayed,
        duration: `${stats.sessionMinutes}m`,
        vpip: `${stats.vpip}%`,
        pfr: `${stats.pfr}%`,
        af: stats.af,
        winRate: `${stats.winRate} BB/hand`,
        wins: stats.wins,
        losses: stats.losses,
        strategyAdjustment: adaptive.reason,
        skillEvolution: drift > 0 ? `+${drift}` : `${drift}`,
        grade: stats.winRate > 0.05 ? 'A' :
            stats.winRate > 0 ? 'B' :
                stats.winRate > -0.05 ? 'C' : 'D'
    };
}

async function canSitAtTable(playerId) {
    const currentTables = multiTableTracker.get(playerId)?.size || 0;
    const personality = await getPersonalityModule();
    if (!personality?.getSkillTier) return true;
    const skill = personality.getSkillTier(playerId);
    const tableLimits = { fish: 1, recreational: 2, grinder: 3, reg: 4, crusher: 4 };
    const maxTables = tableLimits[skill.key] || 2;
    if (currentTables >= maxTables) {
        console.debug(`[HorseBrain] Multi-table limit: ${playerId.substring(0, 8)} at ${currentTables}/${maxTables} tables`);
        return false;
    }
    return true;
}

function getChatMessages() {
    return chatMessages.splice(0);
}

function cleanupMultiTable(tableId, playerId) {
    const tables = multiTableTracker.get(playerId);
    if (tables) {
        tables.delete(tableId);
        if (tables.size === 0) multiTableTracker.delete(playerId);
    }
}

async function warmGTOCache() {
    try {
        const gto = await getGTOModule();
        if (!gto?.getPreflopRange) return;
        const positions = ['BTN', 'CO', 'HJ', 'SB', 'BB', 'UTG', 'MP'];
        const topologies = ['6-Max'];
        const depths = ['100BB'];
        let loaded = 0;
        for (const pos of positions) {
            for (const topo of topologies) {
                for (const depth of depths) {
                    const chartName = `${pos}_Open_${depth}_${topo}`;
                    await gto.getPreflopRange(chartName);
                    loaded++;
                }
            }
        }
        console.debug(`[HorseBrain] GTO cache warmed: ${loaded} charts pre-loaded`);
    } catch (err) {
        console.warn('[HorseBrain] GTO cache warming failed:', err.message);
    }
}

async function canRebuy(tableId, playerId, minBuyIn = 0, clubId = null) {
    const tableSessions = sessionTracker.get(tableId);
    if (!tableSessions) return true;
    const session = tableSessions.get(playerId);
    if (!session) return true;
    const personality = await getPersonalityModule();
    if (personality && typeof personality.getSessionProfile === 'function') {
        const sessionPref = personality.getSessionProfile(playerId);
        if (session.buyinsUsed >= sessionPref.maxBuyins) {
            console.debug(`[HorseBrain] Stop-Loss: ${playerId.substring(0, 8)} reached max buyins (${sessionPref.maxBuyins}). No rebuy allowed.`);
            return false;
        }
    }
    const sb = getSupabase();
    if (sb && clubId) {
        try {
            const { data, error } = await sb
                .from('club_members')
                .select('chip_balance')
                .eq('club_id', clubId)
                .eq('profile_id', playerId)
                .maybeSingle();
            if (error) throw error;
            const realBalance = data?.chip_balance || 0;
            if (realBalance <= 0 || realBalance < minBuyIn) {
                console.debug(`[HorseBrain] BANKRUPT: ${playerId.substring(0, 8)} has only ${realBalance} chips in club. Rebuy DENIED until 9AM reload.`);
                return false;
            }
        } catch (err) {
            console.warn(`[HorseBrain] Failed to verify bankroll for ${playerId.substring(0, 8)}, defaulting to deny:`, err.message);
            return false;
        }
    }
    return true;
}

async function evaluateSessions(gameController, tableManager) {
    if (!tableManager || !tableManager.seats) return;
    const tableId = tableManager.id;
    const tableSessions = sessionTracker.get(tableId);
    if (!tableSessions) return;
    const now = Date.now();
    const today = getTodayString();
    const personality = await getPersonalityModule();
    for (const seat of tableManager.seats) {
        if (!seat.player || seat.status === 'empty') continue;
        const playerId = seat.player.id;
        const session = tableSessions.get(playerId);
        if (!session) continue;
        const isAI = await isHorse(playerId);
        if (!isAI) {
            tableSessions.delete(playerId);
            continue;
        }
        let daily = dailyPlayTracker.get(playerId);
        if (!daily || daily.dateString !== today) {
            daily = { dateString: today, totalMs: 0 };
        }
        const elapsedSinceLastEval = now - session.lastEvalMs;
        daily.totalMs += elapsedSinceLastEval;
        dailyPlayTracker.set(playerId, daily);
        session.lastEvalMs = now;
        const SIXTEEN_HOURS_MS = 57600000;
        if (daily.totalMs >= SIXTEEN_HOURS_MS) {
            console.debug(`[HorseBrain] Daily 16-hour limit reached for ${playerId.substring(0, 8)}. Forcing standUp.`);
            tableSessions.delete(playerId);
            await gameController.standUp(tableId, playerId);
            continue;
        }
        if (personality && typeof personality.shouldCashOut === 'function') {
            const minutesPlayed = (now - session.startTime) / 60000;
            const currentStack = seat.stack;
            let estimatedTilt = 0.1;
            try {
                const adv = await getAdvancedModule();
                if (adv?.getTiltLevel) {
                    estimatedTilt = adv.getTiltLevel(playerId) / 10;
                }
            } catch (_) {
                estimatedTilt = session.buyinsUsed > 1 && currentStack <= 0 ? 0.95 : 0.1;
            }
            const { shouldLeave, reason } = personality.shouldCashOut(
                playerId, currentStack, session.startingStack,
                minutesPlayed, session.buyinsUsed, estimatedTilt
            );
            if (shouldLeave) {
                console.debug(`[HorseBrain] Cashout triggered for ${playerId.substring(0, 8)}. Reason: ${reason}`);
                saveSessionAnalytics(playerId, tableId).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                tableSessions.delete(playerId);
                await gameController.standUp(tableId, playerId);
            } else {
                const avgStack = tableManager.seats
                    .filter(s => s.player && s.status !== 'empty')
                    .reduce((sum, s) => sum + (s.stack || 0), 0) / Math.max(1, tableManager.seats.filter(s => s.player).length);
                const bb = tableManager.bigBlind || 2;
                const minBuyIn = bb * 20;
                const rebuyInfo = getDynamicRebuyStrategy(playerId, currentStack, bb, session.buyinsUsed, avgStack);
                if (rebuyInfo.shouldRebuy && await canRebuy(tableId, playerId, minBuyIn, tableManager.clubId)) {
                    console.debug(`[HorseBrain] Dynamic rebuy for ${playerId.substring(0, 8)}: ${rebuyInfo.reason}, amount: ${rebuyInfo.amount}`);
                    if (tableManager.clubId) {
                        const ChipBridge = require('../ChipBridge');
                        const lockResult = await ChipBridge.rebuyChips(tableManager.clubId, playerId, tableId, rebuyInfo.amount);
                        if (!lockResult.success) {
                            console.warn(`[HorseBrain] Failed to physically lock rebuy chips for ${playerId}:`, lockResult.error);
                            continue;
                        }
                    }
                    recordRebuy(tableId, playerId, rebuyInfo.amount);
                    if (seat.player) seat.player.stack = (seat.player.stack || 0) + rebuyInfo.amount;
                    if (seat.stack !== undefined) seat.stack = (seat.stack || 0) + rebuyInfo.amount;
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENT OPPONENT JOURNAL SYSTEM (Phase 14)
// ═══════════════════════════════════════════════════════════════════════════

const _journalCache = new Map();
const JOURNAL_CACHE_TTL = 30 * 60 * 1000;
const JOURNAL_PERSIST_INTERVAL = 15;

async function persistOpponentJournal(horseId, opponentId, profile) {
    try {
        if (!profile || profile.handsObserved < 5) return false;
        const sb = getSupabase();
        if (!sb) return false;
        const avgFlop = profile.flopBetSizes.length > 0
            ? profile.flopBetSizes.reduce((a, b) => a + b, 0) / profile.flopBetSizes.length : 0;
        const avgTurn = profile.turnBetSizes.length > 0
            ? profile.turnBetSizes.reduce((a, b) => a + b, 0) / profile.turnBetSizes.length : 0;
        const avgRiver = profile.riverBetSizes.length > 0
            ? profile.riverBetSizes.reduce((a, b) => a + b, 0) / profile.riverBetSizes.length : 0;
        const avgPFR = profile.preflopRaiseSizes.length > 0
            ? profile.preflopRaiseSizes.reduce((a, b) => a + b, 0) / profile.preflopRaiseSizes.length : 0;
        const { data: existing } = await sb
            .from('horse_opponent_journals')
            .select('hands_observed, session_count')
            .eq('horse_id', horseId)
            .eq('opponent_id', opponentId)
            .maybeSingle();
        const payload = {
            horse_id: horseId,
            opponent_id: opponentId,
            vpip_count: profile.vpipCount,
            pfr_count: profile.pfrCount,
            three_bet_count: profile.threeBetCount,
            three_bet_opportunity: profile.threeBetOpportunity,
            four_bet_count: profile.fourBetCount,
            fold_to_three_bet: profile.foldToThreeBet,
            faced_three_bet: profile.facedThreeBet,
            cold_call_count: profile.coldCallCount,
            limp_count: profile.limpCount,
            steal_attempt_count: profile.stealAttemptCount,
            steal_opportunity: profile.stealOpportunity || 0,
            fold_to_steal: profile.foldToSteal,
            cbet_count: profile.cBetCount,
            cbet_opportunity: profile.cBetOpportunity,
            fold_to_cbet: profile.foldToCBet,
            faced_cbet: profile.facedCBet,
            second_barrel_count: profile.secondBarrelCount,
            second_barrel_opportunity: profile.secondBarrelOpportunity,
            third_barrel_count: profile.thirdBarrelCount,
            third_barrel_opportunity: profile.thirdBarrelOpportunity,
            check_raise_count: profile.checkRaiseCount,
            donk_bet_count: profile.donkBetCount,
            probe_bet_count: profile.probeBetCount,
            fold_to_raise: profile.foldToRaise,
            faced_raise: profile.facedRaise,
            total_bets: profile.totalBets,
            total_calls: profile.totalCalls,
            total_checks: profile.totalChecks,
            total_folds: profile.totalFolds,
            went_to_showdown: profile.wentToShowdown,
            won_at_showdown: profile.wonAtShowdown,
            showdown_bluffs: profile.showdownBluffs,
            overbet_count: profile.overbetCount,
            total_decision_time_ms: profile.totalDecisionTimeMs,
            decision_count: profile.decisionCount,
            snap_action_count: profile.snapActionCount,
            long_tank_count: profile.longTankCount,
            hands_observed: profile.handsObserved,
            actions_by_position: profile.actionsByPosition || {},
            avg_flop_bet: avgFlop,
            avg_turn_bet: avgTurn,
            avg_river_bet: avgRiver,
            avg_preflop_raise: avgPFR,
            updated_at: new Date().toISOString(),
        };
        const totalActions = profile.totalBets + profile.totalCalls + profile.totalChecks + profile.totalFolds;
        let detectedType = 'unknown';
        if (profile.handsObserved >= 10 && totalActions > 0) {
            const v = profile.vpipCount / profile.handsObserved;
            const p_ = profile.pfrCount / profile.handsObserved;
            const af = totalActions > 0 ? profile.totalBets / totalActions : 0.33;
            if (v < 0.18 && p_ < 0.12) detectedType = 'nit';
            else if (v < 0.24 && p_ >= 0.16 && af >= 0.38) detectedType = 'TAG';
            else if (v >= 0.28 && p_ >= 0.20 && af >= 0.42) detectedType = 'LAG';
            else if (v >= 0.35 && af < 0.28) detectedType = 'calling_station';
            else if (v >= 0.45 && af >= 0.48) detectedType = 'maniac';
            else detectedType = 'balanced';
        }
        payload.last_known_player_type = detectedType;
        const { error } = await sb.from('horse_opponent_journals').upsert(payload, {
            onConflict: 'horse_id,opponent_id'
        });
        if (!error && existing && existing.hands_observed > 0) {
            await sb.from('horse_opponent_journals')
                .update({ session_count: (existing.session_count || 1) + 1 })
                .eq('horse_id', horseId)
                .eq('opponent_id', opponentId)
                .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
        if (!error) {
            console.debug(`[HorseBrain] JOURNAL SAVED: ${horseId.substring(0, 8)} -> ${opponentId.substring(0, 8)} (${profile.handsObserved} hands, type=${detectedType})`);
            _journalCache.set(`${horseId}:${opponentId}`, { loaded: true, persisted: Date.now(), timestamp: Date.now() });
        }
        return !error;
    } catch (err) {
        console.warn(`[HorseBrain] Journal persist error: ${err.message}`);
        return false;
    }
}

async function loadOpponentJournal(horseId, tableId, opponentId) {
    try {
        const cacheKey = `${horseId}:${opponentId}`;
        const cached = _journalCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < JOURNAL_CACHE_TTL) {
            return cached.loaded;
        }
        const sb = getSupabase();
        if (!sb) {
            _journalCache.set(cacheKey, { loaded: false, timestamp: Date.now() });
            return false;
        }
        const { data } = await sb
            .from('horse_opponent_journals')
            .select('*')
            .eq('horse_id', horseId)
            .eq('opponent_id', opponentId)
            .maybeSingle();
        if (!data || data.hands_observed < 5) {
            _journalCache.set(cacheKey, { loaded: false, timestamp: Date.now() });
            return false;
        }
        // Seed the live observer profile with journal data
        const lo = _getLO();
        if (lo._getTableObserver && lo._createLiveProfile) {
            const observer = lo._getTableObserver(horseId, tableId);
            if (!observer.opponents.has(opponentId)) {
                observer.opponents.set(opponentId, lo._createLiveProfile());
            }
            const profile = observer.opponents.get(opponentId);
            // Only seed if live profile has fewer observations than the journal
            // (don't overwrite fresh live data with stale historical data)
            if (profile.handsObserved < data.hands_observed) {
                _applyJournalToProfile(profile, data);
            }
        }
        _journalCache.set(cacheKey, { loaded: true, timestamp: Date.now() });
        return true;
    } catch (err) {
        console.warn(`[HorseBrain] Journal load error: ${err.message}`);
        _journalCache.set(cacheKey, { loaded: false, timestamp: Date.now() });
        return false;
    }
}

async function persistTableJournals(horseId, tableId) {
    try {
        // NOTE: Requires access to liveObserver from anti-exploit module
        // During migration, this is served from legacy monolith
        console.debug(`[HorseBrain] JOURNALS BATCH SAVE requested: ${horseId.substring(0, 8)} table=${tableId.substring(0, 8)}`);
    } catch (err) {
        console.warn(`[HorseBrain] Batch journal error: ${err.message}`);
    }
}

async function loadTableJournals(tableId, playerIds, horseIds) {
    try {
        const horseSet = new Set(horseIds);
        const opponents = playerIds.filter(id => !horseSet.has(String(id))).map(String);
        if (opponents.length === 0) return;
        const sb = getSupabase();
        if (!sb) return;
        const lo = _getLO();
        if (!lo._getTableObserver || !lo._createLiveProfile) return;
        for (const horseId of horseIds) {
            const { data: rows } = await sb
                .from('horse_opponent_journals')
                .select('*')
                .eq('horse_id', horseId)
                .in('opponent_id', opponents);
            if (!rows || rows.length === 0) continue;
            const observer = lo._getTableObserver(horseId, tableId);
            for (const data of rows) {
                const oppId = data.opponent_id;
                if (!observer.opponents.has(oppId)) {
                    observer.opponents.set(oppId, lo._createLiveProfile());
                }
                const profile = observer.opponents.get(oppId);
                // Only seed if live profile has fewer observations
                if (profile.handsObserved < data.hands_observed) {
                    _applyJournalToProfile(profile, data);
                }
            }
        }
    } catch (err) {
        console.warn(`[HorseBrain] Table journal load error: ${err.message}`);
    }
}

function _applyJournalToProfile(profile, data) {
    if (!profile || typeof profile !== 'object') return;
    if (!data || typeof data !== 'object') return;
    profile.handsObserved = data.hands_observed;
    profile.vpipCount = data.vpip_count;
    profile.pfrCount = data.pfr_count;
    profile.threeBetCount = data.three_bet_count;
    profile.threeBetOpportunity = data.three_bet_opportunity;
    profile.fourBetCount = data.four_bet_count || 0;
    profile.foldToThreeBet = data.fold_to_three_bet;
    profile.facedThreeBet = data.faced_three_bet;
    profile.coldCallCount = data.cold_call_count;
    profile.limpCount = data.limp_count;
    profile.stealAttemptCount = data.steal_attempt_count;
    profile.stealOpportunity = data.steal_opportunity || 0;
    profile.foldToSteal = data.fold_to_steal;
    profile.cBetCount = data.cbet_count;
    profile.cBetOpportunity = data.cbet_opportunity;
    profile.foldToCBet = data.fold_to_cbet;
    profile.facedCBet = data.faced_cbet;
    profile.secondBarrelCount = data.second_barrel_count;
    profile.secondBarrelOpportunity = data.second_barrel_opportunity;
    profile.thirdBarrelCount = data.third_barrel_count;
    profile.thirdBarrelOpportunity = data.third_barrel_opportunity;
    profile.checkRaiseCount = data.check_raise_count;
    profile.donkBetCount = data.donk_bet_count;
    profile.probeBetCount = data.probe_bet_count;
    profile.foldToRaise = data.fold_to_raise;
    profile.facedRaise = data.faced_raise;
    profile.totalBets = data.total_bets;
    profile.totalCalls = data.total_calls;
    profile.totalChecks = data.total_checks;
    profile.totalFolds = data.total_folds;
    profile.wentToShowdown = data.went_to_showdown;
    profile.wonAtShowdown = data.won_at_showdown;
    profile.showdownBluffs = data.showdown_bluffs;
    profile.overbetCount = data.overbet_count;
    profile.totalDecisionTimeMs = data.total_decision_time_ms;
    profile.decisionCount = data.decision_count;
    profile.snapActionCount = data.snap_action_count;
    profile.longTankCount = data.long_tank_count;
    profile.actionsByPosition = data.actions_by_position || {};
    if (data.avg_flop_bet > 0) profile.flopBetSizes = [data.avg_flop_bet, data.avg_flop_bet, data.avg_flop_bet];
    if (data.avg_turn_bet > 0) profile.turnBetSizes = [data.avg_turn_bet, data.avg_turn_bet, data.avg_turn_bet];
    if (data.avg_river_bet > 0) profile.riverBetSizes = [data.avg_river_bet, data.avg_river_bet, data.avg_river_bet];
    if (data.avg_preflop_raise > 0) profile.preflopRaiseSizes = [data.avg_preflop_raise, data.avg_preflop_raise, data.avg_preflop_raise];
    profile._journalSeeded = true;
    profile._journalHands = data.hands_observed;
    profile._journalSessionCount = data.session_count || 1;
    const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : Date.now();
    const ageHours = (Date.now() - updatedAt) / (1000 * 60 * 60);
    profile._journalFreshness = Math.max(0.15, Math.exp(-ageHours / 120));
    console.debug(`[HorseBrain] JOURNAL APPLIED: ${data.opponent_id?.substring(0, 8)} (${data.hands_observed}h, ${data.session_count || 1} sessions, freshness=${Math.round(profile._journalFreshness * 100)}%)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    // Session tracking
    sessionTracker,
    dailyPlayTracker,
    getTodayString,
    recordSitDown,
    recordRebuy,
    clearTableSessions,
    canRebuy,
    evaluateSessions,

    // Performance stats
    performanceStats,
    recordPerformanceAction,
    getPerformanceStats,
    recordPerformanceResult,
    getAdaptiveStrategy,

    // Stake selection
    getRecommendedStake,

    // Session analytics
    saveSessionAnalytics,

    // Soft play
    softPlayLog,
    isSoftPlayAllowed,
    recordSoftPlay,

    // Rebuy strategy
    getDynamicRebuyStrategy,

    // Opponent reads
    saveOpponentRead,
    saveKeyHand,

    // Evolution
    evolveHorseSkill,
    getSkillDrift,
    getSessionReview,

    // Multi-table
    canSitAtTable,
    cleanupMultiTable,
    getChatMessages,

    // GTO
    warmGTOCache,

    // Journal system
    _journalCache,
    JOURNAL_CACHE_TTL,
    JOURNAL_PERSIST_INTERVAL,
    persistOpponentJournal,
    loadOpponentJournal,
    persistTableJournals,
    loadTableJournals,
    _applyJournalToProfile,
};
