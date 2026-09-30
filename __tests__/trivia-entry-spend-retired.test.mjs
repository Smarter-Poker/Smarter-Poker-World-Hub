/**
 * The spend route no longer accepts a Trivia entry charge.
 *
 * A Trivia entry fee is charged by the database inside the session start
 * (reference trivia_entry_<session>), in the same transaction that opens the
 * session. POST /api/diamonds/spend used to accept source `trivia_entry` as
 * well: a stray path that could take diamonds without opening a session. No
 * caller in the app sent it, so the route now refuses it by name.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
    ALLOWED_SPEND_SOURCES,
    RETIRED_SPEND_SOURCES,
    checkSpendSource,
} from '../src/lib/diamonds/spendSources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('a trivia_entry charge is refused by name, however it is spelled on the wire', () => {
    for (const raw of ['trivia_entry', ' trivia_entry', 'trivia_entry\n']) {
        const verdict = checkSpendSource(raw);
        assert.equal(verdict.ok, false);
        assert.equal(verdict.status, 400);
        assert.equal(verdict.error, 'Spend source retired');
        assert.equal(verdict.code, 'trivia_entry_charged_at_session_start');
    }
    assert.equal(ALLOWED_SPEND_SOURCES.includes('trivia_entry'), false);
    assert.ok(Object.isFrozen(ALLOWED_SPEND_SOURCES) && Object.isFrozen(RETIRED_SPEND_SOURCES));
});

test('every live spend source still passes, unchanged', () => {
    assert.deepEqual([...ALLOWED_SPEND_SOURCES].sort(),
        ['game_cost', 'memory_game', 'training_entry', 'trivia_lifeline', 'video_unlock']);
    for (const source of ALLOWED_SPEND_SOURCES) {
        assert.deepEqual(checkSpendSource(source), { ok: true, source });
        assert.deepEqual(checkSpendSource(`  ${source} `), { ok: true, source });
    }
});

test('anything else stays refused as an unrecognised source', () => {
    for (const raw of [undefined, null, 7, {}, [], '', 'TRIVIA_ENTRY', 'trivia_entry_fee',
        '__proto__', 'constructor', 'hasOwnProperty', 'toString']) {
        const verdict = checkSpendSource(raw);
        assert.equal(verdict.ok, false, `accepted ${String(raw)}`);
        assert.equal(verdict.status, 400);
        assert.equal(verdict.error, 'Unrecognised spend source');
    }
});

test('the spend route decides the source through the shared check before anything is charged', () => {
    const route = read('pages/api/diamonds/spend.js');
    assert.match(route, /import \{ checkSpendSource \} from '\.\.\/\.\.\/\.\.\/src\/lib\/diamonds\/spendSources\.mjs';/);
    assert.doesNotMatch(route, /ALLOWED_SOURCES/);
    assert.doesNotMatch(route, /'trivia_entry'/);
    const check = route.indexOf('checkSpendSource(body.source)');
    const refuse = route.indexOf('if (!sourceCheck.ok)');
    const rpc = route.indexOf('await supabase.rpc(spendRpc');
    assert.ok(check > 0 && refuse > check, 'the route refuses a failed source check');
    assert.ok(rpc > refuse, 'the source is refused before any database charge');
});

test('no app code sends a trivia_entry spend', () => {
    const allowed = new Set([
        'src/lib/diamonds/spendSources.mjs',   // the refusal itself
        'src/lib/trivia/rules/index.mjs',      // ledger metadata for the session-start charge
    ]);
    const found = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            const rel = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(rel);
            else if (/\.(m?js|jsx|tsx?)$/.test(entry.name)
                && /['"`]trivia_entry['"`]/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) {
                found.push(rel.split(path.sep).join('/'));
            }
        }
    };
    for (const dir of ['pages', 'src', 'components', 'lib']) {
        if (fs.existsSync(path.join(ROOT, dir))) walk(dir);
    }
    assert.deepEqual(found.filter(f => !allowed.has(f)), []);
});
