/**
 * brain/live-observer.js — Always-on opponent tracking at every table
 *
 * The Live Observer System watches every action at every table where a horse
 * is seated, building real-time opponent profiles without requiring showdowns.
 * These profiles feed into the decision engine via getLiveRead().
 *
 * Key features:
 *   - Per-opponent VPIP, PFR, 3-bet, fold-to-3-bet, c-bet, aggression stats
 *   - Position-aware stats (EP/MP/CO/BTN/SB/BB)
 *   - Average bet sizing per street
 *   - Timing tells: snap-action count, long-tank count, avg decision time
 *   - In-hand action sequence for current hand
 *   - LRU eviction to prevent unbounded memory growth
 *
 * Dependencies:
 *   - session-analytics.js: loadTableJournals (lazy-loaded to avoid circular deps)
 */

// How often (in hands) to persist opponent journal data to Supabase.
// Mirrors the value in session-analytics.js. Defined here to avoid
// circular-dependency issues with the lazy-load pattern.
const JOURNAL_PERSIST_INTERVAL = 15;

// Lazy-load session-analytics to avoid circular dependency
let _sessionAnalytics = null;
function _getSA() {
    if (!_sessionAnalytics) {
        try { _sessionAnalytics = require('./session-analytics'); }
        catch (_) { _sessionAnalytics = {}; }
    }
    return _sessionAnalytics;
}
function loadTableJournals(tableId, playerIds, horseIds) {
    try {
        const fn = _getSA().loadTableJournals;
        return fn ? fn(tableId, playerIds, horseIds) : Promise.resolve();
    } catch (_) { return Promise.resolve(); }
}
function persistTableJournals(horseId, tableId) {
    try {
        const fn = _getSA().persistTableJournals;
        return fn ? fn(horseId, tableId) : Promise.resolve();
    } catch (_) { return Promise.resolve(); }
}
function persistOpponentJournal(horseId, opponentId, profile) {
    try {
        const fn = _getSA().persistOpponentJournal;
        return fn ? fn(horseId, opponentId, profile) : Promise.resolve();
    } catch (_) { return Promise.resolve(); }
}

const liveObserver = new Map(); // horseId → Map<tableId, TableObserver>

/**
 * Initialize or get a TableObserver for a horse at a table.
 */
function _getTableObserver(horseId, tableId) {
    if (!liveObserver.has(horseId)) liveObserver.set(horseId, new Map());
    const horseTables = liveObserver.get(horseId);
    if (!horseTables.has(tableId)) {
        horseTables.set(tableId, {
            opponents: new Map(),
            currentHand: null,
        });
        // LRU: cap tables per horse to prevent unbounded growth
        _evictLRUTables(horseTables);
    }
    return horseTables.get(tableId);
}

/**
 * Create a fresh LiveProfile for a new opponent.
 */
function _createLiveProfile() {
    return {
        // ── Core preflop stats ──
        handsObserved: 0,
        vpipCount: 0,
        pfrCount: 0,
        threeBetCount: 0,
        threeBetOpportunity: 0,
        fourBetCount: 0,
        fourBetOpportunity: 0,
        foldToThreeBet: 0,
        facedThreeBet: 0,
        coldCallCount: 0,
        coldCallOpportunity: 0,
        limpCount: 0,
        stealAttemptCount: 0,    // Open-raise from CO/BTN/SB
        stealOpportunity: 0,
        foldToSteal: 0,
        facedSteal: 0,

        // ── Postflop stats ──
        cBetCount: 0,
        cBetOpportunity: 0,
        foldToCBet: 0,
        facedCBet: 0,
        secondBarrelCount: 0,
        secondBarrelOpportunity: 0,
        thirdBarrelCount: 0,
        thirdBarrelOpportunity: 0,
        checkRaiseCount: 0,
        checkRaiseOpportunity: 0,
        donkBetCount: 0,
        donkBetOpportunity: 0,
        probeBetCount: 0,
        probeBetOpportunity: 0,
        foldToRaise: 0,       // Folded when raised postflop
        facedRaise: 0,        // Faced a raise postflop

        // ── Aggression tracking ──
        totalBets: 0,          // bet + raise actions
        totalCalls: 0,
        totalChecks: 0,
        totalFolds: 0,

        // ── Showdown data ──
        wentToShowdown: 0,
        wonAtShowdown: 0,
        showdownBluffs: 0,     // Showed weak hand after aggression
        showdownHands: [],     // Recent showdown results (capped)

        // ── Sizing tracking ──
        preflopRaiseSizes: [],  // Recent preflop raise sizes (BB multiples)
        flopBetSizes: [],       // Recent bet sizes (fraction of pot)
        turnBetSizes: [],
        riverBetSizes: [],
        overbetCount: 0,

        // ── Timing tells ──
        totalDecisionTimeMs: 0,
        decisionCount: 0,
        snapActionCount: 0,     // Decided in < 3 seconds
        longTankCount: 0,       // Decided in > 15 seconds
        timingByStreet: {
            preflop: { totalMs: 0, count: 0 },
            flop: { totalMs: 0, count: 0 },
            turn: { totalMs: 0, count: 0 },
            river: { totalMs: 0, count: 0 },
        },

        // ── Position stats ──
        actionsByPosition: {}, // { 'BTN': { vpip: 0, pfr: 0, hands: 0 }, ... }

        // ── Meta ──
        firstSeen: Date.now(),
        lastSeen: Date.now(),
    };
}

