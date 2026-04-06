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
// SUMMARY
// ═══════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (errors.length > 0) {
    console.log('\nFAILED TESTS:');
    errors.forEach(e => console.log(`  ❌ ${e.name}: ${e.error}`));
}
console.log('══════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
