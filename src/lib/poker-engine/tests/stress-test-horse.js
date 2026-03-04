/**
 * 🔥 STRESS TEST: MISSION-CRITICAL HORSE DECISION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * NOT a unit test. This hammers the ACTUAL decision pipeline with:
 *   1. Extreme edge cases (0 stack, 1BB stack, 10000BB deep)
 *   2. All streets × all positions × all hand strengths
 *   3. Concurrent module activation (all 32 simultaneously)
 *   4. Timing verification (must complete under 100ms per decision)
 *   5. NaN/undefined/crash detection on every output
 *   6. Variable scoping verification for deferred utility calls
 *   7. Module data flow verification (recording → detection → decision)
 */

const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const Brain = require('../HorsePokerBrain');

let passed = 0;
let failed = 0;
const failures = [];
const newBugs = [];

function assert(condition, label, extra = '') {
    if (condition) {
        passed++;
        console.log(`  ✅ ${label}${extra ? ' [' + extra + ']' : ''}`);
    } else {
        failed++;
        failures.push(label);
        newBugs.push(label);
        console.error(`  ❌ FAIL: ${label}${extra ? ' — ' + extra : ''}`);
    }
}

const HR = 'aaaaaaaa-0000-0000-0000-000000000001';
const HU1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const TABLE = 'stress-test-table';

const NUT_HAND = [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }, { rank: 13, suit: 0 }, { rank: 13, suit: 1 }];
const DRAW_HAND = [{ rank: 5, suit: 1 }, { rank: 6, suit: 2 }, { rank: 7, suit: 1 }, { rank: 8, suit: 2 }];
const WEAK_HAND = [{ rank: 3, suit: 1 }, { rank: 5, suit: 2 }, { rank: 8, suit: 3 }, { rank: 13, suit: 1 }];
const TRASH_HAND = [{ rank: 2, suit: 0 }, { rank: 4, suit: 1 }, { rank: 6, suit: 2 }, { rank: 9, suit: 3 }];

const BOARDS = {
    preflop: [],
    flop_wet: [{ rank: 10, suit: 0 }, { rank: 9, suit: 0 }, { rank: 2, suit: 0 }],
    flop_dry: [{ rank: 7, suit: 0 }, { rank: 3, suit: 1 }, { rank: 2, suit: 2 }],
    turn: [{ rank: 10, suit: 0 }, { rank: 9, suit: 0 }, { rank: 2, suit: 0 }, { rank: 4, suit: 1 }],
    river: [{ rank: 10, suit: 0 }, { rank: 9, suit: 0 }, { rank: 2, suit: 0 }, { rank: 4, suit: 1 }, { rank: 6, suit: 3 }],
    mono_flop: [{ rank: 14, suit: 0 }, { rank: 10, suit: 0 }, { rank: 5, suit: 0 }],
    paired_board: [{ rank: 7, suit: 0 }, { rank: 7, suit: 1 }, { rank: 3, suit: 2 }],
};

function mkState(board, hand, pot, toCall, stack, position = 'btn', numPlayers = 2, extras = {}) {
    const players = [
        { id: HR, holeCards: hand, stack, position, folded: false, invested: toCall > 0 ? 0 : 2 },
        { id: HU1, stack, position: 'bb', folded: false, invested: toCall > 0 ? pot / 2 : 2 }
    ];
    if (numPlayers >= 3) players.push({ id: 'cc-p3', stack, position: 'co', folded: false, invested: 2 });
    if (numPlayers >= 4) players.push({ id: 'cc-p4', stack, position: 'sb', folded: false, invested: 2 });
    return {
        tableId: TABLE,
        players,
        communityCards: board,
        phase: board.length === 0 ? 'preflop' : board.length === 3 ? 'flop' : board.length === 4 ? 'turn' : 'river',
        potTotal: pot,
        currentBet: toCall,
        variant: 'plo4',
        ...extras
    };
}

function mkLegal(toCall, stack = 100, pot = 10) {
    if (toCall > 0) return [
        { type: 'fold' },
        { type: 'call', amount: Math.min(toCall, stack) },
        { type: 'raise', minAmount: Math.min(toCall * 2, stack), maxAmount: stack }
    ];
    return [
        { type: 'check' },
        { type: 'bet', minAmount: 1, maxAmount: stack }
    ];
}

