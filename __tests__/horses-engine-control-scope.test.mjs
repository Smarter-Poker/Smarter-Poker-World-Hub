import test from 'node:test';
import assert from 'node:assert/strict';
import { engineControlScope } from '../src/components/horses/engineControlScope.js';
test('pending engine identities are separated by authenticated operator and domain', () => {
  const fetchFor = (operatorId) =>
    Object.assign(() => {}, { captureScope: () => ({ operatorId, isCurrent: () => true }) });
  const a = engineControlScope(fetchFor('operator-a'), 'floor');
  const b = engineControlScope(fetchFor('operator-b'), 'floor');
  assert.notEqual(a.storageKey, b.storageKey);
  assert.notEqual(
    a.storageKey,
    engineControlScope(fetchFor('operator-a'), 'maintenance').storageKey
  );
  assert.equal(a.options.expectedOperatorId, 'operator-a');
});
test('a captured result loses authority on account switch or view unmount', () => {
  let account = 'a';
  let mounted = true;
  const authFetch = Object.assign(() => {}, {
    captureScope: () => {
      const original = account;
      return { operatorId: original, isCurrent: () => account === original };
    },
  });
  const a = engineControlScope(authFetch, 'floor', () => mounted);
  account = 'b';
  assert.equal(a.options.isCurrent(), false);
  assert.throws(() => a.assertCurrent(), /Account Or View Changed/);
  const b = engineControlScope(authFetch, 'floor', () => mounted);
  mounted = false;
  assert.equal(b.isCurrent(), false);
  assert.throws(() => b.assertCurrent(), /Account Or View Changed/);
});
test('missing or unverified account scope cannot submit an engine command', () => {
  assert.throws(() => engineControlScope(() => {}, 'floor'), /Account Could Not Be Confirmed/);
  assert.throws(
    () =>
      engineControlScope(
        Object.assign(() => {}, {
          captureScope: () => ({ operatorId: 'a', isCurrent: () => false }),
        }),
        'floor'
      ),
    /Account Could Not Be Confirmed/
  );
});
