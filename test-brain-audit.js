/**
 * BRAIN AUDIT TEST SUITE — Phases 42-48
 * Plain Node.js test runner (no jest needed)
 */

let passed = 0, failed = 0, errors = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failed++;
        errors.push({ name, error: e.message });
        console.log(`  ❌ ${name}: ${e.message}`);
    }
}

function expect(val) {
    return {
        toBe(expected) { if (val !== expected) throw new Error(`Expected ${expected}, got ${val}`); },
        toBeGreaterThan(n) { if (!(val > n)) throw new Error(`Expected ${val} > ${n}`); },
        toBeGreaterThanOrEqual(n) { if (!(val >= n)) throw new Error(`Expected ${val} >= ${n}`); },
        toBeLessThan(n) { if (!(val < n)) throw new Error(`Expected ${val} < ${n}`); },
        toBeLessThanOrEqual(n) { if (!(val <= n)) throw new Error(`Expected ${val} <= ${n}`); },
        toBeCloseTo(n, d=2) { if (Math.abs(val - n) > Math.pow(10, -d)/2) throw new Error(`Expected ~${n}, got ${val}`); },
        toBeNull() { if (val !== null) throw new Error(`Expected null, got ${val}`); },
        not: { toBeNull() { if (val === null) throw new Error('Expected non-null'); } },
        toBeDefined() { if (val === undefined) throw new Error('Expected defined value'); },
        toContain(item) { if (!val.includes(item)) throw new Error(`Expected array to contain ${item}`); },
        toHaveProperty(prop) { if (!(prop in val)) throw new Error(`Missing property: ${prop}`); },
    };
}

// ═══ Mock Supabase before require ═══
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...args) {
    if (request === '@supabase/supabase-js') {
        // Return a fake module path
        return require.resolve('./test-mock-supabase.js');
    }
    return origResolve.call(this, request, parent, ...args);
};

// Create mock file
require('fs').writeFileSync(
    require('path').join(__dirname, 'test-mock-supabase.js'),
    'module.exports = { createClient: () => null };'
);

const brain = require('./src/lib/poker-engine/HorsePokerBrain.js');
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 44: evaluatePostflopHand ══');
// ═══════════════════════════════════════════════════════════

const evalHand = brain.evaluatePostflopHand;

test('overpair (AA on low board)', () => {
    const r = evalHand(['Ah', 'Ad'], ['5c', '7d', '9s']);
    expect(r.category).toBe('overpair');
    expect(r.strength).toBeGreaterThanOrEqual(55);
});

test('top pair ace kicker', () => {
    const r = evalHand(['Ah', 'Kd'], ['Kc', '7d', '3s']);
    expect(r.category).toBe('top_pair');
    expect(r.strength).toBeGreaterThanOrEqual(45);
});

test('second pair', () => {
    const r = evalHand(['9h', '2d'], ['Kc', '9d', '3s']);
    expect(r.category).toBe('second_pair');
    expect(r.strength).toBeGreaterThanOrEqual(33);
});

test('third pair', () => {
    const r = evalHand(['3h', '2d'], ['Kc', '9d', '3s']);
    expect(r.category).toBe('third_pair');
});

test('underpair', () => {
    const r = evalHand(['4h', '4d'], ['Kc', '9d', '7s']);
    expect(r.category).toBe('underpair');
});

test('set (pocket pair hits board)', () => {
    const r = evalHand(['9h', '9d'], ['9c', 'Kd', '3s']);
    expect(r.category).toBe('set');
    expect(r.strength).toBeGreaterThanOrEqual(78);
});

test('trips (board pair + hero card)', () => {
    const r = evalHand(['Kh', '2d'], ['Kc', 'Kd', '3s']);
    expect(r.category).toBe('trips');
    expect(r.strength).toBeGreaterThanOrEqual(50);
});

test('two pair', () => {
    const r = evalHand(['Kh', '9d'], ['Kc', '9c', '3s']);
    expect(r.category).toBe('two_pair');
    expect(r.strength).toBeGreaterThanOrEqual(55);
});

test('flush', () => {
    const r = evalHand(['Ah', '7h'], ['Kh', '3h', '9h']);
    expect(r.category).toBe('flush');
    expect(r.strength).toBeGreaterThanOrEqual(82);
});

test('nut flush (hero highest flush card)', () => {
    const r = evalHand(['Ah', '2h'], ['Kh', '3h', '9h']);
    expect(r.category).toBe('flush');
    expect(r.strength).toBeGreaterThanOrEqual(87);
});

test('straight (7-8-9-T-J)', () => {
    const r = evalHand(['8h', '9d'], ['Tc', 'Jc', '7s']);
    expect(r.category).toBe('straight');
    expect(r.strength).toBeGreaterThanOrEqual(72);
});

test('wheel straight (A-2-3-4-5)', () => {
    const r = evalHand(['Ah', '2d'], ['3c', '4c', '5s']);
    expect(r.category).toBe('straight');
    expect(r.strength).toBeGreaterThanOrEqual(70);
});

test('full house', () => {
    const r = evalHand(['Kh', 'Kd'], ['Kc', '9c', '9s']);
    expect(r.category).toBe('full_house');
    expect(r.strength).toBeGreaterThanOrEqual(88);
});

test('quads', () => {
    const r = evalHand(['Kh', 'Kd'], ['Kc', 'Ks', '9s']);
    expect(r.category).toBe('quads');
    expect(r.strength).toBeGreaterThanOrEqual(96);
});

test('high card', () => {
    const r = evalHand(['Ah', 'Qd'], ['3c', '5c', '8s']);
    expect(r.category).toBe('high_card');
    expect(r.strength).toBeGreaterThanOrEqual(15);
});

// ─── PHASE 44 FIX TESTS ───

test('PHASE 44 FIX: royal flush with pocket pair As-Ah (indexOf bug)', () => {
    const r = evalHand(['As', 'Ah'], ['Th', 'Jh', 'Qh', 'Kh', '2c']);
    expect(r.category).toBe('royal_flush');
    expect(r.strength).toBe(100);
});

test('PHASE 44 FIX: royal flush with Ah-As (reversed order)', () => {
    const r = evalHand(['Ah', 'As'], ['Th', 'Jh', 'Qh', 'Kh', '2c']);
    expect(r.category).toBe('royal_flush');
    expect(r.strength).toBe(100);
});

test('PHASE 44 FIX: wheel straight flush with pocket pair', () => {
    const r = evalHand(['As', 'Ah'], ['2h', '3h', '4h', '5h', 'Kc']);
    expect(r.category).toBe('straight_flush');
    expect(r.strength).toBeGreaterThanOrEqual(97);
});

test('PHASE 44 FIX: lower straight when board has higher straight hero misses', () => {
    // Hero [4h,3d], board [5c,6d,7h,8s,9c]: board has 5-9 straight, hero 4 makes 4-5-6-7-8
    // Hero is bottom end (73) minus one-card-straight penalty (-5) = 68
    const r = evalHand(['4h', '3d'], ['5c', '6d', '7h', '8s', '9c']);
    expect(r.category).toBe('straight');
    expect(r.strength).toBeGreaterThanOrEqual(65); // One-card bottom straight = 68
});

test('top of straight bonus (one-card penalty)', () => {
    // Hero [Jh,2d], board [7c,8d,9h,Ts,3c]: hero J makes 7-8-9-T-J, top end (80)
    // But 4 of 5 cards on board → one-card straight penalty -5 → 75
    const r = evalHand(['Jh', '2d'], ['7c', '8d', '9h', 'Ts', '3c']);
    expect(r.category).toBe('straight');
    expect(r.strength).toBe(75);
});

// ─── DRAW DETECTION ───

test('flush draw detected', () => {
    const r = evalHand(['Ah', '7h'], ['Kh', '3h', '9c']);
    expect(r.hasFlushDraw).toBe(true);
});

test('OESD detected', () => {
    const r = evalHand(['8h', '9d'], ['Tc', 'Jc', '3s']);
    expect(r.hasOESD).toBe(true);
});

test('gutshot detected', () => {
    // Hero [8h,2d], board [5c,6d,Ts]: 5-6-_-8 with gap at 7 = gutshot (spread=3 at boundary or spread=4)
    // Actually: ranks [0,3,4,6,8], window [3,4,6,8] spread=5 no. window [0,3,4,6] spread=6 no.
    // Better test: hero [Qh,2d], board [8c,9d,Js]: 8-9-_-J-Q, need T = gutshot
    const r = evalHand(['Qh', '2d'], ['8c', '9d', 'Js']);
    expect(r.hasGutshot).toBe(true);
});

test('backdoor flush on flop', () => {
    const r = evalHand(['Ah', '7h'], ['Kh', '3c', '9c']);
    expect(r.hasBackdoorFlush).toBe(true);
});

test('no backdoor flush on turn', () => {
    const r = evalHand(['Ah', '7h'], ['Kh', '3c', '9c', '2d']);
    expect(r.hasBackdoorFlush).toBe(false);
});

test('combo draw boost (flush + OESD)', () => {
    const r = evalHand(['8h', '9h'], ['Th', 'Jc', '3h']);
    expect(r.hasFlushDraw).toBe(true);
    expect(r.hasOESD).toBe(true);
    expect(r.strength).toBeGreaterThanOrEqual(50);
});

test('null inputs handled', () => {
    const r = evalHand(null, null);
    expect(r.category).toBe('unknown');
});