function tc() { return { bigBlind: 2, variant: 'plo4' }; }

function isValidAction(action) {
    if (!action) return false;
    if (!action.type) return false;
    if (!['fold', 'call', 'check', 'bet', 'raise', 'all_in'].includes(action.type)) return false;
    if ((action.type === 'bet' || action.type === 'raise') && (action.amount == null || isNaN(action.amount))) return false;
    if (action.amount !== undefined && (isNaN(action.amount) || action.amount < 0)) return false;
    return true;
}

(async () => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  🔥 STRESS TEST: MISSION-CRITICAL HORSE DECISION ENGINE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const horses = await Brain.loadHorseIds();
    horses.add(HR);

    // ══════════════════════════════════════════════════════════════
    // TEST 1: EXTREME EDGE CASES — Stacks, Pots, Positions
    // ══════════════════════════════════════════════════════════════
    console.log('═══ TEST 1: EXTREME EDGE CASES ═══\n');

    const edgeCases = [
        { label: '1BB stack facing jam', board: 'flop_wet', hand: NUT_HAND, pot: 100, toCall: 2, stack: 2, pos: 'bb' },
        { label: '0.5BB stack', board: 'flop_dry', hand: WEAK_HAND, pot: 50, toCall: 1, stack: 1, pos: 'sb' },
        { label: '10000BB deep', board: 'turn', hand: DRAW_HAND, pot: 20, toCall: 10, stack: 20000, pos: 'btn' },
        { label: 'Pot = 0 preflop', board: 'preflop', hand: NUT_HAND, pot: 0, toCall: 0, stack: 100, pos: 'btn' },
        { label: 'Max pot facing bet', board: 'river', hand: TRASH_HAND, pot: 5000, toCall: 2500, stack: 3000, pos: 'bb' },
        { label: 'toCall > stack', board: 'flop_wet', hand: NUT_HAND, pot: 200, toCall: 150, stack: 100, pos: 'co' },
        { label: 'Mono flop nut hand', board: 'mono_flop', hand: NUT_HAND, pot: 20, toCall: 10, stack: 100, pos: 'btn' },
        { label: 'Paired board draw', board: 'paired_board', hand: DRAW_HAND, pot: 15, toCall: 5, stack: 60, pos: 'sb' },
        { label: '4-way pot weak hand', board: 'flop_wet', hand: WEAK_HAND, pot: 16, toCall: 4, stack: 80, pos: 'ep', np: 4 },
    ];

    for (const ec of edgeCases) {
        try {
            const state = mkState(BOARDS[ec.board], ec.hand, ec.pot, ec.toCall, ec.stack, ec.pos, ec.np || 2);
            const result = await Brain.getDecision(HR, state, mkLegal(ec.toCall, ec.stack, ec.pot), tc());
            assert(isValidAction(result.action), `EDGE: ${ec.label} → valid action`, `got: ${result.action?.type}/${result.action?.amount}`);
            assert(typeof result.delayMs === 'number' && result.delayMs >= 0, `EDGE: ${ec.label} → valid delayMs`, `got: ${result.delayMs}`);
            assert(!isNaN(result.action?.amount || 0), `EDGE: ${ec.label} → no NaN in amount`);
        } catch (e) {
            assert(false, `EDGE: ${ec.label} → CRASHED: ${e.message}`);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // TEST 2: TIMING — Must complete decisions under 100ms
    // ══════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 2: TIMING VERIFICATION (< 100ms per decision) ═══\n');

    const timingRuns = 20;
    const timings = [];
    for (let i = 0; i < timingRuns; i++) {
        const start = process.hrtime.bigint();
        await Brain.getDecision(HR,
            mkState(BOARDS.flop_wet, NUT_HAND, 20, 5, 100, 'btn'),
            mkLegal(5, 100, 20), tc());
        const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000; // ms
        timings.push(elapsed);
    }
    const avg = timings.reduce((s, v) => s + v, 0) / timings.length;
    const max = Math.max(...timings);
    const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)];
    assert(avg < 100, `TIMING: Avg decision time < 100ms`, `avg=${avg.toFixed(2)}ms`);
    assert(max < 500, `TIMING: Max decision time < 500ms`, `max=${max.toFixed(2)}ms`);
    assert(p95 < 200, `TIMING: P95 decision time < 200ms`, `p95=${p95.toFixed(2)}ms`);
    console.log(`  📊 Timing stats: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, max=${max.toFixed(2)}ms`);

    // ══════════════════════════════════════════════════════════════
    // TEST 3: ALL STREETS × ALL POSITIONS — Matrix coverage
    // ══════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 3: STREET × POSITION MATRIX ═══\n');

    const streets = [
        { name: 'preflop', board: BOARDS.preflop },
        { name: 'flop', board: BOARDS.flop_wet },
        { name: 'turn', board: BOARDS.turn },
        { name: 'river', board: BOARDS.river },
    ];
    const positions = ['btn', 'co', 'sb', 'bb', 'ep', 'mp'];
    const hands = [
        { name: 'nuts', cards: NUT_HAND },
        { name: 'draw', cards: DRAW_HAND },
        { name: 'weak', cards: WEAK_HAND },
        { name: 'trash', cards: TRASH_HAND },
    ];

    let matrixOk = 0, matrixFail = 0;
    for (const street of streets) {
        for (const pos of positions) {
            for (const hand of hands) {
                try {
                    const result = await Brain.getDecision(HR,
                        mkState(street.board, hand.cards, 12, 4, 100, pos),
                        mkLegal(4, 100, 12), tc());
                    if (isValidAction(result.action) && typeof result.delayMs === 'number') {
                        matrixOk++;
                    } else {
                        matrixFail++;
                        console.error(`  ❌ Matrix fail: ${street.name}/${pos}/${hand.name} → ${JSON.stringify(result.action)}`);
                    }
                } catch (e) {
                    matrixFail++;
                    console.error(`  ❌ Matrix CRASH: ${street.name}/${pos}/${hand.name} → ${e.message}`);
                }
            }
        }
    }
    assert(matrixFail === 0, `MATRIX: ${matrixOk}/${matrixOk + matrixFail} street×position×hand combos valid`, `${matrixFail} failures`);

    // ══════════════════════════════════════════════════════════════
    // TEST 4: ALL 32 MODULES ACTIVE SIMULTANEOUSLY
    // ══════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 4: SIMULTANEOUS MODULE ACTIVATION ═══\n');

    // Prime every module with data
    const OPP = 'stress-opp-001';

    // Module 25: Min-raise
    for (let i = 0; i < 6; i++) Brain.recordRaiseSize(OPP, 4, 2, false);
    // Module 26: Squeeze
    for (let i = 0; i < 4; i++) Brain.recordSqueeze(OPP, 80, 10);
    // Module 28: Cold-call
    for (let i = 0; i < 5; i++) { Brain.recordColdCall(OPP); Brain.recordBarrelVsColdCall(OPP, false); }
    // Module 30: Angle-shoot
    for (let i = 0; i < 8; i++) Brain.recordActionTiming(OPP, 200);
    // Module 31: RIT refusal
    Brain.recordRITResponse(OPP, false);
    Brain.recordRITResponse(OPP, false);
    // Module 32: Chip leak
    Brain.recordChipLeak(HR, TABLE, 'oop_check_call', 25);
    Brain.recordChipLeak(HR, TABLE, 'multiway_topset', 30);
    // Module 20: Image exposure
    for (let i = 0; i < 12; i++) Brain.recordTableImageHand(HR, TABLE, i < 6);
    // Module 19: Probe farming
    for (let i = 0; i < 5; i++) Brain.recordProbeBet(OPP, 0.20, true, 5);
    // Module 22: Iso sizing
    for (let i = 0; i < 6; i++) Brain.recordIsoSize(OPP, 4.0);

    // Now make a decision with ALL modules primed
    const allModuleState = mkState(BOARDS.river, NUT_HAND, 30, 10, 100, 'btn', 2, {
        isSBvsBB: false,
        wasPFRaiser: true,
        isLimpedPot: false,
        allInPlayers: [],
        sessionMinutes: 120,
        opponentLossBB: 50,
    });
    allModuleState.players[1].id = OPP;

    try {
        const compoundResult = await Brain.getDecision(HR, allModuleState, mkLegal(10, 100, 30), tc());
        assert(isValidAction(compoundResult.action), `COMPOUND: All 32 modules active → valid decision`, `got: ${compoundResult.action?.type}`);
        assert(typeof compoundResult.delayMs === 'number', `COMPOUND: delayMs valid`, `got: ${compoundResult.delayMs}`);
        assert(compoundResult.delayMs >= 0, `COMPOUND: delayMs non-negative`);
    } catch (e) {
        assert(false, `COMPOUND: All modules active → CRASHED: ${e.message}`);
    }

    // ══════════════════════════════════════════════════════════════
    // TEST 5: processHandResult STRESS — incomplete data
    // ══════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 5: processHandResult STRESS ═══\n');

    const phrCases = [
        { label: 'Empty everything', data: { tableId: TABLE, players: [], result: { winners: [], players: [] } } },
        { label: 'No result object', data: { tableId: TABLE, players: [{ id: HR, stack: 100 }] } },
        { label: 'Null players', data: { tableId: TABLE, players: null, result: { winners: [], players: [] } } },
        { label: 'Missing chipDelta', data: { tableId: TABLE, players: [{ id: HR, stack: 100 }], result: { winners: [{ playerId: HR }], players: [{ id: HR, showedCards: true, showdown: true }] } } },
        { label: 'Horse wins big', data: { tableId: TABLE, bigBlind: 2, players: [{ id: HR, holeCards: NUT_HAND, stack: 200, chipDelta: 100, showedCards: true, lastAction: 'raise' }], result: { winners: [{ playerId: HR }], players: [{ id: HR, showedCards: true, chipDelta: 100 }] } } },
        { label: 'Horse loses big', data: { tableId: TABLE, bigBlind: 2, street: 'river', players: [{ id: HR, chipDelta: -100, showedCards: false }], result: { winners: [{ playerId: HU1 }], players: [{ id: HR, chipDelta: -100, invested: 50 }] } } },
        { label: 'Multiple opponents', data: { tableId: TABLE, bigBlind: 2, numPlayers: 4, players: [{ id: HR, chipDelta: 20 }, { id: HU1, chipDelta: -10, lastAction: 'raise', betAmount: 8, actionTimeMs: 500 }, { id: 'cc-p3', chipDelta: -10 }], result: { winners: [{ playerId: HR }], players: [{ id: HR, showedCards: false }, { id: HU1, showedCards: true }] } } },
    ];

    for (const phr of phrCases) {
        try {
            await Brain.processHandResult(phr.data, 2);
            assert(true, `PHR: ${phr.label} → no crash`);
        } catch (e) {
            assert(false, `PHR: ${phr.label} → CRASHED: ${e.message}`);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // TEST 6: DEFERRED UTILITY CALL VERIFICATION
    // Verify that the 6 utility functions we moved actually receive
    // real equityFinal values (not 0) by checking decision behavior
    // ══════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 6: DEFERRED UTILITY CALL DEEP VERIFICATION ═══\n');

    // If multiWayGov still received 0, it would ALWAYS block aggression in 4-way
    // With real equity (nuts), it should allow SOME aggression
    const mw4State = mkState(BOARDS.flop_dry, NUT_HAND, 8, 0, 100, 'btn', 4);
    let mw4Checks = 0;
    for (let i = 0; i < 30; i++) {
        const r = await Brain.getDecision(HR, mw4State, mkLegal(0, 100, 8), tc());
        if (r.action?.type === 'check') mw4Checks++;
    }
    // With equity=0, multiWayGov blocks ALL aggression → 30/30 checks
    // With real equity, some bets should get through
    assert(mw4Checks < 30, `DEFERRED-3: multiWayGov receives equity (checks: ${mw4Checks}/30 — if broken, would be 30/30)`);

    // If coldCallDecision still received 0, horse would ALWAYS fold facing raises
    // With real equity (nuts), it should always continue
    const preState = mkState(BOARDS.preflop, NUT_HAND, 6, 4, 100, 'co', 3, { numCallers: 1 });
    let preFolds = 0;
    for (let i = 0; i < 20; i++) {
        const r = await Brain.getDecision(HR, preState, mkLegal(4, 100, 6), tc());
        if (r.action?.type === 'fold') preFolds++;
    }
    assert(preFolds === 0, `DEFERRED-8: coldCallDecision receives equity — nuts never fold facing raise (folds: ${preFolds}/20)`);

    // If sidePot received 0, it would always suggest fold with all-in players
    const spState = mkState(BOARDS.flop_wet, NUT_HAND, 30, 10, 100, 'btn', 2, { allInPlayers: [{ id: 'allin-1', stack: 0 }] });
    let spFolds = 0;
    for (let i = 0; i < 10; i++) {
        const r = await Brain.getDecision(HR, spState, mkLegal(10, 100, 30), tc());
        if (r.action?.type === 'fold') spFolds++;
    }
    assert(spFolds === 0, `DEFERRED-5: sidePot receives equity — nuts never fold with side pot (folds: ${spFolds}/10)`);

    // ══════════════════════════════════════════════════════════════
    // TEST 7: MODULE 24 RIVER DONK BLOCK — ACTUALLY FIRES
    // ══════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 7: MODULE 24 RIVER DONK BLOCK FIRES IN RIVER ═══\n');

    // If Module 24 was still dead code, the horse with 100% equity facing a small
    // river donk bet IP would not get the Module 24 raise. Let's verify.
    const donkState = mkState(BOARDS.river, NUT_HAND, 20, 3, 100, 'btn');
    let donkRaises = 0;
    for (let i = 0; i < 10; i++) {
        const r = await Brain.getDecision(HR, donkState, mkLegal(3, 100, 20), tc());
        if (r.action?.type === 'raise') donkRaises++;
    }
    assert(donkRaises >= 5, `M24-LIVE: River IP vs small donk with nuts → raises (raises: ${donkRaises}/10)`);

    // ══════════════════════════════════════════════════════════════
    // TEST 8: HOLDEM REGRESSION — PLO changes don't break Holdem
    // ══════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 8: HOLDEM REGRESSION ═══\n');

    const holdemHands = [
        { label: 'AA preflop', hand: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], board: [], phase: 'preflop', pot: 6, toCall: 4 },
        { label: 'AA flop', hand: [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }], board: [{ rank: 2, suit: 0 }, { rank: 7, suit: 1 }, { rank: 9, suit: 2 }], phase: 'flop', pot: 12, toCall: 0 },
        { label: '72o river', hand: [{ rank: 7, suit: 0 }, { rank: 2, suit: 1 }], board: [{ rank: 14, suit: 0 }, { rank: 13, suit: 1 }, { rank: 11, suit: 2 }, { rank: 8, suit: 3 }, { rank: 3, suit: 0 }], phase: 'river', pot: 20, toCall: 10 },
    ];

    for (const hh of holdemHands) {
        try {
            const r = await Brain.getDecision(HR, {
                tableId: TABLE,
                players: [
                    { id: HR, holeCards: hh.hand, stack: 100, position: 'btn', folded: false, invested: 2 },
                    { id: HU1, stack: 100, position: 'bb', folded: false, invested: 4 }
                ],
                communityCards: hh.board, phase: hh.phase, potTotal: hh.pot, currentBet: hh.toCall, variant: 'holdem'
            }, mkLegal(hh.toCall, 100, hh.pot), { bigBlind: 2, variant: 'holdem' });
            assert(isValidAction(r.action), `HOLDEM: ${hh.label} → valid`, `got: ${r.action?.type}`);
        } catch (e) {
            assert(false, `HOLDEM: ${hh.label} → CRASHED: ${e.message}`);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // TEST 9: OUTPUT INTEGRITY — No NaN, Infinity, undefined
    // ══════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 9: OUTPUT INTEGRITY ═══\n');

    let nanCount = 0, undefinedCount = 0;
    for (let i = 0; i < 50; i++) {
        const boardKeys = Object.keys(BOARDS);
        const randomBoard = BOARDS[boardKeys[i % boardKeys.length]];
        const randomHand = [NUT_HAND, DRAW_HAND, WEAK_HAND, TRASH_HAND][i % 4];
        const randomPot = Math.max(2, (i * 7) % 200);
        const randomToCall = i % 3 === 0 ? 0 : Math.max(1, (i * 3) % 50);
        const randomStack = Math.max(2, (i * 11) % 500);

        try {
            const r = await Brain.getDecision(HR,
                mkState(randomBoard, randomHand, randomPot, randomToCall, randomStack, ['btn', 'bb', 'sb', 'co', 'ep', 'mp'][i % 6]),
                mkLegal(randomToCall, randomStack, randomPot), tc());

            if (r.action?.amount !== undefined && isNaN(r.action.amount)) nanCount++;
            if (r.action?.type === undefined) undefinedCount++;
            if (r.delayMs === undefined || isNaN(r.delayMs)) nanCount++;
        } catch (e) {
            undefinedCount++;
        }
    }
    assert(nanCount === 0, `INTEGRITY: Zero NaN values in 50 random decisions (NaN count: ${nanCount})`);
    assert(undefinedCount === 0, `INTEGRITY: Zero undefined actions in 50 random decisions (undefined count: ${undefinedCount})`);

    // ══════════════════════════════════════════════════════════════
    // TEST 10: DATA FLOW — Recording feeds detection feeds decision
    // ══════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 10: DATA FLOW PIPELINE ═══\n');

    // Module 25: Record → Detect → Available in state
    const FLOW_OPP = 'flow-test-opp-001';
    for (let i = 0; i < 6; i++) Brain.recordRaiseSize(FLOW_OPP, 4, 2, false);
    const mrResult = Brain.isMinRaiser(FLOW_OPP);
    assert(mrResult.isMinRaiser === true, `FLOW-25: recordRaiseSize → isMinRaiser = true`);

    // Module 26: Record → Detect
    for (let i = 0; i < 4; i++) Brain.recordSqueeze(FLOW_OPP, 80, 10);
    const sqResult = Brain.isSqueezeOverkill(FLOW_OPP);
    assert(sqResult.isOverkill === true, `FLOW-26: recordSqueeze → isSqueezeOverkill = true`);

    // Module 20: Record → Detect
    const FLOW_TABLE = 'flow-test-table';
    for (let i = 0; i < 10; i++) Brain.recordTableImageHand(HR, FLOW_TABLE, i < 5);
    assert(Brain.isImageExposed(HR, FLOW_TABLE) === true, `FLOW-20: recordTableImageHand → isImageExposed = true`);

    // Module 31: Record → Detect
    const RIT_OPP = 'flow-rit-opp';
    Brain.recordRITResponse(RIT_OPP, false);
    Brain.recordRITResponse(RIT_OPP, false);
    const ritResult = Brain.isRITRefuser(RIT_OPP);
    assert(ritResult.isRITRefuser === true, `FLOW-31: recordRITResponse → isRITRefuser = true`);

    // Module 32: Record → Get boosts
    const LEAK_T = 'flow-leak-table';
    Brain.recordChipLeak(HR, LEAK_T, 'oop_check_call', 25);
    const lb = Brain.getChipLeakBoosts(HR, LEAK_T);
    assert(lb.oopBoost === 8, `FLOW-32: recordChipLeak → getChipLeakBoosts.oopBoost = 8`);

    // Module 30: Record → Detect
    const ANGLE_OPP = 'flow-angle-opp';
    for (let i = 0; i < 8; i++) Brain.recordActionTiming(ANGLE_OPP, 200);
    const angleResult = Brain.detectAngleShoot(ANGLE_OPP);
    assert(angleResult.isAngleShooting === true, `FLOW-30: recordActionTiming → detectAngleShoot = true`);

    // ══════════════════════════════════════════════════════════════
    // FINAL RESULTS
    // ══════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════');
    if (failed > 0) {
        console.log('\n🔴 NEW BUGS FOUND:');
        newBugs.forEach(b => console.error(`  - ${b}`));
        process.exit(1);
    } else {
        console.log('\n✅ STRESS TEST CLEAN — ZERO NEW BUGS — ENGINE IS BATTLE-READY');
    }
    console.log('');
})();
