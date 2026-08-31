import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const smokeUrl = new URL('../scripts/training-production-smoke.mjs', import.meta.url);

test('production certification proves the saved test-account session is live', async () => {
  const source = await readFile(smokeUrl, 'utf8');

  assert.match(source, /verifyLiveAuthenticatedSession/);
  assert.match(source, /localStorage\.getItem\('smarter-poker-auth'\)/);
  assert.match(source, /\/api\/training\/get-sessions\?limit=1/);
  assert.match(source, /authVerification\.status,[\s\S]*?200/);
  assert.match(source, /authVerification\.success,[\s\S]*?true/);
  assert.match(source, /settled\.path === '\/hub\/training'/);
  assert.match(source, /assert\.equal\(settled\.cards, 107/);
  assert.match(source, /auth document replacement settled on/);
  assert.doesNotMatch(source, /authState:\s*'real test-account session'[\s\S]*?success:\s*true[\s\S]*?without/i);
});