/**
 * Create a fresh InHandModel for tracking the current hand.
 */
function _createInHandModel(handId, players) {
    const model = {
        handId,
        street: 'preflop',
        potSize: 0,
        playerActions: new Map(), // playerId → [{ street, action, amount, timing, betToPot }]
        preflopAggressor: null,    // Who was the last PFR?
        lastAggressor: null,       // Who was the last aggressor on current street?
        streetAggressors: { preflop: null, flop: null, turn: null, river: null },
        raiseCount: { preflop: 0, flop: 0, turn: 0, river: 0 },
        positions: new Map(),      // playerId → position string
        isMultiway: players.length > 2,
        actionTimestamps: new Map(), // playerId → last action timestamp (for timing tells)
    };
    for (const p of players) {
        model.playerActions.set(String(p.id || p.playerId || p), []);
        if (p.position) model.positions.set(String(p.id || p.playerId || p), p.position);
    }
    return model;
}

/**
 * ██ OBSERVE NEW HAND — Called when a new hand starts at a table. ██
 * Resets current-hand tracking for all horses watching this table.
 *
 * @param {string} tableId - Table identifier
 * @param {string} handId - Unique hand identifier
 * @param {Array} players - [{ id, position, stack }] — all players in the hand
 * @param {Array} horseIds - Horse IDs seated at this table
 * @param {number} bb - Big blind amount
 */
function observeNewHand(tableId, handId, players, horseIds, bb = 2) {
    for (const horseId of horseIds) {
        const observer = _getTableObserver(horseId, tableId);
        observer.currentHand = _createInHandModel(handId, players);
        observer.currentHand.bb = bb;

        // Increment handsObserved for all opponents at the table
        for (const p of players) {
            const pid = String(p.id || p.playerId || p);
            if (pid === horseId) continue; // Skip self
            if (!observer.opponents.has(pid)) {
                observer.opponents.set(pid, _createLiveProfile());
            }
            const profile = observer.opponents.get(pid);
            profile.handsObserved++;
            profile.lastSeen = Date.now();

            // Track position stats
            if (p.position) {
                if (!profile.actionsByPosition[p.position]) {
                    profile.actionsByPosition[p.position] = { vpip: 0, pfr: 0, hands: 0, threeBet: 0 };
                }
                profile.actionsByPosition[p.position].hands++;
            }
        }
    }

    // ═══ PERSISTENT JOURNAL: Fire-and-forget load of historical opponent data ═══
    // On the FIRST hand at a table, load journals for all opponents.
    // This gives horses an instant head-start with historical reads.
    const allPlayerIds = players.map(p => String(p.id || p.playerId || p));
    loadTableJournals(tableId, allPlayerIds, horseIds).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
}

/**
 * ██ OBSERVE ACTION — Called on EVERY player action at the table. ██
 * This is the core "always watching" function. Every horse at this table
 * receives every action and updates its opponent profiles in real-time.
 *
 * @param {string} tableId - Table identifier
 * @param {string} actorId - Player who took the action
 * @param {string} street - 'preflop', 'flop', 'turn', 'river'
 * @param {string} action - 'fold', 'check', 'call', 'raise', 'bet', 'all_in'
 * @param {Object} context - {
 *   amount: number,           // Bet/raise amount in chips
 *   potSize: number,          // Pot size before this action
 *   toCall: number,           // Amount needed to call
 *   decisionTimeMs: number,   // How long the player took to decide
 *   position: string,         // Actor's position (BTN, SB, BB, etc.)
 *   isOpenAction: boolean,    // First voluntary action preflop?
 *   facingRaiseCount: number, // How many raises before this action?
 * }
 * @param {Array} horseIds - All horse IDs watching this table
 */
