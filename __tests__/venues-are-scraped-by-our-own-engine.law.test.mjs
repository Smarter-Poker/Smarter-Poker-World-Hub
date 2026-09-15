/**
 * VENUES ARE SCRAPED BY OUR OWN ENGINE, AND A RUN THAT STORED NOTHING FAILS.
 *
 * The venue job used to curl /api/venue-scraper/trigger, which asked Manus AI
 * to dispatch a browser agent per venue. Every scheduled run since at least
 * 2026-08-17 failed — ten out of ten — with the same answer:
 *
 *   HTTP 500
 *   {"error":"MANUS_API_KEY is malformed: expected a three-segment JWT.
 *     Set it in the smarter.poker Vercel project (Production) and redeploy."}
 *
 * The key is deleted and nothing in this repo can restore it. HendonMob had
 * the identical dependency and shed it in #1772 by running the deterministic
 * scraper this estate already owned. scripts/venue_scraper_scrapling.py was
 * likewise already here, posting to the very endpoint Manus was being paid to
 * post to. Same destination, same secret, no third party.
 *
 * WHAT THIS LAW HOLDS, in the order it would quietly break:
 *
 *   1. THE POKERATLAS KEY. The catalog spells it `pokeratlas_url`; the script
 *      read `poker_atlas_url`. MEASURED over public/data/all-venues.json
 *      (658 venues, 2026-09-15): poker_atlas_url populated in 0, pokeratlas_url
 *      in 467. So TIER 2 HAD ALWAYS BEEN EMPTY — 36 websiteless venues that do
 *      have a PokerAtlas page were each logged "No source URL, skipping" while
 *      the workflow header advertised a fallback for exactly them. One
 *      underscore, invisible, for months.
 *   2. THE RUN CAN FAIL. --all could not: run_scraper returned its list,
 *      __main__ dropped it, the process fell off the end at exit 0. Every
 *      website unreachable, or every batch lost on the POST, both printed a
 *      cheerful summary and reported success.
 *   3. A SCRAPE THAT IS NOT STORED IS NOT A SCRAPE. post_results() has always
 *      returned the endpoint's body, and the caller has always thrown it away.
 *   4. THE TIERS AND THE WORK AGREE. The summary and the fetcher derive the
 *      tier from the same two helpers, so they cannot drift apart again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRAPER = join(ROOT, 'scripts/venue_scraper_scrapling.py');
const CATALOG = join(ROOT, 'public/data/all-venues.json');
const py = readFileSync(SCRAPER, 'utf8');
const workflow = readFileSync(join(ROOT, '.github/workflows/venue-scraper.yml'), 'utf8');
/** Workflow lines that are steps, not the commentary explaining them. */
const wf = workflow.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

/** Run exit_code_for() in the real script against one summary shape. */
function gate(summary, requireStore) {
    // The summary crosses as JSON and is parsed on the Python side. Splicing it
    // in as a literal looked simpler and was wrong: JSON's true/false are not
    // Python names, so every shape carrying a boolean raised NameError.
    const out = execFileSync('python3', ['-c',
        'import importlib.util, json, sys\n'
        + `spec = importlib.util.spec_from_file_location("vs", ${JSON.stringify(SCRAPER)})\n`
        + 'm = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n'
        + 'arg = json.loads(sys.argv[1])\n'
        + `print("EXIT", m.exit_code_for(arg, require_store=${requireStore ? 'True' : 'False'}))\n`,
        JSON.stringify(summary),
    ], { encoding: 'utf8', cwd: ROOT });
    const m = /EXIT (\d+)/.exec(out);
    assert.ok(m, `no verdict: ${out}`);
    return Number(m[1]);
}

const BASE = {
    venues: 401, scraped_ok: 380, source_fails: 21, batches: 20, post_fails: 0,
    tournaments_upserted: 1450, news_inserted: 90, had_secret: true, dry_run: false,
};
const S = (over) => ({ ...BASE, ...over });

test('the job runs our scraper, not a hosted dispatcher', () => {
    assert.match(wf, /python3 scripts\/venue_scraper_scrapling\.py --all/,
        'the deterministic scraper must be what runs');
    assert.ok(!/manus/i.test(wf), 'the Manus key is deleted; nothing may depend on it');
    assert.ok(!/api\/venue-scraper\/trigger/.test(wf),
        'that route exists only to hand the work to Manus');
});

test('and installs the engine it is about to run', () => {
    assert.match(wf, /pip install "scrapling\[all\]" camoufox/,
        'the scraper imports scrapling.fetchers; without this it dies at import');
    assert.match(wf, /scrapling install/);
    assert.match(wf, /camoufox fetch/);
});

