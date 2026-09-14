/**
 * A SERIES WITH NO ROW IS NOT A WRITE WE LOST.
 *
 * patch_failed is an OURS-class counter. The scraper fails on it
 * unconditionally - "a lost row, a failed upsert or a failed patch is a defect
 * in this repo" - and since the multi-pass wrapper stopped forgiving that
 * class, it fails the whole job. So it has to mean exactly what it says: data
 * this repo had and did not store.
 *
 * It did not. MEASURED, run 34849047697 (2026-09-14):
 *
 *   [PATCH ERR] poker_series pa_2026-fall-poker-classic-canterbury-pa matched no exact row
 *   [PATCH ERR] poker_series pa_big-poker-oktober-2026-bicycle-casino     matched no exact row
 *   [PATCH ERR] poker_series pa_2026-pgt-poker-masters-aria-las-vegas     matched no exact row
 *   [PATCH ERR] poker_series None                                        matched no exact row
 *   Errors: upsert_failed=0 rows_lost=0 patch_failed=4 series_errors=175
 *
 * None of the three named series has a row in poker_series - checked against
 * the live database. They were discovered today, and a row is only created
 * once a scrape succeeds. The scraper found no events, tried to mark them
 * "failed", patched nothing because there was nothing to patch, and counted
 * each one as a fault of ours. That was always wrong; the wrapper's new
 * strictness made it fail the job.
 *
 * THE FOURTH IS A DIFFERENT BUG. `str(series.get("id", "?"))` - dict.get's
 * default applies only when the KEY IS ABSENT, so an entry carrying
 * "id": null became the literal string "None" and was carried all the way to
 * the database as a series_uid. (The same shape as os.getenv's default, which
 * bit the HendonMob scraper on the same day.)
 *
 * So: an annotation on a row that may not exist says so and costs nothing,
 * a genuine missing parent after a real scrape still fails, and a catalog
 * entry with no id is reported and skipped instead of being invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRAPER = join(ROOT, 'scripts/poker_series_scraper.py');
const py = readFileSync(SCRAPER, 'utf8');

/** Run sb_patch_series against a stubbed PostgREST response. */
function patch(rows, { requireExisting = true } = {}) {
    const code = `
import importlib.util, json, os, sys
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test-key-not-real')
spec = importlib.util.spec_from_file_location("psr", ${JSON.stringify(SCRAPER)})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
class R:
    def __init__(self, p): self._b = json.dumps(p).encode(); self.status = 200
    def read(self): return self._b
    def __enter__(self): return self
    def __exit__(self, *a): return False
m.RUN_ERRORS["patch_failed"] = 0
m.urllib.request.urlopen = lambda req, timeout=None: R(${JSON.stringify(rows)})
m.log = lambda msg: None
ok = m.sb_patch_series("pa_example-series", {"scrape_status": "failed"}, require_existing=${requireExisting ? 'True' : 'False'})
print("RESULT", ok, m.RUN_ERRORS["patch_failed"])
`;
    const out = execFileSync('python3', ['-c', code], { encoding: 'utf8', cwd: ROOT });
    const m = /RESULT (True|False) (\d+)/.exec(out);
    assert.ok(m, `no verdict from sb_patch_series: ${out}`);
    return { ok: m[1] === 'True', patchFailed: Number(m[2]) };
}

test('marking a series that has no row yet costs nothing', () => {
    // The three real ones from run 34849047697.
    const r = patch([], { requireExisting: false });
    assert.equal(r.patchFailed, 0,
        'there was no row to update; that is not a write this repo lost');
    assert.equal(r.ok, true, 'and the caller must not treat it as a failure');
});

test('but a parent missing after a real scrape still fails', () => {
    // This is the case the counter exists for: events were written and the
    // parent they belong to could not be updated.
    const r = patch([]);
    assert.equal(r.patchFailed, 1, 'a genuinely absent parent is ours to answer for');
    assert.equal(r.ok, false);
});

test('a patch that comes back with somebody else’s row fails', () => {
    const r = patch([{ series_uid: 'pa_a-different-series' }]);
    assert.equal(r.patchFailed, 1);
    assert.equal(r.ok, false);
});

test('and one that matches more than one row fails', () => {
    const r = patch([{ series_uid: 'pa_example-series' }, { series_uid: 'pa_other' }]);
    assert.equal(r.patchFailed, 1, 'a uid must address exactly one row');
    assert.equal(r.ok, false);
});

test('an exact match succeeds and costs nothing', () => {
    const r = patch([{ series_uid: 'pa_example-series' }]);
    assert.equal(r.patchFailed, 0);
    assert.equal(r.ok, true);
});

test('the unresolved-status caller is the one that may find no row', () => {
    // If this ever goes back to the default, run 34849047697 repeats.
    assert.match(py, /"scrape_status": "failed",[\s\S]{0,200}?require_existing=False/,
        'marking a series unresolved must not require the row to exist');
});

test('a catalog entry with no id is skipped, not turned into the string "None"', () => {
    assert.ok(!/str\(series\.get\("id",\s*"\?"\)\)/.test(py),
        'dict.get returns a stored null; the default only covers an absent key');
    assert.match(py, /series_uid\s*=\s*str\(series\.get\("id"\) or ""\)\.strip\(\)/,
        'a null id must become empty, not "None"');
    const guard = py.slice(py.indexOf('series_uid  = str(series.get("id")'));
    assert.match(guard.slice(0, 400), /if not series_uid:[\s\S]{0,300}?continue/,
        'and an empty id must skip the series rather than address the database with it');
});

test('str(None) really is the string that reached the database', () => {
    // Pinning the language behaviour the bug depended on, so the comment above
    // cannot rot into folklore.
    const out = execFileSync('python3', ['-c',
        'print("VAL", str({"id": None}.get("id", "?")))'], { encoding: 'utf8' });
    assert.match(out, /VAL None/,
        'if this ever stops being true, the guard above can be reconsidered');
});
