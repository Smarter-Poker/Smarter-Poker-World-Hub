/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A SCRAPER RUN IS JUDGED ON WHAT IT PRODUCED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two scrapers had this backwards in opposite directions, and BOTH were
 * invisible for months. See the note in src/lib/scraperRunOutcome.js for the
 * measurements. This pins the rule and pins that both callers apply it.
 *
 * Run: node --test __tests__/a-scraper-run-is-judged-on-what-it-produced.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isTotalDispatchFailure, scraperTriggerStatus } from '../src/lib/scraperRunOutcome.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('THE REGRESSION: forty dispatches, forty 401s, zero created is not a success', () => {
    // The exact production numbers from 2026-09-07.
    assert.equal(isTotalDispatchFailure(40, 0), true);
    assert.equal(scraperTriggerStatus(40, 0), 502);
});

test('partial failure is still a successful run', () => {
    // 39 of 40 dispatched IS a run that worked, with a problem in it. Paging on
    // it is how the poker-series gate made itself unsatisfiable.
    assert.equal(isTotalDispatchFailure(40, 39), false);
    assert.equal(isTotalDispatchFailure(40, 1), false);
    assert.equal(scraperTriggerStatus(40, 1), 200);
});

test('an empty queue is not an outage', () => {
    // A run with nothing to do succeeded at doing nothing.
    assert.equal(isTotalDispatchFailure(0, 0), false);
    assert.equal(scraperTriggerStatus(0, 0), 200);
});

test('it never throws on the shapes a JSON summary can really carry', () => {
    for (const [a, c] of [[null, null], [undefined, 0], ['40', '0'], [NaN, NaN], [-1, 0]]) {
        assert.doesNotThrow(() => isTotalDispatchFailure(a, c));
    }
    // Strings arrive from JSON summaries and must be judged, not ignored.
    assert.equal(isTotalDispatchFailure('40', '0'), true);
});

test('the venue trigger actually uses the rule and answers 502', () => {
    const src = readFileSync(join(ROOT, 'pages/api/venue-scraper/trigger.js'), 'utf8');
    assert.match(src, /isTotalDispatchFailure\(/, 'the trigger no longer consults the rule');
    assert.match(
        src,
        /res\.status\(dispatchedNothing \? 502 : 200\)/,
        'a run that dispatched nothing must not answer 200'
    );
    assert.match(
        src,
        /success: !dispatchedNothing/,
        'a run that dispatched nothing must not answer success: true'
    );
});

test('a malformed MANUS_API_KEY fails once, at the top, and never leaks the value', () => {
    const src = readFileSync(join(ROOT, 'pages/api/venue-scraper/trigger.js'), 'utf8');
    assert.match(src, /MANUS_API_KEY\.split\('\.'\)\.length !== 3/, 'no JWT shape check');
    // The guard must not print or return the secret. Agents never handle
    // credential VALUES (CLAUDE.md); a shape complaint is all this may say.
    const guard = src.slice(src.indexOf("MANUS_API_KEY.split('.')"), src.indexOf('Optional cursor params'));
    assert.ok(
        !/\$\{MANUS_API_KEY|MANUS_API_KEY\}/.test(guard),
        'the malformed-key guard interpolates the key itself into output'
    );
});

test('the poker series gate fails on our faults and reports the world’s', () => {
    const src = readFileSync(join(ROOT, 'scripts/poker_series_scraper.py'), 'utf8');
    const gate = src.slice(src.indexOf('FAIL ON OUR FAULTS'));
    assert.ok(gate.length > 0, 'the split exit gate is gone');

    // Our faults still fail, unconditionally.
    assert.match(gate, /ours = \(RUN_ERRORS\["upsert_failed"\]/);
    assert.match(gate, /RUN_ERRORS\["rows_lost"\]/);
    assert.match(gate, /RUN_ERRORS\["patch_failed"\]/);

    // Third-party errors alone must NOT be in the unconditional clause - that
    // is the exact condition that made this workflow unsatisfiable.
    const oursClause = gate.slice(gate.indexOf('ours = ('), gate.indexOf('attempted ='));
    assert.ok(
        !/series_errors/.test(oursClause),
        'series_errors is back in the unconditional failure clause; poker sites are ' +
            'never all reachable at once, so that can never go green'
    );

    // ...but a run that produced nothing still fails.
    assert.match(gate, /barren = attempted > 0 and resolved == 0/);
    assert.match(gate, /mostly_failed = attempted > 0 and src_errors > \(attempted \/ 2\)/);
});

test('the discovery pass writes a series to poker_series, not a fake venue', () => {
    // poker_venues is UNIQUE (name, city, state) and city/state are NOT NULL
    // with no default, so `on_conflict="name"` raised 42P10 on every run AND
    // could not have inserted even with a valid target. A series is not a venue.
    const src = readFileSync(join(ROOT, 'scripts/scrape_poker_series_discovery.py'), 'utf8');
    assert.match(src, /sb_upsert\("poker_series", records, on_conflict="series_uid"\)/);
    assert.ok(
        !/sb_upsert\("poker_venues", records, on_conflict="name"\)/.test(src),
        'the 42P10 upsert is back'
    );
    assert.match(src, /def series_uid_for\(/, 'the uid must be content-derived and reproducible');
});
