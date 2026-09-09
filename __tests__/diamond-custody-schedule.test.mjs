import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../scripts/openclaw-cron-dispatcher.py', import.meta.url), 'utf8');
test('Diamond custody recovery runs each minute through workers', () => {
  assert.match(source, /\('\/api\/cron\/diamond-custody-recovery',\s*dict\(minute='\*'\)\)/);
  assert.match(source, /'\/api\/cron\/diamond-custody-recovery':\s*'\/cron\/diamond-custody-recovery'/);
});
test('unresolved Diamond recovery reaches the critical failure alert path', () => {
  assert.match(source, /CRITICAL_JOBS\s*=\s*\{[\s\S]*?'\/api\/cron\/diamond-custody-recovery':\s*3/);
});
