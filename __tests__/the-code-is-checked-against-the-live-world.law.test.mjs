/**
 * THE CODE IS CHECKED AGAINST THE LIVE DATABASE AND THE LIVE MODEL LIST
 *
 * Three defects shipped green on 2026-09-08, each a boundary no test crossed.
 * CHECK 25 (scripts/ci/check-live-contracts.mjs) crosses them on every pull
 * request. This pins that the check exists, runs in the gate with the
 * credentials it needs, reads CHECK values through the service-role-only
 * RPC, and never reports a skipped source as green.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('CHECK 25 runs in the Build Safety Gate with the service role', () => {
    const wf = read('.github/workflows/build-safety-gate.yml');
    const at = wf.indexOf('CHECK 25: The code is checked');
    assert.ok(at > 0, 'the step exists');
    const step = wf.slice(at, wf.indexOf('- name:', at + 10));
    assert.match(step, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
    assert.match(step, /node scripts\/ci\/check-live-contracts\.mjs/);
});

test('the check reads CHECK values through a service-role-only RPC that is applied', () => {
    const script = read('scripts/ci/check-live-contracts.mjs');
    assert.match(script, /rest\/v1\/rpc\/fn_ci_check_constraints/);
    const migration = read('supabase/migrations/20260908230551_fn_ci_check_constraints.sql');
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.fn_ci_check_constraints\(\) FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.fn_ci_check_constraints\(\) TO service_role/);
    assert.match(migration, /APPLIED:\s+2026-09-08/);
});

test('a source the check cannot reach is skipped, never green', () => {
    const script = read('scripts/ci/check-live-contracts.mjs');
    assert.match(script, /SKIPPED \(not green, not red\)/);
    assert.match(script, /process\.exit\(1\)/, 'a broken contract is red');
});

test('the retired Grok names live in the vendored map, not in routes', () => {
    const map = read('vendor/commander-shared/src/lib/grokModels.js');
    for (const dead of ['grok-beta', 'grok-2-latest', 'grok-2-vision-latest', 'grok-vision-beta']) {
        assert.match(map, new RegExp(`'${dead}': 'grok-`), `${dead} is translated`);
    }
    assert.match(map, /if \(typeof requested === 'string' && \/\^grok-\/\.test\(requested\)\) return requested;/, 'a real name passes through');
    const client = read('vendor/commander-shared/src/lib/grokClient.js');
    assert.match(client, /from '\.\/grokModels\.js'/, 'the client uses the shared map');
});
