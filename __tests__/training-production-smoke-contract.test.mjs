import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const smoke = readFileSync(
  new URL('../scripts/training-production-smoke.mjs', import.meta.url),
  'utf8',
);

test('production smoke enforces the footerless mobile arena launch contract', () => {
  assert.match(smoke, /mobile arena lobby must remain footerless/);
  assert.match(smoke, /assert\.equal\(geometry\.footerCount, 0/);
  assert.match(smoke, /launchBottomGap < 8 \|\| launchBottomGap > 48/);
  assert.match(smoke, /startInsideViewport/);
  assert.match(smoke, /launchInsideViewport/);
  assert.match(smoke, /startInsideLaunch/);
  assert.doesNotMatch(smoke, /mobile launch\/footer geometry missing/);
  assert.doesNotMatch(smoke, /mobile Start button is covered by the footer/);
});
