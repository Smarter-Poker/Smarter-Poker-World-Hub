import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = fs.readFileSync(path.join(ROOT, 'pages/api/training/coaching-summary.js'), 'utf8');
const DASHBOARD = fs.readFileSync(path.join(ROOT, 'pages/hub/training/session-dashboard.js'), 'utf8');

test('coaching accepts only a server session identity, never browser-authored result metrics', () => {
  assert.match(API, /const sessionId = String\(req\.body\?\.sessionId/);
  assert.doesNotMatch(API, /const \{[\s\S]{0,400}accuracy[\s\S]{0,400}\} = req\.body/);
  assert.match(API, /\.from\('training_sessions'\)[\s\S]*?\.eq\('id', sessionId\)[\s\S]*?\.eq\('user_id', user\.id\)/);
  assert.match(DASHBOARD, /\/api\/training\/coaching-summary[\s\S]{0,300}sessionId: session\.id/);
  assert.doesNotMatch(DASHBOARD, /\/api\/training\/coaching-summary[\s\S]{0,500}accuracy:/);
});

test('coaching is bound to a completed non-practice authority attempt', () => {
  assert.match(API, /\.from\('training_attempts'\)/);
  assert.match(API, /\.eq\('id', session\.attempt_id\)/);
  assert.match(API, /\.eq\('user_id', user\.id\)/);
  assert.match(API, /\.eq\('status', 'completed'\)/);
  assert.match(API, /\.eq\('practice_only', false\)/);
  assert.match(API, /generatedBy: 'sealed-training-attempt'/);
});

test('coaching fails closed without fabricated defaults or solver claims', () => {
  assert.match(API, /status\(503\)[\s\S]*No estimated result was generated/);
  assert.doesNotMatch(API, /generatedBy: 'deterministic-fallback'/);
  assert.doesNotMatch(API, /every decision solver-aligned/i);
  assert.doesNotMatch(API, /review the solver line/i);
  assert.doesNotMatch(API, /likely a range-construction leak/i);
  assert.doesNotMatch(API, /likely a focus or rest issue/i);
  assert.doesNotMatch(API, /focus stayed locked/i);
  assert.doesNotMatch(API, /concentrated reps will lift it fastest/i);
  assert.match(API, /Review the recorded decisions before assigning a cause/);
});
