import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('training game art stays dimensional without a moving scan beam', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'pages/hub/training.js'), 'utf8');

  assert.match(hub, /className="sp-card-hud"/);
  assert.doesNotMatch(hub, /sp-card-scanline|sp-card-scan/);
});
