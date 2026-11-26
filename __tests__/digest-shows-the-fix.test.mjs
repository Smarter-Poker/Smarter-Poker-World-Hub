// Which fix closed it (Dan, 2026-11-07): each critical alert type in the
// grouped digest item shows how many of its own records are verified fixed and
// the fix that closed them. A quiet alert is never counted as fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pushAttention, summarizeAlertFixes } from '../src/lib/dailyDigest/assemble.mjs';
import { alertFixLines, attentionHtml, buildText, cleanClip, formatFixList } from '../src/lib/dailyDigest/render.mjs';

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

test('multi-fix references render in full without mid-quote truncation (2026-11-25 VercelDeploymentFailed regression)', () => {
  const it = {
    rule: 'critical_alert_rising',
    severity: 'critical',
    status: 'fixed',
    title: '1 critical alert type is new this week or doubled: VercelDeploymentFailed (2, 0 the day before)',
    resolution: '2 of 2 linked original alert records are resolved or reviewed; historical daily counts are retained.',
    fixes: [{
      alertname: 'VercelDeploymentFailed',
      total: 2,
      verified: 2,
      fixes: [
        'Smarter-Poker-World-Hub#3011 (merged 2026-11-25T23:13Z, aca9e106)',
        'Smarter-Poker-World-Hub aca9e1063f "fix(wire): isolate emailImageProxy to getServerSideProps" (23:13Z)',
      ],
    }],
  };
  const [line] = alertFixLines(it);
  assert.ok(line.includes('"fix(wire): isolate emailImageProxy to getServerSideProps" (23:13Z)'), line);
  assert.equal((line.match(/"/g) || []).length % 2, 0, 'quotes must remain balanced');
  assert.equal((line.match(/\(/g) || []).length, (line.match(/\)/g) || []).length, 'parens must remain balanced');
});

test('overlong fix lists and resolutions clip on clean boundaries with balanced quotes and parens', () => {
  const many = [
    'Smarter-Poker-World-Hub#3011 (merged 2026-11-25T23:13Z, aca9e106)',
    'Smarter-Poker-World-Hub aca9e1063f "fix(wire): isolate emailImageProxy to getServerSideProps" (23:13Z)',
    'Smarter-Poker-World-Hub#3099 (merged 2026-11-26T01:00Z, deadbeef) "second very long commit message describing additional bundle isolation checks"',
  ];
  const formatted = formatFixList(many, 190);
  assert.ok(formatted.endsWith('; and 1 more'), formatted);
  assert.equal((formatted.match(/"/g) || []).length % 2, 0);

  const singleLong = 'Smarter-Poker-World-Hub aca9e1063f "fix(wire): isolate emailImageProxy to getServerSideProps in wire edition page for Webpack build" (23:13Z)';
  const clipped = cleanClip(singleLong, 80);
  assert.ok(clipped.length <= 83, clipped);
  assert.equal((clipped.match(/"/g) || []).length % 2, 0, clipped);
  assert.equal((clipped.match(/\(/g) || []).length, (clipped.match(/\)/g) || []).length, clipped);

  const text = buildText({
    day: '2026-11-25',
    day_label: 'Wednesday, Nov 25',
    metrics: {},
    attention: [{ rule: 'deploy_failed', severity: 'warning', status: 'fixed', title: '1 engine deploy attempt did not ship', resolution: `${singleLong} ${singleLong}` }],
    attention_status: { fixed: 1, in_progress: 0, not_picked_up: 0, tracked: 0 },
  });
  const resLine = text.split('\n').find((l) => l.includes('1 engine deploy attempt did not ship'));
  assert.ok(resLine && resLine.includes('...'), resLine);
  assert.equal((resLine.match(/"/g) || []).length % 2, 0, resLine);
});

test('pushAttention initializes and synchronizes attention_status even when absent', () => {
  const digest = { attention: [] };
  pushAttention(digest, { rule: 'tour_sources_stale', severity: 'warning', status: 'not_picked_up', title: 'stale' });
  pushAttention(digest, { rule: 'free_buy_funding_off', severity: 'critical', status: 'tracked', title: 'funding' });
  assert.equal(digest.attention.length, 2);
  assert.deepEqual(digest.attention_status, { fixed: 0, in_progress: 0, not_picked_up: 1, tracked: 1 });
});
