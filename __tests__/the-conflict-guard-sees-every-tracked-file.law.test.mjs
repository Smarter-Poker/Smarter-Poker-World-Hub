/**
 * THE CONFLICT GUARD SEES EVERY TRACKED FILE.
 *
 * no-conflict-markers.yml scanned nine extensions: sql, js, jsx, ts, tsx, md,
 * yml, yaml, json. MEASURED 2026-09-15, scanning every tracked file instead:
 *
 *   .git-commit-msg.tmp:1:<<<<<<< Updated upstream
 *
 * Exactly one offender in the whole repository, and the guard was GREEN the
 * entire time, because `.tmp` is not one of the nine. The single committed
 * file that actually carried conflict markers was the one file the
 * conflict-marker guard could not see.
 *
 * That is the shape of every extension allowlist: it protects what somebody
 * remembered to list, and a guard is needed precisely for what nobody
 * remembered. `git ls-files` is the repo's own definition of what is tracked,
 * so node_modules, .next and dist fall out by construction rather than by a
 * directory list kept in step by hand.
 *
 * FOUR MORE LEFTOVERS CAME OUT WITH IT. `.commitmsg.tmp`, `package.json.tmp`
 * (78 bytes against the real 27KB), and - worse - `receive.js.tmp5` and
 * `trigger.js.tmp5` sitting inside pages/api/venue-scraper/, stale copies of
 * live API handlers diverging by 79 and 106 lines. They are not routed, since
 * next.config.js does not customise pageExtensions, so they were never a
 * runtime risk. They were a reading risk: an agent grepping this estate for
 * MANUS_API_KEY got four hits instead of two, and editing the wrong one costs
 * a whole debugging session. I nearly did exactly that.
 *
 * .gitignore already carried *.bak and *.orig. The intent was there; the .tmp
 * family simply was not listed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const wf = readFileSync(join(ROOT, '.github/workflows/no-conflict-markers.yml'), 'utf8');
const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');

const tracked = () => execFileSync('git', ['ls-files'], { encoding: 'utf8', cwd: ROOT })
    .split('\n').filter(Boolean);

test('the guard scans tracked files, not a list of extensions', () => {
    assert.match(wf, /git ls-files -z\s*\|\s*xargs -0 grep -InE/,
        'an extension allowlist protects only what someone remembered to list');
    assert.ok(!/--include='\*\./.test(wf),
        'no --include allowlist may come back; that is what hid the one real offender');
});

test('and still looks for all three marker kinds', () => {
    for (const marker of ['<<<<<<< ', '>>>>>>> ', '======= ']) {
        assert.ok(wf.includes(marker), `the guard must still match ${marker.trim()}`);
    }
});

test('no tracked file carries conflict markers', () => {
    // Runs the guard's OWN pipeline rather than a JavaScript lookalike, so this
    // cannot pass while CI fails on a difference between the two. Reading all
    // 4,000+ tracked files through Node did work and took 5.6s; grep does the
    // same job in a fraction of that, and it is the command actually shipped.
    let out = '';
    try {
        out = execFileSync('bash', ['-c',
            "git ls-files -z | xargs -0 grep -InE '^<<<<<<< |^>>>>>>> |^======= '"],
        { encoding: 'utf8', cwd: ROOT });
    } catch (err) {
        // grep exits 1 when it finds nothing, which is the healthy case.
        out = err.stdout || '';
    }
    assert.equal(out.trim(), '',
        `conflict markers are committed in tracked files:\n${out.trim()}`);
});

test('no editor or merge leftover is tracked', () => {
    const LEFTOVER = /\.(tmp[0-9]*|bak|orig|rej|swp)$|~$/;
    const hits = tracked().filter((f) => LEFTOVER.test(f));
    assert.deepEqual(hits, [],
        `these are scratch files, and two of the originals were stale copies of `
        + `live API handlers: ${hits.join(', ')}`);
});

test('and .gitignore keeps the whole family out', () => {
    for (const rule of ['*.bak', '*.orig', '*.tmp', '*.rej']) {
        assert.ok(gitignore.split('\n').includes(rule),
            `.gitignore must carry ${rule}`);
    }
    assert.match(gitignore, /^\*\.tmp\[0-9\]$/m,
        'the numbered variants are what pages/api/venue-scraper/*.js.tmp5 were');
});

test('nothing in pages/api is a copy of something else in pages/api', () => {
    // The specific trap: a stale duplicate of a live route, one grep away from
    // being edited instead of the real thing.
    const api = tracked().filter((f) => f.startsWith('pages/api/'));
    const byStem = new Map();
    for (const f of api) {
        const stem = f.replace(/\.(js|jsx|ts|tsx)(\..+)?$/, '');
        byStem.set(stem, [...(byStem.get(stem) || []), f]);
    }
    const dupes = [...byStem.entries()].filter(([, files]) => files.length > 1);
    assert.deepEqual(dupes.map(([stem]) => stem), [],
        `two files share one route stem: ${JSON.stringify(dupes)}`);
});
