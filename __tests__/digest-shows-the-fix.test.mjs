// Which fix closed it (Dan, 2026-11-07): each critical alert type in the
// grouped digest item shows how many of its own records are verified fixed and
// the fix that closed them. A quiet alert is never counted as fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAlertFixes } from '../src/lib/dailyDigest/assemble.mjs';
import { alertFixLines, attentionHtml } from '../src/lib/dailyDigest/render.mjs';

const groups = [
  { alertname: 'Tournament.atomic_finish_refused', expected_count: 2, event_ids: [1, 2] },
  { alertname: 'TableStoppedDealing', expected_count: 2, event_ids: [3, 4] },
];
const rows = [
  { id: 1, investigation_status: 'verified_fixed', fixing_pr: '#9570 d5e322b9' },
  { id: 2, investigation_status: 'verified_fixed', fixing_pr: '#9580 107f9cc0' },
  { id: 3, investigation_status: 'new', fixing_pr: null },
  { id: 4, investigation_status: 'informational', fixing_pr: '#1 claimed but not verified' },
];

test('only verified_fixed records count, with the fixes that closed them', () => {
  const fixes = summarizeAlertFixes(groups, rows);
  assert.deepEqual(fixes, [
    { alertname: 'Tournament.atomic_finish_refused', total: 2, verified: 2, fixes: ['#9570 d5e322b9', '#9580 107f9cc0'] },
    { alertname: 'TableStoppedDealing', total: 2, verified: 0, fixes: [] },
  ]);
});

test('the email shows one line per alert type and says when no fix is verified', () => {
  const it = { rule: 'critical_alert_rising', severity: 'critical', status: 'in_progress', title: 't', fixes: summarizeAlertFixes(groups, rows) };
  const lines = alertFixLines(it);
  assert.equal(lines[0], 'Tournament.atomic_finish_refused: 2 of 2 verified fixed (Fix: #9570 d5e322b9; #9580 107f9cc0)');
  assert.equal(lines[1], 'TableStoppedDealing: 0 of 2 verified fixed (no verified fix yet)');
  const html = attentionHtml({ attention: [it], attention_status: {} });
  assert.match(html, /0 of 2 verified fixed \(no verified fix yet\)/);
  assert.deepEqual(alertFixLines({ title: 'no groups' }), []);
});
