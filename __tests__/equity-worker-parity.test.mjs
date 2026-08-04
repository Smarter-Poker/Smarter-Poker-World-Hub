/**
 * Build-time guard: the equity Web Worker must compute the same numbers as the
 * synchronous engine.
 *
 * WHY THIS EXISTS
 * src/lib/sandbox/equityWorkerSource.js holds a *copy* of the Monte Carlo core
 * from src/lib/sandbox/EquityEngine.js (the block between the
 * `@equity-core:start/end` sentinels), serialised as a string so it can be run
 * from a Blob URL without any webpack/worker config.
 *
 * That duplication has one dangerous failure mode: edit the maths in
 * EquityEngine.js, forget to regenerate the worker source, and the app keeps
 * working — the worker just silently computes the OLD maths for every user
 * whose browser supports Workers, while anyone on the fallback path gets the
 * new maths. No error, no crash, two different answers for the same hand.
 *
 * A second, quieter failure: if the worker body references an identifier that
 * was not inlined into the string, it throws inside the worker at runtime, the
 * engine marks itself broken, and everything silently falls back to the
 * synchronous path forever — i.e. the perf work is dead and nobody notices.
 *
 * This test catches both by actually executing the worker source and comparing
 * its output, seeded, against the real engine.
 *
 * Both files are evaluated in a `vm` context from their raw text rather than
 * imported, because EquityEngine.js uses extensionless imports that Node's ESM
 * loader rejects (webpack resolves them fine).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = path.join(ROOT, 'src/lib/sandbox/EquityEngine.js');
const WORKER = path.join(ROOT, 'src/lib/sandbox/equityWorkerSource.js');

const present = fs.existsSync(ENGINE) && fs.existsSync(WORKER);

/** Strip ESM syntax so a module's body can run inside a vm context. */
function toScript(src) {
    return src
        // import ... from '...';  /  import '...';
        .replace(/^[ \t]*import[\s\S]*?from\s*['"][^'"]+['"];?[ \t]*$/gm, '')
        .replace(/^[ \t]*import\s*['"][^'"]+['"];?[ \t]*$/gm, '')
        // export { a, b as c };  /  export * from '...';
        .replace(/^[ \t]*export\s*\{[^}]*\}\s*(from\s*['"][^'"]+['"])?;?[ \t]*$/gm, '')
        .replace(/^[ \t]*export\s+\*[^;]*;?[ \t]*$/gm, '')
        // export default X;
        .replace(/^[ \t]*export\s+default\s+/gm, 'var __default = ')
        // export const/let/var/function/class/async function
        .replace(/^[ \t]*export\s+(?=(const|let|var|function|class|async))/gm, '');
}

function sandboxGlobals(extra = {}) {
    return vm.createContext({
        console, Math, JSON, Set, Map, Array, Object, Number, String, Boolean,
        isFinite, isNaN, parseInt, parseFloat, Date: undefined, ...extra,
    });
}

/** Evaluate EquityEngine's module body and hand back its core functions. */
function loadEngine() {
    const ctx = sandboxGlobals();
    vm.runInContext(toScript(fs.readFileSync(ENGINE, 'utf8')), ctx, { timeout: 30000 });
    return {
        calculateEquity: vm.runInContext('calculateEquity', ctx),
        simulateRunouts: vm.runInContext('simulateRunouts', ctx),
    };
}

