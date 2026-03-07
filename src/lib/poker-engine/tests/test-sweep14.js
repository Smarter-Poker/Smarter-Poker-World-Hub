/**
 * 🔬 SWEEP 14: PLO ANTI-EXPLOIT PHASE 3 VERIFICATION
 * ═══════════════════════════════════════════════════════════════════════════
 * Tests all 8 Phase 3 modules:
 * 17. PLO Runout Equity Re-Evaluator    (reevaluatePLORunoutEquity)
 * 18. SPR Pot-Commitment Trap Detector  (detectSPRTrap)
 * 19. Probe-Bet Frequency Harvester     (recordProbeBet, getProbeFarmScore)
 * 20. Table Image Exposure Monitor      (recordTableImageHand, isImageExposed)
 * 21. PLO Preflop Limp-Trap Detector    (detectLimpTrap)
 * 22. Isolation Sizing Tell Tracker     (recordIsoSize, isMechanicalIsolator)
 * 23. OOP Positional Equity Leak Guard  (getOOPPositionalGuard)
 * 24. River Donk-Bet Exploitation Block (evaluateDonkBet)
 * + Full regression on Sweep 13 key exports
 */

const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const Brain = require('../HorsePokerBrain');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
    if (condition) { passed++; console.log(`  ✅ ${label}`); }
    else { failed++; failures.push(label); console.error(`  ❌ FAIL: ${label}`); }
}

