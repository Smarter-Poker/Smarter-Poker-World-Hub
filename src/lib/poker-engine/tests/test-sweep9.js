/**
 * 🔬 SWEEP 9: INTENSE DEEP AUDIT
 * Focus areas:
 * 1. Postflop betting patterns — is the AI actually betting?
 * 2. saveOpponentRead + saveKeyHand Supabase persistence
 * 3. Event bus / RealtimeSync wiring check
 * 4. processHandResult full pipeline test
 * 5. Edge cases in all Phase 4-5 features
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
    console.log('  🔬 SWEEP 9: INTENSE DEEP AUDIT');
    console.log('═══════════════════════════════════════════════════\n');

    const HORSE = '00000000-0000-0000-0000-000000000028';
    await Brain.loadHorseIds();

    // ═══════════════════════════════════════════
    // TEST 1: POSTFLOP BETTING — Is the AI actually betting strong hands?
    // ═══════════════════════════════════════════
    console.log('--- TEST 1: Postflop Bet Frequency (Strong Hands) ---');

    let betCount = 0;
    let checkCount = 0;
    let totalPostflop = 0;

    // Test with STRONG hands (pocket aces on paired board, flush, etc.)
    const strongScenarios = [
        // Pocket aces on low board — should bet most of the time
        { hole: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], board: [{ rank: 7, suit: 2 }, { rank: 3, suit: 3 }, { rank: 2, suit: 0 }] },
        // Top set (KKK)
        { hole: [{ rank: 13, suit: 0 }, { rank: 13, suit: 1 }], board: [{ rank: 13, suit: 2 }, { rank: 8, suit: 3 }, { rank: 4, suit: 0 }] },
        // Top pair top kicker (AK on K-high board)
        { hole: [{ rank: 14, suit: 0 }, { rank: 13, suit: 1 }], board: [{ rank: 13, suit: 2 }, { rank: 7, suit: 3 }, { rank: 3, suit: 0 }] },
        // Flush (all hearts)
        { hole: [{ rank: 14, suit: 0 }, { rank: 10, suit: 0 }], board: [{ rank: 9, suit: 0 }, { rank: 5, suit: 0 }, { rank: 2, suit: 0 }] },
        // Straight (9-T-J-Q-K)
        { hole: [{ rank: 13, suit: 0 }, { rank: 12, suit: 1 }], board: [{ rank: 11, suit: 2 }, { rank: 10, suit: 3 }, { rank: 9, suit: 0 }] },
    ];

    for (const scenario of strongScenarios) {
        // Test each scenario 5 times to account for randomness
        for (let trial = 0; trial < 5; trial++) {
            try {
                const result = await Brain.getDecision(
                    HORSE,
                    {
                        players: [
                            { id: HORSE, holeCards: scenario.hole, stack: 200, position: 'btn', folded: false, invested: 6 },
                            { id: 'opp1', stack: 200, position: 'bb', folded: false, invested: 6 },
                        ],
                        communityCards: scenario.board,
                        phase: 'flop',
                        potTotal: 12,
                        currentBet: 0
                    },
                    [
                        { type: 'check' },
                        { type: 'bet', minAmount: 2, maxAmount: 200 }
                    ],
                    { bigBlind: 2 }
                );

                totalPostflop++;
                if (result.action.type === 'bet' || result.action.type === 'raise') {
                    betCount++;
                } else {
                    checkCount++;
                }
            } catch (err) {
                console.log(`  ⚠️ Error: ${err.message}`);
            }
        }
    }

    console.log(`  📊 Strong hand betting: ${betCount}/${totalPostflop} bets (${Math.round(betCount / totalPostflop * 100)}%), ${checkCount} checks`);
    assert(betCount > 0, `Strong hands produce SOME bets (got ${betCount}/${totalPostflop})`);
    assert(betCount / totalPostflop >= 0.3, `Strong hands bet rate >= 30% (got ${Math.round(betCount / totalPostflop * 100)}%)`);

    // ═══════════════════════════════════════════
    // TEST 2: FACING-A-BET DECISIONS
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 2: Facing a Bet (Call/Raise/Fold) ---');

    let facingBetCalls = 0;
    let facingBetRaises = 0;
    let facingBetFolds = 0;
    let facingTotal = 0;

    // Facing a bet with strong hand (should call or raise)
    for (let trial = 0; trial < 10; trial++) {
        try {
            const result = await Brain.getDecision(
                HORSE,
                {
                    players: [
                        { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], stack: 190, position: 'btn', folded: false, invested: 6 },
                        { id: 'opp1', stack: 190, position: 'bb', folded: false, invested: 12 },
                    ],
                    communityCards: [{ rank: 7, suit: 2 }, { rank: 3, suit: 3 }, { rank: 2, suit: 0 }],
                    phase: 'flop',
                    potTotal: 18,
                    currentBet: 6 // Opponent bet 6 into 12
                },
                [
                    { type: 'fold' },
                    { type: 'call', amount: 6 },
                    { type: 'raise', minAmount: 12, maxAmount: 190 }
                ],
                { bigBlind: 2 }
            );

            facingTotal++;
            if (result.action.type === 'call') facingBetCalls++;
            if (result.action.type === 'raise') facingBetRaises++;
            if (result.action.type === 'fold') facingBetFolds++;
        } catch (err) {
            console.log(`  ⚠️ Error: ${err.message}`);
        }
    }

    console.log(`  📊 AA vs bet: ${facingBetCalls} calls, ${facingBetRaises} raises, ${facingBetFolds} folds`);
    assert(facingBetFolds === 0, `AA never folds vs bet (folds: ${facingBetFolds})`);
    assert(facingBetCalls + facingBetRaises === facingTotal, `AA always continues (${facingBetCalls + facingBetRaises}/${facingTotal})`);

    // Facing a bet with trash (should fold)
    let trashFolds = 0;
    for (let trial = 0; trial < 10; trial++) {
        try {
            const result = await Brain.getDecision(
                HORSE,
                {
                    players: [
                        { id: HORSE, holeCards: [{ rank: 2, suit: 0 }, { rank: 3, suit: 1 }], stack: 190, position: 'btn', folded: false, invested: 0 },
                        { id: 'opp1', stack: 190, position: 'bb', folded: false, invested: 12 },
                    ],
                    communityCards: [{ rank: 14, suit: 2 }, { rank: 13, suit: 3 }, { rank: 10, suit: 0 }],
                    phase: 'flop',
                    potTotal: 18,
                    currentBet: 6
                },
                [
                    { type: 'fold' },
                    { type: 'call', amount: 6 },
                    { type: 'raise', minAmount: 12, maxAmount: 190 }
                ],
                { bigBlind: 2 }
            );

            if (result.action.type === 'fold') trashFolds++;
        } catch (err) { }
    }

    console.log(`  📊 23o vs bet on AKT: ${trashFolds}/10 folds`);
    assert(trashFolds >= 7, `Trash hand folds most of the time (folds: ${trashFolds}/10)`);

    // ═══════════════════════════════════════════
    // TEST 3: RIVER BETTING
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 3: River Value Betting ---');

    let riverBets = 0;
    for (let trial = 0; trial < 10; trial++) {
        try {
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
                    phase: 'river',
                    potTotal: 30,
                    currentBet: 0
                },
                [
                    { type: 'check' },
                    { type: 'bet', minAmount: 2, maxAmount: 170 }
                ],
                { bigBlind: 2 }
            );

            if (result.action.type === 'bet' || result.action.type === 'raise') riverBets++;
        } catch (err) { }
    }

    console.log(`  📊 AA on river (no bet facing): ${riverBets}/10 value bets`);
    assert(riverBets >= 5, `AA value bets the river often (bets: ${riverBets}/10)`);

    // ═══════════════════════════════════════════
    // TEST 4: TURN CONTINUATION
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 4: Turn Action Variety ---');

    let turnBets = 0;
    let turnChecks = 0;
    for (let trial = 0; trial < 10; trial++) {
        try {
            const result = await Brain.getDecision(
                HORSE,
                {
                    players: [
                        { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 13, suit: 0 }], stack: 180, position: 'btn', folded: false, invested: 10 },
                        { id: 'opp1', stack: 180, position: 'bb', folded: false, invested: 10 },
                    ],
                    communityCards: [
                        { rank: 13, suit: 2 }, { rank: 7, suit: 3 }, { rank: 3, suit: 1 },
                        { rank: 5, suit: 0 }
                    ],
                    phase: 'turn',
                    potTotal: 20,
                    currentBet: 0
                },
                [
                    { type: 'check' },
                    { type: 'bet', minAmount: 2, maxAmount: 180 }
                ],
                { bigBlind: 2 }
            );

            if (result.action.type === 'bet' || result.action.type === 'raise') turnBets++;
            else turnChecks++;
        } catch (err) { }
    }

    console.log(`  📊 AK (top pair) on turn: ${turnBets} bets, ${turnChecks} checks`);
    assert(turnBets >= 3, `Top pair bets the turn sometimes (bets: ${turnBets}/10)`);

    // ═══════════════════════════════════════════
    // TEST 5: SUPABASE saveOpponentRead E2E
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 5: saveOpponentRead Supabase E2E ---');

    const readResult = await Brain.saveOpponentRead(HORSE, 'test-opponent-e2e', {
        bluffFrequency: 0.25,
        valueFrequency: 0.30,
        foldFrequency: 0.45,
        callFrequency: 0.60,
        handsObserved: 50,
        tendency: 'loose-passive'
    });
    assert(readResult === true, `saveOpponentRead succeeded`);

    if (readResult) {
        const { data, error } = await supabase
            .from('horse_opponent_reads')
            .select('*')
            .eq('horse_id', HORSE)
            .eq('opponent_id', 'test-opponent-e2e');

        if (!error && data && data.length > 0) {
            assert(parseFloat(data[0].bluff_frequency) === 0.25, `Bluff freq saved: ${data[0].bluff_frequency}`);
            assert(data[0].tendency === 'loose-passive', `Tendency saved: ${data[0].tendency}`);
            assert(data[0].hands_observed === 50, `Hands observed saved: ${data[0].hands_observed}`);

            // Clean up
            await supabase.from('horse_opponent_reads').delete().eq('horse_id', HORSE).eq('opponent_id', 'test-opponent-e2e');
        } else {
            assert(false, `Read back opponent reads (error: ${error?.message || 'no data'})`);
        }
    }

    // ═══════════════════════════════════════════
    // TEST 6: SUPABASE saveKeyHand E2E
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 6: saveKeyHand Supabase E2E ---');

    const handResult = await Brain.saveKeyHand({
        handId: 'test-hand-e2e-' + Date.now(),
        tableId: 'test-table-e2e',
        result: {
            pot: 100,
            players: [
                { id: HORSE, chipDelta: 50 },
                { id: 'opponent', chipDelta: -50 }
            ],
            winners: [{ playerId: HORSE }],
            board: ['Ah', 'Kd', 'Qc', 'Js', '2h']
        }
    }, 2);

    assert(handResult === true, `saveKeyHand succeeded`);

    if (handResult) {
        const { data, error } = await supabase
            .from('horse_hand_history')
            .select('*')
            .eq('table_id', 'test-table-e2e')
            .order('recorded_at', { ascending: false })
            .limit(1);

        if (!error && data && data.length > 0) {
            assert(data[0].pot_size_bb === 50, `Pot size BB: ${data[0].pot_size_bb}`);
            assert(data[0].table_id === 'test-table-e2e', `Table ID: ${data[0].table_id}`);

            // Clean up
            await supabase.from('horse_hand_history').delete().eq('table_id', 'test-table-e2e');
        } else {
            assert(false, `Read back hand history (error: ${error?.message || 'no data'})`);
        }
    }

    // ═══════════════════════════════════════════
    // TEST 7: processHandResult PIPELINE
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 7: processHandResult Pipeline ---');

    // Initialize performance stats for this horse first
    Brain.recordPerformanceAction(HORSE, 'preflop', 'call', true);
    const statsBefore = Brain.getPerformanceStats(HORSE);
    const winsBefore = statsBefore.wins || 0;

    // Simulate a hand result with recordPerformanceAction already called
    try {
        await Brain.processHandResult({
            tableId: 'test-table-phr',
            result: {
                pot: 50,
                players: [
                    { id: HORSE, chipDelta: 25, showedCards: false, lastAction: 'call' },
                    { id: 'opponent1', chipDelta: -25, showedCards: false, lastAction: 'bet', folded: false }
                ],
                winners: [{ playerId: HORSE }],
                board: ['7c', '3s', '2d', '8h', '5c']
            }
        }, 2);
        assert(true, 'processHandResult completed without error');
    } catch (err) {
        assert(false, `processHandResult error: ${err.message}`);
    }

    // Check performance stats updated
    const statsAfter = Brain.getPerformanceStats(HORSE);
    assert(statsAfter.wins > winsBefore, `Wins incremented: ${winsBefore} → ${statsAfter.wins}`);

    // ═══════════════════════════════════════════
    // TEST 8: BET SIZING VARIETY ACROSS STREETS
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 8: Bet Sizing Variety ---');

    const sizes = new Set();
    for (const cat of ['quads', 'full_house', 'flush', 'straight', 'set', 'top_pair', 'overpair', 'middle_pair', 'high_card']) {
        for (const st of ['flop', 'turn', 'river']) {
            const size = Brain.getOptimalBetSize(cat, st, 100, false);
            sizes.add(Math.round(size * 100));
        }
    }
    console.log(`  📊 Unique bet sizes across all categories/streets: ${sizes.size}`);
    assert(sizes.size >= 5, `At least 5 unique sizes (got ${sizes.size})`);

    // Bluff vs value size difference
    const valueSize = Brain.getOptimalBetSize('set', 'flop', 100, false);
    const bluffSize = Brain.getOptimalBetSize('high_card', 'flop', 100, true);
    assert(valueSize > bluffSize, `Value bets bigger than bluff bets (${valueSize} > ${bluffSize})`);

    // ═══════════════════════════════════════════
    // TEST 9: MULTIWAY POT ADJUSTMENTS DEPTH
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 9: Multiway Pot Depth ---');

    for (let n = 2; n <= 9; n++) {
        const adj = Brain.getMultiwayAdjustment(n);
        console.log(`  ${n} players: penalty=${adj.strengthPenalty}, bluff=${adj.bluffReduction.toFixed(2)}`);
    }
    const adj2 = Brain.getMultiwayAdjustment(2);
    const adj4 = Brain.getMultiwayAdjustment(4);
    const adj9 = Brain.getMultiwayAdjustment(9);
    assert(adj4.strengthPenalty > adj2.strengthPenalty, `4-way tighter than HU (${adj4.strengthPenalty} > ${adj2.strengthPenalty})`);
    assert(adj9.strengthPenalty > adj4.strengthPenalty, `9-way tighter than 4-way (${adj9.strengthPenalty} > ${adj4.strengthPenalty})`);
    assert(adj9.bluffReduction < adj4.bluffReduction, `9-way less bluffing (${adj9.bluffReduction} < ${adj4.bluffReduction})`);

    // ═══════════════════════════════════════════
    // TEST 10: CHECK-RAISE ACROSS STRENGTHS
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 10: Check-Raise Strategy Sweep ---');

    const crResults = [];
    for (let str = 0; str <= 100; str += 10) {
        const cr = Brain.getCheckRaiseStrategy(str, false, false, 0);
        crResults.push({ strength: str, shouldCR: cr.shouldCheckRaise, freq: cr.frequency });
    }
    console.log('  Strength → Check-Raise:');
    crResults.forEach(r => console.log(`    ${r.strength}%: ${r.shouldCR ? '✓ CR' : '✗ No'} (freq=${(r.freq * 100).toFixed(0)}%)`));

    const weakCR = Brain.getCheckRaiseStrategy(20, false, false, 0);
    const strongCR = Brain.getCheckRaiseStrategy(80, false, false, 0);
    assert(weakCR.shouldCheckRaise === false, 'Weak hands don\'t check-raise');
    assert(strongCR.shouldCheckRaise === true, 'Strong hands check-raise');

    // ═══════════════════════════════════════════
    // TEST 11: C-BET FREQUENCY vs BOARD TEXTURE
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 11: C-Bet vs Board Texture ---');

    const cbDry = Brain.getCBetStrategy(true, true, 'dry', 2);
    const cbWet = Brain.getCBetStrategy(true, true, 'wet', 2);
    const cbMulti = Brain.getCBetStrategy(true, true, 'dry', 5);

    console.log(`  Dry/HU: freq=${cbDry.frequency.toFixed(2)}, Wet/HU: freq=${cbWet.frequency.toFixed(2)}, Dry/5-way: freq=${cbMulti.frequency.toFixed(2)}`);
    assert(cbDry.frequency > cbWet.frequency, `C-bet more on dry boards (${cbDry.frequency} > ${cbWet.frequency})`);
    assert(cbDry.frequency > cbMulti.frequency, `C-bet less multiway (${cbDry.frequency} > ${cbMulti.frequency})`);

    // ═══════════════════════════════════════════
    // TEST 12: PREFLOP HAND STRENGTH RANKING
    // ═══════════════════════════════════════════
    console.log('\n--- TEST 12: Preflop Strength Verification ---');

    const hands = [
        { hand: 'AA', expected: 95 }, { hand: 'KK', expected: 90 },
        { hand: 'AKs', expected: 80 }, { hand: 'JTs', expected: 44 },
        { hand: '72o', expected: 15 }
    ];

    for (const h of hands) {
        const str = Brain.getPreflopStrength(h.hand);
        console.log(`  ${h.hand}: strength=${str} (expected ~${h.expected})`);
        assert(Math.abs(str - h.expected) <= 15, `${h.hand} in expected range (~${h.expected}±15, got ${str})`);
    }

    // Verify ordering
    const aaStr = Brain.getPreflopStrength('AA');
    const kkStr = Brain.getPreflopStrength('KK');
    const aksStr = Brain.getPreflopStrength('AKs');
    const jtsStr = Brain.getPreflopStrength('JTs');
    const sevenTwoStr = Brain.getPreflopStrength('72o');

    assert(aaStr > kkStr, `AA > KK (${aaStr} > ${kkStr})`);
    assert(kkStr > aksStr, `KK > AKs (${kkStr} > ${aksStr})`);
    assert(aksStr > jtsStr, `AKs > JTs (${aksStr} > ${jtsStr})`);
    assert(jtsStr > sevenTwoStr, `JTs > 72o (${jtsStr} > ${sevenTwoStr})`);

    // ═══════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════');

    if (failed > 0) {
        console.log('\n❌ FAILURES:');
        failures.forEach(f => console.log(`  - ${f}`));
    } else {
        console.log('\n✅ ALL TESTS PASSED');
    }

    console.log('');
    process.exit(failed > 0 ? 1 : 0);
})();
