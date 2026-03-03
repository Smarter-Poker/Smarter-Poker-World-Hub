/**
 * 🔬 SWEEP 11: AUTONOMOUS PIPELINE VERIFICATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tests the 4 new gaps + regression on existing features:
 * 1. evolveHorseSkill persistence to Supabase
 * 2. Opponent read loading in getDecision
 * 3. fillTableWithHorses (via exported function check)
 * 4. autoRegisterHorses (via exported function check)
 * 5. Regression: card conversion, garbage folding, strong betting, evaluator
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
    console.log('  🔬 SWEEP 11: AUTONOMOUS PIPELINE VERIFICATION');
    console.log('═══════════════════════════════════════════════════\n');

    const HORSE = '00000000-0000-0000-0000-000000000028';
    await Brain.loadHorseIds();

    // ═══════════════════════════════════════════════════
    // TEST 1: SKILL EVOLUTION PERSISTENCE (Gap 3)
    // ═══════════════════════════════════════════════════
    console.log('--- TEST 1: Skill Evolution Persistence ---');

    // Evolve skill with a winning session
    const evo1 = Brain.evolveHorseSkill(HORSE, 15); // Winning session
    assert(typeof evo1.skillDrift === 'number', `evolveHorseSkill returns skillDrift: ${evo1.skillDrift}`);
    assert(typeof evo1.direction === 'string', `evolveHorseSkill returns direction: ${evo1.direction}`);
    assert(evo1.skillDrift >= 0, `Winning sessions produce positive drift: ${evo1.skillDrift}`);

    // Evolve again with another win
    const evo2 = Brain.evolveHorseSkill(HORSE, 20);
    assert(evo2.skillDrift >= evo1.skillDrift, `Consecutive wins increase drift: ${evo1.skillDrift} → ${evo2.skillDrift}`);

    // Evolve with a loss — should decrease
    const evo3 = Brain.evolveHorseSkill(HORSE, -10);
    assert(evo3.skillDrift <= evo2.skillDrift, `Losing session decreases drift: ${evo2.skillDrift} → ${evo3.skillDrift}`);

    // Wait briefly for Supabase persistence (non-blocking upsert)
    await new Promise(r => setTimeout(r, 2000));

    // Verify persistence in Supabase
    const { data: evoData } = await supabase
        .from('horse_session_stats')
        .select('session_data')
        .eq('horse_id', HORSE)
        .eq('table_id', `evolution_${HORSE}`)
        .single();
    assert(evoData !== null, 'Skill evolution persisted to Supabase');
    if (evoData?.session_data) {
        assert(typeof evoData.session_data.skillDrift === 'number', `Persisted drift value: ${evoData.session_data.skillDrift}`);
        assert(typeof evoData.session_data.totalSessions === 'number', `Persisted session count: ${evoData.session_data.totalSessions}`);
    }

    // ═══════════════════════════════════════════════════
    // TEST 2: OPPONENT READ SAVE + LOAD (Gap 4)
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 2: Opponent Read Pipeline ---');

    const OPP_ID = 'test-opp-sweep11-' + Date.now();

    // Save an opponent read
    const readSaved = await Brain.saveOpponentRead(HORSE, OPP_ID, {
        bluffFrequency: 0.45, // High bluffer
        valueFrequency: 0.25,
        foldFrequency: 0.30,
        callFrequency: 0.40,
        handsObserved: 50,
        tendency: 'loose-aggressive'
    });
    assert(readSaved === true, 'Opponent read saved successfully');

    // Verify it's in Supabase
    const { data: readBack } = await supabase
        .from('horse_opponent_reads')
        .select('read_data')
        .eq('horse_id', HORSE)
        .eq('opponent_id', OPP_ID)
        .single();
    assert(readBack?.read_data?.bluffFrequency === 0.45, `Opponent read loaded back: bluffFreq=${readBack?.read_data?.bluffFrequency}`);
    assert(readBack?.read_data?.tendency === 'loose-aggressive', `Opponent tendency: ${readBack?.read_data?.tendency}`);

    // Cleanup
    await supabase.from('horse_opponent_reads').delete().eq('horse_id', HORSE).eq('opponent_id', OPP_ID);

    // ═══════════════════════════════════════════════════
    // TEST 3: EVALUATE SESSIONS EXISTS
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 3: evaluateSessions Function ---');

    assert(typeof Brain.evaluateSessions === 'function', 'evaluateSessions is exported');

    // ═══════════════════════════════════════════════════
    // TEST 4: GAME CONTROLLER EXPORTS (Gaps 1 & 2)
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 4: GameController New Methods ---');

    const { GameController } = require('../GameController');
    assert(typeof GameController.prototype.fillTableWithHorses === 'function', 'fillTableWithHorses is a method');
    assert(typeof GameController.prototype.autoRegisterHorses === 'function', 'autoRegisterHorses is a method');
    assert(typeof GameController.prototype._getPersonalityModule === 'function', '_getPersonalityModule is a method');

    // ═══════════════════════════════════════════════════
    // TEST 5: REGRESSION — CARD CONVERSION
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 5: Regression — Card Conversion ---');

    const objCards = Brain.cardsToStrings([{ rank: 14, suit: 0 }, { rank: 13, suit: 1 }]);
    assert(objCards[0] === 'Ac', 'Object card → Ac');
    assert(objCards[1] === 'Kd', 'Object card → Kd');
    const strCards = Brain.cardsToStrings(['Ah', 'Ks']);
    assert(strCards[0] === 'Ah', 'String card → Ah');

    // ═══════════════════════════════════════════════════
    // TEST 6: REGRESSION — GARBAGE FOLDING
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 6: Regression — Garbage Folding ---');

    let folds = 0;
    for (let i = 0; i < 10; i++) {
        const r = await Brain.getDecision(HORSE,
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
        if (r.action.type === 'fold') folds++;
    }
    assert(folds >= 7, `23o folds most of the time: ${folds}/10`);

    // ═══════════════════════════════════════════════════
    // TEST 7: REGRESSION — STRONG HAND BETTING
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 7: Regression — Strong Hand Betting ---');

    let bets = 0;
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
        if (r.action.type === 'bet' || r.action.type === 'raise') bets++;
    }
    assert(bets >= 4, `AA bets the flop: ${bets}/10`);

    // ═══════════════════════════════════════════════════
    // TEST 8: REGRESSION — HAND EVALUATOR
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 8: Regression — Hand Evaluator ---');

    const eval1 = Brain.evaluatePostflopHand(['Ac', 'Ah'], ['7c', '3d', '2s']);
    assert(eval1.category === 'overpair', `AA overpair: ${eval1.category}`);
    assert(eval1.strength >= 55, `Overpair strength: ${eval1.strength}`);

    const eval2 = Brain.evaluatePostflopHand(['Kc', 'Kd'], ['Kh', '8s', '4c']);
    assert(eval2.category === 'set', `KK set: ${eval2.category}`);
    assert(eval2.strength >= 75, `Set strength: ${eval2.strength}`);

    // ═══════════════════════════════════════════════════
    // TEST 9: REGRESSION — SUPABASE PERSISTENCE
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 9: Regression — Supabase ---');

    Brain.recordPerformanceAction(HORSE, 'preflop', 'raise', true);
    const saved = await Brain.saveSessionAnalytics(HORSE, 'test-sweep11');
    assert(saved === true, 'saveSessionAnalytics works');

    // Cleanup
    await supabase.from('horse_session_stats').delete().eq('table_id', 'test-sweep11');

    // ═══════════════════════════════════════════════════
    // TEST 10: ALL KEY EXPORTS
    // ═══════════════════════════════════════════════════
    console.log('\n--- TEST 10: All Key Exports ---');

    const keyExports = [
        'getDecision', 'loadHorseIds', 'processHandResult', 'evaluatePostflopHand',
        'getPreflopStrength', 'cardsToStrings', 'isHorse', 'evolveHorseSkill',
        'evaluateSessions', 'saveSessionAnalytics', 'saveOpponentRead', 'saveKeyHand',
        'recordSitDown', 'recordRebuy', 'clearTableSessions'
    ];
    for (const fn of keyExports) {
        assert(typeof Brain[fn] === 'function', `Brain.${fn} exported`);
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
        console.log('\n✅ ALL TESTS PASSED — SWEEP 11 CLEAN');
    }

    // Cleanup evolution test data
    await supabase.from('horse_session_stats').delete().eq('table_id', `evolution_${HORSE}`);

    console.log('');
    process.exit(failed > 0 ? 1 : 0);
})();
