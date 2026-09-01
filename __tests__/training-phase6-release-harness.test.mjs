import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const authSetup = read('../e2e/00-auth.setup.ts');
const cronHealth = read('../e2e/014-cron-health.spec.ts');
const pokerNearMe = read('../e2e/09-poker-near-me-phase-11.spec.ts');
const productionSmoke = read('../scripts/training-production-smoke.mjs');
const wallet = read('../e2e/099-diamond-wallet-verification.spec.ts');

test('Phase 6 release harness keeps every repaired browser contract', () => {
  assert.match(authSetup, /sp_firstrun_notif_v2_/);
  assert.match(authSetup, /notificationPromptHandled/);

  assert.match(cronHealth, /process\.env\.NEXT_PUBLIC_BASE_URL/);
  assert.doesNotMatch(cronHealth, /const BASE = 'https:\/\/smarter\.poker'/);

  assert.match(pokerNearMe, /document\.activeElement\.blur/);
  assert.match(pokerNearMe, /page\.keyboard\.press\('Tab'\)/);
  assert.match(pokerNearMe, /toBeFocused\(\)/);

  assert.match(productionSmoke, /mobile arena lobby must remain footerless/);
  assert.match(productionSmoke, /assert\.equal\(geometry\.footerCount, 0/);

  assert.match(wallet, /getByRole\('button', \{ name: 'Diamond Wallet' \}\)\.click/);
  assert.match(wallet, /getByRole\('dialog', \{ name: 'Diamond Wallet' \}\)/);
  assert.doesNotMatch(wallet, /page\.goto\('\/hub\/wallet'/);
});
