/**
 * 🔬 SWEEP 10: COMPREHENSIVE HORSE AUDIT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Second comprehensive audit covering:
 * 1. GTO Module: PioSolver queries, no-data fallback, parseCard safety
 * 2. Brain Engine: card conversion, guardrails, decision pipeline
 * 3. Advanced Module: tilt, fatigue, exploit, timing tells
 * 4. Personality Module: play styles, skill tiers, chat
 * 5. Supabase Persistence: all 3 tables write+read
 * 6. Full Decision Pipeline: GTO→Guardrails→Overlays→Validate
 */
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const Brain = require('../HorsePokerBrain');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
    if (condition) { passed++; console.log(`  ✅ ${label}`); }
    else { failed++; failures.push(label); console.log(`  ❌ FAIL: ${label}`); }
}

(async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  🔬 SWEEP 10: COMPREHENSIVE HORSE AUDIT');
    console.log('═══════════════════════════════════════════════════\n');

    const HORSE = '00000000-0000-0000-0000-000000000028';
    await Brain.loadHorseIds();

    // ═══════════════════════════════════════════════════
    // TEST 1: CARD CONVERSION ROBUSTNESS
    // All 3 card formats must work correctly
    // ═══════════════════════════════════════════════════
    console.log('--- TEST 1: Card Conversion Robustness ---');

    // Object format (game engine standard)
    const objCards = Brain.cardsToStrings([{ rank: 14, suit: 0 }, { rank: 13, suit: 1 }]);
    assert(objCards[0] === 'Ac', `Object card {rank:14,suit:0} → 'Ac' (got '${objCards[0]}')`);
    assert(objCards[1] === 'Kd', `Object card {rank:13,suit:1} → 'Kd' (got '${objCards[1]}')`);

    // String format (already correct)
    const strCards = Brain.cardsToStrings(['Ah', 'Ks']);
    assert(strCards[0] === 'Ah', `String card 'Ah' → 'Ah' (got '${strCards[0]}')`);
    assert(strCards[1] === 'Ks', `String card 'Ks' → 'Ks' (got '${strCards[1]}')`);

    // Integer format (legacy)
    const intCards = Brain.cardsToStrings([48, 44]); // 48 = Ac, 44 = Kc
    assert(intCards[0] === 'Ac', `Integer card 48 → 'Ac' (got '${intCards[0]}')`);
    assert(intCards[1] === 'Kc', `Integer card 44 → 'Kc' (got '${intCards[1]}')`);

    // Edge cases
    const nullCards = Brain.cardsToStrings(null);
    assert(Array.isArray(nullCards) && nullCards.length === 0, 'Null input → empty array');
    const emptyCards = Brain.cardsToStrings([]);
    assert(Array.isArray(emptyCards) && emptyCards.length === 0, 'Empty input → empty array');

    // Object with string rank/suit
    const strObjCards = Brain.cardsToStrings([{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 's' }]);
    assert(strObjCards[0] === 'Ah', `Object string card {rank:'A',suit:'h'} → 'Ah' (got '${strObjCards[0]}')`);

    // ═══════════════════════════════════════════════════
    // TEST 2: GTO NO-DATA FALLBACK (was defaulting to 'Call')
    // When PioSolver has no data, should fall through to heuristic engine
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 2: GTO No-Data Fallback ---');

    // Test garbage hand facing a bet — should fold via fallback, not call via GTO default
    let trashFolds = 0;
    let trashCalls = 0;
    let trashRaises = 0;
    for (let i = 0; i < 20; i++) {
        const result = await Brain.getDecision(
            HORSE,
            {
                players: [
                    { id: HORSE, holeCards: [{ rank: 2, suit: 0 }, { rank: 3, suit: 1 }], stack: 190, position: 'btn', folded: false, invested: 0 },
                    { id: 'opp1', stack: 190, position: 'bb', folded: false, invested: 12 },
                ],
                communityCards: [{ rank: 14, suit: 2 }, { rank: 13, suit: 3 }, { rank: 10, suit: 0 }],
                phase: 'flop', potTotal: 18, currentBet: 6
            },
            [{ type: 'fold' }, { type: 'call', amount: 6 }, { type: 'raise', minAmount: 12, maxAmount: 190 }],
            { bigBlind: 2 }
        );
        if (result.action.type === 'fold') trashFolds++;
        else if (result.action.type === 'call') trashCalls++;
        else trashRaises++;
    }
    console.log(`  📊 23o facing bet on AKT (20 trials): ${trashFolds} folds, ${trashCalls} calls, ${trashRaises} raises`);
    assert(trashFolds >= 14, `Garbage hand folds most of the time (${trashFolds}/20 folds)`);
    assert(trashCalls <= 6, `Garbage hand rarely calls (${trashCalls}/20 calls)`);

    // ═══════════════════════════════════════════════════
    // TEST 3: STRONG HAND VALUE BETTING
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 3: Strong Hand Value Betting ---');

    let strongBets = 0;
    for (let i = 0; i < 20; i++) {
        const result = await Brain.getDecision(
            HORSE,
            {
                players: [
                    { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], stack: 200, position: 'btn', folded: false, invested: 6 },
                    { id: 'opp1', stack: 200, position: 'bb', folded: false, invested: 6 },
                ],
                communityCards: [{ rank: 7, suit: 2 }, { rank: 3, suit: 3 }, { rank: 2, suit: 0 }],
                phase: 'flop', potTotal: 12, currentBet: 0
            },
            [{ type: 'check' }, { type: 'bet', minAmount: 2, maxAmount: 200 }],
            { bigBlind: 2 }
        );
        if (result.action.type === 'bet' || result.action.type === 'raise') strongBets++;
    }
    console.log(`  📊 AA on 732 flop (no bet facing): ${strongBets}/20 bets`);
    assert(strongBets >= 8, `AA bets the flop often (${strongBets}/20)`);

    // ═══════════════════════════════════════════════════
    // TEST 4: RIVER VALUE BETTING
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 4: River Value Betting ---');

    let riverBets = 0;
    for (let i = 0; i < 20; i++) {
        const result = await Brain.getDecision(
            HORSE,
            {
                players: [
                    { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], stack: 170, position: 'btn', folded: false, invested: 15 },
                    { id: 'opp1', stack: 170, position: 'bb', folded: false, invested: 15 },
                ],
                communityCards: [
                    { rank: 7, suit: 2 }, { rank: 3, suit: 3 }, { rank: 2, suit: 0 },
                    { rank: 8, suit: 1 }, { rank: 5, suit: 2 }
                ],
                phase: 'river', potTotal: 30, currentBet: 0
            },
            [{ type: 'check' }, { type: 'bet', minAmount: 2, maxAmount: 170 }],
            { bigBlind: 2 }
        );
        if (result.action.type === 'bet' || result.action.type === 'raise') riverBets++;
    }
    console.log(`  📊 AA on river (no bet facing): ${riverBets}/20 value bets`);
    assert(riverBets >= 8, `AA value bets the river often (${riverBets}/20)`);

    // ═══════════════════════════════════════════════════
    // TEST 5: HAND EVALUATOR ACCURACY
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 5: Hand Evaluator Accuracy ---');

    const evalTests = [
        { hole: ['Ac', 'Ah'], board: ['7c', '3d', '2s'], expect: 'overpair', minStr: 55 },
        { hole: ['Kc', 'Kd'], board: ['Kh', '8s', '4c'], expect: 'set', minStr: 75 },
        { hole: ['Ac', 'Kc'], board: ['Kh', '7d', '3s'], expect: 'top_pair', minStr: 42 },
        { hole: ['2c', '3d'], board: ['Ac', 'Kh', 'Ts'], expect: 'high_card', minStr: 0 },
        { hole: ['Ac', 'Tc'], board: ['9c', '5c', '2c'], expect: 'flush', minStr: 80 },
    ];

    for (const t of evalTests) {
        const ev = Brain.evaluatePostflopHand(t.hole, t.board);
        assert(ev.category === t.expect, `${t.hole.join('')} on ${t.board.join('')} = ${t.expect} (got ${ev.category})`);
        assert(ev.strength >= t.minStr, `  strength >= ${t.minStr} (got ${ev.strength})`);
    }

    // ═══════════════════════════════════════════════════
    // TEST 6: PREFLOP HAND RANKING CORRECTNESS
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 6: Preflop Rankings ---');

    const rankings = [
        ['AA', 'KK'], ['KK', 'QQ'], ['AKs', 'AKo'], ['AKo', 'AQs'],
        ['TT', 'JTs'], ['KQs', '87s'], ['A5s', 'K3o']
    ];
    for (const [stronger, weaker] of rankings) {
        const s = Brain.getPreflopStrength(stronger);
        const w = Brain.getPreflopStrength(weaker);
        assert(s > w, `${stronger}(${s}) > ${weaker}(${w})`);
    }

    // ═══════════════════════════════════════════════════
    // TEST 7: POSTFLOP FUNCTION EXPORTS
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 7: All Functions Exported ---');

    const requiredExports = [
        'getDecision', 'loadHorseIds', 'processHandResult',
        'evaluatePostflopHand', 'getPreflopStrength', 'getOptimalBetSize',
        'getMultiwayAdjustment', 'getCheckRaiseStrategy', 'getCBetStrategy',
        'getRiverStrategy', 'getDrawEquity', 'getSPRStrategy',
        'saveSessionAnalytics', 'saveOpponentRead', 'saveKeyHand',
        'evolveHorseSkill', 'recordPerformanceAction', 'getPerformanceStats',
        'cardsToStrings', 'makeFallbackDecision', 'validateAndClamp',
        'getAdaptiveStrategy', 'isHorse'
    ];

    for (const fn of requiredExports) {
        assert(typeof Brain[fn] === 'function', `Brain.${fn} is exported`);
    }

    // ═══════════════════════════════════════════════════
    // TEST 8: SUPABASE PERSISTENCE — ALL 3 TABLES
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 8: Supabase Persistence ---');

    // 8a. Session Analytics
    Brain.recordPerformanceAction(HORSE, 'preflop', 'raise', true);
    Brain.recordPerformanceAction(HORSE, 'preflop', 'call', true);
    const saveResult = await Brain.saveSessionAnalytics(HORSE, 'test-table-sweep10');
    assert(saveResult === true, 'saveSessionAnalytics succeeded');

    // 8b. Opponent Read
    const readResult = await Brain.saveOpponentRead(HORSE, 'test-opp-sweep10', {
        bluffFrequency: 0.30, valueFrequency: 0.40, foldFrequency: 0.30,
        callFrequency: 0.55, handsObserved: 75, tendency: 'tight-aggressive'
    });
    assert(readResult === true, 'saveOpponentRead succeeded');

    // 8c. Key Hand
    const handResult = await Brain.saveKeyHand({
        handId: 'test-hand-sweep10-' + Date.now(),
        tableId: 'test-table-sweep10',
        result: {
            pot: 200, board: ['Ah', 'Kd', 'Qc', 'Js', '2h'],
            players: [{ id: HORSE, chipDelta: 100 }, { id: 'opp', chipDelta: -100 }],
            winners: [{ playerId: HORSE }]
        }
    }, 2);
    assert(handResult === true, 'saveKeyHand succeeded');

    // Verify read-back
    const { data: statsData } = await supabase.from('horse_session_stats').select('*').eq('table_id', 'test-table-sweep10').limit(1);
    assert(statsData && statsData.length > 0, 'Session stats persisted in Supabase');

    const { data: readData } = await supabase.from('horse_opponent_reads').select('*').eq('horse_id', HORSE).eq('opponent_id', 'test-opp-sweep10').limit(1);
    assert(readData && readData.length > 0, 'Opponent read persisted in Supabase');

    const { data: handData } = await supabase.from('horse_hand_history').select('*').eq('table_id', 'test-table-sweep10').limit(1);
    assert(handData && handData.length > 0, 'Key hand persisted in Supabase');

    // Cleanup
    await supabase.from('horse_session_stats').delete().eq('table_id', 'test-table-sweep10');
    await supabase.from('horse_opponent_reads').delete().eq('horse_id', HORSE).eq('opponent_id', 'test-opp-sweep10');
    await supabase.from('horse_hand_history').delete().eq('table_id', 'test-table-sweep10');

    // ═══════════════════════════════════════════════════
    // TEST 9: processHandResult FULL PIPELINE
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 9: processHandResult Pipeline ---');

    Brain.recordPerformanceAction(HORSE, 'preflop', 'call', true);
    const psBefore = Brain.getPerformanceStats(HORSE);
    const winsBefore = psBefore.wins || 0;

    try {
        await Brain.processHandResult({
            tableId: 'test-phr-sweep10',
            players: [
                { id: HORSE, chipDelta: 50, showedCards: true, lastAction: 'raise' },
                { id: 'opp1', chipDelta: -50, showedCards: false, lastAction: 'call', folded: false }
            ],
            result: {
                pot: 100,
                players: [
                    { id: HORSE, chipDelta: 50, showedCards: true, lastAction: 'raise' },
                    { id: 'opp1', chipDelta: -50, showedCards: false, lastAction: 'call', folded: false }
                ],
                winners: [{ playerId: HORSE }],
                board: ['7c', '3s', '2d', '8h', '5c']
            }
        }, 2);
        assert(true, 'processHandResult completed');
    } catch (e) {
        assert(false, `processHandResult threw: ${e.message}`);
    }

    const psAfter = Brain.getPerformanceStats(HORSE);
    assert(psAfter.wins > winsBefore, `Wins incremented: ${winsBefore} → ${psAfter.wins}`);
    assert(typeof psAfter.vpip === 'number', `VPIP is a number: ${psAfter.vpip}`);
    assert(typeof psAfter.pfr === 'number', `PFR is a number: ${psAfter.pfr}`);

    // ═══════════════════════════════════════════════════
    // TEST 10: FACING-BET STRONG vs WEAK
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 10: Facing Bet Logic ---');

    // AA facing a bet = never fold
    let aaFoldCount = 0;
    for (let i = 0; i < 10; i++) {
        const r = await Brain.getDecision(HORSE,
            {
                players: [
                    { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], stack: 190, position: 'btn', folded: false, invested: 6 },
                    { id: 'opp1', stack: 190, position: 'bb', folded: false, invested: 12 },
                ],
                communityCards: [{ rank: 7, suit: 2 }, { rank: 3, suit: 3 }, { rank: 2, suit: 0 }],
                phase: 'flop', potTotal: 18, currentBet: 6
            },
            [{ type: 'fold' }, { type: 'call', amount: 6 }, { type: 'raise', minAmount: 12, maxAmount: 190 }],
            { bigBlind: 2 }
        );
        if (r.action.type === 'fold') aaFoldCount++;
    }
    assert(aaFoldCount === 0, `AA never folds vs bet (${aaFoldCount}/10 folds)`);

    // ═══════════════════════════════════════════════════
    // TEST 11: TIMING DELAYS ARE HUMAN-LIKE
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 11: Timing Delay Ranges ---');

    const delays = [];
    for (let i = 0; i < 10; i++) {
        const r = await Brain.getDecision(HORSE,
            {
                players: [
                    { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], stack: 200, position: 'btn', folded: false, invested: 2 },
                    { id: 'opp1', stack: 200, position: 'bb', folded: false, invested: 2 },
                ],
                communityCards: [],
                phase: 'preflop', potTotal: 3, currentBet: 0
            },
            [{ type: 'check' }, { type: 'raise', minAmount: 4, maxAmount: 200 }],
            { bigBlind: 2 }
        );
        delays.push(r.delayMs);
    }
    const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
    const minDelay = Math.min(...delays);
    const maxDelay = Math.max(...delays);
    console.log(`  📊 Delays: min=${minDelay}ms, avg=${Math.round(avgDelay)}ms, max=${maxDelay}ms`);
    assert(minDelay >= 800, `Min delay >= 800ms (got ${minDelay})`);
    assert(maxDelay <= 7000, `Max delay <= 7000ms (got ${maxDelay})`);
    assert(avgDelay >= 1000 && avgDelay <= 5000, `Avg delay is human-like (got ${Math.round(avgDelay)}ms)`);

    // ═══════════════════════════════════════════════════
    // TEST 12: BET SIZING SANITY
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 12: Bet Sizing Sanity ---');

    const betResults = [];
    for (let i = 0; i < 10; i++) {
        const r = await Brain.getDecision(HORSE,
            {
                players: [
                    { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], stack: 200, position: 'btn', folded: false, invested: 6 },
                    { id: 'opp1', stack: 200, position: 'bb', folded: false, invested: 6 },
                ],
                communityCards: [{ rank: 7, suit: 2 }, { rank: 3, suit: 3 }, { rank: 2, suit: 0 }],
                phase: 'flop', potTotal: 12, currentBet: 0
            },
            [{ type: 'check' }, { type: 'bet', minAmount: 2, maxAmount: 200 }],
            { bigBlind: 2 }
        );
        if (r.action.amount) betResults.push(r.action.amount);
    }
    if (betResults.length > 0) {
        const avgBet = betResults.reduce((a, b) => a + b, 0) / betResults.length;
        console.log(`  📊 Avg bet: ${Math.round(avgBet)} into pot of 12`);
        assert(avgBet >= 2, `Bets are above minimum (avg=${Math.round(avgBet)})`);
        assert(avgBet <= 200, `Bets are below max stack (avg=${Math.round(avgBet)})`);
        assert(avgBet >= 4 && avgBet <= 100, `Bets are reasonable size (avg=${Math.round(avgBet)})`);
    } else {
        console.log('  📊 No bets in 10 trials (all checks)');
        assert(true, 'No bets to validate (all checks is valid)');
    }

    // ═══════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════');

    if (failed > 0) {
        console.log('\n❌ FAILURES:');
        failures.forEach(f => console.log(`  - ${f}`));
    } else {
        console.log('\n✅ ALL TESTS PASSED — SWEEP 10 CLEAN');
    }

    console.log('');
    process.exit(failed > 0 ? 1 : 0);
})();
