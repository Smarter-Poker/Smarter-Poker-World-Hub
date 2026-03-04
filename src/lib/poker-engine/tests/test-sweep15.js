/**
 * 🔬 SWEEP 15: PLO ANTI-EXPLOIT PHASE 4 VERIFICATION
 * ═══════════════════════════════════════════════════════════════════════════
 * Tests all 8 Phase 4 modules:
 * 25. Min-Raise Harassment Detector      (recordRaiseSize, isMinRaiser)
 * 26. Squeeze Overkill Detector          (recordSqueeze, isSqueezeOverkill)
 * 27. Reverse Implied Odds Guard         (detectReverseImplied)
 * 28. Cold-Call Trap Detector            (recordColdCall, recordBarrelVsColdCall, isColdCallTrap)
 * 29. Straddle & Bomb-Pot Adjuster       (detectBombPotOrStraddle)
 * 30. Angle-Shoot Timing Detector        (recordActionTiming, detectAngleShoot)
 * 31. Run-It-Twice Refusal Tracker       (recordRITResponse, isRITRefuser)
 * 32. Per-Session Chip-Leak Forensics    (recordChipLeak, getChipLeakBoosts)
 * + Full Phase 3/2/1 regression via export presence checks
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
    console.log('  🔬 SWEEP 15: PLO ANTI-EXPLOIT PHASE 4 VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const HORSE = '00000000-0000-0000-0000-000000000029';
    const HUMAN = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee06'; // Fresh ID
    const TABLE = 'sweep15-table-A';

    await Brain.loadHorseIds();

    // ═══════════════════════════════════════════════════════════════
    // TEST 1: MODULE 25 — Min-Raise Harassment Detector
    // ═══════════════════════════════════════════════════════════════
    console.log('--- TEST 1: Module 25 — recordRaiseSize / isMinRaiser ---');
    // Simulate 5 raises, 4 are min-raises (≤ 2.2× previous bet)
    for (let i = 0; i < 5; i++) {
        const isMin = i < 4;
        Brain.recordRaiseSize(HUMAN, isMin ? 4 : 12, 2, false); // 4 = 2×BB = min, 12 = 6×BB = normal
    }
    const minR = Brain.isMinRaiser(HUMAN);
    assert(minR.isMinRaiser === true, `Opponent with 80% min-raise rate = isMinRaiser (got: ${minR.isMinRaiser})`);
    assert(minR.rate > 0.40, `Rate > 40% (got: ${(minR.rate * 100).toFixed(0)}%)`);

    const HUMAN_NORMAL = 'ff000001-0000-0000-0000-000000000001';
    for (let i = 0; i < 5; i++) Brain.recordRaiseSize(HUMAN_NORMAL, 12, 2, true); // All normal raises
    assert(Brain.isMinRaiser(HUMAN_NORMAL).isMinRaiser === false, 'Large raiser = not min-raiser');

    // < 4 samples = not a min-raiser
    const HUMAN_FEW = 'ff000002-0000-0000-0000-000000000002';
    Brain.recordRaiseSize(HUMAN_FEW, 4, 2, false);
    Brain.recordRaiseSize(HUMAN_FEW, 4, 2, false);
    assert(Brain.isMinRaiser(HUMAN_FEW).isMinRaiser === false, '<4 samples = not min-raiser');

    // ═══════════════════════════════════════════════════════════════
    // TEST 2: MODULE 26 — Squeeze Overkill Detector
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 2: Module 26 — recordSqueeze / isSqueezeOverkill ---');
    // Simulate 3 squeezes all >4× pot
    for (let i = 0; i < 3; i++) Brain.recordSqueeze(HUMAN, 50, 10); // 5× pot
    const sqz = Brain.isSqueezeOverkill(HUMAN);
    assert(sqz.isOverkill === true, '5× pot squeeze avg = overkill');
    assert(sqz.avgMult === 5, `Avg mult = 5 (got: ${sqz.avgMult})`);

    const HUMAN_SQ2 = 'ff000003-0000-0000-0000-000000000003';
    for (let i = 0; i < 3; i++) Brain.recordSqueeze(HUMAN_SQ2, 30, 10); // 3× pot = normal
    assert(Brain.isSqueezeOverkill(HUMAN_SQ2).isOverkill === false, '3× pot = not overkill');

    // < 3 squeezes = not overkill
    const HUMAN_SQ3 = 'ff000004-0000-0000-0000-000000000004';
    Brain.recordSqueeze(HUMAN_SQ3, 60, 10);
    assert(Brain.isSqueezeOverkill(HUMAN_SQ3).isOverkill === false, '<3 squeezes = not overkill');

    // ═══════════════════════════════════════════════════════════════
    // TEST 3: MODULE 27 — Reverse Implied Odds Guard
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 3: Module 27 — detectReverseImplied ---');
    // Draw with 6 outs, calling 40% of pot, short stack, 3 opponents, wet board
    const rio1 = Brain.detectReverseImplied(6, 0.40, 10, 3, true);
    assert(rio1.shouldBlock === true, 'RIO > 1.5 + low equity + wet = block (got: ' + rio1.shouldBlock + ')');
    assert(rio1.rioFactor > 1.5, `RIO factor > 1.5 (got: ${rio1.rioFactor})`);

    // Nut draw (14 outs), calling 20% pot, deep stack, HU, dry board = acceptable
    const rio2 = Brain.detectReverseImplied(14, 0.20, 100, 1, false);
    assert(rio2.shouldBlock === false, 'Strong draw HU deep = no block (got: ' + rio2.shouldBlock + ')');

    // No draw (0 outs) = no block (made hand, not a draw call)
    const rio3 = Brain.detectReverseImplied(0, 0.30, 20, 2, false);
    assert(rio3.shouldBlock === false, '0 outs = no RIO block');

    // ═══════════════════════════════════════════════════════════════
    // TEST 4: MODULE 28 — Cold-Call Trap Detector
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 4: Module 28 — recordColdCall / isColdCallTrap ---');
    // Cold-caller who always holds monsters (barrels keep losing)
    const TRAPPER = 'ff000005-0000-0000-0000-000000000005';
    for (let i = 0; i < 5; i++) {
        Brain.recordColdCall(TRAPPER);
        Brain.recordBarrelVsColdCall(TRAPPER, false); // Barrel fails every time
    }
    const trap = Brain.isColdCallTrap(TRAPPER);
    assert(trap.isTrap === true, 'Barrels always fail vs cold-caller = trap');
    assert(trap.winRate < 0.35, `Win rate < 35% (got: ${trap.winRate})`);

    // Non-trapper: barrels win half the time
    const NOTRAP = 'ff000006-0000-0000-0000-000000000006';
    for (let i = 0; i < 6; i++) {
        Brain.recordColdCall(NOTRAP);
        Brain.recordBarrelVsColdCall(NOTRAP, i < 4); // Barrels win 4/6
    }
    assert(Brain.isColdCallTrap(NOTRAP).isTrap === false, 'Barrels win 67% = not a trap');

    // < 4 barrel samples = not a trap
    const NODATA = 'ff000007-0000-0000-0000-000000000007';
    Brain.recordColdCall(NODATA);
    assert(Brain.isColdCallTrap(NODATA).isTrap === false, '<4 barrels = not classified as trap');

    // ═══════════════════════════════════════════════════════════════
    // TEST 5: MODULE 29 — Straddle & Bomb-Pot Adjuster
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 5: Module 29 — detectBombPotOrStraddle ---');
    const standard = Brain.detectBombPotOrStraddle(4, 2, false); // 2×BB = standard
    assert(standard.isBombPot === false, 'Standard pot = not bomb-pot');
    assert(standard.isStraddle === false, 'Standard pot = not straddle');
    assert(standard.equityThresholdBoost === 0, 'Standard = 0 equity boost');
    assert(standard.label === 'standard', `Label = standard (got: ${standard.label})`);

    const bombPot = Brain.detectBombPotOrStraddle(20, 2, false); // 10×BB = bomb-pot
    assert(bombPot.isBombPot === true, '10×BB pot = bomb-pot');
    assert(bombPot.equityThresholdBoost === 15, `Bomb-pot boost = 15 (got: ${bombPot.equityThresholdBoost})`);

    const straddle = Brain.detectBombPotOrStraddle(8, 2, true); // Has straddle flag
    assert(straddle.isStraddle === true, 'hasStraddle=true = straddle');
    assert(straddle.isBombPot === false, 'Straddle not a bomb-pot');
    assert(straddle.equityThresholdBoost === 10, `Straddle boost = 10 (got: ${straddle.equityThresholdBoost})`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 6: MODULE 30 — Angle-Shoot Timing Detector
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 6: Module 30 — recordActionTiming / detectAngleShoot ---');
    const ANGLES = 'ff000008-0000-0000-0000-000000000008';
    // 8 actions, 7 are instant (<700ms)
    for (let i = 0; i < 8; i++) Brain.recordActionTiming(ANGLES, i === 3 ? 2000 : 400);
    const angle = Brain.detectAngleShoot(ANGLES);
    assert(angle.isAngleShooting === true, 'High instant-action rate = angle shooting');
    assert(angle.extraEntropyMs >= 2000, `Extra entropy >= 2000ms (got: ${angle.extraEntropyMs})`);

    // Legitimate player (slow actions)
    const LEGIT = 'ff000009-0000-0000-0000-000000000009';
    for (let i = 0; i < 8; i++) Brain.recordActionTiming(LEGIT, 3000);
    assert(Brain.detectAngleShoot(LEGIT).isAngleShooting === false, 'Slow player = not angle shooting');
    assert(Brain.detectAngleShoot(LEGIT).extraEntropyMs === 0, 'No extra entropy for legit player');

    // < 5 samples = not classified
    const FEWACT = 'ff000010-0000-0000-0000-000000000010';
    Brain.recordActionTiming(FEWACT, 100);
    assert(Brain.detectAngleShoot(FEWACT).isAngleShooting === false, '<5 samples = not classified');

    // 4 consecutive instant actions = angle shoot (even with low total)
    const CONSEC = 'ff000011-0000-0000-0000-000000000011';
    for (let i = 0; i < 5; i++) Brain.recordActionTiming(CONSEC, 200);
    assert(Brain.detectAngleShoot(CONSEC).isAngleShooting === true, '4+ consecutive instant = angle shoot');

    // ═══════════════════════════════════════════════════════════════
    // TEST 7: MODULE 31 — Run-It-Twice Refusal Tracker
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 7: Module 31 — recordRITResponse / isRITRefuser ---');
    const REFUSER = 'ff000012-0000-0000-0000-000000000012';
    Brain.recordRITResponse(REFUSER, false);
    Brain.recordRITResponse(REFUSER, false); // Always refuses
    assert(Brain.isRITRefuser(REFUSER).isRITRefuser === true, 'Always refuses RIT = refuser');
    assert(Brain.isRITRefuser(REFUSER).refusalRate === 1.0, 'Refusal rate = 100%');

    const ACCEPTER = 'ff000013-0000-0000-0000-000000000013';
    Brain.recordRITResponse(ACCEPTER, true);
    Brain.recordRITResponse(ACCEPTER, true);
    assert(Brain.isRITRefuser(ACCEPTER).isRITRefuser === false, 'Always accepts = not refuser');

    // < 2 offers = not classified
    const ONERIT = 'ff000014-0000-0000-0000-000000000014';
    Brain.recordRITResponse(ONERIT, false);
    assert(Brain.isRITRefuser(ONERIT).isRITRefuser === false, '<2 offers = not classified');

    // ═══════════════════════════════════════════════════════════════
    // TEST 8: MODULE 32 — Chip-Leak Forensics
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 8: Module 32 — recordChipLeak / getChipLeakBoosts ---');
    // Simulate 25BB OOP check-call loss
    Brain.recordChipLeak(HORSE, TABLE, 'oop_check_call', 25);
    const boosts = Brain.getChipLeakBoosts(HORSE, TABLE);
    assert(boosts.oopBoost === 8, `OOP leak >20BB → boost 8 (got: ${boosts.oopBoost})`);
    assert(boosts.multiwayBoost === 0, 'No multiway leak = 0 boost');
    assert(boosts.drawBoost === 0, 'No draw leak = 0 boost');
    assert(boosts.donkBoost === 0, 'No donk leak = 0 boost');

    // Loss < 20BB = no boost
    Brain.recordChipLeak(HORSE, TABLE + '-b', 'multiway_topset', 15);
    const boosts2 = Brain.getChipLeakBoosts(HORSE, TABLE + '-b');
    assert(boosts2.multiwayBoost === 0, 'Multiway leak <20BB = 0 boost');

    // Positive delta = no recording
    Brain.recordChipLeak(HORSE, TABLE, 'oop_check_call', -5); // negative loss = skip
    const boosts3 = Brain.getChipLeakBoosts(HORSE, TABLE);
    assert(boosts3.oopBoost === 8, 'Negative loss not recorded (boost unchanged)');

    // No data = all zeros
    const emptyBoosts = Brain.getChipLeakBoosts('nonexistent-horse', 'nonexistent-table');
    assert(emptyBoosts.oopBoost === 0 && emptyBoosts.multiwayBoost === 0 && emptyBoosts.drawBoost === 0 && emptyBoosts.donkBoost === 0,
        'No data = all zero boosts');

    // ═══════════════════════════════════════════════════════════════
    // TEST 9: ALL PHASE 4 EXPORTS PRESENT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 9: Phase 4 Exports ---');
    const p4exports = [
        'minRaiseMap', 'recordRaiseSize', 'isMinRaiser',
        'squeezeMap', 'recordSqueeze', 'isSqueezeOverkill',
        'detectReverseImplied',
        'coldCallMap', 'recordColdCall', 'recordBarrelVsColdCall', 'isColdCallTrap',
        'detectBombPotOrStraddle',
        'angleShootMap', 'recordActionTiming', 'detectAngleShoot',
        'ritRefusalMap', 'recordRITResponse', 'isRITRefuser',
        'chipLeakMap', 'recordChipLeak', 'getChipLeakBoosts',
    ];
    for (const exp of p4exports) {
        assert(Brain[exp] != null, `Brain.${exp} exported`);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 10: REGRESSION — Phase 3 + Phase 2 + Phase 1 key exports
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 10: Regression — Phase 1/2/3 Exports ---');
    const regrExp = [
        // Phase 3
        'reevaluatePLORunoutEquity', 'detectSPRTrap', 'getProbeFarmScore',
        'isImageExposed', 'detectLimpTrap', 'isMechanicalIsolator',
        'getOOPPositionalGuard', 'evaluateDonkBet',
        // Phase 2
        '_loadThreatIntel', 'isBlacklisted', 'crossTableRadar',
        'applyMultiwayEquityDiscount', 'detectNutBiasExploitBoard',
        // Core
        'getDecision', 'processHandResult', 'evaluatePostflopHand', 'isHorse',
    ];
    for (const exp of regrExp) {
        assert(Brain[exp] != null, `Brain.${exp} (regression) still exported`);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 11: INTEGRATION — PLO Decision Continues Working
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 11: Integration — PLO Decision ---');
    let ploDecisions = 0;
    for (let i = 0; i < 5; i++) {
        const r = await Brain.getDecision(HORSE, {
            tableId: TABLE,
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
    assert(ploDecisions === 5, `PLO decisions still operational: ${ploDecisions}/5`);

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
        console.log('\n✅ ALL PHASE 4 MODULES VERIFIED — SWEEP 15 CLEAN');
    }
    console.log('');
    process.exit(failed > 0 ? 1 : 0);
})();