/** Boot the worker source with a fake `self` and return a request function. */
function loadWorker() {
    let posted = [];
    const self = { onmessage: null, postMessage: (m) => posted.push(m) };
    const ctx = sandboxGlobals({ self });
    const src = fs.readFileSync(WORKER, 'utf8');
    const match = src.match(/EQUITY_WORKER_SOURCE\s*=\s*([\s\S]+?);?\s*$/);
    assert.ok(match, 'could not find EQUITY_WORKER_SOURCE in equityWorkerSource.js');
    // Evaluate the module to obtain the string, then run that string.
    const modCtx = sandboxGlobals();
    vm.runInContext(toScript(src), modCtx, { timeout: 30000 });
    const body = vm.runInContext('EQUITY_WORKER_SOURCE', modCtx);
    assert.equal(typeof body, 'string', 'EQUITY_WORKER_SOURCE must be a string');
    assert.ok(body.length > 500, 'EQUITY_WORKER_SOURCE looks truncated');

    // This throws if the worker body references anything not inlined into it —
    // exactly the silent "falls back forever" bug.
    vm.runInContext(body, ctx, { timeout: 30000 });
    assert.equal(typeof self.onmessage, 'function', 'worker source did not install self.onmessage');

    return (op, payload) => {
        posted = [];
        self.onmessage({ data: { id: 1, op, ...payload } });
        const reply = posted[0];
        assert.ok(reply, `worker posted no reply for op=${op}`);
        assert.ok(reply.ok, `worker reported an error for op=${op}: ${reply.error}`);
        return reply.result;
    };
}

const cards = (s) => s.match(/.{2}/g);

// Seeded so worker and engine draw the identical Monte Carlo stream. If the
// engine ever loses its seed parameter these become flaky — that is itself a
// regression worth failing on.
const EQUITY_CASES = [
    { hero: 'AsAh', board: [], sims: 2000, range: null, seed: 12345 },
    { hero: 'AsKs', board: cards('QsJs2h'), sims: 2000, range: null, seed: 999 },
    { hero: '7c2d', board: cards('AhKdQs'), sims: 1500, range: 'AA', seed: 4242 },
    { hero: 'JdJc', board: cards('9h4s2c7d'), sims: 1500, range: 'AKs,QQ+', seed: 777 },
    // Whitespace inside the range string exercises the \s escape in the
    // serialised regex — a hand-edited template literal collapses it to `s`.
    { hero: 'Th9h', board: cards('8h7d2c'), sims: 1500, range: 'TT-88, AQo', seed: 31337 },
];

test('equity worker source evaluates and matches the synchronous engine', { skip: present ? false : 'EquityEngine/equityWorkerSource not in this checkout' }, () => {
    const engine = loadEngine();
    const ask = loadWorker();

    for (const c of EQUITY_CASES) {
        const hero = cards(c.hero);
        const sync = engine.calculateEquity(hero, c.board, c.sims, c.range, c.seed);
        const work = ask('equity', { hero, board: c.board, sims: c.sims, range: c.range, seed: c.seed });

        assert.equal(
            work.heroEquity, sync.heroEquity,
            `heroEquity drift for ${c.hero} vs ${c.range || 'random'} — the worker copy of the ` +
            `Monte Carlo core is out of sync with EquityEngine.js. Run: npm run gen:equity-worker` +
            ` to regenerate it from the @equity-core block.`,
        );
        assert.equal(work.sampleSize, sync.sampleSize, `sampleSize drift for ${c.hero}`);
        assert.equal(work.rangeCombos, sync.rangeCombos, `rangeCombos drift for ${c.hero} (range parsing differs)`);
    }
});

test('runout simulation matches between worker and engine', { skip: present ? false : 'not in this checkout' }, () => {
    const engine = loadEngine();
    const ask = loadWorker();
    const hero = cards('AsKs');
    const board = cards('QsJs2h');
    const sync = engine.simulateRunouts(hero, board, 60, null, 555);
    const work = ask('runouts', { hero, board, sims: 60, range: null, seed: 555 });

    assert.equal(work.baseline, sync.baseline, 'runout baseline drift — run: npm run gen:equity-worker');
    assert.equal(work.bestCards.length, sync.bestCards.length, 'runout bestCards length drift');
});

test('the synchronous engine still accepts a seed (this guard depends on it)', { skip: present ? false : 'not in this checkout' }, () => {
    const engine = loadEngine();
    const hero = cards('AsAh');
    const a = engine.calculateEquity(hero, [], 500, null, 2024);
    const b = engine.calculateEquity(hero, [], 500, null, 2024);
    assert.equal(a.heroEquity, b.heroEquity, 'seeded runs are not reproducible — the seed parameter has regressed, and worker/engine parity can no longer be proven');
});
