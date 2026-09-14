/**
 * A SCRAPE THAT DIES MIDWAY STILL FINISHES ITS COHORT.
 *
 * poker_series_scraper.py cannot complete its cohort in one process. Its
 * session-drift handler closes the Scrapling session and calls
 * create_session() again, which raises
 *
 *     RuntimeError: cannot start sync Playwright inside a running event loop
 *         (scripts/poker_series_scraper.py:1325)
 *
 * after which every fetch returns "Context manager has been closed", the
 * circuit breaker trips, main() raises, and the step exits 1 and SMSes a human.
 *
 * MEASURED on run 34750952713 (2026-09-13, and every scheduled run since
 * 2026-08-30): the scraper reached series 76 of 221, wrote 921 events, and died
 * 22 minutes into a 150-minute budget. The other 128 minutes bought nothing.
 * 145 series went unscraped. A human was paged about a defect he cannot fix
 * from his phone, sixteen days running.
 *
 * THE FIX IS THE PROCESS BOUNDARY, NOT A RETRY. Two facts make repeating the
 * process a real fix and not a loop that hammers a broken thing:
 *
 *   1. The stuck event loop lives in THAT interpreter. Nothing survives exec,
 *      so pass 2 starts from the state pass 1 started from.
 *   2. load_missing_series() drops any series whose last_scraped is inside
 *      REFRESH_AFTER_HOURS (24h), so two passes minutes apart CANNOT repeat
 *      each other. The failing run logs it itself:
 *      "Skipping 84 fresh (<24h) -> 221 to scrape/refresh".
 *
 * WHAT IT DOES NOT DO: it does not fix the restart bug. That is inside
 * Scrapling's teardown and reproducing it needs scrapling 0.4.15 + camoufox
 * against the live anti-bot sites. This makes the bug cost a pass, not a run.
 *
 * WHAT THIS LAW GUARDS, in order of how quietly it would break:
 *
 *   - THE LOG FORMAT. The wrapper decides whether to keep going by counting
 *     "N/M events confirmed" out of the scraper's own output. Reword that line
 *     and the wrapper reads zero progress, stops after one pass, and the fix
 *     is gone with no error anywhere. So the producer's format is asserted
 *     against the consumer's regex, here, in the same repo.
 *   - THE WIRING. The step must go through the wrapper, and must NOT pass
 *     --max-minutes itself: the wrapper gives each pass what is left of the
 *     budget, and a second --max-minutes would silently cap every pass.
 *   - THE STOP CONDITIONS, executed rather than grepped. A loop over a live
 *     data-writing scraper has to be provable, so each one runs the real
 *     script against a stub.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts/multi-pass-scrape.sh');
const wrapper = readFileSync(SCRIPT, 'utf8');
const scraper = readFileSync(join(ROOT, 'scripts/poker_series_scraper.py'), 'utf8');
const workflow = readFileSync(
    join(ROOT, '.github/workflows/poker-series-auto-pilot.yml'), 'utf8');

/** The step the wrapper drives, sliced off at the next step. */
const scrapeStep = (() => {
    const start = workflow.indexOf('- name: Core Information Scrape');
    assert.ok(start > 0, 'the Core Information Scrape step must exist');
    const after = workflow.indexOf('- name: Alert Human (Core Scraper Failed)', start);
    assert.ok(after > start, 'its alert step must follow it');
    return workflow.slice(start, after);
})();

/** A default from the wrapper, e.g. defaultOf('EVENTS_RE'). */
function defaultOf(name) {
    const m = new RegExp(`^${name}="\\$\\{${name}:-(.*?)\\}"`, 'm').exec(wrapper);
    assert.ok(m, `${name} must have a default in ${SCRIPT}`);
    return m[1];
}