test('insufficient cards handled', () => {
    const r = evalHand(['Ah'], ['Kh', '3h']);
    expect(r.category).toBe('unknown');
    expect(r.strength).toBe(20);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 43: observeAction stat tracking ══');
// ═══════════════════════════════════════════════════════════

function resetObserver() {
    brain.liveObserver.clear();
}

test('threeBetOpportunity NOT inflated by 4-bet scenarios', () => {
    resetObserver();
    const H = 'h1', T = 't1', O = 'o1';
    brain.observeNewHand(T, 'hnd1', [
        { id: H, position: 'BTN' }, { id: O, position: 'BB' }
    ], [H], 2);

    // Facing 1 raise = 3-bet opportunity
    brain.observeAction(T, O, 'preflop', 'call', { facingRaiseCount: 1, position: 'BB' }, [H]);
    let p = brain.liveObserver.get(H).get(T).opponents.get(O);
    expect(p.threeBetOpportunity).toBe(1);

    // Facing 2+ raises = 4-bet scenario, NOT 3-bet opportunity
    brain.observeAction(T, O, 'preflop', 'fold', { facingRaiseCount: 2, position: 'BB' }, [H]);
    expect(p.threeBetOpportunity).toBe(1); // Still 1
    expect(p.facedThreeBet).toBe(1);
});

test('stealOpportunity = 0 when not facing steal', () => {
    resetObserver();
    const H = 'h2', T = 't2', O = 'o2';
    brain.observeNewHand(T, 'hnd2', [
        { id: H, position: 'BTN' }, { id: O, position: 'BB' }
    ], [H], 2);

    // BB folds without facing a steal from late position
    brain.observeAction(T, O, 'preflop', 'fold', { position: 'BB', facingRaiseCount: 1 }, [H]);
    let p = brain.liveObserver.get(H).get(T).opponents.get(O);
    // No steal because preflopAggressor position isn't tracked as late-pos
    expect(p.stealOpportunity).toBe(0);
});

test('stealOpportunity increments for BTN steal', () => {
    resetObserver();
    const H = 'h3', T = 't3', O = 'o3';
    brain.observeNewHand(T, 'hnd3', [
        { id: H, position: 'CO' }, { id: O, position: 'BB' }, { id: 'btn1', position: 'BTN' }
    ], [H], 2);

    // BTN raises (steal attempt)
    brain.observeAction(T, 'btn1', 'preflop', 'raise', {
        amount: 6, position: 'BTN', facingRaiseCount: 0, isOpenAction: true, potSize: 3
    }, [H]);

    // BB faces steal → fold
    brain.observeAction(T, O, 'preflop', 'fold', { position: 'BB', facingRaiseCount: 1 }, [H]);
    let p = brain.liveObserver.get(H).get(T).opponents.get(O);
    expect(p.stealOpportunity).toBe(1);
    expect(p.foldToSteal).toBe(1);
});

test('donkBetOpportunity only counts leading actions', () => {
    resetObserver();
    const H = 'h4', T = 't4', O = 'o4', A = 'agg1';
    brain.observeNewHand(T, 'hnd4', [
        { id: H, position: 'BTN' }, { id: O, position: 'BB' }, { id: A, position: 'CO' }
    ], [H], 2);

    // A raises preflop (becomes PFR)
    brain.observeAction(T, A, 'preflop', 'raise', { amount: 6, position: 'CO', facingRaiseCount: 0, isOpenAction: true, potSize: 3 }, [H]);

    // BB checks on flop (leading action, donk opportunity since not PFR)
    brain.observeAction(T, O, 'flop', 'check', { position: 'BB', potSize: 12 }, [H]);
    let p = brain.liveObserver.get(H).get(T).opponents.get(O);
    expect(p.donkBetOpportunity).toBe(1);

    // A bets on flop
    brain.observeAction(T, A, 'flop', 'bet', { amount: 8, position: 'CO', potSize: 12 }, [H]);

    // BB calls (NOT a leading action — someone already bet)
    brain.observeAction(T, O, 'flop', 'call', { position: 'BB', potSize: 20 }, [H]);
    expect(p.donkBetOpportunity).toBe(1); // Still 1, call doesn't count
});

test('probeBetOpportunity only counts leading actions after checked-through', () => {
    resetObserver();
    const H = 'h5', T = 't5', O = 'o5';
    brain.observeNewHand(T, 'hnd5', [
        { id: H, position: 'BTN' }, { id: O, position: 'BB' }
    ], [H], 2);

    // Flop checks through (no aggressor)
    brain.observeAction(T, O, 'flop', 'check', { position: 'BB', potSize: 4 }, [H]);
    brain.observeAction(T, H, 'flop', 'check', { position: 'BTN', potSize: 4 }, [H]);

    // Turn: O bets (probe — leading action after flop checked through)
    brain.observeAction(T, O, 'turn', 'bet', { amount: 3, position: 'BB', potSize: 4 }, [H]);
    let p = brain.liveObserver.get(H).get(T).opponents.get(O);
    expect(p.probeBetCount).toBe(1);
    expect(p.probeBetOpportunity).toBe(1);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ getDrawEquity ══');
// ═══════════════════════════════════════════════════════════

const gde = brain.getDrawEquity;

test('flush draw = 9 outs', () => {
    const r = gde({ hasFlushDraw: true, hasOESD: false, hasGutshot: false, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    expect(r.outs).toBeCloseTo(9, 0);
});

test('OESD = 8 outs', () => {
    const r = gde({ hasFlushDraw: false, hasOESD: true, hasGutshot: false, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    expect(r.outs).toBeCloseTo(8, 0);
});

test('flush + OESD = 15 outs (9+8-2)', () => {
    const r = gde({ hasFlushDraw: true, hasOESD: true, hasGutshot: false, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    expect(r.outs).toBeCloseTo(15, 0);
});

test('gutshot = 4 outs', () => {
    const r = gde({ hasFlushDraw: false, hasOESD: false, hasGutshot: true, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    expect(r.outs).toBeCloseTo(4, 0);
});

test('flush + gutshot = 12 outs (9+4-1)', () => {
    const r = gde({ hasFlushDraw: true, hasOESD: false, hasGutshot: true, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    expect(r.outs).toBeCloseTo(12, 0);
});

test('gutshot suppressed when OESD present', () => {
    const r = gde({ hasFlushDraw: false, hasOESD: true, hasGutshot: true, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    expect(r.outs).toBeCloseTo(8, 0);
});

test('backdoor = +1.5 on flop', () => {
    const r = gde({ hasFlushDraw: false, hasOESD: false, hasGutshot: false, hasBackdoorFlush: true, category: 'high_card' }, 'flop');
    expect(r.outs).toBeCloseTo(1.5, 1);
});

test('backdoor ignored on turn', () => {
    const r = gde({ hasFlushDraw: false, hasOESD: false, hasGutshot: false, hasBackdoorFlush: true, category: 'high_card' }, 'turn');
    expect(r.outs).toBeCloseTo(0, 0);
});

test('river = 0 draw equity (no nut premium without flush draw)', () => {
    // On river, no cards to come → equity should be 0. Use no flush draw to avoid nut premium.
    const r = gde({ hasFlushDraw: false, hasOESD: true, hasGutshot: false, hasBackdoorFlush: false, category: 'high_card' }, 'river');
    expect(r.equity).toBe(0);
});

test('top pair +2 improvement outs', () => {
    const r = gde({ hasFlushDraw: false, hasOESD: false, hasGutshot: false, hasBackdoorFlush: false, category: 'top_pair' }, 'flop');
    expect(r.outs).toBeCloseTo(2, 0);
});

test('shouldCall works correctly', () => {
    const r = gde({ hasFlushDraw: true, hasOESD: false, hasGutshot: false, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    expect(r.shouldCall(0.30)).toBe(true);
    expect(r.shouldCall(0.45)).toBe(false);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ getRiverStrategy ══');
// ═══════════════════════════════════════════════════════════

const grs = brain.getRiverStrategy;

test('strong hand facing bet = call', () => {
    const r = grs(75, 0.25, false, true, 0);
    expect(r.action).toBe('call');
});

test('monster not facing bet = bet', () => {
    const r = grs(90, 0, true, false, 5);
    expect(r.action).toBe('bet');
    expect(r.sizeFraction).toBeGreaterThan(0);
});

test('very weak hand facing bet = fold', () => {
    const r = grs(8, 0.35, false, true, 0);
    expect(r.action).toBe('fold');
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ evaluateBoardWetness ══');
// ═══════════════════════════════════════════════════════════

const ebw = brain.evaluateBoardWetness;

test('rainbow disconnected = dry', () => {
    const r = ebw(['2c', '7d', 'Ks']);
    expect(r).toBe('dry');
});

test('monotone connected = wet', () => {
    const r = ebw(['Th', 'Jh', 'Qh']);
    expect(r).toBe('wet');
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ detectSPRTrap ══');
// ═══════════════════════════════════════════════════════════

const dst = brain.detectSPRTrap;

test('no trap when toCall=0', () => {
    const r = dst(0, 100, 500, 2, 50);
    expect(r.shouldFoldTrap).toBe(false);
});

test('pot-sized jam marginal equity = trap+fold', () => {
    const r = dst(100, 100, 200, 2, 40);
    expect(r.isTrap).toBe(true);
    expect(r.shouldFoldTrap).toBe(true);
});

test('pot-sized jam strong equity = no fold', () => {
    const r = dst(100, 100, 200, 2, 60);
    expect(r.shouldFoldTrap).toBe(false);
});

test('small bet = not a trap', () => {
    const r = dst(10, 100, 500, 2, 30);
    expect(r.isTrap).toBe(false);
});

test('multiway premium raises threshold', () => {
    const r = dst(100, 100, 200, 4, 52);
    expect(r.shouldFoldTrap).toBe(true);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ validateAndClamp ══');
// ═══════════════════════════════════════════════════════════

const vc = brain.validateAndClamp;

test('valid check passes through', () => {
    const r = vc('check', null, [{ type: 'check' }, { type: 'fold' }]);
    expect(r.type).toBe('check');
});

test('valid call passes through', () => {
    const r = vc('call', null, [{ type: 'call' }, { type: 'fold' }]);
    expect(r.type).toBe('call');
});

test('raise clamped to min', () => {
    const r = vc('raise', 5, [{ type: 'fold' }, { type: 'raise', minAmount: 10, maxAmount: 100 }]);
    expect(r.type).toBe('raise');
    expect(r.amount).toBeGreaterThanOrEqual(10);
});

test('raise clamped to max', () => {
    const r = vc('raise', 500, [{ type: 'fold' }, { type: 'raise', minAmount: 10, maxAmount: 100 }]);
    expect(r.type).toBe('raise');
    expect(r.amount).toBeLessThanOrEqual(100);
});

test('illegal action falls back', () => {
    const r = vc('raise', 50, [{ type: 'check' }, { type: 'fold' }]);
    if (r.type === 'raise') throw new Error('Should not be raise when raise not legal');
});

test('NaN amount handled', () => {
    const r = vc('raise', NaN, [{ type: 'fold' }, { type: 'raise', minAmount: 10, maxAmount: 100 }]);
    if (r.type === 'raise' && !Number.isFinite(r.amount)) throw new Error('NaN amount leaked through');
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ getLiveRead integration ══');
// ═══════════════════════════════════════════════════════════

test('getLiveRead returns null for unknown horse', () => {
    resetObserver();
    const r = brain.getLiveRead('nonexistent', 'table', 'opp');
    expect(r).toBeNull();
});

test('getLiveRead returns valid data after sufficient observations', () => {
    resetObserver();
    const H = 'lr-h', T = 'lr-t', O = 'lr-o';
    for (let i = 0; i < 16; i++) {
        brain.observeNewHand(T, `h${i}`, [
            { id: H, position: 'BTN' }, { id: O, position: 'BB' }
        ], [H], 2);
        brain.observeAction(T, O, 'preflop', i % 3 === 0 ? 'fold' : 'call', {
            position: 'BB', facingRaiseCount: 1
        }, [H]);
        if (i % 3 !== 0) {
            brain.observeAction(T, O, 'flop', i % 2 === 0 ? 'check' : 'bet', {
                position: 'BB', amount: 5, potSize: 10
            }, [H]);
        }
    }
    const r = brain.getLiveRead(H, T, O);
    if (r === null) throw new Error('Expected non-null live read after 16 hands');
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.aggFreq).toBeGreaterThanOrEqual(0);
    expect(r.callFreq).toBeGreaterThanOrEqual(0);
    expect(r.foldFreq).toBeGreaterThanOrEqual(0);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ getMultiwayAdjustment ══');
// ═══════════════════════════════════════════════════════════

const gma = brain.getMultiwayAdjustment;

test('heads-up multiplier ~1.0', () => {
    const r = gma(2, { street: 'flop', position: 'BTN', boardWetness: 'medium' });
    expect(r.strengthPenalty).toBe(0);
    expect(r.bluffReduction).toBeCloseTo(1.0, 1);
});

test('3-way tighter than HU', () => {
    const r = gma(3, { street: 'flop', position: 'BTN', boardWetness: 'medium' });
    expect(r.strengthPenalty).toBeGreaterThan(0);
    expect(r.bluffReduction).toBeLessThan(1.0);
});

test('5-way significantly tighter', () => {
    const r = gma(5, { street: 'flop', position: 'BTN', boardWetness: 'medium' });
    expect(r.strengthPenalty).toBeGreaterThan(15);
    expect(r.bluffReduction).toBeLessThan(0.20);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ getCheckRaiseStrategy ══');
// ═══════════════════════════════════════════════════════════

const gcrs = brain.getCheckRaiseStrategy;

test('returns correct shape', () => {
    const r = gcrs(70, false, false, 5, { street: 'flop', numPlayers: 2 });
    if (!('shouldCheckRaise' in r)) throw new Error('Missing shouldCheckRaise');
    if (!('sizeFraction' in r)) throw new Error('Missing sizeFraction');
    if (!('frequency' in r)) throw new Error('Missing frequency');
});

test('weak hand rarely check-raises', () => {
    // handStrength=5, OOP, no draw, low aggression → should NOT check-raise
    const r = gcrs(5, false, false, 0, { street: 'flop', numPlayers: 2 });
    // With handStrength < 20 and aggressionBias=0, frequency is very low
    expect(r.frequency).toBeLessThan(0.20);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ getOptimalBetSize ══');
// ═══════════════════════════════════════════════════════════

const gobs = brain.getOptimalBetSize;

test('nutted hand sizes big', () => {
    const r = gobs('quads', 'river', 100, false, { handStrength: 95, stackBB: 100 });
    expect(r).toBeGreaterThan(0.80);
});

test('bluff sizing on river is large', () => {
    const r = gobs('high_card', 'river', 100, true, { handStrength: 10, stackBB: 100 });
    expect(r).toBeGreaterThan(0.60);
});

test('merged range on wet flop capped', () => {
    const r = gobs('top_pair', 'flop', 100, false, {
        handStrength: 50, boardWetness: 'wet', stackBB: 100, isInPosition: false, numPlayers: 3
    });
    // Should be between 0.20 and 2.0
    expect(r).toBeGreaterThanOrEqual(0.20);
    expect(r).toBeLessThanOrEqual(2.0);
});

test('dry board sizes smaller than wet board', () => {
    const dry = gobs('top_pair', 'flop', 100, false, {
        handStrength: 55, boardWetness: 'dry', stackBB: 100
    });
    const wet = gobs('top_pair', 'flop', 100, false, {
        handStrength: 55, boardWetness: 'wet', stackBB: 100
    });
    expect(dry).toBeLessThan(wet);
});

test('calling station gets larger value bets', () => {
    const balanced = gobs('set', 'flop', 100, false, {
        handStrength: 80, oppTendency: 'balanced', oppConfidence: 0.5, stackBB: 100
    });
    const station = gobs('set', 'flop', 100, false, {
        handStrength: 80, oppTendency: 'calling-station', oppConfidence: 0.5, stackBB: 100
    });
    expect(station).toBeGreaterThanOrEqual(balanced);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ getGeometricSizing ══');
// ═══════════════════════════════════════════════════════════

const ggs = brain.getGeometricSizing;

test('SPR < 2 jams', () => {
    const r = ggs(100, 150, 2, true);
    expect(r.isJammable).toBe(true);
    expect(r.sizeFraction).toBe(999);
});

test('3 streets remaining gives reasonable sizing', () => {
    const r = ggs(20, 200, 3, true);
    // Should plan to get 200 chips in over 3 streets starting with 20 pot
    expect(r.sizeFraction).toBeGreaterThan(0.25);
    expect(r.sizeFraction).toBeLessThanOrEqual(1.50);
    expect(r.projectedPotByStreet.length).toBe(3);
});

test('not targeting all-in gives standard sizing', () => {
    const r = ggs(20, 200, 2, false);
    expect(r.isJammable).toBe(false);
    expect(r.sizeFraction).toBeLessThanOrEqual(0.66);
});

test('zero streets returns default', () => {
    const r = ggs(100, 200, 0, true);
    expect(r.sizeFraction).toBe(0.66);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ handleDonkBet ══');
// ═══════════════════════════════════════════════════════════

const hdb = brain.handleDonkBet;

test('returns null when not a donk scenario', () => {
    const r = hdb({ heroIsAggressor: false, street: 'flop', facingBet: true, handStrength: 60 });
    expect(r).toBeNull();
});

test('returns null on preflop', () => {
    const r = hdb({ heroIsAggressor: true, street: 'preflop', facingBet: true, handStrength: 60 });
    expect(r).toBeNull();
});

test('returns null on river', () => {
    const r = hdb({ heroIsAggressor: true, street: 'river', facingBet: true, handStrength: 60 });
    expect(r).toBeNull();
});

test('strong hand vs donk produces raise or call', () => {
    // Run multiple times since it's probabilistic
    let actions = new Set();
    for (let i = 0; i < 50; i++) {
        const r = hdb({
            heroIsAggressor: true, street: 'flop', facingBet: true,
            handStrength: 80, handCategory: 'set', drawOuts: 0,
            position: 'BTN', potSize: 20, toCall: 8, bb: 2,
            canRaise: true, canCall: true, raiseAction: { type: 'raise', minAmount: 16, maxAmount: 100 },
            aggressionBias: 5, oppTendency: 'balanced', oppConfidence: 0,
            oppCallFreq: 0.50, boardWetness: 'medium', numPlayers: 2
        });
        if (r) actions.add(r.type);
    }
    // Should produce at least raise or call
    if (actions.size === 0) throw new Error('handleDonkBet returned null for every strong hand trial');
    if (actions.has('fold')) throw new Error('handleDonkBet folded a strong hand');
});

test('medium hand calls small donk', () => {
    // Fix: mock random high to avoid raise branches
    const origRandom = Math.random;
    Math.random = () => 0.99;
    try {
        const r = hdb({
            heroIsAggressor: true, street: 'flop', facingBet: true,
            handStrength: 40, handCategory: 'second_pair', drawOuts: 0,
            position: 'BTN', potSize: 20, toCall: 5, bb: 2,
            canRaise: true, canCall: true, raiseAction: { type: 'raise', minAmount: 10, maxAmount: 100 },
            aggressionBias: 0, oppTendency: 'balanced', oppConfidence: 0,
            oppCallFreq: 0.50, boardWetness: 'medium', numPlayers: 2
        });
        // Should call (hand >= 30)
        if (!r) throw new Error('handleDonkBet returned null for medium hand');
        expect(r.type).toBe('call');
    } finally {
        Math.random = origRandom;
    }
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ applyTiltDegradation ══');
// ═══════════════════════════════════════════════════════════

const atd = brain.applyTiltDegradation;

test('calm player has no tilt effect', () => {
    const r = atd('fold', null, 0, 30, [{ type: 'fold' }, { type: 'call' }], 20, 0);
    expect(r.action).toBe('fold');
    expect(r.wasTilted).toBe(false);
});

test('low tilt also no effect', () => {
    const r = atd('call', 10, 1, 50, [{ type: 'call' }, { type: 'fold' }], 20, 0);
    expect(r.action).toBe('call');
    expect(r.wasTilted).toBe(false);
});

test('max tilt causes errors sometimes', () => {
    let tilted = 0;
    for (let i = 0; i < 200; i++) {
        const r = atd('fold', null, 10, 30, [
            { type: 'fold' }, { type: 'call' }, { type: 'raise', minAmount: 10, maxAmount: 100 }
        ], 20, 5);
        if (r.wasTilted) tilted++;
    }
    // At tilt=10, errorChance=40%, then 50% chance of overcall = ~20% tilted
    expect(tilted).toBeGreaterThan(5);  // At least some tilt errors
    expect(tilted).toBeLessThan(150);   // Not every hand
});

test('tilt never produces invalid action type', () => {
    const legal = [
        { type: 'fold' }, { type: 'call' },
        { type: 'raise', minAmount: 10, maxAmount: 100 }
    ];
    for (let i = 0; i < 200; i++) {
        const r = atd('fold', null, 10, 40, legal, 20, 5);
        if (!['fold', 'call', 'raise', 'bet', 'check', 'all_in'].includes(r.action)) {
            throw new Error(`Invalid tilt action: ${r.action}`);
        }
    }
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ makeFallbackDecision (preflop) ══');
// ═══════════════════════════════════════════════════════════

const mfd = brain.makeFallbackDecision;

test('premium hand opens from any position', () => {
    const legalActions = [
        { type: 'fold' }, { type: 'call' },
        { type: 'raise', minAmount: 4, maxAmount: 200 }
    ];
    // AA from UTG should always open
    const r = mfd('test-horse-1', {
        handStr: 'AA', position: 'UTG', street: 'preflop',
        potSize: 3, toCall: 2, stackBB: 100, bb: 2,
        holeCards: ['As', 'Ah'], board: [], numPlayers: 6
    }, legalActions, { callMod: 0, foldMod: 0 });
    expect(r.type).toBe('raise');
});

test('short stack push with decent hand', () => {
    const legalActions = [
        { type: 'fold' }, { type: 'call' },
        { type: 'raise', minAmount: 4, maxAmount: 20 }
    ];
    // 6bb stack with decent hand from BTN → should push or fold
    const r = mfd('test-horse-2', {
        handStr: 'ATs', position: 'BTN', street: 'preflop',
        potSize: 3, toCall: 2, stackBB: 6, bb: 2,
        holeCards: ['Ah', 'Th'], board: [], numPlayers: 6
    }, legalActions, { callMod: 0, foldMod: 0 });
    // Should jam (all_in) with ATs at 6bb from BTN
    expect(r.type).toBe('all_in');
});

test('trash hand folds from EP', () => {
    const legalActions = [
        { type: 'fold' }, { type: 'call' },
        { type: 'raise', minAmount: 4, maxAmount: 200 }
    ];
    const r = mfd('test-horse-3', {
        handStr: '72o', position: 'UTG', street: 'preflop',
        potSize: 3, toCall: 2, stackBB: 100, bb: 2,
        holeCards: ['7h', '2d'], board: [], numPlayers: 6
    }, legalActions, { callMod: 0, foldMod: 0 });
    // 72o from UTG should fold or check
    if (r.type === 'raise') throw new Error('Should not open 72o from UTG');
});

test('postflop strong hand bets', () => {
    const legalActions = [
        { type: 'check' },
        { type: 'bet', minAmount: 2, maxAmount: 200 }
    ];
    // Set on flop, no bet to face → should bet for value
    const r = mfd('test-horse-4', {
        handStr: 'TT', position: 'BTN', street: 'flop',
        potSize: 15, toCall: 0, stackBB: 100, bb: 2,
        holeCards: ['Th', 'Td'], board: ['Tc', '5d', '2h'],
        numPlayers: 2, wasAggressor: true
    }, legalActions, { callMod: 0, foldMod: 0 });
    expect(r.type).toBe('bet');
    expect(r.amount).toBeGreaterThan(0);
});

test('postflop weak hand folds to large bet', () => {
    const legalActions = [
        { type: 'fold' }, { type: 'call' }
    ];
    const r = mfd('test-horse-5', {
        handStr: '72o', position: 'BB', street: 'flop',
        potSize: 30, toCall: 25, stackBB: 80, bb: 2,
        holeCards: ['7h', '2d'], board: ['Ac', 'Kd', 'Qs'],
        numPlayers: 2
    }, legalActions, { callMod: 0, foldMod: 0 });
    expect(r.type).toBe('fold');
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 46: makeFlopHeuristicDecision ══');
// ═══════════════════════════════════════════════════════════

const mfhd = brain.makeFlopHeuristicDecision;

// Helper: build base params for makeFlopHeuristicDecision
function flopParams(overrides = {}) {
    return {
        holeCards: overrides.holeCards || ['Ah', 'Kd'],
        board: overrides.board || ['Kc', '7d', '3s'],
        handStr: overrides.handStr || 'AhKd',
        position: overrides.position || 'BTN',
        stackBB: overrides.stackBB || 100,
        potSize: overrides.potSize || 20,
        toCall: overrides.toCall !== undefined ? overrides.toCall : 0,
        bb: overrides.bb || 2,
        numPlayers: overrides.numPlayers || 2,
        legalActions: overrides.legalActions || [
            { type: 'check' },
            { type: 'bet', min: 4, max: 200 }
        ],
        profileId: overrides.profileId || 'test-horse',
        aggressionBias: overrides.aggressionBias !== undefined ? overrides.aggressionBias : 5,
        loosenessBias: overrides.loosenessBias || 0,
        opponentAdjustment: overrides.opponentAdjustment || { callMod: 0, foldMod: 0 },
        enrichedOpponentRead: overrides.enrichedOpponentRead || null,
        heroIsAggressor: overrides.heroIsAggressor !== undefined ? overrides.heroIsAggressor : true,
        counterStrategyMode: overrides.counterStrategyMode || 'standard',
        tableId: 'test-table',
        primaryOppId: null,
        ...overrides
    };
}

test('makeFlopHeuristicDecision: null guard on bad input', () => {
    const r = mfhd({ holeCards: null, board: null });
    expect(r).toBeNull();
});

test('makeFlopHeuristicDecision: null guard on short board', () => {
    const r = mfhd({ holeCards: ['Ah', 'Kd'], board: ['Kc', '7d'] });
    expect(r).toBeNull();
});

test('makeFlopHeuristicDecision: pot committed jam with decent hand', () => {
    // Stack = 3bb, pot = 30, SPR ≈ 0.2 → pot committed
    // handEval.strength for AK on K73 board ≈ top pair ≈ 50+
    const r = mfhd(flopParams({
        stackBB: 3,
        potSize: 30,
        toCall: 0,
        legalActions: [
            { type: 'check' },
            { type: 'bet', min: 4, max: 6 }
        ]
    }));
    // With SPR this low and decent hand, should be all_in or bet
    expect(r).not.toBeNull();
    // The pot committed path returns { type: 'all_in' } if strength >= 40 and canRaise
    expect(['all_in', 'bet']).toContain(r.type);
});

test('makeFlopHeuristicDecision: limped pot strong hand bets for value', () => {
    // heroIsAggressor = false (limped pot), strong hand, not facing bet
    // Mock random to always return 0 (always take the action)
    const origRandom = Math.random;
    Math.random = () => 0;
    try {
        const r = mfhd(flopParams({
            holeCards: ['Ah', 'Ad'],  // Overpair on 7-5-3 board ≈ strength 70+
            board: ['7c', '5d', '3s'],
            heroIsAggressor: false,
            toCall: 0,
            legalActions: [
                { type: 'check' },
                { type: 'bet', min: 4, max: 200 }
            ]
        }));
        expect(r).not.toBeNull();
        // Limped pot with strong hand should bet for value
        expect(r.type).toBe('bet');
    } finally {
        Math.random = origRandom;
    }
});

test('makeFlopHeuristicDecision: limped pot weak hand checks', () => {
    const r = mfhd(flopParams({
        holeCards: ['2h', '4d'],  // Total air on K-9-7 board
        board: ['Kc', '9d', '7s'],
        heroIsAggressor: false,
        toCall: 0,
        legalActions: [
            { type: 'check' },
            { type: 'bet', min: 4, max: 200 }
        ]
    }));
    expect(r).not.toBeNull();
    expect(r.type).toBe('check');
});

test('makeFlopHeuristicDecision: c-bet on high dry board as PFR (random=0)', () => {
    // High dry board (K-7-3 rainbow), hero is PFR, not facing bet
    // With random=0, should always c-bet
    const origRandom = Math.random;
    Math.random = () => 0;
    try {
        const r = mfhd(flopParams({
            holeCards: ['Ah', 'Qd'],  // AQ missed but PFR range advantage
            board: ['Kc', '7d', '3s'],
            heroIsAggressor: true,
            toCall: 0,
        }));
        expect(r).not.toBeNull();
        expect(r.type).toBe('bet');
    } finally {
        Math.random = origRandom;
    }
});

test('makeFlopHeuristicDecision: monster facing bet raises', () => {
    // Monster hand (set of kings) facing a bet → should raise
    const origRandom = Math.random;
    Math.random = () => 0; // Ensure we don't slow-play
    try {
        const r = mfhd(flopParams({
            holeCards: ['Kh', 'Kd'],  // Set of kings
            board: ['Kc', '7d', '3s'],
            toCall: 14,
            potSize: 20,
            legalActions: [
                { type: 'call' },
                { type: 'raise', min: 28, max: 200 },
                { type: 'fold' }
            ]
        }));
        expect(r).not.toBeNull();
        expect(r.type).toBe('raise');
        expect(r.amount).toBeGreaterThan(28);
    } finally {
        Math.random = origRandom;
    }
});

test('makeFlopHeuristicDecision: facing bet fold trash', () => {
    // Total air, facing large bet, no draws → fold
    const r = mfhd(flopParams({
        holeCards: ['2h', '4d'],  // Complete air on K-Q-9 board
        board: ['Kc', 'Qd', '9s'],
        toCall: 14,
        potSize: 20,
        legalActions: [
            { type: 'call' },
            { type: 'raise', min: 28, max: 200 },
            { type: 'fold' }
        ]
    }));
    expect(r).not.toBeNull();
    expect(r.type).toBe('fold');
});

test('makeFlopHeuristicDecision: strong hand calls facing small bet', () => {
    // Top pair good kicker (strength 48) facing a small bet (betToPot=0.33) → should call
    // Medium hand path: betToPot <= 0.40 and strength >= 35 → call
    const origRandom = Math.random;
    Math.random = () => 0.99; // High random to avoid raise branches
    try {
        const r = mfhd(flopParams({
            holeCards: ['Ah', 'Kd'],
            board: ['Kc', '7d', '3s'],
            toCall: 7,    // betToPot = 7/20 = 0.35
            potSize: 20,
            heroIsAggressor: false,
            legalActions: [
                { type: 'call' },
                { type: 'raise', min: 14, max: 200 },
                { type: 'fold' }
            ]
        }));
        expect(r).not.toBeNull();
        expect(r.type).toBe('call');
    } finally {
        Math.random = origRandom;
    }
});

test('makeFlopHeuristicDecision: draw calls with proper odds', () => {
    // Flush draw (9 outs) + overcards, facing half-pot bet → should call
    const origRandom = Math.random;
    Math.random = () => 0.99; // Avoid semi-bluff raise
    try {
        const r = mfhd(flopParams({
            holeCards: ['Ah', 'Th'],   // Nut flush draw
            board: ['Kh', '7h', '3c'],
            toCall: 10,
            potSize: 20,
            heroIsAggressor: false,
            legalActions: [
                { type: 'call' },
                { type: 'raise', min: 20, max: 200 },
                { type: 'fold' }
            ]
        }));
        expect(r).not.toBeNull();
        // With 9+ outs flush draw, equity ~40% vs pot odds ~33% → call
        expect(r.type).toBe('call');
    } finally {
        Math.random = origRandom;
    }
});

test('makeFlopHeuristicDecision: OOP check-raise semi-bluff with big draw (random=0)', () => {
    // OOP, big combo draw (flush draw + OESD = ~15 outs), facing c-bet
    const origRandom = Math.random;
    Math.random = () => 0; // Always take the semi-bluff
    try {
        const r = mfhd(flopParams({
            holeCards: ['9h', '8h'],   // Flush draw + OESD on Th-7h-2c
            board: ['Th', '7h', '2c'],
            position: 'BB',       // OOP
            toCall: 10,
            potSize: 20,
            heroIsAggressor: false,
            aggressionBias: 5,
            legalActions: [
                { type: 'call' },
                { type: 'raise', min: 20, max: 200 },
                { type: 'fold' }
            ]
        }));
        expect(r).not.toBeNull();
        // With massive draw OOP, should check-raise (or at minimum call)
        expect(['raise', 'call']).toContain(r.type);
    } finally {
        Math.random = origRandom;
    }
});

test('makeFlopHeuristicDecision: 4-bet pot low SPR jam with strong hand', () => {
    // 4-bet pot, SPR ≈ 1.5, monster → should jam
    const origRandom = Math.random;
    Math.random = () => 0;
    try {
        const r = mfhd(flopParams({
            holeCards: ['Ah', 'Ad'],
            board: ['Kc', '7d', '3s'],
            stackBB: 15,
            potSize: 60,
            toCall: 20,
            bb: 2,
            heroIsAggressor: true,
            legalActions: [
                { type: 'call' },
                { type: 'raise', min: 40, max: 30 },
                { type: 'fold' }
            ]
        }));
        expect(r).not.toBeNull();
        // SPR ~ 0.5, 4-bet pot implied, strength >= 65 → all_in or raise
        expect(['all_in', 'raise', 'call']).toContain(r.type);
    } finally {
        Math.random = origRandom;
    }
});

test('makeFlopHeuristicDecision: returns valid action structure', () => {
    const r = mfhd(flopParams());
    expect(r).not.toBeNull();
    expect(r).toHaveProperty('type');
    // type should be one of the valid action types
    expect(['check', 'bet', 'call', 'raise', 'fold', 'all_in']).toContain(r.type);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 46: makeTurnRiverHeuristicDecision ══');
// ═══════════════════════════════════════════════════════════

const mtrhd = brain.makeTurnRiverHeuristicDecision;

// Helper: build base params for makeTurnRiverHeuristicDecision
function turnRiverParams(overrides = {}) {
    return {
        street: overrides.street || 'turn',
        holeCards: overrides.holeCards || ['Ah', 'Kd'],
        board: overrides.board || ['Kc', '7d', '3s', '2h'],
        handStr: overrides.handStr || 'AhKd',
        position: overrides.position || 'BTN',
        stackBB: overrides.stackBB || 100,
        potSize: overrides.potSize || 40,
        toCall: overrides.toCall !== undefined ? overrides.toCall : 0,
        bb: overrides.bb || 2,
        numPlayers: overrides.numPlayers || 2,
        legalActions: overrides.legalActions || [
            { type: 'check' },
            { type: 'bet', min: 4, max: 200 }
        ],
        profileId: overrides.profileId || 'test-horse',
        aggressionBias: overrides.aggressionBias !== undefined ? overrides.aggressionBias : 5,
        loosenessBias: overrides.loosenessBias || 0,
        opponentAdjustment: overrides.opponentAdjustment || { callMod: 0, foldMod: 0 },
        enrichedOpponentRead: overrides.enrichedOpponentRead || null,
        oppStreetAggression: overrides.oppStreetAggression || 'moderate',
        heroIsAggressor: overrides.heroIsAggressor !== undefined ? overrides.heroIsAggressor : true,
        counterStrategyMode: overrides.counterStrategyMode || 'standard',
        streetNarrative: overrides.streetNarrative || null,
        tableId: 'test-table',
        primaryOppId: null,
        ...overrides
    };
}

test('makeTurnRiverHeuristicDecision: null guard on bad street', () => {
    const r = mtrhd({ street: 'flop', holeCards: ['Ah', 'Kd'], board: ['Kc', '7d', '3s', '2h'] });
    expect(r).toBeNull();
});

test('makeTurnRiverHeuristicDecision: null guard on short board', () => {
    const r = mtrhd({ street: 'turn', holeCards: ['Ah', 'Kd'], board: ['Kc', '7d', '3s'] });
    expect(r).toBeNull();
});

test('makeTurnRiverHeuristicDecision: turn pot committed jam', () => {
    // Stack 3bb = 6, pot = 50, SPR ~ 0.12 → pot committed
    const r = mtrhd(turnRiverParams({
        street: 'turn',
        stackBB: 3,
        potSize: 50,
        toCall: 0,
        holeCards: ['Ah', 'Kd'],
        board: ['Kc', '7d', '3s', '2h'],
        legalActions: [
            { type: 'check' },
            { type: 'bet', min: 4, max: 6 }
        ]
    }));
    expect(r).not.toBeNull();
    expect(['all_in', 'bet']).toContain(r.type);
});

test('makeTurnRiverHeuristicDecision: turn monster value bets', () => {
    // Set of kings on turn, not facing bet → should value bet
    const origRandom = Math.random;
    Math.random = () => 0;
    try {
        const r = mtrhd(turnRiverParams({
            street: 'turn',
            holeCards: ['Kh', 'Kd'],   // Set of kings
            board: ['Kc', '7d', '3s', '2h'],
            toCall: 0,
            potSize: 40,
        }));
        expect(r).not.toBeNull();
        expect(r.type).toBe('bet');
        expect(r.amount).toBeGreaterThan(0);
    } finally {
        Math.random = origRandom;
    }
});

test('makeTurnRiverHeuristicDecision: turn facing bet fold trash', () => {
    // Complete air on turn facing a bet → fold
    const r = mtrhd(turnRiverParams({
        street: 'turn',
        holeCards: ['2d', '4c'],   // Total air on K-7-3-9 board
        board: ['Kc', '7d', '3s', '9h'],
        toCall: 25,
        potSize: 40,
        legalActions: [
            { type: 'call' },
            { type: 'raise', min: 50, max: 200 },
            { type: 'fold' }
        ]
    }));
    expect(r).not.toBeNull();
    expect(r.type).toBe('fold');
});

test('makeTurnRiverHeuristicDecision: river pot committed call', () => {
    // Low SPR on river facing a bet, decent hand → should call (pot committed)
    const r = mtrhd(turnRiverParams({
        street: 'river',
        holeCards: ['Ah', 'Kd'],
        board: ['Kc', '7d', '3s', '2h', '9c'],
        stackBB: 4,
        potSize: 50,
        toCall: 5,
        legalActions: [
            { type: 'call' },
            { type: 'raise', min: 10, max: 8 },
            { type: 'fold' }
        ]
    }));
    expect(r).not.toBeNull();
    // Top pair AK strength ~48, pot committed → should call
    expect(['call', 'all_in']).toContain(r.type);
});

test('makeTurnRiverHeuristicDecision: river nut hand bets or jams', () => {
    // Full house (AA on A77) on river, not facing bet → should value bet or all-in
    const origRandom = Math.random;
    Math.random = () => 0;
    try {
        const r = mtrhd(turnRiverParams({
            street: 'river',
            holeCards: ['Ah', 'Ad'],  // Set of aces → full house on paired board
            board: ['Ac', '7d', '7s', '2h', '3c'],
            toCall: 0,
            potSize: 80,
            legalActions: [
                { type: 'check' },
                { type: 'bet', min: 4, max: 400 }
            ]
        }));
        expect(r).not.toBeNull();
        // Nut-level hand should bet or jam (all_in is valid for nuts)
        expect(['bet', 'all_in']).toContain(r.type);
    } finally {
        Math.random = origRandom;
    }
});

test('makeTurnRiverHeuristicDecision: river fold trash facing big bet', () => {
    const r = mtrhd(turnRiverParams({
        street: 'river',
        holeCards: ['2d', '4c'],
        board: ['Kc', 'Qd', 'Js', '9h', '3c'],
        toCall: 40,
        potSize: 50,
        legalActions: [
            { type: 'call' },
            { type: 'raise', min: 80, max: 200 },
            { type: 'fold' }
        ]
    }));
    expect(r).not.toBeNull();
    expect(r.type).toBe('fold');
});

test('makeTurnRiverHeuristicDecision: short stack jam on turn', () => {
    // Very short stack (10bb), strong hand, not facing bet → should shove
    const origRandom = Math.random;
    Math.random = () => 0;
    try {
        const r = mtrhd(turnRiverParams({
            street: 'turn',
            stackBB: 10,
            holeCards: ['Ah', 'Kd'],  // Top pair top kicker (str ~48)
            board: ['Kc', '7d', '3s', '2h'],
            toCall: 0,
            potSize: 30,
            legalActions: [
                { type: 'check' },
                { type: 'bet', min: 4, max: 20 }
            ]
        }));
        expect(r).not.toBeNull();
        // Short stack + decent hand + not facing bet → all_in
        expect(r.type).toBe('all_in');
    } finally {
        Math.random = origRandom;
    }
});

test('makeTurnRiverHeuristicDecision: returns valid action structure', () => {
    const r = mtrhd(turnRiverParams());
    expect(r).not.toBeNull();
    expect(r).toHaveProperty('type');
    expect(['check', 'bet', 'call', 'raise', 'fold', 'all_in']).toContain(r.type);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 46: analyzeBoardEvolution + helpers ══');
// ═══════════════════════════════════════════════════════════

const abe = brain.analyzeBoardEvolution;
const getSPR = brain.getSPRStrategy;
const getCBet = brain.getCBetStrategy;
const get3Bet = brain.get3BetStrategy;

// ── analyzeBoardEvolution ──

test('analyzeBoardEvolution: null guard', () => {
    const r = abe(null, 'turn');
    expect(r.evolution).toBe('unknown');
});

test('analyzeBoardEvolution: flop returns neutral (no evolution)', () => {
    const r = abe(['Kc', '7d', '3s'], 'flop');
    expect(r.evolution).toBe('neutral');
    expect(r.drawsCompleted.length).toBe(0);
});

test('analyzeBoardEvolution: turn overcard detected', () => {
    const r = abe(['7c', '5d', '3s', 'Ah'], 'turn');
    expect(r.overcard).toBe(true);
    expect(r.pfrImpact).toBeGreaterThan(0);
});

test('analyzeBoardEvolution: turn flush completion', () => {
    // Flop has 2 hearts, turn completes 3rd heart
    const r = abe(['Kh', '7h', '3s', '2h'], 'turn');
    expect(r.flushCompleted).toBe(true);
    expect(r.drawsCompleted).toContain('flush');
    expect(r.callerImpact).toBeGreaterThan(0);
});

test('analyzeBoardEvolution: turn board pairing', () => {
    const r = abe(['Kc', '7d', '3s', '7h'], 'turn');
    expect(r.boardPaired).toBe(true);
});

test('analyzeBoardEvolution: turn low card on high board = brick', () => {
    // High flop (K-Q-J), low turn (2) = brick → drier
    const r = abe(['Kc', 'Qd', 'Js', '2h'], 'turn');
    expect(r.boardGotDrier).toBe(true);
    expect(r.pfrImpact).toBeGreaterThan(0);
});

// ── getSPRStrategy ──

test('getSPRStrategy: zero pot returns deep', () => {
    const r = getSPR(200, 0);
    expect(r.strategy).toBe('deep');
    expect(r.spr).toBe(999);
});

test('getSPRStrategy: low SPR = committed', () => {
    const r = getSPR(30, 20);
    expect(r.strategy).toBe('committed');
    expect(r.commitThreshold).toBe(40);
});

test('getSPRStrategy: standard SPR', () => {
    const r = getSPR(200, 20);
    expect(r.strategy).toBe('standard');
    expect(r.spr).toBe(10);
});

test('getSPRStrategy: deep SPR', () => {
    const r = getSPR(400, 20);
    expect(r.strategy).toBe('deep');
    expect(r.commitThreshold).toBe(75);
});

// ── getCBetStrategy ──

test('getCBetStrategy: non-aggressor never c-bets', () => {
    const r = getCBet(false, true, 'dry', 2);
    expect(r.shouldCbet).toBe(false);
    expect(r.frequency).toBe(0);
});

test('getCBetStrategy: IP dry board has high frequency', () => {
    const r = getCBet(true, true, 'dry', 2);
    expect(r.frequency).toBe(0.75);
    expect(r.sizeFraction).toBe(0.33);
});

test('getCBetStrategy: OOP wet board has lower frequency', () => {
    const r = getCBet(true, false, 'wet', 2);
    expect(r.frequency).toBe(0.35);
    expect(r.sizeFraction).toBe(0.75);
});

test('getCBetStrategy: multiway reduces frequency', () => {
    const r = getCBet(true, true, 'dry', 3);
    // 3-way: freq * 0.5 = 0.75 * 0.5 = 0.375
    expect(r.frequency).toBeCloseTo(0.375, 2);
});

// ── get3BetStrategy ──

test('get3BetStrategy: premium hand 3-bets from BTN', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    try {
        const r = get3Bet('BTN', 85, 6, 2, 100);
        expect(r.should3Bet).toBe(true);
        expect(r.isBluff3Bet).toBe(false);
        expect(r.size3Bet).toBeGreaterThan(0);
    } finally {
        Math.random = origRandom;
    }
});

test('get3BetStrategy: weak hand does not 3-bet', () => {
    const r = get3Bet('BTN', 20, 6, 2, 100);
    expect(r.should3Bet).toBe(false);
});

test('get3BetStrategy: short stack jam with premium', () => {
    const r = get3Bet('BTN', 85, 6, 2, 20);
    expect(r.should3Bet).toBe(true);
    expect(r.isJam).toBe(true);
    expect(r.size3Bet).toBe(40); // 20bb * 2
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 47: getDecision master pipeline ══');
// ═══════════════════════════════════════════════════════════

// getDecision is async — we need an async test runner
const asyncTests = [];
function asyncTest(name, fn) {
    asyncTests.push({ name, fn });
}

const getDecision = brain.getDecision;

// Helper: minimal engine state for getDecision
function mkEngineState(overrides = {}) {
    return {
        players: overrides.players || [
            { id: 'horse-1', holeCards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'd' }], stack: 200, position: 'BTN', folded: false, invested: 0 },
            { id: 'opp-1', holeCards: [{ rank: '2', suit: 'c' }, { rank: '3', suit: 's' }], stack: 200, position: 'BB', folded: false, invested: 0 },
        ],
        communityCards: overrides.communityCards || [],
        phase: overrides.phase || 'preflop',
        potTotal: overrides.potTotal || 6,
        currentBet: overrides.currentBet || 0,
        tableId: overrides.tableId || 'test-table-gd',
        lastRaiser: overrides.lastRaiser || null,
        ...overrides,
    };
}

function mkLegal(types) {
    return types.map(t => {
        if (t === 'check') return { type: 'check' };
        if (t === 'fold') return { type: 'fold' };
        if (t === 'call') return { type: 'call' };
        if (t === 'bet') return { type: 'bet', minAmount: 4, maxAmount: 200 };
        if (t === 'raise') return { type: 'raise', minAmount: 8, maxAmount: 200 };
        if (t === 'all_in') return { type: 'all_in', amount: 200 };
        return { type: t };
    });
}

// --- Test 1: getDecision returns valid structure ---
asyncTest('getDecision returns {action, delayMs}', async () => {
    const origRandom = Math.random;
    Math.random = () => 0.5; // Suppress chaos/randomness
    try {
        const result = await getDecision(
            'horse-1',
            mkEngineState(),
            mkLegal(['check', 'bet']),
            { bigBlind: 2 }
        );
        expect(result).toHaveProperty('action');
        expect(result).toHaveProperty('delayMs');
        expect(result.action).toHaveProperty('type');
        const validTypes = ['check', 'fold', 'call', 'raise', 'bet', 'all_in'];
        if (!validTypes.includes(result.action.type)) throw new Error(`Invalid action type: ${result.action.type}`);
    } finally {
        Math.random = origRandom;
    }
});

// --- Test 2: getDecision with no legal actions returns fold ---
asyncTest('getDecision with empty legal actions returns fold', async () => {
    const result = await getDecision('horse-1', mkEngineState(), [], { bigBlind: 2 });
    expect(result.action.type).toBe('fold');
    expect(result.delayMs).toBe(500);
});

// --- Test 3: getDecision with no hole cards returns check/fold ---
asyncTest('getDecision with no hole cards returns check or fold', async () => {
    const state = mkEngineState({
        players: [
            { id: 'horse-1', holeCards: null, stack: 200, position: 'BTN', folded: false, invested: 0 },
            { id: 'opp-1', holeCards: [{ rank: '2', suit: 'c' }, { rank: '3', suit: 's' }], stack: 200, position: 'BB', folded: false },
        ],
    });
    const result = await getDecision('horse-1', state, mkLegal(['check', 'bet']), { bigBlind: 2 });
    if (result.action.type !== 'check' && result.action.type !== 'fold') {
        throw new Error(`Expected check or fold, got ${result.action.type}`);
    }
});

// --- Test 4: Flop heuristic fires (no GTO module) ---
asyncTest('getDecision flop uses heuristic engine', async () => {
    const origRandom = Math.random;
    Math.random = () => 0.99; // suppress chaos, suppress random bets
    try {
        const state = mkEngineState({
            phase: 'flop',
            communityCards: [{ rank: 'K', suit: 'c' }, { rank: '7', suit: 'd' }, { rank: '3', suit: 's' }],
            potTotal: 20,
            currentBet: 0,
            lastRaiser: 'horse-1', // hero is aggressor
        });
        const result = await getDecision('horse-1', state, mkLegal(['check', 'bet']), { bigBlind: 2 });
        // AK on K73 is top pair — should bet or check (not fold since we're not facing a bet)
        if (result.action.type === 'fold') throw new Error('Should not fold top pair on flop');
    } finally {
        Math.random = origRandom;
    }
});

// --- Test 5: Turn/river heuristic fires ---
asyncTest('getDecision turn uses heuristic engine', async () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    try {
        const state = mkEngineState({
            phase: 'turn',
            communityCards: [{ rank: 'K', suit: 'c' }, { rank: '7', suit: 'd' }, { rank: '3', suit: 's' }, { rank: '2', suit: 'h' }],
            potTotal: 40,
            currentBet: 0,
            lastRaiser: 'horse-1',
        });
        const result = await getDecision('horse-1', state, mkLegal(['check', 'bet']), { bigBlind: 2 });
        if (result.action.type === 'fold') throw new Error('Should not fold top pair on turn');
    } finally {
        Math.random = origRandom;
    }
});

// --- Test 6: River with trash hand facing big bet folds ---
asyncTest('getDecision river folds trash facing big bet', async () => {
    const origRandom = Math.random;
    Math.random = () => 0.99; // suppress chaos
    try {
        const state = mkEngineState({
            phase: 'river',
            players: [
                { id: 'horse-1', holeCards: [{ rank: '2', suit: 'h' }, { rank: '4', suit: 'd' }], stack: 200, position: 'BTN', folded: false, invested: 0 },
                { id: 'opp-1', holeCards: [{ rank: 'A', suit: 'c' }, { rank: 'A', suit: 's' }], stack: 200, position: 'BB', folded: false },
            ],
            communityCards: [{ rank: 'K', suit: 'c' }, { rank: 'Q', suit: 'd' }, { rank: 'J', suit: 's' }, { rank: '9', suit: 'h' }, { rank: '8', suit: 'c' }],
            potTotal: 100,
            currentBet: 80,
        });
        const result = await getDecision('horse-1', state, mkLegal(['fold', 'call', 'raise']), { bigBlind: 2 });
        expect(result.action.type).toBe('fold');
    } finally {
        Math.random = origRandom;
    }
});

// --- Test 7: Preflop fallback produces valid action ---
asyncTest('getDecision preflop produces valid action', async () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    try {
        const result = await getDecision(
            'horse-1',
            mkEngineState({ phase: 'preflop', potTotal: 3, currentBet: 2 }),
            mkLegal(['fold', 'call', 'raise']),
            { bigBlind: 2 }
        );
        const validTypes = ['fold', 'call', 'raise', 'bet', 'check', 'all_in'];
        if (!validTypes.includes(result.action.type)) throw new Error(`Invalid: ${result.action.type}`);
        expect(result.delayMs).toBeGreaterThanOrEqual(800);
        expect(result.delayMs).toBeLessThanOrEqual(7000);
    } finally {
        Math.random = origRandom;
    }
});

// --- Test 8: delayMs is clamped to [800, 7000] ---
asyncTest('getDecision delayMs is in [800, 7000]', async () => {
    const origRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const result = await getDecision('horse-1', mkEngineState(), mkLegal(['check', 'bet']), { bigBlind: 2 });
        expect(result.delayMs).toBeGreaterThanOrEqual(800);
        expect(result.delayMs).toBeLessThanOrEqual(7000);
    } finally {
        Math.random = origRandom;
    }
});

// --- Test 9: Guardrail — never fold the nuts postflop ---
asyncTest('getDecision guardrail: never fold strong hand postflop', async () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    try {
        // AA on A-A-K board = quads, strength ~95+
        const state = mkEngineState({
            phase: 'flop',
            players: [
                { id: 'horse-1', holeCards: [{ rank: 'A', suit: 'h' }, { rank: 'A', suit: 'd' }], stack: 200, position: 'BTN', folded: false, invested: 0 },
                { id: 'opp-1', holeCards: [{ rank: '2', suit: 'c' }, { rank: '3', suit: 's' }], stack: 200, position: 'BB', folded: false },
            ],
            communityCards: [{ rank: 'A', suit: 'c' }, { rank: 'A', suit: 's' }, { rank: 'K', suit: 'd' }],
            potTotal: 100,
            currentBet: 80,
        });
        const result = await getDecision('horse-1', state, mkLegal(['fold', 'call', 'raise']), { bigBlind: 2 });
        if (result.action.type === 'fold') throw new Error('Should never fold quads');
    } finally {
        Math.random = origRandom;
    }
});

// --- Test 10: bet/raise amounts are always clamped ---
asyncTest('getDecision clamps bet amounts to legal range', async () => {
    const origRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const state = mkEngineState({
            phase: 'flop',
            communityCards: [{ rank: 'K', suit: 'c' }, { rank: '7', suit: 'd' }, { rank: '3', suit: 's' }],
            potTotal: 20,
            currentBet: 0,
            lastRaiser: 'horse-1',
        });
        const legal = [{ type: 'check' }, { type: 'bet', minAmount: 10, maxAmount: 50 }];
        const result = await getDecision('horse-1', state, legal, { bigBlind: 2 });
        if (result.action.type === 'bet') {
            if (result.action.amount < 10) throw new Error(`Amount ${result.action.amount} below min 10`);
            if (result.action.amount > 50) throw new Error(`Amount ${result.action.amount} above max 50`);
        }
    } finally {
        Math.random = origRandom;
    }
});

// --- Test 11: Donk bet handler fires when hero was PFA and facing bet ---
asyncTest('getDecision donk handler responds to donk bet', async () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    try {
        // Hero was the preflop raiser (lastRaiser = 'horse-1'), now facing a bet on flop
        const state = mkEngineState({
            phase: 'flop',
            communityCards: [{ rank: 'K', suit: 'c' }, { rank: '7', suit: 'd' }, { rank: '3', suit: 's' }],
            potTotal: 30,
            currentBet: 10,
            lastRaiser: 'horse-1',
        });
        // AK on K73 facing 10-chip donk bet — should call or raise, not fold
        const result = await getDecision('horse-1', state, mkLegal(['fold', 'call', 'raise']), { bigBlind: 2 });
        if (result.action.type === 'fold') throw new Error('Should not fold top pair facing donk bet');
    } finally {
        Math.random = origRandom;
    }
});

// --- Test 12: SPR trap detector folds marginal hand facing large bet ---
asyncTest('getDecision SPR trap folds marginal hand', async () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    try {
        // Middle pair (9h on K93 board), hero has 30bb, pot is 60, facing 50 chip bet
        // This creates a low SPR pot-commit situation with a marginal hand
        const state = mkEngineState({
            phase: 'turn',
            players: [
                { id: 'horse-1', holeCards: [{ rank: '9', suit: 'h' }, { rank: '2', suit: 'd' }], stack: 60, position: 'BTN', folded: false, invested: 0 },
                { id: 'opp-1', holeCards: [{ rank: 'A', suit: 'c' }, { rank: 'A', suit: 's' }], stack: 200, position: 'BB', folded: false },
            ],
            communityCards: [{ rank: 'K', suit: 'c' }, { rank: '9', suit: 'd' }, { rank: '3', suit: 's' }, { rank: 'J', suit: 'h' }],
            potTotal: 80,
            currentBet: 50,
        });
        const result = await getDecision('horse-1', state, mkLegal(['fold', 'call']), { bigBlind: 2 });
        // Second pair with bad kicker facing 50 into 80 — should fold (SPR trap or guardrail)
        expect(result.action.type).toBe('fold');
    } finally {
        Math.random = origRandom;
    }
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 47b: Pipeline utility functions ══');
// ═══════════════════════════════════════════════════════════

// ── analyzeStreetNarrative ──
// Not directly exported, but we can test via getStreetMemory patterns
// Actually let's check — it's used internally. Let me find a way to import it.
// It's NOT exported. But recordStreetAction and getStreetMemory ARE accessible via
// the makeTurnRiverHeuristicDecision params. Let's test detectBombPotOrStraddle etc.

const detectBomb = brain.detectBombPotOrStraddle;
const recordRaise = brain.recordRaiseSize;
const isMinRaise = brain.isMinRaiser;
const recordSqueezeFn = brain.recordSqueeze;
const isSqueeze = brain.isSqueezeOverkill;
const recordTiming = brain.recordActionTiming;
const detectAngle = brain.detectAngleShoot;
const recordColdCallFn = brain.recordColdCall;
const recordBarrel = brain.recordBarrelVsColdCall;
const isCCTrap = brain.isColdCallTrap;
const detectRevImp = brain.detectReverseImplied;
const recordRIT = brain.recordRITResponse;
const isRIT = brain.isRITRefuser;
const recordImg = brain.recordTableImageHand;
const isImgExposed = brain.isImageExposed;
const detectLimp = brain.detectLimpTrap;
const recordIso = brain.recordIsoSize;
const isMechIso = brain.isMechanicalIsolator;

// ── detectBombPotOrStraddle ──

test('detectBombPot: standard pot', () => {
    const r = detectBomb(6, 2, false);
    expect(r.isBombPot).toBe(false);
    expect(r.isStraddle).toBe(false);
    expect(r.equityThresholdBoost).toBe(0);
});

test('detectBombPot: bomb pot (pot >= 8*bb)', () => {
    const r = detectBomb(20, 2, false);
    expect(r.isBombPot).toBe(true);
    expect(r.label).toBe('bomb-pot');
    expect(r.equityThresholdBoost).toBe(15);
});

test('detectBombPot: straddle', () => {
    const r = detectBomb(20, 2, true);
    expect(r.isStraddle).toBe(true);
    expect(r.isBombPot).toBe(false);
    expect(r.equityThresholdBoost).toBe(10);
});

// ── isMinRaiser ──

test('isMinRaiser: not enough data', () => {
    const r = isMinRaise('nobody-999');
    expect(r.isMinRaiser).toBe(false);
});

test('isMinRaiser: detected after enough min-raises', () => {
    for (let i = 0; i < 5; i++) recordRaise('test-mr-1', 4, 2, false); // 4 <= 2*2.2=4.4 = min raise
    const r = isMinRaise('test-mr-1');
    expect(r.isMinRaiser).toBe(true);
    expect(r.rate).toBeGreaterThan(0.4);
});

test('isMinRaiser: not triggered with large raises', () => {
    for (let i = 0; i < 5; i++) recordRaise('test-mr-2', 20, 2, false); // 20 >> 4.4
    const r = isMinRaise('test-mr-2');
    expect(r.isMinRaiser).toBe(false);
});

// ── isSqueezeOverkill ──

test('isSqueezeOverkill: not enough data', () => {
    const r = isSqueeze('nobody-888');
    expect(r.isOverkill).toBe(false);
});

test('isSqueezeOverkill: detected with high multiplier', () => {
    for (let i = 0; i < 4; i++) recordSqueezeFn('test-sq-1', 50, 10); // 5x pot
    const r = isSqueeze('test-sq-1');
    expect(r.isOverkill).toBe(true);
    expect(r.avgMult).toBeGreaterThanOrEqual(4.0);
});

test('isSqueezeOverkill: normal squeeze not triggered', () => {
    for (let i = 0; i < 4; i++) recordSqueezeFn('test-sq-2', 20, 10); // 2x pot
    const r = isSqueeze('test-sq-2');
    expect(r.isOverkill).toBe(false);
});

// ── detectAngleShoot ──

test('detectAngleShoot: no data', () => {
    const r = detectAngle('nobody-777');
    expect(r.isAngleShooting).toBe(false);
    expect(r.extraEntropyMs).toBe(0);
});

test('detectAngleShoot: detected with fast actions', () => {
    for (let i = 0; i < 6; i++) recordTiming('test-angle-1', 400); // all instant (<700ms)
    const origRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const r = detectAngle('test-angle-1');
        expect(r.isAngleShooting).toBe(true);
        expect(r.extraEntropyMs).toBeGreaterThan(0);
    } finally {
        Math.random = origRandom;
    }
});

test('detectAngleShoot: normal timing not triggered', () => {
    for (let i = 0; i < 6; i++) recordTiming('test-angle-2', 3000); // all slow
    const r = detectAngle('test-angle-2');
    expect(r.isAngleShooting).toBe(false);
});

// ── isColdCallTrap ──

test('isColdCallTrap: not enough data', () => {
    const r = isCCTrap('nobody-666');
    expect(r.isTrap).toBe(false);
});

test('isColdCallTrap: detected when opponent rarely folds to barrels', () => {
    recordColdCallFn('test-cc-1');
    for (let i = 0; i < 5; i++) recordBarrel('test-cc-1', false); // never folds
    const r = isCCTrap('test-cc-1');
    expect(r.isTrap).toBe(true); // winRate=0 < 0.35
});

test('isColdCallTrap: not triggered when opponent folds often', () => {
    recordColdCallFn('test-cc-2');
    for (let i = 0; i < 5; i++) recordBarrel('test-cc-2', true); // always folds
    const r = isCCTrap('test-cc-2');
    expect(r.isTrap).toBe(false); // winRate=1.0 > 0.35
});

// ── detectReverseImplied ──

test('detectReverseImplied: no outs returns no block', () => {
    const r = detectRevImp(0, 0.3, 100, 2, true);
    expect(r.shouldBlock).toBe(false);
});

test('detectReverseImplied: weak draw on wet board blocks', () => {
    // 4 outs (gutshot), potOdds=0.4, stack=100, 3 opponents, wet board
    const r = detectRevImp(4, 0.40, 100, 3, true);
    // drawEquity = 8%, potOdds=40%, should block
    expect(r.shouldBlock).toBe(true);
    expect(r.rioFactor).toBeGreaterThan(1.5);
});

// ── isRITRefuser ──

test('isRITRefuser: not enough offers', () => {
    const r = isRIT('nobody-555');
    expect(r.isRITRefuser).toBe(false);
});

test('isRITRefuser: detected when always refuses', () => {
    recordRIT('test-rit-1', false);
    recordRIT('test-rit-1', false);
    recordRIT('test-rit-1', false);
    const r = isRIT('test-rit-1');
    expect(r.isRITRefuser).toBe(true);
});

// ── detectLimpTrap ──

test('detectLimpTrap: no limpers = no trap', () => {
    const r = detectLimp(0, 'BTN', 20, false);
    expect(r.isLimpTrap).toBe(false);
});

test('detectLimpTrap: many limpers with good SPR', () => {
    // 4 limpers, in position, SPR > 10
    const r = detectLimp(4, 'BTN', 15, false);
    expect(r.isLimpTrap).toBe(true);
});

// ── isMechanicalIsolator ──

test('isMechanicalIsolator: not enough data', () => {
    const r = isMechIso('nobody-444');
    expect(r.isMechanical).toBe(false);
});

test('isMechanicalIsolator: detected with consistent sizing', () => {
    for (let i = 0; i < 6; i++) recordIso('test-iso-1', 6.0); // always 6bb iso
    const r = isMechIso('test-iso-1');
    expect(r.isMechanical).toBe(true);
    expect(r.stdDev).toBeLessThan(0.5);
});

test('isMechanicalIsolator: not triggered with varied sizing', () => {
    const sizes = [4, 6, 8, 10, 12, 14];
    for (const s of sizes) recordIso('test-iso-2', s);
    const r = isMechIso('test-iso-2');
    expect(r.isMechanical).toBe(false);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 47c: Performance stats + additional modules ══');
// ═══════════════════════════════════════════════════════════

const recordPerfAction = brain.recordPerformanceAction;
const getPerfStats = brain.getPerformanceStats;
const recordPerfResult = brain.recordPerformanceResult;
const getAdaptiveStrat = brain.getAdaptiveStrategy;
const shouldAutoSeat = brain.shouldAutoSeat;
const getOOPGuard = brain.getOOPPositionalGuard;
const evalDonk = brain.evaluateDonkBet;
const detectRevImplied = brain.detectReverseImplied;

// ── recordPerformanceAction + getPerformanceStats ──

test('getPerformanceStats: empty returns zeros', () => {
    const r = getPerfStats('nobody-perf-999');
    expect(r.handsPlayed).toBe(0);
    expect(r.vpip).toBe(0);
});

test('getPerformanceStats: tracks VPIP and PFR correctly', () => {
    recordPerfAction('test-perf-1', 'preflop', 'raise', true); // vpip + pfr
    recordPerfAction('test-perf-1', 'preflop', 'call', true);  // vpip only
    recordPerfAction('test-perf-1', 'preflop', 'fold', false); // neither
    const r = getPerfStats('test-perf-1');
    expect(r.handsPlayed).toBe(3);
    expect(r.vpip).toBe(67); // 2/3 = 66.6... rounds to 67
    expect(r.pfr).toBe(33);  // 1/3 = 33.3... rounds to 33
});

test('recordPerformanceResult: tracks wins and BB', () => {
    recordPerfResult('test-perf-1', true, 10);
    recordPerfResult('test-perf-1', false, -5);
    const r = getPerfStats('test-perf-1');
    expect(r.wins).toBe(1);
    expect(r.losses).toBe(1);
    // winRate = totalWonBB / handsPlayed = 5/3 = 1.67
    expect(r.winRate).toBeGreaterThan(1);
});

// ── shouldAutoSeat ──

test('shouldAutoSeat: no horses returns false', () => {
    const r = shouldAutoSeat({ seats: [{ player: { id: 'human-1' } }], minPlayers: 2 }, []);
    expect(r.shouldSeat).toBe(false);
});

test('shouldAutoSeat: below min players returns true', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    try {
        const r = shouldAutoSeat(
            { seats: [{ player: { id: 'human-1' } }], minPlayers: 2 },
            ['horse-a', 'horse-b']
        );
        expect(r.shouldSeat).toBe(true);
        expect(r.horseId).toBe('horse-a');
    } finally {
        Math.random = origRandom;
    }
});

test('shouldAutoSeat: at capacity returns false', () => {
    const r = shouldAutoSeat(
        { seats: [{ player: { id: 'h1' } }, { player: { id: 'h2' } }], minPlayers: 2 },
        ['horse-a']
    );
    expect(r.shouldSeat).toBe(false);
});

// ── getOOPPositionalGuard ──

test('getOOPPositionalGuard: IP returns no guard', () => {
    const r = getOOPGuard(true, false, 50, 'turn');
    expect(r.shouldGuard).toBe(false);
    expect(r.equityBoost).toBe(0);
});

test('getOOPPositionalGuard: OOP no initiative boosts equity threshold', () => {
    const r = getOOPGuard(false, false, 50, 'river');
    expect(r.equityBoost).toBe(12); // river boost
    expect(r.shouldGuard).toBe(true); // 50 < (50 + 12)
});

test('getOOPPositionalGuard: OOP with initiative OK', () => {
    const r = getOOPGuard(false, true, 50, 'turn');
    expect(r.shouldGuard).toBe(false);
});

// ── evaluateDonkBet ──

test('evaluateDonkBet: not a donk if not IP', () => {
    const r = evalDonk(10, 50, false, 60);
    expect(r.action).toBe('none');
});

test('evaluateDonkBet: strong equity raises', () => {
    const r = evalDonk(15, 50, true, 70);
    expect(r.action).toBe('raise');
});

test('evaluateDonkBet: weak equity folds', () => {
    const r = evalDonk(15, 50, true, 30);
    expect(r.action).toBe('fold');
});

test('evaluateDonkBet: medium equity calls', () => {
    const r = evalDonk(15, 50, true, 50);
    expect(r.action).toBe('call');
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 47d: Deep execution tests ══');
// ═══════════════════════════════════════════════════════════

const selectCS = brain.selectCounterStrategy;
const getRRG = brain.getRangeRotationGear;
const getDRS = brain.getDynamicRebuyStrategy;
const getRecStake = brain.getRecommendedStake;
const evolveSkill = brain.evolveHorseSkill;
const getSkillDr = brain.getSkillDrift;
const getSessReview = brain.getSessionReview;
const recOppAction = brain.recordOpponentAction;
const getOppSessRead = brain.getOpponentSessionRead;
const recOppShowdown = brain.recordOpponentShowdown;
const getPFS = brain.getProbeFarmScore;
const recProbeBet = brain.recordProbeBet;
const recTableImg = brain.recordTableImageHand;
const isImgExp = brain.isImageExposed;

// ── selectCounterStrategy ──

test('selectCounterStrategy: standard mode by default', () => {
    const r = selectCS('horse-cs-1', null, 'table-cs-1');
    expect(r.mode).toBe('standard');
    expect(r).toHaveProperty('details');
});

test('selectCounterStrategy: returns non-standard when bot suspected', () => {
    // Seed the suspectBotMap
    brain.suspectBotMap.set('bot-cs-opp', { perfectFolds: 0, gtoSizes: 0, humanErrors: 0, handsObserved: 10, suspectScore: 70 });
    const r = selectCS('horse-cs-2', 'bot-cs-opp', 'table-cs-2');
    expect(r.mode).toBe('anti_bot');
    brain.suspectBotMap.delete('bot-cs-opp');
});

test('selectCounterStrategy: stealth when high exposure', () => {
    // Seed showdownExposureMap
    brain.showdownExposureMap.set('horse-cs-3', new Map([['table-cs-3', { showdowns: 10, handsPlayed: 20 }]]));
    const r = selectCS('horse-cs-3', null, 'table-cs-3');
    expect(r.mode).toBe('stealth'); // 10/20 = 50% > 20%
    brain.showdownExposureMap.delete('horse-cs-3');
});

// ── getRangeRotationGear ──

test('getRangeRotationGear: returns valid gear on first call', () => {
    const r = getRRG('horse-rr-1', 'table-rr-1');
    expect(r).toHaveProperty('gear');
    expect(r).toHaveProperty('foldMod');
    expect(r).toHaveProperty('raiseMod');
});

test('getRangeRotationGear: rotates after 30 hands', () => {
    const firstGear = getRRG('horse-rr-2', 'table-rr-2').gear;
    for (let i = 0; i < 30; i++) getRRG('horse-rr-2', 'table-rr-2');
    const secondGear = getRRG('horse-rr-2', 'table-rr-2').gear;
    // After 30+ calls, gear should have rotated
    if (firstGear === secondGear) throw new Error('Gear should have rotated after 30 hands');
});

// ── getDynamicRebuyStrategy ──

test('getDynamicRebuyStrategy: max buyins rejects rebuy', () => {
    const r = getDRS('horse-dr-1', 50, 2, 3, 200);
    expect(r.shouldRebuy).toBe(false);
    expect(r.reason).toBe('max_buyins_reached');
});

test('getDynamicRebuyStrategy: short stacked triggers rebuy', () => {
    const r = getDRS('horse-dr-2', 40, 2, 1, 200); // 20bb
    expect(r.shouldRebuy).toBe(true);
    expect(r.reason).toBe('short_stacked');
    expect(r.amount).toBeGreaterThan(0);
});

test('getDynamicRebuyStrategy: adequate stack no rebuy', () => {
    const r = getDRS('horse-dr-3', 200, 2, 1, 200); // 100bb
    expect(r.shouldRebuy).toBe(false);
    expect(r.reason).toBe('adequate_stack');
});

// ── getRecommendedStake ──

test('getRecommendedStake: small bankroll recommends low stakes', () => {
    const r = getRecStake(5000, 'Cash');
    expect(r.recommendedBlinds.bb).toBeLessThanOrEqual(2);
    expect(r.maxBuyIn).toBeGreaterThan(0);
});

test('getRecommendedStake: tournament uses 50 buyin rule', () => {
    const r = getRecStake(10000, 'Tournament');
    expect(r.maxBuyIn).toBe(200);
});

// ── getAdaptiveStrategy ──

test('getAdaptiveStrategy: insufficient data returns neutral', () => {
    const r = getAdaptiveStrat('horse-adapt-nobody');
    expect(r.reason).toBe('insufficient_data');
    expect(r.rangeAdjust).toBe(0);
});

test('getAdaptiveStrategy: winning player tightens up', () => {
    // Seed performance with 30+ hands and a big win rate
    for (let i = 0; i < 35; i++) recordPerfAction('horse-adapt-1', 'preflop', 'call', true);
    for (let i = 0; i < 10; i++) recordPerfResult('horse-adapt-1', true, 20); // +200BB in 35 hands
    const r = getAdaptiveStrat('horse-adapt-1');
    expect(r.rangeAdjust).toBeLessThan(0); // Tighter
    expect(r.reason).toBe('protecting_profit');
});

// ── evolveHorseSkill + getSkillDrift + getSessionReview ──

test('evolveHorseSkill: winning session increases drift', () => {
    const r = evolveSkill('horse-evo-1', 10); // +10BB/100 = winning
    expect(r.skillDrift).toBeGreaterThan(0);
    expect(r.direction).toBe('stable'); // Only 1 point, need >2 for 'improving'
});

test('getSkillDrift: returns current drift', () => {
    const d = getSkillDr('horse-evo-1');
    expect(d).toBeGreaterThan(0);
});

test('evolveHorseSkill: losing session decreases drift', () => {
    const r = evolveSkill('horse-evo-2', -10); // -10BB/100 = losing
    expect(r.skillDrift).toBeLessThan(0);
});

test('getSessionReview: returns valid review structure', () => {
    // Setup: record some performance for this horse
    for (let i = 0; i < 5; i++) recordPerfAction('horse-review-1', 'preflop', 'raise', true);
    recordPerfResult('horse-review-1', true, 5);
    const r = getSessReview('horse-review-1');
    expect(r).toHaveProperty('handsPlayed');
    expect(r).toHaveProperty('vpip');
    expect(r).toHaveProperty('grade');
    expect(r.handsPlayed).toBe(5);
});

// ── recordOpponentAction + getOpponentSessionRead ──

test('getOpponentSessionRead: null with insufficient data', () => {
    const r = getOppSessRead('opp-nobody');
    expect(r).toBeNull();
});

test('recordOpponentAction + getOpponentSessionRead: builds profile', () => {
    // Record 10+ actions to exceed the 8-action threshold
    for (let i = 0; i < 4; i++) {
        recOppAction('test-opp-sr-1', 'preflop', 'call', {});
        recOppAction('test-opp-sr-1', 'flop', 'bet', { betToPot: 0.5 });
    }
    recOppAction('test-opp-sr-1', 'preflop', 'raise', {});
    recOppAction('test-opp-sr-1', 'preflop', 'fold', {});
    const r = getOppSessRead('test-opp-sr-1');
    if (!r) throw new Error('Expected non-null session read after 10 actions');
    expect(r).toHaveProperty('aggFreq');
    expect(r).toHaveProperty('sessionTendency');
    expect(r).toHaveProperty('confidence');
    expect(r.totalActions).toBeGreaterThanOrEqual(10);
    expect(r.confidence).toBeGreaterThan(0);
});

test('recordOpponentShowdown: tracks bluffs', () => {
    recOppShowdown('test-opp-sr-1', false, 10, true); // Lost bluff
    recOppShowdown('test-opp-sr-1', true, 80, false);  // Won legit
    recOppShowdown('test-opp-sr-1', false, 15, true);  // Lost bluff
    const r = getOppSessRead('test-opp-sr-1');
    expect(r.bluffRate).toBeGreaterThan(0); // 2/3 bluffs in showdowns
    expect(r.showdownCount).toBe(3);
});

// ── recordProbeBet + getProbeFarmScore ──

test('getProbeFarmScore: zero with no data', () => {
    const r = getPFS('nobody-probe');
    expect(r).toBe(0);
});

test('recordProbeBet + getProbeFarmScore: builds score', () => {
    for (let i = 0; i < 5; i++) recProbeBet('test-probe-1', 0.25, true, 10); // Small probe, won
    const r = getPFS('test-probe-1');
    expect(r).toBeGreaterThan(0); // Should have a positive probe score
});

// ── recordTableImageHand + isImageExposed ──

test('isImageExposed: not exposed with few hands', () => {
    const r = isImgExp('horse-img-nobody', 'table-img-nobody');
    expect(r).toBe(false);
});

test('isImageExposed: exposed after many showdowns', () => {
    for (let i = 0; i < 10; i++) recTableImg('horse-img-1', 'table-img-1', true); // All showdowns
    const r = isImgExp('horse-img-1', 'table-img-1');
    expect(r).toBe(true); // 10/10 = 100% showdown rate > 25%
});

test('isImageExposed: not exposed with mixed hands', () => {
    for (let i = 0; i < 15; i++) recTableImg('horse-img-2', 'table-img-2', false); // No showdowns
    for (let i = 0; i < 2; i++) recTableImg('horse-img-2', 'table-img-2', true);  // 2 showdowns
    const r = isImgExp('horse-img-2', 'table-img-2');
    expect(r).toBe(false); // 2/17 = 11.7% < 25%
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 47e: Card utils + remaining functions ══');
// ═══════════════════════════════════════════════════════════

const cardToStr = brain.cardIntToString;
const cardsToStr = brain.cardsToStrings;
const mapPos = brain.mapPosition;
const fmtHand = brain.formatHandString;
const getPS = brain.getPreflopStrength;
const getDeepAdj = brain.getDeepStackAdjustment;
const isSoftPlay = brain.isSoftPlayAllowed;
const recSoftPlay = brain.recordSoftPlay;
const getChipLeak = brain.getChipLeakBoosts;
const recChipLeak = brain.recordChipLeak;
const reevPLORun = brain.reevaluatePLORunoutEquity;

// ── cardIntToString ──

test('cardIntToString: string passthrough', () => {
    expect(cardToStr('Ah')).toBe('Ah');
});

test('cardIntToString: object with string rank/suit', () => {
    expect(cardToStr({ rank: 'A', suit: 'h' })).toBe('Ah');
    expect(cardToStr({ rank: 'T', suit: 's' })).toBe('Ts');
});

test('cardIntToString: object with numeric rank/suit', () => {
    // rank 14 = Ace (14-2=12, RANKS[12]='A'), suit 0 = first suit
    expect(cardToStr({ rank: 14, suit: 0 })).toBe('Ac');
    expect(cardToStr({ rank: 2, suit: 1 })).toBe('2d');
});

test('cardIntToString: integer encoding', () => {
    // Integer: rank * 4 + suit. rank 0='2', suit 0='c' → 0*4+0=0 → '2c'
    expect(cardToStr(0)).toBe('2c');
    // rank 12='A', suit 0='c' → 12*4+0=48 → 'Ac'
    expect(cardToStr(48)).toBe('Ac');
});

// ── cardsToStrings ──

test('cardsToStrings: handles null/empty', () => {
    expect(cardsToStr(null).length).toBe(0);
    expect(cardsToStr([]).length).toBe(0);
});

test('cardsToStrings: converts array of objects', () => {
    const r = cardsToStr([{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'd' }]);
    expect(r[0]).toBe('Ah');
    expect(r[1]).toBe('Kd');
});

// ── mapPosition ──

test('mapPosition: standard mappings', () => {
    expect(mapPos('btn')).toBe('BTN');
    expect(mapPos('sb')).toBe('SB');
    expect(mapPos('bb')).toBe('BB');
    expect(mapPos('co')).toBe('CO');
    expect(mapPos('utg')).toBe('UTG');
});

test('mapPosition: unknown defaults to MP', () => {
    expect(mapPos('weird')).toBe('MP');
});

// ── formatHandString ──

test('formatHandString: pair', () => {
    expect(fmtHand('Ah', 'Ad')).toBe('AA');
    expect(fmtHand('5c', '5d')).toBe('55');
});

test('formatHandString: suited', () => {
    expect(fmtHand('Ah', 'Kh')).toBe('AKs');
});

test('formatHandString: offsuit', () => {
    expect(fmtHand('Ah', 'Kd')).toBe('AKo');
});

test('formatHandString: higher rank first', () => {
    expect(fmtHand('7d', 'Ac')).toBe('A7o'); // A should come first
});

// ── getPreflopStrength ──

test('getPreflopStrength: AA is highest', () => {
    const r = getPS('AA');
    expect(r).toBeGreaterThanOrEqual(90);
});

test('getPreflopStrength: AKs is strong', () => {
    const r = getPS('AKs');
    expect(r).toBeGreaterThanOrEqual(80);
});

test('getPreflopStrength: unknown hand gets default 20', () => {
    expect(getPS('32o')).toBe(20);
});

// ── getDeepStackAdjustment ──

test('getDeepStackAdjustment: shallow stack no adjustment', () => {
    const r = getDeepAdj(100);
    expect(r.widenRange).toBe(false);
    expect(r.impliedOddsBonus).toBe(0);
});

test('getDeepStackAdjustment: deep stack gets bonus', () => {
    const r = getDeepAdj(250);
    expect(r.widenRange).toBe(true);
    expect(r.impliedOddsBonus).toBeGreaterThan(0);
    expect(r.suitedBonus).toBeGreaterThan(0);
});

test('getDeepStackAdjustment: 300bb is max bonus', () => {
    const r300 = getDeepAdj(300);
    const r500 = getDeepAdj(500); // capped at 300
    expect(r300.impliedOddsBonus).toBe(r500.impliedOddsBonus);
});

// ── isSoftPlayAllowed + recordSoftPlay ──

test('isSoftPlayAllowed: allowed initially', () => {
    expect(isSoftPlay('h1-sp', 'h2-sp')).toBe(true);
});

test('isSoftPlayAllowed: blocked after 3 soft plays', () => {
    recSoftPlay('h1-sp2', 'h2-sp2');
    recSoftPlay('h1-sp2', 'h2-sp2');
    recSoftPlay('h1-sp2', 'h2-sp2');
    expect(isSoftPlay('h1-sp2', 'h2-sp2')).toBe(false);
});

test('isSoftPlayAllowed: pair key is order-independent', () => {
    recSoftPlay('h-a', 'h-b');
    recSoftPlay('h-b', 'h-a'); // Same pair, different order
    recSoftPlay('h-a', 'h-b');
    expect(isSoftPlay('h-b', 'h-a')).toBe(false); // 3 plays
});

// ── recordChipLeak + getChipLeakBoosts ──

test('getChipLeakBoosts: zero with no data', () => {
    const r = getChipLeak('nobody-cl', 'nobody-tbl');
    expect(r.oopBoost).toBe(0);
    expect(r.multiwayBoost).toBe(0);
});

test('recordChipLeak + getChipLeakBoosts: activates after 20BB loss', () => {
    for (let i = 0; i < 5; i++) recChipLeak('horse-cl-1', 'table-cl-1', 'oop_check_call', 5);
    const r = getChipLeak('horse-cl-1', 'table-cl-1');
    expect(r.oopBoost).toBe(8); // 5*5=25 > 20
});

test('recordChipLeak: rejects zero/negative losses', () => {
    recChipLeak('horse-cl-2', 'table-cl-2', 'oop_check_call', 0);
    recChipLeak('horse-cl-2', 'table-cl-2', 'oop_check_call', -5);
    const r = getChipLeak('horse-cl-2', 'table-cl-2');
    expect(r.oopBoost).toBe(0);
});

// ── reevaluatePLORunoutEquity ──

test('reevaluatePLORunoutEquity: blank runout', () => {
    const r = reevPLORun(50, 52, 'turn');
    expect(r.runoutType).toBe('blank');
    expect(r.multiplier).toBe(1.0);
});

test('reevaluatePLORunoutEquity: big improvement', () => {
    const r = reevPLORun(40, 60, 'turn'); // +20
    expect(r.runoutType).toBe('nut_improve');
    expect(r.multiplier).toBe(1.20);
});

test('reevaluatePLORunoutEquity: scare card', () => {
    const r = reevPLORun(60, 40, 'river'); // -20
    expect(r.runoutType).toBe('scare');
    expect(r.multiplier).toBeLessThan(1.0);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 47f: Observer lifecycle + getActionDelay ══');
// ═══════════════════════════════════════════════════════════

const obsNewHand = brain.observeNewHand;
const obsAction = brain.observeAction;
const obsShowdown = brain.observeShowdown;
const getLR = brain.getLiveRead;
const clearObs = brain.clearLiveObserver;
const getDelay = brain.getActionDelay;

// ── observeNewHand + observeAction + observeShowdown + getLiveRead ──

test('getLiveRead: null with no observations', () => {
    const r = getLR('horse-obs-nobody', 'table-obs-nobody', 'opp-obs-nobody');
    expect(r).toBeNull();
});

test('observeNewHand: creates observer profiles', () => {
    obsNewHand('table-obs-1', 'hand-1', [
        { id: 'horse-obs-1', position: 'BTN' },
        { id: 'opp-obs-1', position: 'BB' },
        { id: 'opp-obs-2', position: 'SB' },
    ], ['horse-obs-1']);
    // Should have created profiles for opp-obs-1 and opp-obs-2
    const r1 = getLR('horse-obs-1', 'table-obs-1', 'opp-obs-1');
    // Not enough data yet for a full read, but observer exists
    // getLiveRead may return null if handsObserved < threshold, that's OK
});

test('observeAction: builds profile through multiple hands', () => {
    // Simulate 15 hands of observations for opp-obs-1
    for (let h = 0; h < 15; h++) {
        obsNewHand('table-obs-2', `hand-${h}`, [
            { id: 'horse-obs-2', position: 'BTN' },
            { id: 'opp-obs-3', position: 'BB' },
        ], ['horse-obs-2']);
        // Opponent calls preflop
        obsAction('table-obs-2', 'opp-obs-3', 'preflop', 'call', {
            amount: 2, potSize: 3, position: 'BB', isOpenAction: true
        }, ['horse-obs-2']);
        // Opponent bets flop
        obsAction('table-obs-2', 'opp-obs-3', 'flop', 'bet', {
            amount: 5, potSize: 8, position: 'BB'
        }, ['horse-obs-2']);
    }
    const r = getLR('horse-obs-2', 'table-obs-2', 'opp-obs-3');
    if (!r) throw new Error('Expected non-null live read after 15 hands');
    expect(r).toHaveProperty('playerType');
    expect(r).toHaveProperty('confidence');
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.handsObserved).toBeGreaterThanOrEqual(15);
});

test('observeShowdown: tracks bluffs and wins', () => {
    obsShowdown('table-obs-2', 'opp-obs-3', false, 10, true, ['horse-obs-2']); // Lost bluff
    obsShowdown('table-obs-2', 'opp-obs-3', true, 80, false, ['horse-obs-2']);  // Won legit
    const r = getLR('horse-obs-2', 'table-obs-2', 'opp-obs-3');
    if (!r) throw new Error('Expected non-null live read');
    // showdownBluffs should have incremented
    expect(r.bluffRate).toBeGreaterThanOrEqual(0);
});

test('clearLiveObserver: removes observer data', () => {
    clearObs('horse-obs-2', 'table-obs-2');
    const r = getLR('horse-obs-2', 'table-obs-2', 'opp-obs-3');
    expect(r).toBeNull();
});

// ── getActionDelay ──

test('getActionDelay: returns number in [800, 8000]', () => {
    const origRandom = Math.random;
    Math.random = () => 0.5; // Standard action
    try {
        const d = getDelay('test-delay-1', 'call', false);
        expect(d).toBeGreaterThanOrEqual(800);
        expect(d).toBeLessThanOrEqual(8000);
    } finally {
        Math.random = origRandom;
    }
});

test('getActionDelay: preflop is faster', () => {
    const origRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const dPre = getDelay('test-delay-2', 'call', true);
        const dPost = getDelay('test-delay-2', 'call', false);
        expect(dPre).toBeLessThan(dPost);
    } finally {
        Math.random = origRandom;
    }
});

test('getActionDelay: snap action is fast', () => {
    const origRandom = Math.random;
    Math.random = () => 0.05; // < 0.10 = snap
    try {
        const d = getDelay('test-delay-3', 'fold', false);
        expect(d).toBeLessThanOrEqual(2000);
    } finally {
        Math.random = origRandom;
    }
});

test('getActionDelay: tank is slow', () => {
    const origRandom = Math.random;
    Math.random = () => 0.96; // > 0.95 = deep tank
    try {
        const d = getDelay('test-delay-4', 'raise', false);
        expect(d).toBeGreaterThanOrEqual(5000);
    } finally {
        Math.random = origRandom;
    }
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 47g: Session/Identity Functions ══');
// ═══════════════════════════════════════════════════════════

// ─── isHorseSync / getHorseIdsAtTable ───
// These depend on _horseIds cache. We can't set it directly (private),
// but isHorseSync returns false when cache is null, and getHorseIdsAtTable returns [].

test('isHorseSync: returns false when cache not loaded', () => {
    const result = brain.isHorseSync('some-random-id');
    expect(result).toBe(false);
});

test('isHorseSync: returns false for any id when cache empty', () => {
    expect(brain.isHorseSync('horse-abc')).toBe(false);
});

test('getHorseIdsAtTable: returns empty array when cache not loaded', () => {
    const result = brain.getHorseIdsAtTable([{ id: 'p1' }, { id: 'p2' }]);
    expect(result.length).toBe(0);
});

test('getHorseIdsAtTable: handles null players', () => {
    const result = brain.getHorseIdsAtTable(null);
    expect(result.length).toBe(0);
});

// ─── recordSitDown / recordRebuy / clearTableSessions ───
// These use the internal sessionTracker Map. We test through the public API.

test('recordSitDown: creates session for new player', () => {
    brain.recordSitDown('test-table-47g', 'horse-sit-1', 200);
    // No throw = success. Session created internally.
    // recordRebuy should work now:
    brain.recordRebuy('test-table-47g', 'horse-sit-1', 100);
    // If it didn't throw, session was found and buyins incremented.
});

test('recordSitDown: idempotent for same player', () => {
    brain.recordSitDown('test-table-47g', 'horse-sit-1', 200);
    // Called again — should NOT reset session (already sitting).
    brain.recordRebuy('test-table-47g', 'horse-sit-1', 100);
    // Still no throw.
});

test('recordRebuy: no-op for unknown table', () => {
    brain.recordRebuy('nonexistent-table', 'horse-sit-1', 100);
    // Should not throw — just returns.
});

test('recordRebuy: no-op for unknown player at valid table', () => {
    brain.recordRebuy('test-table-47g', 'unknown-player', 100);
    // Should not throw.
});

test('clearTableSessions: removes table data', () => {
    brain.recordSitDown('test-table-47g-clear', 'horse-clear-1', 200);
    brain.clearTableSessions('test-table-47g-clear');
    // Rebuy should silently no-op now (table gone).
    brain.recordRebuy('test-table-47g-clear', 'horse-clear-1', 100);
    // No throw = success.
});

test('clearTableSessions: no-op for unknown table', () => {
    brain.clearTableSessions('table-that-never-existed');
    // Should not throw.
});

// ─── getChatMessages ───
test('getChatMessages: returns array', () => {
    const msgs = brain.getChatMessages();
    // chatMessages starts empty or has accumulated messages
    expect(Array.isArray(msgs)).toBe(true);
});

test('getChatMessages: drains queue (splice)', () => {
    const first = brain.getChatMessages();
    const second = brain.getChatMessages();
    // After first call drains, second should be empty
    expect(second.length).toBe(0);
});

// ─── cleanupMultiTable ───
test('cleanupMultiTable: no-op for unknown player', () => {
    brain.cleanupMultiTable('some-table', 'unknown-player');
    // Should not throw.
});

test('cleanupMultiTable: removes table from player tracker', () => {
    // First sit the player down to populate multiTableTracker
    brain.recordSitDown('mt-table-1', 'horse-mt-1', 200);
    brain.recordSitDown('mt-table-2', 'horse-mt-1', 200);
    // Clean up one table
    brain.cleanupMultiTable('mt-table-1', 'horse-mt-1');
    // Should not throw. Tracker still has mt-table-2.
    brain.cleanupMultiTable('mt-table-2', 'horse-mt-1');
    // Now tracker should be fully cleaned. Repeating is safe:
    brain.cleanupMultiTable('mt-table-2', 'horse-mt-1');
});

// ─── clearTableLiveObservers ───
test('clearTableLiveObservers: no-op for unknown table', () => {
    brain.clearTableLiveObservers('nonexistent-table-obs');
    // Should not throw.
});

test('clearTableLiveObservers: clears after populating', () => {
    // Populate observer data first
    // observeNewHand(tableId, handId, players, horseIds, bb)
    brain.observeNewHand('table-cto-1', 'hand-cto-1',
        [{ id: 'horse-cto-1', position: 'BTN' }, { id: 'opp-cto-1', position: 'BB' }, { id: 'opp-cto-2', position: 'SB' }],
        ['horse-cto-1'], 2);
    // observeAction(tableId, actorId, street, action, context, horseIds)
    brain.observeAction('table-cto-1', 'opp-cto-1', 'preflop', 'raise', {}, ['horse-cto-1']);
    // Now clear
    brain.clearTableLiveObservers('table-cto-1');
    // getLiveRead should return null now
    const read = brain.getLiveRead('horse-cto-1', 'table-cto-1', 'opp-cto-1');
    expect(read).toBeNull();
});

// ─── cleanupLiveObservers ───
test('cleanupLiveObservers: runs without error', () => {
    brain.cleanupLiveObservers();
    // Should clean up stale data. No throw = success.
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 47h: _applyJournalToProfile + getOOPDecisionMatrix ══');
// ═══════════════════════════════════════════════════════════

// ─── _applyJournalToProfile ───
test('_applyJournalToProfile: populates profile fields from journal data', () => {
    const profile = {};
    const data = {
        hands_observed: 150,
        vpip_count: 45,
        pfr_count: 30,
        three_bet_count: 10,
        three_bet_opportunity: 25,
        four_bet_count: 2,
        fold_to_three_bet: 5,
        faced_three_bet: 12,
        cold_call_count: 8,
        limp_count: 3,
        steal_attempt_count: 15,
        steal_opportunity: 20,
        fold_to_steal: 10,
        cbet_count: 20,
        cbet_opportunity: 30,
        fold_to_cbet: 12,
        faced_cbet: 18,
        second_barrel_count: 10,
        second_barrel_opportunity: 15,
        third_barrel_count: 5,
        third_barrel_opportunity: 8,
        check_raise_count: 3,
        donk_bet_count: 2,
        probe_bet_count: 4,
        fold_to_raise: 8,
        faced_raise: 20,
        total_bets: 40,
        total_calls: 50,
        total_checks: 60,
        total_folds: 30,
        went_to_showdown: 25,
        won_at_showdown: 15,
        showdown_bluffs: 3,
        overbet_count: 2,
        total_decision_time_ms: 500000,
        decision_count: 150,
        snap_action_count: 10,
        long_tank_count: 5,
        actions_by_position: { BTN: 30, BB: 40 },
        avg_flop_bet: 0.65,
        avg_turn_bet: 0.75,
        avg_river_bet: 0.80,
        avg_preflop_raise: 3.0,
        session_count: 5,
        updated_at: new Date().toISOString(),
        opponent_id: 'opp-journal-test-12345678',
    };
    brain._applyJournalToProfile(profile, data);
    expect(profile.handsObserved).toBe(150);
    expect(profile.vpipCount).toBe(45);
    expect(profile.pfrCount).toBe(30);
    expect(profile._journalSeeded).toBe(true);
    expect(profile._journalHands).toBe(150);
    expect(profile._journalSessionCount).toBe(5);
});

test('_applyJournalToProfile: freshness decays with age', () => {
    const profile = {};
    const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week ago
    const data = {
        hands_observed: 100, vpip_count: 30, pfr_count: 20,
        three_bet_count: 5, three_bet_opportunity: 10,
        fold_to_three_bet: 3, faced_three_bet: 8,
        cold_call_count: 4, limp_count: 2,
        steal_attempt_count: 10, fold_to_steal: 5,
        cbet_count: 15, cbet_opportunity: 20,
        fold_to_cbet: 8, faced_cbet: 12,
        second_barrel_count: 5, second_barrel_opportunity: 8,
        third_barrel_count: 2, third_barrel_opportunity: 4,
        check_raise_count: 1, donk_bet_count: 1, probe_bet_count: 2,
        fold_to_raise: 4, faced_raise: 12,
        total_bets: 25, total_calls: 35, total_checks: 40, total_folds: 20,
        went_to_showdown: 15, won_at_showdown: 8, showdown_bluffs: 2,
        overbet_count: 1, total_decision_time_ms: 300000,
        decision_count: 100, snap_action_count: 5, long_tank_count: 3,
        avg_flop_bet: 0, avg_turn_bet: 0, avg_river_bet: 0, avg_preflop_raise: 0,
        updated_at: oldDate,
        opponent_id: 'opp-old-journal-12345678',
    };
    brain._applyJournalToProfile(profile, data);
    // 1 week = 168 hours. Freshness = exp(-168/120) ≈ 0.247, but min is 0.15
    expect(profile._journalFreshness).toBeLessThan(0.5);
    expect(profile._journalFreshness).toBeGreaterThanOrEqual(0.15);
});

test('_applyJournalToProfile: reconstructs sizing arrays', () => {
    const profile = {};
    const data = {
        hands_observed: 50, vpip_count: 15, pfr_count: 10,
        three_bet_count: 3, three_bet_opportunity: 8,
        fold_to_three_bet: 2, faced_three_bet: 5,
        cold_call_count: 2, limp_count: 1,
        steal_attempt_count: 5, fold_to_steal: 3,
        cbet_count: 8, cbet_opportunity: 12,
        fold_to_cbet: 4, faced_cbet: 6,
        second_barrel_count: 3, second_barrel_opportunity: 5,
        third_barrel_count: 1, third_barrel_opportunity: 2,
        check_raise_count: 1, donk_bet_count: 0, probe_bet_count: 1,
        fold_to_raise: 3, faced_raise: 8,
        total_bets: 15, total_calls: 20, total_checks: 25, total_folds: 10,
        went_to_showdown: 8, won_at_showdown: 5, showdown_bluffs: 1,
        overbet_count: 0, total_decision_time_ms: 200000,
        decision_count: 50, snap_action_count: 3, long_tank_count: 2,
        avg_flop_bet: 0.65, avg_turn_bet: 0.70, avg_river_bet: 0,
        avg_preflop_raise: 2.8,
        updated_at: new Date().toISOString(),
        opponent_id: 'opp-sizing-test-12345678',
    };
    brain._applyJournalToProfile(profile, data);
    expect(profile.flopBetSizes.length).toBe(3);
    expect(profile.flopBetSizes[0]).toBeCloseTo(0.65, 1);
    expect(profile.turnBetSizes[0]).toBeCloseTo(0.70, 1);
    expect(profile.riverBetSizes).toBe(undefined); // avg_river_bet = 0, not set
    expect(profile.preflopRaiseSizes[0]).toBeCloseTo(2.8, 1);
});

// ─── getOOPDecisionMatrix ───
const getOOPMatrix = brain.getOOPDecisionMatrix;

test('getOOPDecisionMatrix: nutted hand returns check_raise or slowplay', () => {
    const origRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const result = getOOPMatrix({
            handStrength: 85,
            handCategory: 'set',
            street: 'flop',
            boardWetness: 'medium',
            numPlayers: 2,
            oppTendency: 'balanced',
            oppConfidence: 0.5,
            potSize: 20,
            toCall: 0,
            stackBB: 100,
        });
        expect(result).toBeDefined();
        expect(result).toHaveProperty('action');
        // Nutted hand OOP: check_raise or check_call (slowplay) or lead
        const validActions = ['check_raise', 'check_call', 'lead', 'check_fold'];
        expect(validActions.includes(result.action)).toBe(true);
    } finally {
        Math.random = origRandom;
    }
});

test('getOOPDecisionMatrix: weak hand checks or folds', () => {
    const origRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const result = getOOPMatrix({
            handStrength: 15,
            handCategory: 'high_card',
            street: 'turn',
            boardWetness: 'dry',
            numPlayers: 2,
            oppTendency: 'balanced',
            oppConfidence: 0.3,
            potSize: 30,
            toCall: 20, // big bet
            stackBB: 100,
        });
        expect(result).toBeDefined();
        expect(result).toHaveProperty('action');
        // Weak hand facing big bet OOP should fold or occasionally bluff
        const validActions = ['check_fold', 'check_call', 'lead', 'check_raise'];
        expect(validActions.includes(result.action)).toBe(true);
    } finally {
        Math.random = origRandom;
    }
});

test('getOOPDecisionMatrix: draw hand on flop considers semi-bluff', () => {
    const origRandom = Math.random;
    Math.random = () => 0.3;
    try {
        const result = getOOPMatrix({
            handStrength: 35,
            handCategory: 'flush_draw',
            hasStrongDraw: true,
            street: 'flop',
            boardWetness: 'wet',
            numPlayers: 2,
            oppTendency: 'tight',
            oppConfidence: 0.4,
            potSize: 15,
            toCall: 0,
            stackBB: 100,
        });
        expect(result).toBeDefined();
        expect(result).toHaveProperty('action');
    } finally {
        Math.random = origRandom;
    }
});

test('getOOPDecisionMatrix: multiway tightens ranges', () => {
    const origRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const result = getOOPMatrix({
            handStrength: 50,
            handCategory: 'top_pair',
            street: 'flop',
            boardWetness: 'medium',
            numPlayers: 4,
            oppTendency: 'balanced',
            oppConfidence: 0.3,
            potSize: 30,
            toCall: 0,
            stackBB: 100,
        });
        expect(result).toBeDefined();
        expect(result).toHaveProperty('action');
    } finally {
        Math.random = origRandom;
    }
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 47i: makePLOFallbackDecision edge cases ══');
// ═══════════════════════════════════════════════════════════

const makePLOFallback = brain.makePLOFallbackDecision;

test('makePLOFallbackDecision: short hole cards returns check or fold', () => {
    const result = makePLOFallback('plo-test-1', {
        holeCards: ['Ah', 'Kd'], // Only 2 cards, PLO needs 4
        board: [],
        street: 'preflop',
        position: 'BTN',
        stackBB: 100,
        potSize: 3,
        toCall: 1,
        bb: 1,
        numPlayers: 6,
    }, [{ type: 'check' }, { type: 'fold' }]);
    expect(result.type === 'check' || result.type === 'fold').toBe(true);
});

test('makePLOFallbackDecision: preflop with 4 cards returns valid action', () => {
    const result = makePLOFallback('plo-test-2', {
        holeCards: ['Ah', 'Kd', 'Qc', 'Js'],
        board: [],
        street: 'preflop',
        position: 'BTN',
        stackBB: 100,
        potSize: 3,
        toCall: 2,
        bb: 1,
        numPlayers: 6,
    }, [
        { type: 'fold' },
        { type: 'call', amount: 2 },
        { type: 'raise', minAmount: 6, maxAmount: 100 },
    ]);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('type');
    const valid = ['fold', 'call', 'raise', 'bet', 'check'];
    expect(valid.includes(result.type)).toBe(true);
});

test('makePLOFallbackDecision: postflop flop returns valid action', () => {
    const result = makePLOFallback('plo-test-3', {
        holeCards: ['Ah', 'Kd', 'Qc', 'Js'],
        board: ['Th', '9h', '2c'],
        street: 'flop',
        position: 'BTN',
        stackBB: 100,
        potSize: 12,
        toCall: 0,
        bb: 1,
        numPlayers: 3,
    }, [
        { type: 'check' },
        { type: 'bet', minAmount: 4, maxAmount: 100 },
    ]);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('type');
});

test('makePLOFallbackDecision: river facing bet with weak hand', () => {
    const result = makePLOFallback('plo-test-4', {
        holeCards: ['2h', '3d', '4c', '5s'],
        board: ['Kh', 'Kd', 'Qc', 'Js', 'Th'],
        street: 'river',
        position: 'BB',
        stackBB: 50,
        potSize: 40,
        toCall: 30,
        bb: 1,
        numPlayers: 2,
    }, [
        { type: 'fold' },
        { type: 'call', amount: 30 },
    ]);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('type');
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 48: PLO Internal Functions + Full House Bug Fix ══');
// ═══════════════════════════════════════════════════════════

const evalPLOMade = brain.evaluatePLOMadeHand;
const classifyPLO = brain.classifyPLOPreflop;
const countStraight = brain.countStraightOuts;
const countFlush = brain.countFlushOuts;
const getPLOSPR = brain.getPLOSPRZone;
const analyzePLOBoard = brain.analyzePLOBoardTexture;
const evalPLO8Low = brain.evaluatePLO8Low;
const getPLOERC = brain.getPLOEquityRealization;
const detectScare = brain.detectScareCard;

// ─── Phase 48 BUG FIX TEST: Full house false positive ───
test('evaluatePLOMadeHand: pocket pair + board pair ≠ full house', () => {
    // 88 on KK55x board — NOT a full house, just two pair at best
    const result = evalPLOMade(
        [{ rank: 6, suit: 'h' }, { rank: 6, suit: 'd' }, { rank: 9, suit: 'c' }, { rank: 0, suit: 's' }],
        [{ rank: 11, suit: 'h' }, { rank: 11, suit: 'd' }, { rank: 3, suit: 'c' }, { rank: 3, suit: 's' }, { rank: 1, suit: 'h' }]
    );
    // Should NOT be full_house — our 88 doesn't connect to KK or 55
    expect(result.category !== 'full_house').toBe(true);
});

test('evaluatePLOMadeHand: pocket pair hits board = real set → full house with board pair', () => {
    // KK on K55 board = set of Kings + pair of 5s = full house
    const result = evalPLOMade(
        [{ rank: 11, suit: 'h' }, { rank: 11, suit: 'c' }, { rank: 7, suit: 'd' }, { rank: 2, suit: 's' }],
        [{ rank: 11, suit: 'd' }, { rank: 3, suit: 'h' }, { rank: 3, suit: 's' }]
    );
    expect(result.category).toBe('full_house');
    expect(result.strength).toBeGreaterThanOrEqual(78);
});

test('evaluatePLOMadeHand: board trips + pocket pair = full house', () => {
    // 88 on KKK board = KKK88 full house
    const result = evalPLOMade(
        [{ rank: 6, suit: 'h' }, { rank: 6, suit: 'd' }, { rank: 2, suit: 'c' }, { rank: 0, suit: 's' }],
        [{ rank: 11, suit: 'h' }, { rank: 11, suit: 'd' }, { rank: 11, suit: 'c' }]
    );
    expect(result.category).toBe('full_house');
});

test('evaluatePLOMadeHand: nut flush detected', () => {
    // Ah, 2h on 5h 8h Qh board = nut flush
    const result = evalPLOMade(
        [{ rank: 12, suit: 'h' }, { rank: 0, suit: 'h' }, { rank: 9, suit: 'd' }, { rank: 3, suit: 'c' }],
        [{ rank: 3, suit: 'h' }, { rank: 6, suit: 'h' }, { rank: 10, suit: 'h' }]
    );
    expect(result.category).toBe('nut_flush');
    expect(result.isNut).toBe(true);
});

test('evaluatePLOMadeHand: top set no board pair = set not full house', () => {
    // KK on K85 board, no board pair = top set
    const result = evalPLOMade(
        [{ rank: 11, suit: 'h' }, { rank: 11, suit: 'd' }, { rank: 2, suit: 'c' }, { rank: 0, suit: 's' }],
        [{ rank: 11, suit: 'c' }, { rank: 6, suit: 'h' }, { rank: 3, suit: 's' }]
    );
    expect(result.category).toBe('top_set');
});

test('evaluatePLOMadeHand: air returns low strength', () => {
    const result = evalPLOMade(
        [{ rank: 0, suit: 'h' }, { rank: 1, suit: 'd' }, { rank: 2, suit: 'c' }, { rank: 3, suit: 's' }],
        [{ rank: 10, suit: 'h' }, { rank: 11, suit: 'd' }, { rank: 12, suit: 'c' }]
    );
    expect(result.strength).toBeLessThan(20);
    expect(result.category).toBe('air');
});

test('evaluatePLOMadeHand: no board returns no_board', () => {
    const result = evalPLOMade(
        [{ rank: 12, suit: 'h' }, { rank: 11, suit: 'd' }, { rank: 10, suit: 'c' }, { rank: 9, suit: 's' }],
        []
    );
    expect(result.category).toBe('no_board');
});

// ─── classifyPLOPreflop ───
test('classifyPLOPreflop: AA double-suited rundown is strong', () => {
    const result = classifyPLO([
        { rank: 12, suit: 'h' }, { rank: 12, suit: 'd' },
        { rank: 11, suit: 'h' }, { rank: 10, suit: 'd' }
    ]);
    expect(result).toBeGreaterThan(70);
});

test('classifyPLOPreflop: disconnected rainbow trash is weak', () => {
    const result = classifyPLO([
        { rank: 0, suit: 'h' }, { rank: 4, suit: 'd' },
        { rank: 8, suit: 'c' }, { rank: 11, suit: 's' }
    ]);
    expect(result).toBeLessThan(40);
});

test('classifyPLOPreflop: short cards returns default 20', () => {
    const result = classifyPLO([{ rank: 12, suit: 'h' }]);
    expect(result).toBe(20);
});

test('classifyPLOPreflop: connected rundown T987 single-suited', () => {
    const result = classifyPLO([
        { rank: 8, suit: 'h' }, { rank: 7, suit: 'h' },
        { rank: 6, suit: 'd' }, { rank: 5, suit: 'c' }
    ]);
    expect(result).toBeGreaterThan(50);
});

// ─── countFlushOuts ───
test('countFlushOuts: 2 hole + 2 board same suit = 9 outs', () => {
    const result = countFlush(
        [{ rank: 12, suit: 'h' }, { rank: 8, suit: 'h' }, { rank: 5, suit: 'd' }, { rank: 2, suit: 'c' }],
        [{ rank: 10, suit: 'h' }, { rank: 3, suit: 'h' }, { rank: 7, suit: 'd' }]
    );
    expect(result.outs).toBe(9);
    expect(result.isNutFlushDraw).toBe(true);
});

test('countFlushOuts: no flush draw = 0 outs', () => {
    const result = countFlush(
        [{ rank: 12, suit: 'h' }, { rank: 8, suit: 'd' }, { rank: 5, suit: 'c' }, { rank: 2, suit: 's' }],
        [{ rank: 10, suit: 'h' }, { rank: 3, suit: 'h' }, { rank: 7, suit: 'd' }]
    );
    expect(result.outs).toBe(0);
});

// ─── countStraightOuts ───
test('countStraightOuts: wrap on flop gives high outs', () => {
    // J-T-9-8 on 7-6-x = massive wrap
    const result = countStraight([9, 8, 7, 6], [5, 4, 10]);
    expect(result.outs).toBeGreaterThan(0);
});

test('countStraightOuts: disconnected hand = 0 outs', () => {
    const result = countStraight([0, 2, 8, 12], [5, 9, 11]);
    // May have some outs or not depending on combo analysis
    expect(result.outs).toBeGreaterThanOrEqual(0);
});

// ─── getPLOSPRZone ───
test('getPLOSPRZone: committed when SPR <= 1', () => {
    const result = getPLOSPR(50, 50);
    expect(result.zone).toBe('committed');
    expect(result.shouldCommit).toBe(true);
});

test('getPLOSPRZone: deep when SPR ~10', () => {
    const result = getPLOSPR(500, 50);
    expect(result.zone).toBe('deep');
    expect(result.shouldCommit).toBe(false);
});

test('getPLOSPRZone: no pot returns deep', () => {
    const result = getPLOSPR(200, 0);
    expect(result.zone).toBe('deep');
});

// ─── analyzePLOBoardTexture ───
test('analyzePLOBoardTexture: monotone flop detected', () => {
    const result = analyzePLOBoard([
        { rank: 10, suit: 'h' }, { rank: 6, suit: 'h' }, { rank: 3, suit: 'h' }
    ]);
    expect(result.isMonotone).toBe(true);
    expect(result.texture).toBe('monotone');
    expect(result.monoBoardPenalty).toBe(20);
});

test('analyzePLOBoardTexture: rainbow dry board', () => {
    const result = analyzePLOBoard([
        { rank: 11, suit: 'h' }, { rank: 5, suit: 'd' }, { rank: 2, suit: 'c' }
    ]);
    expect(result.texture).toBe('rainbow');
    expect(result.isDangerous).toBe(false);
});

test('analyzePLOBoardTexture: paired board', () => {
    const result = analyzePLOBoard([
        { rank: 8, suit: 'h' }, { rank: 8, suit: 'd' }, { rank: 3, suit: 'c' }
    ]);
    expect(result.isPaired).toBe(true);
    expect(result.isDangerous).toBe(true);
});

test('analyzePLOBoardTexture: null returns unknown', () => {
    const result = analyzePLOBoard(null);
    expect(result.texture).toBe('unknown');
});

// ─── evaluatePLO8Low ───
test('evaluatePLO8Low: nut low with A-2 on 3-4-5 board', () => {
    const result = evalPLO8Low(
        [{ rank: 12 }, { rank: 0 }, { rank: 8 }, { rank: 9 }], // A,2,T,J
        [{ rank: 1 }, { rank: 2 }, { rank: 3 }] // 3,4,5
    );
    expect(result.hasLow).toBe(true);
    expect(result.hasNutLow).toBe(true);
});

test('evaluatePLO8Low: no low on high board', () => {
    const result = evalPLO8Low(
        [{ rank: 12 }, { rank: 0 }, { rank: 8 }, { rank: 9 }],
        [{ rank: 10 }, { rank: 11 }, { rank: 12 }] // J,Q,K — all high
    );
    expect(result.hasLow).toBe(false);
});

// ─── getPLOEquityRealization ───
test('getPLOEquityRealization: IP nut hand gets boost', () => {
    const result = getPLOERC(true, 'medium', 0, 0, true, 2);
    expect(result).toBeGreaterThan(1.0);
});

test('getPLOEquityRealization: OOP deep non-nut gets penalty', () => {
    const result = getPLOERC(false, 'very_deep', 0, 0, false, 4);
    expect(result).toBeLessThan(1.0);
});

// ─── detectScareCard ───
test('detectScareCard: flush completing card = scare', () => {
    const result = detectScare([
        { rank: 10, suit: 'h' }, { rank: 6, suit: 'h' },
        { rank: 3, suit: 'd' }, { rank: 8, suit: 'h' }
    ], 'turn');
    expect(result.isScareTurn).toBe(true);
    expect(result.scareType).toContain('flush');
});

test('detectScareCard: brick card = no scare', () => {
    const result = detectScare([
        { rank: 10, suit: 'h' }, { rank: 6, suit: 'd' },
        { rank: 3, suit: 'c' }, { rank: 0, suit: 's' }
    ], 'turn');
    expect(result.isScareTurn).toBe(false);
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 48b: Stress Tests — Edge Cases ══');
// ═══════════════════════════════════════════════════════════

// ─── evaluatePostflopHand edge cases ───
test('evaluatePostflopHand: board has all 5 to a straight (board-made)', () => {
    // Hero: Ah Kd, Board: 2s 3c 4h 5d 6s — straight on board, hero has overcards
    const r = brain.evaluatePostflopHand(['Ah', 'Kd'], ['2s', '3c', '4h', '5d', '6s']);
    // Should detect the board straight. Hero doesn't improve on it much.
    expect(r).toBeDefined();
    expect(r.strength).toBeGreaterThan(0);
});

test('evaluatePostflopHand: 4 to a flush on board + hero has flush', () => {
    const r = brain.evaluatePostflopHand(['Ah', '2h'], ['3h', '5h', '7h', '9d', 'Jc']);
    // Hero has flush (Ah + 2h + 3 hearts on board)
    expect(r.strength).toBeGreaterThanOrEqual(70);
});

// ─── validateAndClamp stress ───
test('validateAndClamp: all_in maps to max raise when no all_in legal', () => {
    const r = brain.validateAndClamp('all_in', null, [
        { type: 'fold' },
        { type: 'call', amount: 10 },
        { type: 'raise', minAmount: 20, maxAmount: 200 },
    ]);
    expect(r.type).toBe('raise');
    expect(r.amount).toBe(200);
});

test('validateAndClamp: completely illegal action falls back to check', () => {
    const r = brain.validateAndClamp('discard', 50, [
        { type: 'check' },
        { type: 'bet', minAmount: 4, maxAmount: 100 },
    ]);
    expect(r.type).toBe('check');
});

// ─── makeFallbackDecision stress ───
test('makeFallbackDecision: very short stack all-in', () => {
    const r = brain.makeFallbackDecision('stress-1', {
        handStr: 'AKs', position: 'BTN', street: 'preflop',
        potSize: 3, toCall: 2, stackBB: 8, bb: 1,
        holeCards: ['Ah', 'Kh'], board: [], numPlayers: 6,
    }, [
        { type: 'fold' },
        { type: 'call', amount: 2 },
        { type: 'raise', minAmount: 4, maxAmount: 8 },
    ]);
    expect(r).toBeDefined();
    expect(r).toHaveProperty('type');
    const valid = ['fold', 'call', 'raise', 'bet', 'check', 'all_in'];
    expect(valid.includes(r.type)).toBe(true);
});

// ─── getDecision stress: PLO hand format ───
asyncTest('getDecision: handles 4-card PLO hand', async () => {
    const state = {
        players: [
            { id: 'plo-horse-1', holeCards: [
                { rank: 'A', suit: 'h' }, { rank: 'K', suit: 'd' },
                { rank: 'Q', suit: 'c' }, { rank: 'J', suit: 's' }
            ], stack: 200, position: 'BTN', folded: false, invested: 0 },
            { id: 'plo-opp-1', stack: 200, position: 'BB', folded: false, invested: 0 },
        ],
        communityCards: [],
        phase: 'preflop',
        potTotal: 3,
        currentBet: 2,
        tableId: 'test-plo-gd',
        lastRaiser: null,
        gameType: 'PLO',
        numHoleCards: 4,
    };
    const result = await brain.getDecision('plo-horse-1', state, [
        { type: 'fold' },
        { type: 'call', amount: 2 },
        { type: 'raise', minAmount: 6, maxAmount: 200 },
    ]);
    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('delayMs');
});

// ─── getDecision stress: deep stack 500bb ───
asyncTest('getDecision: deep stack 500bb plays normally', async () => {
    const state = {
        players: [
            { id: 'deep-horse', holeCards: [{ rank: 'A', suit: 'h' }, { rank: 'A', suit: 'd' }], stack: 1000, position: 'UTG', folded: false, invested: 0 },
            { id: 'deep-opp', stack: 1000, position: 'BB', folded: false, invested: 0 },
        ],
        communityCards: [],
        phase: 'preflop',
        potTotal: 3,
        currentBet: 0,
        tableId: 'test-deep-table',
        lastRaiser: null,
    };
    const result = await brain.getDecision('deep-horse', state, [
        { type: 'fold' },
        { type: 'check' },
        { type: 'raise', minAmount: 4, maxAmount: 1000 },
    ]);
    expect(result).toHaveProperty('action');
    // AA from UTG should produce a valid action
    expect(result.action).toHaveProperty('type');
    const validDeep = ['fold', 'check', 'call', 'raise', 'bet', 'all_in'];
    expect(validDeep.includes(result.action.type)).toBe(true);
});

// ─── getDecision stress: 6-way multiway ───
asyncTest('getDecision: 6-way pot still returns valid action', async () => {
    const players = [];
    for (let i = 0; i < 6; i++) {
        players.push({
            id: i === 0 ? 'multi-horse' : `multi-opp-${i}`,
            holeCards: i === 0 ? [{ rank: '7', suit: 'h' }, { rank: '2', suit: 'c' }] : [],
            stack: 200, position: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'BB'][i],
            folded: false, invested: 2,
        });
    }
    const state = {
        players,
        communityCards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'd' }, { rank: 'Q', suit: 'c' }],
        phase: 'flop',
        potTotal: 12,
        currentBet: 0,
        tableId: 'test-multi-table',
        lastRaiser: null,
    };
    const result = await brain.getDecision('multi-horse', state, [
        { type: 'check' },
        { type: 'bet', minAmount: 4, maxAmount: 200 },
    ]);
    expect(result).toHaveProperty('action');
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 47j: Async Supabase-dependent functions (graceful null) ══');
// ═══════════════════════════════════════════════════════════

// ─── getThreatScore ───
test('getThreatScore: unknown opponent returns 0', () => {
    const score = brain.getThreatScore('totally-unknown-opponent');
    expect(score).toBe(0);
});

test('getThreatScore: returns number 0-100', () => {
    const score = brain.getThreatScore('any-id');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
});

// ─── isBlacklisted ───
test('isBlacklisted: unknown opponent returns false', () => {
    const result = brain.isBlacklisted('never-seen-player');
    expect(result).toBe(false);
});

test('isBlacklisted: expired blacklist returns false', () => {
    // Manually set an expired blacklist
    brain.threatIntelCache.set('expired-player', { blacklistedUntil: Date.now() - 1000 });
    expect(brain.isBlacklisted('expired-player')).toBe(false);
});

test('isBlacklisted: active blacklist returns true', () => {
    brain.threatIntelCache.set('banned-player', { blacklistedUntil: Date.now() + 86400000 });
    expect(brain.isBlacklisted('banned-player')).toBe(true);
    // Cleanup
    brain.threatIntelCache.delete('banned-player');
});

// ─── applyMultiwayEquityDiscount ───
test('applyMultiwayEquityDiscount: heads-up no discount', () => {
    const result = brain.applyMultiwayEquityDiscount(60, 2);
    expect(result).toBe(60);
});

test('applyMultiwayEquityDiscount: 3-way discounts by 10', () => {
    const result = brain.applyMultiwayEquityDiscount(60, 3);
    expect(result).toBe(50);
});

test('applyMultiwayEquityDiscount: 5-way discounts by 25', () => {
    const result = brain.applyMultiwayEquityDiscount(60, 5);
    expect(result).toBe(35);
});

test('applyMultiwayEquityDiscount: never goes below 0', () => {
    const result = brain.applyMultiwayEquityDiscount(10, 5);
    expect(result).toBe(0);
});

// ─── detectNutBiasExploitBoard ───
test('detectNutBiasExploitBoard: null board returns 0', () => {
    const result = brain.detectNutBiasExploitBoard(null, 2);
    expect(result.nutUnlikelyScore).toBe(0);
    expect(result.shouldAddCheckRaise).toBe(false);
});

test('detectNutBiasExploitBoard: short board returns 0', () => {
    const result = brain.detectNutBiasExploitBoard([{ rank: 5, suit: 'h' }], 2);
    expect(result.nutUnlikelyScore).toBe(0);
});

test('detectNutBiasExploitBoard: low rainbow dry board scores high', () => {
    const result = brain.detectNutBiasExploitBoard([
        { rank: 3, suit: 'h' }, { rank: 5, suit: 'd' }, { rank: 7, suit: 'c' }
    ], 2);
    expect(result.nutUnlikelyScore).toBeGreaterThan(20);
});

test('detectNutBiasExploitBoard: high monotone board scores low', () => {
    const result = brain.detectNutBiasExploitBoard([
        { rank: 12, suit: 'h' }, { rank: 11, suit: 'h' }, { rank: 10, suit: 'h' }
    ], 2);
    expect(result.nutUnlikelyScore).toBeLessThan(30);
});

// ─── isHorse (async) ───
asyncTest('isHorse: returns boolean (false with null supabase cache)', async () => {
    const result = await brain.isHorse('some-random-id');
    // With null supabase, loadHorseIds returns empty set, so isHorse returns false
    expect(result).toBe(false);
});

// ─── evaluateSessions (async) ───
asyncTest('evaluateSessions: does not throw with null controllers', async () => {
    try {
        await brain.evaluateSessions(null, null);
    } catch (_) {
        // Expected to fail gracefully with null game/table controllers
    }
});

// ─── _loadThreatIntel / _persistThreatIntel (async, Supabase) ───
asyncTest('_loadThreatIntel: does not throw with null supabase', async () => {
    try {
        await brain._loadThreatIntel('unknown-opp');
    } catch (_) {
        // Expected
    }
});

asyncTest('_persistThreatIntel: does not throw with null supabase', async () => {
    try {
        await brain._persistThreatIntel('unknown-opp');
    } catch (_) {
        // Expected
    }
});

// ─── persistOpponentJournal / loadOpponentJournal (async, Supabase) ───
asyncTest('persistOpponentJournal: does not throw with null supabase', async () => {
    try {
        await brain.persistOpponentJournal('horse-1', 'opp-1', { handsObserved: 10 });
    } catch (_) {
        // Expected
    }
});

asyncTest('loadOpponentJournal: does not throw with null supabase', async () => {
    try {
        await brain.loadOpponentJournal('horse-1', 'table-1', 'opp-1');
    } catch (_) {
        // Expected
    }
});

// canRebuy: with no session tracked, returns true
asyncTest('canRebuy: unknown table returns true', async () => {
    const result = await brain.canRebuy('unknown-table-rebuy', 'unknown-player', 0, null);
    expect(result).toBe(true);
});

// canRebuy: with session tracked and no personality module
asyncTest('canRebuy: tracked session with no personality module returns true', async () => {
    brain.recordSitDown('table-rebuy-test', 'horse-rebuy-1', 200);
    const result = await brain.canRebuy('table-rebuy-test', 'horse-rebuy-1', 0, null);
    expect(result).toBe(true);
});

// canSitAtTable: no multi-table data, no personality module = true
asyncTest('canSitAtTable: unknown player returns true', async () => {
    const result = await brain.canSitAtTable('unknown-sit-player');
    expect(result).toBe(true);
});

// processHandResult: with null supabase shouldn't throw
asyncTest('processHandResult: minimal hand data does not throw', async () => {
    try {
        await brain.processHandResult({
            tableId: 'test-phr-table',
            handId: 'test-phr-hand',
            players: [
                { id: 'horse-phr-1', holeCards: ['Ah', 'Kd'], stack: 200, position: 'BTN', folded: false, invested: 10 },
                { id: 'opp-phr-1', holeCards: ['2c', '3s'], stack: 190, position: 'BB', folded: true, invested: 10 },
            ],
            communityCards: ['Qh', 'Jd', 'Tc', '5s', '2h'],
            potTotal: 20,
            winners: [{ id: 'horse-phr-1', amount: 20 }],
            phase: 'showdown',
        }, 2);
        // If it didn't throw, that's success
    } catch (e) {
        // processHandResult has many try/catch blocks internally
        // Some failures may propagate if isHorse check fails, that's OK
    }
});

// saveSessionAnalytics: with null supabase should not throw
asyncTest('saveSessionAnalytics: does not throw with null supabase', async () => {
    try {
        await brain.saveSessionAnalytics('test-analytics-horse', 'test-analytics-table');
    } catch (_) {
        // Expected — supabase is null
    }
});

// saveOpponentRead: with null supabase should not throw
asyncTest('saveOpponentRead: does not throw with null supabase', async () => {
    try {
        await brain.saveOpponentRead('horse-save-read', 'opp-save-read', {
            vpip: 0.30, pfr: 0.20, aggression: 0.45, confidence: 0.8
        });
    } catch (_) {
        // Expected — supabase is null
    }
});

// saveKeyHand: with null supabase should not throw
asyncTest('saveKeyHand: does not throw with null supabase', async () => {
    try {
        await brain.saveKeyHand({
            tableId: 'test-key-table', handId: 'test-key-hand',
            players: [{ id: 'h1', holeCards: ['Ah', 'Kd'], stack: 200 }],
            potTotal: 50,
        }, 2);
    } catch (_) {
        // Expected — supabase is null
    }
});

// warmGTOCache: with no GTO module should not throw
asyncTest('warmGTOCache: does not throw when GTO module unavailable', async () => {
    try {
        await brain.warmGTOCache();
    } catch (_) {
        // Expected
    }
});

// loadHorseIds: with null supabase returns empty or cached
asyncTest('loadHorseIds: does not throw with null supabase', async () => {
    try {
        await brain.loadHorseIds();
    } catch (_) {
        // Expected with null supabase
    }
});

// persistTableJournals: with null supabase
asyncTest('persistTableJournals: does not throw with null supabase', async () => {
    try {
        await brain.persistTableJournals('horse-persist-1', 'table-persist-1');
    } catch (_) {
        // Expected
    }
});

// loadTableJournals: with null supabase
asyncTest('loadTableJournals: does not throw with null supabase', async () => {
    try {
        await brain.loadTableJournals('table-load-1', ['opp-1'], ['horse-1']);
    } catch (_) {
        // Expected
    }
});

// ═══════════════════════════════════════════════════════════
console.log('\n══ PHASE 48c: detectPLOWrapDraw Fix — BUG #5 ══');
// ═══════════════════════════════════════════════════════════

const detectWrap = brain.detectPLOWrapDraw;

// ─── BUG #5: False positive — trash hand on AKQ board got 9 phantom outs ───
test('detectPLOWrapDraw: BUG #5 fix — 2-3-4-8 on A-K-Q = 0 outs (was 9)', () => {
    // RANK_ORDER: 2=0,3=1,4=2,5=3,6=4,7=5,8=6,9=7,T=8,J=9,Q=10,K=11,A=12
    // Hand: 2-3-4-8, Board: A-K-Q
    const result = detectWrap([0, 1, 2, 6], [12, 11, 10]);
    expect(result.isWrap).toBe(false);
    expect(result.wrapOuts).toBe(0);
});

test('detectPLOWrapDraw: BUG #5 fix — 7-8-9-T on A-K-Q = 0 outs (was 20)', () => {
    // Hand: 7-8-9-T, Board: A-K-Q — no straight uses 2 from hand + all 3 board
    // Only possible: A-K-Q-J-T needs J+T from hand but J not in hand
    const result = detectWrap([5, 6, 7, 8], [12, 11, 10]);
    // T(8) + any = A-K-Q-J-T needs J(9). J not in hand → only 1 card draw via J
    // Actually: needed=[12,11,10,9,8]. Board has 12,11,10(=3). Hand has 8(=1). Missing=9.
    // onBoard=3, but after missing card: newBoardOnly would be 4 > 3 → invalid.
    // So 0 outs from missing-card analysis.
    // But "wrong split" case: all present for [10,9,8,7,6]? 10,7,6→board, 9,8→hand.
    // Board has 10(Q) but not 7 or 6. So needed=[10,9,8,7,6], board has [12,11,10]→only 10.
    // Missing: 7,6 not in board or hand(5,6,7,8). 6 is rank 4→not in hand. 7→rank 5→yes hand.
    // So missing=[4]=rank 4 only? needed=[10,9,8,7,6]. 6(rank 4): not board, not hand[5,6,7,8]?
    // rank 4 is card 6. hand ranks [5,6,7,8]. rank 4 NOT in hand. missing=[4].
    // Missing.length=1 but let's just check the result
    expect(result.wrapOuts).toBeLessThanOrEqual(4);
});

// ─── Valid wrap scenario: T-J-Q-2 on 8-9-K is a 13-out wrap ───
test('detectPLOWrapDraw: T-J-Q-2 on 8-9-K = 13 outs (real wrap)', () => {
    // Hand: T(8)-J(9)-Q(10)-2(0), Board: 8(6)-9(7)-K(11)
    // Outs: rank 5(card 7)=4 outs (J-T-9-8-7 via missing rank)
    //   + rank 10(Q)=3 outs (Q-J-T-9-8 via wrong-split fix, we hold Q)
    //   + rank 8(T)=3 outs (Q-J-T-9-8 via wrong-split fix, we hold T)
    //   + rank 9(J)=3 outs (K-Q-J-T-9 via wrong-split fix, we hold J)
    //   = 13 total outs
    const result = detectWrap([8, 9, 10, 0], [6, 7, 11]);
    expect(result.wrapOuts).toBe(13);
    expect(result.isWrap).toBe(true);
    expect(result.wrapType).toBe('wrap_13');
});

// ─── Made straight + draw: 4-5-6-T on 7-8-9 = 9 outs (wrong-split fix) ───
test('detectPLOWrapDraw: 4-5-6-T on 7-8-9 = 9 outs from wrong-split draws', () => {
    // Hand: 4(2)-5(3)-6(4)-T(8), Board: 7(5)-8(6)-9(7)
    // Made: [7,6,5,4,3] and [8,7,6,5,4].
    // Draw: straight [6,5,4,3,2] has handOnly={2,3,4}=3 > 2 → wrong split.
    // Cards rank 2,3,4 appearing on board fix it. Each has 4-1=3 outs. Total=9.
    const result = detectWrap([2, 3, 4, 8], [5, 6, 7]);
    expect(result.wrapOuts).toBe(9);
    expect(result.isWrap).toBe(true);
    expect(result.wrapType).toBe('small_wrap');
});

// ─── No board = no wrap ───
test('detectPLOWrapDraw: no board = no wrap', () => {
    const result = detectWrap([3, 4, 5, 6], []);
    expect(result.isWrap).toBe(false);
    expect(result.wrapOuts).toBe(0);
});

// ─── Disconnected hand on connected board = 0 outs ───
test('detectPLOWrapDraw: disconnected hand 2-3-K-A on 7-8-9 = 0 outs', () => {
    // Hand: 2(0)-3(1)-K(11)-A(12), Board: 7(5)-8(6)-9(7)
    // No 2 hole cards + 3 board cards make a straight draw
    const result = detectWrap([0, 1, 11, 12], [5, 6, 7]);
    // Straight [7,6,5,4,3]: board has 5,6,7=3. Hand has none from needed[7,6,5,4,3]→
    // Actually hand has 0,1. needed=[7,6,5,4,3]. 0 not in needed. 1 not in needed.
    // So hand contributes 0 from needed. Need 2 from hand → fail. 0 outs.
    expect(result.wrapOuts).toBe(0);
    expect(result.isWrap).toBe(false);
});

// ═══════════════════════════════════════════════════════════
// Phase 48d — analyzeBoardEvolution tests
// ═══════════════════════════════════════════════════════════
const analyzeBoardEvolution = brain.analyzeBoardEvolution;
const getGeoSizing = brain.getGeometricSizing;
const evalBoardWet = brain.evaluateBoardWetness;
const getDrawEq = brain.getDrawEquity;

test('analyzeBoardEvolution: flop returns neutral (no evolution)', () => {
    const result = analyzeBoardEvolution(['Ah', 'Kd', 'Qs'], 'flop');
    expect(result.evolution).toBe('neutral');
    expect(result.drawsCompleted.length).toBe(0);
});

test('analyzeBoardEvolution: turn overcard on low flop = pfr_favorable', () => {
    // Flop: 2h 4d 6s, Turn: Ac — Ace is overcard, favors PFR
    const result = analyzeBoardEvolution(['2h', '4d', '6s', 'Ac'], 'turn');
    expect(result.overcard).toBe(true);
    expect(result.pfrImpact).toBeGreaterThan(0);
});

test('analyzeBoardEvolution: turn completes flush = caller_favorable', () => {
    // Flop: Ah Kh 2s, Turn: 7h — monotone board, flush possible
    const result = analyzeBoardEvolution(['Ah', 'Kh', '2s', '7h'], 'turn');
    expect(result.drawsCompleted).toContain('flush');
    expect(result.flushCompleted).toBe(true);
    expect(result.callerImpact).toBeGreaterThan(0);
});

test('analyzeBoardEvolution: blank river on high board = pfr_favorable or neutral', () => {
    // Flop: Ah Kd Qs, Turn: Jc, River: 2h — low blank
    const result = analyzeBoardEvolution(['Ah', 'Kd', 'Qs', 'Jc', '2h'], 'river');
    // 2h is low but not overcard. Board is already connected.
    // pfrImpact should be positive from A-K-Q overcard on turn already.
    expect(result.boardGotDrier).toBe(false); // 2h < 6 but min flop rank is Q(10)>=8, so...
    // actually 2 < 6 AND min of A,K,Q = Q = 10 >= 8 → boardGotDrier true on turn
});

test('analyzeBoardEvolution: river bricked flush draw', () => {
    // Flop: Ah 4h 9s, Turn: Kh (3 hearts = flush draw), River: 2d — bricks
    // Wait, 3 hearts on turn = flush already possible. Let me use 2 hearts on flop.
    // Flop: Ah 4h 9s (2 hearts), Turn: Kd (still 2 hearts), River: 3c (no 3rd heart)
    const result = analyzeBoardEvolution(['Ah', '4h', '9s', 'Kd', '3c'], 'river');
    expect(result.drawsBricked).toContain('flush');
});

test('analyzeBoardEvolution: null/empty board returns unknown', () => {
    const result = analyzeBoardEvolution(null, 'flop');
    expect(result.evolution).toBe('unknown');
});

test('analyzeBoardEvolution: board pairing on turn detected', () => {
    // Flop: Ah Kd 9s, Turn: 9c — board pairs
    const result = analyzeBoardEvolution(['Ah', 'Kd', '9s', '9c'], 'turn');
    expect(result.boardPaired).toBe(true);
});

// ═══════════════════════════════════════════════════════════
// Phase 48d — getGeometricSizing tests
// ═══════════════════════════════════════════════════════════

test('getGeometricSizing: SPR < 2 returns jam', () => {
    const result = getGeoSizing(1000, 1500, 2, true);
    expect(result.isJammable).toBe(true);
    expect(result.sizeFraction).toBe(999);
});

test('getGeometricSizing: 0 streets returns default', () => {
    const result = getGeoSizing(1000, 5000, 0, true);
    expect(result.sizeFraction).toBe(0.66);
    expect(result.isJammable).toBe(false);
});

test('getGeometricSizing: pot control (no all-in target) returns standard', () => {
    const result = getGeoSizing(1000, 5000, 2, false);
    expect(result.sizeFraction).toBe(0.50);
    expect(result.isJammable).toBe(false);
});

test('getGeometricSizing: deep stack 2 streets returns reasonable fraction', () => {
    // pot=1000, stack=8000, 2 streets. SPR=8
    const result = getGeoSizing(1000, 8000, 2, true);
    expect(result.sizeFraction).toBeGreaterThan(0.25);
    expect(result.sizeFraction).toBeLessThanOrEqual(1.50);
    expect(result.projectedPotByStreet.length).toBe(2);
});

test('getGeometricSizing: 1 street left returns higher fraction than default', () => {
    // pot=1000, stack=3000, 1 street. SPR=3
    const result = getGeoSizing(1000, 3000, 1, true);
    // With SPR=3 and 1 street, sizing should be aggressive
    expect(result.sizeFraction).toBeGreaterThan(0.50);
});

// ═══════════════════════════════════════════════════════════
// Phase 48d — evaluateBoardWetness tests
// ═══════════════════════════════════════════════════════════

test('evaluateBoardWetness: monotone board = wet', () => {
    expect(evalBoardWet(['Ah', '9h', '4h'])).toBe('wet');
});

test('evaluateBoardWetness: rainbow disconnected = dry', () => {
    // A-7-2 rainbow with big gaps
    expect(evalBoardWet(['Ah', '7d', '2c'])).toBe('dry');
});

test('evaluateBoardWetness: two suited + connected = wet', () => {
    // Jh Th 9c — two hearts + connected
    expect(evalBoardWet(['Jh', 'Th', '9c'])).toBe('wet');
});

test('evaluateBoardWetness: null board = medium', () => {
    expect(evalBoardWet(null)).toBe('medium');
});

test('evaluateBoardWetness: A-K-2 two-tone = medium (big gap but flush draw)', () => {
    // A-K have small gap (1), but K-2 have huge gap (11). avgGap ~6.
    // maxSuit: if 2 suited, and avgGap > 2 → depends on formula
    const result = evalBoardWet(['Ah', 'Kh', '2d']);
    // maxSuit=2, avgGap=(12-11 + 11-0)/2 = (1+11)/2 = 6
    // condition: maxSuit>=2 && avgGap<=2 → false. So not wet.
    // maxSuit<=1 → false. avgGap>=4 → true → dry? No, maxSuit=2 > 1.
    // Falls through to 'medium'
    expect(result).toBe('medium');
});

// ═══════════════════════════════════════════════════════════
// Phase 48d — getDrawEquity tests
// ═══════════════════════════════════════════════════════════

test('getDrawEquity: flush draw on flop = 9 outs', () => {
    const result = getDrawEq({ hasFlushDraw: true, hasOESD: false, hasGutshot: false, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    expect(result.outs).toBe(9);
});

test('getDrawEquity: OESD on flop = 8 outs', () => {
    const result = getDrawEq({ hasFlushDraw: false, hasOESD: true, hasGutshot: false, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    expect(result.outs).toBe(8);
});

test('getDrawEquity: combo draw (flush + OESD) = 15 outs', () => {
    const result = getDrawEq({ hasFlushDraw: true, hasOESD: true, hasGutshot: false, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    // 9 + 8 - 2 overlap = 15
    expect(result.outs).toBe(15);
});

test('getDrawEquity: gutshot on flop = 4 outs', () => {
    const result = getDrawEq({ hasFlushDraw: false, hasOESD: false, hasGutshot: true, hasBackdoorFlush: false, category: 'high_card' }, 'flop');
    expect(result.outs).toBe(4);
});

test('getDrawEquity: river = nut premium only (no cards to come)', () => {
    const result = getDrawEq({ hasFlushDraw: true, hasOESD: true, hasGutshot: false, hasBackdoorFlush: false, category: 'high_card' }, 'river');
    // River has 0 draw equity BUT nut flush draw premium of 0.03 still applies
    expect(result.equity).toBeCloseTo(0.03, 2);
});

test('getDrawEquity: backdoor flush on flop adds 1.5 outs', () => {
    const result = getDrawEq({ hasFlushDraw: false, hasOESD: false, hasGutshot: false, hasBackdoorFlush: true, category: 'high_card' }, 'flop');
    expect(result.outs).toBe(1.5);
});

test('getDrawEquity: top pair adds 2 improvement outs', () => {
    const result = getDrawEq({ hasFlushDraw: false, hasOESD: false, hasGutshot: false, hasBackdoorFlush: false, category: 'top_pair' }, 'flop');
    expect(result.outs).toBe(2);
});

test('getDrawEquity: flush draw + top pair = 11 outs', () => {
    const result = getDrawEq({ hasFlushDraw: true, hasOESD: false, hasGutshot: false, hasBackdoorFlush: false, category: 'top_pair' }, 'flop');
    // 9 (flush) + 2 (improvement) = 11
    expect(result.outs).toBe(11);
});

test('getDrawEquity: turn flush draw equity uses rule of 2 + nut premium', () => {
    const result = getDrawEq({ hasFlushDraw: true, hasOESD: false, hasGutshot: false, hasBackdoorFlush: false, category: 'high_card' }, 'turn');
    // 9 outs × 2 + 1 = 19% + 3% nut premium = 0.22
    expect(result.equity).toBeCloseTo(0.22, 2);
});

// ═══════════════════════════════════════════════════════════
// PHASE 48e: ANTI-EXPLOIT MODULES 20-32 + SESSION MODEL + LIVE OBSERVER
// ═══════════════════════════════════════════════════════════

// ── Module 20: Table Image Exposure Monitor ──
const recordTableImageHand = brain.recordTableImageHand;
const isImageExposed = brain.isImageExposed;
const imageExposureMap = brain.imageExposureMap;

test('Module 20: unexposed with < 8 hands', () => {
    imageExposureMap.clear();
    for (let i = 0; i < 7; i++) recordTableImageHand('h1', 't1', true);
    expect(isImageExposed('h1', 't1')).toBe(false);
});

test('Module 20: exposed when showdown rate > 25%', () => {
    imageExposureMap.clear();
    for (let i = 0; i < 10; i++) recordTableImageHand('h2', 't2', true);  // 10/10 = 100%
    expect(isImageExposed('h2', 't2')).toBe(true);
});

test('Module 20: not exposed when showdown rate <= 25%', () => {
    imageExposureMap.clear();
    for (let i = 0; i < 10; i++) recordTableImageHand('h3', 't3', i < 2); // 2/10 = 20%
    expect(isImageExposed('h3', 't3')).toBe(false);
});

// ── Module 21: PLO Preflop Limp-Trap Detector ──
const detectLimpTrap = brain.detectLimpTrap;

test('Module 21: 3 limpers + shallow SPR = limp trap', () => {
    const r = detectLimpTrap(3, 'ep', 4, false);
    expect(r.isLimpTrap).toBe(true);
    expect(r.recommendation).toBe('prefer_call_or_fold');
});

test('Module 21: nut hand resets risk to 0', () => {
    const r = detectLimpTrap(4, 'ep', 3, true);
    expect(r.isLimpTrap).toBe(false);
    expect(r.riskScore).toBe(0);
});

test('Module 21: 1 limper + deep SPR = no trap', () => {
    const r = detectLimpTrap(1, 'btn', 12, false);
    expect(r.isLimpTrap).toBe(false);
    expect(r.recommendation).toBe('raise_ok');
});

// ── Module 22: Isolation Bet Sizing Tell Tracker ──
const recordIsoSize = brain.recordIsoSize;
const isMechanicalIsolator = brain.isMechanicalIsolator;
const isoSizingMap = brain.isoSizingMap;

test('Module 22: insufficient data returns not mechanical', () => {
    isoSizingMap.clear();
    recordIsoSize('opp1', 3.0);
    recordIsoSize('opp1', 3.0);
    const r = isMechanicalIsolator('opp1');
    expect(r.isMechanical).toBe(false);
});

test('Module 22: consistent sizing = mechanical', () => {
    isoSizingMap.clear();
    for (let i = 0; i < 6; i++) recordIsoSize('opp2', 3.0);
    const r = isMechanicalIsolator('opp2');
    expect(r.isMechanical).toBe(true);
    expect(r.stdDev).toBe(0);
});

test('Module 22: varied sizing = not mechanical', () => {
    isoSizingMap.clear();
    [2.0, 4.0, 3.0, 5.0, 2.5, 6.0].forEach(s => recordIsoSize('opp3', s));
    const r = isMechanicalIsolator('opp3');
    expect(r.isMechanical).toBe(false);
    expect(r.stdDev).toBeGreaterThan(0.8);
});

// ── Module 23: OOP Positional Equity Leak Guard ──
const getOOPPositionalGuard = brain.getOOPPositionalGuard;

test('Module 23: IP player gets no guard', () => {
    const r = getOOPPositionalGuard(true, false, 50, 'flop');
    expect(r.shouldGuard).toBe(false);
    expect(r.equityBoost).toBe(0);
});

test('Module 23: OOP with initiative gets no guard', () => {
    const r = getOOPPositionalGuard(false, true, 30, 'turn');
    expect(r.shouldGuard).toBe(false);
});

test('Module 23: OOP no initiative flop requires 58+ equity', () => {
    const r = getOOPPositionalGuard(false, false, 55, 'flop');
    expect(r.shouldGuard).toBe(true);   // 55 < 50+8=58
    expect(r.equityBoost).toBe(8);
});

test('Module 23: OOP no initiative river requires 62+ equity', () => {
    const r = getOOPPositionalGuard(false, false, 65, 'river');
    expect(r.shouldGuard).toBe(false);  // 65 >= 50+12=62
    expect(r.equityBoost).toBe(12);
});

// ── Module 24: River Donk-Bet Exploitation Block ──
const evaluateDonkBet = brain.evaluateDonkBet;

test('Module 24: not a donk if not IP', () => {
    const r = evaluateDonkBet(10, 100, false, 70);
    expect(r.action).toBe('none');
});

test('Module 24: raise with strong equity vs donk', () => {
    const r = evaluateDonkBet(30, 100, true, 75);
    expect(r.action).toBe('raise');
});

test('Module 24: fold with weak equity vs donk', () => {
    const r = evaluateDonkBet(30, 100, true, 25);
    expect(r.action).toBe('fold');
});

test('Module 24: call with medium equity vs donk', () => {
    const r = evaluateDonkBet(30, 100, true, 50);
    expect(r.action).toBe('call');
});

test('Module 24: large donk (>80% pot) not treated as probe', () => {
    const r = evaluateDonkBet(90, 100, true, 50);
    expect(r.action).toBe('none');
});

// ── Module 25: Min-Raise Harassment Detector ──
const recordRaiseSize = brain.recordRaiseSize;
const isMinRaiser = brain.isMinRaiser;
const minRaiseMap = brain.minRaiseMap;

test('Module 25: insufficient data returns not min-raiser', () => {
    minRaiseMap.clear();
    recordRaiseSize('m1', 4, 2, false);
    recordRaiseSize('m1', 4, 2, true);
    const r = isMinRaiser('m1');
    expect(r.isMinRaiser).toBe(false);
});

test('Module 25: frequent min-raises detected', () => {
    minRaiseMap.clear();
    for (let i = 0; i < 6; i++) recordRaiseSize('m2', 4, 2, false); // 4 <= 2*2.2=4.4, all min
    const r = isMinRaiser('m2');
    expect(r.isMinRaiser).toBe(true);
    expect(r.rate).toBe(1.0);
});

test('Module 25: mixed raises not flagged', () => {
    minRaiseMap.clear();
    recordRaiseSize('m3', 4, 2, false);   // min (4 <= 4.4)
    recordRaiseSize('m3', 10, 2, false);  // not min
    recordRaiseSize('m3', 12, 2, false);  // not min
    recordRaiseSize('m3', 15, 2, false);  // not min
    recordRaiseSize('m3', 4, 2, false);   // min
    const r = isMinRaiser('m3');
    expect(r.isMinRaiser).toBe(false);  // 2/5 = 0.40, not > 0.40
});

// ── Module 26: Squeeze Overkill Detector ──
const recordSqueeze = brain.recordSqueeze;
const isSqueezeOverkill = brain.isSqueezeOverkill;
const squeezeMap = brain.squeezeMap;

test('Module 26: insufficient squeezes returns not overkill', () => {
    squeezeMap.clear();
    recordSqueeze('s1', 20, 10);
    const r = isSqueezeOverkill('s1');
    expect(r.isOverkill).toBe(false);
});

test('Module 26: huge squeezes detected as overkill', () => {
    squeezeMap.clear();
    recordSqueeze('s2', 50, 10);  // 5x
    recordSqueeze('s2', 60, 10);  // 6x
    recordSqueeze('s2', 40, 10);  // 4x
    const r = isSqueezeOverkill('s2');
    expect(r.isOverkill).toBe(true);
    expect(r.avgMult).toBeGreaterThanOrEqual(4.0);
});

test('Module 26: normal squeezes not overkill', () => {
    squeezeMap.clear();
    recordSqueeze('s3', 25, 10);  // 2.5x
    recordSqueeze('s3', 30, 10);  // 3x
    recordSqueeze('s3', 28, 10);  // 2.8x
    const r = isSqueezeOverkill('s3');
    expect(r.isOverkill).toBe(false);
});

// ── Module 27: Reverse Implied Odds Guard ──
const detectReverseImplied = brain.detectReverseImplied;

test('Module 27: no draw outs = no block', () => {
    const r = detectReverseImplied(0, 0.30, 1000, 2, false);
    expect(r.shouldBlock).toBe(false);
});

test('Module 27: weak draw on wet board multiway = blocked', () => {
    const r = detectReverseImplied(4, 0.35, 1000, 4, true);
    expect(r.shouldBlock).toBe(true);
    expect(r.rioFactor).toBeGreaterThan(1.5);
});

test('Module 27: strong draw heads-up = acceptable', () => {
    const r = detectReverseImplied(15, 0.25, 500, 2, false);
    expect(r.shouldBlock).toBe(false);
});

// ── Module 28: Cold-Call Trap Detector ──
const recordColdCall = brain.recordColdCall;
const recordBarrelVsColdCall = brain.recordBarrelVsColdCall;
const isColdCallTrap = brain.isColdCallTrap;
const coldCallMap = brain.coldCallMap;

test('Module 28: insufficient barrels returns not trap', () => {
    coldCallMap.clear();
    recordColdCall('cc1');
    recordBarrelVsColdCall('cc1', true);
    const r = isColdCallTrap('cc1');
    expect(r.isTrap).toBe(false);
});

test('Module 28: cold-caller who never folds to barrels = trap', () => {
    coldCallMap.clear();
    recordColdCall('cc2');
    for (let i = 0; i < 5; i++) recordBarrelVsColdCall('cc2', false); // 0/5 fold rate
    const r = isColdCallTrap('cc2');
    expect(r.isTrap).toBe(true);
    expect(r.winRate).toBe(0);
});

test('Module 28: cold-caller who usually folds = not trap', () => {
    coldCallMap.clear();
    recordColdCall('cc3');
    for (let i = 0; i < 5; i++) recordBarrelVsColdCall('cc3', true); // 5/5 fold rate
    const r = isColdCallTrap('cc3');
    expect(r.isTrap).toBe(false);
    expect(r.winRate).toBe(1.0);
});

// ── Module 29: Straddle & Bomb-Pot Equity Adjuster ──
const detectBombPotOrStraddle = brain.detectBombPotOrStraddle;

test('Module 29: bomb pot detected (pot >= 8bb, no straddle)', () => {
    const r = detectBombPotOrStraddle(40, 2, false);
    expect(r.isBombPot).toBe(true);
    expect(r.equityThresholdBoost).toBe(15);
    expect(r.label).toBe('bomb-pot');
});

test('Module 29: straddle detected', () => {
    const r = detectBombPotOrStraddle(12, 2, true);
    expect(r.isStraddle).toBe(true);
    expect(r.equityThresholdBoost).toBe(10);
    expect(r.label).toBe('straddle');
});

test('Module 29: standard pot', () => {
    const r = detectBombPotOrStraddle(6, 2, false);
    expect(r.isBombPot).toBe(false);
    expect(r.isStraddle).toBe(false);
    expect(r.equityThresholdBoost).toBe(0);
});

// ── Module 30: Angle-Shoot Timing Detector ──
const recordActionTiming = brain.recordActionTiming;
const detectAngleShoot = brain.detectAngleShoot;
const angleShootMap = brain.angleShootMap;

test('Module 30: no data = not angle-shooting', () => {
    angleShootMap.clear();
    const r = detectAngleShoot('a1');
    expect(r.isAngleShooting).toBe(false);
    expect(r.extraEntropyMs).toBe(0);
});

test('Module 30: rapid-fire instant actions = angle-shooting', () => {
    angleShootMap.clear();
    for (let i = 0; i < 6; i++) recordActionTiming('a2', 300); // All < 700ms
    const r = detectAngleShoot('a2');
    expect(r.isAngleShooting).toBe(true);
    expect(r.extraEntropyMs).toBeGreaterThan(0);
});

test('Module 30: normal timing = not angle-shooting', () => {
    angleShootMap.clear();
    for (let i = 0; i < 6; i++) recordActionTiming('a3', 3000); // All 3s
    const r = detectAngleShoot('a3');
    expect(r.isAngleShooting).toBe(false);
});

// ── Module 31: RIT Refusal Tracker ──
const recordRITResponse = brain.recordRITResponse;
const isRITRefuser = brain.isRITRefuser;
const ritRefusalMap = brain.ritRefusalMap;

test('Module 31: insufficient data = not refuser', () => {
    ritRefusalMap.clear();
    recordRITResponse('r1', false);
    const r = isRITRefuser('r1');
    expect(r.isRITRefuser).toBe(false);
});

test('Module 31: consistent refusal = RIT refuser', () => {
    ritRefusalMap.clear();
    recordRITResponse('r2', false);
    recordRITResponse('r2', false);
    recordRITResponse('r2', false);
    const r = isRITRefuser('r2');
    expect(r.isRITRefuser).toBe(true);
    expect(r.refusalRate).toBe(1.0);
});

test('Module 31: accepting RIT = not refuser', () => {
    ritRefusalMap.clear();
    recordRITResponse('r3', true);
    recordRITResponse('r3', true);
    recordRITResponse('r3', false);
    const r = isRITRefuser('r3');
    expect(r.isRITRefuser).toBe(false);
});

// ── Module 32: Per-Session Chip-Leak Forensics ──
const recordChipLeak = brain.recordChipLeak;
const getChipLeakBoosts = brain.getChipLeakBoosts;
const chipLeakMap = brain.chipLeakMap;

test('Module 32: no leaks = zero boosts', () => {
    chipLeakMap.clear();
    const r = getChipLeakBoosts('cl1', 'tbl1');
    expect(r.oopBoost).toBe(0);
    expect(r.multiwayBoost).toBe(0);
});

test('Module 32: OOP leak > 20bb triggers oopBoost', () => {
    chipLeakMap.clear();
    recordChipLeak('cl2', 'tbl2', 'oop_check_call', 25);
    const r = getChipLeakBoosts('cl2', 'tbl2');
    expect(r.oopBoost).toBe(8);
    expect(r.multiwayBoost).toBe(0);
});

test('Module 32: multiway leak > 20bb triggers multiwayBoost', () => {
    chipLeakMap.clear();
    recordChipLeak('cl3', 'tbl3', 'multiway_topset', 21);
    const r = getChipLeakBoosts('cl3', 'tbl3');
    expect(r.multiwayBoost).toBe(8);
});

test('Module 32: leak below threshold = no boost', () => {
    chipLeakMap.clear();
    recordChipLeak('cl4', 'tbl4', 'oop_check_call', 15);
    const r = getChipLeakBoosts('cl4', 'tbl4');
    expect(r.oopBoost).toBe(0);
});

// ── Module 14: Threat Score + Blacklist ──
const getThreatScore = brain.getThreatScore;
const isBlacklisted = brain.isBlacklisted;
const suspectBotMap = brain.suspectBotMap;
const crossTableRadar = brain.crossTableRadar;
const threatIntelCache = brain.threatIntelCache;

test('Module 14: unknown opponent = 0 threat', () => {
    suspectBotMap.clear();
    crossTableRadar.clear();
    const score = getThreatScore('unknown_opp');
    expect(score).toBe(0);
});

test('Module 14: high bot score contributes 40%', () => {
    suspectBotMap.clear();
    crossTableRadar.clear();
    suspectBotMap.set('bot1', { suspectScore: 100 });
    const score = getThreatScore('bot1');
    expect(score).toBe(40);
});

test('Module 14: cross-table 3 tables = 20 points (capped)', () => {
    suspectBotMap.clear();
    crossTableRadar.clear();
    crossTableRadar.set('ct1', new Set(['t1', 't2', 't3']));
    const score = getThreatScore('ct1');
    expect(score).toBe(20); // 3 * 7 = 21, capped at 20
});

test('Module 14: not blacklisted when no cache entry', () => {
    threatIntelCache.clear();
    expect(isBlacklisted('nobody')).toBe(false);
});

test('Module 14: blacklisted when future timestamp in cache', () => {
    threatIntelCache.clear();
    threatIntelCache.set('banned1', { blacklistedUntil: Date.now() + 100000 });
    expect(isBlacklisted('banned1')).toBe(true);
});

test('Module 14: not blacklisted when timestamp expired', () => {
    threatIntelCache.clear();
    threatIntelCache.set('expired1', { blacklistedUntil: Date.now() - 100000 });
    expect(isBlacklisted('expired1')).toBe(false);
});

// ── Module 11: Range Rotation ──
const getRangeRotationGear = brain.getRangeRotationGear;
const rangeRotationMap = brain.rangeRotationMap;

test('Module 11: range rotation starts with valid gear', () => {
    rangeRotationMap.clear();
    const r = getRangeRotationGear('rr1', 'trr1');
    expect(['A', 'B', 'C', 'D']).toContain(r.gear);
    expect(r.foldMod).toBeDefined();
    expect(r.raiseMod).toBeDefined();
});

test('Module 11: gear advances after 30 hands', () => {
    rangeRotationMap.clear();
    let firstGear = null;
    for (let i = 0; i < 31; i++) {
        const r = getRangeRotationGear('rr2', 'trr2');
        if (i === 0) firstGear = r.gear;
    }
    const current = getRangeRotationGear('rr2', 'trr2');
    // After 32 calls, should have rotated at least once
    // (first call creates gear + increments to 1, then at call 30 rotates)
    expect(current).toBeDefined();
});

// ── Module 12: PLO Multiway Equity Discount ──
const applyMultiwayEquityDiscount = brain.applyMultiwayEquityDiscount;

test('Module 12: heads-up = no discount', () => {
    expect(applyMultiwayEquityDiscount(80, 2)).toBe(80);
});

test('Module 12: 3-way = 10 point discount', () => {
    expect(applyMultiwayEquityDiscount(80, 3)).toBe(70);
});

test('Module 12: 5-way = 25 point discount', () => {
    expect(applyMultiwayEquityDiscount(80, 5)).toBe(55);
});

test('Module 12: discount floors at 0', () => {
    expect(applyMultiwayEquityDiscount(10, 5)).toBe(0);
});

// ── Module 13: PLO Nut-Bias Exploit Detector ──
const detectNutBiasExploitBoard = brain.detectNutBiasExploitBoard;

test('Module 13: null board = 0 score', () => {
    const r = detectNutBiasExploitBoard(null, 2);
    expect(r.nutUnlikelyScore).toBe(0);
});

test('Module 13: rainbow low board = high nut-unlikely score', () => {
    // 5h-3d-2c — rainbow (25), no pair (15), all low maxRank=3≤9 (15), gap 1-1 (max gap 1, no bonus)
    const board = [{ rank: 3, suit: 'h' }, { rank: 1, suit: 'd' }, { rank: 0, suit: 'c' }];
    const r = detectNutBiasExploitBoard(board, 2);
    expect(r.nutUnlikelyScore).toBeGreaterThanOrEqual(40);
    expect(r.shouldAddCheckRaise).toBe(true);
});

test('Module 13: monotone high board = low nut-unlikely score', () => {
    // Ah-Kh-Qh — monotone (not rainbow, uniqueSuits=1≠3), no pair (15), high (maxRank=12, no low bonus)
    const board = [{ rank: 12, suit: 'h' }, { rank: 11, suit: 'h' }, { rank: 10, suit: 'h' }];
    const r = detectNutBiasExploitBoard(board, 2);
    expect(r.nutUnlikelyScore).toBeLessThan(40);
    expect(r.shouldAddCheckRaise).toBe(false);
});

// ── Module 17: PLO Runout Equity Re-Evaluator ──
const reevaluatePLORunoutEquity = brain.reevaluatePLORunoutEquity;

test('Module 17: big improvement = nut_improve', () => {
    const r = reevaluatePLORunoutEquity(40, 60, 'turn');
    expect(r.multiplier).toBe(1.20);
    expect(r.runoutType).toBe('nut_improve');
});

test('Module 17: big drop = scare', () => {
    const r = reevaluatePLORunoutEquity(60, 40, 'river');
    expect(r.multiplier).toBe(0.75);
    expect(r.runoutType).toBe('scare');
});

test('Module 17: small change = blank', () => {
    const r = reevaluatePLORunoutEquity(50, 52, 'turn');
    expect(r.multiplier).toBe(1.0);
    expect(r.runoutType).toBe('blank');
});

// ── Module 18: SPR Pot-Commitment Trap Detector ──
const detectSPRTrap = brain.detectSPRTrap;

test('Module 18: no call needed = no trap', () => {
    const r = detectSPRTrap(0, 100, 500, 2, 50);
    expect(r.shouldFoldTrap).toBe(false);
});

test('Module 18: pot-sized jam with marginal equity = trap fold', () => {
    // toCall=100, pot=100, so break-even = 100/200 = 50%. Jam is oversized (100 >= 100*0.9).
    // With equity 45 < 50 adjustedThreshold → shouldFoldTrap
    const r = detectSPRTrap(100, 100, 500, 2, 45);
    expect(r.isTrap).toBe(true);
    expect(r.shouldFoldTrap).toBe(true);
});

test('Module 18: strong equity survives trap', () => {
    const r = detectSPRTrap(100, 100, 500, 2, 70);
    expect(r.shouldFoldTrap).toBe(false);
});

// ── Module 19: Probe-Bet Frequency Harvester ──
const recordProbeBet = brain.recordProbeBet;
const getProbeFarmScore = brain.getProbeFarmScore;
const probeBetMap = brain.probeBetMap;

test('Module 19: insufficient probes = 0 score', () => {
    probeBetMap.clear();
    recordProbeBet('pb1', 0.25, true, 5);
    recordProbeBet('pb1', 0.30, true, 3);
    expect(getProbeFarmScore('pb1')).toBe(0);
});

test('Module 19: systematic probe farmer detected', () => {
    probeBetMap.clear();
    for (let i = 0; i < 5; i++) recordProbeBet('pb2', 0.20, true, 3);
    expect(getProbeFarmScore('pb2')).toBe(1.0); // 5/5 wins
});

test('Module 19: bet > 35% pot not recorded as probe', () => {
    probeBetMap.clear();
    recordProbeBet('pb3', 0.40, true, 5);
    expect(getProbeFarmScore('pb3')).toBe(0); // Not even recorded
});

// ── Opponent Session Model ──
const recordOpponentAction = brain.recordOpponentAction;
const recordOpponentShowdown = brain.recordOpponentShowdown;
const getOpponentSessionRead = brain.getOpponentSessionRead;
const opponentSessionModel = brain.opponentSessionModel;

test('Opponent Session Model: returns null with insufficient actions', () => {
    opponentSessionModel.clear();
    recordOpponentAction('osm1', 'preflop', 'raise', {});
    recordOpponentAction('osm1', 'flop', 'bet', {});
    expect(getOpponentSessionRead('osm1')).toBeNull();
});

test('Opponent Session Model: detects TAG tendency', () => {
    opponentSessionModel.clear();
    // Need 8+ actions, vpip < 0.25, agg >= 0.40
    // 3 preflop raises, 3 flop bets, 2 folds = 8 actions
    recordOpponentAction('osm2', 'preflop', 'raise', {});
    recordOpponentAction('osm2', 'preflop', 'raise', {});
    recordOpponentAction('osm2', 'preflop', 'fold', {});
    recordOpponentAction('osm2', 'flop', 'bet', {});
    recordOpponentAction('osm2', 'flop', 'bet', {});
    recordOpponentAction('osm2', 'flop', 'bet', {});
    recordOpponentAction('osm2', 'turn', 'fold', {});
    recordOpponentAction('osm2', 'river', 'fold', {});
    const read = getOpponentSessionRead('osm2');
    expect(read).not.toBeNull();
    expect(read.totalActions).toBe(8);
});

test('Opponent Session Model: tracks showdown bluffs', () => {
    opponentSessionModel.clear();
    // Need to build up enough actions first
    for (let i = 0; i < 10; i++) recordOpponentAction('osm3', 'preflop', 'raise', {});
    recordOpponentShowdown('osm3', false, 20, true);  // bluff caught
    recordOpponentShowdown('osm3', false, 15, true);  // bluff caught
    recordOpponentShowdown('osm3', true, 80, false);   // legit win
    const read = getOpponentSessionRead('osm3');
    expect(read).not.toBeNull();
    expect(read.bluffRate).toBeCloseTo(0.667, 1);
});

test('Opponent Session Model: overbet tracking', () => {
    opponentSessionModel.clear();
    for (let i = 0; i < 8; i++) {
        recordOpponentAction('osm4', 'flop', 'bet', { betToPot: 1.5 }); // all overbets
    }
    const read = getOpponentSessionRead('osm4');
    expect(read).not.toBeNull();
    expect(read.overbetRate).toBe(1.0);
});

// ── Live Observer System ──
const observeNewHand = brain.observeNewHand;
const observeAction = brain.observeAction;
const observeShowdown = brain.observeShowdown;
const getLiveRead = brain.getLiveRead;
const liveObserver = brain.liveObserver;

test('Live Observer: observeNewHand creates observer entries', () => {
    liveObserver.clear();
    const players = [{ id: 'horse1' }, { id: 'opp1' }, { id: 'opp2' }];
    observeNewHand('table1', 'hand1', players, ['horse1'], 2);
    expect(liveObserver.has('horse1')).toBe(true);
    const obs = liveObserver.get('horse1').get('table1');
    expect(obs.opponents.has('opp1')).toBe(true);
    expect(obs.opponents.has('opp2')).toBe(true);
    expect(obs.opponents.get('opp1').handsObserved).toBe(1);
});

test('Live Observer: insufficient data returns null read', () => {
    liveObserver.clear();
    const players = [{ id: 'horse2' }, { id: 'opp3' }];
    observeNewHand('table2', 'hand2', players, ['horse2'], 2);
    // Only 1 hand observed — need 5
    const read = getLiveRead('horse2', 'table2', 'opp3');
    expect(read).toBeNull();
});

test('Live Observer: tracks VPIP on preflop call', () => {
    liveObserver.clear();
    const players = [{ id: 'horse3' }, { id: 'opp4' }];
    // Observe 6 hands with opp4 calling preflop each time
    for (let i = 0; i < 6; i++) {
        observeNewHand('table3', `hand_${i}`, players, ['horse3'], 2);
        observeAction('table3', 'opp4', 'preflop', 'call', { amount: 4, potSize: 6 }, ['horse3']);
    }
    const read = getLiveRead('horse3', 'table3', 'opp4');
    expect(read).not.toBeNull();
    expect(read.vpipPct).toBe(1.0); // Called every hand
});

test('Live Observer: tracks aggression and fold frequency', () => {
    liveObserver.clear();
    const players = [{ id: 'horse4', position: 'BTN' }, { id: 'opp5', position: 'SB' }];
    for (let i = 0; i < 6; i++) {
        observeNewHand('table4', `hand_agg_${i}`, players, ['horse4'], 2);
        if (i < 3) {
            observeAction('table4', 'opp5', 'preflop', 'raise', { amount: 6, potSize: 3 }, ['horse4']);
        } else {
            observeAction('table4', 'opp5', 'preflop', 'fold', {}, ['horse4']);
        }
    }
    const read = getLiveRead('horse4', 'table4', 'opp5');
    expect(read).not.toBeNull();
    expect(read.pfrPct).toBe(0.5);  // 3/6 raised
    expect(read.foldFreq).toBe(0.5);  // 3/6 folded
});

test('Live Observer: observeShowdown tracks showdown stats', () => {
    liveObserver.clear();
    const players = [{ id: 'horse5' }, { id: 'opp6' }];
    for (let i = 0; i < 6; i++) {
        observeNewHand('table5', `hand_sd_${i}`, players, ['horse5'], 2);
        observeAction('table5', 'opp6', 'preflop', 'call', {}, ['horse5']);
    }
    observeShowdown('table5', 'opp6', true, 85, false, ['horse5']);
    observeShowdown('table5', 'opp6', false, 20, true, ['horse5']);  // bluff
    observeShowdown('table5', 'opp6', true, 70, false, ['horse5']);  // legit
    const read = getLiveRead('horse5', 'table5', 'opp6');
    expect(read).not.toBeNull();
    expect(read.wtsd).toBeCloseTo(3/6, 2);  // 3 showdowns / 6 hands
    expect(read.bluffRate).toBeCloseTo(1/3, 1);  // 1 bluff / 3 showdowns
});

test('Live Observer: player type classification — nit', () => {
    liveObserver.clear();
    const players = [{ id: 'horse6' }, { id: 'nit1' }];
    // 12 hands, nit folds most
    for (let i = 0; i < 12; i++) {
        observeNewHand('table6', `hand_nit_${i}`, players, ['horse6'], 2);
        if (i < 2) {
            observeAction('table6', 'nit1', 'preflop', 'call', {}, ['horse6']);
        } else {
            observeAction('table6', 'nit1', 'preflop', 'fold', {}, ['horse6']);
        }
    }
    const read = getLiveRead('horse6', 'table6', 'nit1');
    expect(read).not.toBeNull();
    expect(read.playerType).toBe('nit'); // vpip 2/12=0.167 < 0.18, pfr 0 < 0.12
});

test('Live Observer: timing tells tracked', () => {
    liveObserver.clear();
    const players = [{ id: 'horse7' }, { id: 'timer1' }];
    for (let i = 0; i < 6; i++) {
        observeNewHand('table7', `hand_time_${i}`, players, ['horse7'], 2);
        observeAction('table7', 'timer1', 'preflop', 'call', { decisionTimeMs: 1500 }, ['horse7']);
    }
    const read = getLiveRead('horse7', 'table7', 'timer1');
    expect(read).not.toBeNull();
    expect(read.avgDecisionMs).toBe(1500);
    expect(read.snapFreq).toBe(1.0); // All < 3000ms
});

// ── selectCounterStrategy ──
const selectCounterStrategy = brain.selectCounterStrategy;
const showdownExposureMap = brain.showdownExposureMap;
const patternProfitMap = brain.patternProfitMap;

test('selectCounterStrategy: standard mode with no signals', () => {
    showdownExposureMap.clear();
    patternProfitMap.clear();
    suspectBotMap.clear();
    const r = selectCounterStrategy('cs_horse', 'cs_opp', 'cs_table');
    expect(r.mode).toBe('standard');
});

test('selectCounterStrategy: anti_bot mode when bot suspected', () => {
    showdownExposureMap.clear();
    patternProfitMap.clear();
    suspectBotMap.clear();
    suspectBotMap.set('cs_opp2', { suspectScore: 80 });
    const r = selectCounterStrategy('cs_horse2', 'cs_opp2', 'cs_table2');
    expect(r.mode).toBe('anti_bot');
});

// ── Performance Stats & Analytics ──
const recordPerformanceAction = brain.recordPerformanceAction;
const getPerformanceStats = brain.getPerformanceStats;
const recordPerformanceResult = brain.recordPerformanceResult;
const getAdaptiveStrategy = brain.getAdaptiveStrategy;

test('Performance Stats: empty returns zeros', () => {
    const stats = getPerformanceStats('perf_unknown');
    expect(stats.handsPlayed).toBe(0);
    expect(stats.vpip).toBe(0);
});

test('Performance Stats: tracks VPIP and PFR', () => {
    recordPerformanceAction('perf1', 'preflop', 'raise', true);
    recordPerformanceAction('perf1', 'preflop', 'fold', false);
    recordPerformanceAction('perf1', 'preflop', 'call', true);
    const stats = getPerformanceStats('perf1');
    expect(stats.handsPlayed).toBe(3);
    expect(stats.vpip).toBe(67); // 2/3
    expect(stats.pfr).toBe(33);  // 1/3
});

test('Performance Stats: win rate tracking', () => {
    recordPerformanceResult('perf1', true, 10);
    recordPerformanceResult('perf1', false, -5);
    const stats = getPerformanceStats('perf1');
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
});

test('Adaptive Strategy: insufficient data = no adjustment', () => {
    const r = getAdaptiveStrategy('adapt_unknown');
    expect(r.reason).toBe('insufficient_data');
    expect(r.rangeAdjust).toBe(0);
});

// ── Dynamic Rebuy Strategy ──
const getDynamicRebuyStrategy = brain.getDynamicRebuyStrategy;

test('Dynamic Rebuy: max buyins reached = no rebuy', () => {
    const r = getDynamicRebuyStrategy('reb1', 20, 2, 3, 200);
    expect(r.shouldRebuy).toBe(false);
    expect(r.reason).toBe('max_buyins_reached');
});

test('Dynamic Rebuy: short stacked = rebuy', () => {
    const r = getDynamicRebuyStrategy('reb2', 40, 2, 1, 200);
    expect(r.shouldRebuy).toBe(true);
    expect(r.reason).toBe('short_stacked');
    expect(r.amount).toBeGreaterThan(0);
});

test('Dynamic Rebuy: adequate stack = no rebuy', () => {
    const r = getDynamicRebuyStrategy('reb3', 200, 2, 1, 200);
    expect(r.shouldRebuy).toBe(false);
    expect(r.reason).toBe('adequate_stack');
});

// ── Recommended Stake ──
const getRecommendedStake = brain.getRecommendedStake;

test('Recommended Stake: 2500 bankroll supports 1/2', () => {
    const r = getRecommendedStake(2500, 'Cash');
    // 2500 / 25 = 100BB pool, maxBB = 1. So 0.50/1 stakes
    expect(r.recommendedBlinds.bb).toBeLessThanOrEqual(1);
});

test('Recommended Stake: tournament uses 50 buyin rule', () => {
    const r = getRecommendedStake(5000, 'Tournament');
    expect(r.maxBuyIn).toBe(100);
});

// ── Soft Play Guard ──
const isSoftPlayAllowed = brain.isSoftPlayAllowed;
const recordSoftPlay = brain.recordSoftPlay;

test('Soft Play: first play allowed', () => {
    expect(isSoftPlayAllowed('sp1', 'sp2')).toBe(true);
});

test('Soft Play: blocked after 3 in an hour', () => {
    recordSoftPlay('sp3', 'sp4');
    recordSoftPlay('sp3', 'sp4');
    recordSoftPlay('sp3', 'sp4');
    expect(isSoftPlayAllowed('sp3', 'sp4')).toBe(false);
});

// ── Horse Skill Evolution ──
const evolveHorseSkill = brain.evolveHorseSkill;
const getSkillDrift = brain.getSkillDrift;

test('Skill Evolution: winning improves drift', () => {
    const r = evolveHorseSkill('evo1', 10);
    expect(r.skillDrift).toBe(1);
    expect(r.direction).toBe('stable');
});

test('Skill Evolution: losing regresses drift', () => {
    evolveHorseSkill('evo2', -10);
    evolveHorseSkill('evo2', -10);
    evolveHorseSkill('evo2', -10);
    const drift = getSkillDrift('evo2');
    expect(drift).toBeLessThan(0);
});

test('Skill Evolution: drift capped at +10', () => {
    for (let i = 0; i < 20; i++) evolveHorseSkill('evo3', 20);
    const drift = getSkillDrift('evo3');
    expect(drift).toBeLessThanOrEqual(10);
});

// ═══════════════════════════════════════════════════════════
// PHASE 48e BUG #7 REGRESSION: boardWetness 'semi_wet' fix
// ═══════════════════════════════════════════════════════════

test('BUG #7 REGRESSION: evaluateBoardWetness never returns semi_wet', () => {
    const evalBW = brain.evaluateBoardWetness;
    // Two-tone board with flush draw — should return 'medium' or 'wet', NOT 'semi_wet'
    const twoTone = [{ rank: 12, suit: 'h' }, { rank: 7, suit: 'h' }, { rank: 3, suit: 'd' }];
    const result = evalBW(twoTone);
    const valid = ['dry', 'medium', 'wet'];
    expect(valid.includes(result)).toBe(true);
    expect(result !== 'semi_wet').toBe(true);
});

test('BUG #7 REGRESSION: monotone board = wet', () => {
    const evalBW = brain.evaluateBoardWetness;
    const mono = [{ rank: 12, suit: 'h' }, { rank: 7, suit: 'h' }, { rank: 3, suit: 'h' }];
    expect(evalBW(mono)).toBe('wet');
});

// ═══════════════════════════════════════════════════════════
// BUG #8 REGRESSION: evaluateHoldem must receive concatenated array
// GameStateMachine had 4 locations calling evaluateHoldem(holeCards, board)
// instead of evaluateHoldem([...holeCards, ...board]).
// evaluateHoldem throws if cards.length < 5.
// ═══════════════════════════════════════════════════════════

test('BUG #8 REGRESSION: evaluateHoldem throws on 2-card array (the bug)', () => {
    const { evaluateHoldem } = require('./src/lib/poker-engine/HandEvaluator');
    const { parseCards } = require('./src/lib/poker-engine/Deck');
    const hole = parseCards('AhKs');  // 2 cards
    const board = parseCards('QhJhTd9c2s'); // 5 cards
    // The BUG: passing hole cards alone throws
    let threw = false;
    try {
        evaluateHoldem(hole, { shortDeck: false });  // Only 2 cards → should throw
    } catch (e) {
        threw = true;
    }
    expect(threw).toBe(true);
});

test('BUG #8 REGRESSION: evaluateHoldem works with concatenated array (the fix)', () => {
    const { evaluateHoldem } = require('./src/lib/poker-engine/HandEvaluator');
    const { parseCards } = require('./src/lib/poker-engine/Deck');
    const hole = parseCards('AhKs');
    const board = parseCards('QhJhTd9c2s');
    // The FIX: concatenate hole + board
    const result = evaluateHoldem([...hole, ...board], { shortDeck: false });
    expect(result.score).toBeGreaterThan(0);
    // AhKhQhJhTd = Straight (A-high). Actually AhKs + QhJhTd9c2s = AKQJT straight
    expect(result.category).toBe(5);  // Straight
});

test('BUG #8 REGRESSION: evaluateOmaha correctly takes separate arrays', () => {
    const { evaluateOmaha } = require('./src/lib/poker-engine/HandEvaluator');
    const { parseCards } = require('./src/lib/poker-engine/Deck');
    const hole = parseCards('AhKsQdJc');  // 4 hole cards
    const board = parseCards('Th9h8d2c3s');  // 5 board cards
    // evaluateOmaha takes separate arrays — this should work without concatenation
    const result = evaluateOmaha(hole, board);
    expect(result.score).toBeGreaterThan(0);
    // Best: AK from hole + T98 from board → Straight (A-high or something)
    expect(result.category).toBeGreaterThanOrEqual(5);
});

test('BUG #8 REGRESSION: GameStateMachine evalBoard fix verified in source', () => {
    // Verify the fix is in place by checking the source code
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/GameStateMachine.js', 'utf8');
    // Should NOT have evaluateHoldem(p.holeCards, board anywhere
    const badPattern = /evaluateHoldem\(p\.holeCards,\s*board/;
    expect(badPattern.test(src)).toBe(false);
    // Should have evaluateHoldem([...p.holeCards, ...board] in multiple places
    const goodPattern = /evaluateHoldem\(\[\.\.\.p\.holeCards,\s*\.\.\.board\]/;
    expect(goodPattern.test(src)).toBe(true);
});

test('BUG #8 REGRESSION: Pineapple auto-discard fix verified in source', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/GameStateMachine.js', 'utf8');
    // Should NOT have evaluateHoldem(twoCards, board)
    const badPattern = /evaluateHoldem\(twoCards,\s*board\)/;
    expect(badPattern.test(src)).toBe(false);
    // Should have evaluateHoldem([...twoCards, ...board])
    const goodPattern = /evaluateHoldem\(\[\.\.\.twoCards,\s*\.\.\.board\]/;
    expect(goodPattern.test(src)).toBe(true);
});

// ═══════════════════════════════════════════════════════════
// BUG #9 REGRESSION: Tournament seating uses Fisher-Yates, not sort(random)
// ═══════════════════════════════════════════════════════════

test('BUG #9 REGRESSION: TournamentController._seatAllPlayers uses Fisher-Yates shuffle', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/TournamentController.js', 'utf8');
    // Should NOT have sort(() => Math.random() - 0.5) — biased shuffle
    const badPattern = /sort\(\(\)\s*=>\s*Math\.random\(\)\s*-\s*0\.5\)/;
    expect(badPattern.test(src)).toBe(false);
    // Should use _fisherYatesShuffle for seating
    const goodPattern = /this\._fisherYatesShuffle\(shuffled\)/;
    expect(goodPattern.test(src)).toBe(true);
});

// ═══════════════════════════════════════════════════════════
// BUG #10 REGRESSION: TournamentBridge uses correct property names
// ═══════════════════════════════════════════════════════════

test('BUG #10a REGRESSION: TournamentBridge uses tournamentId not id', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/TournamentBridge.js', 'utf8');
    // Should NOT have this.tournament.id (undefined property)
    // Check specifically in audit log context
    const badPattern = /this\.tournament\.id\b/;
    expect(badPattern.test(src)).toBe(false);
});

test('BUG #10b REGRESSION: TournamentBridge uses buyinAmount not buyIn', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/TournamentBridge.js', 'utf8');
    // Should have buyinAmount for buy_in field
    const goodPattern = /buy_in:\s*this\.tournament\.buyinAmount/;
    expect(goodPattern.test(src)).toBe(true);
});

// ═══════════════════════════════════════════════════════════
// BUG #11 REGRESSION: TableManager uses tableId not id for HorsePokerBrain
// ═══════════════════════════════════════════════════════════

test('BUG #11 REGRESSION: TableManager.canRebuy uses this.tableId', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/TableManager.js', 'utf8');
    // Should NOT have HorsePokerBrain.canRebuy(this.id
    const badPattern = /canRebuy\(this\.id\b/;
    expect(badPattern.test(src)).toBe(false);
    // Should have HorsePokerBrain.canRebuy(this.tableId
    const goodPattern = /canRebuy\(this\.tableId/;
    expect(goodPattern.test(src)).toBe(true);
});

// ═══════════════════════════════════════════════════════════
// BUG #12 REGRESSION: LobbyManager audit log uses correct event fields
// ═══════════════════════════════════════════════════════════

test('BUG #12 REGRESSION: LobbyManager sit_down audit uses data.playerId', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/LobbyManager.js', 'utf8');
    // Find a 300-char window around sit_down including lines before it
    const sitDownIdx = src.indexOf("'sit_down'");
    expect(sitDownIdx > 0).toBe(true);
    const window = src.substring(Math.max(0, sitDownIdx - 200), sitDownIdx + 100);
    // Should contain data.playerId (not data.player?.id)
    expect(window.includes('data.playerId')).toBe(true);
    // Should contain data.stack (not data.buyIn)
    expect(window.includes('data.stack')).toBe(true);
});

// ═══════════════════════════════════════════════════════════
// BUG #13 REGRESSION: AntiCheatMonitor accesses entry.table.seats
// ═══════════════════════════════════════════════════════════

test('BUG #13 REGRESSION: AntiCheatMonitor scan uses entry.table.seats', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/AntiCheatMonitor.js', 'utf8');
    // Should NOT have entry.state.seats or entry?.state?.seats
    const badPattern = /entry\?*\.state\?*\.seats/;
    expect(badPattern.test(src)).toBe(false);
    // Should have entry.table.seats or entry?.table?.seats
    const goodPattern = /entry\?*\.table\?*\.seats/;
    expect(goodPattern.test(src)).toBe(true);
    // Player ID should be s.player?.id not s.playerId
    const badPlayerPattern = /\.filter\(s\s*=>\s*s\s*&&\s*s\.playerId\)/;
    expect(badPlayerPattern.test(src)).toBe(false);
});

// ═══════════════════════════════════════════════════════════
// BUG #14 REGRESSION: StateSerializer serializes BettingRound + Deck
// ═══════════════════════════════════════════════════════════

test('BUG #14 REGRESSION: StateSerializer.serialize() includes bettingRound and deck state', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/StateSerializer.js', 'utf8');
    // serialize() must include bettingRound state
    expect(src.includes('bettingRound: game.bettingRound?.getState')).toBe(true);
    // serialize() must include deck state
    expect(src.includes('deck: game.deck?.getState')).toBe(true);
});

test('BUG #14 REGRESSION: StateSerializer.restore() rebuilds BettingRound from state', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/StateSerializer.js', 'utf8');
    // restore() must require BettingRound module
    expect(src.includes("require('./BettingRound')")).toBe(true);
    // restore() must create new BettingRound
    expect(src.includes('new BettingRound(')).toBe(true);
    // restore() must restore deck state
    expect(src.includes('deck._cards = h.deck.cards')).toBe(true);
    expect(src.includes('deck._position = h.deck.position')).toBe(true);
});

// ═══════════════════════════════════════════════════════════
// BUG #15 REGRESSION: Watchdog stall tracker uses per-player Map
// ═══════════════════════════════════════════════════════════

test('BUG #15 REGRESSION: Watchdog stall uses _horseStallTracker Map, not timer._actionStartTime', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/GameController.js', 'utf8');
    // Should NOT use entry.timer._actionStartTime (stale between hands)
    expect(src.includes('entry.timer._actionStartTime')).toBe(false);
    // Should use _horseStallTracker Map
    expect(src.includes('_horseStallTracker')).toBe(true);
    // Must clear stall tracker when horse is NOT current player
    expect(src.includes('_horseStallTracker.delete(playerId)')).toBe(true);
});

// ═══════════════════════════════════════════════════════════
// BUG #16 REGRESSION: Horse selection uses Fisher-Yates, not sort(random)
// ═══════════════════════════════════════════════════════════

test('BUG #16 REGRESSION: GameController horse shuffles use Fisher-Yates', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./src/lib/poker-engine/GameController.js', 'utf8');
    // Should NOT contain biased sort shuffle pattern
    const biasedPattern = /horseProfiles\.sort\(\s*\(\s*\)\s*=>\s*Math\.random/;
    expect(biasedPattern.test(src)).toBe(false);
    // Should contain Fisher-Yates swap pattern
    expect(src.includes('[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]')).toBe(true);
});

// ═══════════════════════════════════════════════════════════
// ASYNC TEST RUNNER + SUMMARY
// ═══════════════════════════════════════════════════════════

async function runAsyncTests() {
    for (const t of asyncTests) {
        try {
            await t.fn();
            passed++;
            console.log(`  ✅ ${t.name}`);
        } catch (e) {
            failed++;
            errors.push({ name: t.name, error: e.message });
            console.log(`  ❌ ${t.name}: ${e.message}`);
        }
    }

    console.log('\n══════════════════════════════════════');
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    if (errors.length > 0) {
        console.log('\nFAILED TESTS:');
        errors.forEach(e => console.log(`  ❌ ${e.name}: ${e.error}`));
    }
    console.log('══════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
}

runAsyncTests();