test('and demands that what it scrapes is actually stored', () => {
    assert.match(wf, /--require-store/,
        'without it the script exits 0 even when every batch failed to store');
    assert.match(wf, /VENUE_SCRAPER_SECRET/,
        'the POST back needs it; absent, the run writes a JSON file nobody reads');
    assert.match(wf, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('the PokerAtlas fallback reads the key the catalog actually uses', () => {
    // The whole bug in one assertion, checked against the real file.
    assert.ok(existsSync(CATALOG), 'the venue catalog must exist');
    const venues = JSON.parse(readFileSync(CATALOG, 'utf8')).venues;
    assert.ok(venues.length > 100, `only ${venues.length} venues; the catalog moved`);

    const filled = (v, k) => typeof v[k] === 'string' && v[k].trim().length > 5;
    const populated = (k) => venues.filter((v) => filled(v, k)).length;

    // If this ever flips, the helper below should follow the data, not the name.
    assert.ok(populated('pokeratlas_url') > 0,
        'pokeratlas_url is the spelling the catalog populates');

    assert.match(py, /PA_URL_KEYS = \('pokeratlas_url', 'poker_atlas_url'\)/,
        'both spellings must be accepted: the DB column and the export disagree');
    assert.ok(!/venue\.get\('poker_atlas_url'/.test(py),
        'reading only poker_atlas_url is what emptied tier 2');
});

test('so websiteless venues with a PokerAtlas page are no longer skipped', () => {
    const out = execFileSync('python3', ['-c',
        'import importlib.util, json, pathlib\n'
        + `spec = importlib.util.spec_from_file_location("vs", ${JSON.stringify(SCRAPER)})\n`
        + 'm = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n'
        + `v = json.loads(pathlib.Path(${JSON.stringify(CATALOG)}).read_text())["venues"]\n`
        + 't2 = [x for x in v if not m.venue_website(x) and m.pokeratlas_url(x)]\n'
        + 'print("TIER2", len(t2))\n',
    ], { encoding: 'utf8', cwd: ROOT });
    const n = Number(/TIER2 (\d+)/.exec(out)?.[1]);
    assert.ok(n > 0,
        `tier 2 resolved ${n} venues — it was 0 for months and that was the defect`);
});

test('the tiers and the fetcher cannot disagree about what has a source', () => {
    // EACH tier line is checked on its own. A first version sliced the whole
    // block and asked whether the helpers appeared anywhere in it - which stayed
    // true when only tier2 was reverted to an inline rule, so the plant that was
    // meant to prove this assertion sailed past it. Decorative, exactly like the
    // one caught in the HendonMob law the day before.
    for (const tier of ['tier1', 'tier2', 'tier3']) {
        const m = new RegExp(`^\\s*${tier} = .*$`, 'm').exec(py);
        assert.ok(m, `${tier} must be assigned on one line`);
        const line = m[0];
        assert.ok(/venue_website\(v\)/.test(line),
            `${tier} must ask venue_website(), not re-implement it: ${line.trim()}`);
        assert.ok(!/\.get\('website'\)|\.get\('poker_?_?atlas_url'\)/.test(line),
            `${tier} reaches into the dict itself, which is how tier 2 emptied: ${line.trim()}`);
    }
    for (const tier of ['tier2', 'tier3']) {
        const line = new RegExp(`^\\s*${tier} = .*$`, 'm').exec(py)[0];
        assert.ok(/pokeratlas_url\(v\)/.test(line),
            `${tier} must ask pokeratlas_url(): ${line.trim()}`);
    }
});

test('a run that stored nothing fails', () => {
    assert.equal(gate(S({ tournaments_upserted: 0, news_inserted: 0 }), true), 1,
        'scraping without storing is not a successful run');
    assert.equal(gate(S({ scraped_ok: 0, source_fails: 401,
        tournaments_upserted: 0, news_inserted: 0 }), true), 1);
});

test('a batch scraped and then lost fails, because that is ours', () => {
    assert.equal(gate(S({ post_fails: 1 }), true), 1,
        'one lost batch is still rows we had and did not store');
    assert.equal(gate(S({ post_fails: 20, tournaments_upserted: 0, news_inserted: 0 }), true), 1);
});

test('a missing secret fails in CI but not on a laptop', () => {
    const noSecret = S({ had_secret: false, tournaments_upserted: 0, news_inserted: 0 });
    assert.equal(gate(noSecret, true), 1, 'CI must not accept a run that stored nothing');
    assert.equal(gate(noSecret, false), 0, 'the local JSON fallback stays usable');
});

test('a partly blocked run that still stored something passes', () => {
    // Venue websites go down; that is not this repo's defect to fail on.
    assert.equal(gate(S(), true), 0);
});

test('an empty catalog fails, and a dry run does not', () => {
    assert.equal(gate(S({ venues: 0 }), true), 1, 'we could not even try');
    assert.equal(gate(S({ dry_run: true }), true), 0);
    assert.equal(gate(null, true), 1, 'a summary we cannot read is a failure');
});

test('the gate is wired to the exit code', () => {
    assert.match(py, /code = exit_code_for\(summary, require_store=args\.require_store\)/,
        'a gate nothing calls is a comment');
    assert.match(py, /if code:\s*\n\s*sys\.exit\(code\)/);
});

test('a POST is only counted once the endpoint confirms it', () => {
    const fn = py.slice(py.indexOf('BATCH_POST_SIZE = 20'));
    assert.match(fn.slice(0, 1200), /if not isinstance\(body, dict\):\s*\n\s*post_fails \+= 1/,
        'a POST that threw must count as a loss');
    assert.match(fn.slice(0, 1200), /if body\.get\('success'\) is not True:\s*\n\s*post_fails \+= 1/,
        "'partial' means rows we handed over were dropped");
});