(async () => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  🔬 SWEEP 14: PLO ANTI-EXPLOIT PHASE 3 VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const HORSE = '00000000-0000-0000-0000-000000000029';
    const HUMAN = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03'; // Fresh ID, no prior state
    const TABLE_A = 'sweep14-table-A';
    const TABLE_B = 'sweep14-table-B';

    await Brain.loadHorseIds();

    // ═══════════════════════════════════════════════════════════════
    // TEST 1: MODULE 17 — PLO Runout Equity Re-Evaluator
    // ═══════════════════════════════════════════════════════════════
    console.log('--- TEST 1: Module 17 — reevaluatePLORunoutEquity ---');
    const blank = Brain.reevaluatePLORunoutEquity(55, 56, 'turn');
    assert(blank.runoutType === 'blank', `Blank runout (+1 delta) = blank (got: ${blank.runoutType})`);
    assert(blank.multiplier === 1.0, `Blank runout multiplier = 1.0 (got: ${blank.multiplier})`);

    const improve = Brain.reevaluatePLORunoutEquity(50, 60, 'river');
    assert(improve.runoutType === 'improve', `+10 delta = improve (got: ${improve.runoutType})`);
    assert(improve.multiplier > 1.0, `Improve multiplier > 1 (got: ${improve.multiplier})`);

    const nutImprove = Brain.reevaluatePLORunoutEquity(45, 65, 'river');
    assert(nutImprove.runoutType === 'nut_improve', `+20 delta = nut_improve (got: ${nutImprove.runoutType})`);
    assert(nutImprove.multiplier === 1.20, `Nut improve multiplier = 1.20 (got: ${nutImprove.multiplier})`);

    const scare = Brain.reevaluatePLORunoutEquity(65, 50, 'turn');
    assert(scare.runoutType === 'scare', `-15 delta = scare (got: ${scare.runoutType})`);
    assert(scare.multiplier < 1.0, `Scare multiplier < 1 (got: ${scare.multiplier})`);

    const preflop = Brain.reevaluatePLORunoutEquity(60, 60, 'preflop');
    assert(preflop.runoutType === 'blank' && preflop.multiplier === 1.0, 'Preflop returns blank (no runout)');

    // ═══════════════════════════════════════════════════════════════
    // TEST 2: MODULE 18 — SPR Pot-Commitment Trap Detector
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 2: Module 18 — detectSPRTrap ---');
    const noTrap = Brain.detectSPRTrap(20, 100, 500, 2, 60);
    assert(noTrap.shouldFoldTrap === false, 'Undersized bet = no trap');

    const marginalTrap = Brain.detectSPRTrap(95, 100, 200, 3, 45);
    assert(marginalTrap.isTrap === true, 'Pot-size jam with 45 equity = trap detected');
    assert(marginalTrap.shouldFoldTrap === true, 'Fold trap: equity below adjusted threshold');

    const okCommit = Brain.detectSPRTrap(95, 100, 200, 2, 75);
    assert(okCommit.shouldFoldTrap === false, 'Strong equity (75) vs pot-size jam = commit OK');

    const zeroCall = Brain.detectSPRTrap(0, 100, 200, 2, 50);
    assert(zeroCall.shouldFoldTrap === false, 'No call needed = no trap');

    // ═══════════════════════════════════════════════════════════════
    // TEST 3: MODULE 19 — Probe-Bet Frequency Harvester
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 3: Module 19 — recordProbeBet / getProbeFarmScore ---');
    // Simulate 6 probe bets, 5 wins
    for (let i = 0; i < 6; i++) {
        Brain.recordProbeBet(HUMAN, 0.25, i < 5, 10);
    }
    const farmScore = Brain.getProbeFarmScore(HUMAN);
    assert(typeof farmScore === 'number', `getProbeFarmScore returns number: ${farmScore}`);
    assert(farmScore > 0.5, `Farm score > 0.5 (got: ${farmScore.toFixed(2)})`);
    assert(farmScore < 1.0, `Farm score < 1.0 (got: ${farmScore.toFixed(2)})`);

    // Non-probe bets should not be recorded
    const prevScore = Brain.getProbeFarmScore(HUMAN);
    Brain.recordProbeBet(HUMAN, 0.50, true, 20); // 50% pot = not a probe
    assert(Brain.getProbeFarmScore(HUMAN) === prevScore, 'Non-probe bet does not change score');

    // New human with < 4 probes = score 0
    Brain.recordProbeBet('fresh-human', 0.20, true, 5);
    assert(Brain.getProbeFarmScore('fresh-human') === 0, 'Less than 4 probes returns 0 score');

    // ═══════════════════════════════════════════════════════════════
    // TEST 4: MODULE 20 — Table Image Exposure Monitor
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 4: Module 20 — recordTableImageHand / isImageExposed ---');
    // Play 10 hands, 4 showdowns = 40% → exposed
    for (let i = 0; i < 10; i++) {
        Brain.recordTableImageHand(HORSE, TABLE_A, i < 4);
    }
    assert(Brain.isImageExposed(HORSE, TABLE_A) === true, 'Horse with 40% showdown rate is exposed');

    // Play 10 hands, 1 showdown = 10% → not exposed
    const HORSE2 = '00000000-0000-0000-0000-000000000030';
    for (let i = 0; i < 10; i++) {
        Brain.recordTableImageHand(HORSE2, TABLE_A, i === 0);
    }
    assert(Brain.isImageExposed(HORSE2, TABLE_A) === false, 'Horse with 10% showdown rate is not exposed');

    // Less than 8 hands = not exposed (insufficient sample)
    Brain.recordTableImageHand(HORSE, TABLE_B, true);
    assert(Brain.isImageExposed(HORSE, TABLE_B) === false, 'Less than 8 hands = not exposed (sample too small)');

    // ═══════════════════════════════════════════════════════════════
    // TEST 5: MODULE 21 — PLO Preflop Limp-Trap Detector
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 5: Module 21 — detectLimpTrap ---');
    const dangerousTrap = Brain.detectLimpTrap(3, 'btn', 4, false);
    assert(dangerousTrap.isLimpTrap === true, '3 limpers + short SPR = limp trap');
    assert(dangerousTrap.recommendation === 'prefer_call_or_fold', 'Recommendation: call or fold');

    const safeRaise = Brain.detectLimpTrap(1, 'btn', 15, false);
    assert(safeRaise.isLimpTrap === false, '1 limper + deep SPR = safe to raise');
    assert(safeRaise.recommendation === 'raise_ok', 'Recommendation: raise ok');

    const nutHand = Brain.detectLimpTrap(4, 'ep', 3, true); // Nut hand = always raise
    assert(nutHand.isLimpTrap === false, 'Nut hand ignores limp trap (always raise)');
    assert(nutHand.riskScore === 0, 'Nut hand risk score = 0');

    // ═══════════════════════════════════════════════════════════════
    // TEST 6: MODULE 22 — Isolation Sizing Tell Tracker
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 6: Module 22 — recordIsoSize / isMechanicalIsolator ---');
    // Simulate mechanical isolator (always raises exactly 4BB)
    for (let i = 0; i < 6; i++) Brain.recordIsoSize(HUMAN, 4.0);
    const mechResult = Brain.isMechanicalIsolator(HUMAN);
    assert(mechResult.isMechanical === true, 'Human always iso-raising 4BB = mechanical');
    assert(mechResult.avgSize === 4.0, `Avg iso size = 4.0 (got: ${mechResult.avgSize})`);
    assert(mechResult.stdDev < 0.1, `StdDev < 0.1 (got: ${mechResult.stdDev.toFixed(4)})`);

    // Simulate varied isolator
    const HUMAN2 = 'cccccccc-cccc-cccc-cccc-cccccccccc04';
    [3.0, 4.5, 2.5, 5.0, 3.5, 6.0].forEach(s => Brain.recordIsoSize(HUMAN2, s));
    const variedResult = Brain.isMechanicalIsolator(HUMAN2);
    assert(variedResult.isMechanical === false, 'Human with varied iso sizes = not mechanical');

    // Less than 5 samples = not mechanical
    const HUMAN3 = 'dddddddd-dddd-dddd-dddd-dddddddddd05';
    Brain.recordIsoSize(HUMAN3, 4.0);
    Brain.recordIsoSize(HUMAN3, 4.0);
    assert(Brain.isMechanicalIsolator(HUMAN3).isMechanical === false, 'Less than 5 samples = not mechanical');

    // ═══════════════════════════════════════════════════════════════
    // TEST 7: MODULE 23 — OOP Positional Equity Leak Guard
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 7: Module 23 — getOOPPositionalGuard ---');
    const inPosition = Brain.getOOPPositionalGuard(true, false, 45, 'flop');
    assert(inPosition.shouldGuard === false, 'In-position: no guard needed');
    assert(inPosition.equityBoost === 0, 'In-position: no equity boost');

    const oopWithInit = Brain.getOOPPositionalGuard(false, true, 45, 'flop');
    assert(oopWithInit.shouldGuard === false, 'OOP with initiative (c-bet): no guard');

    const oopNoInit = Brain.getOOPPositionalGuard(false, false, 45, 'flop');
    assert(oopNoInit.shouldGuard === true, 'OOP without initiative + low equity: guard active');
    assert(oopNoInit.equityBoost === 8, 'OOP flop guard boost = 8 (got: ' + oopNoInit.equityBoost + ')');

    const oopRiver = Brain.getOOPPositionalGuard(false, false, 45, 'river');
    assert(oopRiver.equityBoost === 12, `OOP river boost = 12 (got: ${oopRiver.equityBoost})`);

    const oopStrongHand = Brain.getOOPPositionalGuard(false, false, 80, 'flop');
    assert(oopStrongHand.shouldGuard === false, 'OOP + strong equity: no guard (can bet for value)');

    // ═══════════════════════════════════════════════════════════════
    // TEST 8: MODULE 24 — River Donk-Bet Exploitation Block
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 8: Module 24 — evaluateDonkBet ---');
    const strongVsDonk = Brain.evaluateDonkBet(30, 100, true, 70);
    assert(strongVsDonk.action === 'raise', `Strong equity (70) vs donk = raise (got: ${strongVsDonk.action})`);

    const weakVsDonk = Brain.evaluateDonkBet(30, 100, true, 30);
    assert(weakVsDonk.action === 'fold', `Weak equity (30) vs donk = fold (got: ${weakVsDonk.action})`);

    const mediumVsDonk = Brain.evaluateDonkBet(30, 100, true, 55);
    assert(mediumVsDonk.action === 'call', `Medium equity (55) vs donk = call (got: ${mediumVsDonk.action})`);

    const oop = Brain.evaluateDonkBet(30, 100, false, 70); // OOP = not facing a donk
    assert(oop.action === 'none', `OOP (not IP) = none (got: ${oop.action})`);

    const largeBet = Brain.evaluateDonkBet(90, 100, true, 70); // > 80% pot = not a donk
    assert(largeBet.action === 'none', `Large bet (> 80% pot) = none, not a donk (got: ${largeBet.action})`);

    const noCall = Brain.evaluateDonkBet(0, 100, true, 70); // No call needed
    assert(noCall.action === 'none', `No call = none (got: ${noCall.action})`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 9: ALL PHASE 3 EXPORTS PRESENT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 9: Phase 3 Exports ---');
    const p3exports = [
        'reevaluatePLORunoutEquity', 'detectSPRTrap',
        'probeBetMap', 'recordProbeBet', 'getProbeFarmScore',
        'imageExposureMap', 'recordTableImageHand', 'isImageExposed',
        'detectLimpTrap',
        'isoSizingMap', 'recordIsoSize', 'isMechanicalIsolator',
        'getOOPPositionalGuard', 'evaluateDonkBet',
    ];
    for (const exp of p3exports) {
        assert(Brain[exp] != null, `Brain.${exp} exported`);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 10: REGRESSION — Phase 2 Exports Still Intact
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 10: Regression — Phase 2 Exports ---');
    const p2exports = [
        '_loadThreatIntel', '_persistThreatIntel', 'getThreatScore', 'isBlacklisted',
        'crossTableRadar', 'getRangeRotationGear', 'rangeRotationMap',
        'applyMultiwayEquityDiscount', 'detectNutBiasExploitBoard',
        'timeAbuseSuspicion', 'tableTimebankBlacklist', 'threatIntelCache',
    ];
    for (const exp of p2exports) {
        assert(Brain[exp] != null, `Brain.${exp} (Phase 2) still exported`);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 11: REGRESSION — Core Brain Functions
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 11: Regression — Core Brain Functions ---');
    const coreExports = ['getDecision', 'processHandResult', 'evaluatePostflopHand', 'isHorse', 'evolveHorseSkill'];
    for (const fn of coreExports) {
        assert(typeof Brain[fn] === 'function', `Brain.${fn} is function`);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 12: INTEGRATION — PLO Decision Still Works
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 12: Integration — PLO Decision ---');
    let ploDecisions = 0;
    for (let i = 0; i < 5; i++) {
        const r = await Brain.getDecision(HORSE, {
            tableId: TABLE_A,
            players: [
                { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }, { rank: 13, suit: 0 }, { rank: 13, suit: 1 }], stack: 200, position: 'btn', folded: false, invested: 4 },
                { id: HUMAN, stack: 200, position: 'bb', folded: false, invested: 4 }
            ],
            communityCards: [{ rank: 2, suit: 0 }, { rank: 7, suit: 1 }, { rank: 9, suit: 2 }],
            phase: 'flop', potTotal: 8, currentBet: 0, variant: 'plo4'
        },
            [{ type: 'check' }, { type: 'bet', minAmount: 2, maxAmount: 200 }],
            { bigBlind: 2, variant: 'plo4' });
        if (r.action?.type) ploDecisions++;
    }
    assert(ploDecisions === 5, `PLO decision routing fully operational (${ploDecisions}/5)`);

    // ═══════════════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════');
    if (failed > 0) {
        console.log('\n❌ FAILURES:');
        failures.forEach(f => console.error(`  - ${f}`));
    } else {
        console.log('\n✅ ALL PHASE 3 MODULES VERIFIED — SWEEP 14 CLEAN');
    }
    console.log('');
    process.exit(failed > 0 ? 1 : 0);
})();
