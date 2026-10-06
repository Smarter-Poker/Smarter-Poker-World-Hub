import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(`src/components/horses/${name}`, ROOT), 'utf8');

test('extracted legacy panels are real default-exported modules', async () => {
  for (const name of [
    'ScrapersPanel.jsx', 'PipelinePanel.jsx', 'AntiAbusePanel.jsx',
    'BugReportsPanel.jsx', 'GeevesPanel.jsx', 'ReviewsPanel.jsx',
    'PromoPanel.jsx', 'AuditPanel.jsx',
  ]) {
    const source = await read(name);
    assert.match(source, /export default function \w+Panel\(/, name);
    assert.doesNotMatch(source, /\/\/\s*(?:TODO|FIXME)|\/\*[\s\S]*?(?:TODO|FIXME)/i, name);
  }
});

test('paged extractions consume canonical rows and route paging metadata', async () => {
  const reviews = await read('ReviewsPanel.jsx');
  assert.match(reviews, /setRows\(body\.rows \|\| \[\]\)/);
  assert.match(reviews, /setTotal\(typeof body\.total === 'number'/);
  assert.match(reviews, /setHasMore\(typeof body\.hasMore === 'boolean'/);
  assert.doesNotMatch(reviews, /body\.reviews/);

  const bugs = await read('BugReportsPanel.jsx');
  assert.match(bugs, /rows: body\.rows \|\| \[\]/);
  assert.match(bugs, /total: typeof body\.total === 'number'/);
  assert.match(bugs, /hasMore: typeof body\.hasMore === 'boolean'/);
  assert.doesNotMatch(bugs, /body\.tickets/);

  const audit = await read('AuditPanel.jsx');
  assert.match(audit, /setRows\(body\.rows \|\| \[\]\)/);
  assert.match(audit, /setTotal\(body\.total \?\? null\)/);
  assert.match(audit, /setHasMore\(typeof body\.hasMore === 'boolean'/);
});

test('write panels preserve explicit permission gates', async () => {
  const cases = [
    ['BugReportsPanel.jsx', 'support.write'],
    ['GeevesPanel.jsx', 'moderation.write'],
    ['ReviewsPanel.jsx', 'moderation.write'],
    ['PromoPanel.jsx', 'promo.write'],
  ];
  for (const [name, permission] of cases) {
    const source = await read(name);
    assert.match(source, new RegExp(`hasPermission\\(permissions, '${permission.replace('.', '\\.')}\\'\\)`), `${name} must gate ${permission}`);
    assert.match(source, /disabled=\{!canWrite/);
  }
});

test('polling, event subscriptions and late responses are cleaned up', async () => {
  const scrapers = await read('ScrapersPanel.jsx');
  assert.match(scrapers, /window\.clearInterval\(interval\)/);
  assert.match(scrapers, /removeEventListener\('visibilitychange'/);
  assert.match(scrapers, /seq !== sequence\.current/);

  const geeves = await read('GeevesPanel.jsx');
  assert.match(geeves, /return \(\) => \{ missed\(\); kb\(\); \}/);
  assert.match(geeves, /seq !== markSequence\.current/);

  for (const name of ['PipelinePanel.jsx', 'AntiAbusePanel.jsx', 'ReviewsPanel.jsx', 'AuditPanel.jsx']) {
    const source = await read(name);
    assert.match(source, /sequence|Sequence/, `${name} must reject a stale response`);
  }
});

test('the pipeline is honest and promo retains the edit modal and copy action', async () => {
  const pipeline = await read('PipelinePanel.jsx');
  assert.match(pipeline, /NotBuiltYet/);
  assert.match(pipeline, /no server-side implementation/i);
  assert.doesNotMatch(pipeline, /trigger-pipeline/);

  const promo = await read('PromoPanel.jsx');
  assert.match(promo, /<Modal/);
  assert.match(promo, /navigator\.clipboard\.writeText/);
  assert.match(promo, /method: 'PATCH'/);
  assert.match(promo, /method: 'POST'/);
});

test('anti-abuse preserves disclosure when a source failed', async () => {
  const source = await read('AntiAbusePanel.jsx');
  assert.match(source, /This View Is Incomplete/);
  assert.match(source, /does not mean nothing was found/i);
  assert.match(source, /stats\.disposableScope/);
  assert.match(source, /Highest-Volume Signup IPs/);
  assert.match(source, /Active Abuse Alerts/);
  assert.match(source, /Diamond Source Breakdown/);
});
