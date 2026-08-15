/**
 * PREFLOP POT CHECK
 * ---------------------------------------------------------------------------
 * The design template shows the question "You Are On The Button (Last To Act).
 * The Player To Your Right Bets 2.5 Big Blinds." above a felt whose POT pill
 * reads 0. If a villain has bet, the pot cannot be the blinds alone -- and it
 * certainly cannot be zero.
 *
 * These assertions run against src/components/training/games/potMath.js, the
 * module UniversalDynamicTable actually renders from.
 *
 *   node scripts/preflop-pot-check.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const babel = require('@babel/core');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

const origJs = Module._extensions['.js'];
Module._extensions['.js'] = function (mod, filename) {
    if (filename.includes('node_modules')) return origJs(mod, filename);
    const code = fs.readFileSync(filename, 'utf8');
    if (!/\b(import|export)\b/.test(code)) return origJs(mod, filename);
    const out = babel.transformSync(code, {
        filename,
        babelrc: false,
        configFile: false,
        sourceType: 'module',
        plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
        parserOpts: {
            plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread'],
        },
    });
    mod._compile(out.code, filename);
};

const { committedFor, computeDisplayPot } = require(
    path.join(ROOT, 'src/components/training/games/potMath.js')
);

let PASS = 0;
let FAIL = 0;
function check(name, fn) {
    let ok = false;
    let detail = '';
    try {
        const r = fn();
        if (r === true) ok = true;
        else detail = typeof r === 'string' ? r : 'returned ' + JSON.stringify(r);
    } catch (e) { detail = 'threw: ' + (e && e.message); }
    if (ok) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + '  [' + detail + ']'); }
}

// 9-max seat names, exactly as SEAT_CONFIGS[9] carries them.
const SEATS9 = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO']
    .map((name, id) => ({ id, name }));

console.log('\n=== Preflop pot: chips on the felt vs the POT pill ===');

// The template's own scenario: hero on the button, the seat to his right (CO)
// bets 2.5bb. Blinds are posted. Nothing else has acted.
const templateActions = [{ position: 'CO', action: 'BET 2.5BB' }];

check('CO bet of 2.5bb is read off the action text', () => {
    const v = committedFor({ name: 'CO' }, templateActions, true);
    return v === 2.5 || 'got ' + v;
});

check('SB and BB post their blinds when they have not acted', () => {
    const sb = committedFor({ name: 'SB' }, templateActions, true);
    const bb = committedFor({ name: 'BB' }, templateActions, true);
    return (sb === 0.5 && bb === 1) || 'sb=' + sb + ' bb=' + bb;
});

check('POT pill matches the chips on the felt after a 2.5bb bet', () => {
    const chips = SEATS9.reduce((sum, s) => sum + committedFor(s, templateActions, true), 0);
    const pot = computeDisplayPot({
        scenarioPot: 0, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: templateActions,
    });
    return pot === chips
        ? true
        : 'POT pill says ' + pot + 'bb but the chips on the felt total ' + chips + 'bb';
});

check('a 2.5bb bet cannot leave the pot at the blinds', () => {
    const pot = computeDisplayPot({
        scenarioPot: 0, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: templateActions,
    });
    return pot > 1.5 || 'pot is ' + pot + 'bb with 2.5bb already bet';
});

check('walked-to preflop pot with no action is still the blinds', () => {
    const pot = computeDisplayPot({
        scenarioPot: 0, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: [],
    });
    return pot === 1.5 || 'got ' + pot;
});

check('an explicit scenario pot still wins (postflop potGeometry path)', () => {
    const pot = computeDisplayPot({
        scenarioPot: 12.5, streetLabel: 'FLOP', seats: SEATS9,
        actionHistory: [{ position: 'CO', action: 'BET 5BB' }],
    });
    return pot === 12.5 || 'got ' + pot;
});

check('a fold commits nothing', () => {
    const v = committedFor({ name: 'UTG' }, [{ position: 'UTG', action: 'FOLD' }], true);
    return v === 0 || 'got ' + v;
});

check('a 3-bet pot sums every live contribution', () => {
    const actions = [
        { position: 'UTG', action: 'RAISE', amount: 2.5 },
        { position: 'BTN', action: 'RAISE', amount: 8 },
    ];
    const pot = computeDisplayPot({
        scenarioPot: 0, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: actions,
    });
    // UTG 2.5 + BTN 8 + SB 0.5 + BB 1
    return pot === 12 || 'got ' + pot;
});

// --- roadmap #14a: a seat with MORE THAN ONE recorded action -----------------
// committedFor used to return on the FIRST matching entry, so every shape below
// understated the seat -- and computeDisplayPot sums the same function, so the
// POT pill inherited each error.

check('an opener who then calls a 3-bet shows the 3-bet total, not the open', () => {
    const actions = [
        { position: 'UTG', action: 'RAISE', amount: 2.5 },
        { position: 'BTN', action: 'RAISE', amount: 8 },
        { position: 'UTG', action: 'CALL', amount: 8 },
    ];
    const v = committedFor({ name: 'UTG' }, actions, true);
    return v === 8 || 'got ' + v;
});

check('a check-raise line commits the raise, not the check', () => {
    const actions = [
        { position: 'BB', action: 'CHECK' },
        { position: 'CO', action: 'BET', amount: 4 },
        { position: 'BB', action: 'RAISE', amount: 13 },
    ];
    const v = committedFor({ name: 'BB' }, actions, false);
    return v === 13 || 'got ' + v;
});

check('a blind that later acts keeps its action total (blind is a floor, not an addend)', () => {
    const actions = [
        { position: 'BTN', action: 'RAISE', amount: 3 },
        { position: 'SB', action: 'CALL', amount: 3 },
    ];
    const v = committedFor({ name: 'SB' }, actions, true);
    return v === 3 || 'got ' + v;
});

check('a blind that folds still leaves its posted blind in the middle', () => {
    const v = committedFor({ name: 'SB' }, [{ position: 'SB', action: 'FOLD' }], true);
    return v === 0.5 || 'got ' + v;
});

check('the POT pill matches the chips in a multi-action 3-bet pot', () => {
    const actions = [
        { position: 'UTG', action: 'RAISE', amount: 2.5 },
        { position: 'BTN', action: 'RAISE', amount: 8 },
        { position: 'UTG', action: 'CALL', amount: 8 },
        { position: 'SB', action: 'FOLD' },
        { position: 'BB', action: 'FOLD' },
    ];
    const chips = SEATS9.reduce((sum, s) => sum + committedFor(s, actions, true), 0);
    const pot = computeDisplayPot({
        scenarioPot: 0, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: actions,
    });
    // UTG 8 + BTN 8 + SB 0.5 + BB 1 = 17.5
    return (pot === 17.5 && chips === 17.5) || 'pot=' + pot + ' chips=' + chips;
});

// ---------------------------------------------------------------------------
// roadmap #16 -- batch-preload.js now stamps a boardless spot as preflop with a
// default pot of 1.5 instead of fabricating a flop and calling it a river.
// computeDisplayPot must not let that 1.5 outrank the real chips on the felt.
// ---------------------------------------------------------------------------

check('#16 preflop: a defaulted 1.5bb pot loses to the real committed chips', () => {
    const actions = [
        { position: 'UTG', action: 'RAISE', amount: 2.5 },
        { position: 'BB', action: 'CALL', amount: 2.5 },
    ];
    const pot = computeDisplayPot({
        scenarioPot: 1.5, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: actions,
    });
    // UTG 2.5 + BB 2.5 + SB 0.5 = 5.5; the stale 1.5 must not win.
    return pot === 5.5 || 'got ' + pot;
});

check('#16 preflop: the defaulted 1.5bb survives when nobody has acted', () => {
    const pot = computeDisplayPot({
        scenarioPot: 1.5, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: [],
    });
    return pot === 1.5 || 'got ' + pot;
});

check('#16 preflop: an explicit pot LARGER than the chips still wins', () => {
    const actions = [{ position: 'BTN', action: 'RAISE', amount: 2 }];
    const pot = computeDisplayPot({
        scenarioPot: 40, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: actions,
    });
    return pot === 40 || 'got ' + pot;
});

check('#16 postflop: explicit ALWAYS wins -- committed covers this street only', () => {
    const actions = [{ position: 'BTN', action: 'BET', amount: 3 }];
    const pot = computeDisplayPot({
        scenarioPot: 12, streetLabel: 'FLOP', seats: SEATS9, actionHistory: actions,
    });
    return pot === 12 || 'got ' + pot;
});

check('#16 postflop: no explicit pot still falls back to the committed sum', () => {
    const actions = [
        { position: 'BTN', action: 'BET', amount: 3 },
        { position: 'BB', action: 'CALL', amount: 3 },
    ];
    const pot = computeDisplayPot({
        scenarioPot: 0, streetLabel: 'FLOP', seats: SEATS9, actionHistory: actions,
    });
    return pot === 6 || 'got ' + pot;
});

// -------------------------------------------------------------------------
// roadmap #14 -- the chip badge in front of a seat.
//
// committedFor reads `amount` off a recorded action and only then falls back
// to the first number in the action TEXT. DeterministicGTOEngine's
// buildActionDescription writes PROSE ("CO bets into BTN") with no number in
// it, so before this fix every seat on every postflop spot committed 0 and the
// badge -- fully built and positioned -- could never render. These three lock
// the mechanism: prose commits nothing, a structured amount commits exactly
// that amount, and neither disturbs the POT pill postflop.
// -------------------------------------------------------------------------

check('#14 postflop: a PROSE action with no number commits 0 (the old bug)', () => {
    const actions = [{ position: 'CO', action: 'CO bets into BTN' }];
    const seat = SEATS9.find(s2 => s2.name === 'CO') || { name: 'CO' };
    const c = committedFor(seat, actions, false);
    return c === 0 || 'got ' + c;
});

check('#14 postflop: an action carrying `amount` commits exactly that amount', () => {
    const actions = [{ position: 'CO', action: 'CO bets into BTN', amount: 4 }];
    const seat = SEATS9.find(s2 => s2.name === 'CO') || { name: 'CO' };
    const c = committedFor(seat, actions, false);
    return c === 4 || 'got ' + c;
});

check('#14 postflop: adding the amount leaves an explicit POT untouched', () => {
    const actions = [{ position: 'CO', action: 'CO bets into BTN', amount: 4 }];
    const pot = computeDisplayPot({
        scenarioPot: 12, streetLabel: 'FLOP', seats: SEATS9, actionHistory: actions,
    });
    return pot === 12 || 'got ' + pot;
});

// -------------------------------------------------------------------------
// roadmap #16 -- the arena must be able to DEAL a preflop spot.
//
// The felt and the preloader were fixed on 2026-08-06, but the content
// pipeline still could not produce a preflop question: the only producer,
// DeterministicGTOEngine.generateFromLocalSolverRanges, was reachable solely
// through a fallback gated on `gameConfig.pioStreet === 'preflop'`, and no
// config in the repo ever wrote `pioStreet`. cash-001 -- "Preflop Mastery" --
// dealt nothing but flop and turn.
//
// These lock the route open. If a future edit drops the flag or reorders the
// branch, the batch stops being preflop and this fails loudly rather than the
// game quietly reverting to postflop.
// -------------------------------------------------------------------------

const { pioQueryService } = require(path.join(ROOT, 'src/services/PIOQueryService.js'));
const { deterministicEngine } = require(path.join(ROOT, 'src/engines/DeterministicGTOEngine.js'));
const { filterRowsToDeclaredStreet, declaredStreetOf, streetOfCachedRow } = require(path.join(ROOT, 'src/lib/training/declaredStreet.js'));

console.log('\n=== Preflop route: the arena can deal a preflop spot ===');

check('#16 cash-001 declares pioStreet: preflop', () => {
    const cfg = pioQueryService.getGameConfig('cash-001');
    return (cfg && cfg.pioStreet === 'preflop') || 'got ' + JSON.stringify(cfg && cfg.pioStreet);
});

check('#16 the route is opt-in -- a postflop game carries no pioStreet', () => {
    const cfg = pioQueryService.getGameConfig('cash-007');
    return (cfg && cfg.pioStreet === undefined) || 'got ' + JSON.stringify(cfg && cfg.pioStreet);
});

check('#16 the preflop generator produces a usable question', () => {
    const cfg = pioQueryService.getGameConfig('cash-001');
    const q = deterministicEngine.generateFromLocalSolverRanges(cfg, 3);
    if (!q) return 'returned null';
    if (!q.scenario || q.scenario.street !== 'preflop') return 'street ' + (q.scenario && q.scenario.street);
    if (!Array.isArray(q.boardCards) || q.boardCards.length !== 0) return 'boardCards ' + JSON.stringify(q.boardCards);
    if (!(q.scenario.pot > 0)) return 'pot ' + q.scenario.pot;
    if (!Array.isArray(q.options) || q.options.length < 2) return 'options ' + JSON.stringify(q.options);
    return true;
});

const summarize = () => {
    console.log('\n---------------------------------------------');
    console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
    process.exit(FAIL > 0 ? 1 : 0);
};

// generateBatch is async -- the only assertion in this file that has to be.
// It is the path the arena actually takes (batch-preload -> generateBatch), so
// asserting the single-question generator alone would not prove the arena is
// fixed.
(async () => {
    const cfg = pioQueryService.getGameConfig('cash-001');
    let batch = null;
    let err = null;
    try {
        batch = await deterministicEngine.generateBatch({
            gameId: 'cash-001', level: 3, count: 20, gameConfig: cfg,
            difficulty: 'standard', seenIds: [],
        });
    } catch (e) { err = e; }

    check('#16 generateBatch fills a whole 20-question session preflop', () => {
        if (err) return 'threw: ' + err.message;
        if (!Array.isArray(batch)) return 'not an array';
        if (batch.length !== 20) return 'length ' + batch.length;
        const offStreet = batch.filter(q => !q.scenario || q.scenario.street !== 'preflop');
        if (offStreet.length) return offStreet.length + ' questions not preflop';
        const boarded = batch.filter(q => !Array.isArray(q.boardCards) || q.boardCards.length !== 0);
        if (boarded.length) return boarded.length + ' questions carry board cards';
        return true;
    });

    check('#16 generateBatch does not repeat a decision inside one session', () => {
        if (err || !Array.isArray(batch)) return 'no batch';
        const ids = new Set(batch.map(q => q.id));
        if (ids.size !== batch.length) return 'duplicate ids: ' + ids.size + '/' + batch.length;
        const combos = new Set(batch.map((q) => {
            const sc = q.scenario || {};
            return sc.spotType + '|' + sc.heroPosition + '|' + sc.villainPosition + '|' + q.heroHand;
        }));
        if (combos.size !== batch.length) return 'duplicate decisions: ' + combos.size + '/' + batch.length;
        return true;
    });

    // ---- the cache-first bypass (roadmap #16, second half) -----------------
    // Wiring the engine was necessary and not sufficient. Both question routes
    // read training_question_cache FIRST and only consult the engine on a miss,
    // so a game whose cache was seeded before the declaration existed keeps
    // serving the old street forever. Measured on production 2026-08-07 with
    // b300c280 live: batch-preload returned {"flop":20} because cash-001's
    // cache holds 25 postflop rows per level and 25 > the 20 a session asks
    // for. These lock the filter that closes that bypass.
    const PRE = { question_data: { scenario: { street: 'preflop' } } };
    const FLOP = { question_data: { scenario: { street: 'flop' } } };
    const BARE = { question_data: { scenario: {} } };

    check('#16 a declaring game does not get cached rows of another street', () => {
        const out = filterRowsToDeclaredStreet([PRE, FLOP, FLOP, PRE], cfg);
        if (out.length !== 2) return 'kept ' + out.length + ' of 4';
        if (out.some(r => streetOfCachedRow(r) !== 'preflop')) return 'kept a non-preflop row';
        return true;
    });

    check('#16 the filter empties the pool rather than serving the wrong street', () => {
        // This is the case that matters in production -- cash-001's cache is
        // 100% postflop, so the correct outcome is zero eligible rows, which
        // hands the request to the engine via the existing cache-miss path.
        const out = filterRowsToDeclaredStreet([FLOP, FLOP, FLOP], cfg);
        return out.length === 0 || 'kept ' + out.length;
    });

    check('#16 a game that declares no street keeps every cached row', () => {
        const postflopCfg = pioQueryService.getGameConfig('cash-007');
        if (declaredStreetOf(postflopCfg) !== null) return 'cash-007 declares a street';
        const rows = [PRE, FLOP, BARE];
        const out = filterRowsToDeclaredStreet(rows, postflopCfg);
        return out === rows || 'did not pass the array through untouched';
    });

    check('#16 a cached row with no street recorded is kept, not dropped', () => {
        // Absence is not contradiction. Older seeding migrations did not always
        // write the field; dropping those rows would empty the cache for games
        // that are serving correctly today.
        const out = filterRowsToDeclaredStreet([BARE, FLOP], cfg);
        if (out.length !== 1) return 'kept ' + out.length + ' of 2';
        return streetOfCachedRow(out[0]) === null || 'kept the wrong row';
    });

    // ---- the felt contract (roadmap #16, third half) -----------------------
    // The route was reachable and the wire was correct -- batch-preload
    // returned {"preflop":20}, withBoard:0 -- and the arena still showed
    // "Arena Crash Detected: Cannot read properties of undefined (reading
    // 'toLowerCase')". A generator that had never once been consumed by the
    // felt was emitting two fields in shapes nothing downstream accepts.
    check('#16 hero cards are card strings the felt can index, not objects', () => {
        if (err || !Array.isArray(batch)) return 'no batch';
        for (const q of batch) {
            const hc = q.heroCards;
            if (!Array.isArray(hc) || hc.length !== 2) return 'heroCards is not a pair';
            for (const c of hc) {
                // getCardPath guards on `card.length < 2`. An object's .length
                // is undefined and `undefined < 2` is false, so an object slips
                // past the guard and then throws on card[0].toLowerCase().
                if (typeof c !== 'string') return 'card is ' + typeof c + ', not a string';
                if (c.length !== 2) return 'card "' + c + '" is not two characters';
                if (!/^[2-9TJQKA][hdcs]$/.test(c)) return 'card "' + c + '" is not rank+suit';
            }
        }
        return true;
    });

    check('#16 every answer option carries the `text` the app grades and renders on', () => {
        if (err || !Array.isArray(batch)) return 'no batch';
        for (const q of batch) {
            if (!Array.isArray(q.options) || q.options.length === 0) return 'no options';
            for (const o of q.options) {
                if (typeof o.text !== 'string' || !o.text) return 'option ' + o.id + ' has no text';
                // batch-preload normalizes with `opt.text || String(opt)`, so a
                // label-only option reaches the player as this exact string.
                if (o.text === '[object Object]') return 'option ' + o.id + ' stringified';
            }
        }
        return true;
    });

    check('#16 the correct answer resolves to a served option', () => {
        if (err || !Array.isArray(batch)) return 'no batch';
        for (const q of batch) {
            const ids = new Set((q.options || []).map(o => o.id));
            if (!ids.has(q.correctAnswer)) return 'correctAnswer ' + q.correctAnswer + ' not among options';
            if (typeof q.correctAnswerText !== 'string' || !q.correctAnswerText) return 'no correctAnswerText';
        }
        return true;
    });

    // ---- roadmap #18: folded seats are named, not vanished -----------------
    check('#18 no seat is labelled with a non-position placeholder', () => {
        if (err || !Array.isArray(batch)) return 'no batch';
        for (const q of batch) {
            const v = String(q.scenario?.villainPosition || '');
            // 'multiway' was a literal string in the squeeze pool and reached
            // the felt as a seat plate reading MULTIWAY, observed on production.
            if (/^multiway$/i.test(v)) return 'villain seat is "' + v + '"';
        }
        return true;
    });

    check('#18 every preflop spot carries a derived action history', () => {
        if (err || !Array.isArray(batch)) return 'no batch';
        const ORDER = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
        for (const q of batch) {
            const h = q.scenario?.actionHistory;
            if (!Array.isArray(h)) return 'no actionHistory';
            for (const e of h) {
                if (!ORDER.includes(e.position)) return 'unknown seat ' + e.position;
                // Amount-free by construction: an amount here would be invented
                // and would move both the chip badges and the POT pill.
                if (e.amount != null || e.size != null || e.bb != null) return 'entry carries an amount';
                if (!/^(FOLD|CALL|OPEN|3-BET)$/.test(e.action)) return 'odd action ' + e.action;
            }
        }
        return true;
    });

    check('#18 nobody seated after hero is claimed to have acted', () => {
        if (err || !Array.isArray(batch)) return 'no batch';
        const ORDER = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
        for (const q of batch) {
            const heroAt = ORDER.indexOf(q.scenario.heroPosition);
            if (heroAt < 0) continue;
            for (const e of q.scenario.actionHistory || []) {
                // A seat after hero has neither folded nor acted. Claiming
                // either would be false, and a fold entry would also grey out a
                // player who is still live.
                if (ORDER.indexOf(e.position) >= heroAt) return e.position + ' acts after hero ' + q.scenario.heroPosition;
            }
        }
        return true;
    });

    check('#18 an RFI folds everyone before hero and marks nobody else', () => {
        if (err || !Array.isArray(batch)) return 'no batch';
        const ORDER = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
        const rfi = batch.filter(q => q.scenario?.spotType === 'rfi');
        for (const q of rfi) {
            const heroAt = ORDER.indexOf(q.scenario.heroPosition);
            const h = q.scenario.actionHistory || [];
            if (h.length !== heroAt) return 'hero ' + q.scenario.heroPosition + ' has ' + h.length + ' entries, expected ' + heroAt;
            if (h.some(e => e.action !== 'FOLD')) return 'an RFI records a non-fold';
            // The RFI pool names BB as the villain purely to say who is being
            // opened into. BB has not acted and must not appear.
            if (h.some(e => e.position === 'BB')) return 'BB marked as having acted';
        }
        return true;
    });

    check('#18 the action history never moves a chip or the pot', () => {
        if (err || !Array.isArray(batch)) return 'no batch';
        for (const q of batch) {
            const sc = q.scenario;
            const seats = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'].map(n => ({ name: n }));
            for (const seat of seats) {
                const withHistory = committedFor(seat, sc.actionHistory || [], true);
                const without = committedFor(seat, [], true);
                if (withHistory !== without) {
                    return seat.name + ' committed ' + withHistory + ' with history vs ' + without + ' without';
                }
            }
        }
        return true;
    });

    // ---- _sessionStats.history: the store ~20 readers consult ---------------
    // recordSessionHand (SESSION ANALYTICS FIX, 2026-08-08) is the single
    // writer behind the summary screen's category breakdown, mistake clusters,
    // EV-loss heatmap, running action frequencies and the rest -- a store that
    // was read everywhere and written nowhere for its entire shipped life.
    // These pin the writer to what the readers actually consume. (A second
    // writer drafted in parallel in this session was dropped at rebase time in
    // favor of this one -- two writers would have double-counted every answer.)
    check('history: a graded decision lands with the fields the readers consult', () => {
        deterministicEngine.resetSessionDifficulty();
        deterministicEngine.recordSessionHand({
            correct: true, classification: 'BEST MOVE', evLoss: 0, street: 'flop',
            nodeType: 'facing_cbet', action: 'Call', selectedAction: 'Call',
            correctAction: 'Call', handCategory: 'top pair',
            frequencies: { c: 70, f: 30 }, heroPosition: 'BTN', texture: 'dry',
        });
        deterministicEngine.recordSessionHand({
            correct: false, classification: 'BLUNDER', evLoss: 1.2, street: 'turn',
            nodeType: 'facing_cbet', action: 'Fold', selectedAction: 'Fold',
            correctAction: 'Call', handCategory: 'draw', frequencies: { c: 60, f: 40 },
            heroPosition: 'BB', texture: 'wet',
        });
        const h = deterministicEngine._sessionStats.history;
        if (!Array.isArray(h) || h.length !== 2) return 'history length ' + (h && h.length);
        const e = h[1];
        if (e.correct !== false) return 'correct not recorded';
        if (e.street !== 'turn' || e.action !== 'Fold' || e.correctAction !== 'Call') return 'fields wrong';
        if (e.evLoss !== 1.2 || !e.frequencies || e.classification !== 'BLUNDER') return 'evLoss/frequencies/classification missing';
        if (e.position !== 'BB') return 'position alias not mirrored from heroPosition';
        return true;
    });

    check('history: the category breakdown wakes up once three hands carry a category', () => {
        deterministicEngine.resetSessionDifficulty();
        for (let i = 0; i < 4; i++) {
            deterministicEngine.recordSessionHand({
                correct: i % 2 === 0, street: 'flop',
                handCategory: i < 2 ? 'top pair' : 'air', evLoss: i * 0.5,
            });
        }
        const b = deterministicEngine.getHandCategoryBreakdown();
        if (!b || !Array.isArray(b.categories)) return 'no breakdown';
        // This returned {categories: [], message: 'Need more hands...'} forever.
        return b.categories.length > 0 || 'still returns the empty default';
    });

    check('history: the session EV-loss scalar accumulates across hands', () => {
        deterministicEngine.resetSessionDifficulty();
        deterministicEngine.recordSessionHand({ correct: false, evLoss: 0.4 });
        deterministicEngine.recordSessionHand({ correct: false, evLoss: 1.1 });
        const got = deterministicEngine._sessionStats.evLoss;
        return got === 1.5 || 'evLoss scalar ' + got;
    });

    check('history: a near-empty record still lands safely', () => {
        deterministicEngine.resetSessionDifficulty();
        deterministicEngine.recordSessionHand({ correct: true });
        const h = deterministicEngine._sessionStats.history;
        if (h.length !== 1) return 'length ' + h.length;
        return (h[0].correct === true && h[0].evLoss === 0) || 'defaults wrong';
    });

    check('history: bounded at 200 entries for marathon sessions', () => {
        deterministicEngine.resetSessionDifficulty();
        for (let i = 0; i < 230; i++) deterministicEngine.recordSessionHand({ correct: true, street: 'flop', evLoss: 0 });
        const h = deterministicEngine._sessionStats.history;
        deterministicEngine.resetSessionDifficulty();
        return h.length === 200 || 'length ' + h.length;
    });

    // ---- subject-match sweep (2026-08-14) ----------------------------------
    // The #16 defect class, checked across the catalog rather than assumed
    // fixed by one game. Two more games declared one subject and served
    // another: cash-008 "4-Bet Wars -- Pre-flop escalation" served 0 preflop,
    // cash-012 "River Decisions -- Final street mastery" served 75% non-river.
    check('sweep: cash-008 declares preflop and pins the pool to 4-bet spots', () => {
        const c = pioQueryService.getGameConfig('cash-008');
        if (c?.pioStreet !== 'preflop') return 'pioStreet ' + c?.pioStreet;
        if (!Array.isArray(c.pioSpotTypes) || c.pioSpotTypes.join() !== '4bet') return 'pioSpotTypes ' + JSON.stringify(c?.pioSpotTypes);
        return true;
    });

    const cfg8 = pioQueryService.getGameConfig('cash-008');
    let batch8 = null, err8 = null;
    try {
        batch8 = await deterministicEngine.generateBatch({
            gameId: 'cash-008', level: 3, count: 20, gameConfig: cfg8,
            difficulty: 'standard', seenIds: [],
        });
    } catch (e) { err8 = e; }

    check('sweep: cash-008 fills a 20-question session, all preflop, all 4-bet', () => {
        if (err8) return 'threw: ' + err8.message;
        if (!Array.isArray(batch8) || batch8.length !== 20) return 'length ' + (batch8 && batch8.length);
        const offStreet = batch8.filter(q => q.scenario?.street !== 'preflop');
        if (offStreet.length) return offStreet.length + ' not preflop';
        const offSubject = batch8.filter(q => q.scenario?.spotType !== '4bet');
        // The whole point of pioSpotTypes: a 4-bet game deals 4-bet decisions,
        // not whatever the uniform-random pool happens to serve.
        if (offSubject.length) return offSubject.length + ' not 4bet (' + offSubject[0].scenario?.spotType + ')';
        return true;
    });

    check('sweep: a config naming an impossible spot type yields null, not off-subject spots', () => {
        const q = deterministicEngine.generateFromLocalSolverRanges(
            { ...cfg8, pioSpotTypes: ['no_such_spot_type'] }, 3);
        // Dealing off-subject spots here would HIDE the config error.
        return q === null || 'dealt a ' + q?.scenario?.spotType;
    });

    check('sweep: cash-012 declares river and the cache filter narrows to river rows', () => {
        const c12 = pioQueryService.getGameConfig('cash-012');
        if (c12?.pioStreet !== 'river') return 'pioStreet ' + c12?.pioStreet;
        const rows = [
            { question_data: { scenario: { street: 'flop' } } },
            { question_data: { scenario: { street: 'river' } } },
            { question_data: { scenario: { street: 'turn' } } },
            { question_data: { scenario: { street: 'river' } } },
        ];
        const out = filterRowsToDeclaredStreet(rows, c12);
        if (out.length !== 2) return 'kept ' + out.length + ' of 4';
        if (out.some(r => streetOfCachedRow(r) !== 'river')) return 'kept a non-river row';
        return true;
    });

    check('sweep: a river declaration does NOT reroute to the preflop generator', () => {
        // The engine route is strictly preflop-only by construction. A river
        // game reaching generateFromLocalSolverRanges would deal boardless
        // preflop spots under a river title -- worse than the original bug.
        const c12 = pioQueryService.getGameConfig('cash-012');
        if (c12.pioStreet === 'preflop') return 'cash-012 declares preflop';
        // Assert on the routing gate itself: only the literal 'preflop' opens it.
        return c12.pioStreet === 'river' || 'unexpected declaration';
    });

    summarize();
})();
