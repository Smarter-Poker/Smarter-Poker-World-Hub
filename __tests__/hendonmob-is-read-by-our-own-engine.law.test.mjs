/**
 * HENDONMOB IS READ BY OUR OWN ENGINE, AND A SYNC THAT SAVED NOTHING FAILS.
 *
 * The weekly sync used to curl /api/hendonmob/auto-sync, which asked Manus AI
 * to send a browser agent to read three numbers off a public profile page and
 * POST them back. It has failed every Monday since 2026-08-24 with
 *
 *     {"code":16,"message":"api key has been deleted or does not exist"}
 *
 * which nothing in this repo can fix. And it was never trustworthy when it did
 * work: the instruction not to invent the numbers was four paragraphs of prose
 * addressed to a language model. That is a request, not a guarantee.
 *
 * scripts/hendon_scraper_scrapling.py already did the job deterministically,
 * and had since before that workflow existed: Scrapling with the Cloudflare
 * bypass, then a regex over explicitly labeled spans, null when a label is
 * absent. The same stack poker-series-auto-pilot.yml already runs in CI.
 *
 * SO THE JOB RUNS OURS. What this law holds:
 *
 *   1. The workflow does not reach for Manus, or any other hosted reader, and
 *      runs the scraper directly.
 *   2. THE RUN CAN FAIL. --all could not: it printed "0 success, 12 failed"
 *      and returned, so the caller exited 0. A week where every profile was
 *      blocked was indistinguishable from a week where every profile synced,
 *      and the schedule had nothing to alarm on. exit_code_for() is the gate,
 *      and it is exercised here on every shape rather than described.
 *   3. A SCRAPE THAT IS NOT SAVED IS NOT A SUCCESS. The old counter incremented
 *      on the scrape and threw away update_supabase()'s return value, so a run
 *      that lost every write still reported success.
 *   4. NO FALLBACK THAT GUESSES. The extractor may only take values that sit
 *      next to their label. A "nearest dollar amount on the page" rescue would
 *      put invented career earnings on a player's profile, which is worse than
 *      an empty field and much harder to notice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRAPER = join(ROOT, 'scripts/hendon_scraper_scrapling.py');
const py = readFileSync(SCRAPER, 'utf8');
const workflow = readFileSync(
    join(ROOT, '.github/workflows/hendonmob-auto-sync.yml'), 'utf8');

/** Workflow lines that are steps, not the commentary explaining them. */
const workflowCode = workflow.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

/** Run exit_code_for() in the real script against one result shape. */
function gate(result) {
    const arg = result === null ? 'None' : JSON.stringify(result);
    const out = execFileSync('python3', ['-c',
        'import importlib.util,sys\n'
        + `spec=importlib.util.spec_from_file_location("h", ${JSON.stringify(SCRAPER)})\n`
        + 'm=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n'
        + `print("EXIT:", m.exit_code_for(${arg}))\n`,
    ], { encoding: 'utf8' });
    const m = /EXIT: (\d+)/.exec(out);
    assert.ok(m, `exit_code_for produced no verdict: ${out}`);
    return Number(m[1]);
}

test('the weekly sync runs our scraper, not a hosted reader', () => {
    assert.match(workflowCode, /python3 scripts\/hendon_scraper_scrapling\.py --all/,
        'the job must run the deterministic scraper');
    assert.ok(!/manus/i.test(workflowCode),
        'no step may depend on Manus AI: its key is deleted and a prompt is not a parser');
    assert.ok(!/api\/hendonmob\/auto-sync/.test(workflowCode),
        'that route exists only to hand the job to Manus');
});

test('and installs the engine it is about to run', () => {
    assert.match(workflowCode, /pip install "scrapling\[all\]" camoufox/,
        'the scraper imports scrapling.fetchers; without this the step dies at import');
    assert.match(workflowCode, /scrapling install/);
    assert.match(workflowCode, /camoufox fetch/);
});

