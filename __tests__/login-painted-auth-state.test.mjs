import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../pages/auth/login.js', import.meta.url), 'utf8');

test('signed-out visitors never see the painted signed-in controls as live UI', () => {
  assert.match(source, /!existingUser\s*&&\s*\(/);
  assert.match(source, /data-testid="signed-out-account-card"/);
  assert.match(source, /aria-label="Secure Sign In"/);
  assert.match(source, /Enter Your Account Details Below/);
});

test('a confirmed session still owns the real Continue and Switch Account controls', () => {
  assert.match(source, /existingUser\s*&&\s*\(/);
  assert.match(source, /title="Continue To Hub"/);
  assert.match(source, /title="Switch Account"/);
  assert.match(source, /navigateWithFreshAuth\(getRedirectUrl\(\), router\)/);
});
