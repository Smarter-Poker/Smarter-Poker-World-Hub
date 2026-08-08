/**
 * GAME CATALOG CHECK -- the durable contract over the ENTIRE training library.
 * ---------------------------------------------------------------------------
 *   node scripts/game-catalog-check.js [categorySubstring]
 *
 * Iterates EVERY game id in TRAINING_LIBRARY across representative levels
 * (1, 5, 8, and the registry max 12) and drives the REAL local generation
 * path each game routes to in production (batch-preload.js -> generateBatch):
 *
 *   SCENARIO   (psy-001..psy-020, cash-020)  -> psychologyQuestionBank
 *   preflop    (cash-001, pioStreet flag)    -> generateFromLocalSolverRanges
 *   ICMIZER    (mtt-001, mtt-016, cash-010)  -> generateFromCharts, driven
 *              with synthetic memory_charts_gold rows (the REAL chart code,
 *              lift-and-evaluate; live rows are DB) -- counted CHART-SYNTH
 *   PioSOLVER  level >= 8                    -> PostflopScenarioGenerator
 *   PioSOLVER  level 1-7                     -> DB pool, NOT runnable offline
 *              -> counted SKIPPED-DB, with config-routing coherence asserted
 *
 * Per generated question, asserts:
 *   1. a question is actually produced (zero-question class must never return)
 *   2. correctAnswer is one of the offered options
 *   3. frequencies, when present, are non-negative and sum to ~100 (+-1)
 *   4. hero cards valid, distinct, no collision with board
 *   5. board length matches street (preflop 0 / flop 3 / turn 4 / river 5)
 *   6. pot/stack sanity: pot > 0, pot plausible for the narrated line,
 *      stack > 0, SPR finite
 *   7. no impossible action order (positionOrder.js is the truth)
 *   8. no emoji in any user-facing string of the payload
 *
 * Loads project ESM/TS through Babel + sucrase require hooks (no build step).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const babel = require('@babel/core');
const sucrase = require('sucrase');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

// -- Babel require hook: transpile project ESM to CJS on the fly ------------
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

// -- sucrase require hook for the .ts config modules -------------------------
Module._extensions['.ts'] = function (mod, filename) {
    const code = fs.readFileSync(filename, 'utf8');
    const out = sucrase.transform(code, {
        transforms: ['typescript', 'imports'],
        filePath: filename,
    });
    mod._compile(out.code, filename);
};

// -- project modules (the REAL production code) ------------------------------
const { TRAINING_LIBRARY } = require(path.join(ROOT, 'src/data/TRAINING_LIBRARY.js'));
const { GAME_CONFIGS, getStackDepthNumber } = require(path.join(ROOT, 'src/config/gameConfigs.js'));
const { pioQueryService } = require(path.join(ROOT, 'src/services/PIOQueryService.js'));
const { getGameScenarioConfig } = require(path.join(ROOT, 'src/config/GameScenarioMap.ts'));
const { LEVEL_REGISTRY } = require(path.join(ROOT, 'src/config/LevelRegistry.ts'));
const { DeterministicGTOEngine } = require(path.join(ROOT, 'src/engines/DeterministicGTOEngine.js'));
const { applyDeterministicEnginePatches } = require(path.join(ROOT, 'src/engines/deterministicEnginePatches.js'));
const { heroActsFirstPostflop } = require(path.join(ROOT, 'src/engines/positionOrder.js'));
const { getPsychologyGameIds } = require(path.join(ROOT, 'src/data/psychologyQuestionBank.js'));

// -- tallies ----------------------------------------------------------------
let PASS = 0;
let FAIL = 0;
const failures = [];
function ok(cond, label, detail) {
    if (cond) { PASS++; return true; }
    FAIL++;
    failures.push(label + (detail ? ' -- ' + detail : ''));
    return false;
}

const QUESTIONS_PER_CELL = 12;
const LEVELS = [1, 5, 8, 12];
const REGISTRY_MAX = Math.max(...Object.keys(LEVEL_REGISTRY).map(Number));

const KNOWN_PIO_GAME_TYPES = new Set([
    'hu_cash', 'postflop_complete',
    'mtt_6max_icm', 'mtt_9max_icm', 'mtt_6max_chipev', 'mtt_9max_chipev',
    'mtt_3max_chipev', 'mtt_hu_chipev',
    'spin_3max_chipev', 'spin_3max_icm', 'spin_hu_chipev', 'spin_hu_icm',
]);

// -- emoji detection (approved: suits and listed geometric/arrow marks) ------
const ALLOWED_SYMBOLS = new Set([
    '♠', '♡', '♢', '♣', '♤', '♥', '♦', '♧', // card suits
    '✓', '✕', // check / cross marks
]);
function findEmoji(value) {
    const bad = [];
    for (const ch of String(value)) {
        if (ALLOWED_SYMBOLS.has(ch)) continue;
        const cp = ch.codePointAt(0);
        if ((cp >= 0x1F000 && cp <= 0x1FAFF) ||           // emoji planes
            (cp >= 0x2600 && cp <= 0x27BF) ||             // misc symbols + dingbats
            (cp >= 0x2B00 && cp <= 0x2BFF) ||             // misc symbols and arrows
            cp === 0xFE0F) {                              // variation selector
            bad.push(ch);
        }
    }
    return bad;
}
function collectStrings(node, out, depth = 0) {
    if (depth > 6 || node == null) return out;
    if (typeof node === 'string') { out.push(node); return out; }
    if (Array.isArray(node)) { for (const v of node) collectStrings(v, out, depth + 1); return out; }
    if (typeof node === 'object') { for (const k of Object.keys(node)) collectStrings(node[k], out, depth + 1); }
    return out;
}

// -- card helpers -----------------------------------------------------------
const CARD_RE = /^[2-9TJQKA][cdhs]$/i;
function normCard(c) { return String(c || '').trim().toUpperCase(); }

// -- per-question assertion battery -----------------------------------------
function assertQuestion(q, ctx) {
    const L = ctx + ' q=' + (q && q.id);

    // 2. correctAnswer among offered options
    const opts = Array.isArray(q.options) ? q.options : [];
    ok(opts.length >= 2, L + ' has >=2 options', 'got ' + opts.length);
    const optIds = opts.map(o => (o && typeof o === 'object') ? o.id : o);
    ok(q.correctAnswer != null && optIds.includes(q.correctAnswer),
        L + ' correctAnswer within options',
        'correctAnswer=' + q.correctAnswer + ' optionIds=' + JSON.stringify(optIds));

    // options must carry renderable text (the [object Object] class of bug)
    for (const o of opts) {
        if (o && typeof o === 'object') {
            ok(typeof o.text === 'string' && o.text.length > 0,
                L + ' option ' + o.id + ' has text', JSON.stringify(o));
        }
    }

    // 3. frequencies non-negative, sum ~100
    const gf = q.gtoFrequencies;
    if (gf && typeof gf === 'object' && Object.keys(gf).length > 0) {
        const vals = Object.values(gf).map(Number);
        ok(vals.every(v => Number.isFinite(v) && v >= 0),
            L + ' frequencies non-negative', JSON.stringify(gf));
        const sum = vals.reduce((a, b) => a + b, 0);
        ok(Math.abs(sum - 100) <= 1,
            L + ' frequencies sum ~100', 'sum=' + sum + ' ' + JSON.stringify(gf));
    }

    const scenario = (q.scenario && typeof q.scenario === 'object') ? q.scenario : {};
    const isPsych = scenario.isPsychology === true || q.source === 'PSYCHOLOGY_BANK';

    if (!isPsych) {
        // 4. hero cards valid, distinct, no board collision
        const hero = Array.isArray(q.heroCards) ? q.heroCards : [];
        const board = Array.isArray(q.boardCards) ? q.boardCards : [];
        ok(hero.length === 2 && hero.every(c => CARD_RE.test(String(c))),
            L + ' hero cards valid', JSON.stringify(hero));
        const all = hero.concat(board).map(normCard);
        ok(new Set(all).size === all.length,
            L + ' hero/board cards distinct', JSON.stringify(all));
        ok(board.every(c => CARD_RE.test(String(c))),
            L + ' board cards valid', JSON.stringify(board));

        // 5. board length matches street
        const street = String(scenario.street || q.street || '').toLowerCase();
        const expected = { preflop: 0, flop: 3, turn: 4, river: 5 }[street];
        if (expected !== undefined) {
            ok(board.length === expected,
                L + ' board length matches street', street + ' board=' + JSON.stringify(board));
        } else {
            ok([0, 3, 4, 5].includes(board.length),
                L + ' board length legal for some street', JSON.stringify(board));
        }

        // 6. pot / stack sanity
        const pot = Number(scenario.pot != null ? scenario.pot : scenario.potSize);
        const stack = Number(scenario.heroStack != null ? scenario.heroStack
            : (scenario.stackDepth != null ? scenario.stackDepth : scenario.effectiveStack));
        ok(Number.isFinite(pot) && pot > 0, L + ' pot > 0', 'pot=' + scenario.pot);
        ok(Number.isFinite(stack) && stack > 0, L + ' stack > 0', 'stack=' + stack);
        ok(Number.isFinite(stack / pot), L + ' SPR finite', stack + '/' + pot);

        // pot consistent with the narrated action line
        const text = [q.question, scenario.context, scenario.title, q.explanation]
            .filter(Boolean).join(' | ');
        if (street && street !== 'preflop') {
            // postflop heads-up pot: at minimum both players matched an open
            ok(pot >= 4, L + ' postflop pot covers narrated preflop action', 'pot=' + pot);
            if (/3-?bet pot/i.test(text)) {
                ok(pot >= 15, L + ' 3-bet-pot narration has 3-bet-sized pot', 'pot=' + pot + ' ctx=' + scenario.context);
            }
        } else if (street === 'preflop') {
            ok(pot >= 1 && pot <= 30, L + ' preflop pot plausible', 'pot=' + pot);
            if (/action folds to you/i.test(text)) {
                ok(pot <= 2.5, L + ' unopened pot is blinds only', 'pot=' + pot);
            }
            if (/opens and \w+ calls/i.test(text)) {
                ok(pot >= 4, L + ' open+call narration puts open+call in pot', 'pot=' + pot);
            }
        }

        // 7. impossible action order (positionOrder.js is the truth)
        const heroPos = scenario.heroPosition;
        const villPos = scenario.villainPosition;
        if (street && street !== 'preflop' && heroPos && villPos &&
            /checks to you|villain checks|opponent checks/i.test(text)) {
            ok(!heroActsFirstPostflop(heroPos, villPos),
                L + ' villain-checked narration requires villain to act first',
                heroPos + ' vs ' + villPos + ' :: ' + text.slice(0, 120));
        }
        const hist = Array.isArray(scenario.actionHistory) ? scenario.actionHistory : [];
        if (street === 'preflop' && hist.length > 0 && heroPos) {
            const ORDER = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
            const hIdx = ORDER.indexOf(String(heroPos).toUpperCase());
            for (const h of hist) {
                const aIdx = ORDER.indexOf(String(h.position || '').toUpperCase());
                ok(aIdx >= 0 && (hIdx < 0 || aIdx < hIdx),
                    L + ' preflop history only narrates seats acting before hero',
                    JSON.stringify(h) + ' hero=' + heroPos);
            }
        }
    }

    // 8. no emoji anywhere in the payload
    const strings = collectStrings(q, []);
    for (const s of strings) {
        const bad = findEmoji(s);
        if (bad.length > 0) {
            ok(false, L + ' no emoji in payload', JSON.stringify(bad) + ' in ' + JSON.stringify(s.slice(0, 80)));
            break; // one report per question is enough
        }
    }
}

// -- synthetic memory_charts_gold rows (drives the REAL chart builder) -------
function syntheticCharts() {
    const push = (hands) => Object.fromEntries(Object.entries(hands).map(([h, f]) => [h, { push: f, fold: 1 - f }]));
    const call = (hands) => Object.fromEntries(Object.entries(hands).map(([h, f]) => [h, { call: f, fold: 1 - f }]));
    const rows = [];
    for (const depth of [10, 15, 40]) {
        rows.push({
            id: 'synth-push-' + depth, stack_depth: depth, hero_position: 'SB',
            villain_action: 'fold_to_hero',
            hand_matrix: push({ 'AA': 1, 'A5s': 0.95, 'K7o': 0.55, 'T8s': 0.45, 'J4o': 0.1, '72o': 0 }),
        });
        rows.push({
            id: 'synth-call-' + depth, stack_depth: depth, hero_position: 'BB',
            villain_action: 'sb_push',
            hand_matrix: call({ 'AA': 1, 'ATs': 0.9, 'QTs': 0.55, 'J8s': 0.35, '93o': 0 }),
        });
    }
    return rows;
}
function chartStubClient(rows) {
    const builder = {
        _min: -Infinity, _max: Infinity,
        select() { return builder; },
        lte(_col, max) { builder._max = max; return builder; },
        gte(_col, min) { builder._min = min; return builder; },
        limit(n) {
            const windowed = rows.filter(r => r.stack_depth >= builder._min && r.stack_depth <= builder._max);
            return Promise.resolve({ data: windowed.slice(0, n), error: null });
        },
    };
    return {
        from(table) {
            if (table !== 'memory_charts_gold') {
                throw new Error('catalog-check stub only serves memory_charts_gold, got ' + table);
            }
            return builder;
        },
    };
}

// -- routing coherence for DB-only cells ------------------------------------
function assertRoutingCoherence(game, pioCfg, label) {
    ok(!!pioCfg, label + ' has PIOQueryService config');
    if (pioCfg && pioCfg.sourceOfTruth === 'PioSOLVER') {
        ok(KNOWN_PIO_GAME_TYPES.has(pioCfg.pioGameType),
            label + ' pioGameType is a real scenario family', String(pioCfg.pioGameType));
        ok(Number.isFinite(pioCfg.pioStackDepth) && pioCfg.pioStackDepth > 0,
            label + ' pioStackDepth positive', String(pioCfg.pioStackDepth));
    }
    const gameCfg = GAME_CONFIGS[game.id];
    ok(!!gameCfg, label + ' has GAME_CONFIGS entry');
    if (gameCfg) {
        ok(gameCfg.players >= 2 && gameCfg.players <= 9, label + ' players 2-9', String(gameCfg.players));
        ok(getStackDepthNumber(String(gameCfg.stackDepth || '').toLowerCase()) > 0,
            label + ' stackDepth parses', String(gameCfg.stackDepth));
    }
    const sc = getGameScenarioConfig(game.id);
    ok(!!sc, label + ' has GameScenarioMap entry');
    if (sc) {
        ok(Array.isArray(sc.scenarioLevels) && sc.scenarioLevels.length > 0 &&
            sc.scenarioLevels.every(l => l >= 1 && l <= 10),
            label + ' scenarioLevels within generator range 1-10', JSON.stringify(sc.scenarioLevels));
        ok(Array.isArray(sc.spotTypes) && sc.spotTypes.length > 0, label + ' spotTypes non-empty');
        if (sc.stackDepths) {
            ok(sc.stackDepths.every(d => Number.isFinite(d) && d > 0),
                label + ' stackDepths positive', JSON.stringify(sc.stackDepths));
        }
    }
}

// -- main -------------------------------------------------------------------
async function main() {
    const filter = (process.argv[2] || '').toUpperCase();

    // registry-level contract
    ok(TRAINING_LIBRARY.length === 107, 'catalog has 107 games', 'got ' + TRAINING_LIBRARY.length);
    ok(REGISTRY_MAX === 12, 'LevelRegistry max level is 12', 'got ' + REGISTRY_MAX);
    // the past clamp-to-10 bug must stay dead in both API entry points
    for (const api of ['pages/api/training/batch-preload.js', 'pages/api/training/get-question.js']) {
        const src = fs.readFileSync(path.join(ROOT, api), 'utf8');
        ok(/Math\.min\(12,\s*Math\.max\(1,/.test(src), api + ' clamps level to 12 (not 10)');
    }

    // Every SCENARIO-routed game must own a dedicated bank bucket. The bank
    // silently serves a general pool for unknown ids, which would mask a
    // renamed/missing bucket -- the exact mechanism behind the 2026-07
    // zero-question psychology audit finding.
    const bankIds = new Set(getPsychologyGameIds());
    for (const g of TRAINING_LIBRARY) {
        const cfg = pioQueryService.getGameConfig(g.id);
        if (cfg && cfg.sourceOfTruth === 'SCENARIO') {
            ok(bankIds.has(g.id), '[' + g.id + '] has a dedicated psychology-bank bucket');
        }
    }

    const engine = new DeterministicGTOEngine();
    applyDeterministicEnginePatches(engine);

    const totals = { games: 0, questions: 0, cells: 0, skippedDb: 0, chartSynth: 0 };
    const games = TRAINING_LIBRARY.filter(g => !filter || g.category.toUpperCase().includes(filter));

    for (const game of games) {
        totals.games++;
        const pioCfg = pioQueryService.getGameConfig(game.id);
        const gameCfg = GAME_CONFIGS[game.id];
        const label = '[' + game.id + ']';

        assertRoutingCoherence(game, pioCfg, label);

        const isScenario = (pioCfg && pioCfg.sourceOfTruth === 'SCENARIO') ||
            (gameCfg && gameCfg.engine === 'SCENARIO');
        const isChart = pioCfg && pioCfg.sourceOfTruth === 'ICMIZER';
        const isPreflopLocal = pioCfg && pioCfg.pioStreet === 'preflop';

        for (const level of LEVELS) {
            const cell = label + ' L' + level;
            totals.cells++;

            let mode;
            if (isScenario) mode = 'SCENARIO';
            else if (isPreflopLocal) mode = 'PREFLOP';
            else if (isChart) mode = 'CHART-SYNTH';
            else if (level >= 8) mode = 'POSTFLOP';
            else mode = 'SKIPPED-DB';

            if (mode === 'SKIPPED-DB') {
                totals.skippedDb++;
                continue; // coherence already asserted per game
            }

            if (mode === 'CHART-SYNTH') {
                engine.setSupabaseClient(chartStubClient(syntheticCharts()));
                totals.chartSynth++;
            }

            const scenarioConfig = getGameScenarioConfig(game.id);
            let batch = [];
            try {
                batch = await engine.generateBatch({
                    gameId: game.id,
                    level,
                    count: QUESTIONS_PER_CELL,
                    gameConfig: pioCfg || gameCfg || { id: game.id, sourceOfTruth: 'SCENARIO' },
                    targetPositions: (scenarioConfig && scenarioConfig.positions) || undefined,
                    difficulty: 'standard',
                    scenarioLevels: (scenarioConfig && scenarioConfig.scenarioLevels) || undefined,
                    spotTypes: (scenarioConfig && scenarioConfig.spotTypes) || undefined,
                    stackDepths: (scenarioConfig && scenarioConfig.stackDepths) || undefined,
                    seenIds: [],
                });
            } catch (e) {
                ok(false, cell + ' generation throws', e && e.message);
                continue;
            }

            // 1. questions actually produced -- the zero-question class
            ok(Array.isArray(batch) && batch.length > 0,
                cell + ' [' + mode + '] produces questions', 'got ' + (batch ? batch.length : 'null'));
            if (mode === 'SCENARIO' && Array.isArray(batch) && batch.length > 0) {
                ok(batch.length === QUESTIONS_PER_CELL,
                    cell + ' scenario bank fills the request', 'got ' + batch.length + '/' + QUESTIONS_PER_CELL);
            }

            for (const q of (batch || [])) {
                totals.questions++;
                assertQuestion(q, cell);
            }
        }
    }

    console.log('\n=============================================');
    console.log('GAME CATALOG CHECK');
    console.log('  games covered:     ' + totals.games + ' / ' + TRAINING_LIBRARY.length);
    console.log('  game/level cells:  ' + totals.cells);
    console.log('  questions checked: ' + totals.questions);
    console.log('  SKIPPED-DB cells:  ' + totals.skippedDb + ' (PIO solver pool, DB-only)');
    console.log('  CHART-SYNTH cells: ' + totals.chartSynth + ' (real chart code, synthetic rows)');
    console.log('  PASS ' + PASS + '   FAIL ' + FAIL);
    if (failures.length) {
        console.log('\nFailures:');
        failures.forEach(f => console.log('  - ' + f));
    }
    process.exit(FAIL > 0 ? 1 : 0);
}

main().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