test('and passes the credentials the scraper reads', () => {
    assert.match(workflowCode, /SUPABASE_SERVICE_ROLE_KEY:/,
        '--all refuses to run without it, so an absent secret is a silent no-op');
    assert.match(py, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('a blank env var falls back instead of pointing at nothing', () => {
    // os.getenv's default only applies when the variable is ABSENT. A secret
    // that does not exist renders as "", which would win over the default.
    const out = execFileSync('python3', ['-c',
        'import importlib.util,os\n'
        + 'os.environ["NEXT_PUBLIC_SUPABASE_URL"]=""\n'
        + `spec=importlib.util.spec_from_file_location("h", ${JSON.stringify(SCRAPER)})\n`
        + 'm=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n'
        + 'print("URL:", m.SUPABASE_URL)\n',
    ], { encoding: 'utf8' });
    assert.match(out, /URL: https:\/\/\S+\.supabase\.co/,
        `a blank secret must not become the base URL: ${out}`);
});

test('a run that saved nothing fails', () => {
    assert.equal(gate({ users: 5, saved: 0, source_fails: 5, write_fails: 0 }), 1,
        'every profile blocked is a failed sync, not a quiet one');
});

test('a run that scraped and then lost the write fails, because that is ours', () => {
    assert.equal(gate({ users: 5, saved: 4, source_fails: 0, write_fails: 1 }), 1);
    assert.equal(gate({ users: 5, saved: 0, source_fails: 0, write_fails: 5 }), 1);
});

test('a partly blocked run that still saved something passes', () => {
    // HendonMob blocking some profiles is not this repo's defect to fail on,
    // and an alarm that is always on is an alarm that gets muted.
    assert.equal(gate({ users: 5, saved: 3, source_fails: 2, write_fails: 0 }), 0);
    assert.equal(gate({ users: 5, saved: 5, source_fails: 0, write_fails: 0 }), 0);
});

test('no linked users is not a failure, and no credentials is', () => {
    assert.equal(gate({ users: 0, saved: 0, source_fails: 0, write_fails: 0 }), 0);
    assert.equal(gate(null), 1, 'we could not even try; that is worth knowing');
});

test('the gate is actually wired to the exit code', () => {
    assert.match(py, /code = exit_code_for\(await scrape_all_users\(\)\)/,
        'a gate nothing calls is a comment');
    assert.match(py, /if code:\s*\n\s*sys\.exit\(code\)/,
        'the verdict must reach the process exit code');
});

test('a scrape only counts once the write is confirmed', () => {
    const fn = py.slice(py.indexOf('async def scrape_all_users'));
    assert.match(fn, /if update_supabase\(user_id, stats\):\s*\n\s*saved_count \+= 1/,
        'counting the scrape rather than the save is how "0 saved" reported success');
});

test('nothing is extracted without its own label', () => {
    const fn = py.slice(py.indexOf('def extract_stats'), py.indexOf('async def scrape_hendonmob'));
    assert.ok(fn.length > 400, 'extract_stats must exist');
    for (const label of ['total live earnings', 'best live cash']) {
        assert.ok(fn.includes(label), `${label} must be matched by its label`);
    }
    // THE RESCUE THAT MUST NEVER EXIST: a regex run over the WHOLE page to
    // find a number when the label is missing. A page-wide dollar scan would
    // put an invented career total on a player's profile, which is worse than
    // an empty field and far harder to notice.
    //
    // A first version of this assertion pattern-matched the shape of a dollar
    // regex and did not fire when the fallback was actually planted, so it is
    // structural now: every scan of `body` is enumerated and must be one of
    // the two that read a label. Matching against `value` - the text beside a
    // label that was found - stays allowed, which is the whole distinction.
    const pageScans = [...fn.matchAll(/re\.\w+\([\s\S]{0,200}?,\s*body\b/g)].map((m) => m[0]);
    assert.equal(pageScans.length, 2,
        `only the label scan and the cashes line may read the whole page; found `
        + `${pageScans.length}:\n${pageScans.join('\n---\n')}`);
    assert.ok(pageScans.some((c) => c.includes('label')), 'the labeled-span scan must be one');
    assert.ok(pageScans.some((c) => c.includes('cashes')), 'the cashes line must be the other');
    assert.match(fn, /'totalCashes': None,/, 'absent stays null');
});
