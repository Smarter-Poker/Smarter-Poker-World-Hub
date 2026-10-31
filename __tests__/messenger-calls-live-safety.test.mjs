// MESSENGER CALLS LIVE PROBE SAFETY (2026-10-31).
//
// Dan: "Do not call real contacts without my explicit instruction." The live
// two-device probe (scripts/ci/messenger-calls-live.mjs) may only ever ring a
// throwaway account it created, and must remove every throwaway it creates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { probeEmail, assertProbeCallee, validateCallProbeConfiguration, PROBE_DOMAIN } from '../scripts/ci/messenger-calls-live.mjs';

const source = readFileSync(new URL('../scripts/ci/messenger-calls-live.mjs', import.meta.url), 'utf8');

test('throwaway identities use a domain that can never receive mail', () => {
    assert.equal(PROBE_DOMAIN, 'call-probe.example.com');
    assert.match(probeEmail('b'), /@call-probe\.example\.com$/);
    assert.throws(() => probeEmail('a'), /throwaway roles/);
});

test('every call the probe places targets this run\'s throwaway callee, checked right before the tap', () => {
    const probe = new Set(['00000000-0000-4000-8000-0000000000b0']);
    assert.throws(() => assertProbeCallee('00000000-0000-4000-8000-0000000000a0', probe));
    const clicks = [...source.matchAll(/\.getByLabel\('Start (Voice|Video) Call'[^)]*\)\.click\(\)|dockVoice\.click\(\)/g)];
    assert.ok(clicks.length >= 4, 'expected the call taps to be present');
    for (const click of clicks) {
        const before = source.slice(Math.max(0, click.index - 400), click.index);
        assert.match(before, /assertProbeCallee\(B\.id, probeIds\)/, `call tap at ${click.index} is not guarded`);
    }
    assert.doesNotMatch(source, /assertProbeCallee\(A[,)]/);
});

test('the designated test account only ever calls; it is never the callee', () => {
    assert.doesNotMatch(source, /calleeId:\s*A\b/);
    assert.doesNotMatch(source, /call-signal:\$\{A\}/);
});

test('throwaways are hard-deleted in finally and confirmed gone', () => {
    const finallyBlock = source.slice(source.indexOf('} finally {'));
    assert.match(finallyBlock, /admin\.auth\.admin\.deleteUser\(id\)/);
    assert.match(finallyBlock, /admin\.auth\.admin\.getUserById\(id\)/);
    assert.match(finallyBlock, /from\('social_conversations'\)\.delete\(\)/);
    assert.match(finallyBlock, /NOT DELETED/);
});

test('no credential fallback and evidence never holds tokens', () => {
    assert.throws(() => validateCallProbeConfiguration({}), /TEST_USER_EMAIL/);
    assert.doesNotMatch(source, /writeFile\([^)]*access_token/);
    assert.doesNotMatch(source, /console\.log\([^)]*session/);
});
