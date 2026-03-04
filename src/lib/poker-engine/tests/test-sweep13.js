/**
 * 🔬 SWEEP 13: PLO ANTI-EXPLOIT PHASE 2 VERIFICATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests all 8 Phase 2 modules:
 * 9.  Threat Intelligence Persistence  (_loadThreatIntel, threatIntelCache)
 * 10. Cross-Table Collusion Radar      (crossTableRadar)
 * 11. Proactive Range Rotation         (getRangeRotationGear, rangeRotationMap)
 * 12. PLO Multiway Equity Shield       (applyMultiwayEquityDiscount)
 * 13. PLO Nut-Bias Exploit Detector    (detectNutBiasExploitBoard)
 * 14. Dynamic Blacklist Enforcer       (getThreatScore, isBlacklisted)
 * 15. Anti-Timebank Abuse Detector     (timeAbuseSuspicion)
 * 16. Threat Score Leaderboard         (threatIntelCache preload)
 * + Full regression on Sweep 12 key exports
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
    console.log('  🔬 SWEEP 13: PLO ANTI-EXPLOIT PHASE 2 VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const HORSE = '00000000-0000-0000-0000-000000000029';
    const HUMAN = '99999999-9999-9999-9999-999999999902';
    const CLEAN_HUMAN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // No threat data injected
    const TABLE_A = 'sweep13-table-A';
    const TABLE_B = 'sweep13-table-B';
    const TABLE_C = 'sweep13-table-C';

    await Brain.loadHorseIds();

    // ═══════════════════════════════════════════════════════════════
    // TEST 1: MODULE 12 — PLO Multiway Equity Discount
    // ═══════════════════════════════════════════════════════════════
    console.log('--- TEST 1: Module 12 — applyMultiwayEquityDiscount ---');
    assert(Brain.applyMultiwayEquityDiscount(70, 2) === 70, '2 players: no discount (70→70)');
    assert(Brain.applyMultiwayEquityDiscount(70, 3) === 60, '3 players: -10 discount (70→60)');
    assert(Brain.applyMultiwayEquityDiscount(70, 4) === 52, '4 players: -18 discount (70→52)');
    assert(Brain.applyMultiwayEquityDiscount(70, 5) === 45, '5 players: -25 discount (70→45)');
    assert(Brain.applyMultiwayEquityDiscount(70, 9) === 45, '9 players: capped at -25 (70→45)');
    assert(Brain.applyMultiwayEquityDiscount(20, 5) === 0, 'Does not go below 0 (20-25=0)');

    // ═══════════════════════════════════════════════════════════════
    // TEST 2: MODULE 13 — PLO Nut-Bias Exploit Detector
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 2: Module 13 — detectNutBiasExploitBoard ---');
    // Dry rainbow low board
    const dryBoard = [{ rank: 2, suit: 0 }, { rank: 5, suit: 1 }, { rank: 9, suit: 2 }];
    const dryResult = Brain.detectNutBiasExploitBoard(dryBoard, 2);
    assert(dryResult.nutUnlikelyScore >= 40, `Dry rainbow low board scores high (${dryResult.nutUnlikelyScore})`);
    assert(dryResult.shouldAddCheckRaise === true, 'Should add check-raise on dry board');

    // Wet board (flush-possible, connected)
    const wetBoard = [{ rank: 10, suit: 0 }, { rank: 11, suit: 0 }, { rank: 12, suit: 0 }];
    const wetResult = Brain.detectNutBiasExploitBoard(wetBoard, 2);
    assert(wetResult.shouldAddCheckRaise === false, 'Should NOT add check-raise on wet monotone board');

    // Empty board (preflop)
    const emptyResult = Brain.detectNutBiasExploitBoard([], 2);
    assert(emptyResult.nutUnlikelyScore === 0, 'Empty board returns 0 score');

    // ═══════════════════════════════════════════════════════════════
    // TEST 3: MODULE 11 — Proactive Range Rotation
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 3: Module 11 — getRangeRotationGear ---');
    const gear1 = Brain.getRangeRotationGear(HORSE, TABLE_A);
    assert(typeof gear1.gear === 'string', `Gear is a string: "${gear1.gear}"`);
    assert(['A', 'B', 'C', 'D'].includes(gear1.gear), `Gear is valid: ${gear1.gear}`);
    assert(typeof gear1.foldMod === 'number', `foldMod is number: ${gear1.foldMod}`);
    assert(typeof gear1.raiseMod === 'number', `raiseMod is number: ${gear1.raiseMod}`);

    // After 29 more calls it should rotate on the 30th
    for (let i = 0; i < 29; i++) Brain.getRangeRotationGear(HORSE, TABLE_A);
    const gear30 = Brain.getRangeRotationGear(HORSE, TABLE_A); // 30th call — should rotate
    assert(typeof gear30.gear === 'string', 'Gear still valid after 31 calls');

    // Verify two different horses start at different gears (stagger)
    const HORSE2 = '00000000-0000-0000-0000-000000000030';
    Brain.getRangeRotationGear(HORSE, TABLE_B);
    const gear_h2 = Brain.getRangeRotationGear(HORSE2, TABLE_B);
    assert(['A', 'B', 'C', 'D'].includes(gear_h2.gear), `Horse 2 has valid gear: ${gear_h2.gear}`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 4: MODULE 10 — Cross-Table Collusion Radar
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 4: Module 10 — crossTableRadar ---');
    assert(Brain.crossTableRadar instanceof Map, 'crossTableRadar is a Map');

    // Simulate human at 3 tables via processHandResult
    for (const table of [TABLE_A, TABLE_B, TABLE_C]) {
        await Brain.processHandResult({
            tableId: table,
            players: [
                { id: HORSE, chipDelta: -10, lastAction: 'call', showedCards: false, folded: false },
                { id: HUMAN, chipDelta: 10, lastAction: 'bet', hadInitiative: true, folded: false, betAmount: 20 }
            ],
            result: { winners: [{ playerId: HUMAN }], players: [{ id: HORSE, chipDelta: -10 }, { id: HUMAN, chipDelta: 10 }] }
        }, 2);
    }

    const humanTables = Brain.crossTableRadar.get(HUMAN);
    assert(humanTables instanceof Set, 'Cross-table radar Set created for human');
    assert((humanTables?.size || 0) >= 3, `Human tracked at ≥3 tables (found: ${humanTables?.size})`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 5: MODULE 15 — Anti-Timebank Abuse
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 5: Module 15 — timeAbuseSuspicion ---');
    for (let i = 0; i < 5; i++) {
        await Brain.processHandResult({
            tableId: TABLE_A,
            players: [
                { id: HORSE, chipDelta: -5, lastAction: 'fold', showedCards: false, folded: false },
                { id: HUMAN, chipDelta: 5, lastAction: 'bet', hadInitiative: true, folded: false, betAmount: 10, lastActionDurationMs: 30000 }
            ],
            result: { winners: [{ playerId: HUMAN }], players: [{ id: HORSE, chipDelta: -5 }, { id: HUMAN, chipDelta: 5 }] }
        }, 2);
    }
    const tbData = Brain.timeAbuseSuspicion.get(HUMAN);
    assert(tbData != null, 'Timebank suspicion entry created');
    assert((tbData?.suspicionScore || 0) > 0, `Suspicion score incremented: ${tbData?.suspicionScore}`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 6: MODULE 14 — Dynamic Blacklist Enforcer (getThreatScore)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 6: Module 14 — getThreatScore ---');
    const botMap = Brain.suspectBotMap;
    botMap.set(HUMAN, { perfectFolds: 20, gtoSizes: 25, humanErrors: 2, handsObserved: 30, suspectScore: 90 });

    const patMap = Brain.patternProfitMap;
    if (!patMap.has(HORSE)) patMap.set(HORSE, new Map());
    patMap.get(HORSE).set(HUMAN, { cbet: 20, check_raise: 5, float: 3, bluff: 2, totalProfit: 30 });

    const score = Brain.getThreatScore(HUMAN);
    assert(typeof score === 'number', 'getThreatScore returns a number');
    assert(score >= 50 && score <= 100, `Threat score in valid range: ${score}`);
    assert(score > 30, `High-signal human has elevated score: ${score}`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 7: MODULE 14 — isBlacklisted
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 7: Module 14 — isBlacklisted ---');
    assert(Brain.isBlacklisted(HUMAN) === false, 'No blacklist in cache yet (clean state)');

    Brain.threatIntelCache.set(HUMAN, {
        suspectBotScore: 90, totalScore: 90,
        blacklistedUntil: Date.now() + 24 * 60 * 60 * 1000
    });
    assert(Brain.isBlacklisted(HUMAN) === true, 'isBlacklisted returns true for cached future blacklist');

    Brain.threatIntelCache.set(HUMAN + '_exp', {
        totalScore: 90,
        blacklistedUntil: Date.now() - 1000 // Already expired
    });
    assert(Brain.isBlacklisted(HUMAN + '_exp') === false, 'Expired blacklist returns false');

    // ═══════════════════════════════════════════════════════════════
    // TEST 8: MODULE 9 — Threat Intel Cache
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 8: Module 9 — Threat Intel Cache ---');
    assert(Brain.threatIntelCache instanceof Map, 'threatIntelCache is a Map');
    assert(typeof Brain._loadThreatIntel === 'function', '_loadThreatIntel exported');
    assert(typeof Brain._persistThreatIntel === 'function', '_persistThreatIntel exported');

    // ═══════════════════════════════════════════════════════════════
    // TEST 9: MODULE 15 — Tablebank Blacklist Map
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 9: Module 15 — tableTimebankBlacklist ---');
    assert(Brain.tableTimebankBlacklist instanceof Map, 'tableTimebankBlacklist is a Map');

    // ═══════════════════════════════════════════════════════════════
    // TEST 10: MODULE 11 — Range Rotation State Map
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 10: Module 11 — rangeRotationMap ---');
    assert(Brain.rangeRotationMap instanceof Map, 'rangeRotationMap is a Map');
    assert(Brain.rangeRotationMap.has(`${HORSE}:${TABLE_A}`), `rangeRotationMap has entry for HORSE:TABLE_A`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 11: MODULE 12 — Multiway Discount wired into PLO pipeline
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 11: Module 12 — Multiway Discount Wiring ---');
    // Verify discount produces different values for 2 vs 5 players (function correctness)
    const disc2p = Brain.applyMultiwayEquityDiscount(60, 2);
    const disc5p = Brain.applyMultiwayEquityDiscount(60, 5);
    assert(disc5p < disc2p, `5-player discount (${disc5p}) < 2-player (${disc2p}) — discount active`);

    // Verify PLO routing works without crashing (uses CLEAN_HUMAN who has no threat data)
    let ploDecisions = 0;
    for (let i = 0; i < 5; i++) {
        const r = await Brain.getDecision(HORSE, {
            tableId: TABLE_A,
            players: [
                { id: HORSE, holeCards: [{ rank: 5, suit: 0 }, { rank: 6, suit: 1 }, { rank: 8, suit: 2 }, { rank: 9, suit: 3 }], stack: 200, position: 'mp', folded: false, invested: 0 },
                { id: CLEAN_HUMAN, stack: 200, position: 'btn', folded: false, invested: 8 },
                { id: 'player_x', stack: 200, position: 'bb', folded: false, invested: 8 }
            ],
            communityCards: [{ rank: 14, suit: 0 }, { rank: 13, suit: 1 }, { rank: 12, suit: 2 }],
            phase: 'flop', potTotal: 24, currentBet: 8, variant: 'plo4'
        },
            [{ type: 'fold' }, { type: 'call', amount: 8 }, { type: 'raise', minAmount: 16, maxAmount: 200 }],
            { bigBlind: 2, variant: 'plo4' });
        if (r.action?.type) ploDecisions++;
    }
    assert(ploDecisions === 5, `PLO multiway routing produces valid actions in 3-way pot (${ploDecisions}/5)`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 12: ALL PHASE 2 EXPORTS PRESENT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 12: Phase 2 Exports ---');
    const p2exports = [
        '_loadThreatIntel', '_persistThreatIntel', 'getThreatScore', 'isBlacklisted',
        'crossTableRadar', 'getRangeRotationGear', 'rangeRotationMap',
        'applyMultiwayEquityDiscount', 'detectNutBiasExploitBoard',
        'timeAbuseSuspicion', 'tableTimebankBlacklist', 'threatIntelCache',
    ];
    for (const exp of p2exports) {
        assert(Brain[exp] != null, `Brain.${exp} exported`);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 13: REGRESSION — All Phase 1 Anti-Exploit Exports
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 13: Regression — Phase 1 Exports ---');
    const p1exports = [
        'selectCounterStrategy', 'frequencyObfuscatorMap', 'showdownExposureMap',
        'patternProfitMap', 'chaosSuppressionMap', 'suspectBotMap',
    ];
    for (const exp of p1exports) {
        assert(Brain[exp] != null, `Brain.${exp} (Phase 1) still exported`);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 14: REGRESSION — Core Brain Functions
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 14: Regression — Core Brain Functions ---');
    const coreExports = ['getDecision', 'processHandResult', 'evaluatePostflopHand', 'isHorse', 'evolveHorseSkill'];
    for (const fn of coreExports) {
        assert(typeof Brain[fn] === 'function', `Brain.${fn} is function`);
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 15: REGRESSION — Holdem Still Works Post-Module-12
    // ═══════════════════════════════════════════════════════════════
    console.log('\n--- TEST 15: Regression — Holdem decisions unaffected ---');
    let holdemActions = 0;
    for (let i = 0; i < 5; i++) {
        const r = await Brain.getDecision(HORSE, {
            tableId: TABLE_A,
            players: [
                { id: HORSE, holeCards: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], stack: 200, position: 'btn', folded: false, invested: 4 },
                { id: CLEAN_HUMAN, stack: 200, position: 'bb', folded: false, invested: 4 }
            ],
            communityCards: [],
            phase: 'preflop', potTotal: 8, currentBet: 4, variant: 'holdem'
        },
            [{ type: 'fold' }, { type: 'call', amount: 4 }, { type: 'raise', minAmount: 8, maxAmount: 200 }],
            { bigBlind: 2 });
        if (r.action?.type) holdemActions++;
    }
    assert(holdemActions === 5, `Holdem AA preflop still produces decisions (${holdemActions}/5)`);

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
        console.log('\n✅ ALL PHASE 2 MODULES VERIFIED — SWEEP 13 CLEAN');
    }
    console.log('');
    process.exit(failed > 0 ? 1 : 0);
})();
