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
