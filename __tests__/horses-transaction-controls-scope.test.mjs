import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { engineControlScope } from '../src/components/horses/engineControlScope.js';
for (const name of ['EmergencyStopControls', 'TournamentCancellationControls']) {
  const source = readFileSync(new URL(`../src/components/horses/${name}.jsx`, import.meta.url), 'utf8');
  const body = source.match(/const scopedFetch = async \(url, options = \{\}\) => \{([\s\S]*?)\n  \};/)[1];
  const factory = new Function('accountScope', 'alive', 'authFetch', `return async (url, options = {}) => {${body}}`);
  test(`${name}: stale account refuses dispatch and ignores pending result`, async () => {
    let current = true, calls = 0, resolve;
    const authFetch = Object.assign(async () => { calls++; return new Promise(r => { resolve = r; }); }, { captureScope: () => ({ operatorId: 'actor-a', isCurrent: () => current }) });
    const scope = engineControlScope(authFetch, name), alive = { current: true };
    const fetch = factory(scope, alive, authFetch);
    const pending = fetch('/receipt'); current = false; resolve({ actorId: 'actor-a' });
    await assert.rejects(pending); await assert.rejects(fetch('/mutation', { method: 'POST' })); assert.equal(calls, 1);
    assert.match(source, /retainedScope.current.generation/);
    assert.match(source, /alive.current && accountScope.isCurrent\(\) && active === epoch.current/);
  });
  test(`${name}: mismatched actor and unmount cannot confirm receipt`, async () => {
    const authFetch = Object.assign(async () => ({ actorId: 'actor-b' }), { captureScope: () => ({ operatorId: 'actor-a', isCurrent: () => true }) });
    const alive = { current: true }, fetch = factory(engineControlScope(authFetch, name), alive, authFetch);
    await assert.rejects(fetch('/receipt'), /actor_unknown/); alive.current = false;
    await assert.rejects(fetch('/mutation'), /view_changed/);
  });
}
for (const name of ['EmergencyStopControls', 'TournamentCancellationControls', 'EngineControlPanel']) {
  test(`${name}: same account relogin refreshes lifecycle while retaining operation namespace`, () => {
    const source = readFileSync(new URL(`../src/components/horses/${name}.jsx`, import.meta.url), 'utf8');
    const branch = source.match(/(?:else )?if \(!retainedScope.current.scope\?\.isCurrent\(\)[\s\S]*?\n  \}/)[0].replace(/^else /, '');
    const advance = new Function('retainedScope', 'scope', branch);
    let session = 1;
    const fetch = Object.assign(() => {}, { captureScope: () => {
      const captured = session;
      return { operatorId: 'same-operator', isCurrent: () => captured === session };
    } });
    const ref = { current: { scope: null, generation: 0 } };
    advance(ref, engineControlScope(fetch, name));
    const original = ref.current.scope, generation = ref.current.generation;
    advance(ref, engineControlScope(fetch, name));
    assert.equal(ref.current.scope, original); assert.equal(ref.current.generation, generation);
    session++;
    advance(ref, engineControlScope(fetch, name));
    assert.notEqual(ref.current.scope, original); assert.equal(ref.current.generation, generation + 1);
    assert.equal(ref.current.scope.storageKey, original.storageKey);
    assert.equal(original.isCurrent(), false); assert.equal(ref.current.scope.isCurrent(), true);
  });
}

test('emergency stop command cards remain visible on desktop', () => {
  const source = readFileSync(new URL('../src/components/horses/EmergencyStopControls.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/horses/shared.module.css', import.meta.url), 'utf8');
  assert.match(source, /className=\{styles.opsCardsAlways\}/);
  assert.match(css, /\.opsCardsAlways\s*\{\s*display:\s*grid/);
});
