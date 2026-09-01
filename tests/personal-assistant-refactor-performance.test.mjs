import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('long-running Personal Assistant APIs publish enforceable latency telemetry', () => {
  const timing = read('src/lib/personal-assistant/serverTiming.mjs');
  assert.match(timing, /Server-Timing/);
  assert.match(timing, /X-PA-Latency-State/);
  for (const route of ['pages/api/assistant/sandbox/analyze.js', 'pages/api/assistant/leaks/detect.js']) {
    assert.match(read(route), /attachPersonalAssistantTiming/);
  }
});

test('latency telemetry preserves the response and reports a budget state', async () => {
  const timing = await import(pathToFileURL(path.join(ROOT, 'src/lib/personal-assistant/serverTiming.mjs')).href);
  const headers = new Map();
  const res = {
    headersSent: false,
    setHeader: (name, value) => headers.set(name, value),
    json(body) { return body; },
  };
  timing.attachPersonalAssistantTiming(res, 'sandbox_analysis', 25_000);
  const body = { success: false, error: 'Authentication Required' };
  assert.equal(res.json(body), body);
  assert.match(headers.get('Server-Timing'), /^sandbox_analysis;dur=\d+\.\d$/);
  assert.equal(headers.get('X-PA-Latency-Budget'), '25000ms');
  assert.equal(headers.get('X-PA-Latency-State'), 'within-budget');
});

test('durable cursor security and review presentation are outside route monoliths', () => {
  const detect = read('pages/api/assistant/leaks/detect.js');
  const leaks = read('pages/hub/personal-assistant/leaks.js');
  assert.match(detect, /personal-assistant\/auditCursor\.mjs/);
  assert.doesNotMatch(detect, /function openAuditCursor/);
  assert.match(leaks, /reviewQueuePresentation\.mjs/);
  assert.doesNotMatch(leaks, /function readLocalReviewRecords/);
});

test('audit cursors remain owner-bound, expiry-bound and tamper-evident after extraction', async () => {
  const previous = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = 'phase-five-cursor-secret';
  try {
    const cursor = await import(`${pathToFileURL(path.join(ROOT, 'src/lib/personal-assistant/auditCursor.mjs')).href}?t=${Date.now()}`);
    const now = Date.now();
    const token = cursor.sealAuditCursor({ snapshotAt: new Date(now).toISOString(), cumulativeHandsFound: 12 }, 'owner', now);
    assert.equal(cursor.openAuditCursor(token, 'owner', now).cumulativeHandsFound, 12);
    assert.throws(() => cursor.openAuditCursor(token, 'other', now), /invalid_cursor/);
    assert.throws(() => cursor.openAuditCursor(`${token}x`, 'owner', now), /invalid_cursor/);
    assert.throws(() => cursor.openAuditCursor(token, 'owner', now + 8 * 24 * 60 * 60 * 1000), /invalid_cursor/);
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = previous;
  }
});

test('production build owns explicit Personal Assistant bundle and function budgets', () => {
  const script = read('scripts/check-pa-performance-budget.mjs');
  const pkg = JSON.parse(read('package.json'));
  assert.match(script, /\/hub\/personal-assistant\/sandbox/);
  assert.match(script, /pages\/api\/assistant\/leaks\/detect\.js/);
  assert.equal(pkg.scripts['verify:pa-performance'], 'node scripts/check-pa-performance-budget.mjs');
  assert.equal(pkg.scripts.postbuild, 'npm run verify:pa-performance');
});