/** Run the real wrapper over a stub command. */
function runWrapper(env, ...command) {
    const dir = mkdtempSync(join(tmpdir(), 'multipass-law-'));
    try {
        const out = execFileSync('bash', [SCRIPT, ...command], {
            encoding: 'utf8',
            env: { ...process.env, STUB_DIR: dir, ...env },
        });
        return { code: 0, out };
    } catch (err) {
        return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * A stub that behaves like the scraper: it keeps "already scraped" in a file
 * (standing in for last_scraped in the DB), prints the same cohort line and the
 * same flush line, and dies partway with the same RuntimeError.
 */
const STUB = `#!/usr/bin/env bash
state="$STUB_DIR/done"; [ -f "$state" ] || echo 0 > "$state"
done_n=$(cat "$state"); total=\${STUB_TOTAL:-221}; per=\${STUB_PER_PASS:-76}
cohort=$(( total - done_n ))
echo "  Skipping $done_n fresh (<24h) → $cohort to scrape/refresh"
if [ "$cohort" -le 0 ]; then echo "100% COMPLETE!"; exit 0; fi
if [ "\${STUB_MODE:-crash}" = "barren" ]; then
  echo "    RuntimeError: cannot start sync Playwright inside a running event loop"
  exit 1
fi
n=$(( cohort < per ? cohort : per ))
echo "  [FLUSH] $n series → $n with events → $(( n * 5 ))/$(( n * 5 )) events confirmed written, avg_completeness=71"
echo $(( done_n + n )) > "$state"
if [ "$n" -lt "$per" ]; then exit 0; fi
echo "  ⚡ Drift detected — restarting session"
echo "    RuntimeError: cannot start sync Playwright inside a running event loop"
exit 1
`;

function withStub(body = STUB) {
    const dir = mkdtempSync(join(tmpdir(), 'multipass-stub-'));
    const path = join(dir, 'stub.sh');
    writeFileSync(path, body, { mode: 0o755 });
    return path;
}

// ── the format contract between the two files ────────────────────────────────

test('the scraper still logs the line the wrapper counts progress from', () => {
    // This is the assertion that stops the fix from evaporating in a reword.
    // The scraper's own f-string, reduced to what it prints for total=406:
    const emitted = '  [FLUSH] 12 series → 9 with events → 406/406 events confirmed '
        + 'written, avg_completeness=71';
    assert.match(scraper,
        /events confirmed written, avg_completeness=\{avg_score\}/,
        'poker_series_scraper.py must still emit "<n>/<m> events confirmed written"');
    assert.match(emitted, new RegExp(defaultOf('EVENTS_RE')),
        'EVENTS_RE must match the line the scraper actually prints');
});

test('and the cohort line the wrapper reads the remaining work from', () => {
    const emitted = '  Skipping 84 fresh (<24h) → 221 to scrape/refresh';
    assert.match(scraper, /to scrape\/refresh/,
        'load_missing_series must still log its cohort size');
    assert.match(emitted, new RegExp(defaultOf('COHORT_RE')),
        'COHORT_RE must match the line the scraper actually prints');
});

test('the 24h skip window is what makes a second pass resume instead of repeat', () => {
    assert.match(scraper, /^REFRESH_AFTER_HOURS\s*=\s*(\d+)/m,
        'the freshness window must exist; without it passes would repeat each other');
    const hours = Number(/^REFRESH_AFTER_HOURS\s*=\s*(\d+)/m.exec(scraper)[1]);
    assert.ok(hours >= 1,
        `a window of ${hours}h cannot outlast a single job, so pass 2 would redo pass 1`);
});

// ── the wiring ───────────────────────────────────────────────────────────────

test('the scheduled step runs the scraper through the wrapper', () => {
    assert.match(scrapeStep, /bash scripts\/multi-pass-scrape\.sh/,
        'a direct python3 call gets one pass and dies at series 76');
    assert.match(scrapeStep, /python3 scripts\/poker_series_scraper\.py/);
});

test('and does not pass --max-minutes itself, which would cap every pass', () => {
    assert.ok(!/--max-minutes/.test(scrapeStep.replace(/^\s*#.*$/gm, '')),
        'the wrapper gives each pass what is left of BUDGET_MIN; a second '
        + '--max-minutes would silently override it on every pass');
});

test('the budget fits inside the step timeout with room for the final flush', () => {
    const budget = Number(/BUDGET_MIN:\s*(\d+)/.exec(scrapeStep)?.[1]);
    const timeout = Number(/timeout-minutes:\s*(\d+)/.exec(scrapeStep)?.[1]);
    assert.ok(Number.isFinite(budget) && Number.isFinite(timeout),
        'both BUDGET_MIN and timeout-minutes must be set on the step');
    assert.ok(budget < timeout,
        `BUDGET_MIN ${budget} must be under timeout-minutes ${timeout}`);
    assert.ok(timeout - budget >= 10,
        `only ${timeout - budget}m of headroom: the last pass needs time to flush`);
    assert.ok(budget >= Number(defaultOf('MIN_PASS_MIN')),
        `BUDGET_MIN ${budget} cannot fit one pass of ${defaultOf('MIN_PASS_MIN')}m`);
});

// ── the stop conditions, run rather than read ───────────────────────────────

test('it keeps restarting through the crash until the cohort is drained', () => {
    const r = runWrapper({ BUDGET_MIN: '140', MIN_PASS_MIN: '1' }, withStub());
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /the cohort is empty/, r.out);
    const passes = Number(/multi-pass scrape: (\d+) pass\(es\)/.exec(r.out)[1]);
    assert.ok(passes >= 3,
        `221 series at 76 a pass needs 3+ passes; the wrapper ran ${passes}`);
    // 221 series x 5 events, written exactly once each - never twice.
    assert.match(r.out, /1105 event\(s\) written/,
        'a repeated pass would inflate this past 1105');
});

test('it stops instead of spinning when a pass writes nothing', () => {
    const stub = withStub(`#!/usr/bin/env bash
echo "  Skipping 0 fresh (<24h) → 221 to scrape/refresh"
echo "    RuntimeError: cannot start sync Playwright inside a running event loop"
exit 1
`);
    const r = runWrapper({ BUDGET_MIN: '140', MIN_PASS_MIN: '1', MAX_PASSES: '9' }, stub);
    assert.match(r.out, /multi-pass scrape: 1 pass\(es\)/,
        `a pass that wrote nothing must not buy another: ${r.out}`);
});

test('a run that wrote nothing at all still fails, and says so', () => {
    const stub = withStub(`#!/usr/bin/env bash
echo "  Skipping 0 fresh (<24h) → 221 to scrape/refresh"
exit 1
`);
    const r = runWrapper({ BUDGET_MIN: '140', MIN_PASS_MIN: '1' }, stub);
    assert.notEqual(r.code, 0, 'an unproductive run must page a human');
    assert.match(r.out, /::error title=Scrape wrote nothing/, r.out);
});

test('a productive run whose last pass crashed is green, and annotated', () => {
    // The 2026-09-13 shape exactly: real work written, then the RuntimeError.
    const r = runWrapper(
        { BUDGET_MIN: '140', MIN_PASS_MIN: '1', MAX_PASSES: '1' }, withStub());
    assert.equal(r.code, 0,
        '921 events written is not a failed run; an alarm always on gets muted');
    assert.match(r.out, /::warning title=Scrape finished with a failed pass/, r.out);
});

test('zero passes is a fault, not a quiet success', () => {
    const r = runWrapper({ BUDGET_MIN: '1', MIN_PASS_MIN: '15' }, withStub());
    assert.notEqual(r.code, 0, 'a step that scraped nothing must never report success');
    assert.match(r.out, /::error title=No scrape pass ran/, r.out);
});

test('it refuses to run with no command instead of looping on nothing', () => {
    const r = runWrapper({}, );
    assert.equal(r.code, 2, r.out);
});

test('MAX_PASSES is a spin guard the budget can never exceed', () => {
    const r = runWrapper(
        { BUDGET_MIN: '140', MIN_PASS_MIN: '1', MAX_PASSES: '2' }, withStub());
    assert.match(r.out, /multi-pass scrape: 2 pass\(es\)/, r.out);
    assert.match(r.out, /MAX_PASSES \(2\) reached/, r.out);
});
