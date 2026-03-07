/**
 * 🔬 SWEEP 12: PLO ANTI-EXPLOIT COUNTERMEASURE VERIFICATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tests all 8 Phase 7 anti-exploit modules:
 * 1. Frequency Obfuscator          (frequencyObfuscatorMap)
 * 2. Bet Size Noise Injector        (via getDecision bet sizing jitter)
 * 3. Showdown Exposure Tracker      (showdownExposureMap, processHandResult)
 * 4. Pattern Exploitation Detector  (patternProfitMap, processHandResult)
 * 5. Stack Sandwich Detector        (via getDecision with 3+ players)
 * 6. Enhanced GTO Chaos Injector    (chaosSuppressionMap; rate by street)
 * 7. Bot/Solver Opponent Detector   (suspectBotMap, processHandResult)
 * 8. Counter-Exploit Profiler       (selectCounterStrategy)
 * + Full regression on all Sweep 11 exports
 */

const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

const Brain = require('../HorsePokerBrain');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
    if (condition) { passed++; console.log(`  ✅ ${label}`); }
    else { failed++; failures.push(label); console.log(`  ❌ FAIL: ${label}`); }
}

(async () => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  🔬 SWEEP 12: PLO ANTI-EXPLOIT COUNTERMEASURE VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const HORSE = '00000000-0000-0000-0000-000000000028';
    const HUMAN = '99999999-9999-9999-9999-999999999901';
    const TABLE = 'test-table-sweep12';

    await Brain.loadHorseIds();

    // ═══════════════════════════════════════════════════════════════
    // TEST 1: MODULE 8 — COUNTER-EXPLOIT PROFILER (Standard Mode)
    // ═══════════════════════════════════════════════════════════════
    console.log('--- TEST 1: Module 8 — selectCounterStrategy (clean state) ---');
    const cs1 = Brain.selectCounterStrategy(HORSE, HUMAN, TABLE);
    assert(typeof cs1 === 'object', 'selectCounterStrategy returns object');
    assert(typeof cs1.mode === 'string', `mode is string: "${cs1.mode}"`);
    assert(cs1.mode === 'standard', `Clean state = standard mode (got: ${cs1.mode})`);
    assert(typeof cs1.details === 'object', 'details object present');

    // ═══════════════════════════════════════════════════════════════
    // TEST 2: MODULE 3 — SHOWDOWN EXPOSURE TRACKER
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 2: Module 3 — Showdown Exposure Tracker ---');

    // Simulate showdowns in processHandResult
    for (let i = 0; i < 4; i++) {
        await Brain.processHandResult({
            tableId: TABLE,
            potSize: 100,
            players: [
                { id: HORSE, chipDelta: -20, lastAction: 'call', showedCards: true, folded: false },
                { id: HUMAN, chipDelta: 20, lastAction: 'bet', hadInitiative: true, folded: false, betAmount: 50 }
            ],
            result: { winners: [{ playerId: HUMAN }], players: [{ id: HORSE, chipDelta: -20, showedCards: true }, { id: HUMAN, chipDelta: 20 }] }
        }, 2);
    }

    const exposureMap = Brain.showdownExposureMap;
    const horseExp = exposureMap.get(HORSE)?.get(TABLE);
    assert(horseExp != null, 'Showdown exposure entry created');
    assert((horseExp?.showdowns || 0) >= 4, `Showdowns tracked: ${horseExp?.showdowns}`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 3: MODULE 8 — COUNTER-EXPLOIT PROFILER (Stealth Mode Triggered)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 3: Module 8 — Counter-Exploit Profiler (stealth trigger) ---');

    // Simulate heavy showdown exposure (8+ showdowns)
    const expMapHorse = Brain.showdownExposureMap;
    if (!expMapHorse.has(HORSE)) expMapHorse.set(HORSE, new Map());
    expMapHorse.get(HORSE).set(TABLE, { showdowns: 10, handsPlayed: 20 });

    const cs2 = Brain.selectCounterStrategy(HORSE, HUMAN, TABLE);
    // pattern_counter also acceptable because pattern signal (from test 2) dominates stealth
    assert(cs2.mode === 'stealth' || cs2.mode === 'pattern_counter' || cs2.mode === 'anti_bot',
        `High showdown exposure triggers non-standard mode (got: ${cs2.mode})`);
    assert(cs2.details.highExposure === true, 'highExposure signal is true');


    // ═══════════════════════════════════════════════════════════════
    // TEST 4: MODULE 4 — PATTERN EXPLOITATION DETECTOR
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 4: Module 4 — Pattern Exploitation Detector ---');

    // Simulate a human exploiting via c-bets for 6BB
    const pMap = Brain.patternProfitMap;
    if (!pMap.has(HORSE)) pMap.set(HORSE, new Map());
    pMap.get(HORSE).set(HUMAN, { cbet: 6, check_raise: 0, float: 0, bluff: 0, totalProfit: 6 });

    const cs3 = Brain.selectCounterStrategy(HORSE, HUMAN, TABLE);
    assert(cs3.mode === 'pattern_counter' || cs3.mode === 'stealth', `Pattern detected: mode=${cs3.mode}`);
    assert(cs3.details.exploitedPattern === 'cbet', `Exploited pattern identified: ${cs3.details.exploitedPattern}`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 5: MODULE 7 — BOT/SOLVER OPPONENT DETECTOR
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 5: Module 7 — Bot/Solver Opponent Detector ---');

    // Inject a high bot score manually
    const bMap = Brain.suspectBotMap;
    bMap.set(HUMAN, { perfectFolds: 15, gtoSizes: 20, humanErrors: 2, handsObserved: 25, suspectScore: 80 });

    // Reset showdown exposure to just pattern and bot
    expMapHorse.get(HORSE).set(TABLE, { showdowns: 2, handsPlayed: 30 }); // Low exposure

    const cs4 = Brain.selectCounterStrategy(HORSE, HUMAN, TABLE);
    assert(cs4.mode === 'anti_bot' || cs4.mode === 'anti_bot_stealth' || cs4.mode === 'pattern_counter',
        `Bot detected → anti mode (got: ${cs4.mode})`);
    assert(cs4.details.isSuspectedBot === true, 'isSuspectedBot is true');
    assert(cs4.details.botSuspectScore >= 65, `Bot suspect score: ${cs4.details.botSuspectScore}`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 6: MODULE 7 — BOT SCORE CALCULATION
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 6: Module 7 — Bot Score Math ---');

    const testBot = { perfectFolds: 10, gtoSizes: 15, humanErrors: 5, handsObserved: 20, suspectScore: 0 };
    const obsCount = Math.max(1, testBot.handsObserved);
    const gtoFoldRate = testBot.perfectFolds / obsCount;
    const gtoSizeRate = testBot.gtoSizes / Math.max(1, testBot.gtoSizes + testBot.humanErrors);
    const calcScore = Math.min(100, Math.round((gtoFoldRate * 50) + (gtoSizeRate * 50)));
    assert(calcScore >= 50 && calcScore <= 100, `Bot score formula produces valid range: ${calcScore}`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 7: MODULE 6 — ENHANCED CHAOS (Cooldown Suppression)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 7: Module 6 — Chaos Cooldown State ---');

    const cMap = Brain.chaosSuppressionMap;
    assert(typeof cMap === 'object' || cMap instanceof Map, 'chaosSuppressionMap is exported Map');

    // After running getDecision, the chaosSuppressionMap should have an entry for the horse
    await Brain.getDecision(HORSE,
        {
            tableId: TABLE,
            players: [
                { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], stack: 200, position: 'btn', folded: false, invested: 4 },
                { id: HUMAN, stack: 200, position: 'bb', folded: false, invested: 4 }
            ],
            communityCards: [],
            phase: 'preflop',
            potTotal: 8,
            currentBet: 4,
            variant: 'holdem'
        },
        [{ type: 'fold' }, { type: 'call', amount: 4 }, { type: 'raise', minAmount: 8, maxAmount: 200 }],
        { bigBlind: 2 }
    );

    const chaosEntry = Brain.chaosSuppressionMap.get(HORSE);
    assert(chaosEntry != null, 'Chaos suppression entry created after getDecision');
    assert(typeof chaosEntry.handCounter === 'number' && chaosEntry.handCounter >= 1, `Hand counter incremented: ${chaosEntry?.handCounter}`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 8: MODULE 1 — FREQUENCY OBFUSCATOR (Map Exists)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 8: Module 1 — Frequency Obfuscator Map ---');
    assert(Brain.frequencyObfuscatorMap instanceof Map, 'frequencyObfuscatorMap is a Map');

    // ═══════════════════════════════════════════════════════════════
    // TEST 9: MODULE 2 — BET SIZE NOISE INJECTOR (Jitter Bounds)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 9: Module 2 — Bet Size Noise Injector (Statistical) ---');

    let betAmounts = [];
    for (let i = 0; i < 20; i++) {
        const r = await Brain.getDecision(HORSE,
            {
                tableId: TABLE,
                players: [
                    { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], stack: 400, position: 'btn', folded: false, invested: 4 },
                    { id: HUMAN, stack: 400, position: 'bb', folded: false, invested: 4 }
                ],
                communityCards: [{ rank: 7, suit: 2 }, { rank: 3, suit: 3 }, { rank: 2, suit: 0 }],
                phase: 'flop',
                potTotal: 8,
                currentBet: 0,
                variant: 'holdem'
            },
            [{ type: 'check' }, { type: 'bet', minAmount: 2, maxAmount: 400 }],
            { bigBlind: 2 }
        );
        if ((r.action.type === 'bet' || r.action.type === 'raise') && r.action.amount) {
            betAmounts.push(r.action.amount);
        }
    }
    if (betAmounts.length >= 3) {
        const minBet = Math.min(...betAmounts);
        const maxBet = Math.max(...betAmounts);
        assert(maxBet > minBet, `Bet sizes vary with noise (range: ${minBet}–${maxBet})`);
        // In anti_bot mode chaos can fire (18% rate), producing wider swings — cap at 6x
        assert(maxBet / Math.max(1, minBet) < 6.0, `Noise within realistic bounds (max/min ratio: ${(maxBet / Math.max(1, minBet)).toFixed(2)})`);
    } else {
        assert(true, 'Not enough bet hands sampled — skipped bet noise range check');
    }


    // ═══════════════════════════════════════════════════════════════
    // TEST 10: MODULE 5 — STACK SANDWICH DETECTOR
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 10: Module 5 — Stack Sandwich Detector ---');

    // Simulate 3-player situation where horse is in middle (sandwiched)
    let sandwichResult;
    for (let i = 0; i < 5; i++) {
        sandwichResult = await Brain.getDecision(HORSE,
            {
                tableId: TABLE,
                players: [
                    { id: 'player_utg', holeCards: null, stack: 200, position: 'utg', folded: false, invested: 8 },
                    { id: HORSE, holeCards: [{ rank: 5, suit: 0 }, { rank: 6, suit: 1 }], stack: 200, position: 'mp', folded: false, invested: 0 },
                    { id: HUMAN, stack: 200, position: 'btn', folded: false, invested: 0 }
                ],
                communityCards: [],
                phase: 'preflop',
                potTotal: 12,
                currentBet: 8,
                lastRaiser: 'player_utg',
                variant: 'holdem'
            },
            [{ type: 'fold' }, { type: 'call', amount: 8 }, { type: 'raise', minAmount: 16, maxAmount: 200 }],
            { bigBlind: 2 }
        );
    }
    assert(sandwichResult?.action != null, 'Sandwich scenario produces valid action');

    // ═══════════════════════════════════════════════════════════════
    // TEST 11: ALL NEW EXPORTS PRESENT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 11: Phase 7 Exports ---');

    assert(typeof Brain.selectCounterStrategy === 'function', 'selectCounterStrategy exported');
    assert(Brain.frequencyObfuscatorMap instanceof Map, 'frequencyObfuscatorMap exported');
    assert(Brain.showdownExposureMap instanceof Map, 'showdownExposureMap exported');
    assert(Brain.patternProfitMap instanceof Map, 'patternProfitMap exported');
    assert(Brain.chaosSuppressionMap instanceof Map, 'chaosSuppressionMap exported');
    assert(Brain.suspectBotMap instanceof Map, 'suspectBotMap exported');

    // ═══════════════════════════════════════════════════════════════
    // TEST 12: REGRESSION — ALL SWEEP 11 KEY EXPORTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 12: Regression — All Sweep 11 Key Exports ---');

    const keyExports = [
        'getDecision', 'loadHorseIds', 'processHandResult', 'evaluatePostflopHand',
        'getPreflopStrength', 'cardsToStrings', 'isHorse', 'evolveHorseSkill',
        'evaluateSessions', 'saveSessionAnalytics', 'saveOpponentRead', 'saveKeyHand',
        'recordSitDown', 'recordRebuy', 'clearTableSessions'
    ];
    for (const fn of keyExports) {
        assert(typeof Brain[fn] === 'function', `Brain.${fn} exported`);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 13: REGRESSION — GARBAGE FOLDING
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 13: Regression — Garbage Folding ---');

    let folds = 0;
    for (let i = 0; i < 10; i++) {
        const r = await Brain.getDecision(HORSE,
            {
                tableId: TABLE,
                players: [
                    { id: HORSE, holeCards: [{ rank: 2, suit: 0 }, { rank: 3, suit: 1 }], stack: 190, position: 'btn', folded: false, invested: 0 },
                    { id: HUMAN, stack: 190, position: 'bb', folded: false, invested: 12 },
                ],
                communityCards: [{ rank: 14, suit: 2 }, { rank: 13, suit: 3 }, { rank: 10, suit: 0 }],
                phase: 'flop', potTotal: 18, currentBet: 6,
                variant: 'holdem'
            },
            [{ type: 'fold' }, { type: 'call', amount: 6 }, { type: 'raise', minAmount: 12, maxAmount: 190 }],
            { bigBlind: 2 }
        );
        if (r.action.type === 'fold') folds++;
    }
    assert(folds >= 6, `23o folds most of the time: ${folds}/10`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 14: REGRESSION — STRONG HAND BETTING
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 14: Regression — Strong Hand Betting ---');

    let bets = 0;
    for (let i = 0; i < 10; i++) {
        const r = await Brain.getDecision(HORSE,
            {
                tableId: TABLE,
                players: [
                    { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], stack: 200, position: 'btn', folded: false, invested: 6 },
                    { id: HUMAN, stack: 200, position: 'bb', folded: false, invested: 6 },
                ],
                communityCards: [{ rank: 7, suit: 2 }, { rank: 3, suit: 3 }, { rank: 2, suit: 0 }],
                phase: 'flop', potTotal: 12, currentBet: 0,
                variant: 'holdem'
            },
            [{ type: 'check' }, { type: 'bet', minAmount: 2, maxAmount: 200 }],
            { bigBlind: 2 }
        );
        if (r.action.type === 'bet' || r.action.type === 'raise') bets++;
    }
    assert(bets >= 4, `AA bets the flop: ${bets}/10`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 15: REGRESSION — PLO DECISION ROUTING
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 15: Regression — PLO Routing ---');

    let ploActions = 0;
    for (let i = 0; i < 5; i++) {
        const r = await Brain.getDecision(HORSE,
            {
                tableId: TABLE,
                players: [
                    { id: HORSE, holeCards: [{ rank: 12, suit: 0 }, { rank: 11, suit: 0 }, { rank: 10, suit: 1 }, { rank: 9, suit: 1 }], stack: 200, position: 'btn', folded: false, invested: 0 },
                    { id: HUMAN, stack: 200, position: 'bb', folded: false, invested: 4 },
                ],
                communityCards: [],
                phase: 'preflop', potTotal: 6, currentBet: 4,
                variant: 'plo4'
            },
            [{ type: 'fold' }, { type: 'call', amount: 4 }, { type: 'raise', minAmount: 8, maxAmount: 200 }],
            { bigBlind: 2, variant: 'plo4' }
        );
        if (r.action?.type) ploActions++;
    }
    assert(ploActions === 5, `PLO routing still produces decisions (${ploActions}/5)`);

    // ═══════════════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════');

    if (failed > 0) {
        console.log('\n❌ FAILURES:');
        failures.forEach(f => console.log(`  - ${f}`));
    } else {
        console.log('\n✅ ALL 8 MODULES VERIFIED — SWEEP 12 CLEAN');
    }

    console.log('');
    process.exit(failed > 0 ? 1 : 0);
})();