function observeAction(tableId, actorId, street, action, context = {}, horseIds = []) {
    const actorStr = String(actorId);
    const {
        amount = 0, potSize = 0, toCall = 0, decisionTimeMs = 0,
        position = '', isOpenAction = false, facingRaiseCount = 0,
    } = context;
    const betToPot = potSize > 0 ? amount / potSize : 0;

    for (const horseId of horseIds) {
        if (horseId === actorStr) continue; // Don't observe self

        const observer = _getTableObserver(horseId, tableId);
        if (!observer.opponents.has(actorStr)) {
            observer.opponents.set(actorStr, _createLiveProfile());
            // LRU eviction: cap opponent profiles per table to prevent memory bloat
            _evictLRUProfiles(observer);
        }
        const profile = observer.opponents.get(actorStr);
        profile.lastSeen = Date.now();

        // ═══ Phase 45 FIX: capture pre-action streetAgg BEFORE bet/raise sets it.
        // probeBetOpportunity and donkBetOpportunity checks need to know if this
        // is the FIRST aggressive action on the street, but the aggressor tracking
        // below sets hand.streetAggressors[street] before those checks run. ═══
        const hand = observer.currentHand || null;
        const preActionStreetAgg = hand ? (hand.streetAggressors[street] || null) : null;

        // ── Record in current-hand model ──
        if (hand) {
            hand.street = street;

            if (!hand.playerActions.has(actorStr)) {
                hand.playerActions.set(actorStr, []);
            }
            hand.playerActions.get(actorStr).push({
                street, action, amount, betToPot, timing: decisionTimeMs, position,
                timestamp: Date.now()
            });

            // Track raise counts per street
            if (action === 'raise' || action === 'all_in') {
                hand.raiseCount[street] = (hand.raiseCount[street] || 0) + 1;
                hand.lastAggressor = actorStr;
                hand.streetAggressors[street] = actorStr;
                if (street === 'preflop') hand.preflopAggressor = actorStr;
            }
            if (action === 'bet') {
                hand.lastAggressor = actorStr;
                hand.streetAggressors[street] = actorStr;
            }

            // Track action timestamps for timing
            hand.actionTimestamps.set(actorStr, Date.now());
        }

        // ═══════════════════════════════════════
        // ██ PREFLOP STAT TRACKING ██
        // ═══════════════════════════════════════
        if (street === 'preflop') {
            // VPIP: any voluntary action except posting blinds or folding
            if (action !== 'fold' && action !== 'check') {
                profile.vpipCount++;
                if (position && profile.actionsByPosition[position]) {
                    profile.actionsByPosition[position].vpip++;
                }
            }

            // PFR: any raise or all-in preflop
            if (action === 'raise' || action === 'all_in') {
                profile.pfrCount++;
                if (position && profile.actionsByPosition[position]) {
                    profile.actionsByPosition[position].pfr++;
                }

                // Steal attempt tracking (open-raise from CO/BTN/SB)
                if (isOpenAction && ['CO', 'BTN', 'SB', 'D'].includes(position)) {
                    profile.stealAttemptCount++;
                }

                // 3-bet detection: raising when already facing a raise
                if (facingRaiseCount === 1) {
                    profile.threeBetCount++;
                    if (position && profile.actionsByPosition[position]) {
                        profile.actionsByPosition[position].threeBet++;
                    }
                }
                // 4-bet detection
                if (facingRaiseCount >= 2) {
                    profile.fourBetCount++;
                }

                // Track preflop sizing
                if (amount > 0 && observer.currentHand) {
                    const bbAmt = observer.currentHand.bb || 2;
                    profile.preflopRaiseSizes.push(amount / bbAmt);
                    if (profile.preflopRaiseSizes.length > 30) {
                        profile.preflopRaiseSizes = profile.preflopRaiseSizes.slice(-20);
                    }
                }
            }

            // Limp detection (just calling the big blind)
            if (action === 'call' && facingRaiseCount === 0) {
                profile.limpCount++;
            }

            // Cold call (calling a raise without having put money in yet)
            if (action === 'call' && facingRaiseCount >= 1 && isOpenAction) {
                profile.coldCallCount++;
            }

            // Fold to 3-bet
            if (action === 'fold' && facingRaiseCount >= 2) {
                profile.foldToThreeBet++;
            }

            // Facing 3-bet (had raised, now faces a re-raise)
            if (facingRaiseCount >= 2) {
                profile.facedThreeBet++;
                // ═══ Phase 43 FIX: was incrementing threeBetOpportunity here too, but facing 2+ raises
                // is a 4-bet opportunity, NOT a 3-bet opportunity. Line below already handles 3-bet opp. ═══
            }

            // 3-bet opportunity (someone raised before us)
            if (facingRaiseCount === 1) {
                profile.threeBetOpportunity++;
            }

            // 4-bet opportunity
            if (facingRaiseCount >= 2) {
                profile.fourBetOpportunity++;
            }

            // Fold to steal
            if (action === 'fold' && position && ['BB', 'SB'].includes(position)) {
                const hand = observer.currentHand;
                if (hand && hand.raiseCount.preflop === 1) {
                    // Single raise from late position = steal attempt
                    const raiserPos = hand.positions.get(hand.preflopAggressor);
                    if (['CO', 'BTN', 'SB', 'D'].includes(raiserPos)) {
                        profile.foldToSteal++;
                    }
                }
            }
            if (position && ['BB', 'SB'].includes(position)) {
                const hand = observer.currentHand;
                if (hand && hand.raiseCount.preflop === 1) {
                    const raiserPos = hand.positions.get(hand.preflopAggressor);
                    if (['CO', 'BTN', 'SB', 'D'].includes(raiserPos)) {
                        profile.facedSteal++;
                        // ═══ Phase 43 FIX: was outside this block — stealOpportunity only applies
                        // when actually facing a steal attempt (single late-position open) ═══
                        profile.stealOpportunity++;
                    }
                }
            }

            // Cold call opportunity
            if (facingRaiseCount >= 1) {
                profile.coldCallOpportunity++;
            }
        }

        // ═══════════════════════════════════════
        // ██ POSTFLOP STAT TRACKING ██
        // ═══════════════════════════════════════
        if (street !== 'preflop') {
            const hand = observer.currentHand;
            const isPFR = hand && hand.preflopAggressor === actorStr;
            const prevStreetAgg = hand ? hand.streetAggressors[
                street === 'flop' ? 'preflop' : street === 'turn' ? 'flop' : 'turn'
            ] : null;
            const wasLastStreetAggressor = prevStreetAgg === actorStr;

            // ── C-bet tracking ──
            if (street === 'flop' && isPFR) {
                profile.cBetOpportunity++;
                if (action === 'bet' || action === 'raise') {
                    profile.cBetCount++;
                }
            }

            // ── Fold to C-bet ──
            if (street === 'flop' && !isPFR && action === 'fold') {
                const flopAggressor = hand ? hand.streetAggressors.flop : null;
                if (flopAggressor && flopAggressor === hand.preflopAggressor) {
                    profile.foldToCBet++;
                }
            }
            if (street === 'flop' && !isPFR) {
                const flopAggressor = hand ? hand.streetAggressors.flop : null;
                if (flopAggressor && flopAggressor === hand.preflopAggressor) {
                    profile.facedCBet++;
                }
            }

            // ── Second barrel (turn bet after flop c-bet) ──
            if (street === 'turn' && wasLastStreetAggressor) {
                profile.secondBarrelOpportunity++;
                if (action === 'bet' || action === 'raise') {
                    profile.secondBarrelCount++;
                }
            }

            // ── Third barrel (river bet after turn barrel) ──
            if (street === 'river' && wasLastStreetAggressor) {
                profile.thirdBarrelOpportunity++;
                if (action === 'bet' || action === 'raise') {
                    profile.thirdBarrelCount++;
                }
            }

            // ── Check-raise detection ──
            if (action === 'raise' && hand) {
                const myActions = hand.playerActions.get(actorStr) || [];
                const streetActions = myActions.filter(a => a.street === street);
                if (streetActions.length >= 2 && streetActions[streetActions.length - 2].action === 'check') {
                    profile.checkRaiseCount++;
                }
            }
            // Check-raise opportunity: checked and someone bet after
            if (action === 'check') {
                profile.checkRaiseOpportunity++; // Approximate — refined at street end
            }

            // ── Donk bet detection (non-aggressor leading out) ──
            if ((action === 'bet') && !isPFR && !wasLastStreetAggressor) {
                profile.donkBetCount++;
            }
            // ═══ Phase 43 FIX: was counting ALL non-aggressor actions as donk opportunities.
            // A donk opportunity only exists when acting FIRST on a street (bet or check, no prior bet). ═══
            // ═══ Phase 45 FIX: use preActionStreetAgg instead of hand.streetAggressors[street]
            // because a 'bet' action sets the aggressor BEFORE this check runs. ═══
            if (!isPFR && !wasLastStreetAggressor && (action === 'bet' || action === 'check')) {
                // Only count if no one has bet on this street yet (i.e., this is a leading action)
                if (!preActionStreetAgg) {
                    profile.donkBetOpportunity++;
                }
            }

            // ── Probe bet (betting when previous street checked through) ──
            if (action === 'bet' && hand) {
                const prevStreet = street === 'turn' ? 'flop' : street === 'river' ? 'turn' : null;
                if (prevStreet && !hand.streetAggressors[prevStreet]) {
                    profile.probeBetCount++;
                }
            }
            // ═══ Phase 43+45 FIX: was counting ALL actions as probe opportunities — only count when
            // acting first on the street (bet or check) with no prior street aggression.
            // Phase 45: use preActionStreetAgg to avoid race condition where bet sets aggressor first. ═══
            if (hand && (action === 'bet' || action === 'check')) {
                const prevStreet = street === 'turn' ? 'flop' : street === 'river' ? 'turn' : null;
                if (prevStreet && !hand.streetAggressors[prevStreet] && !preActionStreetAgg) {
                    profile.probeBetOpportunity++;
                }
            }

            // ── Fold to raise (postflop) ──
            if (action === 'fold' && facingRaiseCount >= 1) {
                profile.foldToRaise++;
            }
            if (facingRaiseCount >= 1) {
                profile.facedRaise++;
            }

            // ── Bet sizing tracking ──
            if ((action === 'bet' || action === 'raise' || action === 'all_in') && betToPot > 0) {
                const sizeArr = street === 'flop' ? profile.flopBetSizes
                    : street === 'turn' ? profile.turnBetSizes
                    : profile.riverBetSizes;
                sizeArr.push(betToPot);
                if (sizeArr.length > 25) sizeArr.splice(0, sizeArr.length - 20);
                if (betToPot >= 1.0) profile.overbetCount++;
            }
        }

        // ═══════════════════════════════════════
        // ██ UNIVERSAL ACTION TRACKING ██
        // ═══════════════════════════════════════
        if (action === 'fold') profile.totalFolds++;
        else if (action === 'call') profile.totalCalls++;
        else if (action === 'check') profile.totalChecks++;
        else if (action === 'bet' || action === 'raise' || action === 'all_in') profile.totalBets++;

        // ═══════════════════════════════════════
        // ██ TIMING TELL TRACKING ██
        // ═══════════════════════════════════════
        if (decisionTimeMs > 0) {
            profile.totalDecisionTimeMs += decisionTimeMs;
            profile.decisionCount++;
            if (decisionTimeMs < 3000) profile.snapActionCount++; // < 3s = snap
            if (decisionTimeMs > 15000) profile.longTankCount++;  // > 15s = long tank

            // Per-street timing
            if (profile.timingByStreet[street]) {
                profile.timingByStreet[street].totalMs += decisionTimeMs;
                profile.timingByStreet[street].count++;
            }
        }

        // ═══ PERIODIC JOURNAL PERSISTENCE ═══
        // Every JOURNAL_PERSIST_INTERVAL hands, persist opponent data to Supabase.
        // Fire-and-forget — non-blocking, won't slow down the game.
        if (profile.handsObserved > 0 && profile.handsObserved % JOURNAL_PERSIST_INTERVAL === 0) {
            persistOpponentJournal(horseId, actorStr, profile).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
    }
}

/**
 * ██ OBSERVE SHOWDOWN — Called when cards are revealed at showdown. ██
 *
 * @param {string} tableId
 * @param {string} playerId - Player who showed cards
 * @param {boolean} won - Did they win the pot?
 * @param {number} handStrength - Hand strength 0-100
 * @param {boolean} wasBluff - Was their final action aggressive with a weak hand?
 * @param {Array} horseIds - All horse IDs watching this table
 */
function observeShowdown(tableId, playerId, won, handStrength, wasBluff, horseIds = []) {
    const pid = String(playerId);
    for (const horseId of horseIds) {
        if (horseId === pid) continue;
        const observer = _getTableObserver(horseId, tableId);
        if (!observer.opponents.has(pid)) continue;
        const profile = observer.opponents.get(pid);

        profile.wentToShowdown++;
        if (won) profile.wonAtShowdown++;
        if (wasBluff) profile.showdownBluffs++;

        profile.showdownHands.push({ won, handStrength, wasBluff, timestamp: Date.now() });
        if (profile.showdownHands.length > 40) {
            profile.showdownHands = profile.showdownHands.slice(-25);
        }
    }
}

/**
 * ██ GET LIVE READ — The master query function for live opponent data. ██
 *
 * Returns a comprehensive, real-time opponent profile that combines:
 * - Cross-hand stats (VPIP, PFR, 3-bet, c-bet, etc.)
 * - Timing tells (snap-actions, long-tanks)
 * - In-hand action sequences for the current hand
 * - Position-aware stats
 * - Sizing tendencies
 *
 * @param {string} horseId - The horse requesting the read
 * @param {string} tableId - Table they're at
 * @param {string} opponentId - Opponent to read
 * @returns {Object|null} Live opponent profile or null if insufficient data
 */
function getLiveRead(horseId, tableId, opponentId) {
    if (!liveObserver.has(horseId)) return null;
    const horseTables = liveObserver.get(horseId);
    if (!horseTables.has(tableId)) return null;
    const observer = horseTables.get(tableId);

    const oppStr = String(opponentId);
    if (!observer.opponents.has(oppStr)) return null;
    const p = observer.opponents.get(oppStr);

    // Need minimum observations for any meaningful read
    if (p.handsObserved < 5) return null;

    const totalActions = p.totalBets + p.totalCalls + p.totalChecks + p.totalFolds;
    if (totalActions < 6) return null;

    // ═══ CORE FREQUENCIES ═══
    const vpipPct = p.handsObserved > 0 ? p.vpipCount / p.handsObserved : 0.30;
    const pfrPct = p.handsObserved > 0 ? p.pfrCount / p.handsObserved : 0.15;
    const threeBetPct = p.threeBetOpportunity > 3 ? p.threeBetCount / p.threeBetOpportunity : null;
    const fourBetPct = p.fourBetOpportunity > 2 ? p.fourBetCount / p.fourBetOpportunity : null;
    const foldToThreeBetPct = p.facedThreeBet > 3 ? p.foldToThreeBet / p.facedThreeBet : null;
    const coldCallPct = p.coldCallOpportunity > 3 ? p.coldCallCount / p.coldCallOpportunity : null;
    const limpPct = p.handsObserved > 5 ? p.limpCount / p.handsObserved : null;
    const stealPct = p.stealOpportunity > 3 ? p.stealAttemptCount / p.stealOpportunity : null;
    const foldToStealPct = p.facedSteal > 3 ? p.foldToSteal / p.facedSteal : null;

    // ═══ POSTFLOP FREQUENCIES ═══
    const cBetPct = p.cBetOpportunity > 3 ? p.cBetCount / p.cBetOpportunity : null;
    const foldToCBetPct = p.facedCBet > 3 ? p.foldToCBet / p.facedCBet : null;
    const secondBarrelPct = p.secondBarrelOpportunity > 2 ? p.secondBarrelCount / p.secondBarrelOpportunity : null;
    const thirdBarrelPct = p.thirdBarrelOpportunity > 2 ? p.thirdBarrelCount / p.thirdBarrelOpportunity : null;
    const checkRaisePct = p.checkRaiseOpportunity > 3 ? p.checkRaiseCount / p.checkRaiseOpportunity : null;
    const donkBetPct = p.donkBetOpportunity > 3 ? p.donkBetCount / p.donkBetOpportunity : null;
    const probeBetPct = p.probeBetOpportunity > 3 ? p.probeBetCount / p.probeBetOpportunity : null;
    const foldToRaisePct = p.facedRaise > 3 ? p.foldToRaise / p.facedRaise : null;

    // ═══ AGGRESSION ═══
    const aggFreq = totalActions > 0 ? p.totalBets / totalActions : 0.33;
    const foldFreq = totalActions > 0 ? p.totalFolds / totalActions : 0.33;
    const callFreq = totalActions > 0 ? p.totalCalls / totalActions : 0.33;
    // AF = (bets + raises) / calls. Standard poker aggression factor.
    const aggressionFactor = p.totalCalls > 0 ? p.totalBets / p.totalCalls : p.totalBets > 0 ? 99 : 1;

    // ═══ SHOWDOWN ═══
    const wtsd = p.handsObserved > 5 ? p.wentToShowdown / p.handsObserved : null;
    const wsd = p.wentToShowdown > 3 ? p.wonAtShowdown / p.wentToShowdown : null;
    const bluffRate = p.wentToShowdown >= 3 ? p.showdownBluffs / p.wentToShowdown : null;

    // ═══ SIZING TENDENCIES ═══
    const avgFlopBet = p.flopBetSizes.length >= 3
        ? p.flopBetSizes.reduce((a, b) => a + b, 0) / p.flopBetSizes.length : null;
    const avgTurnBet = p.turnBetSizes.length >= 3
        ? p.turnBetSizes.reduce((a, b) => a + b, 0) / p.turnBetSizes.length : null;
    const avgRiverBet = p.riverBetSizes.length >= 3
        ? p.riverBetSizes.reduce((a, b) => a + b, 0) / p.riverBetSizes.length : null;
    const avgPreflopRaise = p.preflopRaiseSizes.length >= 3
        ? p.preflopRaiseSizes.reduce((a, b) => a + b, 0) / p.preflopRaiseSizes.length : null;
    const overbetFreq = p.totalBets > 5 ? p.overbetCount / p.totalBets : null;

    // ═══ TIMING TELLS ═══
    const avgDecisionMs = p.decisionCount > 0 ? p.totalDecisionTimeMs / p.decisionCount : null;
    const snapFreq = p.decisionCount > 5 ? p.snapActionCount / p.decisionCount : null;
    const longTankFreq = p.decisionCount > 5 ? p.longTankCount / p.decisionCount : null;
    const timingProfile = {};
    for (const [st, data] of Object.entries(p.timingByStreet)) {
        timingProfile[st] = data.count > 0 ? { avgMs: data.totalMs / data.count, count: data.count } : null;
    }

    // ═══ PLAYER TYPE CLASSIFICATION ═══
    let playerType = 'unknown';
    if (p.handsObserved >= 10) {
        if (vpipPct < 0.18 && pfrPct < 0.12) playerType = 'nit';
        else if (vpipPct < 0.24 && pfrPct >= 0.16 && aggFreq >= 0.38) playerType = 'TAG';
        else if (vpipPct >= 0.28 && pfrPct >= 0.20 && aggFreq >= 0.42) playerType = 'LAG';
        else if (vpipPct >= 0.35 && aggFreq < 0.28) playerType = 'calling_station';
        else if (vpipPct >= 0.45 && aggFreq >= 0.48) playerType = 'maniac';
        else if (foldFreq >= 0.52) playerType = 'weak-tight';
        else if (vpipPct >= 0.28 && vpipPct < 0.38 && aggFreq >= 0.30 && aggFreq < 0.42) playerType = 'loose-passive';
        else playerType = 'balanced';
    }

    // ═══ EXPLOIT PATTERNS ═══
    // Detect specific exploitable patterns from the data
    const exploits = [];
    if (foldToCBetPct !== null && foldToCBetPct > 0.65) exploits.push('overfolds_to_cbet');
    if (cBetPct !== null && cBetPct > 0.75) exploits.push('overcbets');
    if (foldToThreeBetPct !== null && foldToThreeBetPct > 0.70) exploits.push('overfolds_to_3bet');
    if (threeBetPct !== null && threeBetPct > 0.12) exploits.push('over3bets');
    if (wtsd !== null && wtsd > 0.35) exploits.push('station_to_showdown');
    if (wtsd !== null && wtsd < 0.18) exploits.push('gives_up_easily');
    if (checkRaisePct !== null && checkRaisePct > 0.12) exploits.push('frequent_check_raiser');
    if (donkBetPct !== null && donkBetPct > 0.15) exploits.push('frequent_donker');
    if (snapFreq !== null && snapFreq > 0.50) exploits.push('plays_too_fast');
    if (longTankFreq !== null && longTankFreq > 0.25) exploits.push('slow_player');
    if (overbetFreq !== null && overbetFreq > 0.15) exploits.push('frequent_overbetter');
    if (limpPct !== null && limpPct > 0.10) exploits.push('limper');
    if (foldToStealPct !== null && foldToStealPct > 0.70) exploits.push('overfolds_blinds');
    if (secondBarrelPct !== null && secondBarrelPct < 0.30 && cBetPct !== null && cBetPct > 0.60) {
        exploits.push('one_and_done'); // C-bets a lot but gives up on turn
    }
    if (foldToRaisePct !== null && foldToRaisePct > 0.60) exploits.push('overfolds_to_raise');

    // ═══ IN-HAND CONTEXT ═══
    let inHandActions = null;
    if (observer.currentHand) {
        const hand = observer.currentHand;
        const actions = hand.playerActions.get(oppStr);
        if (actions && actions.length > 0) {
            inHandActions = {
                actions: actions.map(a => ({ street: a.street, action: a.action, amount: a.amount, betToPot: a.betToPot, timing: a.timing })),
                isAggressor: hand.preflopAggressor === oppStr,
                lastAction: actions[actions.length - 1],
                streetAggression: {
                    preflop: hand.streetAggressors.preflop === oppStr,
                    flop: hand.streetAggressors.flop === oppStr,
                    turn: hand.streetAggressors.turn === oppStr,
                    river: hand.streetAggressors.river === oppStr,
                },
            };
        }
    }

    // ═══ CONFIDENCE ═══
    // Scales with data quality: more hands + more showdowns = higher confidence
    const handConfidence = Math.min(0.60, p.handsObserved / 100);
    const showdownConfidence = p.wentToShowdown >= 3 ? Math.min(0.20, p.wentToShowdown / 30) : 0;
    const timingConfidence = p.decisionCount > 10 ? 0.10 : 0;
    // ═══ JOURNAL BONUS: Historical data from prior sessions boosts confidence ═══
    // PHASE 15: Applies data decay — older journal data contributes less.
    // Multi-session data is more reliable: bonus scales with session_count.
    let journalBonus = 0;
    if (p._journalSeeded && p._journalHands > 20) {
        const baseBonus = Math.min(0.15, p._journalHands / 500);
        const freshness = p._journalFreshness ?? 1.0; // 1.0 = fresh, 0.15 = very stale
        const sessionMultiplier = Math.min(1.5, 1.0 + ((p._journalSessionCount || 1) - 1) * 0.10); // More sessions = more reliable
        journalBonus = baseBonus * freshness * sessionMultiplier;
    }
    const confidence = Math.min(0.95, handConfidence + showdownConfidence + timingConfidence + journalBonus);

    return {
        // Core frequencies
        vpipPct, pfrPct, threeBetPct, fourBetPct, foldToThreeBetPct,
        coldCallPct, limpPct, stealPct, foldToStealPct,
        // Postflop
        cBetPct, foldToCBetPct, secondBarrelPct, thirdBarrelPct,
        checkRaisePct, donkBetPct, probeBetPct, foldToRaisePct,
        // Aggression
        aggFreq, foldFreq, callFreq, aggressionFactor,
        // Showdown
        wtsd, wsd, bluffRate,
        // Sizing
        avgFlopBet, avgTurnBet, avgRiverBet, avgPreflopRaise, overbetFreq,
        overbetPct: overbetFreq, // Alias: some consumers use overbetPct
        // Timing
        avgDecisionMs, snapFreq, longTankFreq, timingProfile,
        // Classification
        playerType, exploits,
        // In-hand
        inHandActions,
        // Position stats
        positionStats: p.actionsByPosition,
        // Meta
        handsObserved: p.handsObserved,
        lastSeen: p.lastSeen || Date.now(),
        confidence,
    };
}

/**
 * Clean up stale live observer data for tables a horse has left.
 * @param {string} horseId
 * @param {string} tableId
 */
function clearLiveObserver(horseId, tableId) {
    if (liveObserver.has(horseId)) {
        const horseTables = liveObserver.get(horseId);
        horseTables.delete(tableId);
        if (horseTables.size === 0) liveObserver.delete(horseId);
    }
}

/**
 * Clean up all live observer data for a table (when table closes).
 * @param {string} tableId
 */
function clearTableLiveObservers(tableId) {
    // ═══ PERSISTENT JOURNAL: Save all opponent data before clearing ═══
    for (const [horseId, horseTables] of liveObserver) {
        if (horseTables.has(tableId)) {
            persistTableJournals(horseId, tableId).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
    }
    // Now clear the observers
    for (const [horseId, horseTables] of liveObserver) {
        horseTables.delete(tableId);
        if (horseTables.size === 0) liveObserver.delete(horseId);
    }
}

/**
 * Auto-cleanup stale data across all observers.
 * Call periodically (e.g., every 5 minutes) to prevent memory bloat.
 */
function cleanupLiveObservers() {
    const staleThreshold = 45 * 60 * 1000; // 45 minutes
    const now = Date.now();
    for (const [horseId, horseTables] of liveObserver) {
        for (const [tableId, observer] of horseTables) {
            for (const [oppId, profile] of observer.opponents) {
                if (now - profile.lastSeen > staleThreshold) {
                    observer.opponents.delete(oppId);
                }
            }
            if (observer.opponents.size === 0) horseTables.delete(tableId);
        }
        if (horseTables.size === 0) liveObserver.delete(horseId);
    }
}

// Auto-cleanup every 5 minutes
const cleanupInterval = setInterval(cleanupLiveObservers, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

/**
 * LRU eviction: cap opponent profiles per table observer.
 * Prevents unbounded memory growth on long-running servers.
 */
const MAX_OPPONENTS_PER_TABLE = 50;
const MAX_TABLES_PER_HORSE = 8;

function _evictLRUProfiles(observer) {
    if (observer.opponents.size <= MAX_OPPONENTS_PER_TABLE) return;
    const sorted = [...observer.opponents.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    const toEvict = sorted.length - MAX_OPPONENTS_PER_TABLE;
    for (let i = 0; i < toEvict; i++) {
        observer.opponents.delete(sorted[i][0]);
    }
}

function _evictLRUTables(horseTables) {
    if (horseTables.size <= MAX_TABLES_PER_HORSE) return;
    const entries = [...horseTables.entries()];
    const withLastSeen = entries.map(([tid, obs]) => {
        let newest = 0;
        for (const p of obs.opponents.values()) {
            if (p.lastSeen > newest) newest = p.lastSeen;
        }
        return { tid, newest };
    }).sort((a, b) => a.newest - b.newest);
    const toEvict = withLastSeen.length - MAX_TABLES_PER_HORSE;
    for (let i = 0; i < toEvict; i++) {
        horseTables.delete(withLastSeen[i].tid);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// END ALWAYS-ON LIVE OBSERVER SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    // Core observer API
    observeNewHand,
    observeAction,
    observeShowdown,
    getLiveRead,

    // Lifecycle management
    clearLiveObserver,
    clearTableLiveObservers,
    cleanupLiveObservers,

    // Internal (exposed for testing)
    _getTableObserver,
    _createLiveProfile,
    _createInHandModel,
    _evictLRUProfiles,
    _evictLRUTables,

    // State (for barrel wiring)
    liveObserver,
};
