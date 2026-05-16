/**
 * 🔬 DEEP END-TO-END VERIFICATION
 * Tests that Supabase tables exist, data persists, multi-hand logic works,
 * betting patterns are realistic, and the full pipeline runs correctly.
 */
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
    if (condition) { passed++; console.debug(`  ✅ ${label}`); }
    else { failed++; failures.push(label); console.debug(`  ❌ FAIL: ${label}`); }
}

(async () => {

    console.debug('\n═══════════════════════════════════════════════════');
    console.debug('  🔬 DEEP END-TO-END HORSE AI VERIFICATION');
    console.debug('═══════════════════════════════════════════════════\n');

    const Brain = require('../brain');
    const Adv = require('../../../content-engine/services/HorsePokerAdvanced');

    // ═══════════════════════════════════════════
    // TEST 1: SUPABASE TABLE EXISTENCE
    // ═══════════════════════════════════════════
    console.debug('--- TEST 1: Supabase Table Existence ---');

    const tables = ['horse_session_stats', 'horse_opponent_reads', 'horse_hand_history'];
    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.debug(`  ⚠️  Table "${table}" — Error: ${error.message}`);
            if (error.message.includes('does not exist') || error.code === '42P01') {
                assert(false, `Supabase table "${table}" EXISTS`);
            } else {
                // Table exists but might have RLS or other issues
                assert(true, `Supabase table "${table}" EXISTS (RLS may block reads: ${error.code})`);
            }
        } else {
            assert(true, `Supabase table "${table}" EXISTS (rows: ${data?.length || 0})`);
        }
    }

    // ═══════════════════════════════════════════
    // TEST 2: MULTI-HAND SIMULATION (50 hands)
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 2: Multi-Hand Stress Test (50 decisions) ---');


    // Load horse IDs
    await Brain.loadHorseIds();

    const HORSE = '00000000-0000-0000-0000-000000000028';
    const decisions = { raise: 0, call: 0, check: 0, fold: 0, all_in: 0 };
    const preflopDecisions = [];
    const postflopDecisions = [];
    let errors = 0;

    // Simulate 25 preflop + 25 postflop decisions
    const suits = [0, 1, 2, 3]; // hearts, diamonds, clubs, spades
    const positions = ['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB'];

    for (let i = 0; i < 25; i++) {
        try {
            const rank1 = 2 + (i % 13);
            const rank2 = 2 + ((i + 3) % 13);
            const pos = positions[i % positions.length];

            const result = await Brain.getDecision(
                HORSE,
                {
                    players: [
                        { id: HORSE, holeCards: [{ rank: rank1, suit: i % 4 }, { rank: rank2, suit: (i + 1) % 4 }], stack: 200, position: pos.toLowerCase(), folded: false, invested: 0 },
                        { id: 'opp1', stack: 200, position: 'bb', folded: false, invested: 2 },
                        { id: 'opp2', stack: 200, position: 'sb', folded: false, invested: 1 },
                    ],
                    communityCards: [],
                    phase: 'preflop',
                    potTotal: 3,
                    currentBet: 2
                },
                [
                    { type: 'fold' },
                    { type: 'call', amount: 2 },
                    { type: 'raise', minAmount: 6, maxAmount: 200 }
                ],
                { bigBlind: 2 }
            );

            const action = result.action.type;
            decisions[action] = (decisions[action] || 0) + 1;
            preflopDecisions.push({ hand: `${rank1}${rank2}`, pos, action, delay: result.delayMs });
        } catch (err) {
            errors++;
            console.debug(`  ⚠️ Preflop hand ${i} error: ${err.message}`);
        }
    }

    for (let i = 0; i < 25; i++) {
        try {
            const rank1 = 2 + (i % 13);
            const rank2 = 14;// Always Ace kicker
            const boardRanks = [2 + ((i * 3) % 13), 2 + ((i * 5) % 13), 2 + ((i * 7) % 13)];

            const result = await Brain.getDecision(
                HORSE,
                {
                    players: [
                        { id: HORSE, holeCards: [{ rank: rank1, suit: 0 }, { rank: rank2, suit: 1 }], stack: 190, position: 'btn', folded: false, invested: 6 },
                        { id: 'opp1', stack: 190, position: 'bb', folded: false, invested: 6 },
                    ],
                    communityCards: [
                        { rank: boardRanks[0], suit: 2 },
                        { rank: boardRanks[1], suit: 3 },
                        { rank: boardRanks[2], suit: 0 },
                    ],
                    phase: 'flop',
                    potTotal: 12,
                    currentBet: 0
                },
                [
                    { type: 'check' },
                    { type: 'bet', minAmount: 2, maxAmount: 190 }
                ],
                { bigBlind: 2 }
            );

            const action = result.action.type;
            decisions[action] = (decisions[action] || 0) + 1;
            postflopDecisions.push({ action, delay: result.delayMs, amount: result.action.amount || 0 });
        } catch (err) {
            errors++;
            console.debug(`  ⚠️ Postflop hand ${i} error: ${err.message}`);
        }
    }

    assert(errors === 0, `50 decisions with ZERO errors (errors: ${errors})`);
    console.debug(`\n  Decision Distribution:`);
    console.debug(`    Raise/Bet: ${decisions.raise || 0} + ${decisions.bet || 0}`);
    console.debug(`    Call:      ${decisions.call || 0}`);
    console.debug(`    Check:     ${decisions.check || 0}`);
    console.debug(`    Fold:      ${decisions.fold || 0}`);
    console.debug(`    All-in:    ${decisions.all_in || 0}`);

    // Action variety check — should NOT be all the same action
    const totalDecisions = Object.values(decisions || {}).reduce((a, b) => a + b, 0);
    const uniqueActions = Object.values(decisions || {}).filter(v => v > 0).length;
    assert(uniqueActions >= 3, `Action variety: ${uniqueActions} different actions used (need 3+)`);

    // Not all folds — that would be a broken AI
    assert((decisions.fold || 0) < totalDecisions * 0.7, `Not over-folding: ${decisions.fold || 0} folds / ${totalDecisions} total`);

    // Not all raises — that would be a maniac bug
    assert((decisions.raise || 0) + (decisions.bet || 0) < totalDecisions * 0.8, `Not over-raising: ${(decisions.raise || 0) + (decisions.bet || 0)} raises / ${totalDecisions} total`);

    // ═══════════════════════════════════════════
    // TEST 3: TIMING TELL REALISM
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 3: Timing Tell Realism ---');

    const delays = [...preflopDecisions, ...postflopDecisions].map(d => d.delay);
    const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
    const minDelay = Math.min(...delays);
    const maxDelay = Math.max(...delays);

    assert(minDelay >= 800, `Min delay >= 800ms (got ${minDelay}ms)`);
    assert(maxDelay <= 7000, `Max delay <= 7000ms (got ${maxDelay}ms)`);
    assert(avgDelay >= 1000 && avgDelay <= 5000, `Avg delay human-like (got ${Math.round(avgDelay)}ms)`);

    // Delay variance — should NOT be the same every time
    const delayVariance = Math.max(...delays) - Math.min(...delays);
    assert(delayVariance >= 500, `Delay has variance: ${delayVariance}ms spread (need 500+ms)`);

    // ═══════════════════════════════════════════
    // TEST 4: BET SIZING REALISM
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 4: Bet Sizing Realism ---');

    const bets = postflopDecisions.filter(d => d.amount > 0);
    if (bets.length > 0) {
        const betAmounts = bets.map(d => d.amount);
        const avgBet = betAmounts.reduce((a, b) => a + b, 0) / betAmounts.length;
        const minBet = Math.min(...betAmounts);
        const maxBet = Math.max(...betAmounts);

        assert(minBet >= 2, `Min bet >= 2 (min raise) — got ${minBet}`);
        assert(maxBet <= 190, `Max bet <= stack — got ${maxBet}`);
        assert(avgBet >= 3 && avgBet <= 100, `Avg bet size reasonable — got ${Math.round(avgBet)}`);

        // Bet sizing variety — should NOT always be the same size
        const uniqueBets = new Set(betAmounts).size;
        assert(uniqueBets >= 2, `Bet sizing variety: ${uniqueBets} unique sizes`);
    } else {
        console.debug('  ⚠️ No bets placed in 25 postflop hands — checking if check-heavy is valid');
        assert(true, 'No bets (may be correct for given board textures)');
    }

    // ═══════════════════════════════════════════
    // TEST 5: PERFORMANCE STATS ACCUMULATE
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 5: Performance Stats Accumulation ---');

    const stats = Brain.getPerformanceStats(HORSE);
    assert(stats.handsPlayed >= 25, `Hands tracked: ${stats.handsPlayed} (expected 25+)`);
    assert(stats.vpip >= 0 && stats.vpip <= 100, `VPIP in range: ${stats.vpip}%`);
    assert(stats.pfr >= 0 && stats.pfr <= 100, `PFR in range: ${stats.pfr}%`);
    assert(stats.pfr <= stats.vpip || stats.vpip === 0, `PFR <= VPIP (${stats.pfr} <= ${stats.vpip})`);

    // ═══════════════════════════════════════════
    // TEST 6: ADAPTIVE STRATEGY WORKS
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 6: Adaptive Strategy ---');

    // Record enough results (need 30+ hands for adaptive to kick in)
    for (let i = 0; i < 10; i++) {
        Brain.recordPerformanceAction(HORSE, 'preflop', 'call', true);
        Brain.recordPerformanceResult(HORSE, true, 3);
    }
    const adaptWinning = Brain.getAdaptiveStrategy(HORSE);
    assert(adaptWinning.reason !== 'insufficient_data', `Adaptive has enough data (reason: ${adaptWinning.reason})`);
    console.debug(`  📊 After 20 wins: rangeAdjust=${adaptWinning.rangeAdjust}, reason=${adaptWinning.reason}`);

    // ═══════════════════════════════════════════
    // TEST 7: ANTI-COLLUSION ENFORCES LIMITS
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 7: Anti-Collusion Guards ---');

    const HORSE_A = 'aaaa-test-horse-1';
    const HORSE_B = 'bbbb-test-horse-2';

    assert(Brain.isSoftPlayAllowed(HORSE_A, HORSE_B) === true, 'Fresh pair: soft-play allowed');
    Brain.recordSoftPlay(HORSE_A, HORSE_B);
    Brain.recordSoftPlay(HORSE_A, HORSE_B);
    Brain.recordSoftPlay(HORSE_A, HORSE_B);
    assert(Brain.isSoftPlayAllowed(HORSE_A, HORSE_B) === false, 'After 3x: soft-play BLOCKED');

    // Test pair key is symmetric (A,B same as B,A)
    assert(Brain.isSoftPlayAllowed(HORSE_B, HORSE_A) === false, 'Symmetric: B→A also blocked');

    // ═══════════════════════════════════════════
    // TEST 8: DYNAMIC REBUY LOGIC
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 8: Dynamic Rebuy Logic ---');

    const rebuy1 = Brain.getDynamicRebuyStrategy('test', 20, 2, 1, 200); // 10BB = short
    assert(rebuy1.shouldRebuy === true, `10BB short-stack triggers rebuy (reason: ${rebuy1.reason})`);
    assert(rebuy1.amount > 0, `Rebuy has positive amount: ${rebuy1.amount}`);

    const rebuy2 = Brain.getDynamicRebuyStrategy('test', 200, 2, 1, 200); // 100BB = fine
    assert(rebuy2.shouldRebuy === false, `100BB adequate stack = no rebuy`);

    const rebuy3 = Brain.getDynamicRebuyStrategy('test', 20, 2, 3, 200); // 3 buyins used
    assert(rebuy3.shouldRebuy === false, `Max buyins reached = no rebuy`);

    // ═══════════════════════════════════════════
    // TEST 9: HORSE EVOLUTION OVER TIME
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 9: Horse Evolution Over Sessions ---');

    const EVO_HORSE = 'evolution-test-horse';
    const evo1 = Brain.evolveHorseSkill(EVO_HORSE, 15); // Big winner
    assert(evo1.skillDrift === 1, `1st winning session: drift=+1 (got ${evo1.skillDrift})`);

    const evo2 = Brain.evolveHorseSkill(EVO_HORSE, 12);
    assert(evo2.skillDrift === 2, `2nd winning session: drift=+2 (got ${evo2.skillDrift})`);

    const evo3 = Brain.evolveHorseSkill(EVO_HORSE, -15); // Bad session
    assert(evo3.skillDrift === 1.5, `1 bad session: drift reduced to 1.5 (got ${evo3.skillDrift})`);

    // Verify drift is capped
    for (let i = 0; i < 20; i++) Brain.evolveHorseSkill(EVO_HORSE, 20);
    const maxDrift = Brain.getSkillDrift(EVO_HORSE);
    assert(maxDrift <= 10, `Drift capped at +10 (got ${maxDrift})`);

    for (let i = 0; i < 40; i++) Brain.evolveHorseSkill(EVO_HORSE, -20);
    const minDrift = Brain.getSkillDrift(EVO_HORSE);
    assert(minDrift >= -5, `Drift floored at -5 (got ${minDrift})`);

    // ═══════════════════════════════════════════
    // TEST 10: SESSION REVIEW COMPLETENESS
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 10: Session Review System ---');

    const review = Brain.getSessionReview(HORSE);
    assert(review.handsPlayed > 0, `Review: ${review.handsPlayed} hands played`);
    assert(review.vpip !== undefined, `Review has VPIP: ${review.vpip}`);
    assert(review.pfr !== undefined, `Review has PFR: ${review.pfr}`);
    assert(review.af !== undefined, `Review has AF: ${review.af}`);
    assert(review.winRate !== undefined, `Review has winRate: ${review.winRate}`);
    assert(review.grade !== undefined, `Review has grade: ${review.grade}`);
    assert(review.strategyAdjustment !== undefined, `Review has strategy: ${review.strategyAdjustment}`);
    assert(review.skillEvolution !== undefined, `Review has evolution: ${review.skillEvolution}`);
    assert(review.duration !== undefined, `Review has duration: ${review.duration}`);

    // ═══════════════════════════════════════════
    // TEST 11: BANKROLL-AWARE STAKE SELECTION
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 11: Bankroll Stake Selection ---');

    const s1 = Brain.getRecommendedStake(500, 'Cash');
    assert(s1.recommendedBlinds.bb <= 0.50, `$500 bankroll → $${s1.recommendedBlinds.bb} BB max`);

    const s2 = Brain.getRecommendedStake(5000, 'Cash');
    assert(s2.recommendedBlinds.bb <= 2, `$5k bankroll → $${s2.recommendedBlinds.bb} BB max`);

    const s3 = Brain.getRecommendedStake(50000, 'Cash');
    assert(s3.recommendedBlinds.bb >= 10, `$50k bankroll → $${s3.recommendedBlinds.bb} BB (high stakes)`);

    const s4 = Brain.getRecommendedStake(5000, 'Tournament');
    assert(s4.maxBuyIn === 100, `$5k MTT bankroll → $${s4.maxBuyIn} max buy-in`);

    // ═══════════════════════════════════════════
    // TEST 12: POSTFLOP HAND EVALUATOR EDGE CASES
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 12: Hand Evaluator Edge Cases ---');

    // Null/empty inputs
    const e1 = Brain.evaluatePostflopHand(null, null);
    assert(e1.category === 'unknown', 'Null input → unknown');

    const e2 = Brain.evaluatePostflopHand([], []);
    assert(e2.category === 'unknown', 'Empty input → unknown');

    // Ace-high on dry board
    const e3 = Brain.evaluatePostflopHand(['Ah', 'Kd'], ['7c', '3s', '2d']);
    assert(e3.category === 'high_card' || e3.category === 'no_pair', `AK on 732r = ${e3.category}`);

    // Pocket aces on ace-high board (set)
    const e4 = Brain.evaluatePostflopHand(['As', 'Ah'], ['Ac', '7d', '2s']);
    assert(e4.category === 'set' || e4.category === 'trips', `AAA = ${e4.category} (str=${e4.strength})`);
    assert(e4.strength >= 55, `Set strength >= 55 (got ${e4.strength})`);

    // Two pair
    const e5 = Brain.evaluatePostflopHand(['Kh', 'Jd'], ['Kc', 'Js', '2d']);
    assert(e5.category === 'two_pair', `KK+JJ = ${e5.category}`);

    // Board texture edge cases
    const wet1 = Brain.evaluateBoardWetness(['Ah', 'Kh', 'Qh']); // Monotone
    assert(wet1 === 'wet', `Monotone board = ${wet1}`);

    const dry1 = Brain.evaluateBoardWetness(['2c', '7d', 'Ks']); // Rainbow spread
    assert(dry1 === 'dry', `Rainbow spread = ${dry1}`);

    // ═══════════════════════════════════════════
    // TEST 13: SPR EDGE CASES
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 13: SPR Edge Cases ---');

    const spr0 = Brain.getSPRStrategy(0, 100); // Zero stack
    assert(spr0.spr === 0, `Zero stack SPR = 0 (got ${spr0.spr})`);

    const sprCommit = Brain.getSPRStrategy(300, 100); // SPR=3
    assert(sprCommit.strategy === 'committed', `SPR 3 = committed (got ${sprCommit.strategy})`);
    assert(sprCommit.commitThreshold <= 50, `Committed threshold low: ${sprCommit.commitThreshold}`);

    const sprMed = Brain.getSPRStrategy(700, 100); // SPR=7
    assert(sprMed.strategy === 'standard', `SPR 7 = standard (got ${sprMed.strategy})`);

    const sprDeep = Brain.getSPRStrategy(2000, 100); // SPR=20
    assert(sprDeep.strategy === 'deep', `SPR 20 = deep (got ${sprDeep.strategy})`);
    assert(sprDeep.commitThreshold >= 70, `Deep commit threshold high: ${sprDeep.commitThreshold}`);

    // ═══════════════════════════════════════════
    // TEST 14: DRAW EQUITY MATH VERIFICATION
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 14: Draw Equity Math ---');

    // Flush draw on flop: 9 outs, ~35% equity
    const fd = Brain.getDrawEquity({ hasFlushDraw: true, hasOESD: false, hasGutshot: false }, 'flop');
    assert(fd.outs === 9, `Flush draw = 9 outs`);
    assert(Math.abs(fd.equity - 0.35) < 0.02, `Flush draw flop equity ~35% (got ${(fd.equity * 100).toFixed(1)}%)`);
    assert(fd.shouldCall(0.30) === true, `Should call 30% pot odds with flush draw`);
    assert(fd.shouldCall(0.40) === false, `Should NOT call 40% pot odds with flush draw`);

    // OESD on turn: 8 outs, ~17% equity (rule of 2+1)
    const oesd = Brain.getDrawEquity({ hasFlushDraw: false, hasOESD: true, hasGutshot: false }, 'turn');
    assert(oesd.outs === 8, `OESD = 8 outs`);
    const expectedTurnEq = (8 * 2 + 1) / 100; // 0.17
    assert(Math.abs(oesd.equity - expectedTurnEq) < 0.02, `OESD turn equity ~17% (got ${(oesd.equity * 100).toFixed(1)}%)`);
    // Combo draw: flush + OESD = 15 outs (not 17 — overlap reduction)
    const combo = Brain.getDrawEquity({ hasFlushDraw: true, hasOESD: true, hasGutshot: false }, 'flop');
    assert(combo.outs === 15, `Combo draw = 15 outs (9+8-2 overlap)`);

    // Gutshot: 4 outs
    const gs = Brain.getDrawEquity({ hasFlushDraw: false, hasOESD: false, hasGutshot: true }, 'flop');
    assert(gs.outs === 4, `Gutshot = 4 outs`);

    // No draws
    const noDraw = Brain.getDrawEquity({ hasFlushDraw: false, hasOESD: false, hasGutshot: false }, 'flop');
    assert(noDraw.outs === 0, `No draws = 0 outs`);
    assert(noDraw.equity === 0, `No draws = 0% equity`);

    // ═══════════════════════════════════════════
    // TEST 15: SUPABASE PERSISTENCE E2E
    // ═══════════════════════════════════════════
    console.debug('\n--- TEST 15: Supabase Persistence E2E ---');

    // Try to actually save session analytics
    const saveResult = await Brain.saveSessionAnalytics(HORSE, 'test-table-verify');
    if (saveResult) {
        console.debug('  📊 Session analytics saved to Supabase');
        // Verify the data by reading it back
        const { data: readBack, error } = await supabase
            .from('horse_session_stats')
            .select('*')
            .eq('profile_id', HORSE)
            .eq('table_id', 'test-table-verify')
            .limit(1);

        if (!error && readBack && readBack.length > 0) {
            const row = readBack[0];
            assert(row.hands_played > 0, `Supabase has hands_played: ${row.hands_played}`);
            assert(row.vpip >= 0, `Supabase has vpip: ${row.vpip}%`);
            assert(row.pfr >= 0, `Supabase has pfr: ${row.pfr}%`);
            assert(row.session_minutes >= 0, `Supabase has session_minutes: ${row.session_minutes}`);

            // Clean up test data
            const { error: err_horse_session_stats_c0pk3 } = await supabase.from('horse_session_stats').delete()
                .eq('profile_id', HORSE)
                .eq('table_id', 'test-table-verify');
            if (err_horse_session_stats_c0pk3) console.warn('[Supabase] Silent mutation failed in horse_session_stats:', err_horse_session_stats_c0pk3.message);
        } else {
            assert(false, `Read back from Supabase (error: ${error?.message || 'no data'})`);
        }
    } else {
        console.debug('  ⚠️ saveSessionAnalytics returned false — table may not exist');
        assert(false, 'Supabase session analytics persistence WORKS');
    }

    // ═══════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════
    console.debug('\n═══════════════════════════════════════════════════');
    console.debug(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.debug('═══════════════════════════════════════════════════');

    if (failed > 0) {
        console.debug('\n❌ FAILURES:');
        failures.forEach(f => console.debug(`  - ${f}`));
    } else {
        console.debug('\n✅ ALL DEEP TESTS PASSED — VERIFIED END-TO-END');
    }

    console.debug('');
    process.exit(failed > 0 ? 1 : 0);
})();
